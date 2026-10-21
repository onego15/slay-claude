// Transient 3D effects: slashes, impacts, elemental bursts, shields, shockwaves, beams.
import * as THREE from 'three';
import { tween, ease, addTicker } from './clock.js';
import { makeCanvas } from './pixel.js';

const texCache = {};
function canvasTex(key, w, h, draw) {
  if (texCache[key]) return texCache[key];
  const c = makeCanvas(w, h);
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache[key] = t;
  return t;
}
const arcTex = () => canvasTex('arc', 256, 128, (g, w, h) => {
  // crescent with pixel-stepped edge
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = Math.floor(x / 2) * 2, py = Math.floor(y / 2) * 2;
    const dx = (px - w / 2) / (w / 2), dy = (py - h) / h;
    const r = Math.hypot(dx, dy * 1.0);
    const r2 = Math.hypot(dx, (py - h * 1.18) / h);
    let a = 0;
    if (r < 0.95 && r2 > 0.92) a = Math.min(1, (0.95 - r) * 8) * Math.pow(Math.max(0, 1 - Math.abs(dx)), 0.6);
    const i = (y * w + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
});
const ringTex = () => canvasTex('ring', 128, 128, (g, w) => {
  const img = g.createImageData(w, w);
  for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) {
    const r = Math.hypot(x - w / 2, y - w / 2) / (w / 2);
    const a = Math.max(0, 1 - Math.abs(r - 0.85) * 9);
    const i = (y * w + x) * 4;
    img.data[i] = 255; img.data[i + 1] = 255; img.data[i + 2] = 255; img.data[i + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
});
const glowTex = () => canvasTex('glow', 64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const rayTex = () => canvasTex('ray', 64, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const v = g.createLinearGradient(0, 0, 0, h);
  v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.2, 'rgba(0,0,0,0)'); v.addColorStop(0.8, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, w, h);
});
const hexTex = () => canvasTex('hex', 128, 128, (g, w) => {
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
  const R = 10;
  for (let row = -1; row < 9; row++) for (let col = -1; col < 8; col++) {
    const cx = col * R * 1.75 + (row % 2) * R * 0.87, cy = row * R * 1.5;
    g.beginPath();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 6; g.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); }
    g.closePath(); g.stroke();
  }
  const m = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  m.addColorStop(0, 'rgba(0,0,0,0.2)'); m.addColorStop(0.75, 'rgba(0,0,0,0)'); m.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = m; g.fillRect(0, 0, w, w);
});

function addMesh(world, geo, tex, color, { opacity = 1, blending = THREE.AdditiveBlending, depthTest = true } = {}) {
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(color), transparent: true, opacity, blending, depthWrite: false, depthTest, side: THREE.DoubleSide, fog: false }));
  world.scene.add(m);
  return m;
}
function kill(world, m) { world.scene.remove(m); m.geometry.dispose(); m.material.dispose(); }

export const COLORS = {
  normal: new THREE.Color(1.6, 1.7, 2.2),
  fire: new THREE.Color(2.6, 1.0, 0.3),
  light: new THREE.Color(2.4, 2.1, 1.1),
  dark: new THREE.Color(1.3, 0.5, 2.4),
  heal: new THREE.Color(0.6, 2.2, 0.8),
  block: new THREE.Color(0.7, 1.4, 2.6),
  red: new THREE.Color(2.4, 0.4, 0.3),
};

export function slash(world, pos, { color = COLORS.normal, size = 2.2, angle = -0.5, flip = false, dur = 220 } = {}) {
  const m = addMesh(world, new THREE.PlaneGeometry(size, size * 0.5), arcTex(), color);
  m.position.copy(pos);
  m.position.z += 0.4;
  m.rotation.z = angle;
  if (flip) m.scale.x = -1;
  tween(dur, (t) => {
    m.material.opacity = 1 - t;
    const s = 0.7 + t * 0.6;
    m.scale.set((flip ? -1 : 1) * s, s * (1 - t * 0.5), 1);
  }, { easing: ease.outQuad }).then(() => kill(world, m));
}

export function sparks(world, pos, { n = 18, color = [1, 0.85, 0.5], speed = 5, up = 2, gravity = -9, size = 7, life = 0.5, spread = 1, dirX = 0 } = {}) {
  world.fxParticles.burst(pos, n, () => {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.8);
    return {
      vx: Math.cos(a) * v * spread + dirX * speed * 0.6, vy: Math.sin(a) * v * 0.7 + up, vz: (Math.random() - 0.5) * v * 0.5,
      ay: gravity, drag: 2.5, life: life * (0.6 + Math.random() * 0.8), size: size * (0.6 + Math.random() * 0.8), size1: 1,
      r: color[0], g: color[1], b: color[2], a: 1, shape: Math.random() < 0.6 ? 1 : 0, fadeIn: 0.01,
    };
  });
}

export function embers(world, pos, { n = 24, color = [1, 0.55, 0.15], spread = 0.8, height = 1.6, life = 1.2, size = 6 } = {}) {
  world.fxParticles.burst(pos, n, () => ({
    x: (Math.random() - 0.5) * spread, y: Math.random() * height, z: (Math.random() - 0.5) * 0.3,
    vx: (Math.random() - 0.5) * 0.6, vy: 0.6 + Math.random() * 1.2, life: life * (0.5 + Math.random()), size: size * (0.6 + Math.random() * 0.7), size1: 1,
    r: color[0], g: color[1], b: color[2], a: 1, shape: 1, wobble: 1.2, wobbleF: 4, fadeIn: 0.05,
  }));
}

export function flare(world, pos, { color = COLORS.light, size = 3, dur = 300 } = {}) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.position.copy(pos);
  world.scene.add(s);
  tween(dur, (t) => { const k = size * (0.5 + t); s.scale.set(k, k, 1); s.material.opacity = 1 - t; }, { easing: ease.outCubic }).then(() => { world.scene.remove(s); s.material.dispose(); });
}

export function shockwave(world, pos, { color = COLORS.normal, size = 4, dur = 450 } = {}) {
  const m = addMesh(world, new THREE.PlaneGeometry(1, 1), ringTex(), color);
  m.rotation.x = -Math.PI / 2;
  m.position.set(pos.x, 0.05, pos.z);
  tween(dur, (t) => { m.scale.setScalar(0.3 + t * size); m.material.opacity = 1 - t; }, { easing: ease.outCubic }).then(() => kill(world, m));
}

export function rays(world, pos, { color = COLORS.light, n = 8, len = 4, dur = 500, width = 0.35 } = {}) {
  for (let i = 0; i < n; i++) {
    const m = addMesh(world, new THREE.PlaneGeometry(width, len), rayTex(), color);
    m.position.copy(pos); m.position.z += 0.3;
    m.rotation.z = (i / n) * Math.PI * 2 + Math.random() * 0.3;
    const delay = i * 0.02;
    tween(dur, (t) => { const k = Math.max(0, t - delay); m.scale.set(1 - k * 0.6, 0.3 + k * 1.2, 1); m.material.opacity = (1 - k) * Math.min(1, t * 6); }, { easing: ease.outCubic }).then(() => kill(world, m));
  }
}

export function pillar(world, pos, { color = COLORS.light, height = 9, width = 1.6, dur = 700 } = {}) {
  const m = addMesh(world, new THREE.PlaneGeometry(width, height), rayTex(), color);
  m.position.set(pos.x, height / 2 - 0.3, pos.z + 0.2);
  tween(dur, (t) => { m.scale.set(1 - t * 0.7 + Math.sin(t * 40) * 0.05, 1, 1); m.material.opacity = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85; }).then(() => kill(world, m));
}

export function beam(world, from, to, { color = COLORS.light, width = 0.3, dur = 260 } = {}) {
  const d = to.clone().sub(from);
  const len = d.length();
  const m = addMesh(world, new THREE.PlaneGeometry(width, len), rayTex(), color);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  m.rotation.z = Math.atan2(d.y, d.x) - Math.PI / 2;
  tween(dur, (t) => { m.material.opacity = 1 - t; m.scale.x = 1 + t; }).then(() => kill(world, m));
}

export function shieldFx(world, actor, { color = COLORS.block, dur = 520 } = {}) {
  const c = actor.centerPoint();
  const sz = Math.max(actor.size.h * 0.9, 1.6);
  const m = addMesh(world, new THREE.PlaneGeometry(sz, sz), hexTex(), color);
  m.position.copy(c); m.position.z += 0.5;
  tween(dur, (t) => { m.scale.setScalar(0.8 + t * 0.3); m.material.opacity = t < 0.2 ? t * 5 : 1 - (t - 0.2) / 0.8; }).then(() => kill(world, m));
  sparks(world, c, { n: 10, color: [0.6, 0.8, 1.2], speed: 2, up: 0.5, gravity: 0, size: 5, life: 0.5 });
}

export function riseFx(world, actor, { color = [0.5, 1.2, 0.5], n = 22, shape = 0 } = {}) {
  const p = actor.footPoint();
  world.fxParticles.burst(p, n, () => ({
    x: (Math.random() - 0.5) * actor.size.w * 0.8, y: Math.random() * 0.4, z: (Math.random() - 0.5) * 0.4 + 0.3,
    vy: 1.2 + Math.random() * 1.6, life: 0.9 + Math.random() * 0.5, size: 6 + Math.random() * 5, size1: 2, r: color[0], g: color[1], b: color[2], a: 1, shape, fadeIn: 0.1, wobble: 0.3,
  }));
}

export function auraBurst(world, actor, { color = COLORS.light, size = 3.5 } = {}) {
  const c = actor.centerPoint();
  flare(world, c, { color, size, dur: 500 });
  shockwave(world, actor.footPoint(), { color, size: 5 });
  riseFx(world, actor, { color: [color.r * 0.6, color.g * 0.6, color.b * 0.6], n: 30 });
}

// Orbiting radiance motes around the player's lantern.
export class RadianceOrbs {
  constructor(world) {
    this.world = world;
    this.group = new THREE.Group();
    world.scene.add(this.group);
    this.sprites = [];
    this.count = 0;
    this.anchor = new THREE.Vector3();
    this.stop = addTicker((dt) => this.update(dt));
    this.t = 0;
  }
  set(n) {
    while (this.sprites.length < n) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: new THREE.Color(2.2, 1.9, 0.9), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      s.scale.set(0.001, 0.001, 1);
      s.userData.born = this.t;
      this.group.add(s);
      this.sprites.push(s);
    }
    while (this.sprites.length > n) {
      const s = this.sprites.pop();
      this.group.remove(s);
      s.material.dispose();
    }
    this.count = n;
  }
  update(dt) {
    this.t += dt;
    const n = this.sprites.length;
    this.sprites.forEach((s, i) => {
      const a = this.t * 1.6 + (i / Math.max(1, n)) * Math.PI * 2;
      const grow = Math.min(1, (this.t - s.userData.born) * 4);
      s.position.set(this.anchor.x + Math.cos(a) * 0.75, this.anchor.y + 0.25 + Math.sin(a * 2) * 0.12 + Math.sin(a) * 0.25, this.anchor.z + Math.sin(a) * 0.5);
      const k = (0.32 + Math.sin(this.t * 6 + i) * 0.04) * grow;
      s.scale.set(k, k, 1);
    });
  }
  dispose() { this.stop(); this.world.scene.remove(this.group); }
}
