// usage: node tools/shot.mjs seed w h t1,t2,... [minutes]
import { chromium } from 'playwright';
import fs from 'node:fs';
const [seed = 'still-lotus-1', w = '1600', h = '1600', ts = '900', minutes = '15', style = 'neon', form = 'auto'] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome', args: ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
p.on('console', (m) => console.log('[page]', m.text()));
p.on('pageerror', (e) => console.log('[pageerror]', e.message));
await p.goto(`http://localhost:5173/?render=1&w=${w}&h=${h}&seed=${seed}&d=${minutes}&style=${style}&form=${form}`);
await p.waitForFunction(() => window.__mandala?.ready, null, { timeout: 30000 });
const info = await p.evaluate(() => { const s = window.__score; return { N: s.N, pal: s.palette, strokes: s.strokes.length, bands: s.bands.map(b => `${b.type}@${b.r0.toFixed(2)}-${b.r1.toFixed(2)} ${b.tStart.toFixed(0)}-${b.tEnd.toFixed(0)}`) }; });
console.log(JSON.stringify(info, null, 1));
fs.mkdirSync('scratch/shots', { recursive: true });
for (const t of ts.split(',')) {
  const t0 = Date.now();
  const url = await p.evaluate((t) => { window.__mandala.renderFrame(t); return document.getElementById('c').toDataURL('image/png'); }, +t);
  const ms = await p.evaluate((t) => { const s = performance.now(); for (let i = 0; i < 5; i++) window.__mandala.renderFrame(t); return (performance.now() - s) / 5; }, +t);
  fs.writeFileSync(`scratch/shots/${seed}-${style}-${form}-${t}.png`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('t=', t, 'gpu ms/frame', ms.toFixed(1));
}
await b.close();
