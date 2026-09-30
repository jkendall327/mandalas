import { Renderer } from './renderer.js';
import { generateScore } from './score.js';
import { randomSeed } from './rng.js';
import { MandalaAudio } from './audio.js';
import { STYLES, STYLE_ORDER } from './styles.js';

const store = {
  get: (k) => { try { return localStorage.getItem('mandala.' + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem('mandala.' + k, v); } catch {} },
};

const params = new URLSearchParams(location.search);
const renderMode = params.has('render');
const minutes = parseFloat(params.get('d') || '15');
const duration = minutes * 60;
let seed = params.get('seed') || randomSeed();
let style = params.get('style') || store.get('style') || 'neon';
if (!STYLES[style]) style = 'neon';
let form = params.get('form') || 'auto';

const canvas = document.getElementById('c');
let renderer;
try {
  renderer = new Renderer(canvas);
} catch (e) {
  console.error(e);
  document.getElementById('fallback').hidden = false;
  document.getElementById('begin').style.display = 'none';
  throw e;
}

function fit() {
  const dpr = renderMode ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const w = renderMode ? parseInt(params.get('w') || '3840') : Math.floor(window.innerWidth * dpr);
  const h = renderMode ? parseInt(params.get('h') || '2160') : Math.floor(window.innerHeight * dpr);
  renderer.resize(w, h);
}
window.addEventListener('resize', () => {
  fit();
  if (paused || !running) draw();
});
fit();

let score;
let audio = null;
let t = parseFloat(params.get('t') || '0');
let running = false;
let paused = false;
let last = 0;

function syncUrl() {
  const u = new URL(location.href);
  u.searchParams.set('seed', seed);
  u.searchParams.set('style', style);
  if (form !== 'auto') u.searchParams.set('form', form);
  else u.searchParams.delete('form');
  history.replaceState(null, '', u);
}

function setSeed(s) {
  seed = s;
  syncUrl();
  score = generateScore(seed, { duration, style, form });
  renderer.setScore(score);
  if (audio) audio.load(score);
  window.__score = score;
}

// a new look for the same mandala: crossfade, and leave the sound and clock alone
function changeStyle(name) {
  if (name === style) return;
  style = name;
  store.set('style', name);
  syncUrl();
  score = generateScore(seed, { duration, style, form });
  renderer.transitionTo(score);
  if (audio) audio.score = score;
  window.__score = score;
  markStyle();
}

// a different structure: the timing changes, so the sound restarts from here
function changeForm(f) {
  form = f;
  syncUrl();
  score = generateScore(seed, { duration, style, form });
  renderer.transitionTo(score);
  window.__score = score;
  if (audio) {
    audio.load(score);
    audio.start(t);
  }
}

function draw() {
  renderer.render(t);
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!running) {
    if (renderer.transitioning) draw();
    return;
  }
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!paused) t += dt;
  if (t > duration) {
    t = 0;
    setSeed(randomSeed());
    if (audio) audio.start(0);
  }
  draw();
}

setSeed(seed);

if (renderMode) {
  let pcm = null;
  window.__mandala = {
    ready: true,
    duration,
    score,
    renderFrame: (time, frameNo = 0) => {
      renderer.frameNo = frameNo;
      renderer.render(time);
      return true;
    },
    // JPEG or PNG bytes of the current frame, as base64
    grab: async (type = 'image/jpeg', quality = 0.95) => {
      const blob = await new Promise((r) => canvas.toBlob(r, type, quality));
      const buf = new Uint8Array(await blob.arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    prepareAudio: async (sampleRate = 48000) => {
      const { renderOffline } = await import('./audio.js');
      const buf = await renderOffline(score, sampleRate);
      const l = buf.getChannelData(0);
      const r = buf.getChannelData(1);
      pcm = new Int16Array(l.length * 2);
      for (let i = 0; i < l.length; i++) {
        pcm[i * 2] = Math.max(-1, Math.min(1, l[i])) * 32767;
        pcm[i * 2 + 1] = Math.max(-1, Math.min(1, r[i])) * 32767;
      }
      return { samples: l.length, sampleRate };
    },
    audioChunk: (offset, count) => {
      const bytes = new Uint8Array(pcm.buffer, offset * 2, Math.min(count, pcm.length - offset) * 2);
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    },
    pcmLength: () => pcm.length,
    setSeed,
  };
  draw();
} else {
  requestAnimationFrame(frame);
  draw();
}

// ---- UI -----------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const menu = $('menu');
const toast = $('toast');

function say(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(say.h);
  say.h = setTimeout(() => toast.classList.remove('show'), 1800);
}

function setPaused(p) {
  paused = p;
  $('iPause').style.display = p ? 'none' : '';
  $('iPlay').style.display = p ? '' : 'none';
  if (audio) audio.setPaused(p);
}

$('beginBtn').addEventListener('click', async () => {
  audio = new MandalaAudio();
  await audio.init();
  audio.load(score);
  audio.setVolume(volume);
  audio.start(t);
  running = true;
  last = performance.now();
  $('begin').classList.add('gone');
});

if (renderMode) $('begin').style.display = 'none';

$('bPause').addEventListener('click', () => setPaused(!paused));
const vol = $('volume');
let volume = parseFloat(store.get('volume') ?? '0.7');
if (!(volume >= 0 && volume <= 1)) volume = 0.7;
let preMute = volume || 0.7;
vol.value = String(Math.round(volume * 100));
function applyVolume() {
  $('bSound').classList.toggle('off', volume === 0);
  $('wave1').style.display = volume === 0 ? 'none' : '';
  store.set('volume', String(volume));
  if (audio) audio.setVolume(volume);
}
applyVolume();
vol.addEventListener('input', () => {
  volume = vol.value / 100;
  if (volume > 0) preMute = volume;
  applyVolume();
});
$('bSound').addEventListener('click', () => {
  if (matchMedia('(hover: none)').matches && !$('vol').classList.contains('open')) {
    $('vol').classList.add('open');
    return;
  }
  volume = volume === 0 ? preMute : 0;
  vol.value = String(Math.round(volume * 100));
  applyVolume();
});
const styleMenu = $('styleMenu');
function styleIcon(name) {
  const st = STYLES[name];
  const pal = st.palettes[0];
  const bg = st.ink ? st.paper : st.bg;
  const c1 = pal.main[0];
  const c2 = pal.main[1];
  let petals = '';
  for (let k = 0; k < 8; k++) petals += `<ellipse cx="16" cy="8.6" rx="1.9" ry="3.3" transform="rotate(${k * 45} 16 16)"/>`;
  const glow = st.ink || st.glow < 0.15 ? '' : `filter:drop-shadow(0 0 1.5px ${c1})`;
  return `<svg viewBox="0 0 32 32" style="${glow}"><g fill="none" stroke-width="1"><circle cx="16" cy="16" r="13" stroke="${c1}"/><g stroke="${c2}">${petals}</g><circle cx="16" cy="16" r="3" stroke="${c1}"/></g></svg>`;
}
for (const name of STYLE_ORDER) {
  const b = document.createElement('button');
  b.className = 'sw';
  b.dataset.style = name;
  b.title = STYLES[name].label;
  b.style.background = STYLES[name].ink ? STYLES[name].paper : STYLES[name].bg;
  b.innerHTML = styleIcon(name);
  b.addEventListener('click', () => {
    changeStyle(name);
    styleMenu.classList.remove('open');
  });
  styleMenu.appendChild(b);
}
function markStyle() {
  for (const b of styleMenu.children) b.classList.toggle('on', b.dataset.style === style);
}
markStyle();
$('bStyle').addEventListener('click', (e) => {
  e.stopPropagation();
  styleMenu.classList.toggle('open');
});
document.addEventListener('click', () => styleMenu.classList.remove('open'));
$('bForm').addEventListener('click', () => {
  const next = score.form === 'palace' ? 'circle' : 'palace';
  changeForm(next);
  say(next === 'palace' ? 'Palace' : 'Circle');
});
$('bNew').addEventListener('click', () => {
  t = 0;
  setSeed(randomSeed());
  if (audio) audio.start(0);
  if (paused) setPaused(false);
});
$('bLink').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(location.href);
    say('Link copied');
  } catch {
    say('Could not copy');
  }
});
$('bFull').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen?.();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (running) setPaused(!paused);
  } else if (e.key === 'f') $('bFull').click();
});

// the menu only appears when the pointer is near it
let idleTimer;
function nearMenu(x, y) {
  const r = menu.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return Math.abs(x - cx) < r.width / 2 + 90 && Math.abs(y - cy) < 90;
}
window.addEventListener('pointermove', (e) => {
  document.body.classList.remove('idle');
  menu.classList.toggle('show', nearMenu(e.clientX, e.clientY) || styleMenu.classList.contains('open'));
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => document.body.classList.add('idle'), 3000);
});
document.addEventListener('pointerleave', () => menu.classList.remove('show'));
