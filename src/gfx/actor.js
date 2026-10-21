// Sprite actors living in the 3D stage: lit pixel-art billboards with frame animation,
// flash / dissolve shader hooks, real shadow casting and a soft contact shadow.
import * as THREE from 'three';
import { paintSprite } from './sprites.js';
import { PPU } from './textures.js';
import { clock } from './clock.js';
import { makeCanvas } from './pixel.js';

const atlasCache = new Map();

export function getAtlas(id) {
  if (atlasCache.has(id)) return atlasCache.get(id);
  const s = paintSprite(id);
  const n = s.frames.length;
  const color = makeCanvas(s.w * n, s.h);
  const glow = makeCanvas(s.w * n, s.h);
  const cc = color.getContext('2d');
  const gc = glow.getContext('2d');
  s.frames.forEach((f, i) => {
    cc.drawImage(f.painter.toCanvas('color'), i * s.w, 0);
    gc.drawImage(f.painter.toCanvas('glow'), i * s.w, 0);
  });
  const mk = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const atlas = { id, w: s.w, h: s.h, n, order: s.order, color: mk(color), glow: mk(glow), colorCanvas: color };
  atlasCache.set(id, atlas);
  return atlas;
}

let blobTex = null;
function blobTexture() {
  if (blobTex) return blobTex;
  const c = makeCanvas(64, 64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.75)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

export class Actor {
  constructor(spriteId, { glowStrength = 2.2, castShadow = true, blob = true, scale = 1, flip = false } = {}) {
    this.atlas = getAtlas(spriteId);
    const a = this.atlas;
    this.group = new THREE.Group();
    this.pivot = new THREE.Group(); // squash/tilt around feet
    this.group.add(this.pivot);
    const w = (a.w / PPU) * scale, h = (a.h / PPU) * scale;
    this.size = { w, h };
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, h / 2, 0);
    this.map = a.color.clone();
    this.emap = a.glow.clone();
    for (const t of [this.map, this.emap]) { t.repeat.set(1 / a.n, 1); t.needsUpdate = true; }
    this.uniforms = {
      uFlash: { value: 0 }, uFlashColor: { value: new THREE.Color(1, 1, 1) }, uDissolve: { value: 0 }, uAlpha: { value: 1 },
      uTint: { value: new THREE.Color(1, 1, 1) },
    };
    this.material = new THREE.MeshStandardMaterial({
      map: this.map, emissiveMap: this.emap, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: glowStrength,
      alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, transparent: false,
    });
    const U = this.uniforms;
    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, U);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform float uFlash; uniform vec3 uFlashColor; uniform float uDissolve; uniform float uAlpha; uniform vec3 uTint;
          float dHash(vec2 p){ return fract(sin(dot(floor(p), vec2(12.9898,78.233))) * 43758.5453); }`)
        .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
          float dn = dHash(vMapUv * vec2(${a.w * a.n}.0, ${a.h}.0));
          float edgeY = 1.0 - vMapUv.y;
          if (uDissolve > 0.0 && dn * 0.7 + edgeY * 0.3 < uDissolve) discard;`)
        .replace('#include <dithering_fragment>', `#include <dithering_fragment>
          gl_FragColor.rgb *= uTint;
          if (uDissolve > 0.0) { float e = smoothstep(uDissolve + 0.08, uDissolve, dn * 0.7 + edgeY * 0.3 - 0.02); gl_FragColor.rgb += vec3(2.4, 1.1, 0.35) * e; }
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uFlashColor * 2.2, uFlash);`);
    };
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.castShadow = castShadow;
    this.mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: this.map, alphaTest: 0.5 });
    if (flip) this.mesh.scale.x = -1;
    this.pivot.add(this.mesh);
    if (blob) {
      const bm = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, w * 0.38), new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.8 }));
      bm.rotation.x = -Math.PI / 2;
      bm.position.y = 0.012;
      bm.renderOrder = 1;
      this.blob = bm;
      this.group.add(bm);
    }
    this.anim = 'idle';
    this.frameT = 0;
    this.fps = 5;
    this.loop = true;
    this.frameIdx = 0;
    this.offset = new THREE.Vector3(); // transient animation offset
    this.squash = 0;
    this.tilt = 0;
    this.hover = 0; // floating actors
    this.hoverPhase = Math.random() * 6;
    this.flash = 0;
    this.home = new THREE.Vector3();
    this.setFrame(0);
  }

  setFrame(globalIndex) {
    const off = globalIndex / this.atlas.n;
    this.map.offset.x = off;
    this.emap.offset.x = off;
  }

  play(anim, { loop = false, fps = 5, hold = false } = {}) {
    if (!this.atlas.order[anim]) return;
    this.anim = anim;
    this.loop = loop;
    this.fps = fps;
    this.frameT = 0;
    this.hold = hold;
    this.setFrame(this.atlas.order[anim][0]);
  }

  idle(name = 'idle') { this.play(this.atlas.order[name] ? name : 'idle', { loop: true, fps: 4.5 }); }

  update(dt) {
    const frames = this.atlas.order[this.anim];
    if (frames && frames.length > 1) {
      this.frameT += dt * this.fps;
      let i = Math.floor(this.frameT);
      if (this.loop) i %= frames.length;
      else i = Math.min(i, frames.length - 1);
      this.setFrame(frames[i]);
    }
    const t = clock.t;
    const hov = this.hover ? Math.sin(t * 2.2 + this.hoverPhase) * this.hover : 0;
    this.pivot.position.set(this.offset.x, this.offset.y + hov + (this.hover ? this.hover * 2.2 : 0), this.offset.z);
    this.pivot.scale.set(1 + this.squash * 0.5, 1 - this.squash, 1);
    this.pivot.rotation.z = this.tilt;
    this.uniforms.uFlash.value = this.flash;
    if (this.blob) {
      const lift = this.pivot.position.y;
      const s = Math.max(0.35, 1 - lift * 0.25);
      this.blob.scale.set(s, s, s);
      this.blob.material.opacity = 0.8 * s * this.uniforms.uAlpha.value * (1 - this.uniforms.uDissolve.value);
      this.blob.position.x = this.offset.x;
    }
  }

  // World-space anchor points for UI and effects.
  topPoint(target = new THREE.Vector3()) {
    this.mesh.getWorldPosition(target);
    target.y += this.size.h * 0.92;
    return target;
  }
  centerPoint(target = new THREE.Vector3()) {
    this.mesh.getWorldPosition(target);
    target.y += this.size.h * 0.45;
    return target;
  }
  footPoint(target = new THREE.Vector3()) {
    return this.group.getWorldPosition(target);
  }

  dispose() {
    this.material.dispose();
    this.mesh.geometry.dispose();
    this.map.dispose();
    this.emap.dispose();
  }
}
