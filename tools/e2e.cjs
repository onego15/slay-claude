// Browser end-to-end smoke test: the autopilot plays a whole run through the real UI.
// usage: node tools/e2e.cjs [seed=3] [strat=balanced] [god=1] [shotDir]
// Exits non-zero on page errors, a stall (no progress), or the run not reaching an ending.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
(async () => {
  const [seed = '3', strat = 'balanced', god = '1', shotDir = ''] = process.argv.slice(2);
  const base = process.env.BASE || 'http://127.0.0.1:4173/';
  const url = `${base}?capture&auto&seed=${seed}&strat=${strat}${god === '1' ? '&god' : ''}&speed=2`;
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(url, { waitUntil: 'load' });
  await p.waitForFunction(() => window.__step, null, { timeout: 60000 });
  if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
  const seen = new Set();
  let lastLog = 0, stall = 0, t0 = Date.now(), shots = 0;
  for (let iter = 0; iter < 4000; iter++) {
    const st = await p.evaluate(async () => {
      for (let i = 0; i < 30; i++) { window.__step(1 / 15 * 1000); await new Promise((r) => setTimeout(r, 0)); }
      const scr = [...document.querySelectorAll('#screens > .screen')].map((s) => s.id).join(',');
      const bt = window.__game.battle;
      return { done: window.__autoDone || null, log: window.__autolog.length, scr, battle: bt ? bt.kind + ':' + bt.combat.enemies.map((e) => e.id).join('+') : '', floor: window.__run ? window.__run.floor : 0, hp: window.__run ? window.__run.hp : 0 };
    });
    const key = st.scr + '|' + st.battle;
    if (shotDir && !seen.has(key) && (st.scr || st.battle)) {
      seen.add(key);
      await p.evaluate(async () => { for (let i = 0; i < 20; i++) { window.__step(1000 / 30); await new Promise((r) => setTimeout(r, 0)); } window.__advance(1000 / 30); });
      await p.screenshot({ path: `${shotDir}/${String(++shots).padStart(2, '0')}_${(st.scr || 'battle').replace(/,/g, '+')}_f${st.floor}.png`, timeout: 180000 });
    }
    if (st.log === lastLog) stall++; else { stall = 0; lastLog = st.log; }
    if (st.done) { console.log('RESULT', st.done, 'floor', st.floor, 'hp', st.hp); break; }
    if (stall > 60) { console.log('STALL at', key, 'floor', st.floor); break; }
  }
  const log = await p.evaluate(() => window.__autolog);
  fs.writeFileSync(`${shotDir || '.'}/e2e-${seed}.log`, log.join('\n'));
  const res = await p.evaluate(() => window.__autoDone || null);
  console.log('actions', log.length, 'errors', errors.length, 'wall', ((Date.now() - t0) / 1000).toFixed(0) + 's');
  for (const e of errors.slice(0, 10)) console.log('  ERR', e.slice(0, 300));
  await b.close();
  process.exit(res && errors.length === 0 ? 0 : 1);
})();
