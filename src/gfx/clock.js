// Game clock. Every animation (3D, DOM cards, UI) is driven from here so the game can run
// deterministically under virtual time when capturing GIFs, and so hit-stop/slow-mo affect everything.
export const clock = {
  t: 0, // scaled game time (s)
  rt: 0, // unscaled time (s)
  dt: 0,
  rdt: 0,
  timeScale: 1,
  hitstopUntil: 0,
  slowUntil: 0,
  slowScale: 1,
  waiters: [],
  realWaiters: [],
  tickers: new Set(),
};

export function tick(realDt) {
  realDt = Math.min(realDt, 0.1);
  clock.rdt = realDt;
  clock.rt += realDt;
  let scale = clock.timeScale;
  if (clock.rt < clock.hitstopUntil) scale = 0.03;
  else if (clock.rt < clock.slowUntil) scale *= clock.slowScale;
  clock.dt = realDt * scale;
  clock.t += clock.dt;
  for (const f of [...clock.tickers]) f(clock.dt, realDt);
  if (clock.waiters.length) {
    const ready = clock.waiters.filter((w) => w.at <= clock.t);
    clock.waiters = clock.waiters.filter((w) => w.at > clock.t);
    for (const w of ready) w.resolve();
  }
  if (clock.realWaiters.length) {
    const ready = clock.realWaiters.filter((w) => w.at <= clock.rt);
    clock.realWaiters = clock.realWaiters.filter((w) => w.at > clock.rt);
    for (const w of ready) w.resolve();
  }
}

export const wait = (ms) => new Promise((resolve) => clock.waiters.push({ at: clock.t + ms / 1000, resolve }));
export const waitReal = (ms) => new Promise((resolve) => clock.realWaiters.push({ at: clock.rt + ms / 1000, resolve }));
export const nextFrame = () => wait(1);

export function hitstop(ms) { clock.hitstopUntil = Math.max(clock.hitstopUntil, clock.rt + ms / 1000); }
export function slowmo(ms, scale = 0.35) { clock.slowUntil = clock.rt + ms / 1000; clock.slowScale = scale; }

export function addTicker(f) { clock.tickers.add(f); return () => clock.tickers.delete(f); }

export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t * t * t,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; },
  outQuint: (t) => 1 - (1 - t) ** 5,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  outElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

// Tween a value over game time; resolves when done. `real` uses unscaled time.
export function tween(dur, fn, { easing = ease.outCubic, real = false } = {}) {
  return new Promise((resolve) => {
    let e = 0;
    if (dur <= 0) { fn(1); resolve(); return; }
    const stop = addTicker((dt, rdt) => {
      e += real ? rdt : dt;
      const t = Math.min(1, e / (dur / 1000));
      fn(easing(t), t);
      if (t >= 1) { stop(); resolve(); }
    });
  });
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
