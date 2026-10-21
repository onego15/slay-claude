// The HD-2D world: a real 3D diorama (pixel-textured geometry, billboard scenery, lights,
// shadows, fog, particles) rendered through depth-of-field + bloom + grading.
import * as THREE from 'three';
import { createPost } from './post.js';
import { ParticleSystem } from './particles.js';
import { Actor } from './actor.js';
import { Painter, hex } from './pixel.js';
import {
  PPU, forestGround, stoneBricks, chapelFloor, summitFloor, runeCircle, gradientCanvas, radialCanvas,
  shaftCanvas, silhouetteStrip, stainedGlass, bannerTex, cloudCanvas,
} from './textures.js';
import { drawTree, drawPine, drawFern, drawGrass, drawRock } from './sprites.js';
import { clock, damp } from './clock.js';

const texCache = new Map();
function pixTex(key, make, { repeat = null, wrap = false } = {}) {
  let base = texCache.get(key);
  if (!base) {
    const src = make();
    const canvas = src instanceof Painter ? src.toCanvas('color') : src;
    base = new THREE.CanvasTexture(canvas);
    base.magFilter = THREE.NearestFilter;
    base.minFilter = THREE.NearestFilter;
    base.generateMipmaps = false;
    base.colorSpace = THREE.SRGBColorSpace;
    base.userData.painter = src instanceof Painter ? src : null;
    texCache.set(key, base);
  }
  if (!repeat && !wrap) return base;
  const t = base.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.needsUpdate = true;
  return t;
}
function glowTexFrom(key, painterKey) {
  const k = key + ':glow';
  if (texCache.has(k)) return texCache.get(k);
  const base = texCache.get(painterKey);
  const t = new THREE.CanvasTexture(base.userData.painter.toCanvas('glow'));
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(k, t);
  return t;
}
function softTex(key, make) {
  if (texCache.has(key)) return texCache.get(key);
  const t = new THREE.CanvasTexture(make());
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

function spriteFromPainter(key, w, h, draw, { glow = false, shadow = true, lit = true } = {}) {
  const map = pixTex(key, () => { const P = new Painter(w, h); draw(P); P.outline({ darken: 0.3 }); return P; });
  const mat = new (lit ? THREE.MeshStandardMaterial : THREE.MeshBasicMaterial)({ map, alphaTest: 0.5, side: THREE.DoubleSide, ...(lit ? { roughness: 1 } : {}) });
  if (glow && lit) { mat.emissiveMap = glowTexFrom(key, key); mat.emissive = new THREE.Color(1, 1, 1); mat.emissiveIntensity = 1.5; }
  const geo = new THREE.PlaneGeometry(w / PPU, h / PPU);
  geo.translate(0, h / PPU / 2, 0);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadow;
  m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 });
  return m;
}

const STAGE_PRESETS = {
  forest: {
    fog: '#7f97a6', fogDensity: 0.03, exposure: 1.05,
    hemi: ['#b8d4ff', '#4a5a34', 0.9], sun: ['#ffe2b0', 2.6, [-8, 12, 7]],
    sky: [[0, '#6f9fd0'], [0.55, '#b9d2e2'], [0.8, '#e8dcc0'], [1, '#e8d6b0']],
    dof: { focusDist: 15.2, focusRange: 2.2, blurFar: 14, blurNear: 5, tilt: 0.55 },
    grade: { saturation: 1.08, contrast: 1.05, lift: [0.02, 0.02, 0.05], gain: [1.02, 1.0, 0.95], vignette: 0.5 },
    bloom: [0.5, 0.5, 0.8],
  },
  chapel: {
    fog: '#2c2238', fogDensity: 0.045, exposure: 1.1,
    hemi: ['#8a7ab8', '#2a1a20', 0.55], sun: ['#c8b8ff', 1.3, [4, 12, -6]],
    sky: [[0, '#140e22'], [1, '#2c2238']],
    dof: { focusDist: 15.2, focusRange: 2.0, blurFar: 10, blurNear: 5, tilt: 0.6 },
    grade: { saturation: 1.05, contrast: 1.08, lift: [0.03, 0.01, 0.06], gain: [1.05, 0.97, 0.98], vignette: 0.7 },
    bloom: [0.75, 0.55, 0.72],
  },
  summit: {
    fog: '#1c1d3c', fogDensity: 0.012, exposure: 1.15,
    hemi: ['#6a7ad0', '#20142a', 0.6], sun: ['#a8c0ff', 1.8, [-6, 14, 4]],
    sky: [[0, '#05050f'], [0.5, '#141838'], [0.85, '#3a2a5a'], [1, '#5a3a6a']],
    dof: { focusDist: 16.5, focusRange: 2.8, blurFar: 16, blurNear: 5, tilt: 0.45 },
    grade: { saturation: 1.1, contrast: 1.1, lift: [0.02, 0.01, 0.07], gain: [0.98, 0.98, 1.06], vignette: 0.65 },
    bloom: [0.85, 0.6, 0.7],
  },
};

export class World {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 16 / 9, 0.5, 400);
    this.camBase = { pos: new THREE.Vector3(0.3, 2.9, 15.2), look: new THREE.Vector3(0.5, 1.25, 0) };
    this.cam = { pos: this.camBase.pos.clone(), look: this.camBase.look.clone(), fov: 26 };
    this.camTarget = { pos: this.camBase.pos.clone(), look: this.camBase.look.clone(), fov: 26, lambda: 4 };
    this.shake = 0;
    this.shakeT = 0;
    this.sway = 1;
    this.stageGroup = new THREE.Group();
    this.scene.add(this.stageGroup);
    this.actorsGroup = new THREE.Group();
    this.scene.add(this.actorsGroup);
    this.actors = new Set();

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -14; sc.right = 14; sc.top = 10; sc.bottom = -8; sc.near = 1; sc.far = 60;
    this.sun.shadow.bias = -0.0015;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(this.hemi, this.sun, this.sun.target);

    this.lantern = new THREE.PointLight(0xffb366, 9, 9, 1.6);
    this.scene.add(this.lantern);
    this.fxLight = new THREE.PointLight(0xffffff, 0, 10, 1.5);
    this.scene.add(this.fxLight);

    this.particles = new ParticleSystem(2500, { additive: true });
    this.scene.add(this.particles.points);
    this.fxParticles = new ParticleSystem(1500, { additive: true });
    this.scene.add(this.fxParticles.points);
    this.ambient = [];
    this.flickers = [];

    this.width = 1280; this.height = 720;
    this.post = createPost(this.renderer, this.scene, this.camera, this.width, this.height);
    this.preset = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.width = w; this.height = h;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    // keep a consistent framing on tall/narrow screens by widening the fov
    const baseAspect = 16 / 9;
    this.fovBase = w / h < baseAspect ? 2 * Math.atan(Math.tan((26 * Math.PI) / 360) * (baseAspect / (w / h))) * (180 / Math.PI) : 26;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.post.composer.setPixelRatio(pr);
    this.post.composer.setSize(w, h);
    this.particles.material.uniforms.uPixelRatio.value = pr * (h / 720);
    this.fxParticles.material.uniforms.uPixelRatio.value = pr * (h / 720);
  }

  // ---------------------------------------------------------------- stages
  clearStage() {
    this.stageGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.stageGroup.clear();
    this.particles.clear();
    this.ambient = [];
    this.flickers = [];
  }

  setStage(kind, { seed = 1 } = {}) {
    this.clearStage();
    this.kind = kind;
    const P = (this.preset = STAGE_PRESETS[kind]);
    this.scene.fog = new THREE.FogExp2(new THREE.Color(P.fog), P.fogDensity);
    this.renderer.toneMappingExposure = P.exposure;
    this.hemi.color.set(P.hemi[0]); this.hemi.groundColor.set(P.hemi[1]); this.hemi.intensity = P.hemi[2];
    this.sun.color.set(P.sun[0]); this.sun.intensity = P.sun[1];
    this.sun.position.set(...P.sun[2]); this.sun.target.position.set(0, 0, 0);
    const d = this.post.dof.material.uniforms;
    for (const [k, v] of Object.entries(P.dof)) d[k].value = v;
    const g = this.post.grade.material.uniforms;
    g.saturation.value = P.grade.saturation; g.contrast.value = P.grade.contrast; g.vignette.value = P.grade.vignette;
    g.lift.value.set(...P.grade.lift); g.gain.value.set(...P.grade.gain); g.desat.value = 0;
    const b = this.post.bloom;
    b.strength = P.bloom[0]; b.radius = P.bloom[1]; b.threshold = P.bloom[2];
    this.baseBloom = P.bloom[0];
    this.camBase = kind === 'summit'
      ? { pos: new THREE.Vector3(0.6, 3.4, 17.6), look: new THREE.Vector3(0.9, 1.75, 0) }
      : { pos: new THREE.Vector3(0.3, 2.9, 15.2), look: new THREE.Vector3(0.5, 1.25, 0) };
    this.resetCamera(true);
    if (kind === 'forest') this.buildForest(seed);
    else if (kind === 'chapel') this.buildChapel(seed);
    else this.buildSummit(seed);
  }

  addSky(stops, z = -120, w = 520, h = 200, y = 30) {
    const tex = softTex('sky:' + JSON.stringify(stops), () => gradientCanvas(stops, 4, 256));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false }));
    m.position.set(0, y, z);
    m.renderOrder = -10;
    this.stageGroup.add(m);
    return m;
  }

  addStrip(key, w, h, opts, worldW, worldH, pos, { fog = true } = {}) {
    const tex = pixTex(key, () => silhouetteStrip(w, h, opts));
    const m = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, fog }));
    m.position.set(...pos);
    this.stageGroup.add(m);
    return m;
  }

  addShaft(pos, rot, size, color, opacity) {
    const tex = softTex('shaft', () => shaftCanvas());
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size[0], size[1]), new THREE.MeshBasicMaterial({
      map: tex, color: new THREE.Color(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    m.geometry.translate(0, -size[1] / 2, 0);
    m.position.set(...pos);
    m.rotation.set(...rot);
    this.stageGroup.add(m);
    this.ambient.push((t) => { m.material.opacity = opacity * (0.8 + 0.2 * Math.sin(t * 0.5 + pos[0])); });
    return m;
  }

  addGlowSprite(pos, size, color, opacity = 1, fog = false) {
    const tex = softTex('radial', () => radialCanvas(128));
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(color), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog }));
    m.position.set(...pos);
    m.scale.set(size, size, 1);
    this.stageGroup.add(m);
    return m;
  }

  addBillboard(key, w, h, draw, pos, scale = 1, opts = {}) {
    const m = spriteFromPainter(key, w, h, draw, opts);
    m.position.set(...pos);
    m.scale.setScalar(scale);
    if (opts.flip) m.scale.x *= -1;
    m.receiveShadow = !!opts.receive;
    this.stageGroup.add(m);
    return m;
  }

  stoneMat(key, repeat, hue, moss = true) {
    const map = pixTex('bricks:' + hue + moss, () => stoneBricks(64, 64, { hue, moss }), { repeat });
    return new THREE.MeshStandardMaterial({ map, roughness: 0.95 });
  }

  pillar(x, z, h, { r = 0.45, hue = '#7d7a78', broken = false, moss = true, seg = 8 } = {}) {
    const g = new THREE.Group();
    const mat = this.stoneMat(`p${seg}`, [Math.max(1, Math.round(r * 4)), Math.round(h)], hue, moss);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, seg), mat);
    col.position.y = h / 2;
    col.castShadow = true; col.receiveShadow = true;
    g.add(col);
    const baseM = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, 0.35, r * 2.6), this.stoneMat('b', [1, 0.25], hue, moss));
    baseM.position.y = 0.17; baseM.castShadow = true; baseM.receiveShadow = true;
    g.add(baseM);
    if (!broken) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(r * 2.6, 0.3, r * 2.6), this.stoneMat('b', [1, 0.25], hue, moss));
      cap.position.y = h + 0.15; cap.castShadow = true;
      g.add(cap);
    } else {
      col.rotation.z = 0.02;
    }
    g.position.set(x, 0, z);
    this.stageGroup.add(g);
    return g;
  }

  scatter(count, rangeX, rangeZ, avoid, fn) {
    let s = 1234;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      const x = rangeX[0] + rnd() * (rangeX[1] - rangeX[0]);
      const z = rangeZ[0] + rnd() * (rangeZ[1] - rangeZ[0]);
      if (avoid && avoid(x, z)) continue;
      fn(x, z, rnd, i);
    }
  }

  buildForest() {
    const P = this.preset;
    this.addSky(P.sky);
    // sun glow & distant layers
    this.addGlowSprite([-34, 26, -110], 60, '#fff0c8', 0.65);
    this.addStrip('mtn1', 512, 96, { color: '#7d93ad', top: '#a9bdd0', seed: 7, kind: 'mountain', rough: 0.9 }, 220, 42, [10, 10, -95], { fog: false });
    this.addStrip('mtn2', 512, 96, { color: '#5d7590', top: '#7f97ad', seed: 3, kind: 'mountain', rough: 0.7 }, 160, 26, [-6, 6, -70], { fog: true });
    this.addStrip('forest1', 512, 64, { color: '#38504e', top: '#4c6860', seed: 5, kind: 'forest' }, 110, 13, [0, 5.0, -34]);
    this.addStrip('forest2', 512, 64, { color: '#2a3f3a', top: '#3d5a4c', seed: 9, kind: 'forest' }, 80, 9, [3, 3.6, -22]);
    // clouds
    const ct = softTex('cloud', () => cloudCanvas());
    for (const [x, y, z, s] of [[-30, 24, -100, 40], [25, 30, -105, 50], [60, 20, -100, 30]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.38), new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.85, fog: false, depthWrite: false }));
      m.position.set(x, y, z);
      this.stageGroup.add(m);
      this.ambient.push((t) => { m.position.x = x + Math.sin(t * 0.02 + x) * 6; });
    }
    // ground
    const gtex = pixTex('forestGround', () => forestGround(512, 512, 3), { repeat: [4, 1] });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(64, 16), new THREE.MeshStandardMaterial({ map: gtex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, -0.2);
    ground.receiveShadow = true;
    this.stageGroup.add(ground);
    const far = new THREE.Mesh(new THREE.PlaneGeometry(220, 60), new THREE.MeshStandardMaterial({ color: '#3b5638', roughness: 1 }));
    far.rotation.x = -Math.PI / 2; far.position.set(0, -0.02, -36);
    this.stageGroup.add(far);
    // ruins: arch on the left, broken pillars on the right
    this.pillar(-6.2, -3.4, 4.6);
    this.pillar(-3.4, -3.8, 4.6);
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(3.9, 0.7, 0.9), this.stoneMat('lintel', [4, 1], '#7d7a78'));
    lintel.position.set(-4.8, 4.95, -3.6); lintel.rotation.z = -0.04; lintel.castShadow = true;
    this.stageGroup.add(lintel);
    this.pillar(6.4, -3.6, 2.4, { broken: true });
    this.pillar(8.8, -4.6, 3.8);
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.7, 0.9), this.stoneMat('blk', [2, 1], '#7d7a78'));
    block.position.set(4.6, 0.33, -2.6); block.rotation.y = 0.5; block.castShadow = true; block.receiveShadow = true;
    this.stageGroup.add(block);
    // trees
    const trees = [[-11, -8.5, 1.15, '#3e5e3a'], [-1.5, -11, 1.2, '#4a6a3a'], [3.4, -8.2, 1.0, '#3a5a40'], [12, -9, 1.2, '#456a3e'], [-16, -12, 1.3, '#3a5440'], [16, -13, 1.35, '#3e5a3a'], [7.8, -14, 1.25, '#4a6a44'], [-6.5, -14, 1.2, '#41603e']];
    trees.forEach(([x, z, s, hue], i) => this.addBillboard('tree' + i, 128, 200, (P2) => drawTree(P2, { seed: i + 2, hue }), [x, 0, z], s));
    for (let i = 0; i < 8; i++) this.addBillboard('pine' + (i % 3), 64, 140, (P2) => drawPine(P2, { hue: ['#2d4a44', '#34524a', '#2a443e'][i % 3] }), [-20 + i * 6 + (i % 2) * 2, 0, -15 - (i % 3) * 2], 1.3 + (i % 3) * 0.2, { shadow: false });
    // ground clutter
    const avoid = (x, z) => Math.abs(z) < 1.2 && x > -5 && x < 7;
    this.scatter(40, [-14, 14], [-4.5, 2.5], avoid, (x, z, rnd, i) => {
      const k = Math.floor(rnd() * 3);
      if (k === 0) this.addBillboard('fern' + (i % 3), 40, 26, (P2) => drawFern(P2, { seed: i % 3 + 1, hue: ['#4a7a3a', '#5a8a40', '#3e6a3a'][i % 3] }), [x, 0, z], 1, { shadow: false });
      else if (k === 1) this.addBillboard('grass' + (i % 3), 36, 16, (P2) => drawGrass(P2, { seed: i % 3 + 2 }), [x, 0, z], 1, { shadow: false });
      else this.addBillboard('rock' + (i % 2), 30, 20, (P2) => drawRock(P2, { hue: i % 2 ? '#6a6a72' : '#7a7468' }), [x, 0, z], 0.9 + rnd() * 0.5);
    });
    // foreground framing (out of focus)
    this.addBillboard('fgfern', 40, 26, (P2) => drawFern(P2, { seed: 5, hue: '#3a6034' }), [-6.6, 0, 7.5], 2.2, { shadow: false });
    this.addBillboard('fgfern2', 40, 26, (P2) => drawFern(P2, { seed: 7, hue: '#355a30' }), [7.4, 0, 7.2], 2.4, { shadow: false, flip: true });
    this.addBillboard('fgtree', 128, 200, (P2) => drawTree(P2, { seed: 11, hue: '#2e4a2e' }), [-9.5, 0, 4.2], 1.9);
    // light shafts
    this.addShaft([-6, 11, -5], [0, 0, 0.42], [3.4, 15], '#ffe6b0', 0.16);
    this.addShaft([-1.5, 11, -6], [0, 0, 0.42], [2.2, 14], '#ffe6b0', 0.12);
    this.addShaft([4.5, 11, -4.5], [0, 0, 0.42], [2.8, 15], '#fff0c8', 0.1);
    // particles: fireflies, dust motes, falling leaves
    this.particles.addEmitter({ rate: 6, make: () => ({ x: -12 + Math.random() * 24, y: 0.3 + Math.random() * 3, z: -6 + Math.random() * 8, vx: 0, vy: 0.05, life: 6 + Math.random() * 4, size: 14 + Math.random() * 8, r: 1.0, g: 0.85, b: 0.4, a: 1, wobble: 0.6, wobbleF: 1.3, twinkle: 3, fadeIn: 0.2 }) });
    this.particles.addEmitter({ rate: 10, make: () => ({ x: -10 + Math.random() * 20, y: Math.random() * 7, z: -5 + Math.random() * 9, vx: 0.08, vy: -0.02, life: 8, size: 5 + Math.random() * 4, r: 1, g: 0.95, b: 0.8, a: 0.5, wobble: 0.2, fadeIn: 0.3 }) });
    this.particles.addEmitter({ rate: 1.6, make: () => ({ x: -12 + Math.random() * 20, y: 7, z: -4 + Math.random() * 8, vx: 0.4, vy: -0.5, life: 14, size: 7, shape: 1, r: 0.9, g: 0.6 + Math.random() * 0.3, b: 0.2, a: 0.9, wobble: 1.5, wobbleF: 2, fadeIn: 0.05 }) });
    this.lanternColor = '#ffb366';
  }

  buildChapel() {
    const P = this.preset;
    this.addSky(P.sky, -60, 200, 120, 20);
    // floor
    const ftex = pixTex('chapelFloor', () => chapelFloor(256, 256), { repeat: [7, 3] });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(56, 24), new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.75, metalness: 0.1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.z = -2; floor.receiveShadow = true;
    this.stageGroup.add(floor);
    // carpet runner
    const carpet = pixTex('carpet', () => bannerTex(24, 72, '#5a1a2a'), { repeat: [1, 1] });
    const run = new THREE.Mesh(new THREE.PlaneGeometry(30, 2.4), new THREE.MeshStandardMaterial({ color: '#6a2030', roughness: 1 }));
    run.rotation.x = -Math.PI / 2; run.position.set(0, 0.01, 0); run.receiveShadow = true;
    this.stageGroup.add(run);
    // back wall
    const wallMat = this.stoneMat('wall', [24, 6], '#5a5266', false);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(48, 14, 1), wallMat);
    wall.position.set(0, 7, -9.5); wall.receiveShadow = true;
    this.stageGroup.add(wall);
    // stained glass windows (emissive)
    const gkey = 'glass';
    const gtex = pixTex(gkey, () => stainedGlass(64, 128));
    const gglow = glowTexFrom(gkey, gkey);
    for (const [x, s] of [[0.8, 1.35], [-8.5, 1], [10, 1]]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(2 * s, 4 * s), new THREE.MeshStandardMaterial({ map: gtex, emissiveMap: gglow, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.9, alphaTest: 0.5 }));
      win.position.set(x, 6.4 + (s > 1 ? 0.6 : 0), -8.95);
      this.stageGroup.add(win);
      this.addShaft([x, 9.5, -8.6], [-0.75, 0, 0.18], [2.6 * s, 17], '#c8b0ff', 0.12);
    }
    // pillars
    for (const [x, z] of [[-11, -5.5], [-6.2, -5], [-2.2, -5.4], [3.8, -5.4], [7.8, -5], [12, -5.5]]) this.pillar(x, z, 9, { r: 0.6, hue: '#6a6276', moss: false, seg: 8 });
    // banners
    for (const [x, hue] of [[-4.2, '#7a2a3a'], [5.8, '#2a3a7a'], [-8.6, '#3a5a3a'], [9.9, '#7a2a3a']]) {
      const bt = pixTex('banner' + hue, () => bannerTex(24, 72, hue));
      const bm = new THREE.Mesh(new THREE.PlaneGeometry(0.75 * 1.4, 2.25 * 1.4), new THREE.MeshStandardMaterial({ map: bt, alphaTest: 0.5, side: THREE.DoubleSide }));
      bm.geometry.translate(0, -1.575, 0);
      bm.position.set(x, 6.2, -5.2);
      bm.castShadow = true;
      this.stageGroup.add(bm);
      this.ambient.push((t) => { bm.rotation.y = Math.sin(t * 0.8 + x) * 0.08; });
    }
    // candle stands with real lights
    for (const [x, z] of [[-6.5, -2.6], [6.6, -2.8], [-10, 1.5], [10.5, 1.2]]) this.candleStand(x, z);
    // rubble
    this.scatter(18, [-12, 12], [-4, 2.5], (x, z) => Math.abs(z) < 1.4 && x > -5 && x < 7, (x, z, rnd, i) => {
      this.addBillboard('crock' + (i % 2), 30, 20, (P2) => drawRock(P2, { hue: '#5a5266' }), [x, 0, z], 0.6 + rnd() * 0.5);
    });
    // foreground pillar (blurred framing)
    this.pillar(-8.4, 5.2, 9, { r: 0.7, hue: '#4a4456', moss: false });
    // embers & dust
    this.particles.addEmitter({ rate: 9, make: () => ({ x: -12 + Math.random() * 24, y: -0.2, z: -5 + Math.random() * 8, vx: 0.05, vy: 0.5 + Math.random() * 0.4, life: 7, size: 6 + Math.random() * 4, shape: 1, r: 1, g: 0.5 + Math.random() * 0.3, b: 0.15, a: 1, wobble: 0.8, wobbleF: 2, twinkle: 6 }) });
    this.particles.addEmitter({ rate: 14, make: () => ({ x: -6 + Math.random() * 14, y: Math.random() * 8, z: -7 + Math.random() * 8, vx: 0.05, vy: -0.03, life: 9, size: 5, r: 0.85, g: 0.8, b: 1, a: 0.45, wobble: 0.2 }) });
    this.lanternColor = '#ffb366';
  }

  candleStand(x, z) {
    const brass = new THREE.MeshStandardMaterial({ color: '#8a6a30', roughness: 0.5, metalness: 0.6 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 2.2, 6), brass);
    stem.position.set(x, 1.1, z); stem.castShadow = true;
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.2, 0.12, 8), brass);
    dish.position.set(x, 2.2, z);
    this.stageGroup.add(stem, dish);
    for (const dx of [-0.18, 0.18, 0]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.38 + (dx === 0 ? 0.12 : 0), 0.12), new THREE.MeshStandardMaterial({ color: '#8a7a68', roughness: 1 }));
      c.position.set(x + dx, 2.42 + (dx === 0 ? 0.06 : 0), z);
      this.stageGroup.add(c);
      const f = this.addGlowSprite([x + dx, 2.75 + (dx === 0 ? 0.12 : 0), z], 0.5, '#ffb050', 1, false);
      this.ambient.push((t) => { const s = 0.42 + Math.sin(t * 13 + dx * 50 + x) * 0.05 + Math.sin(t * 7.3 + x) * 0.04; f.scale.set(s, s * 1.3, 1); });
    }
    const L = new THREE.PointLight(0xff9a4a, 4, 7, 1.6);
    L.position.set(x, 3.3, z + 0.6);
    this.stageGroup.add(L);
    this.flickers.push({ light: L, base: 4 });
    this.particles.addEmitter({ rate: 2, make: () => ({ x: x + (Math.random() - 0.5) * 0.3, y: 2.9, z, vx: 0, vy: 0.6, life: 1.8, size: 5, shape: 1, r: 1, g: 0.7, b: 0.3, a: 1, wobble: 0.4, wobbleF: 4 }) });
  }

  buildSummit() {
    const P = this.preset;
    this.addSky(P.sky, -150, 600, 260, 40);
    // stars
    const stars = new ParticleSystem(600, { additive: true });
    stars.material.uniforms.uScale.value = 4;
    for (let i = 0; i < 520; i++) stars.spawn({ x: (Math.random() - 0.5) * 360, y: 4 + Math.random() * 120, z: -140, life: 1e9, size: 60 + Math.random() * 140, r: 0.8, g: 0.85, b: 1, a: 0.5 + Math.random() * 0.5, twinkle: 1 + Math.random() * 3, fadeIn: 0 });
    stars.update(0.01);
    this.stageGroup.add(stars.points);
    this.ambient.push((t, dt) => stars.update(dt));
    // moon
    const moonP = new Painter(96, 96);
    moonP.ellipse(48, 48, 46, 46, [hex('#8a90b8'), hex('#b8c0e0'), hex('#dfe4fa'), hex('#f6f8ff')], {});
    for (const [x, y, r] of [[30, 34, 8], [60, 58, 11], [52, 26, 5], [36, 64, 6], [70, 38, 4]]) moonP.ellipse(x, y, r, r, [hex('#9aa0c8'), hex('#b8bede')], {});
    const moonTex = pixTex('moon', () => moonP);
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, alphaTest: 0.5, fog: false, color: new THREE.Color(1.6, 1.6, 1.7) }));
    this.moon.position.set(-38, 42, -138);
    this.stageGroup.add(this.moon);
    this.moonGlow = this.addGlowSprite([-38, 42, -137], 90, '#8aa0ff', 0.55);
    // cloud sea below
    const ct = softTex('cloud', () => cloudCanvas());
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(70, 30), new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.5, color: new THREE.Color('#5a5a90'), depthWrite: false, fog: false }));
      const x = -90 + (i % 8) * 26, z = -26 - Math.floor(i / 8) * 34;
      m.rotation.x = -Math.PI / 2 + 0.25;
      m.position.set(x, -7 - Math.floor(i / 8) * 3, z);
      this.stageGroup.add(m);
      this.ambient.push((t) => { m.position.x = x + Math.sin(t * 0.03 + i) * 8; });
    }
    this.addStrip('peaks', 512, 96, { color: '#232848', top: '#3a4070', seed: 13, kind: 'mountain', rough: 1 }, 260, 40, [0, 4, -110], { fog: false });
    // platform
    const ptex = pixTex('summitFloor', () => summitFloor(256, 256), { repeat: [5, 5] });
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(11, 10, 1.2, 28), [
      new THREE.MeshStandardMaterial({ map: this.stoneMat('ps', [20, 1], '#4a4e68', false).map, roughness: 1 }),
      new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ color: '#202030' }),
    ]);
    plat.position.set(0.5, -0.6, -2);
    plat.receiveShadow = true;
    this.stageGroup.add(plat);
    // rune circle
    const rkey = 'runes';
    pixTex(rkey, () => runeCircle(256));
    const rtex = glowTexFrom(rkey, rkey);
    this.runes = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ map: rtex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(0.8, 0.6, 1.4), opacity: 0.6 }));
    this.runes.rotation.x = -Math.PI / 2;
    this.runes.position.set(1.5, 0.02, -1.4);
    this.stageGroup.add(this.runes);
    this.ambient.push((t) => { this.runes.rotation.z = t * 0.05; this.runes.material.opacity = 0.45 + Math.sin(t * 1.3) * 0.12; });
    // ruined lantern tower behind
    const towerMat = this.stoneMat('tower', [3, 10], '#4a4e68', false);
    const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 16, 3), towerMat);
    tower.position.set(9, 6, -14); tower.rotation.y = 0.4; tower.castShadow = true;
    this.stageGroup.add(tower);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.8, 1, 3.8), towerMat);
    top.position.set(9, 14.4, -14); top.rotation.set(0.12, 0.4, 0.08);
    this.stageGroup.add(top);
    this.towerGlow = this.addGlowSprite([9, 15.8, -13], 9, '#a070ff', 0.9);
    for (const [x, z, h] of [[-8, -6, 5], [-11.5, -9, 7.5], [8.5, -5.5, 3.2]]) this.pillar(x, z, h, { r: 0.55, hue: '#4a4e68', moss: false, broken: h < 4 });
    // floating rocks
    const rockMat = this.stoneMat('frock', [1, 1], '#4a4e68', false);
    rockMat.flatShading = true;
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4 + (i % 3) * 0.35, 0), rockMat);
      const x = -16 + i * 4, y = 3 + (i % 4) * 2.2, z = -10 - (i % 3) * 4;
      m.position.set(x, y, z);
      m.castShadow = true;
      this.stageGroup.add(m);
      this.ambient.push((t) => { m.position.y = y + Math.sin(t * 0.7 + i) * 0.4; m.rotation.y = t * 0.1 + i; m.rotation.x = t * 0.07; });
    }
    // swirling ash & violet embers
    this.particles.addEmitter({ rate: 22, make: () => ({ x: -14 + Math.random() * 28, y: 9, z: -9 + Math.random() * 12, vx: 0.8, vy: -0.45, life: 12, size: 5 + Math.random() * 3, shape: 1, r: 0.55, g: 0.55, b: 0.7, a: 0.7, wobble: 1.2, wobbleF: 1.4 }) });
    this.particles.addEmitter({ rate: 7, make: () => ({ x: -8 + Math.random() * 18, y: 0, z: -5 + Math.random() * 6, vx: 0, vy: 0.6, life: 5, size: 9, r: 0.7, g: 0.45, b: 1, a: 1, wobble: 0.8, wobbleF: 2, twinkle: 5 }) });
    this.lanternColor = '#ffb366';
  }

  setBossPhase2() {
    if (this.kind !== 'summit') return;
    this.moon.material.color.set(new THREE.Color(2.2, 0.6, 0.5));
    this.moonGlow.material.color.set('#ff4a3a');
    this.towerGlow.material.color.set('#ff4a3a');
    this.runes.material.color.set(new THREE.Color(1.6, 0.4, 0.3));
    this.scene.fog.color.set('#2a1220');
    this.hemi.color.set('#d06a6a');
    this.sun.color.set('#ffb0a0');
    const g = this.post.grade.material.uniforms;
    g.gain.value.set(1.08, 0.94, 0.94);
  }

  // ---------------------------------------------------------------- actors
  addActor(actor, x, z) {
    actor.group.position.set(x, 0, z);
    actor.home.set(x, 0, z);
    this.actorsGroup.add(actor.group);
    this.actors.add(actor);
    return actor;
  }
  removeActor(actor) {
    this.actorsGroup.remove(actor.group);
    this.actors.delete(actor);
    actor.dispose();
  }
  clearActors() { for (const a of [...this.actors]) this.removeActor(a); }

  // ---------------------------------------------------------------- camera
  resetCamera(instant = false) {
    this.camTarget.pos.copy(this.camBase.pos);
    this.camTarget.look.copy(this.camBase.look);
    this.camTarget.fov = 26;
    this.camTarget.lambda = 3;
    if (instant) { this.cam.pos.copy(this.camBase.pos); this.cam.look.copy(this.camBase.look); this.cam.fov = 26; }
  }
  focusOn(point, { zoom = 0.85, lambda = 6, dx = 0, dy = 0 } = {}) {
    // move camera toward a point (zoom<1 = closer)
    const base = this.camBase;
    const dir = base.pos.clone().sub(base.look);
    const look = base.look.clone().lerp(point, 0.55).add(new THREE.Vector3(dx, dy, 0));
    this.camTarget.look.copy(look);
    this.camTarget.pos.copy(look.clone().add(dir.multiplyScalar(zoom)));
    this.camTarget.lambda = lambda;
  }
  addShake(amount) { this.shake = Math.min(1.2, this.shake + amount); }

  // project world point to screen px
  toScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.width, y: (-p.y * 0.5 + 0.5) * this.height, behind: p.z > 1 };
  }

  update(dt) {
    const t = clock.t;
    for (const f of this.ambient) f(t, dt);
    for (const fl of this.flickers) fl.light.intensity = fl.base * (0.85 + Math.sin(t * 17 + fl.base) * 0.06 + Math.sin(t * 7.1) * 0.08);
    for (const a of this.actors) a.update(dt);
    this.particles.update(dt);
    this.fxParticles.update(dt);
    // camera
    const k = this.camTarget.lambda;
    this.cam.pos.x = damp(this.cam.pos.x, this.camTarget.pos.x, k, dt);
    this.cam.pos.y = damp(this.cam.pos.y, this.camTarget.pos.y, k, dt);
    this.cam.pos.z = damp(this.cam.pos.z, this.camTarget.pos.z, k, dt);
    this.cam.look.x = damp(this.cam.look.x, this.camTarget.look.x, k, dt);
    this.cam.look.y = damp(this.cam.look.y, this.camTarget.look.y, k, dt);
    this.cam.look.z = damp(this.cam.look.z, this.camTarget.look.z, k, dt);
    this.cam.fov = damp(this.cam.fov, this.camTarget.fov, k, dt);
    const sway = this.sway;
    const sx = Math.sin(t * 0.31) * 0.12 * sway, sy = Math.sin(t * 0.23) * 0.06 * sway;
    this.shakeT += dt;
    const sh = this.shake * this.shake;
    const shx = (Math.sin(this.shakeT * 71) + Math.sin(this.shakeT * 37)) * 0.09 * sh;
    const shy = (Math.sin(this.shakeT * 63) + Math.sin(this.shakeT * 29)) * 0.07 * sh;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    this.camera.position.set(this.cam.pos.x + sx + shx, this.cam.pos.y + sy + shy, this.cam.pos.z);
    this.camera.lookAt(this.cam.look.x + sx * 0.5 + shx * 0.5, this.cam.look.y + shy * 0.5, this.cam.look.z);
    this.camera.fov = this.fovBase * (this.cam.fov / 26);
    this.camera.updateProjectionMatrix();
    // keep the DoF focus on the action
    const d = this.post.dof.material.uniforms;
    d.focusDist.value = this.camera.position.distanceTo(this.cam.look) - 0.2;
    // decay fx light
    this.fxLight.intensity = Math.max(0, this.fxLight.intensity - dt * 60);
    const g = this.post.grade.material.uniforms;
    g.time.value = t;
    g.flash.value = Math.max(0, g.flash.value - dt * 3.5);
    g.chroma.value = damp(g.chroma.value, 0.0015, 6, dt);
    g.radial.value = Math.max(0, g.radial.value - dt * 2.5);
    this.post.bloom.strength = damp(this.post.bloom.strength, this.baseBloom || 0.6, 3, dt);
  }

  render() {
    this.post.composer.render();
  }
}
