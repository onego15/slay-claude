// Records real gameplay frames in virtual time (deterministic, independent of render speed).
// usage: node tools/record.cjs "<query>" outDir frames [fps=20] [w=960] [h=540] [warmupFrames=0]
// e.g. node tools/record.cjs "demo=boss&auto&seed=5" /tmp/rec 300 20
// Frames are PNGs; assemble with ffmpeg (see README).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
(async () => {
  const [query, outDir, frames, fps = '20', w = '960', h = '540', warm = '0'] = process.argv.slice(2);
  const base = process.env.BASE || 'http://127.0.0.1:4173/';
  fs.mkdirSync(outDir, { recursive: true });
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(`${base}?capture&${query}`, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__advance, null, { timeout: 60000 });
  const dt = 1000 / +fps;
  if (+warm) await p.evaluate(async ([n, dt]) => { for (let i = 0; i < n; i++) { window.__step(dt); await new Promise((r) => setTimeout(r, 0)); } }, [+warm, dt]);
  const t0 = Date.now();
  for (let i = 0; i < +frames; i++) {
    await p.evaluate(async (dt) => { window.__advance(dt); await new Promise((r) => setTimeout(r, 0)); }, dt);
    await p.screenshot({ path: `${outDir}/f${String(i).padStart(4, '0')}.png`, timeout: 180000 });
    if (i % 25 === 0) console.log('frame', i, ((Date.now() - t0) / (i + 1)).toFixed(0) + 'ms/frame');
  }
  await b.close();
})();
