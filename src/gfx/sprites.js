// Character & prop sprites, painted procedurally with the shared Painter so the whole cast
// keeps one pixel density, palette logic and outline style.
import { Painter, ramp, hex, mix } from './pixel.js';

// ------------------------------------------------------------------ palette (shared)
export const PAL = {
  skin: ramp('#e8b48e', 5),
  cloak: ramp('#2f5d6e', 5, { dark: 0.7 }),
  cloakIn: ramp('#5b2f45', 4),
  scarf: ramp('#d8553a', 5),
  leather: ramp('#8a5a3a', 5),
  steel: ramp('#a9b4c4', 5, { bright: 0.7 }),
  gold: ramp('#d7a640', 5, { bright: 0.65 }),
  boot: ramp('#4a3328', 4),
  cloth: ramp('#c9b48a', 5),
  dark: ramp('#2b2238', 4),
  ember: [hex('#ffdd88'), hex('#ffb347'), hex('#ff7a2a')],
};
const G = {
  warm: hex('#ffc46b'),
  hot: hex('#ffe9b0'),
  violet: hex('#b98aff'),
  blue: hex('#8fd6ff'),
  red: hex('#ff5a3a'),
  green: hex('#b6ff8a'),
};

const deg = (a) => (a * Math.PI) / 180;
const rot = (x, y, a) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];

// ------------------------------------------------------------------ player: the Lantern Keeper
function drawSword(P, hx, hy, ang, len = 20, smear = false) {
  const [dx, dy] = rot(1, 0, ang);
  const [nx, ny] = [-dy, dx];
  // blade
  for (let i = 3; i < len; i++) {
    const x = hx + dx * i, y = hy + dy * i;
    P.px(x, y, PAL.steel[3]);
    P.px(x + nx * 0.8, y + ny * 0.8, PAL.steel[4]);
    P.px(x - nx * 0.8, y - ny * 0.8, PAL.steel[1]);
  }
  P.px(hx + dx * len, hy + dy * len, PAL.steel[4]);
  // guard + grip
  for (let k = -2.5; k <= 2.5; k += 0.5) P.px(hx + dx * 3 + nx * k, hy + dy * 3 + ny * k, PAL.gold[k < 0 ? 3 : 1]);
  for (let i = -1; i < 3; i++) P.px(hx + dx * i, hy + dy * i, PAL.leather[1]);
  P.px(hx - dx * 2, hy - dy * 2, PAL.gold[3]);
  if (smear) {
    // crisp motion arc behind the blade
    for (let a = -1.5; a < -0.05; a += 0.02) {
      const [sx, sy] = rot(1, 0, ang + a);
      const t = (a + 1.5) / 1.45;
      const r0 = len * (0.75 - t * 0.2);
      for (let r = r0; r < len + 2; r += 0.7) {
        const c = mix(G.blue, G.hot, t);
        P.px(hx + sx * r, hy + sy * r, mix(c, [255, 255, 255], 0.3), 120 + t * 110);
        P.glowPx(hx + sx * r, hy + sy * r, c, 100 + t * 155);
      }
    }
  }
}

function drawLantern(P, x, y, intensity = 1) {
  // handle
  P.line(x - 2, y - 5, x, y - 7, PAL.gold[1]);
  P.line(x, y - 7, x + 2, y - 5, PAL.gold[1]);
  // cage
  P.rect(x - 3, y - 4, 6, 1, PAL.gold, {});
  P.rect(x - 3, y + 4, 6, 1, PAL.gold, {});
  P.ellipse(x, y, 2.6, 3.6, [hex('#ffd27a'), hex('#ffe9a8'), hex('#fff6dc')], { glow: G.warm });
  P.px(x - 3, y - 2, PAL.gold[2]); P.px(x - 3, y, PAL.gold[2]); P.px(x - 3, y + 2, PAL.gold[2]);
  P.px(x + 3, y - 2, PAL.gold[3]); P.px(x + 3, y, PAL.gold[3]); P.px(x + 3, y + 2, PAL.gold[3]);
  P.px(x, y + 5, PAL.gold[1]);
  P.glowDot(x, y, 7 * intensity, G.warm, 0.9 * intensity);
}

export function drawPlayer(P, pose = {}) {
  const { bob = 0, lean = 0, sword = 'low', lanternUp = 0, wave = 0, hurt = 0, step = 0 } = pose;
  const ox = 6 + lean;
  const top = 10 + bob;
  // ---- cloak (behind)
  const cw = wave;
  P.poly([
    [ox + 14, top + 12], [ox + 22, top + 11], [ox + 24, top + 26], [ox + 22, top + 41],
    [ox + 12 - cw, top + 43], [ox + 6 - cw * 1.5, top + 41], [ox + 8 - cw, top + 30],
  ], PAL.cloak, { bias: -0.05 });
  // inner cloak lining
  P.poly([[ox + 9 - cw, top + 32], [ox + 12 - cw, top + 42], [ox + 7 - cw * 1.5, top + 41]], PAL.cloakIn, {});
  // ---- legs
  const legY = top + 30;
  P.limb(ox + 17, legY, ox + 15 - step, top + 42, 2.6, PAL.dark);
  P.limb(ox + 21, legY, ox + 23 + step, top + 42, 2.6, PAL.dark, { bias: 0.08 });
  P.ellipse(ox + 14 - step, top + 43, 3.5, 2, PAL.boot);
  P.ellipse(ox + 24 + step, top + 43, 3.5, 2, PAL.boot, { bias: 0.1 });
  // ---- back arm + lantern
  const lx = ox + 10 - lanternUp * 2, ly = top + 27 - lanternUp * 16;
  P.limb(ox + 15, top + 15, lx + 1, ly - 7, 2, PAL.cloak);
  drawLantern(P, lx, ly, 1 + lanternUp * 0.8);
  // ---- torso
  P.ellipse(ox + 19, top + 22, 6.5, 9, PAL.cloak);
  P.poly([[ox + 15, top + 15], [ox + 24, top + 15], [ox + 24, top + 26], [ox + 19, top + 28], [ox + 15, top + 26]], PAL.leather, { bias: 0.05 });
  P.poly([[ox + 17, top + 26], [ox + 22, top + 26], [ox + 21, top + 33], [ox + 18, top + 33]], PAL.cloth, { bias: -0.05 });
  P.rect(ox + 14, top + 26, 11, 2, ramp('#3a2a22', 4), {});
  P.px(ox + 20, top + 27, PAL.gold[4]); P.px(ox + 21, top + 27, PAL.gold[3]);
  P.line(ox + 19, top + 17, ox + 22, top + 21, PAL.leather[4]);
  // shoulder plate
  P.ellipse(ox + 22, top + 15, 4, 3, PAL.steel);
  // ---- scarf
  P.ellipse(ox + 19, top + 12, 5.5, 2.6, PAL.scarf);
  P.poly([[ox + 14, top + 11], [ox + 16, top + 13], [ox + 9 - cw * 2, top + 18 + cw], [ox + 7 - cw * 2, top + 15 + cw]], PAL.scarf, { bias: -0.1 });
  // ---- head (hood + face)
  P.ellipse(ox + 19, top + 5, 6.5, 6.5, PAL.cloak, { bias: 0.05 });
  P.poly([[ox + 13, top + 4], [ox + 10, top + 9], [ox + 15, top + 9]], PAL.cloak, {});
  P.ellipse(ox + 21.5, top + 6.5, 3.6, 3.9, PAL.skin, { bias: 0.1 });
  // hair fringe
  P.poly([[ox + 18, top + 2], [ox + 25, top + 3], [ox + 24, top + 5], [ox + 19, top + 4.5]], ramp('#5a3a2a', 4), {});
  // eye
  if (hurt) { P.px(ox + 23, top + 6, PAL.dark[0]); P.px(ox + 22, top + 6, PAL.dark[0]); }
  else { P.px(ox + 23, top + 6, PAL.dark[0]); P.px(ox + 23, top + 7, PAL.dark[1]); }
  // ---- front arm + sword
  let hx, hy, ang, smear = false;
  if (sword === 'low') { hx = ox + 26; hy = top + 23; ang = deg(28); }
  else if (sword === 'raise') { hx = ox + 18; hy = top + 9; ang = deg(-150); }
  else if (sword === 'slash') { hx = ox + 30; hy = top + 18; ang = deg(-8); smear = true; }
  else if (sword === 'guard') { hx = ox + 26; hy = top + 18; ang = deg(-80); }
  else { hx = ox + 25; hy = top + 25; ang = deg(60); }
  P.limb(ox + 22, top + 15, hx, hy, 2, PAL.cloak, { bias: 0.1 });
  P.ellipse(hx, hy, 1.8, 1.8, PAL.leather);
  drawSword(P, hx, hy, ang, 19, smear);
}

// ------------------------------------------------------------------ enemies
function eye(P, x, y, c, r = 1.2) {
  P.px(x, y, mix(c, [255, 255, 255], 0.5));
  P.glowDot(x, y, r * 3.5, c, 1);
  P.glowPx(x, y, c);
}

export function drawMossguard(P, { bob = 0, squash = 0, open = 0 } = {}) {
  const cx = 24, base = 46;
  const sq = squash;
  // stubby legs
  P.ellipse(cx - 7, base - 2, 4, 3, ramp('#c9b490', 4));
  P.ellipse(cx + 7, base - 2, 4, 3, ramp('#c9b490', 4), { bias: 0.1 });
  // stalk body
  P.ellipse(cx, base - 12 + bob, 10 + sq, 11 - sq, ramp('#e4d2a6', 5));
  // face
  eye(P, cx - 4, base - 13 + bob, G.warm);
  eye(P, cx + 4, base - 13 + bob, G.warm);
  if (open) P.ellipse(cx, base - 8 + bob, 2.5, 1.6 + open, [[60, 30, 30], [90, 40, 40]], { flat: false });
  // arms
  P.limb(cx - 9, base - 12 + bob, cx - 14, base - 6 + bob, 2.2, ramp('#d8c49a', 4));
  P.limb(cx + 9, base - 12 + bob, cx + 14, base - 6 + bob, 2.2, ramp('#d8c49a', 4), { bias: 0.1 });
  // cap
  const capY = base - 25 + bob * 1.5 + sq;
  P.ellipse(cx, capY, 21 + sq, 11 - sq * 0.5, ramp('#7a3b3b', 5, { bright: 0.45 }), { clip: (x, y) => y < capY + 5 });
  P.ellipse(cx, capY + 4, 19, 3, ramp('#c9a87a', 4), { clip: (x, y) => y >= capY + 4 });
  // spots + moss
  for (const [sx, sy, r] of [[-10, -4, 2.5], [-2, -7, 2], [7, -5, 3], [13, -1, 1.8], [-14, 1, 1.6]]) P.ellipse(cx + sx, capY + sy, r, r * 0.8, ramp('#efe0c0', 3));
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI;
    const x = cx - Math.cos(a) * 19, y = capY - Math.sin(a) * 9 + 1;
    if (i % 2) P.px(x, y - 1, ramp('#6f9a4a', 4)[2 + (i % 3 === 0 ? 1 : 0)]);
  }
  for (let i = 0; i < 9; i++) P.glowDot(cx - 15 + i * 4, capY - 6 + (i % 3), 1.5, G.green, 0.4);
}

export function drawWolf(P, { bob = 0, lunge = 0, open = 0, tail = 0 } = {}) {
  const fur = ramp('#8a8794', 5, { shadow: '#1b1830' });
  const furDark = ramp('#5a5568', 4);
  const by = 24 + bob;
  const bx = 34 - lunge;
  // tail (right side, wolf faces left)
  P.limb(bx + 15, by - 2, bx + 24, by - 9 - tail, 3, furDark);
  P.limb(bx + 22, by - 8 - tail, bx + 26, by - 13 - tail, 2, fur);
  // back legs
  P.limb(bx + 9, by + 4, bx + 13, by + 14, 2.6, furDark);
  P.limb(bx + 13, by + 4, bx + 17 + lunge * 0.3, by + 14, 2.6, fur);
  // body
  P.ellipse(bx + 4, by, 16, 8.5, fur);
  // mane / ash flecks
  P.ellipse(bx - 6, by - 3, 8, 8, ramp('#a7a3ae', 5));
  for (let i = 0; i < 8; i++) P.px(bx - 10 + i * 3, by - 9 + (i % 2), fur[4]);
  // front legs
  P.limb(bx - 6, by + 4, bx - 9 - lunge * 0.5, by + 14, 2.6, furDark);
  P.limb(bx - 2, by + 4, bx - 3 - lunge * 0.4, by + 14, 2.6, fur, { bias: 0.1 });
  // head
  const hx = bx - 15 - lunge * 0.5, hy = by - 6 + bob * 0.5;
  P.ellipse(hx, hy, 7, 6, fur, { bias: 0.05 });
  P.poly([[hx - 4, hy - 1], [hx - 13, hy + 1], [hx - 13, hy + 3 + open], [hx - 4, hy + 4 + open]], fur, { bias: 0.1 });
  P.px(hx - 13, hy + 1, PAL.dark[0]);
  if (open) { P.line(hx - 12, hy + 3, hx - 5, hy + 3 + open, [120, 30, 40]); P.px(hx - 11, hy + 4, [240, 240, 230]); }
  // ears
  P.poly([[hx - 1, hy - 5], [hx + 1, hy - 12], [hx + 4, hy - 4]], furDark, {});
  P.poly([[hx + 2, hy - 5], [hx + 5, hy - 11], [hx + 6, hy - 3]], fur, {});
  eye(P, hx - 4, hy - 1, G.red, 1);
  // ember glow in fur
  P.glowDot(bx + 2, by - 4, 3, G.warm, 0.35);
}

export function drawBat(P, { flap = 0, bob = 0 } = {}) {
  const body = ramp('#4a3a66', 5, { shadow: '#120c22' });
  const wing = ramp('#3a2c55', 4, { shadow: '#0e0a1c' });
  const cx = 18, cy = 14 + bob;
  const up = flap; // -1..1
  // wings
  P.poly([[cx - 3, cy - 2], [cx - 16, cy - 8 - up * 7], [cx - 17, cy + 1 - up * 3], [cx - 12, cy + 0], [cx - 9, cy + 4], [cx - 4, cy + 3]], wing, {});
  P.poly([[cx + 3, cy - 2], [cx + 16, cy - 8 - up * 7], [cx + 17, cy + 1 - up * 3], [cx + 12, cy + 0], [cx + 9, cy + 4], [cx + 4, cy + 3]], wing, { bias: 0.1 });
  // body
  P.ellipse(cx, cy, 5, 6, body);
  P.poly([[cx - 4, cy - 4], [cx - 3, cy - 10], [cx - 1, cy - 5]], body, {});
  P.poly([[cx + 1, cy - 5], [cx + 3, cy - 10], [cx + 4, cy - 4]], body, {});
  eye(P, cx - 2, cy - 1, hex('#ff4a6a'), 0.9);
  eye(P, cx + 2, cy - 1, hex('#ff4a6a'), 0.9);
  P.px(cx - 1, cy + 3, [240, 230, 230]); P.px(cx + 1, cy + 3, [240, 230, 230]);
}

export function drawSlime(P, { squash = 0, bob = 0 } = {}) {
  const goo = ramp('#6d7f3a', 5, { shadow: '#1d2410', bright: 0.6 });
  const cx = 26, base = 40;
  const w = 20 + squash * 3, h = 15 - squash * 3;
  P.ellipse(cx, base - h + 1, w, h, goo, { clip: (x, y) => y < base });
  P.ellipse(cx, base - 1, w + 1, 2.2, ramp('#4d5a28', 4));
  // debris inside
  P.ellipse(cx - 8, base - 9, 2.5, 1.8, ramp('#8a6a4a', 3));
  P.ellipse(cx + 9, base - 6, 1.8, 1.4, ramp('#a3a3a3', 3));
  P.limb(cx + 3, base - 4, cx + 9, base - 3, 1, ramp('#e4dccb', 3));
  // bubbles
  for (const [x, y] of [[-12, -16], [6, -20], [13, -12], [-3, -22]]) { P.ellipse(cx + x, base + y + bob, 1.6, 1.6, ramp('#c7d98a', 3)); }
  // face
  eye(P, cx - 6, base - h * 0.9, G.warm, 1.1);
  eye(P, cx + 5, base - h * 0.9, G.warm, 1.1);
  P.ellipse(cx, base - h * 0.55, 4 + squash, 1.6, [[40, 30, 20], [60, 40, 25]]);
  // shine
  P.ellipse(cx - 10, base - h * 1.4, 3, 1.5, ramp('#e6f2b8', 3));
}

export function drawArmor(P, { bob = 0, raise = 0, lean = 0 } = {}) {
  const rust = ramp('#8c6a5a', 5, { shadow: '#1f1420', bright: 0.45 });
  const iron = ramp('#6b7286', 5, { shadow: '#151525' });
  const cx = 24 + lean, top = 8 + bob;
  // legs
  P.limb(cx - 5, top + 38, cx - 7, top + 54, 3.5, iron);
  P.limb(cx + 5, top + 38, cx + 6, top + 54, 3.5, iron, { bias: 0.1 });
  P.ellipse(cx - 8, top + 55, 4.5, 2.2, rust);
  P.ellipse(cx + 7, top + 55, 4.5, 2.2, rust, { bias: 0.1 });
  // tabard
  P.poly([[cx - 7, top + 28], [cx + 7, top + 28], [cx + 9, top + 46], [cx - 9, top + 46]], ramp('#5a2b2b', 4), {});
  // torso
  P.ellipse(cx, top + 24, 11, 11, iron);
  P.rect(cx - 9, top + 30, 18, 3, rust, {});
  for (let i = -8; i <= 8; i += 4) P.px(cx + i, top + 31, PAL.gold[3]);
  // pauldrons
  P.ellipse(cx - 11, top + 16, 6, 5, rust);
  P.ellipse(cx + 11, top + 16, 6, 5, rust, { bias: 0.1 });
  // helmet
  P.ellipse(cx, top + 8, 7, 8, iron, { bias: 0.05 });
  P.rect(cx - 6, top + 7, 12, 2, [[20, 10, 20], [30, 15, 25]], { bevel: false });
  for (let x = -4; x <= 4; x += 2) eye(P, cx + x, top + 8, hex('#ff8a3a'), 0.6);
  P.limb(cx, top - 1, cx - 6, top - 6, 1.2, ramp('#b03a3a', 3));
  // greatsword (held in left side, facing left)
  const sa = deg(-100 - raise * 60);
  const hx = cx - 13, hy = top + 28 - raise * 10;
  P.limb(cx - 11, top + 18, hx, hy, 3, iron);
  const [dx, dy] = rot(1, 0, sa);
  for (let i = 2; i < 30; i++) {
    P.px(hx + dx * i, hy + dy * i, rust[3]); P.px(hx + dx * i + 1, hy + dy * i, rust[2]); P.px(hx + dx * i - 1, hy + dy * i, rust[4]);
  }
  P.rect(hx - 4, hy - 1, 8, 2, PAL.gold, {});
  P.limb(cx + 11, top + 18, cx + 12, top + 32, 3, iron, { bias: 0.1 });
}

export function drawBriar(P, { bob = 0, sway = 0, lash = 0 } = {}) {
  const vine = ramp('#3d5a3a', 5, { shadow: '#0f1a14' });
  const bark = ramp('#5a4a3a', 4);
  const cx = 24, base = 58;
  // roots
  for (const [dx, l] of [[-10, 8], [-4, 6], [5, 7], [11, 8]]) P.limb(cx + dx * 0.4, base - 6, cx + dx, base, 1.6, bark);
  // twisted trunk
  for (let i = 0; i < 30; i++) {
    const t = i / 30;
    const x = cx + Math.sin(t * 5 + sway) * 3 * (1 - t);
    P.ellipse(x, base - 4 - i, 5.5 - t * 1.5, 1.2, vine);
  }
  // arms of vines
  P.limb(cx - 2, base - 26, cx - 14 - lash * 6, base - 34 + sway, 2, vine);
  P.limb(cx - 14 - lash * 6, base - 34 + sway, cx - 20 - lash * 10, base - 28, 1.5, vine);
  P.limb(cx + 2, base - 28, cx + 13, base - 36 - sway, 2, vine, { bias: 0.1 });
  // thorns
  for (const [x, y] of [[-4, -14], [4, -20], [-5, -24], [3, -10], [-12, -33], [10, -35], [-18, -30]]) {
    P.poly([[cx + x, base + y], [cx + x + (x < 0 ? -3 : 3), base + y - 2], [cx + x, base + y - 2]], ramp('#d8d0b0', 3), {});
  }
  // flower head
  const fy = base - 40 + bob;
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + sway * 0.2;
    P.ellipse(cx + Math.cos(a) * 6, fy + Math.sin(a) * 5, 5, 4, ramp('#c45a7a', 5));
  }
  P.ellipse(cx, fy, 4.5, 4.5, ramp('#ffd38a', 4), { glow: hex('#ffb05a') });
  eye(P, cx - 2, fy, hex('#ff3a5a'), 0.8);
  eye(P, cx + 2, fy, hex('#ff3a5a'), 0.8);
}

export function drawAcolyte(P, { bob = 0, cast = 0 } = {}) {
  const robe = ramp('#7a7480', 5, { shadow: '#1a1426' });
  const ash = ramp('#bdb4a8', 4);
  const cx = 18, top = 6 + bob;
  // robe
  P.poly([[cx - 5, top + 12], [cx + 5, top + 12], [cx + 11, top + 48], [cx - 11, top + 48]], robe, {});
  P.poly([[cx - 11, top + 46], [cx + 11, top + 46], [cx + 12, top + 49], [cx - 12, top + 49]], ramp('#4a4450', 3), {});
  // sash
  P.rect(cx - 6, top + 24, 12, 2, ramp('#a33a3a', 4), {});
  // hood
  P.ellipse(cx, top + 8, 7, 8, robe, { bias: 0.05 });
  P.ellipse(cx - 1, top + 9, 4, 5, ramp('#e2dccf', 4)); // mask
  P.px(cx - 3, top + 8, PAL.dark[0]); P.px(cx + 1, top + 8, PAL.dark[0]);
  P.line(cx - 1, top + 11, cx - 1, top + 13, hex('#a33a3a'));
  // staff
  const sx = cx - 10 - cast * 2, sy = top + 4 - cast * 6;
  P.line(sx, sy, sx + 2, top + 48, PAL.leather[1]);
  P.line(sx + 1, sy, sx + 3, top + 48, PAL.leather[3]);
  P.ellipse(sx + 1, sy - 2, 3, 3, [hex('#ff9a3a'), hex('#ffd27a'), hex('#fff0c8')], { glow: G.warm });
  P.glowDot(sx + 1, sy - 2, 7 + cast * 4, G.warm, 0.8 + cast * 0.2);
  P.limb(cx - 4, top + 16, sx + 2, sy + 12, 2, robe);
  P.limb(cx + 4, top + 16, cx + 6, top + 28, 2, robe, { bias: 0.1 });
  for (let i = 0; i < 5; i++) P.px(cx - 8 + i * 4, top + 47, ash[3]);
}

export function drawBoneKnight(P, { bob = 0, raise = 0, lean = 0 } = {}) {
  const bone = ramp('#d8d2bf', 5, { shadow: '#2a2436', bright: 0.4 });
  const armor = ramp('#3e4a66', 5, { shadow: '#0c0f1e' });
  const cape = ramp('#5a2440', 4, { shadow: '#140814' });
  const cx = 32 + lean, top = 6 + bob;
  // tattered cape
  P.poly([[cx - 4, top + 18], [cx + 10, top + 18], [cx + 18, top + 62], [cx + 14, top + 58], [cx + 10, top + 66], [cx + 5, top + 60], [cx, top + 66], [cx - 6, top + 58]], cape, {});
  // legs (bones + greaves)
  P.limb(cx - 4, top + 44, cx - 8, top + 66, 2.2, bone);
  P.limb(cx + 6, top + 44, cx + 8, top + 66, 2.2, bone, { bias: 0.1 });
  P.ellipse(cx - 8, top + 60, 3.5, 5, armor);
  P.ellipse(cx + 8, top + 60, 3.5, 5, armor, { bias: 0.1 });
  P.ellipse(cx - 9, top + 67, 4.5, 2, armor);
  P.ellipse(cx + 9, top + 67, 4.5, 2, armor);
  // pelvis + ribs
  P.ellipse(cx + 1, top + 42, 7, 4, bone);
  P.ellipse(cx, top + 28, 11, 13, armor);
  for (let i = 0; i < 4; i++) P.line(cx - 6, top + 22 + i * 4, cx + 6, top + 22 + i * 4, bone[2 + (i % 2)]);
  P.rect(cx - 1, top + 18, 2, 22, bone, {});
  // pauldrons with spikes
  P.ellipse(cx - 12, top + 18, 7, 5, armor);
  P.ellipse(cx + 12, top + 18, 7, 5, armor, { bias: 0.1 });
  P.poly([[cx - 16, top + 15], [cx - 20, top + 8], [cx - 13, top + 14]], bone, {});
  P.poly([[cx + 13, top + 14], [cx + 20, top + 8], [cx + 16, top + 15]], bone, {});
  // skull + horned helm
  P.ellipse(cx, top + 9, 7, 7.5, bone);
  P.poly([[cx - 6, top + 4], [cx - 13, top - 4], [cx - 7, top + 2]], ramp('#9a8f7a', 4), {});
  P.poly([[cx + 6, top + 4], [cx + 13, top - 4], [cx + 7, top + 2]], ramp('#9a8f7a', 4), {});
  P.rect(cx - 7, top + 3, 14, 3, armor, {});
  P.ellipse(cx - 3, top + 9, 2, 2, [[10, 10, 20], [20, 20, 30]]);
  P.ellipse(cx + 3, top + 9, 2, 2, [[10, 10, 20], [20, 20, 30]]);
  eye(P, cx - 3, top + 9, G.blue, 1.4);
  eye(P, cx + 3, top + 9, G.blue, 1.4);
  for (let i = -4; i <= 4; i += 2) P.px(cx + i, top + 14, bone[1]);
  // shield (right side = back)
  P.ellipse(cx + 17, top + 32, 7, 11, armor, { bias: 0.1 });
  P.ellipse(cx + 17, top + 32, 4, 7, ramp('#7a2a3a', 4));
  P.px(cx + 17, top + 32, PAL.gold[4]);
  // sword (facing left)
  const hx = cx - 15, hy = top + 30 - raise * 18;
  P.limb(cx - 12, top + 20, hx, hy, 2, bone);
  const ang = deg(-95 - raise * 70);
  const [dx, dy] = rot(1, 0, ang);
  for (let i = 2; i < 30; i++) {
    P.px(hx + dx * i, hy + dy * i, PAL.steel[3]);
    P.px(hx + dx * i + 1, hy + dy * i, PAL.steel[1]);
    P.px(hx + dx * i - 1, hy + dy * i, PAL.steel[4]);
    if (i % 6 === 0) P.glowPx(hx + dx * i, hy + dy * i, G.blue, 120);
  }
  P.rect(hx - 4, hy - 1, 8, 2, PAL.gold, {});
}

export function drawCandelabra(P, { bob = 0, flicker = 0, sway = 0 } = {}) {
  const brass = ramp('#b08a3a', 5, { shadow: '#24140c', bright: 0.6 });
  const wax = ramp('#e8dcc0', 4);
  const cx = 28, base = 78;
  // base
  P.ellipse(cx, base - 3, 14, 4, brass);
  P.ellipse(cx, base - 8, 8, 4, brass);
  // stem
  P.rect(cx - 2.5, base - 46 + bob, 5, 38, brass, {});
  P.ellipse(cx, base - 26 + bob, 5, 3, brass);
  // face bulb
  const fy = base - 46 + bob;
  P.ellipse(cx, fy, 10, 8, brass);
  eye(P, cx - 4, fy - 1, hex('#ff6a2a'), 1.4);
  eye(P, cx + 4, fy - 1, hex('#ff6a2a'), 1.4);
  P.poly([[cx - 5, fy + 3], [cx + 5, fy + 3], [cx + 3, fy + 6], [cx - 3, fy + 6]], [[40, 15, 10], [70, 25, 15]], {});
  P.glowDot(cx, fy + 4, 4, hex('#ff6a2a'), 0.6);
  // arms
  const armY = fy - 8;
  for (const s of [-1, 1]) {
    P.limb(cx, armY + 6, cx + s * 18, armY + 2 + sway * s, 2, brass);
    P.limb(cx + s * 18, armY + 2 + sway * s, cx + s * 20, armY - 6 + sway * s, 2, brass);
  }
  P.limb(cx, armY + 6, cx, armY - 6, 2, brass);
  // candles + flames
  const tips = [[cx - 20, armY - 8 + sway * -1], [cx, armY - 8], [cx + 20, armY - 8 + sway]];
  for (const [x, y] of tips) {
    P.ellipse(x, y + 2, 3.5, 1.5, brass);
    P.rect(x - 2, y - 8, 4, 9, wax, {});
    P.px(x - 2, y - 3, wax[3]); P.px(x + 1, y - 1, wax[1]);
    const fh = 5 + flicker * 1.5;
    P.ellipse(x, y - 11, 2.2, fh * 0.6, [hex('#ff7a2a'), hex('#ffc46b'), hex('#fff3c4')], { glow: G.warm });
    P.glowDot(x, y - 11, 9, G.warm, 1);
  }
  // dripping wax
  for (const [x, y] of [[-14, 0], [12, 2], [-3, -10]]) P.limb(cx + x, armY + y, cx + x, armY + y + 4, 0.9, wax);
}

export function drawFlame(P, { flicker = 0, bob = 0 } = {}) {
  const cx = 12, cy = 18 + bob;
  const fl = [hex('#ff5a1a'), hex('#ff8a2a'), hex('#ffc04a'), hex('#ffe9a0'), hex('#fffbe8')];
  P.poly([[cx - 7, cy + 4], [cx - 5 + flicker, cy - 9], [cx - 1, cy - 4], [cx + 1 - flicker, cy - 15], [cx + 4, cy - 6], [cx + 6 + flicker, cy - 10], [cx + 7, cy + 4], [cx, cy + 9]], fl, { glow: G.warm, normal: (x, y) => [0, (y - cy) / 20, 0.8] });
  P.ellipse(cx, cy + 2, 4.5, 5, [hex('#ffd27a'), hex('#fff3c4'), hex('#ffffff')], { glow: G.hot });
  P.px(cx - 2, cy + 1, PAL.dark[0]); P.px(cx + 2, cy + 1, PAL.dark[0]);
  P.px(cx - 1, cy + 4, PAL.dark[1]); P.px(cx, cy + 4, PAL.dark[1]); P.px(cx + 1, cy + 4, PAL.dark[1]);
  P.glowDot(cx, cy, 12, G.warm, 1);
}

export function drawGargoyle(P, { bob = 0, wing = 0, lunge = 0, stone = 0 } = {}) {
  const st = ramp(stone ? '#8a8a90' : '#7a7f86', 5, { shadow: '#161826', bright: 0.45 });
  const st2 = ramp('#5a5e6a', 4, { shadow: '#0e1018' });
  const cx = 34 - lunge, cy = 34 + bob;
  // wings
  P.poly([[cx + 2, cy - 10], [cx + 28, cy - 26 - wing * 6], [cx + 30, cy - 10 - wing * 3], [cx + 24, cy - 6], [cx + 20, cy + 2], [cx + 6, cy]], st2, {});
  P.poly([[cx - 2, cy - 12], [cx + 16, cy - 30 - wing * 6], [cx + 18, cy - 16], [cx + 8, cy - 4]], st2, { bias: 0.1 });
  for (let i = 0; i < 4; i++) P.line(cx + 6 + i * 5, cy - 6 - i * 2, cx + 14 + i * 4, cy - 22 - wing * 4, st2[0]);
  // legs crouched
  P.limb(cx + 4, cy + 10, cx + 10, cy + 24, 4, st);
  P.limb(cx - 6, cy + 10, cx - 12, cy + 24, 4, st);
  P.ellipse(cx - 13, cy + 26, 5, 2, st2);
  P.ellipse(cx + 11, cy + 26, 5, 2, st2);
  // body
  P.ellipse(cx, cy + 2, 13, 13, st);
  for (let i = 0; i < 5; i++) P.line(cx - 6, cy - 2 + i * 3, cx + 2, cy - 1 + i * 3, st[1]);
  // arms with claws
  P.limb(cx - 10, cy - 4, cx - 18 - lunge, cy + 10, 3.2, st);
  for (let k = 0; k < 3; k++) P.line(cx - 19 - lunge, cy + 11, cx - 22 - lunge + k, cy + 15, st[4]);
  // head
  const hx = cx - 9, hy = cy - 14;
  P.ellipse(hx, hy, 8, 7, st, { bias: 0.05 });
  P.poly([[hx - 4, hy - 4], [hx - 10, hy - 14], [hx - 1, hy - 6]], st2, {});
  P.poly([[hx + 3, hy - 5], [hx + 6, hy - 15], [hx + 7, hy - 4]], st2, {});
  P.poly([[hx - 6, hy + 2], [hx - 12, hy + 4], [hx - 6, hy + 6]], st, {});
  eye(P, hx - 4, hy - 1, stone ? hex('#9ad8ff') : hex('#ffd04a'), 1.2);
  eye(P, hx + 1, hy - 1, stone ? hex('#9ad8ff') : hex('#ffd04a'), 1.2);
  // cracks
  P.line(cx + 4, cy - 6, cx + 8, cy + 4, st[0]);
  P.line(hx + 2, hy + 2, hx + 5, hy + 5, st[0]);
}

export function drawBoss(P, { bob = 0, phase = 1, reach = 0, flare = 0 } = {}) {
  const robe = ramp(phase === 2 ? '#4a1a2a' : '#2a2444', 5, { shadow: '#05030c', bright: 0.35 });
  const robeIn = ramp('#0c0814', 3);
  const bone = ramp('#d8cfb8', 5, { shadow: '#1a1426' });
  const crown = ramp('#c9a03a', 5, { shadow: '#2a1408', bright: 0.6 });
  const fire = phase === 2 ? [hex('#a01010'), hex('#ff3a2a'), hex('#ff8a5a'), hex('#ffd0b0'), hex('#fff6ee')] : [hex('#3a1a9a'), hex('#7a4aff'), hex('#b08aff'), hex('#e0d0ff'), hex('#fbf8ff')];
  const glow = phase === 2 ? hex('#ff3a2a') : hex('#9a6aff');
  const cx = 68, top = 12 + bob;
  // trailing smoke tendrils behind
  for (let i = 0; i < 7; i++) {
    const x = cx - 46 + i * 15, y0 = top + 96;
    for (let t = 0; t < 18; t++) P.px(x + Math.sin(t * 0.5 + i + bob) * 2, y0 + t, robe[t < 6 ? 1 : 0], 255 - t * 12);
  }
  // robe body: shoulders wide, flaring tattered hem
  const hem = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const x = cx + 44 - i * (88 / N);
    const y = top + 104 + (i % 2 ? -12 : 0) + Math.sin(i * 1.9 + bob * 0.7) * 3;
    hem.push([x, y]);
  }
  P.poly([[cx - 22, top + 30], [cx + 22, top + 30], [cx + 30, top + 58], [cx + 44, top + 100], ...hem, [cx - 44, top + 100], [cx - 30, top + 58]], robe, { bias: -0.05 });
  // mantle with spikes
  P.ellipse(cx, top + 34, 34, 11, robe, { bias: 0.05 });
  for (const s of [-1, 1]) {
    P.poly([[cx + s * 24, top + 30], [cx + s * 40, top + 18], [cx + s * 34, top + 34]], ramp('#3a3448', 4), {});
    P.poly([[cx + s * 14, top + 27], [cx + s * 24, top + 14], [cx + s * 22, top + 30]], ramp('#3a3448', 4), {});
  }
  // inner darkness + lantern cage chest
  P.ellipse(cx, top + 64, 19, 25, robeIn, {});
  const ly = top + 64;
  for (let i = -3; i <= 3; i++) P.line(cx + i * 5, ly - 19, cx + i * 6.2, ly + 21, crown[1 + (i & 1)]);
  P.ellipse(cx, ly - 20, 17, 3, crown);
  P.ellipse(cx, ly + 22, 19, 3.5, crown);
  P.rect(cx - 2, ly - 28, 4, 7, crown, {});
  // flame inside cage
  const fh = 15 + flare * 3;
  P.poly([[cx - 10, ly + 10], [cx - 9, ly - 4], [cx - 4, ly + 1], [cx - 3, ly - fh], [cx + 2, ly - 5], [cx + 6, ly - fh * 0.8], [cx + 10, ly - 2], [cx + 10, ly + 10], [cx, ly + 16]], fire, { glow, normal: (x, y) => [0, (y - ly) / 26, 0.8] });
  P.ellipse(cx, ly + 6, 5, 6, fire.slice(2), { glow: [255, 240, 255] });
  P.glowDot(cx, ly, 30 + flare * 10, glow, 1);
  // bars drawn again in front of the flame
  for (let i = -3; i <= 3; i += 2) P.line(cx + i * 5, ly - 19, cx + i * 6.2, ly + 21, crown[1]);
  // arms
  for (const s of [-1, 1]) {
    const sx = cx + s * 30, sy = top + 36;
    const lift = s < 0 ? reach : reach * 0.3;
    const ex = cx + s * (42 + lift * 14), ey = top + 66 - lift * 26;
    P.limb(sx, sy, ex, ey, 6, robe);
    P.limb(ex, ey, ex + s * 4, ey + 10, 3.5, robe);
    const hx = ex + s * 4, hy = ey + 12;
    P.ellipse(hx, hy, 4, 3.5, bone);
    for (let k = -1; k <= 1; k++) P.limb(hx, hy + 2, hx + s * (3 + k * 3), hy + 13 - Math.abs(k) * 2, 1.2, bone);
  }
  // hood + skull face
  P.ellipse(cx, top + 18, 17, 17, robe, { bias: 0.08 });
  P.poly([[cx - 16, top + 14], [cx, top - 4], [cx + 16, top + 14]], robe, {});
  P.ellipse(cx, top + 22, 10, 11, robeIn);
  P.ellipse(cx, top + 22, 6.5, 8, bone, { bias: 0.15 });
  P.ellipse(cx - 2.6, top + 21, 2.2, 2.6, [[5, 5, 10], [10, 8, 15]]);
  P.ellipse(cx + 2.6, top + 21, 2.2, 2.6, [[5, 5, 10], [10, 8, 15]]);
  eye(P, cx - 2.6, top + 21, glow, 2.2);
  eye(P, cx + 2.6, top + 21, glow, 2.2);
  P.px(cx, top + 24, bone[0]);
  for (let i = -3; i <= 3; i += 2) { P.px(cx + i, top + 27, bone[1]); P.px(cx + i + 1, top + 27, bone[3]); }
  // crown of thorns & candles
  const ct = top + 2;
  P.ellipse(cx, ct + 8, 14, 3, crown);
  for (let i = 0; i < 7; i++) {
    const x = cx - 13 + i * 4.3;
    const h = i === 3 ? 13 : i % 2 ? 7 : 10;
    P.poly([[x - 1.8, ct + 8], [x + 0.4, ct + 8 - h], [x + 2.6, ct + 8]], crown, {});
  }
  for (const x of [-9, 0, 9]) { P.ellipse(cx + x, ct + 7, 1.6, 1.6, fire.slice(2)); P.glowDot(cx + x, ct + 6, 3.5, glow, 0.8); }
  if (phase === 2) {
    P.line(cx - 4, ct + 4, cx - 1, ct + 9, crown[0]);
    P.line(cx + 6, ct + 3, cx + 4, ct + 9, crown[0]);
    for (let i = 0; i < 22; i++) P.glowDot(cx - 44 + ((i * 37) % 88), top + 40 + ((i * 53) % 64), 2.2, glow, 0.7);
  }
}

export function drawWisp(P, { bob = 0, flicker = 0 } = {}) {
  const cx = 10, cy = 13 + bob;
  const fl = [hex('#3a2a8a'), hex('#6a5aff'), hex('#a9a0ff'), hex('#e6e2ff')];
  P.poly([[cx - 6, cy + 2], [cx - 3 + flicker, cy - 10], [cx, cy - 5], [cx + 3 - flicker, cy - 12], [cx + 6, cy + 2], [cx + 2, cy + 8], [cx - 2, cy + 9]], fl, { glow: hex('#8a7aff'), normal: (x, y) => [0, (y - cy) / 20, 0.8] });
  P.ellipse(cx, cy + 1, 3.6, 4.2, [hex('#c6c0ff'), hex('#eeeaff'), hex('#ffffff')], { glow: hex('#b0a8ff') });
  P.px(cx - 1, cy, PAL.dark[0]); P.px(cx + 2, cy, PAL.dark[0]);
  P.glowDot(cx, cy, 10, hex('#8a7aff'), 0.9);
}

// ------------------------------------------------------------------ props / scenery
export function drawTree(P, { seed = 1, hue = '#3e5a3a', tall = 1 } = {}) {
  const w = P.w, h = P.h;
  const bark = ramp('#4a3a30', 5, { shadow: '#120c10' });
  const leaf = ramp(hue, 5, { shadow: '#0c1612', bright: 0.45 });
  const cx = w / 2;
  let s = seed * 9301;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  // trunk
  for (let y = h * 0.35; y < h; y++) {
    const t = (y - h * 0.35) / (h * 0.65);
    const ww = 5 + t * t * 7;
    for (let x = -ww; x <= ww; x++) {
      const nx = x / ww;
      P.px(cx + x + Math.sin(y * 0.05) * 2, y, P.shade(bark, nx, 0, Math.sqrt(1 - nx * nx), cx + x, y));
    }
  }
  // roots
  P.limb(cx - 6, h - 6, cx - 16, h - 1, 2.5, bark);
  P.limb(cx + 6, h - 6, cx + 15, h - 1, 2.5, bark);
  // branches
  P.limb(cx, h * 0.45, cx - 20, h * 0.3, 2.5, bark);
  P.limb(cx, h * 0.5, cx + 22, h * 0.33, 2.5, bark);
  // canopy clusters
  const clusters = [];
  for (let i = 0; i < 14; i++) {
    const a = rnd() * Math.PI * 2, r = rnd();
    clusters.push([cx + Math.cos(a) * r * w * 0.36, h * 0.24 * tall + Math.sin(a) * r * h * 0.16, w * (0.12 + rnd() * 0.1)]);
  }
  clusters.sort((a, b) => a[1] - b[1]);
  for (const [x, y, r] of clusters) P.ellipse(x, y, r, r * 0.8, leaf, { bias: -0.05 });
  // light leaves speckle
  for (let i = 0; i < 120; i++) {
    const x = cx + (rnd() - 0.5) * w * 0.8, y = h * 0.1 + rnd() * h * 0.32;
    if (P.get(x, y) && P.get(x, y - 1) === null) P.px(x, y, leaf[4]);
  }
}

export function drawPine(P, { hue = '#2d4a44' } = {}) {
  const leaf = ramp(hue, 5, { shadow: '#08100e', bright: 0.4 });
  const bark = ramp('#3a2e28', 4);
  const cx = P.w / 2, h = P.h;
  P.rect(cx - 2, h * 0.75, 4, h * 0.25, bark, {});
  for (let i = 0; i < 6; i++) {
    const y = h * 0.08 + i * h * 0.12;
    const ww = 6 + i * (P.w * 0.07);
    P.poly([[cx, y - h * 0.05], [cx + ww, y + h * 0.13], [cx - ww, y + h * 0.13]], leaf, {});
  }
}

export function drawFern(P, { hue = '#4a7a3a', seed = 1 } = {}) {
  const leaf = ramp(hue, 4, { shadow: '#0c1a10' });
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = deg(-160 + (i / (n - 1)) * 140 + (rnd() - 0.5) * 10);
    const len = P.h * (0.6 + rnd() * 0.4);
    const x0 = P.w / 2, y0 = P.h - 1;
    let px = x0, py = y0;
    for (let t = 0; t < len; t++) {
      const bend = t / len;
      const x = x0 + Math.cos(a) * t, y = y0 + Math.sin(a) * t + bend * bend * len * 0.5;
      P.px(x, y, leaf[1 + (t % 3 === 0 ? 1 : 0)]);
      if (t % 2 === 0 && t > 2) { P.px(x, y - 1, leaf[2]); P.px(x + 1, y + 1, leaf[3]); }
      px = x; py = y;
    }
  }
}

export function drawGrass(P, { hue = '#5a8a3a', seed = 3 } = {}) {
  const leaf = ramp(hue, 4, { shadow: '#0e1a0a' });
  let s = seed;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 18; i++) {
    const x = rnd() * P.w, h = P.h * (0.4 + rnd() * 0.6), lean = (rnd() - 0.5) * 6;
    for (let t = 0; t < h; t++) P.px(x + (lean * t) / h, P.h - 1 - t, leaf[Math.min(3, Math.floor((t / h) * 4))]);
  }
}

export function drawRock(P, { hue = '#6a6a72' } = {}) {
  const st = ramp(hue, 5, { shadow: '#14141e' });
  P.ellipse(P.w * 0.45, P.h * 0.6, P.w * 0.42, P.h * 0.42, st, { clip: (x, y) => y < P.h - 1 });
  P.ellipse(P.w * 0.72, P.h * 0.72, P.w * 0.22, P.h * 0.26, st, { bias: 0.05, clip: (x, y) => y < P.h - 1 });
  const moss = ramp('#5a7a3a', 4);
  for (let x = 2; x < P.w - 2; x++) { const y = 0; const top = [...Array(P.h).keys()].find((yy) => P.get(x, yy)); if (top !== undefined && x % 3) P.px(x, top, moss[2 + (x % 2)]); }
}

export function drawCampfire(P, { flicker = 0 } = {}) {
  const cx = P.w / 2, base = P.h - 4;
  const wood = ramp('#6a4430', 4);
  P.limb(cx - 10, base, cx + 8, base - 4, 2.2, wood);
  P.limb(cx + 10, base, cx - 8, base - 4, 2.2, wood, { bias: 0.1 });
  for (let i = 0; i < 7; i++) P.ellipse(cx - 12 + i * 4, base + 1, 2.4, 1.6, ramp('#6a6a72', 3));
  const fl = [hex('#ff4a1a'), hex('#ff8a2a'), hex('#ffc04a'), hex('#fff0b0')];
  P.poly([[cx - 7, base - 2], [cx - 5 + flicker, base - 12], [cx - 2, base - 8], [cx, base - 20 - flicker * 2], [cx + 3, base - 9], [cx + 6 - flicker, base - 14], [cx + 7, base - 2]], fl, { glow: G.warm, normal: (x, y) => [0, (y - base + 10) / 14, 0.8] });
  P.ellipse(cx, base - 5, 3, 4, [hex('#fff3c4'), hex('#ffffff')], { glow: G.hot });
  P.glowDot(cx, base - 8, 16, G.warm, 1);
}

export function drawChest(P, { open = 0 } = {}) {
  const wood = ramp('#7a4a2a', 5);
  const cx = P.w / 2, base = P.h - 2;
  P.rect(cx - 12, base - 12, 24, 12, wood, {});
  for (const x of [-12, -1, 10]) P.rect(cx + x, base - 12, 2, 12, PAL.gold, {});
  if (open) {
    P.poly([[cx - 12, base - 12], [cx + 12, base - 12], [cx + 12, base - 20], [cx - 12, base - 22]], wood, {});
    P.ellipse(cx, base - 12, 10, 3, [hex('#ffd27a'), hex('#fff3c4')], { glow: G.warm });
    P.glowDot(cx, base - 14, 14, G.warm, 1);
  } else {
    P.ellipse(cx, base - 13, 12, 6, wood, { clip: (x, y) => y <= base - 12 });
    P.rect(cx - 2, base - 13, 4, 4, PAL.gold, {});
  }
}

export function drawShrine(P) {
  const st = ramp('#7a7a6e', 5, { shadow: '#14141a' });
  const moss = ramp('#5a7a3a', 4);
  const cx = P.w / 2, base = P.h - 1;
  P.rect(cx - 12, base - 6, 24, 6, st, {});
  P.rect(cx - 8, base - 26, 16, 20, st, {});
  P.poly([[cx - 14, base - 26], [cx, base - 36], [cx + 14, base - 26]], ramp('#5a4038', 4), {});
  P.rect(cx - 4, base - 22, 8, 10, [[20, 14, 20], [30, 20, 28]], { bevel: false });
  P.ellipse(cx, base - 17, 2, 3, [hex('#ffb04a'), hex('#fff0c0')], { glow: G.warm });
  P.glowDot(cx, base - 17, 9, G.warm, 0.9);
  for (let x = -12; x < 12; x += 2) P.px(cx + x, base - 6, moss[2 + (x % 4 === 0 ? 1 : 0)]);
  for (let x = -14; x < 14; x += 3) P.px(cx + x, base - 26 - (14 - Math.abs(x)) * 0.7, moss[3]);
}

export function drawMerchant(P, { bob = 0 } = {}) {
  const cloak = ramp('#5a4a7a', 5);
  const pack = ramp('#8a6a40', 5);
  const cx = 22, top = 10 + bob;
  // huge backpack
  P.ellipse(cx + 8, top + 22, 12, 15, pack);
  for (const [x, y, c] of [[2, 10, '#c9a040'], [14, 14, '#7aa0c0'], [6, 30, '#c05a5a']]) P.ellipse(cx + x, top + y, 3, 3, ramp(c, 3));
  P.line(cx - 2, top + 8, cx + 16, top + 6, PAL.leather[1]);
  // lantern hanging from pack
  drawLantern(P, cx + 20, top + 12, 0.8);
  // body
  P.poly([[cx - 6, top + 14], [cx + 4, top + 14], [cx + 8, top + 44], [cx - 10, top + 44]], cloak, {});
  P.ellipse(cx - 2, top + 9, 6, 6.5, cloak, { bias: 0.05 });
  P.ellipse(cx - 4, top + 10, 3.5, 3.5, PAL.skin);
  P.px(cx - 6, top + 9, PAL.dark[0]);
  P.ellipse(cx - 5, top + 13, 3, 1.6, ramp('#d8d0c0', 3)); // beard
  P.limb(cx - 4, top + 18, cx - 12, top + 26, 2, cloak);
  P.ellipse(cx - 12, top + 26, 2, 2, PAL.skin);
  P.ellipse(cx - 6, top + 45, 4, 1.8, PAL.boot);
  P.ellipse(cx + 4, top + 45, 4, 1.8, PAL.boot);
}

export function drawSpring(P) {
  const cx = P.w / 2, cy = P.h / 2 + 2;
  const st = ramp('#6a6a72', 4);
  P.ellipse(cx, cy, P.w * 0.48, P.h * 0.42, st);
  P.ellipse(cx, cy, P.w * 0.42, P.h * 0.32, [hex('#1a3a5a'), hex('#2a5a8a'), hex('#5aa0d0'), hex('#a0e0ff')], { glow: hex('#4a8ac0') });
  for (let i = 0; i < 6; i++) P.glowDot(cx - 20 + i * 8, cy - 2 + (i % 2) * 3, 3, hex('#c0f0ff'), 0.8);
}

export function drawAshPile(P) {
  const ash = ramp('#7a7068', 5, { shadow: '#1a1418' });
  const cx = P.w / 2, base = P.h - 1;
  P.ellipse(cx, base - 6, P.w * 0.45, 8, ash, { clip: (x, y) => y < base });
  P.ellipse(cx + 4, base - 11, P.w * 0.25, 7, ash, { clip: (x, y) => y < base });
  for (let i = 0; i < 9; i++) { const x = cx - 14 + i * 3.5, y = base - 4 - (i % 3) * 3; P.px(x, y, hex('#ff7a2a')); P.glowDot(x, y, 3, hex('#ff6a2a'), 0.8); }
  P.limb(cx - 10, base - 10, cx - 4, base - 18, 1.5, ramp('#3a2a28', 3));
}

export function drawForgeGhost(P, { bob = 0 } = {}) {
  const iron = ramp('#4a4a56', 5);
  const ghost = [hex('#3a6a8a'), hex('#5aa0c0'), hex('#a0e0f0'), hex('#e0fbff')];
  const cx = P.w / 2, base = P.h - 1;
  // anvil
  P.rect(cx - 2, base - 10, 14, 4, iron, {});
  P.rect(cx + 2, base - 6, 6, 6, iron, {});
  P.poly([[cx - 6, base - 10], [cx - 2, base - 10], [cx - 2, base - 7]], iron, {});
  // ghost smith (semi-transparent)
  const gx = cx - 10, gy = base - 34 + bob;
  P.ellipse(gx, gy + 14, 7, 12, ghost, { alpha: 170, glow: hex('#4a90b0') });
  P.ellipse(gx, gy, 5, 5, ghost, { alpha: 200, glow: hex('#4a90b0') });
  P.px(gx + 1, gy, PAL.dark[0]); P.px(gx + 3, gy, PAL.dark[0]);
  P.limb(gx + 4, gy + 8, gx + 12, gy + 14, 2, ghost);
  P.line(gx + 12, gy + 14, gx + 14, gy + 4, iron[3]);
  P.rect(gx + 11, gy + 1, 6, 4, iron, {});
  P.glowDot(cx + 6, base - 11, 6, hex('#8ad8ff'), 0.8);
}

export function drawSignpost(P) {
  const wood = ramp('#7a5a3a', 4);
  const cx = P.w / 2, base = P.h - 1;
  P.rect(cx - 1.5, base - 36, 3, 36, wood, {});
  P.poly([[cx - 12, base - 34], [cx + 8, base - 34], [cx + 11, base - 31], [cx + 8, base - 28], [cx - 12, base - 28]], wood, {});
  P.poly([[cx + 12, base - 24], [cx - 8, base - 24], [cx - 11, base - 21], [cx - 8, base - 18], [cx + 12, base - 18]], wood, { bias: 0.05 });
}

export function drawBard(P, { bob = 0 } = {}) {
  const coat = ramp('#3a6a5a', 5);
  const cx = 18, top = 14 + bob;
  P.ellipse(cx, top + 22, 8, 10, coat);
  P.ellipse(cx, top + 8, 5, 5.5, PAL.skin);
  P.poly([[cx - 8, top + 5], [cx + 8, top + 5], [cx + 3, top - 2], [cx - 5, top + 0]], ramp('#7a3a4a', 4), {});
  P.limb(cx + 9, top + 3, cx + 14, top - 2, 1, ramp('#e8e0d0', 3));
  P.px(cx + 2, top + 8, PAL.dark[0]);
  P.ellipse(cx + 6, top + 22, 5, 6, ramp('#b07a40', 4));
  P.line(cx + 6, top + 16, cx + 14, top + 8, PAL.leather[2]);
  P.ellipse(cx - 2, top + 32, 9, 3, coat);
}

// ------------------------------------------------------------------ sprite registry & frames
// Each entry: size (px), feet anchor, frames by animation name.
export const SPRITE_DEFS = {
  player: { w: 56, h: 60, draw: drawPlayer, anims: {
    idle: [{ bob: 0, wave: 0 }, { bob: 0, wave: 1 }, { bob: 1, wave: 2 }, { bob: 1, wave: 1 }],
    windup: [{ bob: 0, lean: -2, sword: 'raise', wave: 2 }],
    slash: [{ bob: 0, lean: 3, sword: 'slash', wave: 3, step: 2 }],
    hit: [{ bob: 1, lean: -3, sword: 'down', hurt: 1, wave: 3 }],
    cast: [{ bob: -1, lanternUp: 1, sword: 'low', wave: 2 }],
    guard: [{ bob: 1, sword: 'guard', wave: 1 }],
  } },
  mossguard: { w: 52, h: 50, draw: drawMossguard, anims: {
    idle: [{ bob: 0 }, { bob: 0.5, squash: 0.5 }, { bob: 1, squash: 1 }, { bob: 0.5, squash: 0.5 }],
    attack: [{ bob: -1, squash: -1.5, open: 1 }], hit: [{ bob: 1, squash: 1.5 }],
  } },
  wolf: { w: 68, h: 44, draw: drawWolf, anims: {
    idle: [{ bob: 0, tail: 0 }, { bob: 0.5, tail: 1 }, { bob: 1, tail: 2 }, { bob: 0.5, tail: 1 }],
    attack: [{ bob: 0, lunge: 5, open: 2 }], hit: [{ bob: 1, lunge: -3, open: 1 }],
  } },
  bat: { w: 38, h: 30, draw: drawBat, anims: {
    idle: [{ flap: 1 }, { flap: 0.2, bob: 1 }, { flap: -0.8, bob: 2 }, { flap: 0.2, bob: 1 }],
    attack: [{ flap: 1, bob: -1 }], hit: [{ flap: -1, bob: 1 }],
  } },
  slime: { w: 56, h: 44, draw: drawSlime, anims: {
    idle: [{ squash: 0 }, { squash: 0.5, bob: 1 }, { squash: 1, bob: 2 }, { squash: 0.5, bob: 1 }],
    attack: [{ squash: -1.5 }], hit: [{ squash: 1.8 }],
  } },
  armor: { w: 56, h: 68, draw: drawArmor, anims: {
    idle: [{ bob: 0 }, { bob: 0 }, { bob: 1 }, { bob: 1 }],
    attack: [{ raise: 1, lean: -2 }], hit: [{ bob: 1, lean: 2 }],
  } },
  briar: { w: 52, h: 62, draw: drawBriar, anims: {
    idle: [{ sway: 0 }, { sway: 0.6, bob: 0.5 }, { sway: 1.2, bob: 1 }, { sway: 0.6, bob: 0.5 }],
    attack: [{ lash: 1, sway: -1 }], hit: [{ sway: 2, bob: 1 }],
  } },
  acolyte: { w: 40, h: 58, draw: drawAcolyte, anims: {
    idle: [{ bob: 0 }, { bob: 0.5 }, { bob: 1 }, { bob: 0.5 }],
    attack: [{ cast: 1 }], hit: [{ bob: 2 }],
  } },
  boneknight: { w: 72, h: 78, draw: drawBoneKnight, anims: {
    idle: [{ bob: 0 }, { bob: 0.5 }, { bob: 1 }, { bob: 0.5 }],
    attack: [{ raise: 1, lean: -2 }], hit: [{ bob: 1, lean: 3 }],
  } },
  candelabra: { w: 60, h: 82, draw: drawCandelabra, anims: {
    idle: [{ flicker: 0 }, { flicker: 1, sway: 0.5 }, { flicker: 0.4, sway: 1, bob: 1 }, { flicker: 1, sway: 0.5 }],
    attack: [{ flicker: 2, sway: -1.5, bob: -1 }], hit: [{ flicker: 0, sway: 2, bob: 1 }],
  } },
  flame: { w: 26, h: 32, draw: drawFlame, anims: {
    idle: [{ flicker: 0 }, { flicker: 1, bob: 1 }, { flicker: -1, bob: 2 }, { flicker: 0.5, bob: 1 }],
    attack: [{ flicker: 2, bob: -1 }], hit: [{ flicker: -2, bob: 2 }],
  } },
  gargoyle: { w: 72, h: 64, draw: drawGargoyle, anims: {
    idle: [{ wing: 0 }, { wing: 0.5, bob: 0.5 }, { wing: 1, bob: 1 }, { wing: 0.5, bob: 0.5 }],
    attack: [{ wing: 1.5, lunge: 4 }], hit: [{ wing: -0.5, bob: 1 }],
    stone: [{ stone: 1 }],
  } },
  boss: { w: 140, h: 136, draw: drawBoss, anims: {
    idle: [{ bob: 0 }, { bob: 1 }, { bob: 2 }, { bob: 1 }],
    attack: [{ bob: 0, reach: 1, flare: 1 }], hit: [{ bob: 2, flare: -0.5 }],
    idle2: [{ bob: 0, phase: 2 }, { bob: 1, phase: 2 }, { bob: 2, phase: 2 }, { bob: 1, phase: 2 }],
    attack2: [{ bob: 0, reach: 1, flare: 1.5, phase: 2 }], hit2: [{ bob: 2, phase: 2 }],
  } },
  wisp: { w: 22, h: 26, draw: drawWisp, anims: {
    idle: [{ flicker: 0 }, { flicker: 1, bob: 1 }, { flicker: -1, bob: 2 }, { flicker: 0.5, bob: 1 }],
    attack: [{ flicker: 2 }], hit: [{ flicker: -2, bob: 2 }],
  } },
  // props
  campfire: { w: 40, h: 36, draw: drawCampfire, anims: { idle: [{ flicker: 0 }, { flicker: 1 }, { flicker: -1 }, { flicker: 0.5 }] } },
  chest: { w: 36, h: 30, draw: drawChest, anims: { idle: [{ open: 0 }], open: [{ open: 1 }] } },
  shrine: { w: 36, h: 40, draw: drawShrine, anims: { idle: [{}] } },
  merchant: { w: 48, h: 58, draw: drawMerchant, anims: { idle: [{ bob: 0 }, { bob: 0 }, { bob: 1 }, { bob: 1 }] } },
  spring: { w: 72, h: 26, draw: drawSpring, anims: { idle: [{}] } },
  ashpile: { w: 44, h: 26, draw: drawAshPile, anims: { idle: [{}] } },
  forge: { w: 52, h: 50, draw: drawForgeGhost, anims: { idle: [{ bob: 0 }, { bob: 1 }, { bob: 2 }, { bob: 1 }] } },
  signpost: { w: 28, h: 40, draw: drawSignpost, anims: { idle: [{}] } },
  bard: { w: 40, h: 50, draw: drawBard, anims: { idle: [{ bob: 0 }, { bob: 1 }] } },
};

// Paint every frame of a sprite. Returns { frames: [{anim, i, painter}], order: {anim: [indices]} }
export function paintSprite(id) {
  const d = SPRITE_DEFS[id];
  const frames = [];
  const order = {};
  for (const [anim, poses] of Object.entries(d.anims)) {
    order[anim] = [];
    for (const pose of poses) {
      const P = new Painter(d.w, d.h);
      d.draw(P, pose);
      P.rim({ strength: 0.35 });
      P.outline({ darken: 0.32 });
      order[anim].push(frames.length);
      frames.push({ anim, painter: P });
    }
  }
  return { frames, order, w: d.w, h: d.h };
}
