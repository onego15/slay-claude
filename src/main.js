import './ui/style.css';
import { World } from './gfx/stage.js';
import { Game } from './game.js';
import { clock, tick } from './gfx/clock.js';
import { setupUIRoot, initTooltip } from './ui/dom.js';

const q = new URLSearchParams(location.search);
if (q.get('stage')) {
  import('./test/stagetest.js').then((m) => m.stageTest(q.get('stage')));
} else {
  const app = document.getElementById('app');
  const worldEl = document.createElement('div');
  worldEl.id = 'world';
  const uiEl = document.createElement('div');
  uiEl.id = 'ui';
  app.append(worldEl, uiEl);

  const world = new World(worldEl);
  setupUIRoot(uiEl);
  initTooltip(uiEl);
  const game = new Game(world, uiEl);
  window.__world = world;
  window.__game = game;

  const frame = (dt) => { tick(dt); world.update(clock.dt); world.render(); };
  // Capture mode: time only advances when the recorder asks, so slow software GL still yields smooth video.
  window.__advance = (ms) => frame(ms / 1000);
  window.__step = (ms) => { tick(ms / 1000); world.update(clock.dt); };
  if (!q.has('capture')) {
    let last = performance.now();
    const loop = (now) => { frame(Math.min(0.1, (now - last) / 1000)); last = now; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
  const seed = q.get('seed');
  if (seed) game.fixedSeed = Number(seed);
  game.title();
  if (q.has('auto')) {
    import('./test/autoplay.js').then((m) => m.startAutoplay(game, { strat: q.get('strat') || 'balanced', god: q.has('god'), speed: Number(q.get('speed') || 1), seed: Number(seed || 1) }));
  }
}
