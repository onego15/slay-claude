// Post-processing chain: depth-of-field (tilt-shift flavoured) -> bloom -> grade -> output.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

const DOF_FRAG = /* glsl */ `
#include <packing>
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform float focusDist;
uniform float focusRange;
uniform float blurNear;
uniform float blurFar;
uniform float maxBlur;
uniform float tilt;
varying vec2 vUv;

float viewZ(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  return -perspectiveDepthToViewZ(d, cameraNear, cameraFar);
}
float coc(vec2 uv) {
  float z = viewZ(uv);
  float diff = z - focusDist;
  float c = diff > 0.0 ? max(0.0, diff - focusRange) / blurFar : max(0.0, -diff - focusRange * 0.6) / blurNear;
  float t = smoothstep(0.30, 0.5, abs(uv.y - 0.47)) * tilt;
  return clamp(max(c, t), 0.0, 1.0);
}
void main() {
  float c0 = coc(vUv);
  vec4 base = texture2D(tDiffuse, vUv);
  if (c0 < 0.02) { gl_FragColor = base; return; }
  vec2 px = 1.0 / resolution;
  float r = c0 * maxBlur;
  vec3 acc = base.rgb;
  float wsum = 1.0;
  const int N = 28;
  for (int i = 1; i < N; i++) {
    float fi = float(i);
    float a = fi * 2.39996;
    float rr = sqrt(fi / float(N)) * r;
    vec2 o = vec2(cos(a), sin(a)) * rr * px;
    vec2 uv = vUv + o;
    float cs = coc(uv);
    float w = cs >= c0 * 0.5 ? 1.0 : cs / max(0.001, c0 * 0.5) * 0.6;
    acc += texture2D(tDiffuse, uv).rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(acc / wsum, base.a);
}`;

const GRADE_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform float time;
uniform float vignette;
uniform float saturation;
uniform float contrast;
uniform vec3 lift;
uniform vec3 gain;
uniform float chroma;
uniform float flash;
uniform vec3 flashColor;
uniform float radial;
uniform vec2 radialCenter;
uniform float grain;
uniform float desat;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = vUv;
  vec3 col;
  if (radial > 0.001) {
    vec3 acc = vec3(0.0);
    vec2 dir = uv - radialCenter;
    for (int i = 0; i < 12; i++) {
      float s = 1.0 - radial * (float(i) / 12.0) * 0.18;
      acc += texture2D(tDiffuse, radialCenter + dir * s).rgb;
    }
    col = acc / 12.0;
  } else {
    col = texture2D(tDiffuse, uv).rgb;
  }
  if (chroma > 0.0005) {
    vec2 d = (uv - 0.5) * chroma;
    col.r = texture2D(tDiffuse, uv + d).r;
    col.b = texture2D(tDiffuse, uv - d).b;
  }
  col = col * gain + lift * (1.0 - col);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, saturation * (1.0 - desat));
  col = (col - 0.18) * contrast + 0.18;
  col = max(col, 0.0);
  vec2 q = uv - 0.5;
  q.x *= resolution.x / resolution.y;
  float v = smoothstep(1.05, 0.25, length(q) * (0.9 + vignette));
  col *= mix(1.0, v, vignette);
  col = mix(col, flashColor, flash);
  col += (hash(uv * resolution + fract(time) * 100.0) - 0.5) * grain;
  gl_FragColor = vec4(col, 1.0);
}`;

const VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

class DofPass extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, tDepth: { value: null }, resolution: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: camera.near }, cameraFar: { value: camera.far },
        focusDist: { value: 16 }, focusRange: { value: 2.5 }, blurNear: { value: 6 }, blurFar: { value: 18 }, maxBlur: { value: 7 }, tilt: { value: 0.6 },
      },
      vertexShader: VERT, fragmentShader: DOF_FRAG,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.cameraNear.value = this.camera.near;
    u.cameraFar.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  setSize(w, h) { this.material.uniforms.resolution.value.set(w, h); }
}

class GradePass extends Pass {
  constructor() {
    super();
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, time: { value: 0 },
        vignette: { value: 0.55 }, saturation: { value: 1.08 }, contrast: { value: 1.06 },
        lift: { value: new THREE.Vector3(0.02, 0.015, 0.04) }, gain: { value: new THREE.Vector3(1.0, 0.98, 0.96) },
        chroma: { value: 0.0015 }, flash: { value: 0 }, flashColor: { value: new THREE.Color(1, 1, 1) },
        radial: { value: 0 }, radialCenter: { value: new THREE.Vector2(0.5, 0.5) }, grain: { value: 0.025 }, desat: { value: 0 },
      },
      vertexShader: VERT, fragmentShader: GRADE_FRAG,
    });
    this.quad = new FullScreenQuad(this.material);
  }
  render(renderer, writeBuffer, readBuffer) {
    this.material.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  setSize(w, h) { this.material.uniforms.resolution.value.set(w, h); }
}

export function createPost(renderer, scene, camera, w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(w, h) });
  const composer = new EffectComposer(renderer, rt);
  const renderPass = new RenderPass(scene, camera);
  const dof = new DofPass(camera);
  const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.55, 0.82);
  const grade = new GradePass();
  const output = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(dof);
  composer.addPass(bloom);
  composer.addPass(grade);
  composer.addPass(output);
  return { composer, dof, bloom, grade, output, renderPass };
}
