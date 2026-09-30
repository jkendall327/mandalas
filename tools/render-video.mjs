// Render a mandala to a video file, frame by frame, with the same code the
// website runs. Frames come from headless Chromium (GPU accelerated) and are
// piped to ffmpeg. The sound is rendered offline from the same seed.
//
//   node tools/render-video.mjs --seed amber-river-2201 --style gilt --out out/gilt.mp4
//
// Options
//   --seed S          seed name (default: random)
//   --style S         neon | gilt | lacquer | ink | sand (default neon)
//   --form F          auto | palace | circle (default auto)
//   --minutes M       length of the piece (default 15)
//   --w --h --fps     3840 2160 30
//   --crf N           x264 quality, lower is better (default 16)
//   --png             lossless frames from the browser (slower, larger)
//   --from S --to S   render only this span of seconds, for test clips
//   --seg S           segment length in seconds; finished segments are kept so
//                     an interrupted render can be resumed (default 30)
//   --no-audio        skip the sound
//   --out FILE        output path (default out/<seed>-<style>.mp4)
//
// Re-running the same command resumes from the segments already on disk.

import { chromium } from 'playwright';
import { createServer } from 'vite';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    o[k] = v;
  }
  return o;
}
const a = parseArgs(process.argv.slice(2));
const seed = a.seed || `render-${Math.floor(Math.random() * 9000 + 1000)}`;
const style = a.style || 'neon';
const form = a.form || 'auto';
const minutes = parseFloat(a.minutes || '15');
const W = parseInt(a.w || '3840');
const H = parseInt(a.h || '2160');
const FPS = parseInt(a.fps || '30');
const CRF = a.crf || '16';
const PNG = !!a.png;
const SEG = parseFloat(a.seg || '30');
const duration = minutes * 60;
const out = path.resolve(a.out || `out/${seed}-${style}.mp4`);
const work = out.replace(/\.mp4$/, '') + '.work';
fs.mkdirSync(work, { recursive: true });
fs.mkdirSync(path.dirname(out), { recursive: true });

const totalFrames = Math.round(duration * FPS);
const fromF = a.from ? Math.round(parseFloat(a.from) * FPS) : 0;
const toF = a.to ? Math.min(totalFrames, Math.round(parseFloat(a.to) * FPS)) : totalFrames;

const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

// keep scratch files out of /tmp
process.env.TMPDIR = process.env.TMPDIR || path.join(root, 'scratch');
fs.mkdirSync(process.env.TMPDIR, { recursive: true });

const server = await createServer({ root, logLevel: 'error', clearScreen: false, server: { port: 0, host: '127.0.0.1' } });
await server.listen();
const base = server.resolvedUrls.local[0];

const cached = path.join(process.env.HOME || '', '.cache/ms-playwright/chromium-1208/chrome-linux64/chrome');
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || (fs.existsSync(cached) ? cached : undefined),
  args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--disable-background-timer-throttling'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => log('[page error]', e.message));
const q = new URLSearchParams({ render: '1', w: W, h: H, seed, d: minutes, style, form });
await page.goto(`${base}?${q}`);
await page.waitForFunction(() => window.__mandala?.ready, null, { timeout: 60000 });
const info = await page.evaluate(() => {
  const s = window.__mandala.score;
  return { N: s.N, form: s.form, style: s.style, tBuildEnd: s.tBuildEnd, strokes: s.strokes.length };
});
log(`seed ${seed}, ${info.style}, ${info.form}, N=${info.N}, ${info.strokes} strokes, ${W}x${H} at ${FPS}fps, ${minutes} min`);

// ---- thumbnail: the finished mandala
const thumb = out.replace(/\.mp4$/, '.png');
if (!fs.existsSync(thumb)) {
  const b64 = await page.evaluate(async (t) => {
    window.__mandala.renderFrame(t, 0);
    return window.__mandala.grab('image/png');
  }, info.tBuildEnd + 8);
  fs.writeFileSync(thumb, Buffer.from(b64, 'base64'));
  log('thumbnail', thumb);
}

// ---- audio
const wavPath = path.join(work, `audio-${seed}-${style}-${form}-${minutes}.wav`);
if (!a['no-audio'] && !fs.existsSync(wavPath)) {
  log('rendering audio');
  const SR = 48000;
  const meta = await page.evaluate((sr) => window.__mandala.prepareAudio(sr), SR);
  const total = await page.evaluate(() => window.__mandala.pcmLength());
  const fd = fs.openSync(wavPath + '.part', 'w');
  const dataBytes = total * 2;
  const hdr = Buffer.alloc(44);
  hdr.write('RIFF', 0);
  hdr.writeUInt32LE(36 + dataBytes, 4);
  hdr.write('WAVEfmt ', 8);
  hdr.writeUInt32LE(16, 16);
  hdr.writeUInt16LE(1, 20);
  hdr.writeUInt16LE(2, 22);
  hdr.writeUInt32LE(SR, 24);
  hdr.writeUInt32LE(SR * 4, 28);
  hdr.writeUInt16LE(4, 32);
  hdr.writeUInt16LE(16, 34);
  hdr.write('data', 36);
  hdr.writeUInt32LE(dataBytes, 40);
  fs.writeSync(fd, hdr);
  const CH = 3_000_000;
  for (let off = 0; off < total; off += CH) {
    const b64 = await page.evaluate(([o, c]) => window.__mandala.audioChunk(o, c), [off, CH]);
    fs.writeSync(fd, Buffer.from(b64, 'base64'));
  }
  fs.closeSync(fd);
  fs.renameSync(wavPath + '.part', wavPath);
  log(`audio done, ${(meta.samples / SR).toFixed(0)} s`);
}

// ---- video, in segments
const segFrames = Math.max(1, Math.round(SEG * FPS));
const firstSeg = Math.floor(fromF / segFrames);
const lastSeg = Math.floor((toF - 1) / segFrames);
const started = Date.now();
let done = 0;
const need = toF - fromF;

function segPath(i, f0, f1) {
  return path.join(work, `seg_${String(i).padStart(5, '0')}_${f0}_${f1}.mp4`);
}
const segFiles = [];

function startFfmpeg(file) {
  const vf = PNG
    ? 'scale=out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p'
    : 'scale=in_range=pc:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,format=yuv420p';
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', PNG ? 'png' : 'mjpeg', '-i', '-',
    '-vf', vf,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', String(CRF),
    '-x264-params', `aq-mode=3:keyint=${FPS * 2}:min-keyint=${FPS * 2}`,
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-r', String(FPS), '-f', 'mp4', file + '.part',
  ];
  const p = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const exited = new Promise((res, rej) => {
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exited with ' + c))));
  });
  return { p, exited };
}

const grabArgs = PNG ? ['image/png', 1] : ['image/jpeg', 0.95];
const frameB64 = (i) =>
  page.evaluate(
    async ([t, n, type, quality]) => {
      window.__mandala.renderFrame(t, n);
      return window.__mandala.grab(type, quality);
    },
    [i / FPS, i, ...grabArgs],
  );

for (let s = firstSeg; s <= lastSeg; s++) {
  const f0 = Math.max(s * segFrames, fromF);
  const f1 = Math.min((s + 1) * segFrames, toF);
  const file = segPath(s, f0, f1);
  segFiles.push(file);
  if (fs.existsSync(file)) {
    done += f1 - f0;
    log(`segment ${s} already done`);
    continue;
  }
  const ff = startFfmpeg(file);
  let pending = frameB64(f0);
  for (let i = f0; i < f1; i++) {
    const b64 = await pending;
    if (i + 1 < f1) pending = frameB64(i + 1);
    const buf = Buffer.from(b64, 'base64');
    if (!ff.p.stdin.write(buf)) await new Promise((r) => ff.p.stdin.once('drain', r));
    done++;
    if (done % 60 === 0) {
      const el = (Date.now() - started) / 1000;
      const rate = done / el;
      log(`frame ${i}/${toF}  ${rate.toFixed(1)} fps  eta ${(((need - done) / rate) / 60).toFixed(1)} min`);
    }
  }
  ff.p.stdin.end();
  await ff.exited;
  fs.renameSync(file + '.part', file);
}

await browser.close();
await server.close();

// ---- join segments and add the sound
const list = path.join(work, 'list.txt');
fs.writeFileSync(list, segFiles.map((f) => `file '${f}'`).join('\n'));
const mux = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
if (!a['no-audio']) {
  const startSec = fromF / FPS;
  mux.push('-ss', String(startSec), '-t', String((toF - fromF) / FPS), '-i', wavPath);
  mux.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-shortest');
} else mux.push('-c', 'copy');
mux.push('-movflags', '+faststart', out);
log('joining');
const r = spawnSync('ffmpeg', mux, { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);
log('done', out, `(${(fs.statSync(out).size / 1e6).toFixed(0)} MB)`);
if (!a.keep) log(`scratch segments kept in ${work} (delete when you are happy with the result)`);
