import { Rng } from './rng.js';

// Just intonation major pentatonic, two and a half octaves.
const LADDER = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3, 10 / 3, 4, 9 / 2, 5];
const ROOTS = [73.42, 82.41, 87.31, 98.0];
const BOWL_RATIOS = [1, 2.76, 5.4, 8.93];
const BOWL_AMPS = [1, 0.42, 0.2, 0.08];
const BOWL_DECAY = [9, 5.5, 3.2, 1.8];

// Turn a score into a list of timed sound events. Deterministic per seed.
export function planAudio(score) {
  const rng = new Rng(score.seed + '-audio');
  const root = rng.pick(ROOTS);
  const bowls = [];
  const add = (t, freq, vel) => bowls.push({ t, freq, vel });
  const ladder = (i, base = 4) => root * base * LADDER[Math.max(0, Math.min(LADDER.length - 1, i))];

  // each finished ring rings a bowl, climbing outward
  score.bands.forEach((b, i) => {
    if (b.type === 'center') return;
    add(b.tEnd, ladder(Math.min(LADDER.length - 3, Math.round(i * 0.9))), 0.55 + rng.range(0, 0.15));
  });
  // sparse bowls while the drawing grows
  let t = 12;
  while (t < score.tBuildEnd) {
    add(t, ladder(rng.int(0, 9), rng.pick([2, 4, 4])), rng.range(0.16, 0.34));
    t += rng.range(14, 34);
  }
  // completion chord
  const tc = score.tBuildEnd + 2;
  add(tc, root * 4, 0.7);
  add(tc + 0.6, root * 6, 0.6);
  add(tc + 1.4, root * 8, 0.5);
  add(tc + 3.5, root * 2, 0.7);
  // stillness
  t = tc + 14;
  while (t < score.tSweepStart - 6) {
    add(t, ladder(rng.int(0, 7), 4), rng.range(0.15, 0.3));
    t += rng.range(12, 26);
  }
  // the sweep: slow descending bowls
  const n = 9;
  for (let i = 0; i < n; i++) {
    const tt = score.tSweepStart + ((score.tSweepEnd - score.tSweepStart) * i) / n;
    add(tt, ladder(Math.max(0, 9 - i), 4), 0.32 + 0.03 * (n - i) * 0.3);
  }
  add(score.tSweepEnd + 1, root * 2, 0.6);
  add(score.tSweepEnd + 6, root, 0.7);
  bowls.sort((a, b) => a.t - b.t);
  return { root, bowls };
}

function makeImpulse(ctx, seconds = 7, decay = 1.7) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  const rng = new Rng(4242);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const tt = i / rate;
      const k = 0.02 + 0.5 * Math.min(1, tt / 3); // darker over time
      lp += ((rng.next() * 2 - 1) - lp) * (1 - k);
      d[i] = lp * Math.exp(-tt / decay) * (tt < 0.02 ? tt / 0.02 : 1);
    }
  }
  return buf;
}

export class MandalaAudio {
  constructor(ctx = null) {
    this.ctx = ctx;
    this.muted = false;
    this.session = null;
  }

  async init() {
    if (!this.ctx) this.ctx = new AudioContext({ latencyHint: 'playback' });
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 2.0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 3;
    comp.attack.value = 0.05;
    comp.release.value = 0.4;
    this.bus = ctx.createGain();
    const dry = ctx.createGain();
    dry.gain.value = 0.55;
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx);
    this.bus.connect(dry).connect(comp);
    this.bus.connect(conv).connect(wet).connect(comp);
    comp.connect(this.master).connect(ctx.destination);

    // shared noise buffer
    const nb = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const d = nb.getChannelData(0);
    const r = new Rng(99);
    let b0 = 0;
    for (let i = 0; i < d.length; i++) {
      b0 = 0.97 * b0 + 0.03 * (r.next() * 2 - 1);
      d[i] = b0 * 6;
    }
    this.noiseBuf = nb;
    if (ctx.state === 'suspended' && !(ctx instanceof OfflineAudioContext)) await ctx.resume();
  }

  load(score) {
    this.score = score;
    this.plan = planAudio(score);
  }

  // level of the drone over the life of the piece
  droneLevel(tt) {
    const s = this.score;
    if (tt < 0) return 0;
    if (tt < 25) return (tt / 25) * 0.45;
    if (tt < s.tBuildEnd) return 0.45 + 0.55 * ((tt - 25) / (s.tBuildEnd - 25));
    if (tt < s.tSweepStart) return 1;
    if (tt < s.tSweepEnd) return 1 - 0.65 * ((tt - s.tSweepStart) / (s.tSweepEnd - s.tSweepStart));
    if (tt < s.tFadeEnd) return 0.35 * (1 - (tt - s.tSweepEnd) / (s.tFadeEnd - s.tSweepEnd));
    return 0;
  }

  // Begin (or restart) playback at score time t. For realtime use.
  start(t) {
    const ctx = this.ctx;
    this.started = true;
    this.stopSession();
    const out = ctx.createGain();
    out.connect(this.bus);
    this.session = out;
    this.sources = [];
    this.offset = ctx.currentTime - t;
    this.nextEvent = 0;
    this.buildDrone(out, t, this.score.duration);
    while (this.nextEvent < this.plan.bowls.length && this.plan.bowls[this.nextEvent].t < t) this.nextEvent++;
    clearInterval(this.timer);
    this.pump();
    this.timer = setInterval(() => this.pump(), 1000);
  }

  // Schedule everything, for offline rendering.
  scheduleAll() {
    const out = this.ctx.createGain();
    out.connect(this.bus);
    this.offset = 0;
    this.buildDrone(out, 0, this.score.duration);
    for (const b of this.plan.bowls) this.bowl(out, b.t, b.freq, b.vel);
  }

  stopSession() {
    if (!this.session) return;
    const s = this.session;
    const srcs = this.sources || [];
    const now = this.ctx.currentTime;
    s.gain.cancelScheduledValues(now);
    s.gain.setValueAtTime(s.gain.value, now);
    s.gain.linearRampToValueAtTime(0, now + 1.2);
    setTimeout(() => {
      s.disconnect();
      for (const n of srcs) try { n.stop(); } catch {}
    }, 1600);
    this.session = null;
  }

  pump() {
    const ctx = this.ctx;
    const horizon = ctx.currentTime + 20;
    const pl = this.plan.bowls;
    while (this.nextEvent < pl.length && this.offset + pl[this.nextEvent].t < horizon) {
      const b = pl[this.nextEvent++];
      this.bowl(this.session, b.t, b.freq, b.vel);
    }
  }

  setPaused(p) {
    if (!this.ctx.suspend) return;
    if (p) this.ctx.suspend();
    else this.ctx.resume();
  }

  // v in 0..1, shaped so the slider feels even
  setVolume(v) {
    this.volume = v;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(4.08 * v * v, now, 0.08);
  }

  bowl(out, t, freq, vel) {
    const ctx = this.ctx;
    const at = this.offset + t;
    if (at < ctx.currentTime - 0.05) return;
    const rng = new Rng(Math.floor(t * 1000) + Math.floor(freq));
    const atk = 0.015 + (1 - vel) * 0.05;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) {
      pan.pan.value = rng.range(-0.5, 0.5);
      pan.connect(out);
    }
    const dest = pan || out;
    for (let i = 0; i < BOWL_RATIOS.length; i++) {
      const f = freq * BOWL_RATIOS[i];
      if (f > 9000) continue;
      const tau = (BOWL_DECAY[i] * (0.7 + vel * 0.6)) / 3;
      const peak = 0.13 * vel * BOWL_AMPS[i];
      for (let j = 0; j < 2; j++) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f + (j ? (0.35 + rng.next() * 0.6) * Math.sqrt(BOWL_RATIOS[i]) : 0);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(peak * 0.5, at + atk);
        g.gain.setTargetAtTime(0, at + atk, tau);
        o.connect(g).connect(dest);
        o.start(at);
        o.stop(at + atk + tau * 7);
      }
    }
  }

  buildDrone(out, t, duration) {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const root = this.plan.root;
    const src = (n) => { (this.sources ||= []).push(n); return n; };
    const level = ctx.createGain();
    level.connect(out);
    level.gain.setValueAtTime(this.droneLevel(t) * 0.9, now);
    for (let tt = Math.ceil(t / 10) * 10; tt <= duration + 10; tt += 10) {
      level.gain.linearRampToValueAtTime(this.droneLevel(tt) * 0.9, this.offset + tt);
    }
    const rng = new Rng(this.score.seed + '-drone');
    const voices = [
      [1, 0.1, 'sine'], [1.5, 0.055, 'sine'], [2, 0.04, 'triangle'], [3, 0.022, 'sine'], [4, 0.014, 'sine'], [2.25, 0.012, 'sine'], [5, 0.008, 'sine'], [6, 0.006, 'sine'],
    ];
    for (const [ratio, amp, type] of voices) {
      for (const det of [-0.12, 0.13]) {
        const o = src(ctx.createOscillator());
        o.type = type;
        o.frequency.value = root * ratio + det * ratio;
        const g = ctx.createGain();
        g.gain.value = amp * 0.5;
        // slow swell of each voice
        const lfo = src(ctx.createOscillator());
        lfo.frequency.value = 1 / rng.range(22, 70);
        const depth = ctx.createGain();
        depth.gain.value = amp * 0.35;
        lfo.connect(depth).connect(g.gain);
        if (type === 'triangle') {
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 500;
          o.connect(lp).connect(g);
        } else o.connect(g);
        g.connect(level);
        o.start(ctx.currentTime);
        lfo.start(ctx.currentTime);
        o.stop(this.offset + duration + 15);
        lfo.stop(this.offset + duration + 15);
      }
    }
    // breath: slow filtered noise, and a brighter brushing during the sweep
    const breath = src(ctx.createBufferSource());
    breath.buffer = this.noiseBuf;
    breath.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 420;
    bp.Q.value = 1.2;
    const bl = src(ctx.createOscillator());
    bl.frequency.value = 0.035;
    const bd = ctx.createGain();
    bd.gain.value = 220;
    bl.connect(bd).connect(bp.frequency);
    const bg = ctx.createGain();
    bg.gain.value = 0.02;
    breath.connect(bp).connect(bg).connect(level);
    breath.start(ctx.currentTime);
    bl.start(ctx.currentTime);

    const s = this.score;
    const brush = src(ctx.createBufferSource());
    brush.buffer = this.noiseBuf;
    brush.loop = true;
    const bpf = ctx.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = 2400;
    bpf.Q.value = 0.6;
    const bgain = ctx.createGain();
    bgain.gain.value = 0;
    const pts = [[s.tSweepStart - 4, 0], [s.tSweepStart + 12, 0.05], [s.tSweepEnd - 5, 0.04], [s.tFadeEnd, 0]];
    for (const [tt, v] of pts) if (tt >= t) bgain.gain.linearRampToValueAtTime(v, this.offset + tt);
    brush.connect(bpf).connect(bgain).connect(out);
    brush.start(ctx.currentTime);
    const stopAt = this.offset + duration + 15;
    breath.stop(stopAt);
    bl.stop(stopAt);
    brush.stop(stopAt);
  }
}

// Render the whole piece offline, for the video. Returns an AudioBuffer.
export async function renderOffline(score, sampleRate = 44100) {
  const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * score.duration), sampleRate);
  const a = new MandalaAudio(ctx);
  await a.init();
  a.score = score;
  a.plan = planAudio(score);
  a.scheduleAll();
  return ctx.startRendering();
}
