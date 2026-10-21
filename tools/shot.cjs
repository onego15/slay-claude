// usage: node tools/shot.cjs url out.png [frames=30] [w=1280] [h=720] [evalJs]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const [url, out, frames = '30', w = '1280', h = '720', js = ''] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[console]', m.type(), m.text().slice(0, 300)); });
  p.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__advance, null, { timeout: 60000 });
  const t0 = Date.now();
  for (let i = 0; i < +frames; i++) { await p.evaluate(() => { window.__advance(1000 / 30); const gl = window.__world && window.__world.renderer.getContext(); if (gl) { const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } }); }
  if (js) { await p.evaluate(js); for (let i = 0; i < 10; i++) await p.evaluate(() => window.__advance(1000 / 30)); }
  console.log('frames', frames, 'ms/frame', ((Date.now() - t0) / +frames).toFixed(0));
  await p.screenshot({ path: out, timeout: 180000 });
  await b.close();
})();
