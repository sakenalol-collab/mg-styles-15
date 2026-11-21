// Character sheet / turntable / face close-up / flower-valley test shot for the original 云韵 model.
// model.html?mode=sheet|turn|face|scene  — window.renderAt(t) like the film page, so harness/render.mjs can render it.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { U, camKeys, sstep, ease } from './lib.js';
import { makeYunyun, PALETTE } from './yunyun.js';
import { sceneFlowers } from './scenes.js';

const W = 1920, H = 1080;
const MODE = new URLSearchParams(location.search).get('mode') || 'sheet';
window.DEMO = { width: W, height: H, fps: 24, duration: { turn: 8, scene: 6 }[MODE] ?? 1, workers: MODE === 'turn' ? 2 : 1 };
document.body.dataset.mode = MODE;

await document.fonts.load('500 40px "Noto Serif SC"', '云韵角色设计稿原创按原著描写青色系正面侧面背面青天青月白黛浅金青玉同人非官方·');
await document.fonts.load('400 80px "Ma Shan Zheng"', '云韵');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: MODE !== 'scene', preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(W, H);
renderer.toneMapping = MODE === 'scene' ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('stage').appendChild(renderer.domElement);

function studio() {
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa9b8b5, 1.05));
  const key = new THREE.DirectionalLight(0xfff1e4, 2.1); key.position.set(2.2, 3.6, 3.2); key.castShadow = false;
  key.shadow.mapSize.set(2048, 2048); Object.assign(key.shadow.camera, { left: -1.4, right: 1.4, top: 2.2, bottom: -0.4, near: 0.5, far: 12 });
  key.shadow.camera.updateProjectionMatrix(); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xd2ecff, 1.6); rim.position.set(-2.6, 2.4, -3.2); scene.add(rim);
  const blob = document.createElement('canvas'); blob.width = blob.height = 256; { const c = blob.getContext('2d'); const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(30,60,60,0.42)'); g.addColorStop(0.55, 'rgba(30,60,60,0.18)'); g.addColorStop(1, 'rgba(30,60,60,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 256); }
  const bt = new THREE.CanvasTexture(blob); bt.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, toneMapped: false }));
  ground.position.y = 0.002; scene.add(ground);
  const yy = makeYunyun(); scene.add(yy);
  return { scene, yy };
}

let renderAt;
if (MODE === 'scene') {
  const S = sceneFlowers({
    yunyun: makeYunyun, solo: true,
    update: (S, t) => {
      const yy = S.yy; yy.position.set(-3.4, 0, 3.9); yy.rotation.y = -0.75 + 0.03 * Math.sin(t * 0.5);
      yy.userData.pose({ headTurn: 0.3 - 0.22 * ease.inOut(sstep(1.0, 4.5, t)), head: -0.05, armL: [0.05, 0.24], armR: [0.08, -0.22] });
      camKeys(S.cam, t, [[0, [-6.6, 1.25, 7.9], [-3.1, 1.12, 3.7], 30], [6, [-6.0, 1.3, 7.2], [-3.1, 1.16, 3.7], 26]]);
    },
  });
  const fill = new THREE.DirectionalLight(0xdff0ff, 0.9); fill.position.set(-9, 3, 10); fill.target.position.set(-3.4, 1, 3.9); S.scene.add(fill, fill.target);
  renderer.toneMappingExposure = 1.12;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
  const rp = new RenderPass(S.scene, S.cam); const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.45, 0.5, 0.95);
  composer.addPass(rp); composer.addPass(bloom); composer.addPass(new OutputPass());
  renderAt = (t) => {
    U.time.value = t; S.update(t);
    U.rim.value.set(0xffd2b0); U.pxScale.value = H / (2 * Math.tan(THREE.MathUtils.degToRad(S.cam.fov) / 2));
    S.scene.userData.sky.position.copy(S.cam.position);
    composer.render();
  };
} else {
  const { scene, yy } = studio();
  const cam = new THREE.PerspectiveCamera(16, W / H, 0.1, 50);
  U.rim.value.set(0xe6f6ff);
  if (MODE === 'sheet') {
    const pw = W / 3;
    const views = [0, -Math.PI / 2, Math.PI];
    renderAt = (t) => {
      U.time.value = 1.3; renderer.setScissorTest(true); renderer.setClearColor(0x000000, 0); renderer.clear();
      cam.aspect = pw / H; cam.fov = 15.5; cam.updateProjectionMatrix(); cam.position.set(0, 0.9, 9.0); cam.lookAt(0, 0.83, 0);
      views.forEach((ry, i) => { yy.rotation.y = ry; renderer.setViewport(i * pw, 0, pw, H); renderer.setScissor(i * pw, 0, pw, H); renderer.render(scene, cam); });
      renderer.setScissorTest(false);
    };
    const pal = document.getElementById('palette');
    for (const [n, c] of PALETTE) { const d = document.createElement('div'); d.className = 'chip'; d.innerHTML = `<i style="background:#${c.toString(16).padStart(6, '0')}"></i>${n}`; pal.appendChild(d); }
  } else if (MODE === 'turn') {
    renderAt = (t) => {
      U.time.value = t; yy.rotation.y = (t / 8) * Math.PI * 2;
      cam.aspect = W / H; cam.fov = 17; cam.updateProjectionMatrix(); cam.position.set(0, 0.95, 6.6); cam.lookAt(0, 0.88, 0);
      renderer.setClearColor(0x000000, 0); renderer.render(scene, cam);
    };
  } else { // face
    renderer.domElement.style.background = 'transparent';
    renderAt = (t) => {
      U.time.value = 1.3; yy.rotation.y = t;
      cam.aspect = W / H; cam.fov = 14; cam.updateProjectionMatrix(); cam.position.set(0, 1.56, 1.45); cam.lookAt(0, 1.52, 0);
      renderer.setClearColor(0x000000, 0); renderer.render(scene, cam);
    };
  }
}
window.renderAt = async (t) => renderAt(t);
renderAt(0.01);
window.__ready = true;
