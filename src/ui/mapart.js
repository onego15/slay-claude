// Hand-drawn parchment backdrop for the map screen (pixel resolution = half of design px).
import { makeNoise } from '../gfx/pixel.js';

const cache = new Map();

// avoid: list of {x, y} design-space node positions to keep sketches away from.
export function parchmentCanvas(W, H, seed, avoid) {
  const key = `${W}x${H}:${seed}`;
  if (cache.has(key)) return cache.get(key);
  const w = W >> 1, h = H >> 1;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  const img = g.createImageData(w, h);
  const n = makeNoise(seed + 7);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const stain = n.fbm(x / 60, y / 60, 4);
      const fib = n(x / 3, y / 9) * 0.5 + 0.5;
      const ex = Math.min(x, w - 1 - x) / 26, ey = Math.min(y, h - 1 - y) / 26;
      const edge = Math.min(1, Math.min(ex, ey));
      let v = 0.78 + (stain - 0.5) * 0.35 + (fib - 0.75) * 0.06 - (1 - edge) * 0.32;
      const th = (bayer[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
      v = Math.round(v * 7 + (th - 0.5) * 0.9) / 7; // posterize with ordered dither
      const i = (y * w + x) * 4;
      img.data[i] = 236 * v + 20; img.data[i + 1] = 206 * v + 14; img.data[i + 2] = 150 * v + 8; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // ink sketches: little trees, peaks and ruins scattered between the nodes
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const ink = 'rgba(92,60,34,0.55)';
  g.fillStyle = ink;
  const near = (x, y) => avoid.some((p) => Math.hypot(p.x / 2 - x, p.y / 2 - y) < 26);
  const px = (x, y) => g.fillRect(Math.round(x), Math.round(y), 1, 1);
  for (let k = 0; k < 140; k++) {
    const x = 20 + rnd() * (w - 40), y = 20 + rnd() * (h - 40);
    if (near(x, y)) continue;
    const t = y / h; // top = summit (mountains), bottom = forest (trees)
    const r = rnd();
    if (r < 0.62 - t * 0.4 && t < 0.55) {
      // peak
      const hh = 6 + rnd() * 6;
      for (let i = 0; i <= hh; i++) { px(x - i * 0.8, y - hh + i); px(x + i * 0.8, y - hh + i); }
      for (let i = 2; i < hh; i += 2) px(x + i * 0.4, y - hh + i + 1);
    } else if (t > 0.35) {
      // tree: little triangle with trunk
      const hh = 4 + rnd() * 3;
      for (let i = 0; i < hh; i++) for (let j = -i * 0.5; j <= i * 0.5; j += 1) if (rnd() < 0.7) px(x + j, y - hh + i);
      px(x, y); px(x, y + 1);
    } else {
      // tufts / rocks
      px(x, y); px(x + 2, y); px(x + 1, y - 1);
    }
  }
  // compass rose (bottom right)
  const cx = w - 28, cy = h - 24;
  g.fillStyle = 'rgba(120,40,30,0.6)';
  for (let i = -14; i <= 14; i++) { px(cx, cy + i); px(cx + i, cy); }
  for (let i = -5; i <= 5; i++) { px(cx + i, cy - 9 + Math.abs(i)); }
  g.fillStyle = ink;
  for (let a = 0; a < Math.PI * 2; a += 0.12) px(cx + Math.cos(a) * 10, cy + Math.sin(a) * 10);
  cache.set(key, cv);
  return cv;
}
