// Seeded RNG (mulberry32) with helpers. Deterministic runs make bugs reproducible.
export function makeRng(seed) {
  let s = seed >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.int = (a, b) => a + Math.floor(r() * (b - a + 1));
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  r.weighted = (entries) => {
    // entries: [[value, weight], ...]
    let total = 0;
    for (const [, w] of entries) total += w;
    let x = r() * total;
    for (const [v, w] of entries) {
      if ((x -= w) < 0) return v;
    }
    return entries[entries.length - 1][0];
  };
  r.state = () => s;
  return r;
}

export function randomSeed() {
  return (Math.random() * 0xffffffff) >>> 0;
}
