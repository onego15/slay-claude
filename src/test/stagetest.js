import { World } from '../gfx/stage.js';
import { Actor } from '../gfx/actor.js';
import { clock, tick } from '../gfx/clock.js';
export function stageTest(kind) {
  const el = document.getElementById('app');
  el.style.cssText = 'position:fixed;inset:0;background:#000';
  const w = new World(el);
  w.setStage(kind);
  const p = w.addActor(new Actor('player'), -3.2, 0.2); p.idle();
  const list = kind === 'summit' ? [['boss', 2.6, -0.6], ['wisp', 0.6, 0.6], ['wisp', 5.2, 0.6]] : kind === 'chapel' ? [['flame', 1.0, 0.4], ['candelabra', 2.8, -0.2], ['flame', 4.6, 0.4]] : [['mossguard', 1.3, 0.1], ['wolf', 3.4, -0.3], ['bat', 5.3, 0.4]];
  for (const [id, x, z] of list) { const a = w.addActor(new Actor(id, { flip: false }), x, z); a.idle(); if (['bat','flame','wisp'].includes(id)) a.hover = 0.25; }
  w.lantern.position.set(-3.2, 1.3, 1.6); w.lantern.intensity = 3.5;
  window.__world = w;
  let last = performance.now();
  window.__advance = (ms) => { tick(ms / 1000); w.update(clock.dt); w.render(); };
  if (!location.search.includes('capture')) {
    const loop = (now) => { tick((now - last) / 1000); last = now; w.update(clock.dt); w.render(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}
