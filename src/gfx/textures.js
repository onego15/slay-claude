// Procedural environment textures. Everything uses the same 32px-per-unit density as the sprites.
import { Painter, ramp, hex, mix, makeNoise, makeCanvas } from './pixel.js';

export const PPU = 32;

function quantize(rmp, v, x, y) {
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const th = (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  const f = Math.max(0, Math.min(0.999, v)) * (rmp.length - 1);
  let i = Math.floor(f);
  if (f - i > 0.5 + (th - 0.5) * 0.5) i++;
  return rmp[Math.min(rmp.length - 1, i)];
}

function painterFill(w, h, fn) {
  const P = new Painter(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fn(x, y);
    if (c) P.px(x, y, c);
  }
  return P;
}

// Forest floor: mossy grass with a worn dirt path and stones. Tileable horizontally.
export function forestGround(w = 512, h = 256, seed = 3) {
  const n = makeNoise(seed);
  const grass = ramp('#4f7a3a', 6, { shadow: '#0f1e16', bright: 0.45 });
  const dirt = ramp('#7a6248', 5, { shadow: '#22160e', bright: 0.4 });
  const P = painterFill(w, h, (x, y) => {
    const u = x / w, v = y / h;
    const tx = (a) => n.fbm(Math.cos(u * Math.PI * 2) * a + 10, Math.sin(u * Math.PI * 2) * a + v * a * 2.2, 4);
    const pathC = 0.52 + (n(u * 6 + 3, 1.7) - 0.5) * 0.2;
    const pathW = 0.17 + (n(u * 9, 4.2) - 0.5) * 0.1;
    const dp = Math.abs(v - pathC) - pathW + (tx(6) - 0.5) * 0.12;
    const g = tx(10);
    if (dp < 0) {
      const d = tx(14) * 0.8 + 0.15;
      return quantize(dirt, d, x, y);
    }
    const edge = Math.min(1, dp * 12);
    return quantize(grass, g * 0.75 + 0.18 + (1 - edge) * -0.12, x, y);
  });
  // stones on the path, flowers and clover in the grass
  let s = seed * 97;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const stone = ramp('#8a8a8a', 4, { shadow: '#1a1a24' });
  for (let i = 0; i < 70; i++) {
    const x = rnd() * w, y = h * (0.35 + rnd() * 0.33);
    P.ellipse(x, y, 2 + rnd() * 4, 1.3 + rnd() * 2, stone, { bias: -0.1 });
  }
  const flowers = ['#e8d36a', '#f2f0e0', '#c87ab8', '#7ab0e8'];
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(rnd() * w), y = Math.floor(rnd() * h);
    const v = y / h;
    if (v > 0.33 && v < 0.7) continue;
    if (rnd() < 0.35) P.px(x, y, hex(flowers[Math.floor(rnd() * flowers.length)]));
    else { P.px(x, y, grass[5]); P.px(x, y + 1, grass[3]); }
  }
  return P;
}

export function stoneBricks(w = 64, h = 64, { hue = '#7d7a78', moss = true, seed = 5 } = {}) {
  const n = makeNoise(seed);
  const st = ramp(hue, 5, { shadow: '#14121c', bright: 0.4 });
  const mossR = ramp('#4f7a3a', 4, { shadow: '#0f1e16' });
  const bh = 8, bw = 16;
  return painterFill(w, h, (x, y) => {
    const row = Math.floor(y / bh);
    const off = (row % 2) * (bw / 2);
    const bx = (x + off) % bw, by = y % bh;
    const brickId = Math.floor((x + off) / bw) + row * 7;
    if (by === 0 || bx === 0) return st[0];
    let v = 0.45 + (n(brickId * 1.3, row * 0.7) - 0.5) * 0.35 + (n(x * 0.3, y * 0.3) - 0.5) * 0.2;
    if (by === 1 || bx === 1) v += 0.25;
    if (by === bh - 1 || bx === bw - 1) v -= 0.15;
    if (moss && n.fbm(x / 22, y / 22, 3) > 0.62 - (y / h) * 0.12) return quantize(mossR, v + 0.1, x, y);
    return quantize(st, v, x, y);
  });
}

export function chapelFloor(w = 256, h = 256, seed = 8) {
  const n = makeNoise(seed);
  const a = ramp('#6a6270', 5, { shadow: '#100c18', bright: 0.35 });
  const b = ramp('#4a4258', 5, { shadow: '#0a0812', bright: 0.35 });
  const ts = 32;
  const P = painterFill(w, h, (x, y) => {
    const tx = Math.floor(x / ts), ty = Math.floor(y / ts);
    const lx = x % ts, ly = y % ts;
    if (lx === 0 || ly === 0) return a[0];
    const rmp = (tx + ty) % 2 ? a : b;
    let v = 0.45 + (n(x * 0.15, y * 0.15) - 0.5) * 0.3 + (n(tx * 3.1, ty * 2.7) - 0.5) * 0.2;
    if (lx === 1 || ly === 1) v += 0.2;
    // cracks
    const c = Math.abs(n.fbm(x / 18, y / 18, 3) - 0.5);
    if (c < 0.012) return rmp[0];
    return quantize(rmp, v, x, y);
  });
  // ash drifts
  const ash = ramp('#9a8f88', 4);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 400; i++) P.px(rnd() * w, rnd() * h, ash[Math.floor(rnd() * 3)]);
  return P;
}

export function summitFloor(w = 256, h = 256, seed = 11) {
  const n = makeNoise(seed);
  const st = ramp('#5a5e78', 6, { shadow: '#06060e', bright: 0.35 });
  return painterFill(w, h, (x, y) => {
    const v = n.fbm(x / 26, y / 26, 4);
    const c = Math.abs(n.fbm(x / 40 + 7, y / 40, 3) - 0.5);
    if (c < 0.01) return st[0];
    const ts = 64;
    if (x % ts === 0 || y % ts === 0) return st[1];
    return quantize(st, v * 0.8 + 0.12, x, y);
  });
}

// Runic circle overlay for the summit (glow).
export function runeCircle(size = 256) {
  const P = new Painter(size, size);
  const c = size / 2;
  const col = hex('#b49aff');
  for (const r of [c - 4, c - 14, c - 40]) {
    for (let a = 0; a < Math.PI * 2; a += 0.6 / r) P.glowPx(c + Math.cos(a) * r, c + Math.sin(a) * r, col, 230);
  }
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const r = c - 27;
    const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
    for (let i = -3; i <= 3; i++) P.glowPx(x + i * Math.sin(a), y - i * Math.cos(a), col, 230);
    P.glowPx(x + 2, y, col); P.glowPx(x - 2, y + 1, col);
  }
  for (let k = 0; k < 6; k++) {
    const a1 = (k / 6) * Math.PI * 2, a2 = ((k + 2) / 6) * Math.PI * 2;
    const r = c - 40;
    P.line(c + Math.cos(a1) * r, c + Math.sin(a1) * r, c + Math.cos(a2) * r, c + Math.sin(a2) * r, null, { glow: col });
  }
  return P;
}

// Smooth vertical gradient (not pixelated: skies are "far" and soft like HD-2D backdrops).
export function gradientCanvas(stops, w = 4, h = 256) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [t, col] of stops) g.addColorStop(t, col);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return c;
}

export function radialCanvas(size = 64, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

// God-ray shaft: soft vertical beam with feathered edges.
export function shaftCanvas(w = 64, h = 256) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / (w - 1), v = y / (h - 1);
    const edge = Math.sin(u * Math.PI) ** 2;
    const fall = Math.pow(1 - v, 1.2) * Math.min(1, v * 8);
    const a = edge * fall;
    const i = (y * w + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Layered mountain / forest silhouette strips, pixel style, tinted for atmospheric perspective.
export function silhouetteStrip(w, h, { color = '#40506a', top = '#5a6a88', seed = 2, kind = 'mountain', rough = 1 } = {}) {
  const n = makeNoise(seed);
  const base = hex(color), hi = hex(top);
  return painterFill(w, h, (x, y) => {
    const u = x / w;
    let hh;
    if (kind === 'mountain') hh = 0.25 + n.fbm(Math.cos(u * Math.PI * 2) * 1.5 + 3, Math.sin(u * Math.PI * 2) * 1.5, 5) * 0.75 * rough;
    else if (kind === 'forest') {
      const tree = Math.abs(((x * 0.11) % 2) - 1);
      hh = 0.35 + n(u * 20, 1) * 0.3 + (1 - tree) * 0.18 * (n(Math.floor(x / 9), 5) + 0.4);
    } else hh = 0.3 + n.fbm(u * 8, 2, 3) * 0.4;
    const yy = 1 - y / h;
    if (yy > hh) return null;
    const d = (hh - yy) * h;
    return d < 2 ? hi : mix(base, hi, Math.max(0, 0.25 - d / h));
  });
}

export function stainedGlass(w = 48, h = 96) {
  const P = new Painter(w, h);
  const cols = ['#c84a4a', '#4a7ac8', '#d8b04a', '#5aa86a', '#a05ac8'].map(hex);
  const lead = [20, 16, 28];
  const cx = w / 2;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    // gothic arch shape
    const ay = y < cx ? Math.sqrt(Math.max(0, cx * cx - (x - cx) ** 2 * 1.4)) : cx;
    if (y < cx - ay + 2) continue;
    const cell = (Math.floor(x / 8) * 3 + Math.floor((y + (Math.floor(x / 8) % 2) * 4) / 9)) % cols.length;
    const isLead = x % 8 === 0 || (y + (Math.floor(x / 8) % 2) * 4) % 9 === 0 || x === w - 1 || y === h - 1;
    const c = isLead ? lead : mix(cols[cell], [255, 255, 255], ((x * 7 + y * 3) % 5) * 0.05);
    P.px(x, y, c);
    if (!isLead) P.glowPx(x, y, c, 200);
  }
  // central rose
  for (let a = 0; a < Math.PI * 2; a += 0.05) for (let r = 0; r < 9; r++) {
    const x = cx + Math.cos(a) * r, y = 28 + Math.sin(a) * r;
    const c = r < 3 ? hex('#ffe08a') : r % 3 === 0 ? lead : cols[Math.floor((a / (Math.PI * 2)) * 8) % cols.length];
    P.px(x, y, c);
    if (c !== lead) P.glowPx(x, y, c, 230);
  }
  return P;
}

export function bannerTex(w = 24, h = 72, hue = '#7a2a3a') {
  const cloth = ramp(hue, 5, { shadow: '#100810' });
  const gold = ramp('#c9a040', 4);
  const P = new Painter(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const tail = y > h - 10 && Math.abs(x - w / 2) < (y - (h - 10)) * 1.2;
    if (tail) continue;
    const v = 0.5 + Math.sin(x * 0.5) * 0.2 - y / h * 0.2;
    P.px(x, y, quantize(cloth, v, x, y));
  }
  for (let y = 10; y < 34; y++) for (let x = 6; x < w - 6; x++) {
    const d = Math.abs(x - w / 2) + Math.abs(y - 22);
    if (d < 9 && d > 6) P.px(x, y, gold[2]);
    if (d < 3) P.px(x, y, gold[3]);
  }
  for (let x = 0; x < w; x++) P.px(x, 1, gold[1]);
  return P;
}

export function cloudCanvas(w = 256, h = 96, seed = 4) {
  const n = makeNoise(seed);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = x / w, v = y / h;
    const shape = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
    const d = n.fbm(u * 5, v * 3, 5) * shape * 1.6 - 0.35;
    const a = Math.max(0, Math.min(1, d * 2.2));
    const i = (y * w + x) * 4;
    const shade = 200 + (1 - v) * 55;
    img.data[i] = shade; img.data[i + 1] = shade; img.data[i + 2] = Math.min(255, shade + 10); img.data[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
