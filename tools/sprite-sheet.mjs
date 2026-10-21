// Renders every procedural sprite into a contact sheet PNG for quick art review (no browser needed).
// usage: node tools/sprite-sheet.mjs out.png [scale] [ids...]
import fs from 'node:fs';
import zlib from 'node:zlib';
import { SPRITE_DEFS, paintSprite } from '../src/gfx/sprites.js';

const out = process.argv[2] || 'sheet.png';
const scale = Number(process.argv[3] || 3);
const ids = process.argv.slice(4).length ? process.argv.slice(4) : Object.keys(SPRITE_DEFS);

const cells = [];
for (const id of ids) {
  const s = paintSprite(id);
  for (const f of s.frames) cells.push({ id, w: s.w, h: s.h, P: f.painter });
}
const pad = 4;
const maxW = 900;
let x = pad, y = pad, rowH = 0;
const pos = [];
for (const c of cells) {
  const w = c.w * scale, h = c.h * scale;
  if (x + w + pad > maxW) { x = pad; y += rowH + pad; rowH = 0; }
  pos.push([x, y]);
  x += w + pad; rowH = Math.max(rowH, h);
}
const W = maxW, H = y + rowH + pad;
const img = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) { img[i * 4] = 46; img[i * 4 + 1] = 52; img[i * 4 + 2] = 62; img[i * 4 + 3] = 255; }
cells.forEach((c, k) => {
  const [ox, oy] = pos[k];
  for (let yy = 0; yy < c.h * scale; yy++) for (let xx = 0; xx < c.w * scale; xx++) {
    const sx = Math.floor(xx / scale), sy = Math.floor(yy / scale);
    const si = (sy * c.w + sx) * 4;
    const di = ((oy + yy) * W + ox + xx) * 4;
    const a = c.P.data[si + 3] / 255;
    const g = c.P.glow[si + 3] ? [c.P.glow[si], c.P.glow[si + 1], c.P.glow[si + 2]] : [0, 0, 0];
    for (let ch = 0; ch < 3; ch++) {
      const base = img[di + ch] * (1 - a) + c.P.data[si + ch] * a;
      img[di + ch] = Math.min(255, base + g[ch] * 0.35);
    }
  }
});
// PNG encode
const crcTable = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (buf) => { let c = -1; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
const raw = Buffer.alloc((W * 4 + 1) * H);
for (let r = 0; r < H; r++) { raw[r * (W * 4 + 1)] = 0; img.copy(raw, r * (W * 4 + 1) + 1, r * W * 4, (r + 1) * W * 4); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out, W, H, cells.length, 'frames');
