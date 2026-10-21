// Pixel icons & card emblems, painted with the same Painter as the world sprites.
import { Painter, ramp, hex, mix } from './pixel.js';

const R = {
  steel: ramp('#b4bfcf', 5, { bright: 0.75 }),
  gold: ramp('#e0b048', 5, { bright: 0.7 }),
  wood: ramp('#8a5a3a', 4),
  fire: [hex('#a82a10'), hex('#ff5a1a'), hex('#ff9a2a'), hex('#ffd56a'), hex('#fff6d0')],
  light: [hex('#b07a20'), hex('#f0c040'), hex('#ffe88a'), hex('#fff8d8'), hex('#ffffff')],
  blue: ramp('#4a8ad0', 5, { bright: 0.6 }),
  teal: ramp('#3aa8a0', 5),
  red: ramp('#d0403a', 5),
  violet: ramp('#8a5ad0', 5, { bright: 0.6 }),
  ash: ramp('#8a8088', 5),
  green: ramp('#5aa84a', 5),
  dark: ramp('#3a3048', 4),
  skin: ramp('#e8b48e', 4),
  bone: ramp('#e0d8c4', 4),
};
const G = { warm: hex('#ffb84a'), light: hex('#fff0a0'), blue: hex('#8ad0ff'), violet: hex('#b08aff'), red: hex('#ff5a3a'), green: hex('#9aff7a') };

// ---------------------------------------------------------------- primitives
function blade(P, x0, y0, x1, y1, w = 1.6, rmp = R.steel, guard = true) {
  P.limb(x0, y0, x1, y1, w, rmp, { bias: 0.05 });
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy);
  const ux = dx / l, uy = dy / l;
  P.line(x0 + ux * 2, y0 + uy * 2, x1 - ux * 2, y1 - uy * 2, rmp[4]);
  if (guard) {
    const gx = x0, gy = y0;
    P.limb(gx - uy * 4, gy + ux * 4, gx + uy * 4, gy - ux * 4, 1.2, R.gold);
    P.limb(gx - ux * 5, gy - uy * 5, gx, gy, 1.3, R.wood);
    P.px(gx - ux * 6, gy - uy * 6, R.gold[3]);
  }
}
function flame(P, cx, cy, s = 1, pal = R.fire, glow = G.warm) {
  const pts = [[-6, 5], [-6, -1], [-3, 1], [-3, -7], [0, -3], [1, -12], [4, -4], [6, -7], [7, 0], [6, 5], [0, 9]].map(([x, y]) => [cx + x * s, cy + y * s]);
  P.poly(pts, pal, { glow, normal: (x, y) => [0, (y - cy) / (16 * s), 0.8] });
  P.ellipse(cx + 0.5 * s, cy + 3 * s, 3 * s, 4 * s, pal.slice(2), { glow: [255, 240, 200] });
}
function shield(P, cx, cy, w, h, rmp = R.blue, rim = R.gold) {
  const pts = [[cx - w, cy - h], [cx + w, cy - h], [cx + w, cy + h * 0.2], [cx, cy + h], [cx - w, cy + h * 0.2]];
  P.poly(pts.map(([x, y]) => [x - 1, y - 1]).map(([x, y], i) => [i === 3 ? x + 1 : x, y]), rim, {});
  P.poly([[cx - w + 2, cy - h + 2], [cx + w - 2, cy - h + 2], [cx + w - 2, cy + h * 0.15], [cx, cy + h - 3], [cx - w + 2, cy + h * 0.15]], rmp, {});
}
function orb(P, cx, cy, r, rmp, glow) { P.ellipse(cx, cy, r, r, rmp, { glow }); P.px(cx - r * 0.4, cy - r * 0.4, [255, 255, 255]); }
function rays(P, cx, cy, r0, r1, n, c, glow) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    P.line(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, c, { glow });
  }
}
function lantern(P, cx, cy, s = 1) {
  P.limb(cx - 3 * s, cy - 7 * s, cx, cy - 10 * s, 0.8, R.gold);
  P.limb(cx, cy - 10 * s, cx + 3 * s, cy - 7 * s, 0.8, R.gold);
  P.rect(cx - 5 * s, cy - 7 * s, 10 * s, 2 * s, R.gold, {});
  P.rect(cx - 5 * s, cy + 6 * s, 10 * s, 2 * s, R.gold, {});
  P.ellipse(cx, cy, 4 * s, 5.5 * s, R.light, { glow: G.warm });
  for (const x of [-5, 5]) P.limb(cx + x * s, cy - 6 * s, cx + x * s, cy + 6 * s, 0.7, R.gold);
}
function hand(P, cx, cy, s = 1) {
  P.ellipse(cx, cy, 5 * s, 6 * s, R.skin);
  for (let i = 0; i < 4; i++) P.limb(cx - 4 * s + i * 2.6 * s, cy - 4 * s, cx - 4.5 * s + i * 2.8 * s, cy - 11 * s, 1.1 * s, R.skin);
  P.limb(cx + 4 * s, cy, cx + 8 * s, cy - 4 * s, 1.2 * s, R.skin);
}
function sparkle(P, x, y, c = [255, 250, 220]) { P.px(x, y, c); P.px(x - 1, y, c); P.px(x + 1, y, c); P.px(x, y - 1, c); P.px(x, y + 1, c); P.glowDot(x, y, 3, G.light, 1); }

// ---------------------------------------------------------------- card emblems (32x32)
export const EMBLEMS = {
  sword: (P) => blade(P, 9, 23, 24, 8),
  shield: (P) => shield(P, 16, 15, 10, 12),
  lanternblade: (P) => { blade(P, 7, 25, 22, 10, 1.6, R.light); P.glowDot(18, 13, 10, G.warm, 1); lantern(P, 24, 21, 0.7); },
  twinblade: (P) => { blade(P, 7, 24, 21, 8); blade(P, 25, 24, 11, 8); },
  flint: (P) => { P.ellipse(12, 18, 7, 6, R.ash); P.ellipse(21, 20, 6, 5, ramp('#6a6a78', 4)); for (let i = 0; i < 5; i++) sparkle(P, 15 + i * 2, 11 - (i % 2) * 3, [255, 200, 120]); },
  shieldbash: (P) => { shield(P, 13, 16, 8, 10); for (let i = 0; i < 4; i++) P.line(23, 9 + i * 4, 29, 8 + i * 4, [255, 240, 200], { glow: G.light }); },
  sweep: (P) => { for (let a = 0.3; a < 2.9; a += 0.02) { const r = 12; P.px(16 + Math.cos(a) * r, 20 - Math.sin(a) * r * 0.6, mix([150, 200, 255], [255, 255, 255], a / 3)); P.glowPx(16 + Math.cos(a) * r, 20 - Math.sin(a) * r * 0.6, G.blue); } blade(P, 10, 26, 25, 18); },
  hammer: (P) => { P.limb(9, 26, 19, 12, 1.4, R.wood); P.rect(13, 4, 14, 9, R.steel, {}); P.rect(12, 6, 2, 5, R.gold, {}); for (let i = 0; i < 3; i++) P.line(4 + i * 3, 22 + i, 1 + i * 3, 28, [220, 200, 160]); },
  lightorb: (P) => { orb(P, 16, 16, 7, R.light, G.light); rays(P, 16, 16, 9, 13, 8, [255, 240, 180], G.light); },
  chain: (P) => { for (let i = 0; i < 4; i++) P.ellipse(8 + i * 5.5, 22 - i * 4, 3.4, 2.4, R.steel); flame(P, 25, 12, 0.7); },
  dagger: (P) => { blade(P, 11, 22, 23, 10, 1.3); for (let i = 0; i < 3; i++) P.line(4, 14 + i * 4, 9, 13 + i * 4, [200, 220, 255]); },
  parry: (P) => { blade(P, 6, 24, 26, 6); blade(P, 26, 24, 8, 8, 1.4, ramp('#8a8a9a', 5), false); sparkle(P, 16, 15); },
  wall: (P) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++) P.rect(4 + x * 8 + (y % 2) * 4 - 2, 8 + y * 5, 7, 4, ramp('#8a8a90', 4), {}); P.rect(4, 5, 24, 3, ramp('#6a6a70', 4), {}); },
  ward: (P) => { shield(P, 16, 16, 9, 11, R.teal); lantern(P, 16, 15, 0.55); },
  prayer: (P) => { hand(P, 12, 22, 0.9); hand(P, 20, 22, 0.9); P.glowDot(16, 8, 9, G.light, 1); orb(P, 16, 8, 3, R.light, G.light); },
  oil: (P) => { P.ellipse(16, 19, 8, 9, ramp('#6a4a2a', 5)); P.rect(13, 6, 6, 5, ramp('#8a6a4a', 4), {}); P.rect(12, 4, 8, 2, R.wood, {}); for (let i = 0; i < 3; i++) P.ellipse(8 + i * 8, 29, 2, 1, ramp('#3a2a1a', 3)); P.ellipse(16, 20, 4, 4, R.fire.slice(1, 4), { glow: G.warm }); },
  eye: (P) => { P.ellipse(16, 16, 12, 7, ramp('#e8e0d0', 4)); P.ellipse(16, 16, 5, 5, R.blue, { glow: G.blue }); P.ellipse(16, 16, 2, 2, [[10, 10, 20], [20, 20, 30]]); P.px(14, 14, [255, 255, 255]); },
  flash: (P) => { blade(P, 6, 26, 26, 6, 1.6, R.light); for (let i = 0; i < 12; i++) { const a = i * 0.52; P.line(16, 16, 16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14, [255, 250, 210], { glow: G.light }); } },
  flamedance: (P) => { flame(P, 9, 19, 0.65); flame(P, 16, 14, 0.85); flame(P, 24, 19, 0.65); },
  ashblade: (P) => { blade(P, 7, 25, 24, 8, 1.6, R.ash); for (let i = 0; i < 9; i++) P.px(10 + i * 2, 6 + (i * 7) % 12, [255, 140, 60]); P.glowDot(20, 10, 6, G.warm, 0.8); },
  execute: (P) => { blade(P, 6, 8, 26, 24, 1.8); P.ellipse(23, 9, 5, 5, R.bone); P.px(21, 8, [20, 20, 30]); P.px(24, 8, [20, 20, 30]); P.line(17, 4, 29, 16, [255, 80, 60], { glow: G.red }); },
  spear: (P) => { P.limb(4, 28, 24, 8, 1.1, R.wood); P.poly([[24, 8], [30, 2], [27, 11]], R.steel, {}); for (let i = 0; i < 3; i++) P.line(18 + i * 3, 4 + i * 2, 22 + i * 3, 2 + i * 2, [220, 230, 255]); },
  explode: (P) => { rays(P, 16, 16, 4, 14, 12, [255, 180, 80], G.warm); orb(P, 16, 16, 6, R.fire.slice(1), G.warm); },
  smoke: (P) => { for (const [x, y, r] of [[10, 18, 7], [20, 16, 8], [15, 10, 6], [24, 22, 5], [8, 24, 5]]) P.ellipse(x, y, r, r * 0.8, ramp('#9a96a4', 4)); },
  radiantshield: (P) => { P.glowDot(16, 16, 15, G.light, 1); shield(P, 16, 16, 9, 11, R.light, R.gold); rays(P, 16, 16, 13, 15, 10, [255, 240, 180], G.light); },
  ashrite: (P) => { P.ellipse(16, 24, 11, 4, ramp('#6a6068', 4)); for (let i = 0; i < 4; i++) P.poly([[10 + i * 3, 22], [12 + i * 3, 10 + (i % 2) * 3], [14 + i * 3, 22]], ramp('#d8c8a8', 3), {}); flame(P, 16, 12, 0.5); },
  heartflame: (P) => { P.ellipse(12, 15, 6, 6, R.red); P.ellipse(20, 15, 6, 6, R.red); P.poly([[6, 16], [26, 16], [16, 28]], R.red, {}); flame(P, 16, 10, 0.55); },
  fist: (P) => { P.ellipse(16, 16, 9, 8, R.skin); for (let i = 0; i < 4; i++) P.ellipse(10 + i * 4, 10, 2.3, 3, R.skin); P.rect(11, 22, 10, 6, ramp('#7a3a2a', 4), {}); for (let i = 0; i < 3; i++) P.line(3, 9 + i * 6, 7, 9 + i * 6, [255, 200, 120]); },
  beacon: (P) => { P.poly([[11, 28], [21, 28], [19, 12], [13, 12]], ramp('#8a8a90', 4), {}); P.rect(11, 8, 10, 4, R.gold, {}); orb(P, 16, 6, 3, R.light, G.light); rays(P, 16, 6, 5, 11, 8, [255, 240, 180], G.light); },
  thorn: (P) => { P.ellipse(16, 18, 9, 10, ramp('#4a5a3a', 4)); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; P.poly([[16 + Math.cos(a) * 8, 18 + Math.sin(a) * 9], [16 + Math.cos(a + 0.15) * 14, 18 + Math.sin(a + 0.15) * 14], [16 + Math.cos(a + 0.3) * 8, 18 + Math.sin(a + 0.3) * 9]], ramp('#d8d0b0', 3), {}); } },
  pact: (P) => { P.rect(8, 6, 16, 22, ramp('#d8c8a0', 4), {}); for (let i = 0; i < 4; i++) P.line(11, 10 + i * 3, 21, 10 + i * 3, [90, 60, 40]); P.ellipse(16, 23, 3.5, 3.5, R.red, { glow: G.red }); },
  inferno: (P) => { flame(P, 16, 18, 1.15, [hex('#6a0a0a'), hex('#d02a10'), hex('#ff6a1a'), hex('#ffc04a'), hex('#fff0c0')]); },
  sunburst: (P) => { P.glowDot(16, 16, 16, G.light, 1); orb(P, 16, 16, 6, R.light, G.light); rays(P, 16, 16, 8, 15, 16, [255, 245, 200], G.light); },
  mirror: (P) => { P.ellipse(16, 15, 9, 11, R.gold); P.ellipse(16, 15, 7, 9, ramp('#a8d8f0', 4, { bright: 0.8 }), { glow: G.blue }); P.line(12, 10, 15, 7, [255, 255, 255]); P.rect(14, 26, 4, 4, R.gold, {}); },
  fortress: (P) => { P.rect(5, 12, 22, 16, ramp('#8a8a90', 4), {}); for (let i = 0; i < 4; i++) P.rect(5 + i * 6, 8, 4, 5, ramp('#8a8a90', 4), {}); P.rect(13, 19, 6, 9, [[20, 16, 24], [36, 30, 40]], { bevel: false }); P.limb(16, 3, 16, 9, 0.7, R.wood); P.poly([[16, 3], [23, 5], [16, 7]], R.red, {}); },
  phoenix: (P) => { flame(P, 16, 18, 0.9); for (const s of [-1, 1]) P.poly([[16, 16], [16 + s * 14, 6], [16 + s * 10, 16], [16 + s * 13, 20]], R.fire.slice(1), { glow: G.warm }); },
  sun: (P) => { orb(P, 16, 16, 8, R.fire.slice(2), G.warm); P.ellipse(16, 16, 4, 4, R.red, { glow: G.red }); rays(P, 16, 16, 10, 14, 12, [255, 200, 100], G.warm); },
  bladestorm: (P) => { for (let i = 0; i < 5; i++) { const a = i * 1.256 + 0.3; blade(P, 16 + Math.cos(a) * 3, 16 + Math.sin(a) * 3, 16 + Math.cos(a) * 13, 16 + Math.sin(a) * 13, 1.2, R.steel, false); } for (let a = 0; a < 6.28; a += 0.08) P.glowPx(16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14, G.blue, 150); },
  ashcard: (P) => { for (const [x, y, r] of [[12, 20, 7], [20, 19, 6], [16, 13, 5]]) P.ellipse(x, y, r, r * 0.7, R.ash); for (let i = 0; i < 6; i++) P.px(9 + i * 3, 22 - (i % 3) * 3, [255, 120, 60]); },
  mud: (P) => { P.ellipse(16, 20, 12, 7, ramp('#5a4a2a', 4)); for (const [x, y] of [[10, 16], [20, 14], [15, 22]]) P.ellipse(x, y, 2, 2, ramp('#8a7a4a', 3)); },
  curse: (P) => { P.ellipse(16, 15, 9, 10, R.violet, { glow: G.violet }); P.ellipse(12, 14, 2, 3, [[10, 0, 20], [20, 10, 30]]); P.ellipse(20, 14, 2, 3, [[10, 0, 20], [20, 10, 30]]); P.ellipse(16, 21, 3, 2, [[10, 0, 20], [20, 10, 30]]); for (let i = 0; i < 4; i++) P.line(9 + i * 5, 25, 7 + i * 5, 30, R.violet[1]); },
};

// ---------------------------------------------------------------- small icons (16x16)
export const ICONS = {
  // stats
  hp: (P) => { P.ellipse(5, 6, 4, 4, R.red); P.ellipse(11, 6, 4, 4, R.red); P.poly([[1, 7], [15, 7], [8, 15]], R.red, {}); P.px(4, 4, [255, 220, 220]); },
  gold: (P) => { P.ellipse(8, 8.5, 6.5, 6.5, R.gold); P.ellipse(8, 8.5, 4, 4, ramp('#c89030', 4)); P.line(8, 6, 8, 11, R.gold[4]); },
  block: (P) => shield(P, 8, 8, 6, 7, R.blue, ramp('#cfd8e0', 4)),
  energy: (P) => { orb(P, 8, 8, 6, R.light, G.warm); },
  deck: (P) => { P.rect(3, 2, 9, 12, ramp('#a87a4a', 4), {}); P.rect(5, 4, 9, 11, ramp('#d8b47a', 4), {}); P.line(7, 7, 12, 7, [90, 60, 40]); P.line(7, 10, 12, 10, [90, 60, 40]); },
  map: (P) => { P.poly([[1, 3], [5, 1], [10, 3], [15, 1], [15, 13], [10, 15], [5, 13], [1, 15]], ramp('#d8c090', 4), {}); P.line(4, 11, 7, 7, R.red[2]); P.line(7, 7, 11, 9, R.red[2]); P.px(12, 5, R.red[3]); },
  sound: (P) => { P.poly([[2, 6], [5, 6], [9, 2], [9, 14], [5, 10], [2, 10]], ramp('#c8c0b0', 4), {}); P.line(11, 5, 12, 8, [220, 210, 190]); P.line(12, 8, 11, 11, [220, 210, 190]); },
  mute: (P) => { P.poly([[2, 6], [5, 6], [9, 2], [9, 14], [5, 10], [2, 10]], ramp('#8a8070', 4), {}); P.line(11, 6, 15, 10, R.red[3]); P.line(15, 6, 11, 10, R.red[3]); },
  drawpile: (P) => { P.rect(2, 3, 10, 12, ramp('#3a5a7a', 4), {}); P.rect(4, 1, 10, 12, ramp('#5a7aa0', 4), {}); P.ellipse(9, 7, 2.5, 2.5, R.light, { glow: G.warm }); },
  discardpile: (P) => { P.rect(4, 3, 10, 12, ramp('#6a3a3a', 4), {}); P.rect(2, 1, 10, 12, ramp('#9a5a4a', 4), {}); P.line(4, 5, 9, 10, [255, 220, 200]); },
  exhaustpile: (P) => { P.rect(3, 4, 10, 11, ramp('#4a4048', 4), {}); flame(P, 8, 7, 0.45); },
  // intents
  i_attack: (P) => { blade(P, 3, 13, 13, 3, 1.3); },
  i_heavy: (P) => { blade(P, 2, 14, 14, 2, 1.7, ramp('#ff8a7a', 5)); P.glowDot(8, 8, 6, G.red, 1); },
  i_defend: (P) => shield(P, 8, 8, 6, 7, R.blue, ramp('#cfd8e0', 4)),
  i_buff: (P) => { P.poly([[8, 1], [15, 8], [11, 8], [11, 15], [5, 15], [5, 8], [1, 8]], R.green, {}); },
  i_debuff: (P) => { P.ellipse(8, 7, 6, 6, R.violet, { glow: G.violet }); P.px(6, 6, [20, 0, 30]); P.px(10, 6, [20, 0, 30]); P.line(6, 10, 10, 10, [20, 0, 30]); P.line(6, 13, 10, 13, R.violet[2]); },
  i_summon: (P) => { for (let i = 0; i < 3; i++) P.ellipse(4 + i * 4, 9 - (i === 1 ? 2 : 0), 2.4, 3.2, R.violet, { glow: G.violet }); rays(P, 8, 8, 6, 8, 8, [200, 170, 255], G.violet); },
  i_charge: (P) => { P.ellipse(8, 8, 6.5, 6.5, R.red, { glow: G.red }); P.rect(7, 3, 2, 6, ramp('#fff0e0', 3), {}); P.rect(7, 11, 2, 2, ramp('#fff0e0', 3), {}); },
  i_sleep: (P) => { P.line(3, 4, 8, 4, [200, 200, 255]); P.line(8, 4, 3, 9, [200, 200, 255]); P.line(3, 9, 8, 9, [200, 200, 255]); },
  // statuses
  str: (P) => { P.limb(4, 13, 6, 5, 2.2, R.red); P.ellipse(7, 5, 3.5, 3, R.red); P.limb(6, 6, 12, 4, 1.8, R.red); },
  dex: (P) => { P.poly([[2, 13], [7, 3], [9, 3], [5, 13]], R.teal, {}); P.poly([[7, 13], [12, 3], [14, 3], [10, 13]], R.teal, {}); },
  weak: (P) => { blade(P, 3, 13, 12, 4, 1.2, ramp('#7a7a8a', 4), false); P.line(4, 4, 12, 12, R.violet[3]); },
  vuln: (P) => { shield(P, 8, 8, 6, 7, ramp('#8a7a6a', 4), ramp('#6a5a4a', 4)); P.line(6, 3, 9, 8, [30, 10, 10]); P.line(9, 8, 7, 13, [30, 10, 10]); },
  burn: (P) => flame(P, 8, 8, 0.62),
  radiance: (P) => { orb(P, 8, 8, 4, R.light, G.light); rays(P, 8, 8, 5, 7.5, 8, [255, 240, 180], G.light); },
  thorns: (P) => { P.ellipse(8, 8, 4, 4, R.green); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28; P.line(8 + Math.cos(a) * 4, 8 + Math.sin(a) * 4, 8 + Math.cos(a) * 7.5, 8 + Math.sin(a) * 7.5, [220, 210, 180]); } },
  bulwark: (P) => { P.rect(2, 5, 12, 10, ramp('#8a8a90', 4), {}); for (let i = 0; i < 3; i++) P.rect(2 + i * 5, 2, 3, 4, ramp('#8a8a90', 4), {}); },
  beacon: (P) => { P.poly([[5, 15], [11, 15], [10, 6], [6, 6]], ramp('#8a8a90', 4), {}); orb(P, 8, 4, 2.4, R.light, G.light); },
  burnsoul: (P) => { flame(P, 8, 9, 0.6); P.ellipse(8, 11, 2, 2, R.violet, { glow: G.violet }); },
  ashpact: (P) => { P.rect(3, 2, 10, 13, ramp('#d8c8a0', 4), {}); P.ellipse(8, 11, 2.5, 2.5, R.red, { glow: G.red }); },
  solar: (P) => { orb(P, 8, 8, 4, R.fire.slice(2), G.warm); rays(P, 8, 8, 5, 7.5, 8, [255, 200, 100], G.warm); },
  plated: (P) => { for (let i = 0; i < 3; i++) P.rect(2, 2 + i * 4.5, 12, 4, ramp('#9a8a7a', 4), {}); },
  ritual: (P) => { P.ellipse(8, 8, 6, 6, ramp('#5a1a2a', 4)); P.ellipse(8, 8, 2, 2, R.red, { glow: G.red }); },
  undying: (P) => { P.ellipse(8, 7, 5, 5, R.bone); P.px(6, 7, [20, 30, 60]); P.px(10, 7, [20, 30, 60]); P.glowDot(8, 7, 7, G.blue, 1); P.rect(6, 11, 4, 3, R.bone, {}); },
  regrowth: (P) => { P.limb(8, 15, 8, 6, 1, R.green); P.ellipse(5, 6, 3, 2, R.green); P.ellipse(11, 4, 3, 2, R.green); },
  stone: (P) => { P.ellipse(8, 9, 6.5, 6, ramp('#8a8a90', 5)); P.line(6, 5, 8, 10, [50, 50, 60]); P.line(8, 10, 11, 12, [50, 50, 60]); },
  // map nodes
  n_combat: (P) => { blade(P, 3, 13, 13, 3, 1.2); blade(P, 13, 13, 3, 3, 1.2); },
  n_elite: (P) => { P.ellipse(8, 8, 6, 6, R.bone); P.poly([[3, 5], [1, -1], [6, 3]], ramp('#c04030', 4), {}); P.poly([[13, 5], [15, -1], [10, 3]], ramp('#c04030', 4), {}); P.px(6, 8, [200, 30, 30]); P.px(10, 8, [200, 30, 30]); P.glowDot(8, 8, 5, G.red, 0.6); P.rect(6, 12, 4, 3, R.bone, {}); },
  n_rest: (P) => { P.limb(3, 14, 13, 11, 1.2, R.wood); P.limb(13, 14, 3, 11, 1.2, R.wood); flame(P, 8, 8, 0.55); },
  n_shop: (P) => { P.ellipse(8, 10, 6, 5.5, ramp('#a87a4a', 4)); P.rect(6, 2, 4, 4, ramp('#a87a4a', 4), {}); P.ellipse(8, 10, 2.4, 2.4, R.gold); },
  n_event: (P) => { P.ellipse(8, 5.5, 4.5, 4, R.light, { glow: G.light }); P.ellipse(8, 5.5, 2, 1.8, [[60, 40, 30], [80, 60, 40]]); P.rect(7, 8, 3, 3, R.light, { glow: G.light }); P.rect(7, 12, 3, 3, R.light, { glow: G.light }); },
  n_treasure: (P) => { P.rect(2, 6, 12, 8, ramp('#8a5a2a', 4), {}); P.ellipse(8, 6, 6, 3, ramp('#8a5a2a', 4)); P.rect(7, 6, 2, 3, R.gold, {}); P.line(2, 9, 14, 9, R.gold[2]); },
  n_boss: (P) => { P.rect(2, 8, 12, 6, R.gold, {}); for (let i = 0; i < 3; i++) P.poly([[2 + i * 5, 9], [4 + i * 5, 2], [6 + i * 5, 9]], R.gold, {}); P.ellipse(8, 11, 1.5, 1.5, R.violet, { glow: G.violet }); },
  // relics
  lantern: (P) => lantern(P, 8, 9, 0.8),
  flintstone: (P) => { P.ellipse(7, 9, 5, 5, R.ash); sparkle(P, 12, 4, [255, 200, 120]); },
  shard: (P) => { P.poly([[3, 3], [13, 2], [11, 9], [6, 14], [2, 9]], R.blue, {}); P.line(5, 5, 9, 4, [220, 240, 255]); },
  beads: (P) => { for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.28; P.ellipse(8 + Math.cos(a) * 5, 7 + Math.sin(a) * 5, 1.6, 1.6, i === 0 ? R.light : ramp('#8a5a3a', 3)); } P.line(8, 12, 8, 15, R.gold[2]); },
  whetstone: (P) => { P.poly([[1, 10], [10, 4], [15, 7], [6, 13]], ramp('#7a7a88', 4), {}); P.line(3, 10, 11, 5, [200, 200, 210]); },
  quill: (P) => { P.poly([[2, 14], [12, 2], [14, 4], [5, 13]], ramp('#d8dce8', 4), {}); P.line(3, 13, 13, 3, [150, 160, 180]); },
  oiljar: (P) => { P.ellipse(8, 10, 5, 5, ramp('#7a5a3a', 4)); P.rect(6, 2, 4, 4, ramp('#7a5a3a', 4), {}); P.ellipse(8, 10, 2, 2, R.fire.slice(2), { glow: G.warm }); },
  herb: (P) => { P.ellipse(8, 10, 5.5, 5, ramp('#a08a5a', 4)); P.limb(8, 6, 6, 1, 0.8, R.green); P.ellipse(10, 3, 2.5, 1.5, R.green); },
  moon: (P) => { P.ellipse(8, 8, 6, 6, ramp('#d8dcf0', 4), { glow: G.blue }); P.ellipse(11, 6, 5, 5, [[0, 0, 0]], { flat: true, alpha: 0 }); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x - 11) ** 2 + (y - 6) ** 2 < 22) { const i = (y * 16 + x) * 4; P.data[i + 3] = 0; P.glow[i + 3] = 0; P.glow[i] = P.glow[i + 1] = P.glow[i + 2] = 0; } },
  crown: (P) => { P.ellipse(8, 10, 6, 3, ramp('#5a7a3a', 4)); for (let i = 0; i < 6; i++) P.line(3 + i * 2, 9, 2 + i * 2.2, 3 + (i % 2) * 2, [220, 210, 180]); },
  hourglass: (P) => { P.poly([[3, 2], [13, 2], [8, 8]], ramp('#c8b8a0', 4), {}); P.poly([[8, 8], [13, 14], [3, 14]], ramp('#8a8088', 4), {}); P.rect(2, 1, 12, 1.5, R.gold, {}); P.rect(2, 14, 12, 1.5, R.gold, {}); P.px(8, 11, [255, 120, 60]); },
  aegis: (P) => shield(P, 8, 8, 6, 7, ramp('#d8e0f0', 4, { bright: 0.8 }), R.gold),
  drum: (P) => { P.ellipse(8, 10, 6, 4.5, ramp('#9a4a3a', 4)); P.ellipse(8, 7, 6, 2.5, ramp('#e8d8b8', 3)); P.line(2, 2, 7, 6, R.wood[2]); P.line(14, 2, 9, 6, R.wood[2]); },
  warmash: (P) => { P.ellipse(8, 11, 6, 4, R.ash); P.ellipse(8, 9, 2.5, 2, R.fire.slice(2), { glow: G.warm }); P.ellipse(5, 4, 2, 2, R.red); P.ellipse(10, 4, 2, 2, R.red); P.poly([[3, 5], [12, 5], [7.5, 9]], R.red, {}); },
  sunstone: (P) => { P.poly([[8, 1], [14, 8], [8, 15], [2, 8]], R.fire.slice(1), { glow: G.warm }); P.px(7, 6, [255, 255, 230]); },
  wick: (P) => { P.rect(6, 6, 4, 9, ramp('#e8dcc0', 3), {}); flame(P, 8, 4, 0.4, [hex('#3a5aa0'), hex('#5a8ad0'), hex('#9ac8ff'), hex('#e0f0ff'), hex('#ffffff')], G.blue); },
  emberheart: (P) => { P.ellipse(5.5, 7, 3.5, 3.5, R.fire.slice(0, 4)); P.ellipse(10.5, 7, 3.5, 3.5, R.fire.slice(0, 4)); P.poly([[2, 8], [14, 8], [8, 15]], R.fire.slice(0, 4), { glow: G.warm }); },
  dawn: (P) => { P.rect(3, 9, 10, 4, R.gold, {}); for (let i = 0; i < 3; i++) P.poly([[3 + i * 4, 10], [5 + i * 4, 4], [7 + i * 4, 10]], R.gold, {}); P.glowDot(8, 4, 6, G.light, 1); },
  // potion bottle (tinted at runtime)
  potion: (P) => { P.ellipse(8, 10, 5, 5, ramp('#e0e0f0', 4)); P.rect(6, 2, 4, 4, ramp('#e0e0f0', 4), {}); P.rect(5.5, 1, 5, 2, R.wood, {}); },
  potion_empty: (P) => { P.ellipse(8, 10, 5, 5, ramp('#4a4458', 4), { alpha: 120 }); P.rect(6, 2, 4, 4, ramp('#4a4458', 4), { alpha: 120 }); },
  // misc
  arrow: (P) => { P.poly([[1, 6], [10, 6], [10, 2], [15, 8], [10, 14], [10, 10], [1, 10]], R.light, {}); },
  skull: (P) => { P.ellipse(8, 7, 6, 6, R.bone); P.ellipse(5.5, 7, 1.6, 2, [[20, 10, 20], [30, 20, 30]]); P.ellipse(10.5, 7, 1.6, 2, [[20, 10, 20], [30, 20, 30]]); P.rect(5, 11, 6, 4, R.bone, {}); },
};

const urlCache = new Map();
// Render an icon or emblem to a data URL. glowMix adds the glow buffer on top for crisp UI use.
export function iconURL(name, { size = 16, tint = null, outline = true } = {}) {
  const key = name + size + (tint || '') + outline;
  if (urlCache.has(key)) return urlCache.get(key);
  const isEmblem = !!EMBLEMS[name];
  const fn = EMBLEMS[name] || ICONS[name] || ICONS.skull;
  const P = new Painter(size, size);
  const k = size / (isEmblem ? 32 : 16);
  if (k !== 1) {
    // draw at native res then upscale nearest
    const Q = new Painter(isEmblem ? 32 : 16, isEmblem ? 32 : 16);
    fn(Q);
    if (outline) Q.outline({ darken: 0.25 });
    copyScaled(Q, P, k);
  } else {
    fn(P);
    if (outline) P.outline({ darken: 0.25 });
  }
  if (tint) tintPainter(P, hex(tint));
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d');
  ctx.drawImage(P.toCanvas('color'), 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.45;
  ctx.drawImage(P.toCanvas('glow'), 0, 0);
  const url = c.toDataURL();
  urlCache.set(key, url);
  return url;
}

function copyScaled(src, dst, k) {
  for (let y = 0; y < dst.h; y++) for (let x = 0; x < dst.w; x++) {
    const sx = Math.floor(x / k), sy = Math.floor(y / k);
    const si = (sy * src.w + sx) * 4, di = (y * dst.w + x) * 4;
    for (let c = 0; c < 4; c++) { dst.data[di + c] = src.data[si + c]; dst.glow[di + c] = src.glow[si + c]; }
  }
}

function tintPainter(P, t) {
  for (let i = 0; i < P.data.length; i += 4) {
    if (!P.data[i + 3]) continue;
    const l = (P.data[i] * 0.3 + P.data[i + 1] * 0.59 + P.data[i + 2] * 0.11) / 255;
    // keep cork/wood (dark & warm) untouched-ish
    const m = mix(t, [255, 255, 255], Math.max(0, l - 0.75) * 2);
    const d = mix([20, 14, 30], m, Math.min(1, l * 1.25));
    P.data[i] = d[0]; P.data[i + 1] = d[1]; P.data[i + 2] = d[2];
  }
}

// Card art: a small vignette scene behind the emblem, coloured by card type.
const ART_BG = {
  attack: ['#4a1a1e', '#8a3a2a', '#d0703a'],
  skill: ['#122a3a', '#1f5a6a', '#5ab0b0'],
  power: ['#2a1a3a', '#5a3a6a', '#d0a050'],
  status: ['#1e1e24', '#3a3a44', '#7a7a88'],
  curse: ['#14081e', '#3a1a4a', '#8a4ab0'],
};
export function cardArtURL(art, type) {
  const key = 'art:' + art + type;
  if (urlCache.has(key)) return urlCache.get(key);
  const W = 64, H = 44;
  const P = new Painter(W, H);
  const [a, b, c] = ART_BG[type].map(hex);
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - W / 2) / W, (y - H * 0.45) / H) * 2;
    let v = 1 - d;
    v += ((BAY[(y & 3) * 4 + (x & 3)] / 16) - 0.5) * 0.18;
    const col = v > 0.62 ? c : v > 0.28 ? b : a;
    P.px(x, y, col);
  }
  // subtle background motif
  for (let i = 0; i < 18; i++) {
    const x = (i * 37) % W, y = (i * 23) % H;
    P.px(x, y, mix(c, [255, 255, 255], 0.4), 120);
  }
  const E = new Painter(32, 32);
  (EMBLEMS[art] || EMBLEMS.sword)(E);
  E.outline({ darken: 0.2 });
  const ox = Math.floor((W - 32) / 2), oy = Math.floor((H - 32) / 2) + 1;
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const i = (y * 32 + x) * 4;
    if (E.data[i + 3] > 127) P.px(ox + x, oy + y, [E.data[i], E.data[i + 1], E.data[i + 2]]);
    if (E.glow[i + 3]) P.glowPx(ox + x, oy + y, [E.glow[i], E.glow[i + 1], E.glow[i + 2]]);
  }
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.drawImage(P.toCanvas('color'), 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5;
  ctx.drawImage(P.toCanvas('glow'), 0, 0);
  const url = cv.toDataURL();
  urlCache.set(key, url);
  return url;
}

// 9-slice pixel frame for panels / buttons, returned as a data URL for CSS border-image.
export function frameURL({ fill = '#1c1826', edge = '#c9a65a', inner = '#3a3046', shadow = '#0a0810', light = '#f0d898' } = {}) {
  const key = 'frame' + fill + edge + inner;
  if (urlCache.has(key)) return urlCache.get(key);
  const S = 24;
  const c = document.createElement('canvas');
  c.width = S; c.height = S;
  const ctx = c.getContext('2d');
  const px = (x, y, col) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
  ctx.fillStyle = fill; ctx.fillRect(2, 2, S - 4, S - 4);
  for (let i = 2; i < S - 2; i++) { px(i, 0, shadow); px(i, S - 1, shadow); px(0, i, shadow); px(S - 1, i, shadow); }
  for (let i = 2; i < S - 2; i++) { px(i, 1, edge); px(i, S - 2, edge); px(1, i, edge); px(S - 2, i, edge); }
  for (let i = 3; i < S - 3; i++) { px(i, 2, inner); px(2, i, inner); }
  for (let i = 3; i < S - 3; i++) { px(i, 1, light); }
  px(1, 1, shadow); px(S - 2, 1, shadow); px(1, S - 2, shadow); px(S - 2, S - 2, shadow);
  // corner rivets
  for (const [x, y] of [[3, 3], [S - 4, 3], [3, S - 4], [S - 4, S - 4]]) px(x, y, light);
  const url = c.toDataURL();
  urlCache.set(key, url);
  return url;
}
