// Procedural pixel-art painter. Shapes are shaded with a light vector and ordered dithering,
// then finished with selective outlines and rim light so every sprite shares one visual language.

export const hex = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const toHex = ([r, g, b]) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t].map((v) => Math.round(v));

// Build an n-step ramp from shadow (hue-shifted cool) to highlight (hue-shifted warm).
export function ramp(base, n = 5, { shadow = '#1c1433', light = '#fff1cf', dark = 0.62, bright = 0.5 } = {}) {
  const b = typeof base === 'string' ? hex(base) : base;
  const d = mix(b, hex(shadow), dark);
  const l = mix(b, hex(light), bright);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push(t <= 0.5 ? mix(d, b, t * 2) : mix(b, l, (t - 0.5) * 2));
  }
  return out;
}

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16));

export class Painter {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this.glow = new Uint8ClampedArray(w * h * 4);
    this.light = normalize([-0.55, -0.65, 0.55]);
    this.ox = 0;
    this.oy = 0;
    this.ditherBand = 0.18;
  }

  idx(x, y) { return (y * this.w + x) * 4; }
  inside(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  px(x, y, c, a = 255) {
    x = Math.round(x + this.ox); y = Math.round(y + this.oy);
    if (!this.inside(x, y) || !c) return;
    const i = this.idx(x, y);
    if (a >= 255) {
      this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = 255;
    } else {
      const t = a / 255;
      const da = this.data[i + 3] / 255;
      this.data[i] = this.data[i] * (1 - t) + c[0] * t;
      this.data[i + 1] = this.data[i + 1] * (1 - t) + c[1] * t;
      this.data[i + 2] = this.data[i + 2] * (1 - t) + c[2] * t;
      this.data[i + 3] = Math.min(255, (da + t * (1 - da)) * 255);
    }
  }

  get(x, y) {
    if (!this.inside(x, y)) return null;
    const i = this.idx(x, y);
    if (this.data[i + 3] < 128) return null;
    return [this.data[i], this.data[i + 1], this.data[i + 2]];
  }

  glowPx(x, y, c, a = 255) {
    x = Math.round(x + this.ox); y = Math.round(y + this.oy);
    if (!this.inside(x, y)) return;
    const i = this.idx(x, y);
    this.glow[i] = Math.max(this.glow[i], c[0] * a / 255);
    this.glow[i + 1] = Math.max(this.glow[i + 1], c[1] * a / 255);
    this.glow[i + 2] = Math.max(this.glow[i + 2], c[2] * a / 255);
    this.glow[i + 3] = 255;
  }

  // Shade from a pseudo-normal; returns ramp color with dithering.
  shade(rmp, nx, ny, nz, x, y, bias = 0) {
    const L = this.light;
    let d = nx * L[0] + ny * L[1] + nz * L[2];
    d = d * 0.5 + 0.5 + bias;
    d = Math.max(0, Math.min(0.999, d));
    const f = d * (rmp.length - 1);
    let i = Math.floor(f);
    const frac = f - i;
    // dither only in a narrow band around the step so surfaces stay clean
    const th = BAYER[((y % 4) + 4) % 4][((x % 4) + 4) % 4];
    const band = this.ditherBand;
    if (frac > 0.5 + band * (th - 0.5) * 2) i++;
    return rmp[Math.max(0, Math.min(rmp.length - 1, i))];
  }

  ellipse(cx, cy, rx, ry, rmp, { bias = 0, flat = false, glow = null, alpha = 255, clip = null } = {}) {
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        const r2 = dx * dx + dy * dy;
        if (r2 > 1) continue;
        if (clip && !clip(x, y)) continue;
        const nz = Math.sqrt(1 - r2);
        const c = flat ? (Array.isArray(rmp[0]) ? rmp[Math.floor(rmp.length / 2)] : rmp) : this.shade(rmp, dx, dy, nz, x, y, bias);
        this.px(x, y, c, alpha);
        if (glow) this.glowPx(x, y, glow, 255);
      }
    }
  }

  // Filled polygon with per-pixel shading using a supplied normal function or a bevel.
  poly(pts, rmp, { bias = 0, normal = null, glow = null, alpha = 255, bevel = true } = {}) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const hw = (maxX - minX) / 2 + 0.5, hh = (maxY - minY) / 2 + 0.5;
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
        if (!pointInPoly(x + 0.5, y + 0.5, pts)) continue;
        let n;
        if (normal) n = normal(x, y);
        else if (bevel) {
          const dx = (x + 0.5 - cx) / hw, dy = (y + 0.5 - cy) / hh;
          n = normalize([dx * 0.8, dy * 0.8, 1]);
        } else n = [0, 0, 1];
        this.px(x, y, this.shade(rmp, n[0], n[1], n[2], x, y, bias), alpha);
        if (glow) this.glowPx(x, y, glow);
      }
    }
  }

  rect(x, y, w, h, rmp, opts = {}) {
    this.poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], rmp, opts);
  }

  // Thick line (capsule) shaded as a cylinder.
  limb(x0, y0, x1, y1, r, rmp, { bias = 0, glow = null } = {}) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const minX = Math.floor(Math.min(x0, x1) - r - 1), maxX = Math.ceil(Math.max(x0, x1) + r + 1);
    const minY = Math.floor(Math.min(y0, y1) - r - 1), maxY = Math.ceil(Math.max(y0, y1) + r + 1);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5 - x0, py = y + 0.5 - y0;
        let t = (px * ux + py * uy) / len;
        t = Math.max(0, Math.min(1, t));
        const qx = x0 + dx * t, qy = y0 + dy * t;
        const ex = x + 0.5 - qx, ey = y + 0.5 - qy;
        const d = Math.hypot(ex, ey);
        if (d > r) continue;
        const nz = Math.sqrt(Math.max(0, 1 - (d / r) ** 2));
        const c = this.shade(rmp, ex / r, ey / r, nz, x, y, bias);
        this.px(x, y, c);
        if (glow) this.glowPx(x, y, glow);
      }
    }
  }

  line(x0, y0, x1, y1, c, { glow = null } = {}) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(x0, y0, c);
      if (glow) this.glowPx(x0, y0, glow);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  // Radial soft glow stamped into both color (additive-ish) and glow buffers.
  glowDot(cx, cy, r, c, strength = 1) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        if (d > 1) continue;
        const a = (1 - d) ** 2 * strength * 0.45;
        this.glowPx(x, y, c, Math.min(255, a * 255));
      }
    }
  }

  // Selective outline: transparent pixels next to filled ones become a dark version of the neighbour.
  outline({ darken = 0.35, tint = [20, 14, 36], diagonal = false } = {}) {
    const w = this.w, h = this.h;
    const src = new Uint8ClampedArray(this.data);
    const at = (x, y) => (x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 127 ? (y * w + x) * 4 : -1);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (src[i + 3] > 127) continue;
        const nb = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
        if (diagonal) nb.push(at(x - 1, y - 1), at(x + 1, y - 1), at(x - 1, y + 1), at(x + 1, y + 1));
        const j = nb.find((v) => v >= 0);
        if (j === undefined) continue;
        const c = [src[j], src[j + 1], src[j + 2]];
        const o = mix(c, tint, 1 - darken);
        this.data[i] = o[0]; this.data[i + 1] = o[1]; this.data[i + 2] = o[2]; this.data[i + 3] = 255;
      }
    }
  }

  // Inner edge darkening on the side away from light + rim highlight on lit edges.
  rim({ strength = 0.45, color = [255, 236, 190] } = {}) {
    const w = this.w, h = this.h;
    const src = new Uint8ClampedArray(this.data);
    const op = (x, y) => x >= 0 && y >= 0 && x < w && y < h && src[(y * w + x) * 4 + 3] > 127;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!op(x, y)) continue;
        const i = (y * w + x) * 4;
        // light from top-left: if pixel up-left is empty, highlight
        if (!op(x - 1, y - 1) && (!op(x, y - 1) || !op(x - 1, y))) {
          const c = mix([src[i], src[i + 1], src[i + 2]], color, strength);
          this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2];
        }
      }
    }
  }

  clear() { this.data.fill(0); this.glow.fill(0); }

  toCanvas(which = 'color') {
    const c = makeCanvas(this.w, this.h);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(this.w, this.h);
    img.data.set(which === 'glow' ? this.glow : this.data);
    ctx.putImageData(img, 0, 0);
    return c;
  }

  hasGlow() {
    for (let i = 3; i < this.glow.length; i += 4) if (this.glow[i]) return true;
    return false;
  }
}

export function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function normalize(v) {
  const l = Math.hypot(...v) || 1;
  return v.map((x) => x / l);
}

export function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Simple value noise for textures.
export function makeNoise(seed = 1) {
  const perm = new Uint8Array(512);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => ((h & 1) ? x : -x) + ((h & 2) ? y : -y);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const noise = (x, y) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    return lerp(lerp(grad(perm[a], x, y), grad(perm[b], x - 1, y), u), lerp(grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1), u), v) * 0.7 + 0.5;
  };
  noise.fbm = (x, y, oct = 4) => {
    let v = 0, a = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { v += a * noise(x * f, y * f); a *= 0.5; f *= 2; }
    return v;
  };
  return noise;
}
