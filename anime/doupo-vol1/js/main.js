import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { U, clamp, sstep } from './lib.js';
import { buildScenes, W, H } from './scenes.js';
import { SHOTS, SUBS, CHAPTERS, FADES, TITLE, DUR, FPS } from './timeline.js';

window.DEMO = { width: W, height: H, fps: FPS, duration: DUR, workers: 3 };

const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('stage').appendChild(renderer.domElement);

const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.8, 0.5, 0.85);
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 0 }, uFadeCol: { value: new THREE.Vector3() }, uVig: { value: 0.4 },
    uGrain: { value: 0.03 }, uBar: { value: 100 / 1080 }, uLift: { value: new THREE.Vector3() }, uGain: { value: new THREE.Vector3(1, 1, 1) },
    uSat: { value: 1 }, uRes: { value: new THREE.Vector2(W, H) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime,uFade,uVig,uGrain,uBar,uSat; uniform vec3 uFadeCol,uLift,uGain; uniform vec2 uRes; varying vec2 vUv;
    float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.299,0.587,0.114)); c = mix(vec3(l), c, uSat);
      c = c*uGain + uLift*(1.0 - c);
      vec2 q = (vUv - 0.5)*vec2(1.0, 0.72); c *= mix(1.0, smoothstep(0.86, 0.18, length(q)), uVig);
      c += (h12(floor(vUv*uRes) + fract(uTime*7.31)*331.0) - 0.5)*uGrain;
      c = mix(c, uFadeCol, uFade);
      if (vUv.y < uBar || vUv.y > 1.0 - uBar) c = vec3(0.0);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }`,
});
composer.addPass(renderPass); composer.addPass(bloom); composer.addPass(new OutputPass()); composer.addPass(grade);

// overlay text
const $ = (id) => document.getElementById(id);
const subEl = $('sub'), chapEl = $('chap'), chapNo = $('chapNo'), chapName = $('chapName'), titleEl = $('title');
const env = (t, a, b, fi = 0.25, fo = 0.3) => sstep(a, a + fi, t) * (1 - sstep(b - fo, b, t));

const allText = SUBS.map((s) => s[2]).join('') + '斗破苍穹续第一卷火种同人创作非官方人物与世界观归原作者天蚕土豆所有·';
const calli = CHAPTERS.map((c) => c[2] + c[3]).join('') + TITLE.join('') + '斗之力三段';
await document.fonts.load('500 40px "Noto Serif SC"', allText);
await document.fonts.load('700 40px "Noto Serif SC"', allText);
await document.fonts.load('400 80px "Ma Shan Zheng"', calli);
await document.fonts.ready;

const scenes = buildScenes(); window.__scenes = scenes;
// warm-up: compile every scene's shaders once
for (const s of SHOTS) { const S = scenes[s[2]]; S.update(s[0] + 0.01); renderPass.scene = S.scene; renderPass.camera = S.cam; composer.render(); }

window.renderAt = async (t) => {
  t = clamp(t, 0, DUR - 1e-4);
  const shot = SHOTS.find((s) => t >= s[0] && t < s[1]) || SHOTS[SHOTS.length - 1];
  const S = scenes[shot[2]];
  U.time.value = t;
  S.update(t);
  if (window.__cam) { const c = window.__cam; S.cam.position.set(...c.p); S.cam.lookAt(...c.l); if (c.f) { S.cam.fov = c.f; S.cam.updateProjectionMatrix(); } }
  const sky = S.scene.userData.sky; if (sky) sky.position.copy(S.cam.position);
  U.pxScale.value = H / (2 * Math.tan(THREE.MathUtils.degToRad(S.cam.fov) / 2));
  const P = S.post;
  bloom.strength = P.bloom[0]; bloom.radius = P.bloom[1]; bloom.threshold = P.bloom[2];
  renderer.toneMappingExposure = P.exposure ?? 1;
  U.rim.value.set(P.rim); U.rimStr.value = P.rimStr;
  const gu = grade.uniforms;
  gu.uTime.value = t; gu.uVig.value = P.vig; gu.uSat.value = P.sat; gu.uLift.value.set(...P.lift); gu.uGain.value.set(...P.gain);
  let fade = 0, fc = [0, 0, 0];
  for (const [a, b, c, k0, k1] of FADES) if (t >= a && t <= b) { const u = (t - a) / (b - a); const k = k0 + (k1 - k0) * (u * u * (3 - 2 * u)); if (k > fade) { fade = k; fc = c; } }
  gu.uFade.value = fade; gu.uFadeCol.value.set(...fc);
  renderPass.scene = S.scene; renderPass.camera = S.cam;
  composer.render();
  // overlay
  const sub = SUBS.find((s) => t >= s[0] && t < s[1]);
  if (sub) { if (subEl.textContent !== sub[2]) subEl.textContent = sub[2]; subEl.style.opacity = env(t, sub[0], sub[1]).toFixed(3); } else subEl.style.opacity = '0';
  const ch = CHAPTERS.find((c) => t >= c[0] && t < c[1]);
  if (ch) { chapNo.textContent = ch[2]; chapName.textContent = ch[3]; const k = env(t, ch[0], ch[1], 0.6, 0.6); chapEl.style.opacity = k.toFixed(3); chapEl.style.transform = `translateY(${((1 - k) * 12).toFixed(1)}px)`; }
  else chapEl.style.opacity = '0';
  const tk = sstep(TITLE[3], TITLE[3] + 1.2, t);
  titleEl.style.opacity = tk.toFixed(3); titleEl.style.transform = `scale(${(1.04 - 0.04 * tk).toFixed(4)})`;
  titleEl.style.letterSpacing = `${(0.32 - 0.12 * tk).toFixed(3)}em`;
};
window.__ready = true;
