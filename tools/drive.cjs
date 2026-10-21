// Scripted browser driver for capture mode.
// usage: node tools/drive.cjs script.json   (script: {url, w, h, steps:[...]})
// steps: ["adv", frames] | ["click", selector] | ["eval", js] | ["shot", path] | ["wait", selector, maxFrames]
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
(async () => {
  const sc = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: sc.w || 1280, height: sc.h || 720 } });
  p.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|ReadPixels/.test(m.text()))) console.log('[console]', m.type(), m.text().slice(0, 400)); });
  p.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack && e.stack.split('\n').slice(0, 4).join(' | ')));
  await p.goto(sc.url, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__advance, null, { timeout: 60000 });
  const adv = async (n) => { for (let i = 0; i < n; i++) await p.evaluate(() => { window.__advance(1000 / 30); const gl = window.__world.renderer.getContext(); const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }); };
  const fast = async (n) => { await p.evaluate(async (n) => { for (let i = 0; i < n; i++) { (window.__step || window.__advance)(1000 / 30); await new Promise((r) => setTimeout(r, 0)); } window.__advance(1000 / 30); }, n); };
  for (const st of sc.steps) {
    const [op, a, c] = st;
    const t0 = Date.now();
    try {
      if (op === 'adv') await adv(a);
      else if (op === 'fast') await fast(a);
      else if (op === 'click') { await p.click(a, { timeout: 5000, force: true }); }
      else if (op === 'mouse') { await p.mouse.click(a, c); }
      else if (op === 'key') { await p.keyboard.press(a); }
      else if (op === 'move') { await p.mouse.move(a, c, { steps: 4 }); }
      else if (op === 'drag') { const [x1, y1, x2, y2] = a; await p.mouse.move(x1, y1); await p.mouse.down(); await fast(3); await p.mouse.move(x2, y2, { steps: 8 }); await fast(c || 6); await p.mouse.up(); }
      else if (op === 'eval') { const r = await p.evaluate(a); if (r !== undefined) console.log('eval ->', JSON.stringify(r).slice(0, 600)); }
      else if (op === 'shot') { await adv(1); await p.screenshot({ path: a, timeout: 180000 }); }
      else if (op === 'wait') {
        let ok = false;
        for (let i = 0; i < (c || 300); i++) { if (await p.$(a)) { ok = true; break; } await fast(3); }
        if (!ok) console.log('wait timeout', a);
      }
    } catch (e) { console.log('step error', JSON.stringify(st), e.message.split('\n')[0]); }
    console.log(op, a ?? '', (Date.now() - t0) + 'ms');
  }
  await b.close();
})();
