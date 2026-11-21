// The nine sets of the film. Each builder returns { scene, cam, post, update(t) } where t is GLOBAL film time.
import * as THREE from 'three';
import { NOISE } from './glsl.js';
import {
  U, mulberry32, clamp, lerp, sstep, ease, V, col, camKeys, toon, tmesh, outline, figure, POSE, lerpPose,
  makeSky, makeRift, makeFlames, makeParticles, makeTerrain, makeCloudSheet, makeFireTrail, makeGlow, canvasTex,
} from './lib.js';

export const W = 1920, H = 1080;
const PI = Math.PI;

function base(o = {}) {
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(o.fov ?? 40, W / H, 0.1, 6000);
  if (o.sky) { const sky = makeSky(o.sky); scene.add(sky); scene.userData.sky = sky; }
  if (o.fog) scene.fog = o.fog;
  const post = { bloom: [0.7, 0.45, 0.9], exposure: 1, rim: 0x6688ff, rimStr: 0.5, lift: [0, 0, 0], gain: [1, 1, 1], sat: 1, vig: 0.35 };
  return { scene, cam, post };
}
function lights(scene, o) {
  const hemi = new THREE.HemisphereLight(o.sky ?? 0xffffff, o.ground ?? 0x404040, o.hemi ?? 0.6);
  const dir = new THREE.DirectionalLight(o.dir ?? 0xffffff, o.dirI ?? 1.5);
  dir.position.set(...(o.dirPos ?? [10, 20, 10])); scene.add(hemi, dir, dir.target);
  return { hemi, dir };
}
const place = (obj, x, y, z, ry = 0) => { obj.position.set(x, y, z); obj.rotation.y = ry; return obj; };
const handMid = (fig, out) => {
  const a = new THREE.Vector3(), b = new THREE.Vector3();
  fig.updateMatrixWorld(true);
  fig.userData.armL.userData.hand.getWorldPosition(a); fig.userData.armR.userData.hand.getWorldPosition(b);
  return out.copy(a).add(b).multiplyScalar(0.5);
};
const handR = (fig, out) => { fig.updateMatrixWorld(true); return fig.userData.armR.userData.hand.getWorldPosition(out); };

function ranges(scene, o) { // distant mountain silhouettes
  for (const [i, r] of o.rows.entries()) {
    const m = makeTerrain({ w: r.w ?? 2400, d: r.d ?? 400, sw: 260, sd: 44, amp: r.amp * 1.3, freq: (r.freq ?? 0.004) * 0.8, oct: 3, peaky: 1.8, seed: 50 + i + (o.seed ?? 0),
      low: r.low, high: r.high, top: r.top, y: r.y ?? 0 });
    m.position.set(r.x ?? 0, 0, r.z); m.rotation.y = r.ry ?? 0; scene.add(m);
  }
}

// ---------------------------------------------------------------- S1 / S3: night peak, the hairline crack
export function scenePeak() {
  const S = base({ sky: { top: 0x02030a, mid: 0x0b1230, bot: 0x1b2246, hMid: 0.08, stars: 1.4, milky: 1.1, milkyAxis: [0.55, 0.25, 0.8],
    sunDir: [-0.45, 0.32, -0.83], sunCol: 0x4a5a8a, sunDisc: 1.2 }, fog: new THREE.FogExp2(0x141a36, 0.0022) });
  const { scene, cam } = S;
  const { hemi } = lights(scene, { sky: 0x3a4a88, ground: 0x07070f, hemi: 0.55, dir: 0xa8bcff, dirI: 1.6, dirPos: [-300, 250, -600] });
  hemi.position.set(0, 1, 0);
  const TOP = 18;
  const peak = makeTerrain({ w: 140, d: 140, sw: 140, sd: 140, amp: 2.5, freq: 0.06, peak: [0, 0, 16, TOP], flat: [0, 0, 2.6, TOP], seed: 3,
    low: 0x141927, high: 0x2f3852 });
  peak.position.set(0, 0, 0); scene.add(peak);
  const rock = tmesh(new THREE.DodecahedronGeometry(0.55, 0), 0x2a3146, { th: 0.015 });
  rock.scale.set(1.3, 0.55, 1.0); rock.position.set(0, TOP + 0.18, 0); scene.add(rock);
  for (let i = 0; i < 9; i++) { const r = tmesh(new THREE.DodecahedronGeometry(0.4 + (i % 3) * 0.25, 0), 0x252b3e, { th: 0.012 });
    const a = i * 0.8 + 1.0, d = 2.2 + (i % 4) * 0.7; r.position.set(Math.cos(a) * d, TOP - 0.1, Math.sin(a) * d * 0.8 + 0.8); r.rotation.set(i, i * 2, 0); scene.add(r); }
  ranges(scene, { rows: [
    { z: -220, amp: 45, y: -30, low: 0x10162a, high: 0x26304e },
    { z: -480, amp: 90, y: -40, low: 0x141c38, high: 0x2c3862, freq: 0.003 },
    { z: -900, amp: 160, y: -50, low: 0x1a2244, high: 0x34406c, freq: 0.0022, w: 3600 },
  ] });
  scene.add(makeCloudSheet({ y: 6, size: 2400, a: 0x5a6a9a, b: 0x1e2648, density: 0.8, scale: 0.006, thr: 0.38 }));
  scene.add(makeCloudSheet({ y: -12, size: 3000, a: 0x46557f, b: 0x161c38, density: 0.9, scale: 0.004, thr: 0.32, seed: 4 }));
  const moon = makeGlow(0x8fa4ff, 200, { intensity: 0.25, pow: 3 }); moon.position.set(-675, 480, -1250); scene.add(moon);

  const rift = makeRift({ w: 30, h: 190, seed: 2.3, width: 0.012 }); scene.add(rift);
  const riftPos = V(28, 236, -690);
  const wisps = makeParticles(500, { origin: [28, 262, -690], spread: [8, 150, 8], vel: [0, -9, 4], turb: 2, life: 7, size: 2.6, colA: 0xc69bff, colB: 0x3c1c70, alpha: 0.0, seed: 11 });
  scene.add(wisps);
  const motes = makeParticles(260, { mode: 'wrap', origin: [0, TOP + 3, -2], spread: [26, 10, 22], vel: [0.1, 0.18, 0.05], turb: 0.6, size: 0.05, colA: 0x9fc0ff, colB: 0xffe3b0, alpha: 0.9, seed: 5 });
  scene.add(motes);

  const xy = place(figure('xiaoyan', { cloth: 0.025 }), 0, TOP + 0.33, 0, PI);
  scene.add(xy);
  S.post = { ...S.post, bloom: [0.85, 0.55, 0.82], rim: 0x8fa8ff, rimStr: 0.75, gain: [0.98, 1.0, 1.08], vig: 0.45 };

  S.update = (t) => {
    if (t < 9) { // S1 0 – 6.5: seated, push in from behind, crack at the top of frame
      xy.position.set(0, TOP + 0.33, 0); xy.userData.pose({ ...POSE.sit, head: -0.32 });
      camKeys(cam, t, [[0, [1.9, TOP + 1.7, 6.2], [-0.8, TOP + 7.5, -40], 38], [6.5, [0.95, TOP + 1.2, 3.6], [-0.5, TOP + 9.0, -40], 36]]);
      rift.material.uniforms.uInt.value = 0.85 + 0.15 * Math.sin(t * 1.7);
      rift.material.uniforms.uWobble.value = 0; wisps.material.uniforms.uAlpha.value = 0;
    } else { // S3 9.5 – 12.5: standing, look up at the crack; purple seeps out
      const lt = t - 9.5;
      xy.position.set(1.9, TOP, 0.0); xy.userData.pose({ ...POSE.lookUp, head: -0.6 });
      camKeys(cam, t, [[9.5, [3.3, TOP + 0.6, 4.8], [14, TOP + 55, -200], 31], [12.5, [3.1, TOP + 0.58, 4.4], [15, TOP + 60, -200], 28]]);
      rift.material.uniforms.uInt.value = 1.15 + 0.35 * Math.sin(lt * 5.0) * sstep(0, 1, lt);
      rift.material.uniforms.uWobble.value = sstep(0, 2, lt) * 1.5;
      wisps.material.uniforms.uAlpha.value = sstep(0.0, 1.5, lt) * 0.9;
    }
    rift.position.copy(riftPos); rift.lookAt(cam.position); rift.rotateZ(-0.32);
  };
  return S;
}

// ---------------------------------------------------------------- S2: the hollowed beast turns to violet ash
export function sceneHusk() {
  const S = base({ sky: { top: 0x03040c, mid: 0x0e1430, bot: 0x241e3c, hMid: 0.06, stars: 1.1, milky: 0.4, sunDir: [-0.6, 0.35, -0.7], sunCol: 0x3a4670, sunDisc: 1 },
    fog: new THREE.FogExp2(0x16152a, 0.012), fov: 34 });
  const { scene, cam } = S;
  lights(scene, { sky: 0x40507f, ground: 0x0a0812, hemi: 0.6, dir: 0x9fb2ff, dirI: 1.4, dirPos: [-30, 30, -20] });
  const ground = makeTerrain({ w: 220, d: 220, sw: 120, sd: 120, amp: 1.6, freq: 0.05, flat: [0, 0, 6, 0], seed: 9, low: 0x1a1c28, high: 0x2c2f40 });
  scene.add(ground);
  ranges(scene, { rows: [{ z: -140, amp: 30, y: -6, low: 0x121528, high: 0x252a44, w: 900 }, { z: -320, amp: 70, y: -20, low: 0x161a34, high: 0x2a3050, w: 1600 }], seed: 3 });
  for (let i = 0; i < 14; i++) { const r = tmesh(new THREE.DodecahedronGeometry(0.25 + (i % 4) * 0.2, 0), 0x252836, { th: 0.01 });
    const a = i * 1.7, d = 3 + (i % 5) * 1.5; r.position.set(Math.cos(a) * d, 0.05, Math.sin(a) * d - 1); r.rotation.set(i, i, 0); scene.add(r); }

  // husk geometry: curled beast-like shell with a spine
  const geo = new THREE.IcosahedronGeometry(1, 5); const p = geo.attributes.position; const rnd = mulberry32(21);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const bump = 0.08 * Math.sin(x * 9 + z * 7) * Math.cos(y * 8 - x * 5) + 0.05 * Math.sin(z * 17 + y * 13);
    x *= 2.1 + bump; y *= 0.95 + bump; z *= 1.25 + bump;
    y += 0.35 * Math.exp(-((z / 0.28) ** 2)) * sstep(-0.2, 0.6, y); // spine ridge
    x += 0.35 * Math.sin(y * 1.5) - 0.25 * (z > 0 ? z : 0);
    if (y < -0.45) y = -0.45 + (y + 0.45) * 0.15;
    p.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  const huskMat = new THREE.ShaderMaterial({
    uniforms: { uDis: { value: -0.3 }, uTime: U.time, uL: { value: V(-0.5, 0.6, -0.4).normalize() } },
    vertexShader: `varying vec3 vW, vN, vO; void main(){ vO = position; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: NOISE + `uniform float uDis, uTime; uniform vec3 uL; varying vec3 vW, vN, vO;
      void main(){ float n = fbm3(vO*2.4 + 3.0); float hN = clamp((vO.y + 0.45)/1.8, 0.0, 1.0);
        float d = n*0.7 + (1.0 - hN)*0.55 - 0.2;
        if (d < uDis) discard;
        float edge = smoothstep(uDis + 0.09, uDis, d);
        vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N; float ndl = dot(N, uL);
        float tone = ndl > 0.35 ? 1.0 : (ndl > -0.15 ? 0.62 : 0.38);
        vec3 b = mix(vec3(0.07,0.035,0.1), vec3(0.2,0.09,0.27), n) * tone;
        float fr = pow(1.0 - abs(dot(N, normalize(cameraPosition - vW))), 3.0);
        float vein = smoothstep(0.035, 0.0, abs(fbm3(vO*5.0) - 0.5));
        vec3 c = b + vec3(0.55,0.22,0.95)*fr*0.55 + vec3(0.7,0.3,1.2)*vein*0.35 + vec3(1.6,0.7,3.0)*edge;
        gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.DoubleSide,
  });
  const husk = new THREE.Mesh(geo, huskMat); husk.position.set(0, 0.62, 0); husk.rotation.y = 0.35; scene.add(husk);
  for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7 - i * 0.07, 6), huskMat);
    sp.position.set(-1.0 + i * 0.42, 1.0 + Math.sin(i * 0.6) * 0.12, 0); sp.rotation.z = -0.5 + i * 0.12; husk.add(sp); }
  const ash = makeParticles(900, { origin: [0, 1.1, 0], spread: [3.8, 1.5, 2.4], vel: [0.5, 1.3, 0.15], turb: 0.7, life: 2.6, size: 0.06, grow: 0.5, colA: 0xe0a8ff, colB: 0x2a1048, alpha: 0, seed: 13 });
  scene.add(ash);
  const glow = new THREE.PointLight(0xa060ff, 0, 12, 2); glow.position.set(0, 1.4, 0.5); scene.add(glow);
  const zy = place(figure('ziyan'), 2.5, 0, 1.5, -2.2); scene.add(zy);
  zy.userData.pose({ ...POSE.crouchHold, head: 0.1 });
  S.post = { ...S.post, bloom: [0.9, 0.5, 0.8], rim: 0x9a88ff, rimStr: 0.6, gain: [1.0, 0.97, 1.08], vig: 0.5 };
  S.update = (t) => {
    const lt = t - 6.5;
    camKeys(cam, t, [[6.5, [-4.6, 1.1, 5.4], [0.3, 0.9, 0], 34], [9.5, [-3.0, 0.95, 6.0], [0.5, 0.85, 0], 32]]);
    huskMat.uniforms.uDis.value = lerp(-0.25, 0.75, ease.inOut(sstep(0.3, 3.0, lt)));
    ash.material.uniforms.uAlpha.value = sstep(0.3, 1.0, lt) * 1.2;
    glow.intensity = 6 * sstep(0.3, 1.2, lt) * (1 - sstep(2.4, 3.0, lt) * 0.6);
  };
  return S;
}

// ---------------------------------------------------------------- S4: the testing stele in the old courtyard
function steleTextures() {
  const runes = canvasTex(256, 768, (c, w, h) => {
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    const r = mulberry32(31); c.strokeStyle = '#fff'; c.lineWidth = 3; c.lineCap = 'round';
    c.strokeRect(14, 14, w - 28, h - 28); c.strokeRect(24, 24, w - 48, h - 48);
    for (let col = 0; col < 4; col++) for (let k = 0; k < 16; k++) {
      const x0 = 46 + col * 52, y0 = 46 + k * 43; c.beginPath();
      for (let s = 0; s < 3; s++) { const ax = x0 + r() * 30, ay = y0 + r() * 30; c.moveTo(ax, ay); c.lineTo(ax + (r() - 0.5) * 26, ay + (r() - 0.5) * 26); }
      c.stroke();
    }
  });
  const text = canvasTex(256, 768, (c, w, h) => {
    c.clearRect(0, 0, w, h); c.fillStyle = '#ffd890'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '400 112px "Ma Shan Zheng"'; c.shadowColor = '#ffb040'; c.shadowBlur = 18;
    c.font = '400 92px "Ma Shan Zheng"';
    ['斗', '之', '力', '三', '段'].forEach((ch, i) => c.fillText(ch, w * 0.5, 232 + i * 92 + (i > 2 ? 26 : 0)));
  });
  return { runes, text };
}
function makeTree() {
  const g = new THREE.Group();
  g.add(tmesh(new THREE.CylinderGeometry(0.32, 0.55, 4.2, 10).translate(0, 2.1, 0), 0x4a3426, { th: 0.02, cast: true }));
  for (const [rx, rz, y, l] of [[0.2, 0.9, 3.0, 2.2], [-0.3, -0.8, 3.3, 2.0], [0.9, 0.2, 3.6, 1.8]]) {
    const b = tmesh(new THREE.CylinderGeometry(0.1, 0.2, l, 8).translate(0, l / 2, 0), 0x4a3426, { th: 0.015, cast: true });
    b.position.y = y; b.rotation.set(rx, 0, rz); g.add(b);
  }
  const r = mulberry32(44);
  for (let i = 0; i < 9; i++) {
    const f = tmesh(new THREE.IcosahedronGeometry(1.3 + r() * 0.7, 1), [0x4d7a36, 0x5f8f40, 0x416b30][i % 3], { th: 0.025, cast: true });
    const a = i * 0.7; f.position.set(Math.cos(a) * (1.2 + r()), 4.6 + r() * 1.6, Math.sin(a) * (1.2 + r())); g.add(f);
  }
  return g;
}
function makeWall(len, o = {}) {
  const g = new THREE.Group();
  g.add(place(tmesh(new THREE.BoxGeometry(len, 2.6, 0.5), o.color ?? 0xd9cdb6, { th: 0.02, receive: true }), 0, 1.3, 0));
  for (const s of [-1, 1]) { const r = tmesh(new THREE.BoxGeometry(len + 0.6, 0.14, 0.95), o.roof ?? 0x39404e, { th: 0.02 }); r.position.set(0, 2.82, s * 0.3); r.rotation.x = s * 0.55; g.add(r); }
  return g;
}
function makeHall() {
  const g = new THREE.Group();
  g.add(place(tmesh(new THREE.BoxGeometry(16, 0.6, 7), 0x8c8577, { th: 0.02 }), 0, 0.3, 0));
  g.add(place(tmesh(new THREE.BoxGeometry(14, 4.4, 5.6), 0xd2c3a6, { th: 0.02 }), 0, 2.8, -0.2));
  for (let i = 0; i < 6; i++) g.add(place(tmesh(new THREE.CylinderGeometry(0.22, 0.22, 4.4, 10), 0x7a2a22, { th: 0.015 }), -6.25 + i * 2.5, 2.8, 2.9));
  for (const s of [-1, 1]) { const r = tmesh(new THREE.BoxGeometry(17.5, 0.3, 5.2), 0x353b48, { th: 0.03 }); r.position.set(0, 6.0, s * 1.85 - 0.2); r.rotation.x = s * 0.5; g.add(r); }
  g.add(place(tmesh(new THREE.BoxGeometry(17.8, 0.35, 0.35), 0x2a2f3a, { th: 0.02 }), 0, 6.95, -0.2));
  return g;
}
export function sceneCourt() {
  const S = base({ sky: { top: 0x5f93cf, mid: 0xf0c48e, bot: 0xf7dcae, hMid: 0.1, sunDir: [-0.9, 0.22, -0.4], sunCol: 0xffb35a, sunDisc: 0.6, cloud: 0.6, cloudCol: 0xfff0d6, cloudCol2: 0xc9937a },
    fog: new THREE.Fog(0xf0caa0, 50, 260) });
  const { scene, cam } = S;
  const { dir } = lights(scene, { sky: 0xbfd6ff, ground: 0x8a6a4a, hemi: 0.75, dir: 0xffd29a, dirI: 2.2, dirPos: [-18, 9, -8] });
  dir.castShadow = true; dir.shadow.mapSize.set(2048, 2048); Object.assign(dir.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 60 });
  dir.shadow.bias = -0.0008; dir.shadow.camera.updateProjectionMatrix();
  const tiles = canvasTex(512, 512, (c, w, h) => {
    const r = mulberry32(5); c.fillStyle = '#6b6258'; c.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = 150 + r() * 40 | 0; c.fillStyle = `rgb(${v},${v - 8},${v - 20})`; c.fillRect(x * 128 + 4, y * 128 + 4, 120, 120); }
  }, { repeat: 24 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(96, 96).rotateX(-PI / 2), toon(0xffffff, { map: tiles })); floor.receiveShadow = true; scene.add(floor);
  // stele
  const { runes, text } = steleTextures();
  const stele = new THREE.Group(); scene.add(stele);
  stele.add(place(tmesh(new THREE.BoxGeometry(2.0, 0.45, 1.1), 0x5a5650, { th: 0.02, receive: true, cast: true }), 0, 0.225, 0));
  const body = tmesh(new THREE.BoxGeometry(1.3, 3.6, 0.46), 0x17171d, { th: 0.022, cast: true, rimStr: { value: 0.25 } });
  body.position.y = 0.45 + 1.8; stele.add(body);
  stele.add(place(tmesh(new THREE.BoxGeometry(1.5, 0.2, 0.62), 0x22222a, { th: 0.02, cast: true }), 0, 4.35, 0));
  const engrave = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.5), new THREE.MeshBasicMaterial({ map: runes, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x3a3a46 }));
  engrave.position.set(0, 2.25, 0.232); stele.add(engrave);
  const runeGlow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.5), new THREE.MeshBasicMaterial({ map: runes, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x000000 }));
  runeGlow.position.set(0, 2.25, 0.234); stele.add(runeGlow);
  const textM = new THREE.MeshBasicMaterial({ map: text, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x000000 });
  const textP = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 3.5), textM); textP.position.set(0, 2.25, 0.236); stele.add(textP);
  const sGlow = new THREE.PointLight(0xffb050, 0, 6, 2); sGlow.position.set(0, 2.4, 1.2); scene.add(sGlow);
  // set dressing
  const tree = makeTree(); tree.position.set(-7.5, 0, -4); scene.add(tree);
  const back = makeWall(40); back.position.set(0, 0, -13); scene.add(back);
  for (const s of [-1, 1]) { const w = makeWall(30); w.position.set(s * 15, 0, 1); w.rotation.y = PI / 2; scene.add(w); }
  const hall = makeHall(); hall.position.set(4, 0, -20); scene.add(hall);
  const kids = [];
  for (let i = 0; i < 5; i++) { const k = figure(i % 2 ? 'kidA' : 'boy', { cast: true, robe: [0x5a6a7a, 0x6a5a7a, 0x7a6a55, 0x55705a, 0x6a6a6a][i] });
    place(k, -2.3 - i * 0.78, 0, 2.0 + (i % 2) * 0.35, PI / 2 + 0.3); k.userData.pose({ armL: [0.1, -0.1], armR: [0.1, 0.1], headTurn: (i % 3 - 1) * 0.2 }); scene.add(k); kids.push(k); }
  const elder = place(figure('elder', { cast: true }), 2.0, 0, -1.3, 0.4); elder.visible = false; elder.userData.pose({ ...POSE.behind }); scene.add(elder);
  const boy = figure('boy', { cast: true }); scene.add(boy);
  const xy = figure('xiaoyan', { cast: true, cloth: 0.02 }); scene.add(xy);
  const pill = makeGlow(0xffb050, 0.2, { intensity: 1.4, pow: 2.5 }); scene.add(pill);
  const pillCore = makeGlow(0xffffff, 0.05, { intensity: 2.5, pow: 1.5 }); scene.add(pillCore);
  const pillFl = makeFlames([{ p: [0, 0, 0], h: 0.12, w: 0.6, seed: 0.3 }, { p: [0.01, 0, 0.005], h: 0.09, w: 0.7, seed: 0.7 }], { gain: 1.3, tint: 0xffd0a0 });
  scene.add(pillFl);
  const pillLight = new THREE.PointLight(0xffa040, 0, 1.6, 2); scene.add(pillLight);
  S.post = { ...S.post, bloom: [0.55, 0.4, 0.95], rim: 0xffd7a0, rimStr: 0.35, gain: [1.04, 1.0, 0.94], sat: 1.05, vig: 0.4 };
  const v = new THREE.Vector3();
  S.update = (t) => {
    const lt = t - 12.5;
    runeGlow.material.color.setScalar(0); textM.color.setScalar(0); sGlow.intensity = 0;
    pill.visible = pillCore.visible = pillFl.visible = false; pillLight.intensity = 0;
    if (t < 16.5) { // A: the boy reads 三段
      boy.visible = true; xy.visible = false; kids.forEach((k) => (k.visible = true));
      place(boy, -0.15, 0, 0.66, PI); boy.userData.pose(lerpPose(POSE.stand, POSE.touch, ease.out(sstep(0.2, 0.8, lt))));
      const on = sstep(0.85, 1.05, lt) * (1 - 0.25 * sstep(1.05, 1.6, lt));
      textM.color.setScalar(on * 2.2); runeGlow.material.color.setRGB(on * 0.5, on * 0.35, on * 0.15); sGlow.intensity = on * 4;
      camKeys(cam, t, [[12.5, [3.4, 1.55, 4.3], [-0.1, 1.85, 0.2], 38], [16.5, [2.5, 1.65, 3.4], [-0.1, 2.0, 0.2], 36]]);
    } else if (t < 19.2) { // B: Xiao Yan's palm: the stone stays dark
      boy.visible = false; xy.visible = true; kids.forEach((k) => (k.visible = true));
      place(xy, 0.05, 0, 0.78, PI); xy.userData.pose(lerpPose(POSE.stand, POSE.touch, ease.out(sstep(16.6, 17.2, t))));
      const flick = sstep(17.3, 17.45, t) * (1 - sstep(17.45, 18.1, t));
      runeGlow.material.color.setRGB(flick * 0.6, flick * 0.5, flick * 0.8);
      camKeys(cam, t, [[16.5, [2.6, 0.9, 3.8], [-0.1, 2.0, 0.2], 40], [19.2, [2.2, 0.95, 3.3], [-0.1, 2.1, 0.2], 38]]);
    } else { // C: under the tree, a pill burning gold-red in his hands
      xy.visible = false; boy.visible = true; kids.forEach((k) => (k.visible = false)); elder.visible = false;
      place(boy, -6.0, 0, -2.4, 0.75); boy.userData.pose(POSE.crouchHold);
      handMid(boy, v); v.y += 0.06; v.z += 0.03;
      pill.position.copy(v); pillCore.position.copy(v); pillFl.position.copy(v).add(V(0, -0.03, 0)); pillLight.position.copy(v).add(V(0, 0.2, 0.2));
      pill.visible = pillCore.visible = pillFl.visible = true; pillLight.intensity = 0.5 + 0.1 * Math.sin(t * 9);
      camKeys(cam, t, [[19.2, [-4.2, 0.95, -0.5], [-6.0, 0.5, -2.4], 36], [21.5, [-4.5, 0.88, -0.85], [-6.0, 0.48, -2.42], 33]]);
    }
  };
  return S;
}

// ---------------------------------------------------------------- S5: the flower valley pavilion (云韵)
export function sceneFlowers() {
  const S = base({ sky: { top: 0x2b2f5e, mid: 0xd98a86, bot: 0xf8c79c, hMid: 0.09, sunDir: [0.75, 0.05, -0.65], sunCol: 0xff9a66, sunDisc: 0.7, cloud: 0.55, cloudCol: 0xffc7a0, cloudCol2: 0x7a587a },
    fog: new THREE.Fog(0xe3a690, 30, 330), fov: 35 });
  const { scene, cam } = S;
  lights(scene, { sky: 0xb4a8e0, ground: 0x704a4a, hemi: 0.75, dir: 0xffb98a, dirI: 2.0, dirPos: [40, 8, -35] });
  scene.add(makeTerrain({ w: 500, d: 500, sw: 150, sd: 150, amp: 3, freq: 0.02, flat: [0, 0, 18, 0], edgeUp: 60, seed: 17, low: 0x5c6a4a, high: 0x7a6a7a, top: 0x9a8aa0 }));
  ranges(scene, { rows: [{ z: -320, amp: 70, y: -10, low: 0x6a5a7a, high: 0x9a7a9a, w: 1600 }], seed: 9 });
  // flowers
  const shape = new THREE.Shape(); for (let i = 0; i <= 10; i++) { const a = (i / 10) * PI * 2, r = i % 2 ? 0.05 : 0.13; i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(r, 0); }
  const fg = new THREE.ShapeGeometry(shape).rotateX(-PI / 2);
  const N = 9000, fl = new THREE.InstancedMesh(fg, toon(0xffffff, { side: THREE.DoubleSide, rimStr: { value: 0.1 } }), N);
  const r = mulberry32(8), d = new THREE.Object3D(), cc = new THREE.Color(); const pal = [0xf6a9c4, 0xfff0f4, 0xe0b8ec, 0xf3c6d6, 0xffffff];
  for (let i = 0; i < N; i++) { const rad = 3.6 + Math.pow(r(), 0.7) * 70, a = r() * PI * 2;
    d.position.set(Math.cos(a) * rad, 0.15 + r() * 0.35, Math.sin(a) * rad); d.rotation.set((r() - 0.5) * 0.6, r() * 6, (r() - 0.5) * 0.6); d.scale.setScalar(0.8 + r() * 1.1);
    d.updateMatrix(); fl.setMatrixAt(i, d.matrix); fl.setColorAt(i, cc.setHex(pal[i % 5])); }
  scene.add(fl);
  // pavilion
  const pav = new THREE.Group(); scene.add(pav);
  pav.add(place(tmesh(new THREE.CylinderGeometry(3.0, 3.2, 0.4, 8), 0xb8ab98, { th: 0.02 }), 0, 0.2, 0));
  for (const [x, z] of [[1.75, 1.75], [-1.75, 1.75], [1.75, -1.75], [-1.75, -1.75]]) pav.add(place(tmesh(new THREE.CylinderGeometry(0.13, 0.13, 2.8, 10), 0x8a2a22, { th: 0.015 }), x, 1.8, z));
  const roof = tmesh(new THREE.ConeGeometry(3.4, 1.4, 4, 1), 0x2e3442, { th: 0.03 }); roof.rotation.y = PI / 4; roof.position.y = 3.9; pav.add(roof);
  pav.add(place(tmesh(new THREE.SphereGeometry(0.16, 12, 10), 0xd8a63a, { th: 0.01 }), 0, 4.65, 0));
  pav.add(place(tmesh(new THREE.BoxGeometry(3.7, 0.18, 3.7), 0x3a3f4c, { th: 0.02 }), 0, 3.2, 0));
  const yy = place(figure('yunyun', { cloth: 0.03 }), -0.62, 0.4, 0.1, PI / 2 - 0.15); scene.add(yy); yy.userData.pose({ armL: [-0.15, -0.1], armR: [-0.15, 0.1] });
  const xy = place(figure('xiaoyan', { cloth: 0.03 }), 0.72, 0.4, -0.05, -PI / 2 - 0.1); scene.add(xy);
  const petals = makeParticles(1400, { mode: 'wrap', origin: [0, 3, 0], spread: [34, 12, 34], vel: [0.7, -0.45, 0.25], turb: 0.8, size: 0.055, colA: 0xffb7d0, colB: 0xfff4f8, alpha: 0.95, petal: true, blend: 'normal', seed: 9 });
  scene.add(petals);
  S.post = { ...S.post, bloom: [0.6, 0.6, 0.9], rim: 0xffc4a0, rimStr: 0.55, gain: [1.03, 0.98, 1.0], sat: 1.05, vig: 0.4 };
  S.update = (t) => {
    const lt = t - 21.5;
    xy.userData.pose(lerpPose(POSE.stand, POSE.salute, ease.inOut(sstep(1.0, 2.1, lt))));
    xy.userData.upper.rotation.x = 0.12 + 0.35 * sstep(1.8, 2.6, lt);
    yy.userData.pose({ armL: [-0.15, -0.1], armR: [-0.15, 0.1], head: 0.08 * sstep(2.2, 3.0, lt) });
    camKeys(cam, t, [[21.5, [-11.5, 1.5, 8.5], [0, 1.5, 0], 30], [25, [-8.6, 1.4, 10.2], [0.1, 1.45, 0], 28]]);
  };
  return S;
}

// ---------------------------------------------------------------- S6: the cliff of 星陨阁 above the sea of clouds (药老)
function makePagoda(levels = 5) {
  const g = new THREE.Group(); let y = 0;
  for (let i = 0; i < levels; i++) { const w = 6 - i * 0.9;
    g.add(place(tmesh(new THREE.BoxGeometry(w, 2.2, w), 0x3a2e2c, { th: 0.04 }), 0, y + 1.1, 0));
    const r = tmesh(new THREE.ConeGeometry(w * 0.9, 1.4, 4), 0x23262e, { th: 0.04 }); r.rotation.y = PI / 4; r.position.y = y + 2.7; g.add(r); y += 2.9; }
  g.add(place(tmesh(new THREE.CylinderGeometry(0.06, 0.12, 2.5, 6), 0xc89a3a, { th: 0.02 }), 0, y + 1.0, 0));
  return g;
}
export function sceneCliff() {
  const S = base({ sky: { top: 0x4f86cc, mid: 0xffd59c, bot: 0xfff0d2, hMid: 0.07, sunDir: [-0.35, 0.07, -1], sunCol: 0xffc070, sunDisc: 1.0, cloud: 0.35, cloudCol: 0xffe8c8, cloudCol2: 0xd8a080 },
    fog: new THREE.Fog(0xf8dcb0, 80, 900), fov: 32 });
  const { scene, cam } = S;
  lights(scene, { sky: 0xd0e0ff, ground: 0xa07050, hemi: 0.7, dir: 0xffd09a, dirI: 2.0, dirPos: [-30, 8, -100] });
  scene.add(makeTerrain({ w: 40, d: 40, sw: 80, sd: 80, amp: 0.8, freq: 0.15, flat: [0, -3, 5, 0], drop: [-8, 60], seed: 23, low: 0x5a5048, high: 0x8a7a68 }));
  for (const [x, z, s] of [[-3, -7.5, 1.4], [4, -8, 1.1], [-6, -4, 0.9], [5.5, -3, 0.8]]) { const r = tmesh(new THREE.DodecahedronGeometry(s, 0), 0x6a5e52, { th: 0.02 }); r.position.set(x, 0, z); r.rotation.set(x, z, 0); scene.add(r); }
  const pine = new THREE.Group(); pine.add(tmesh(new THREE.CylinderGeometry(0.1, 0.18, 2.4, 8).translate(0, 1.2, 0), 0x4a3426));
  for (let i = 0; i < 3; i++) { const c = tmesh(new THREE.ConeGeometry(1.1 - i * 0.25, 0.9, 9), 0x3f6a3a, { th: 0.02 }); c.position.y = 1.7 + i * 0.55; c.scale.y = 0.6; pine.add(c); }
  pine.position.set(-4.2, 0, -7.4); pine.rotation.z = 0.25; scene.add(pine);
  for (const [i, y, d] of [[0, -18, 0.85], [1, -30, 1.0], [2, -45, 0.9]]) scene.add(makeCloudSheet({ y, size: 3000, a: 0xfff6ea, b: 0xe6b38e, density: d, scale: 0.004 + i * 0.002, thr: 0.25 + i * 0.05, seed: i * 3.1, speed: 2 }));
  ranges(scene, { rows: [{ z: -520, amp: 120, y: -60, low: 0x8a7aa0, high: 0xd8b8c0, w: 2400, freq: 0.0032 }], seed: 2 });
  const pag = makePagoda(6); pag.position.set(-70, -8, -120); pag.rotation.y = 0.4; scene.add(pag);
  const peakP = makeTerrain({ w: 60, d: 60, sw: 40, sd: 40, amp: 2, freq: 0.08, peak: [0, 0, 14, 4], seed: 4, low: 0x4a4440, high: 0x6a6058 }); peakP.position.set(-70, -30, -120); scene.add(peakP);
  const yl = place(figure('yaolao', { cloth: 0.035 }), 0, 0, -6.6, PI); scene.add(yl); yl.userData.pose(POSE.behind);
  const xy = place(figure('xiaoyan', { cloth: 0.02 }), 0.05, 0, -4.7, PI); scene.add(xy);
  S.post = { ...S.post, bloom: [0.7, 0.6, 0.88], rim: 0xffe0b0, rimStr: 0.7, gain: [1.04, 1.0, 0.95], vig: 0.38 };
  S.update = (t) => {
    const lt = t - 25;
    const bow = sstep(0.6, 1.4, lt) * (1 - sstep(2.3, 3.1, lt));
    xy.userData.pose({ ...POSE.kneel, lean: 0.1 + 0.95 * bow, armL: [-0.2 - 1.0 * bow, -0.15], armR: [-0.2 - 1.0 * bow, 0.15], head: 0.2 * bow });
    yl.userData.pose({ ...POSE.behind, head: -0.08 + 0.1 * sstep(2.0, 3.0, lt) });
    camKeys(cam, t, [[25, [7.4, 1.5, -2.2], [0, 0.95, -5.9], 33], [28.5, [6.3, 1.3, -3.2], [0, 0.9, -5.9], 30]]);
  };
  return S;
}

// ---------------------------------------------------------------- S7: 帝炎 tears the sky open into a gate
export function sceneSummit() {
  const S = base({ sky: { top: 0x23142f, mid: 0xc23e2a, bot: 0xffa25a, hMid: 0.08, sunDir: [0.85, 0.04, -0.55], sunCol: 0xff6a2a, sunDisc: 0.8, cloud: 0.85, cloudCol: 0xffa06a, cloudCol2: 0x4a2232 },
    fog: new THREE.FogExp2(0x8a3a2e, 0.0016), fov: 42 });
  const { scene, cam } = S;
  lights(scene, { sky: 0xff9a7a, ground: 0x301820, hemi: 0.55, dir: 0xff8a50, dirI: 2.2, dirPos: [300, 20, -200] });
  const TOP = 25;
  const peak = makeTerrain({ w: 180, d: 180, sw: 150, sd: 150, amp: 3, freq: 0.05, peak: [0, 0, 22, TOP + 5], flat: [0, 0, 3.0, TOP], seed: 31, low: 0x2a1a22, high: 0x5a3434 });
  scene.add(peak);
  ranges(scene, { rows: [
    { z: -300, amp: 60, y: -20, low: 0x3a1a24, high: 0x6a2e32 },
    { z: -700, amp: 140, y: -40, low: 0x4a2030, high: 0x8a3a3a, freq: 0.0025, w: 3600 },
    { z: 300, amp: 60, y: -20, low: 0x2a1420, high: 0x4a2228, ry: PI },
  ], seed: 6 });
  scene.add(makeCloudSheet({ y: 4, size: 3000, a: 0xff9a6a, b: 0x5a2230, density: 0.75, scale: 0.005, thr: 0.36 }));
  const GATE = V(0, 380, -620);
  const rift = makeRift({ w: 280, h: 440, seed: 5.7, width: 0.006, inside: 0x2a2236, edge: 0xffa050, glow: 0xff5a20 }); rift.position.copy(GATE); scene.add(rift);
  const ring = makeGlow(0xffd8a0, 10, { intensity: 0, pow: 1.4, depthTest: false }); ring.position.copy(GATE); scene.add(ring);
  const fam = [
    place(figure('xiaoyan', { cloth: 0.05 }), 0, TOP, 0, PI),
    place(figure('xuner', { cloth: 0.05 }), -1.4, TOP, 1.6, PI), place(figure('cailin', { cloth: 0.05 }), 1.4, TOP, 1.6, PI),
    place(figure('xiao'), -0.5, TOP, 2.4, PI), place(figure('lin'), 0.5, TOP, 2.4, PI),
  ];
  fam.forEach((f) => scene.add(f));
  const famStart = fam.map((f) => f.position.clone());
  const auras = fam.map((f, i) => { const g = makeGlow(i ? 0xffc890 : 0xffa040, 7, { intensity: 0 }); scene.add(g); return g; });
  const palm = makeFlames([0, 1, 2, 3, 4].map((i) => ({ p: [Math.sin(i * 2.4) * 0.05, 0, Math.cos(i * 2.4) * 0.05], h: 0.5 + i * 0.08, w: 0.5, seed: i * 0.21 })), { gain: 1.4, tint: 0xffd090 });
  scene.add(palm);
  const palmGlow = makeGlow(0xff9a40, 2, { intensity: 0 }); scene.add(palmGlow);
  const palmLight = new THREE.PointLight(0xffa050, 0, 12, 2); scene.add(palmLight);
  const hand = new THREE.Vector3();
  fam[0].userData.pose(POSE.raiseR); handR(fam[0], hand);
  const pts = []; const start = hand.clone();
  for (let i = 0; i <= 24; i++) { const u = i / 24; const e = Math.pow(u, 1.15); const a = u * PI * 5.2, rad = 4 + 46 * Math.sin(u * PI) * (1 - u * 0.3);
    pts.push(V(start.x + Math.cos(a) * rad * sstep(0, 0.12, u), lerp(start.y, GATE.y, e), lerp(start.z, GATE.z, e * e) + Math.sin(a) * rad * sstep(0, 0.12, u))); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const dragon = makeFireTrail(curve, { radius: 15, tail: 0.7, gain: 2.2, root: 0.04, tint: 0xffe0b0 }); scene.add(dragon);
  const head = makeGlow(0xffc070, 18, { intensity: 0, pow: 2 }); scene.add(head);
  const embers = makeParticles(500, { origin: [0, TOP + 3, 0], spread: [30, 6, 30], vel: [0, 2.5, 0], turb: 1, life: 4, size: 0.12, colA: 0xffd090, colB: 0xff4010, alpha: 0, seed: 17 });
  scene.add(embers);
  S.post = { ...S.post, bloom: [0.95, 0.55, 0.82], rim: 0xffa070, rimStr: 0.75, gain: [1.05, 0.97, 0.92], sat: 1.08, vig: 0.42 };
  const tmp = new THREE.Vector3();
  S.update = (t) => {
    const lt = t - 28.5;
    const raise = ease.out(sstep(0.4, 1.1, lt));
    fam[0].userData.pose(lerpPose(POSE.stand, POSE.raiseR, raise));
    for (let i = 1; i < 5; i++) fam[i].userData.pose({ head: -0.35 * sstep(1.5, 3.5, lt), armL: [0, -0.15], armR: [0, 0.15] });
    // ascent toward the gate
    const asc = ease.in(sstep(5.4, 8.2, lt));
    fam.forEach((f, i) => { tmp.copy(GATE).sub(famStart[i]).multiplyScalar(asc * 0.22); f.position.copy(famStart[i]).add(tmp); f.position.y += Math.sin(lt * 2 + i) * 0.1 * asc;
      auras[i].position.copy(f.position).add(V(0, 1.0 * (i > 2 ? 0.64 : 1), 0)); auras[i].material.uniforms.uInt.value = sstep(5.2, 6.0, lt) * 0.9; });
    handR(fam[0], hand);
    const ig = sstep(0.9, 1.5, lt) * (1 - sstep(1.6, 2.0, lt) * 0.6);
    palm.position.copy(hand).add(V(0, 0.05, 0)); palm.material.uniforms.uGain.value = 1.6 * ig;
    palmGlow.position.copy(hand); palmGlow.material.uniforms.uInt.value = 1.4 * ig; palmLight.position.copy(hand).add(V(0, 0.4, 0.5)); palmLight.intensity = 30 * ig;
    const hp = ease.inOut(sstep(1.6, 3.5, lt));
    dragon.material.uniforms.uHead.value = hp * 1.02; dragon.visible = lt > 1.55 && lt < 4.4;
    dragon.material.uniforms.uGain.value = 1.6 * (1 - sstep(3.5, 4.3, lt));
    head.position.copy(curve.getPointAt(clamp(hp))); head.scale.setScalar(lerp(1, 40, hp)); head.material.uniforms.uInt.value = (lt > 1.6 && lt < 3.6) ? 1.2 : 0;
    const open = ease.out(sstep(3.5, 5.6, lt));
    const ru = rift.material.uniforms; ru.uOpen.value = open * 0.95; ru.uInt.value = 1 + 2.5 * sstep(3.4, 3.6, lt) * (1 - sstep(3.6, 4.6, lt)); ru.uWobble.value = open;
    ring.scale.setScalar(lerp(10, 1400, ease.out(sstep(3.5, 4.8, lt)))); ring.material.uniforms.uInt.value = 1.2 * sstep(3.45, 3.55, lt) * (1 - sstep(3.6, 4.8, lt));
    embers.material.uniforms.uAlpha.value = sstep(1.0, 2.0, lt);
    if (lt < 1.7) camKeys(cam, t, [[28.5, [3.6, TOP + 1.5, 9.8], [0, TOP + 2.4, -4], 40], [30.2, [3.0, TOP + 1.4, 8.6], [0, TOP + 2.8, -4], 38]]);
    else if (lt < 4.1) { // track the dragon head
      camKeys(cam, t, [[30.2, [120, 55, 120], [0, 118, -150], 60], [32.6, [130, 62, 132], [0, 150, -210], 60]]);
    } else camKeys(cam, t, [[32.6, [46, TOP + 9, 74], [0, 130, -420], 52], [36.5, [40, TOP + 16, 66], [0, 150, -440], 50]]);
  };
  return S;
}

// ---------------------------------------------------------------- S8: the void between worlds
export function sceneTunnel() {
  const S = base({ fov: 44 });
  const { scene, cam } = S;
  scene.background = col(0x05040a);
  lights(scene, { sky: 0x9a90c0, ground: 0x2a2030, hemi: 0.5, dir: 0xffb070, dirI: 1.2, dirPos: [0, 5, 5] });
  const tunM = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: NOISE + `uniform float uTime; varying vec3 vP;
      void main(){ float a = atan(vP.y, vP.x); float z = vP.z;
        float tw = a + z*0.004 + uTime*0.25; float zz = z*0.01 + uTime*1.6;
        vec3 c3 = vec3(cos(tw), sin(tw), 0.0);
        float n = fbm3(vec3(c3.xy*1.1, zz)); float n2 = fbm3(vec3(c3.xy*3.2 + 7.0, zz*2.5));
        float st = smoothstep(0.58, 0.86, n2);
        vec3 c = mix(vec3(0.03,0.025,0.06), vec3(0.3,0.26,0.42), n*n*1.6) + vec3(0.8,0.7,1.2)*st*0.55 + vec3(1.4,0.8,0.35)*smoothstep(0.8, 0.9, n2)*0.7;
        c *= 0.55 + 0.45*smoothstep(-900.0, -200.0, z);
        gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false,
  });
  const tun = new THREE.Mesh(new THREE.CylinderGeometry(70, 70, 1400, 64, 40, true).rotateX(PI / 2), tunM); tun.position.z = -300; scene.add(tun);
  const streaks = makeParticles(1600, { mode: 'wrap', origin: [0, 0, -100], spread: [120, 120, 500], vel: [0, 0, 160], turb: 0, size: 0.5, colA: 0xb8a8ff, colB: 0xffd0a0, alpha: 0.9, seed: 3 });
  scene.add(streaks);
  const shM = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uGain: { value: 1 } },
    vertexShader: `varying vec3 vN, vV; varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -mv.xyz; vN = normalMatrix*normal; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: NOISE + `uniform float uTime, uGain; varying vec3 vN, vV; varying vec2 vUv;
      void main(){ float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float n = fbm(vUv*vec2(10.0, 5.0) + vec2(uTime*0.4, -uTime*1.2));
        vec3 c = vec3(1.5,0.55,0.12)*(pow(fr,2.2)*0.5 + n*fr*0.25 + 0.006 + 0.012*n)*uGain; gl_FragColor = vec4(c, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const shield = new THREE.Mesh(new THREE.SphereGeometry(3.2, 48, 32), shM); shield.position.y = 1.0; scene.add(shield);
  const shFl = makeFlames(Array.from({ length: 40 }, (_, i) => { const a = (i / 40) * PI * 2; return { p: [Math.cos(a) * 2.9, -1.4 + (i % 3) * 0.2, Math.sin(a) * 2.9], h: 1.2 + (i % 4) * 0.3, w: 0.5, seed: i * 0.13, int: 0.5 }; }), { gain: 0.9, tint: 0xffc890 });
  shFl.position.y = 1.0; scene.add(shFl);
  const people = [['xiaoyan', 0, -0.6, 0], ['xuner', -1.1, 0.3, 0.2], ['cailin', 1.1, 0.3, -0.2], ['xiao', -0.45, 0.9, 0.1], ['lin', 0.5, 0.95, 0]].map(([n, x, z, ry]) => {
    const f = place(figure(n, { cloth: 0.06 }), x, -1.0, z, PI + ry); scene.add(f); return f; });
  people[4].userData.pose({ armR: [-1.3, -0.2], armL: [0, -0.15] });
  people[3].userData.pose({ armL: [-0.6, 0.3], armR: [0, 0.15] });
  const linFlame = makeFlames([{ p: [0, 0, 0], h: 0.25, w: 0.6, seed: 0.4 }], { gain: 1.4, tint: 0xfff0b0 }); scene.add(linFlame);
  // the passing presence
  const pres = new THREE.Group(); scene.add(pres);
  pres.add(new THREE.Mesh(new THREE.SphereGeometry(22, 32, 24), new THREE.MeshBasicMaterial({ color: 0x07080d })));
  const prRim = new THREE.Mesh(new THREE.SphereGeometry(23, 32, 24), new THREE.ShaderMaterial({
    uniforms: { uInt: { value: 1 } },
    vertexShader: `varying vec3 vN, vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vV = -mv.xyz; vN = normalMatrix*normal; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uInt; varying vec3 vN, vV; void main(){ float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0); gl_FragColor = vec4(vec3(0.55,0.75,1.3)*fr*uInt, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pres.add(prRim);
  const rings = [0x8fe8ff, 0xffe08a, 0xd8d0ff].map((c, i) => { const m = new THREE.Mesh(new THREE.TorusGeometry(27 + i * 5, 0.35, 8, 96), new THREE.MeshBasicMaterial({ color: col(c).multiplyScalar(1.6) }));
    m.rotation.set(1.2 + i * 0.5, i * 0.8, 0); pres.add(m); return m; });
  const presGlow = makeGlow(0x8ab8ff, 140, { intensity: 0.2 }); pres.add(presGlow);
  const endLight = makeGlow(0xeef4ff, 420, { intensity: 0.7, pow: 2.5 }); endLight.position.set(0, 0, -940); scene.add(endLight);
  const spark = makeGlow(0xffffff, 6, { intensity: 0, pow: 1.2, depthTest: false }); scene.add(spark);
  S.post = { ...S.post, bloom: [0.8, 0.55, 0.9], rim: 0xffb070, rimStr: 0.7, gain: [1.02, 0.98, 1.06], vig: 0.55 };
  const v = new THREE.Vector3();
  S.update = (t) => {
    const lt = t - 36.5;
    const pz = lerp(-520, 260, ease.inOut(sstep(0.6, 4.4, lt)));
    pres.position.set(-95, 10, pz); rings.forEach((r, i) => { r.rotation.z = t * (0.3 + i * 0.15); r.rotation.x = 1.2 + i * 0.5 + t * 0.1; });
    const contact = sstep(2.55, 2.7, lt) * (1 - sstep(2.7, 3.2, lt));
    shM.uniforms.uGain.value = 1 + 1.8 * contact; prRim.material.uniforms.uInt.value = 1 + 3 * contact;
    spark.position.set(-30, 3, pz * 0.1); spark.scale.setScalar(6 + 30 * contact); spark.material.uniforms.uInt.value = 2.5 * contact;
    people[0].userData.pose({ headTurn: -0.9 * sstep(2.0, 2.6, lt) * (1 - sstep(3.6, 4.4, lt)), armL: [0, -0.15], armR: [0, 0.15] });
    handR(people[4], v); linFlame.position.copy(v);
    people.forEach((f, i) => (f.position.y = -1.0 + Math.sin(t * 1.3 + i) * 0.04));
    camKeys(cam, t, [[36.5, [-3.2, 2.5, 9.0], [-8, 0.8, -30], 44], [41.5, [-2.6, 2.2, 7.6], [-9, 0.8, -30], 42]]);
  };
  return S;
}

// ---------------------------------------------------------------- S9–S11: the northern ice plain, the violet tide, 佛怒火莲
function makeLotus() {
  const g = new THREE.Group();
  const petal = new THREE.PlaneGeometry(1, 1, 6, 14); const p = petal.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i) * 2, v = p.getY(i) + 0.5;
    const w = Math.pow(Math.sin(PI * clamp(v * 0.96 + 0.02)), 0.75) * (1 - 0.35 * v) * 0.42;
    p.setXYZ(i, x * w, v * 1.0, x * x * w * 0.5 + v * v * 0.22); }
  petal.computeVertexNormals();
  const mk = (c) => new THREE.ShaderMaterial({
    uniforms: { uCol: { value: col(c) }, uTime: U.time, uGain: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: NOISE + `uniform vec3 uCol; uniform float uTime, uGain; varying vec2 vUv;
      void main(){ float e = smoothstep(0.28, 0.5, abs(vUv.x - 0.5)); float vein = smoothstep(0.04, 0.0, abs(vUv.x - 0.5));
        float n = vnoise(vec2(vUv.x*6.0, vUv.y*5.0 - uTime*3.0));
        float k = (0.25 + e*1.3 + vein*0.9 + n*0.35)*(1.0 - vUv.y*0.25);
        vec3 c = uCol*k*0.75 + vec3(1.0)*smoothstep(0.2, 0.0, vUv.y)*0.35;
        gl_FragColor = vec4(c*uGain, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const cols = [0x3fe6c8, 0xe8f4ff, 0xffc23a, 0xff5a1f, 0xb06bff, 0x5ac8ff, 0xff8a3a, 0x9aff6a];
  const inner = [], outer = [];
  for (let i = 0; i < 8; i++) { const piv = new THREE.Group(); piv.rotation.y = (i / 8) * PI * 2; const m = new THREE.Mesh(petal, mk(cols[i])); m.scale.setScalar(0.75); piv.add(m); g.add(piv); inner.push(m); }
  for (let i = 0; i < 10; i++) { const piv = new THREE.Group(); piv.rotation.y = (i / 10) * PI * 2 + 0.3; const m = new THREE.Mesh(petal, mk(cols[(i + 3) % 8])); piv.add(m); g.add(piv); outer.push(m); }
  const core = makeGlow(0xfff4d8, 0.26, { intensity: 0.6, pow: 2.2 }); core.position.y = 0.25; g.add(core);
  const halo = makeGlow(0xffb060, 2.2, { intensity: 0.5, pow: 2.6 }); halo.position.y = 0.3; g.add(halo);
  g.userData.set = (open, gain) => {
    inner.forEach((m) => { m.rotation.x = lerp(-0.15, -0.55, open); m.material.uniforms.uGain.value = gain; });
    outer.forEach((m) => { m.rotation.x = lerp(-0.25, -1.15, open); m.material.uniforms.uGain.value = gain; });
    core.material.uniforms.uInt.value = 1.2 * gain; halo.material.uniforms.uInt.value = 0.35 * gain;
  };
  return g;
}
function iceTex() {
  return canvasTex(1024, 1024, (c, w, h) => {
    const r = mulberry32(12); c.fillStyle = '#e4ecf3'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 2400; i++) { c.fillStyle = `rgba(${170 + r() * 60 | 0},${195 + r() * 50 | 0},${220 + r() * 35 | 0},0.25)`; c.beginPath(); c.arc(r() * w, r() * h, 6 + r() * 40, 0, PI * 2); c.fill(); }
    c.strokeStyle = 'rgba(120,150,185,0.55)'; c.lineWidth = 1.4;
    for (let i = 0; i < 70; i++) { let x = r() * w, y = r() * h; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 7; k++) { x += (r() - 0.5) * 120; y += (r() - 0.5) * 120; c.lineTo(x, y); } c.stroke(); }
  }, { repeat: 60 });
}
function groundFire(o = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uR: { value: o.r ?? 0 }, uMax: { value: o.max ?? 400 }, uGain: { value: o.gain ?? 1 }, uClear: { value: o.clear ?? 0 } },
    vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: NOISE + `uniform float uTime, uR, uMax, uGain, uClear; varying vec3 vW;
      void main(){ vec2 p = vW.xz; float d = length(p - vec2(0.0, -4.0));
        float inside = smoothstep(uR, uR - 25.0, d) * smoothstep(uClear*0.3, uClear*1.8, d);
        float n = fbm(p*0.06 + vec2(0.0, -uTime*0.3)); float n2 = fbm(p*0.22 - vec2(uTime*0.2, uTime*0.5));
        float cr = smoothstep(0.45, 0.68, n2)*0.9 + 0.12;
        float front = exp(-abs(d - uR)/5.0)*step(0.5, uR);
        float far = 1.0 - smoothstep(uMax*0.75, uMax, d);
        vec3 c = vec3(1.1,0.26,0.035)*inside*cr*(0.5 + 0.6*n)*far + vec3(2.2,0.9,0.25)*front*1.4*far;
        gl_FragColor = vec4(c*uGain, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-PI / 2), m); mesh.position.y = 0.06; mesh.renderOrder = 3; return mesh;
}
function fireField(n, R, seed, o = {}) {
  const r = mulberry32(seed), list = [];
  while (list.length < n) {
    const rad = (o.rmin ?? 3) + Math.pow(r(), o.pow ?? 1.6) * R, a = r() * PI * 2; const x = Math.cos(a) * rad, z = Math.sin(a) * rad - 4;
    if (o.keepOut && z > -3 && Math.abs(x) < 9) continue;
    list.push({ p: [x, 0, z], h: (2.2 + r() * 3.5) * (1 + rad * (o.grow ?? 0.012)), w: 0.45 + r() * 0.2, seed: r(), int: 0.7 + r() * 0.5, dist: rad });
  }
  return makeFlames(list, { gain: o.gain ?? 1, soft: 10, reveal: o.reveal ?? 1e6 });
}
export function sceneIce() {
  const S = base({ sky: { top: 0x343a48, mid: 0x646a78, bot: 0x868c98, hMid: 0.1, cloud: 0.6, cloudCol: 0x7a7e88, cloudCol2: 0x40444e, sunDir: [0, 0.3, -1], sunCol: 0x101010 },
    fog: new THREE.Fog(0x80878f, 90, 1300), fov: 40 });
  const { scene, cam } = S;
  const { hemi, dir } = lights(scene, { sky: 0xc8d4e4, ground: 0x5a6474, hemi: 0.55, dir: 0xe8eef8, dirI: 0.7, dirPos: [-20, 40, 20] });
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-PI / 2), toon(0x8e9aac, { map: iceTex(), rimStr: { value: 0.0 } })); scene.add(ice);
  ranges(scene, { rows: [
    { z: -820, amp: 70, y: -6, low: 0x7a8696, high: 0xc8d2de, w: 3600, freq: 0.004 },
    { z: -1200, amp: 160, y: -20, low: 0x6a7686, high: 0xb8c4d0, w: 4200, freq: 0.0025 },
  ], seed: 12 });
  const r0 = mulberry32(77);
  for (let i = 0; i < 40; i++) { const s = 1 + r0() * 5; const m = tmesh(new THREE.OctahedronGeometry(s, 0), 0xa8bccc, { th: 0.03, rimStr: { value: 0.15 } });
    const a = r0() * PI * 2, d = 30 + r0() * 250; m.position.set(Math.cos(a) * d, s * 0.5, Math.sin(a) * d - 60); m.scale.y = 1.6 + r0() * 1.5; m.rotation.y = r0() * 3; scene.add(m); }
  // the wound on the horizon (horizontal rift) and the closing door behind them
  const WOUND = V(0, 70, -640);
  const wound = makeRift({ w: 140, h: 1500, seed: 8.2, width: 0.02, core: 0xe6c8ff, edge: 0xa050ff, glow: 0x6a20c0, inside: 0x140a20 });
  wound.position.copy(WOUND); wound.rotation.z = PI / 2; scene.add(wound);
  const woundGlow = makeGlow(0x8a40ff, 900, { intensity: 0.25, pow: 3 }); woundGlow.position.copy(WOUND).add(V(0, -20, 10)); scene.add(woundGlow);
  const door = makeRift({ w: 10, h: 26, seed: 1.3, width: 0.01, core: 0xfff0d0, edge: 0xffb060, glow: 0xff8040, inside: 0x2a2230 });
  door.position.set(0, 10, 2); scene.add(door);
  // family
  const fam = {
    xy: figure('xiaoyan', { cloth: 0.05 }), xe: figure('xuner', { cloth: 0.05 }), cl: figure('cailin', { cloth: 0.05 }),
    xs: figure('xiao'), ln: figure('lin'),
  };
  const famEnd = { xy: [0, -4], xe: [-3.0, -1.0], cl: [3.0, -1.0], xs: [-1.3, -0.2], ln: [1.3, -0.2] };
  for (const k in fam) scene.add(fam[k]);
  // the violet tide
  const N = 1500, rT = mulberry32(99);
  const tideGeo = new THREE.IcosahedronGeometry(1, 0);
  const tideMat = toon(0x170c22, { emissive: 0x1a0630, rim: { value: col(0xb070ff) }, rimStr: { value: 1.6 } });
  const tide = new THREE.InstancedMesh(tideGeo, tideMat, N); tide.frustumCulled = false; scene.add(tide);
  const tideOl = new THREE.InstancedMesh(tideGeo, (() => { const m = new THREE.MeshBasicMaterial({ color: 0x05020a, side: THREE.BackSide });
    m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3(position)*1.12;'); }; return m; })(), N);
  tideOl.frustumCulled = false; scene.add(tideOl);
  const T = Array.from({ length: N }, (_, i) => ({ x0: (rT() - 0.5) * 340, del: i < 1100 ? rT() * 3.4 : 3.4 + rT() * 7, v: 75 + rT() * 35, ph: rT() * 9, s: 1.0 + rT() * 2.4,
    sx: 0.6 + rT() * 1.2, sy: 0.6 + rT() * 1.6, sz: 1 + rT() * 1.5, wob: rT() }));
  const mist = makeParticles(900, { origin: [0, 3, -260], spread: [360, 8, 360], vel: [0, 0.5, 30], turb: 3, life: 6, size: 3.5, colA: 0x9a50ff, colB: 0x30104a, alpha: 0, seed: 41 });
  scene.add(mist);
  // fire
  const gfire = groundFire({ max: 420 }); scene.add(gfire);
  const field = fireField(1500, 400, 5, { keepOut: true, pow: 1.7, gain: 0.11 }); scene.add(field);
  const feet = makeFlames(Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * PI * 2; return { p: [Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0 - 4], h: 0.9 + (i % 3) * 0.4, w: 0.5, seed: i * 0.17, int: 0.8, dist: 0 }; }), { gain: 1.2, tint: 0xffe0a0 });
  scene.add(feet);
  const embers = makeParticles(1400, { origin: [0, 2, -150], spread: [500, 4, 330], vel: [0, 7, 0], turb: 1.2, life: 5, size: 0.35, colA: 0xffd28a, colB: 0xff3a08, alpha: 0, seed: 23 });
  scene.add(embers);
  const fireLight = new THREE.PointLight(0xff8a3a, 0, 80, 1.6); fireLight.position.set(0, 7, -14); scene.add(fireLight);
  const snow = makeParticles(2600, { mode: 'wrap', origin: [0, 6, -6], spread: [70, 22, 70], vel: [4, -2.2, 1.5], turb: 1.2, size: 0.07, colA: 0xffffff, colB: 0xdde8ff, alpha: 0.85, blend: 'normal', seed: 2 });
  scene.add(snow);
  const lotus = makeLotus(); lotus.visible = false; scene.add(lotus);
  const lotusTrail = makeParticles(400, { origin: [0, 0, 0], spread: [1, 1, 1], vel: [0, 0, 0], turb: 2, life: 0.8, size: 0.6, colA: 0xffe0a0, colB: 0xff4a10, alpha: 0, seed: 61 });
  scene.add(lotusTrail);
  const boom = makeGlow(0xfff0d8, 50, { intensity: 0, pow: 1.3, depthTest: false }); boom.position.copy(WOUND); scene.add(boom);
  const sky = scene.userData.sky;
  const sk0 = [0x343a48, 0x646a78, 0x868c98, 0x7a7e88, 0x40444e].map(col), sk1 = [0x120c12, 0x2e1a1c, 0x5a2a1a, 0x5a2a22, 0x1a0e10].map(col);
  const fog0 = col(0x80878f), fog1 = col(0x3a2420), ice0 = col(0x8e9aac), ice1 = col(0x4a4048);
  const dummy = new THREE.Object3D(), hv = new THREE.Vector3(), tv = new THREE.Vector3();
  const lotusStart = new THREE.Vector3();
  const coolRim = col(0xcfe0ff), hotRim = col(0xffa050), skyHemi = col(0xc8d4e4), fireHemi = col(0xffb080), gCool = col(0x5a6474), gHot = col(0xff7030);
  S.post = { ...S.post, bloom: [0.8, 0.55, 0.85], rim: 0xcfe0ff, rimStr: 0.55, gain: [0.98, 1.0, 1.05], vig: 0.4 };
  S.update = (t) => {
    const lt = t - 41.5;
    // fire timeline
    const R = 400 * ease.out(sstep(49.5, 51.8, t));
    const fireOn = sstep(49.4, 49.9, t);
    gfire.material.uniforms.uR.value = R; field.material.uniforms.uReveal.value = R; field.material.uniforms.uGain.value = t > 55.2 ? 0.07 : 0.11;
    feet.material.uniforms.uGain.value = 1.3 * fireOn * (t > 51.6 && t < 55.2 ? 0.25 : 1); feet.visible = fireOn > 0;
    embers.material.uniforms.uAlpha.value = sstep(50, 51.5, t) * 1.1;
    fireLight.intensity = 22 * fireOn;
    const heat = sstep(49.5, 51.0, t);
    S.post.rim = '#' + coolRim.clone().lerp(hotRim, heat).getHexString(); S.post.rimStr = lerp(0.55, 0.9, heat);
    hemi.color.copy(skyHemi).lerp(fireHemi, heat * 0.35); hemi.groundColor.copy(gCool).lerp(gHot, heat * 0.8); dir.intensity = lerp(0.7, 0.35, heat);
    hemi.intensity = lerp(0.55, 0.35, heat);
    const su = sky.material.uniforms; su.cTop.value.copy(sk0[0]).lerp(sk1[0], heat); su.cMid.value.copy(sk0[1]).lerp(sk1[1], heat); su.cBot.value.copy(sk0[2]).lerp(sk1[2], heat);
    su.cloudCol.value.copy(sk0[3]).lerp(sk1[3], heat); su.cloudCol2.value.copy(sk0[4]).lerp(sk1[4], heat);
    scene.fog.color.copy(fog0).lerp(fog1, heat); ice.material.color.copy(ice0).lerp(ice1, heat);
    S.post.bloom = [lerp(0.8, 0.7, heat), 0.5, lerp(0.85, 1.15, heat)];
    S.post.gain = [lerp(0.98, 1.06, heat), lerp(1.0, 0.98, heat), lerp(1.05, 0.92, heat)];
    snow.material.uniforms.uAlpha.value = 0.85 * (1 - 0.8 * heat);
    // family walk out of the door (S9)
    const walk = ease.out(sstep(41.6, 44.2, t));
    for (const k in fam) { const [ex, ez] = famEnd[k]; place(fam[k], ex * lerp(0.3, 1, walk), 0, lerp(1.5, ez, walk), PI); }
    fam.xy.userData.pose(t < 51.6 ? { headTurn: 0.5 * sstep(46.2, 46.8, t) * (1 - sstep(48.4, 49.2, t)), armL: [0, -0.15], armR: [0, 0.15] }
      : lerpPose(POSE.stand, POSE.lotus, ease.out(sstep(51.6, 52.3, t))));
    if (t > 54.9) fam.xy.userData.pose(lerpPose(POSE.lotus, { armR: [-1.7, -0.1], armL: [-0.4, -0.2], lean: 0.08 }, ease.out(sstep(54.9, 55.2, t))));
    for (const k of ['xe', 'cl']) fam[k].userData.pose({ armL: [-0.3 * sstep(46.5, 47.5, t), -0.5], armR: [-0.3 * sstep(46.5, 47.5, t), 0.5] });
    door.material.uniforms.uOpen.value = lerp(0.3, 0.08, sstep(41.5, 50, t)); door.material.uniforms.uWobble.value = 0.5;
    // wound
    const wu = wound.material.uniforms;
    const bulge = ease.out(sstep(45.0, 46.2, t)), blast = sstep(55.6, 55.75, t), heal = ease.inOut(sstep(55.8, 57.4, t));
    wu.uOpen.value = 0.02 + 0.2 * bulge + 0.25 * blast * (1 - heal) - 0.2 * heal * bulge; wu.uWobble.value = 0.5 + 2 * bulge * (1 - heal);
    wu.uInt.value = 1 + 0.6 * bulge + 3 * blast * (1 - heal);
    woundGlow.material.uniforms.uInt.value = 0.25 + 0.4 * bulge * (1 - heal);
    mist.material.uniforms.uAlpha.value = sstep(46, 47.5, t) * (1 - sstep(50, 51.5, t)) * 0.6;
    // tide
    const killAll = t > 55.62;
    for (let i = 0; i < N; i++) {
      const d = T[i]; const tau = t - 45.9 - d.del;
      let sc = 0;
      if (tau > 0 && !killAll) {
        const z = -560 + d.v * tau, x = d.x0 * lerp(0.15, 1, sstep(0, 2.2, tau)) + Math.sin(tau * 1.3 + d.ph) * 4;
        const dist = Math.hypot(x, z + 4);
        const burnAt = dist < R ? 1 : 0; // inside the fire → gone
        sc = d.s * sstep(0, 0.4, tau) * (1 - burnAt);
        dummy.position.set(x, 0.8 * d.s + Math.abs(Math.sin(tau * 5 + d.ph)) * 1.6 * d.wob, z);
        dummy.rotation.set(tau * 2 + d.ph, d.ph, tau * 1.3);
        dummy.scale.set(sc * d.sx, sc * d.sy, sc * d.sz);
      } else dummy.scale.setScalar(0);
      dummy.updateMatrix(); tide.setMatrixAt(i, dummy.matrix); tideOl.setMatrixAt(i, dummy.matrix);
    }
    tide.instanceMatrix.needsUpdate = true; tideOl.instanceMatrix.needsUpdate = true;
    // lotus
    lotus.visible = t > 51.7 && t < 55.66;
    if (lotus.visible) {
      handMid(fam.xy, hv); hv.y += 0.12; hv.z -= 0.18;
      const grow = ease.out(sstep(51.7, 53.2, t)), open = ease.inOut(sstep(52.0, 53.6, t));
      lotus.userData.set(open, (0.4 + 0.6 * grow) * (1 + 0.15 * Math.sin(t * 13)));
      lotus.rotation.y = t * 1.6;
      if (t < 55.0) { lotus.position.copy(hv); lotus.scale.setScalar(lerp(0.12, 0.42, grow)); lotusStart.copy(hv); }
      else { const u = ease.in(sstep(55.0, 55.62, t)); const p1 = V(0, 90, -220);
        tv.copy(lotusStart).multiplyScalar((1 - u) * (1 - u)).add(p1.clone().multiplyScalar(2 * u * (1 - u))).add(WOUND.clone().multiplyScalar(u * u));
        lotus.position.copy(tv); lotus.scale.setScalar(lerp(0.42, 60, u * u)); }
      lotusTrail.material.uniforms.uOrigin.value.copy(lotus.position); lotusTrail.material.uniforms.uSpread.value.setScalar(lotus.scale.x * 1.5);
      lotusTrail.material.uniforms.uSize.value = Math.min(1.2, 0.2 * Math.max(1, lotus.scale.x * 2));
    }
    lotusTrail.material.uniforms.uAlpha.value = lotus.visible && t > 55.0 ? 1 : 0;
    boom.scale.setScalar(lerp(60, 900, ease.out(sstep(55.6, 56.4, t)))); boom.material.uniforms.uInt.value = 1.4 * sstep(55.58, 55.65, t) * (1 - sstep(55.7, 56.5, t));
    // cameras
    if (t < 45) camKeys(cam, t, [[41.5, [9.5, 2.7, 16.5], [-4, 5, -60], 40], [45, [8.4, 2.5, 14.5], [-4, 5.5, -60], 38]]);
    else if (t < 49.5) camKeys(cam, t, [[45, [0.75, 1.6, 0.1], [-8, 10, -220], 40], [49.5, [0.65, 1.55, -0.5], [-8, 11, -220], 38]]);
    else if (t < 51.6) camKeys(cam, t, [[49.5, [26, 14, 26], [0, 0, -36], 46], [51.6, [32, 21, 34], [0, 0, -48], 48]]);
    else if (t < 55.2) camKeys(cam, t, [[51.6, [-2.6, 0.75, -5.2], [0, 1.65, -4.35], 40], [55.2, [-2.2, 0.7, -5.0], [0, 1.7, -4.4], 36]]);
    else camKeys(cam, t, [[55.2, [-6, 2.2, 6], [0, 30, -400], 34], [57.5, [-6.5, 2.0, 7], [0, 45, -500], 33]]);
  };
  return S;
}

// ---------------------------------------------------------------- S12: 无尽火域 — the fire that never goes out
export function sceneDomain() {
  const S = base({ sky: { top: 0x03040b, mid: 0x0e1230, bot: 0x4a1c12, hMid: 0.05, stars: 1.3, milky: 0.7, milkyAxis: [0.2, 0.4, 0.9], sunDir: [0, 0.02, -1], sunCol: 0x501a08 },
    fog: new THREE.FogExp2(0x1a0e10, 0.0012), fov: 40 });
  const { scene, cam } = S;
  lights(scene, { sky: 0x30406a, ground: 0xff6a20, hemi: 0.5, dir: 0x6a7aa8, dirI: 0.4, dirPos: [-20, 40, -20] });
  const ice = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-PI / 2), toon(0x5a6474, { map: iceTex(), rimStr: { value: 0 } })); scene.add(ice);
  ranges(scene, { rows: [{ z: -1000, amp: 120, y: -20, low: 0x1a2030, high: 0x3a4458, w: 4200, freq: 0.003 }], seed: 30 });
  const wound = makeRift({ w: 90, h: 1200, seed: 8.2, width: 0.012, core: 0xd8b8ff, edge: 0x8a40e0, glow: 0x4a1890, intensity: 0.6 });
  wound.position.set(0, 60, -900); wound.rotation.z = PI / 2; scene.add(wound);
  const gfire = groundFire({ r: 600, max: 640, gain: 0.7, clear: 5 }); scene.add(gfire);
  const field = fireField(1800, 600, 9, { pow: 1.9, grow: 0.016, gain: 0.11, rmin: 11 }); scene.add(field);
  const embers = makeParticles(1600, { origin: [0, 3, -4], spread: [900, 6, 900], vel: [0, 8, 0], turb: 1.5, life: 6, size: 0.6, colA: 0xffd28a, colB: 0xff3a08, alpha: 1.0, seed: 77 });
  scene.add(embers);
  const fam = [['xiaoyan', 0, -4], ['xuner', -1.7, -1.6], ['cailin', 1.7, -1.6], ['xiao', -0.7, -0.9], ['lin', 0.7, -0.9]].map(([n, x, z]) => {
    const f = place(figure(n), x, 0, z, PI); scene.add(f); return f; });
  fam[0].userData.pose({ head: -0.4 });
  S.post = { ...S.post, bloom: [0.7, 0.5, 1.1], rim: 0xffa060, rimStr: 0.8, gain: [1.04, 0.98, 0.94], sat: 1.08, vig: 0.5 };
  S.update = (t) => {
    camKeys(cam, t, [[57.5, [7, 4, 16], [0, 2.5, -6], 40], [68, [70, 140, 300], [0, 0, -120], 42]], (u) => ease.inOut(clamp(u)));
  };
  return S;
}

export function buildScenes() {
  return { peak: scenePeak(), husk: sceneHusk(), court: sceneCourt(), flowers: sceneFlowers(), cliff: sceneCliff(), summit: sceneSummit(),
    tunnel: sceneTunnel(), ice: sceneIce(), domain: sceneDomain() };
}
