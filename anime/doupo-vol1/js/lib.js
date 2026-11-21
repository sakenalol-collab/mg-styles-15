// Shared building blocks: toon materials + outlines, stylised figures, sky, rift, flames, particles, terrain.
// Everything is a pure function of time (uniform U.time / arguments), so any frame can be rendered in any order.
import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { NOISE } from './glsl.js';

export const U = {
  time: { value: 0 },
  rim: { value: new THREE.Color(0x6688ff) }, rimStr: { value: 0.5 }, rimPow: { value: 3.0 },
  pxScale: { value: 1000 },            // H / (2 tan(fov/2)) of the active camera, for point sizes
};

// ---------- math ----------
export function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3), in: (t) => t * t * t,
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  soft: (t) => { t = clamp(t); return lerp(t, -(Math.cos(Math.PI * t) - 1) / 2, 0.6); },
};
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const col = (c) => new THREE.Color(c);

// Camera move: keys = [[t, [px,py,pz], [lx,ly,lz], fov], ...]; eased between consecutive keys.
const _p = new THREE.Vector3(), _l = new THREE.Vector3();
export function camKeys(cam, t, keys, e = ease.soft) {
  let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
  const u = b === a ? 0 : e(clamp((t - a[0]) / (b[0] - a[0])));
  _p.set(...a[1]).lerp(_l.set(...b[1]), u); cam.position.copy(_p);
  _p.set(...a[2]).lerp(_l.set(...b[2]), u); cam.lookAt(_p);
  const fov = lerp(a[3] ?? 40, b[3] ?? a[3] ?? 40, u);
  if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
}

// ---------- toon material + outline ----------
let _grad;
export function gradMap() {
  if (_grad) return _grad;
  const t = new THREE.DataTexture(new Uint8Array([80, 165, 255]), 3, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return (_grad = t);
}
function windCode(o) {
  if (!o.wind) return '';
  return `{ float wk = clamp((${(o.windTop ?? 1).toFixed(3)} - position.y) / ${(o.windLen ?? 1).toFixed(3)}, 0.0, 1.0); wk *= wk;
    transformed.x += sin(uTime*2.3 + position.y*5.0 + position.z*3.0 + ${(o.windPhase ?? 0).toFixed(2)}) * ${o.wind.toFixed(4)} * wk;
    transformed.z += cos(uTime*1.9 + position.y*4.0 + position.x*3.0) * ${(o.wind * 0.7).toFixed(4)} * wk; }`;
}
export function toon(color, o = {}) {
  const m = new THREE.MeshToonMaterial({
    color, gradientMap: gradMap(), side: o.side ?? THREE.FrontSide, vertexColors: !!o.vc, map: o.map || null,
    transparent: !!o.transparent, opacity: o.opacity ?? 1,
  });
  if (o.emissive !== undefined) { m.emissive = col(o.emissive); m.emissiveIntensity = o.ei ?? 1; }
  const rim = o.rim || U.rim, rimStr = o.rimStr || U.rimStr, wc = windCode(o);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = rim; sh.uniforms.uRimStr = rimStr; sh.uniforms.uRimPow = U.rimPow; sh.uniforms.uTime = U.time;
    sh.fragmentShader = 'uniform vec3 uRim; uniform float uRimStr; uniform float uRimPow;\n' + sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{ float fr = 1.0 - saturate(dot(normalize(vViewPosition), normal)); outgoingLight += uRim * uRimStr * pow(fr, uRimPow); }
       #include <opaque_fragment>`);
    if (wc) sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + wc);
  };
  m.customProgramCacheKey = () => 'toon|' + wc;
  return m;
}
export function outlineMat(th = 0.012, color = 0x100a12, o = {}) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const wc = windCode(o);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      `vec3 transformed = vec3(position) + normal * ${th.toFixed(4)};\n${wc}`);
  };
  m.customProgramCacheKey = () => 'ol|' + th + wc;
  return m;
}
export function outline(mesh, th = 0.012, color = 0x100a12, o = {}) {
  const ol = new THREE.Mesh(mesh.geometry, outlineMat(th, color, o));
  mesh.add(ol); return mesh;
}
const PROP_RIM = { value: 0.1 };
export function tmesh(geo, color, o = {}) {
  const m = new THREE.Mesh(geo, o.mat || toon(color, { ...o, rimStr: o.rimStr || (o.fig ? undefined : PROP_RIM) }));
  if (o.outline !== false) outline(m, o.th ?? 0.012, o.olColor ?? 0x100a12, o);
  if (o.cast) m.castShadow = true;
  if (o.receive) m.receiveShadow = true;
  return m;
}

// ---------- stylised figure (≈1.75 m, faces +z) ----------
export function makeFigure(o) {
  const g = new THREE.Group();
  const th = o.th ?? 0.011;
  const fm = (geo, c, oo = {}) => tmesh(geo, c, { ...oo, fig: true });
  const lathe = (pts, seg = 28) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const robeO = { wind: o.cloth ?? 0.04, windTop: 1.0, windLen: 1.0, th };
  const lower = new THREE.Group(); g.add(lower);
  const robe = fm(lathe([[0, 0], [0.33, 0.015], [0.31, 0.22], [0.25, 0.58], [0.2, 0.88], [0.168, 1.03], [0, 1.031]]), o.robe, robeO);
  lower.add(robe);
  const hem = fm(new THREE.TorusGeometry(0.325, 0.022, 8, 32), o.trim, { th: 0.006, wind: robeO.wind, windTop: 1, windLen: 1 });
  hem.rotation.x = Math.PI / 2; hem.position.y = 0.03; lower.add(hem);
  if (o.panel) { // front panel stripe in trim colour
    const pn = fm(new THREE.BoxGeometry(0.1, 0.95, 0.02), o.panel, { outline: false });
    pn.position.set(0, 0.5, 0.27); pn.rotation.x = -0.1; lower.add(pn);
  }
  const upper = new THREE.Group(); upper.position.y = 1.0; g.add(upper);
  upper.add(fm(lathe([[0.168, 0], [0.19, 0.17], [0.205, 0.34], [0.175, 0.45], [0.07, 0.52], [0, 0.525]]), o.robe, { th }));
  const sash = fm(new THREE.TorusGeometry(0.172, 0.03, 8, 28), o.trim, { th: 0.006 });
  sash.rotation.x = Math.PI / 2; sash.position.y = 0.03; upper.add(sash);
  const collar = fm(new THREE.TorusGeometry(0.075, 0.02, 6, 20), o.trim, { outline: false });
  collar.rotation.x = Math.PI / 2; collar.position.y = 0.5; upper.add(collar);
  const neck = fm(new THREE.CylinderGeometry(0.042, 0.048, 0.12, 10), o.skin ?? 0xf3d5bd, { outline: false });
  neck.position.y = 0.56; upper.add(neck);
  const head = new THREE.Group(); head.position.y = 0.66; upper.add(head);
  if (o.headScale) head.scale.setScalar(o.headScale);
  const face = fm(new THREE.SphereGeometry(0.104, 24, 18), o.skin ?? 0xf3d5bd, { th });
  face.scale.set(0.95, 1.08, 1); head.add(face);
  const hairM = toon(o.hair, { side: THREE.DoubleSide });
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.116, 24, 16, Math.PI - 0.95, Math.PI + 1.9, 0, 2.25), hairM);
  back.position.set(0, 0.012, -0.004); head.add(back);
  const bangs = new THREE.Mesh(new THREE.SphereGeometry(0.118, 24, 10, 0, Math.PI * 2, 0, 1.05), hairM);
  bangs.position.set(0, 0.014, 0.004); head.add(bangs);
  const hairO = outline(new THREE.Mesh(new THREE.SphereGeometry(0.117, 20, 14), hairM), th); // hidden shell → only its outline matters
  hairO.material = new THREE.MeshBasicMaterial({ visible: false }); hairO.scale.set(1, 1.04, 1); hairO.position.y = 0.01; head.add(hairO);
  if (o.longHair) {
    const lh = fm(new THREE.PlaneGeometry(0.25, o.longHair, 1, 10).translate(0, -o.longHair / 2, 0), o.hair,
      { mat: toon(o.hair, { side: THREE.DoubleSide, wind: 0.05, windTop: 0, windLen: o.longHair, windPhase: 1.3 }), outline: false });
    lh.position.set(0, 0.03, -0.1); lh.rotation.x = 0.12; head.add(lh);
  }
  if (o.ponytail) {
    const pt = fm(new THREE.PlaneGeometry(0.11, 0.42, 1, 8).translate(0, -0.21, 0), o.hair,
      { mat: toon(o.hair, { side: THREE.DoubleSide, wind: 0.045, windTop: 0, windLen: 0.42, windPhase: 0.7 }), outline: false });
    pt.position.set(0, 0.06, -0.122); pt.rotation.x = 0.28; head.add(pt);
    const tie = fm(new THREE.SphereGeometry(0.035, 10, 8), o.trim, { outline: false }); tie.position.set(0, 0.07, -0.115); head.add(tie);
  }
  if (o.bun) { const b = fm(new THREE.SphereGeometry(0.05, 12, 10), o.hair, { th: 0.006 }); b.position.set(0, 0.11, -0.06); head.add(b); }
  if (o.beard) {
    const bd = fm(new THREE.ConeGeometry(0.06, 0.24, 10).rotateX(Math.PI), o.beard, { th: 0.006 });
    bd.position.set(0, -0.15, 0.06); bd.rotation.x = 0.25; head.add(bd);
  }
  const eyeM = toon(o.eye ?? 0x1b1222, { emissive: o.eyeGlow ?? 0x000000, ei: 1 });
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), eyeM);
    e.scale.set(0.017, 0.025, 0.008); e.position.set(0.038 * s, 0.0, 0.098); head.add(e);
  }
  const arm = (s) => {
    const p = new THREE.Group(); p.position.set(0.205 * s, 0.43, 0); upper.add(p);
    const sl = fm(new THREE.CylinderGeometry(0.055, 0.1, 0.6, 14).translate(0, -0.3, 0), o.robe, { th, wind: 0.015, windTop: 0, windLen: 0.6 });
    p.add(sl);
    const cuff = fm(new THREE.TorusGeometry(0.095, 0.014, 6, 16), o.trim, { outline: false });
    cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.59; p.add(cuff);
    const hand = fm(new THREE.SphereGeometry(0.04, 10, 8), o.skin ?? 0xf3d5bd, { th: 0.006 }); hand.position.y = -0.63; p.add(hand);
    p.userData.hand = hand; return p;
  };
  const armL = arm(-1), armR = arm(1);
  const S = o.kid ? 0.64 : (o.scale ?? 1);
  if (o.kid) head.scale.setScalar(o.headScale ?? 1.22);
  g.scale.setScalar(S);
  g.traverse((m) => { if (m.isMesh && o.cast) m.castShadow = true; });
  const pose = (p = {}) => {
    const kneel = p.kneel || 0, sit = p.sit || 0, crouch = p.crouch || 0;
    const sq = 1 - 0.5 * kneel - 0.56 * sit - 0.5 * crouch;
    lower.scale.set(1 + 0.3 * sit + 0.12 * kneel + 0.15 * crouch, sq, 1 + 0.35 * sit + 0.2 * kneel + 0.2 * crouch);
    upper.position.y = 1.0 * sq;
    upper.rotation.set(p.lean || 0, p.turn || 0, p.tilt || 0);
    armL.rotation.set(p.armL?.[0] ?? 0, p.armL?.[2] ?? 0, p.armL?.[1] ?? -0.12);
    armR.rotation.set(p.armR?.[0] ?? 0, p.armR?.[2] ?? 0, p.armR?.[1] ?? 0.12);
    head.rotation.set(p.head ?? 0, p.headTurn ?? 0, 0);
  };
  pose();
  Object.assign(g.userData, { pose, upper, lower, armL, armR, head });
  return g;
}
// Pose presets
export const POSE = {
  stand: {}, standOpen: { armL: [0, -0.2], armR: [0, 0.2] },
  sit: { sit: 1, armL: [-0.55, -0.2], armR: [-0.55, 0.2], lean: 0.05 },
  kneel: { kneel: 1, armL: [-0.2, -0.15], armR: [-0.2, 0.15] },
  salute: { armL: [-1.35, 0.42], armR: [-1.35, -0.42], lean: 0.12 },
  raiseR: { armR: [-2.75, 0.25], armL: [0, -0.15] },
  touch: { armR: [-1.42, 0.05], armL: [0, -0.12], lean: 0.05 },
  lotus: { armL: [-1.15, 0.55], armR: [-1.15, -0.55] },
  crouchHold: { crouch: 1, lean: 0.35, armL: [-1.0, 0.45], armR: [-1.0, -0.45], head: 0.25 },
  lookUp: { head: -0.45, armL: [0, -0.1], armR: [0, 0.1] },
  behind: { armL: [0.25, -0.05, 0.0], armR: [0.25, 0.05, 0.0], lean: -0.02 },
};
export function lerpPose(a, b, u) {
  const r = {}; const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k], y = b[k];
    if (Array.isArray(x) || Array.isArray(y)) {
      const xa = x || [0, k === 'armL' ? -0.12 : 0.12, 0], ya = y || [0, k === 'armL' ? -0.12 : 0.12, 0];
      r[k] = [0, 1, 2].map((i) => lerp(xa[i] ?? 0, ya[i] ?? 0, u));
    } else r[k] = lerp(x ?? 0, y ?? 0, u);
  }
  return r;
}

// Character palettes (original designs)
export const CAST = {
  xiaoyan: { robe: 0x16151c, trim: 0x8a1f17, panel: 0x5a140f, hair: 0x14121a, ponytail: true, cloth: 0.045 },
  xuner: { robe: 0xf1ead8, trim: 0xd7a83f, hair: 0x1a1720, longHair: 0.62 },
  cailin: { robe: 0x4b2a6e, trim: 0xc69cf0, hair: 0x2a1838, longHair: 0.7 },
  xiao: { robe: 0x8a4cc0, trim: 0xf0c5ff, hair: 0x2a1838, longHair: 0.4, kid: true, eye: 0x6a3fb0, eyeGlow: 0x3a1060 },
  lin: { robe: 0xe8dcb8, trim: 0xc8902f, hair: 0x1a1720, ponytail: true, kid: true },
  yunyun: { robe: 0xf6f6f8, trim: 0x8fc6e8, hair: 0x15131b, longHair: 0.72, bun: true },
  yaolao: { robe: 0xb9bcc6, trim: 0x5c6378, hair: 0xeef0f4, beard: 0xeef0f4, bun: true },
  ziyan: { robe: 0x6c3aa8, trim: 0xf4c0ff, hair: 0x7a3fc8, longHair: 0.45, kid: true, headScale: 1.15 },
  boy: { robe: 0x7a6a55, trim: 0x4a3c2c, hair: 0x241c18, kid: true },
  kidA: { robe: 0x5a6a7a, trim: 0x2c3540, hair: 0x221a18, kid: true },
  elder: { robe: 0x4a3f36, trim: 0x2a221c, hair: 0x9a9690, beard: 0x9a9690 },
};
export const figure = (name, extra = {}) => makeFigure({ ...CAST[name], ...extra });

// ---------- sky ----------
export function makeSky(p = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      cTop: { value: col(p.top ?? 0x05060f) }, cMid: { value: col(p.mid ?? 0x141a3a) }, cBot: { value: col(p.bot ?? 0x2a2440) },
      hMid: { value: p.hMid ?? 0.12 }, uStars: { value: p.stars ?? 0 }, uMilky: { value: p.milky ?? 0 },
      milkyAxis: { value: V(...(p.milkyAxis ?? [0.45, 0.35, 0.82])).normalize() },
      sunDir: { value: V(...(p.sunDir ?? [0, 0.1, -1])).normalize() }, sunCol: { value: col(p.sunCol ?? 0x000000) },
      sunDisc: { value: p.sunDisc ?? 0 }, uCloud: { value: p.cloud ?? 0 }, cloudCol: { value: col(p.cloudCol ?? 0xffffff) },
      cloudCol2: { value: col(p.cloudCol2 ?? 0x888888) }, uTime: U.time,
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 c = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = c.xyww; gl_Position.z = 0.99999*c.w; }`,
    fragmentShader: NOISE + `
      uniform vec3 cTop,cMid,cBot,milkyAxis,sunDir,sunCol,cloudCol,cloudCol2; uniform float hMid,uStars,uMilky,sunDisc,uCloud,uTime; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float y = d.y;
        vec3 c = y > hMid ? mix(cMid, cTop, smoothstep(hMid, 0.9, y)) : mix(cBot, cMid, smoothstep(-0.15, hMid, y));
        float sd = max(dot(d, normalize(sunDir)), 0.0);
        c += sunCol * (pow(sd, 6.0)*0.45 + pow(sd, 60.0)*0.8) + sunCol*sunDisc*smoothstep(0.9993, 0.9997, sd)*4.0;
        float band = exp(-pow(dot(d, milkyAxis)/0.2, 2.0));
        c += uMilky * band * smoothstep(0.35, 0.9, fbm3(d*7.0)) * vec3(0.32,0.36,0.6);
        c += uMilky * band * 0.06 * vec3(0.5,0.5,0.8);
        vec3 p = d*190.0; vec3 id = floor(p); vec3 h = hash33(id);
        float on = step(1.0 - (0.035 + 0.08*band), h.x);
        float sdist = length(fract(p) - (0.25 + 0.5*h));
        float tw = 0.65 + 0.35*sin(uTime*(1.5+3.0*h.y) + h.z*40.0);
        c += uStars * on * smoothstep(0.16, 0.0, sdist) * tw * mix(vec3(0.75,0.82,1.0), vec3(1.0,0.86,0.7), h.z) * (0.5 + 1.5*h.y*h.y) * smoothstep(-0.02, 0.12, y);
        if (uCloud > 0.0) {
          vec2 cp = d.xz / (max(y, 0.0) + 0.12);
          float n = fbm(cp*0.9 + vec2(uTime*0.012, 0.0)); float n2 = fbm(cp*2.1 + 7.0);
          float cl = smoothstep(0.42, 0.72, n*0.75 + n2*0.35) * smoothstep(-0.02, 0.1, y) * smoothstep(0.75, 0.25, y);
          vec3 cc = mix(cloudCol2, cloudCol, clamp(n2*1.4 - 0.2 + sd*0.6, 0.0, 1.0));
          c = mix(c, cc, cl*uCloud);
        }
        gl_FragColor = vec4(c, 1.0); }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true,
  });
  const s = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 32), m);
  s.frustumCulled = false; s.renderOrder = -10; s.userData.isSky = true; return s;
}

// ---------- rift / gate in the sky (premultiplied: glow adds light, opened interior occludes) ----------
export function makeRift(p = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uOpen: { value: p.open ?? 0 }, uInt: { value: p.intensity ?? 1 }, uSeed: { value: p.seed ?? 3.1 }, uTime: U.time,
      cCore: { value: col(p.core ?? 0xfff2d0) }, cEdge: { value: col(p.edge ?? 0xb98cff) }, cGlow: { value: col(p.glow ?? 0x6a4cff) },
      cIn: { value: col(p.inside ?? 0x241d33) }, uWobble: { value: p.wobble ?? 0 }, uWidth: { value: p.width ?? 0.006 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: NOISE + `
      uniform float uOpen,uInt,uSeed,uTime,uWobble,uWidth; uniform vec3 cCore,cEdge,cGlow,cIn; varying vec2 vUv;
      void main(){ vec2 p = vUv*2.0 - 1.0; float al = p.y;
        float taper = pow(max(1.0 - al*al, 0.0), 0.55);
        float path = (fbm(vec2(al*2.2 + uSeed, uSeed)) - 0.5)*0.5*(1.0 - uOpen*0.6) + (vnoise(vec2(al*16.0, uSeed*3.0)) - 0.5)*0.06;
        path += uWobble*0.04*sin(al*9.0 + uTime*2.0);
        float d = abs(p.x - path);
        float w = (uWidth + uOpen*0.62)*taper;
        float core = smoothstep(w + 0.004, w*0.2, d) * taper;
        float glow = exp(-d/(0.035 + w*0.9)) * taper;
        vec3 c = cGlow*glow*0.7 + mix(cEdge, cCore, core)*core*2.2;
        float a = 0.0;
        if (uOpen > 0.002) {
          float inside = smoothstep(w, w*0.9, d) * smoothstep(0.0, 0.08, uOpen);
          vec2 q = vec2((p.x - path)/max(w,1e-3), al);
          float sw = fbm(q*vec2(2.5, 3.0) + vec2(uTime*0.25, -uTime*0.6));
          float sw2 = fbm(q*vec2(6.0, 9.0) - vec2(uTime*0.4, uTime*0.9));
          vec3 ch = cIn*(0.6 + 0.9*sw) + vec3(0.35,0.3,0.45)*smoothstep(0.55, 0.8, sw2);
          float rim = smoothstep(0.8, 1.0, d/max(w,1e-3)) * inside;
          ch += cEdge*rim*0.9 + cCore*pow(rim, 4.0)*1.6;
          c = mix(c, ch, inside); a = inside;
        }
        float em = (1.0 - smoothstep(0.55, 1.0, abs(p.x))) * (1.0 - smoothstep(0.85, 1.0, abs(p.y)));
        gl_FragColor = vec4(c*uInt*em, a*em); }`,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(p.w ?? 40, p.h ?? 200), m);
  mesh.frustumCulled = false; return mesh;
}

// ---------- instanced flame billboards (cylindrical, additive) ----------
export function makeFlames(list, o = {}) {
  const base = new THREE.PlaneGeometry(1, 1, 1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  const n = list.length, off = new Float32Array(n * 3), par = new Float32Array(n * 4), dist = new Float32Array(n);
  list.forEach((f, i) => { off.set(f.p, i * 3); par.set([f.h, f.w ?? 0.55, f.seed ?? Math.random(), f.int ?? 1], i * 4); dist[i] = f.dist ?? 0; });
  g.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
  g.setAttribute('aParams', new THREE.InstancedBufferAttribute(par, 4));
  g.setAttribute('aDist', new THREE.InstancedBufferAttribute(dist, 1));
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uGain: { value: o.gain ?? 1 }, uReveal: { value: o.reveal ?? 1e6 }, uSoft: { value: o.soft ?? 6 },
      uTint: { value: col(o.tint ?? 0xffffff) }, uSpeed: { value: o.speed ?? 1 }, uScale: { value: o.scale ?? 1 } },
    vertexShader: `attribute vec3 aOffset; attribute vec4 aParams; attribute float aDist;
      uniform float uReveal, uSoft, uScale; varying vec2 vUv; varying float vSeed, vInt;
      void main(){ vUv = uv; vSeed = aParams.z;
        float rv = smoothstep(aDist, aDist + uSoft, uReveal);
        float boost = 1.0 + 1.2*smoothstep(uSoft*0.6, 0.0, abs(uReveal - aDist)) * step(0.001, rv);
        vInt = aParams.w * rv;
        float h = aParams.x * uScale * (0.25 + 0.75*rv) * boost, w = h * aParams.y;
        vec3 right = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
        vec3 pos = (modelMatrix*vec4(aOffset, 1.0)).xyz + right*(position.x*w) + vec3(0.0, (position.y + 0.5)*h, 0.0);
        gl_Position = projectionMatrix*viewMatrix*vec4(pos, 1.0); }`,
    fragmentShader: NOISE + `uniform float uTime, uGain, uSpeed; uniform vec3 uTint; varying vec2 vUv; varying float vSeed, vInt;
      void main(){ if (vInt <= 0.001) discard;
        float t = uTime*uSpeed + vSeed*13.0; vec2 uv = vUv;
        float n = fbm(vec2((uv.x - 0.5)*2.6 + vSeed*7.0, uv.y*2.2 - t*1.7));
        float n2 = vnoise(vec2((uv.x - 0.5)*7.0 + vSeed*3.0, uv.y*5.0 - t*3.2));
        float x = uv.x - 0.5 + (n - 0.5)*0.42*uv.y;
        float wdt = 0.48*(1.0 - uv.y*0.85)*(0.75 + 0.5*n);
        float shape = 1.0 - smoothstep(wdt*0.35, wdt, abs(x));
        shape *= smoothstep(0.0, 0.07, uv.y) * (1.0 - smoothstep(0.45 + 0.4*n, 0.98, uv.y));
        float heat = shape * (1.25 - uv.y) * (0.65 + 0.7*n2);
        vec3 c = fireRamp(heat) * uTint * heat * vInt * uGain;
        gl_FragColor = vec4(c, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 5; return mesh;
}

// ---------- particles (Points). mode 'loop': emitted from a box, live/die; mode 'wrap': fill a box around origin forever ----------
export function makeParticles(n, o = {}) {
  const rnd = mulberry32(o.seed ?? 7); const s = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) s[i] = rnd();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(s, 4));
  const wrap = o.mode === 'wrap';
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.time, uScale: U.pxScale, uLife: { value: o.life ?? 2 }, uSize: { value: o.size ?? 0.1 }, uGrow: { value: o.grow ?? 1 },
      uOrigin: { value: V(...(o.origin ?? [0, 0, 0])) }, uSpread: { value: V(...(o.spread ?? [1, 1, 1])) },
      uVel: { value: V(...(o.vel ?? [0, 1, 0])) }, uGrav: { value: V(...(o.grav ?? [0, 0, 0])) }, uTurb: { value: o.turb ?? 0.3 },
      uColA: { value: col(o.colA ?? 0xffffff) }, uColB: { value: col(o.colB ?? o.colA ?? 0xffffff) }, uAlpha: { value: o.alpha ?? 1 },
      uTOff: { value: o.tOff ?? 0 }, uPetal: { value: o.petal ? 1 : 0 }, uOn: { value: o.on ?? 1 },
    },
    vertexShader: `attribute vec4 aSeed; uniform float uTime,uScale,uLife,uSize,uGrow,uTurb,uTOff; uniform vec3 uOrigin,uSpread,uVel,uGrav;
      varying float vAge; varying vec4 vS;
      void main(){ vS = aSeed; float T = uTime + uTOff; vec3 r = vec3(aSeed.y, aSeed.z, fract(aSeed.y*7.13 + aSeed.z*3.71)) - 0.5; vec3 p;
        ${wrap ? `vAge = 0.5;
          vec3 q = r*uSpread + uVel*T*(0.7 + 0.6*aSeed.w) + uTurb*vec3(sin(T*0.7 + aSeed.x*30.0), sin(T*0.5 + aSeed.w*20.0)*0.3, cos(T*0.6 + aSeed.z*25.0));
          p = uOrigin + mod(q + uSpread*0.5, uSpread) - uSpread*0.5;`
        : `float life = uLife*(0.6 + 0.8*aSeed.w); float age = fract(T/life + aSeed.x); vAge = age; float tt = age*life;
          p = uOrigin + r*uSpread + uVel*tt*(0.6 + 0.8*aSeed.w) + 0.5*uGrav*tt*tt
            + uTurb*vec3(sin(tt*1.7 + aSeed.y*30.0), sin(tt*1.3 + aSeed.z*20.0)*0.5, cos(tt*1.5 + aSeed.x*25.0))*tt;`}
        vec4 mv = modelViewMatrix*vec4(p, 1.0); gl_Position = projectionMatrix*mv;
        gl_PointSize = clamp(uSize*(0.5 + aSeed.w)*mix(1.0, uGrow, vAge)*uScale/max(-mv.z, 0.05), 0.0, 256.0); }`,
    fragmentShader: `uniform vec3 uColA,uColB; uniform float uAlpha,uPetal,uOn,uTime; varying float vAge; varying vec4 vS;
      void main(){ vec2 q = gl_PointCoord - 0.5;
        float a;
        if (uPetal > 0.5) { float an = uTime*(1.0 + 2.0*vS.z) + vS.x*6.28; mat2 R = mat2(cos(an), -sin(an), sin(an), cos(an)); q = R*q;
          q.x *= 1.0 + 1.6*abs(sin(uTime*1.3 + vS.y*9.0)); a = smoothstep(0.5, 0.3, length(q*vec2(1.0, 1.9))); }
        else { float d = length(q)*2.0; a = smoothstep(1.0, 0.0, d); a *= a; }
        float fade = smoothstep(0.0, 0.12, vAge)*(1.0 - smoothstep(0.6, 1.0, vAge));
        vec3 c = mix(uColA, uColB, ${wrap ? 'vS.w' : 'vAge'});
        ${o.blend === 'normal' ? 'gl_FragColor = vec4(c, a*fade*uAlpha*uOn);' : 'gl_FragColor = vec4(c*a*fade*uAlpha*uOn, 1.0);'} }`,
    transparent: true, depthWrite: false, blending: o.blend === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 6; return pts;
}

// ---------- terrain ----------
export function makeTerrain(o = {}) {
  const rnd = mulberry32(o.seed ?? 1); const n2 = createNoise2D(rnd);
  const g = new THREE.PlaneGeometry(o.w ?? 200, o.d ?? 200, o.sw ?? 160, o.sd ?? 160); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position, colors = new Float32Array(pos.count * 3);
  const cLow = col(o.low ?? 0x3a4050), cHigh = col(o.high ?? 0x8a8f9a), cTop = o.top !== undefined ? col(o.top) : null;
  const tmp = new THREE.Color();
  let hmin = 1e9, hmax = -1e9; const hs = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + (o.ox ?? 0), z = pos.getZ(i) + (o.oz ?? 0);
    let h = 0, a = 1, f = o.freq ?? 0.02;
    for (let k = 0; k < (o.oct ?? 5); k++) { let v = n2(x * f, z * f); if (o.ridge) v = 1 - Math.abs(v) * 2 + 0.3; h += v * a; a *= 0.5; f *= 2.03; }
    if (o.peaky) { h = Math.pow(Math.max(0, h * 0.5 + 0.55), o.peaky); const zn = (pos.getZ(i) + (o.d ?? 200) / 2) / (o.d ?? 200); h *= sstep(0, 0.4, zn) * sstep(1, 0.7, zn); }
    h *= o.amp ?? 10;
    if (o.peak) { const [px, pz, pr, ph] = o.peak; const r = Math.hypot(x - px, z - pz); h += ph * Math.exp(-((r / pr) ** 2)); }
    if (o.flat) { const [fx, fz, fr, fh] = o.flat; const r = Math.hypot(x - fx, z - fz); const k = sstep(fr, fr * 2.2, r); h = lerp(fh, h, k); }
    if (o.drop) { const [ze, dd] = o.drop; h -= dd * sstep(ze, ze - 5, pos.getZ(i)); }
    if (o.edgeUp) { const r = Math.max(Math.abs(pos.getX(i)) / ((o.w ?? 200) / 2), Math.abs(pos.getZ(i)) / ((o.d ?? 200) / 2)); h += o.edgeUp * sstep(0.6, 1, r); }
    hs[i] = h; hmin = Math.min(hmin, h); hmax = Math.max(hmax, h);
  }
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, hs[i] + (o.y ?? 0));
    const k = (hs[i] - hmin) / Math.max(1e-6, hmax - hmin);
    tmp.copy(cLow).lerp(cHigh, sstep(0.05, 0.85, k)); if (cTop) tmp.lerp(cTop, sstep(o.topAt ?? 0.75, 1.0, k));
    colors.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3)); g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, toon(0xffffff, { vc: true, rimStr: o.rimStr || { value: 0.15 } }));
  if (o.receive) mesh.receiveShadow = true;
  mesh.userData.heightAt = (x, z) => { // nearest-vertex height lookup (good enough for placing props)
    const w = o.w ?? 200, d = o.d ?? 200, sw = o.sw ?? 160, sd = o.sd ?? 160;
    const ix = Math.round(((x + w / 2) / w) * sw), iz = Math.round(((z + d / 2) / d) * sd);
    return hs[clamp(iz, 0, sd) * (sw + 1) + clamp(ix, 0, sw)] + (o.y ?? 0);
  };
  return mesh;
}

// ---------- soft cloud / mist sheet ----------
export function makeCloudSheet(o = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, cA: { value: col(o.a ?? 0xffffff) }, cB: { value: col(o.b ?? 0xc8c8d8) }, uDen: { value: o.density ?? 1 },
      uSc: { value: o.scale ?? 0.01 }, uSpd: { value: o.speed ?? 1 }, uThr: { value: o.thr ?? 0.4 }, uSeed: { value: o.seed ?? 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
    fragmentShader: NOISE + `uniform float uTime,uDen,uSc,uSpd,uThr,uSeed; uniform vec3 cA,cB; varying vec2 vUv; varying vec3 vW;
      void main(){ vec2 p = vW.xz*uSc + vec2(uTime*0.015, uTime*0.008)*uSpd + uSeed;
        float n = fbm(p); float n2 = fbm(p*2.7 + 3.1 - uTime*0.01*uSpd);
        float c = smoothstep(uThr, uThr + 0.3, n*0.75 + n2*0.4);
        float edge = 1.0 - smoothstep(0.3, 0.5, length(vUv - 0.5));
        gl_FragColor = vec4(mix(cB, cA, clamp(n2*1.5 - 0.2, 0.0, 1.0)), c*edge*uDen); }`,
    transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(o.size ?? 600, o.size ?? 600).rotateX(-Math.PI / 2), m);
  mesh.position.y = o.y ?? 0; mesh.renderOrder = 2; return mesh;
}

// ---------- fire-trail tube (flame dragon) ----------
export function makeFireTrail(curve, o = {}) {
  const segs = o.segs ?? 260, geo = new THREE.TubeGeometry(curve, segs, o.radius ?? 1, 12, false);
  const pos = geo.attributes.position, uv = geo.attributes.uv, cen = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const c = curve.getPointAt(clamp(uv.getX(i))); cen.set([c.x, c.y, c.z], i * 3); }
  geo.setAttribute('aCenter', new THREE.BufferAttribute(cen, 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uHead: { value: 0 }, uTail: { value: o.tail ?? 0.45 }, uGain: { value: o.gain ?? 1 }, uTint: { value: col(o.tint ?? 0xffffff) }, uRoot: { value: o.root ?? 1 } },
    vertexShader: `attribute vec3 aCenter; uniform float uHead,uTail,uRoot; varying float vRel; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; float rel = (uHead - uv.x)/uTail; vRel = rel;
        float sc = mix(1.25, 0.12, clamp(rel, 0.0, 1.0)) * smoothstep(-0.02, 0.03, rel) * mix(uRoot, 1.0, smoothstep(0.0, 0.35, uv.x));
        vec3 p = aCenter + (position - aCenter)*sc;
        vec4 mv = modelViewMatrix*vec4(p,1.0); vV = -mv.xyz; vN = normalMatrix*normalize(position - aCenter);
        gl_Position = projectionMatrix*mv; }`,
    fragmentShader: NOISE + `uniform float uTime,uGain; uniform vec3 uTint; varying float vRel; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ if (vRel < 0.0 || vRel > 1.0) discard;
        float n = fbm(vec2(vUv.x*60.0 - uTime*7.0, vUv.y*5.0)); float n2 = vnoise(vec2(vUv.x*150.0 - uTime*12.0, vUv.y*12.0));
        float fac = abs(dot(normalize(vN), normalize(vV)));
        float heat = (1.0 - vRel)*(0.45 + 0.9*n)*(0.5 + 0.7*fac) + 0.25*n2*(1.0 - vRel);
        gl_FragColor = vec4(fireRamp(heat)*uTint*heat*uGain, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; mesh.renderOrder = 7; return mesh;
}

// ---------- glow sprite (additive radial) ----------
export function makeGlow(color, size = 1, o = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: { uCol: { value: col(color) }, uInt: { value: o.intensity ?? 1 }, uPow: { value: o.pow ?? 2.2 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; vec4 mv = modelViewMatrix*vec4(0.0,0.0,0.0,1.0);
      vec2 sc = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz)); mv.xy += position.xy*sc; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uCol; uniform float uInt,uPow; varying vec2 vUv;
      void main(){ float d = length(vUv - 0.5)*2.0; float a = pow(max(1.0 - d, 0.0), uPow); gl_FragColor = vec4(uCol*a*uInt, 1.0); }`,
    transparent: true, depthWrite: false, depthTest: o.depthTest ?? true, blending: THREE.AdditiveBlending,
  });
  const s = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m); s.scale.setScalar(size); s.frustumCulled = false; s.renderOrder = 8; return s;
}

// ---------- canvas texture helpers ----------
export function canvasTex(w, h, draw, o = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const ctx = c.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = o.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat, o.repeat); }
  t.anisotropy = 4; return t;
}
