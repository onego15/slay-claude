// GPU point particles: ambient emitters (fireflies, dust, embers, ash, leaves) and one-shot bursts.
import * as THREE from 'three';

const VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
attribute float aShape;
varying vec4 vColor;
varying float vShape;
uniform float uPixelRatio;
uniform float uScale;
void main() {
  vColor = aColor;
  vShape = aShape;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uPixelRatio * uScale / -mv.z;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */ `
varying vec4 vColor;
varying float vShape;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float a;
  if (vShape < 0.5) { float d = length(p) * 2.0; a = smoothstep(1.0, 0.0, d); a = a * a; }
  else { a = (abs(p.x) < 0.32 && abs(p.y) < 0.32) ? 1.0 : 0.0; }
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor.rgb, vColor.a * a);
}`;

export class ParticleSystem {
  constructor(max = 2000, { additive = true } = {}) {
    this.max = max;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.shape = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aShape', new THREE.BufferAttribute(this.shape, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uPixelRatio: { value: 1 }, uScale: { value: 11 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.parts = [];
    this.emitters = [];
  }

  spawn(p) {
    if (this.parts.length >= this.max) this.parts.shift();
    this.parts.push({
      x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, drag: 0, life: 1, age: 0,
      size: 10, size1: null, r: 1, g: 1, b: 1, a: 1, fadeIn: 0.1, shape: 0, wobble: 0, wobbleF: 1, phase: Math.random() * 6.28, twinkle: 0,
      ...p,
    });
  }

  burst(origin, n, fn) {
    for (let i = 0; i < n; i++) {
      const p = fn(i);
      p.x = (p.x || 0) + origin.x; p.y = (p.y || 0) + origin.y; p.z = (p.z || 0) + origin.z;
      this.spawn(p);
    }
  }

  addEmitter(e) { this.emitters.push({ acc: 0, ...e }); }
  clearEmitters() { this.emitters = []; }
  clear() { this.parts = []; this.emitters = []; }

  update(dt) {
    for (const e of this.emitters) {
      e.acc += dt * e.rate;
      while (e.acc >= 1) { e.acc -= 1; this.spawn(e.make()); }
    }
    const alive = [];
    for (const p of this.parts) {
      p.age += dt;
      if (p.age >= p.life) continue;
      p.vx += p.ax * dt; p.vy += p.ay * dt; p.vz += p.az * dt;
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; p.vz *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.wobble) { p.x += Math.sin(p.age * p.wobbleF + p.phase) * p.wobble * dt; p.z += Math.cos(p.age * p.wobbleF * 0.7 + p.phase) * p.wobble * dt * 0.5; }
      alive.push(p);
    }
    this.parts = alive;
    const n = Math.min(alive.length, this.max);
    for (let i = 0; i < n; i++) {
      const p = alive[i];
      const t = p.age / p.life;
      let a = p.a * Math.min(1, p.age / Math.max(0.001, p.fadeIn * p.life)) * (1 - Math.max(0, (t - 0.6) / 0.4));
      if (p.twinkle) a *= 0.55 + 0.45 * Math.sin(p.age * p.twinkle + p.phase);
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      this.col[i * 4] = p.r; this.col[i * 4 + 1] = p.g; this.col[i * 4 + 2] = p.b; this.col[i * 4 + 3] = Math.max(0, a);
      this.size[i] = p.size1 !== null ? p.size + (p.size1 - p.size) * t : p.size;
      this.shape[i] = p.shape;
    }
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'aColor', 'aSize', 'aShape']) this.geo.attributes[k].needsUpdate = true;
  }
}
