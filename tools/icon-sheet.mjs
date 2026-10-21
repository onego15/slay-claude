// Contact sheet of all emblems & icons (node, no browser)
import fs from 'node:fs';
import zlib from 'node:zlib';
import { Painter } from '../src/gfx/pixel.js';
import { EMBLEMS, ICONS } from '../src/gfx/icons.js';
const out = process.argv[2];
const items = [...Object.entries(EMBLEMS).map(([k, f]) => [k, f, 32]), ...Object.entries(ICONS).map(([k, f]) => [k, f, 16])];
const S = 4, cell = 34 * S, cols = 8;
const W = cols * cell, H = Math.ceil(items.length / cols) * cell;
const img = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) { img[i * 4] = 40; img[i * 4 + 1] = 36; img[i * 4 + 2] = 50; img[i * 4 + 3] = 255; }
items.forEach(([k, f, n], idx) => {
  const P = new Painter(n, n); f(P); P.outline({ darken: 0.25 });
  const sc = n === 32 ? S : S * 2;
  const ox = (idx % cols) * cell + 4, oy = Math.floor(idx / cols) * cell + 4;
  for (let y = 0; y < n * sc; y++) for (let x = 0; x < n * sc; x++) {
    const si = (Math.floor(y / sc) * n + Math.floor(x / sc)) * 4, di = ((oy + y) * W + ox + x) * 4;
    const a = P.data[si + 3] / 255;
    for (let c = 0; c < 3; c++) img[di + c] = Math.min(255, img[di + c] * (1 - a) + P.data[si + c] * a + (P.glow[si + 3] ? P.glow[si + c] * 0.3 : 0));
  }
});
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let r = 0; r < H; r++) img.copy(raw, r * (W * 4 + 1) + 1, r * W * 4, (r + 1) * W * 4);
const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 6;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]));
console.log(items.map((x) => x[0]).join(' '));
