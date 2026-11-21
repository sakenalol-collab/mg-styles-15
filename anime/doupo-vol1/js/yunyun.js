// 云韵 · original character model (design from the novel's description, not from any official adaptation).
// Semi-real cel style: soft-ramp toon shading, thin coloured outlines, hand-painted face texture, hair cards,
// layered 青 (teal) robe with wide sleeves, open-front over-skirt, gauze layer and a 披帛 shawl.
// Built in absolute metres (height ≈ 1.68 m, facing +z); everything sways from U.time, so frames are deterministic.
import * as THREE from 'three';
import { U, clamp, lerp, sstep, mulberry32, col } from './lib.js';

const f = (x) => (+x).toFixed(4);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export const PALETTE = [
  ['青', 0x2f8c8a], ['天青', 0x9bd9cf], ['月白', 0xeef6f3], ['黛', 0x18181f], ['浅金', 0xd8c38a], ['青玉', 0x79d1a8],
];
const C = { qing: 0x2f8c8a, qingDeep: 0x1d5a5e, tian: 0x9bd9cf, yue: 0xeef6f3, dai: 0x18181f, gold: 0xd8c38a, jade: 0x79d1a8, skin: 0xffffff };

// ---------------------------------------------------------------- materials
function ramp(vals) {
  const t = new THREE.DataTexture(new Uint8Array(vals), vals.length, 1, THREE.RedFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
const R_CLOTH = ramp([125, 150, 205, 240, 255]), R_SKIN = ramp([200, 214, 238, 252, 255]), R_HAIR = ramp([95, 120, 190, 245, 255]);

function deformGLSL(d) {
  if (!d) return '';
  if (d.mode === 'along') return `{ float k = pow(clamp(aAlong, 0.0, 1.0), 1.5);
      float ph = aPhase + ${f(d.phase ?? 0)};
      transformed.x += (sin(uTime*1.55 + aAlong*3.2 + ph)*0.65 + sin(uTime*2.6 + aAlong*6.5 + ph*1.7)*0.3) * ${f(d.amp)} * k;
      transformed.z += (cos(uTime*1.25 + aAlong*2.8 + ph)*0.7) * ${f(d.amp * 0.8)} * k;
      transformed.y += sin(uTime*1.9 + aAlong*4.0 + ph)*${f(d.amp * 0.25)}*k; }`;
  if (d.mode === 'hem') return `{ float k = clamp((${f(d.top)} - position.y) / ${f(d.len)}, 0.0, 1.0); k *= k;
      float a = atan(position.x, position.z);
      transformed.x += sin(uTime*1.45 + position.y*4.0 + a*2.0)*${f(d.amp)}*k;
      transformed.z += cos(uTime*1.15 + position.y*3.5 + a*3.0)*${f(d.amp * 0.8)}*k;
      transformed.xz *= 1.0 + sin(a*${f(d.pleats ?? 14)} + uTime*0.7 + position.y*2.0)*${f(d.pleat ?? 0)}*k; }`;
  return '';
}
function cel(color, o = {}) {
  const m = new THREE.MeshToonMaterial({
    color, gradientMap: o.ramp || R_CLOTH, map: o.map || null, vertexColors: !!o.vc, side: o.side ?? THREE.FrontSide,
    transparent: !!o.transparent, opacity: o.opacity ?? 1, depthWrite: o.depthWrite ?? !o.transparent, alphaTest: o.alphaTest ?? 0,
  });
  if (o.emissive !== undefined) { m.emissive = col(o.emissive); m.emissiveIntensity = o.ei ?? 1; }
  const dg = deformGLSL(o.deform), along = o.deform?.mode === 'along';
  const rimS = { value: o.rim ?? 0.35 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time; sh.uniforms.uRimG = U.rim; sh.uniforms.uRimS = rimS;
    sh.vertexShader = 'uniform float uTime;\n' + (along ? 'attribute float aAlong; attribute float aPhase;\n' : '') +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + dg);
    sh.fragmentShader = 'uniform vec3 uRimG; uniform float uRimS;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
      `{ float fr = 1.0 - saturate(dot(normalize(vViewPosition), normal)); outgoingLight += uRimG * uRimS * smoothstep(0.62, 0.92, fr); }
       #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'yy|' + dg + (along ? 'A' : '');
  return m;
}
function olMat(th, color, deform) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  const dg = deformGLSL(deform), along = deform?.mode === 'along';
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = 'uniform float uTime;\n' + (along ? 'attribute float aAlong; attribute float aPhase;\n' : '') +
      sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = vec3(position) + normal * ${f(th)};\n${dg}`);
  };
  m.customProgramCacheKey = () => 'yyol|' + th + dg + (along ? 'A' : '');
  return m;
}
function part(geo, mat, ol) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = true;
  if (ol) m.add(new THREE.Mesh(geo, olMat(ol.th, ol.color, ol.deform)));
  return m;
}
const OL_CLOTH = 0x173c3e, OL_SKIN = 0x7a4c40, OL_HAIR = 0x07070c;

// ---------------------------------------------------------------- textures
function canvas(w, h, draw, o = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...o.repeat); }
  return t;
}
function cloudPattern() { // faint 祥云 scroll motif, multiplied over cloth colour
  return canvas(512, 512, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(40,90,90,0.13)'; c.lineWidth = 5; c.lineCap = 'round';
    const scroll = (x, y, s) => {
      c.beginPath(); c.arc(x, y, 18 * s, Math.PI * 0.2, Math.PI * 1.9); c.stroke();
      c.beginPath(); c.arc(x + 30 * s, y - 6 * s, 13 * s, Math.PI * 1.1, Math.PI * 2.7); c.stroke();
      c.beginPath(); c.moveTo(x - 40 * s, y + 16 * s); c.bezierCurveTo(x - 10 * s, y + 26 * s, x + 30 * s, y + 24 * s, x + 56 * s, y + 10 * s); c.stroke();
    };
    for (const [x, y] of [[110, 120], [370, 250], [140, 400], [400, 470], [-20, 260], [490, 20]]) scroll(x, y, 1.15);
  }, { repeat: [5, 3] });
}
function trimTex() { // across-width stripes for collar / ribbons: deep edge | gold | white | gold | deep edge
  return canvas(64, 8, (c, w, h) => {
    const s = [['#1d5a5e', 0.14], ['#d8c38a', 0.08], ['#f4f6f2', 0.56], ['#d8c38a', 0.08], ['#1d5a5e', 0.14]]; let x = 0;
    for (const [cc, k] of s) { c.fillStyle = cc; c.fillRect(Math.round(x * w), 0, Math.ceil(k * w), h); x += k; }
  });
}
function hairTex(cap) {
  return canvas(cap ? 1024 : 128, cap ? 512 : 512, (c, w, h) => {
    c.fillStyle = '#1b1b24'; c.fillRect(0, 0, w, h);
    const r = mulberry32(cap ? 3 : 9);
    for (let i = 0; i < (cap ? 260 : 60); i++) { const x = r() * w; c.strokeStyle = r() > 0.5 ? 'rgba(70,80,110,0.35)' : 'rgba(5,5,10,0.4)'; c.lineWidth = 1 + r() * 2;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (r() - 0.5) * 20, h); c.stroke(); }
    if (!cap) return;
    // angel-ring highlight
    const y0 = cap ? h * 0.235 : h * 0.12, y1 = cap ? h * 0.27 : h * 0.16;
    c.fillStyle = 'rgba(120,135,170,0.75)'; c.beginPath(); c.moveTo(0, y0);
    for (let x = 0; x <= w; x += w / 40) c.lineTo(x, y0 + (r() - 0.5) * 6);
    for (let x = w; x >= 0; x -= w / 40) c.lineTo(x, y1 + r() * (y1 - y0) * 1.6);
    c.closePath(); c.fill();
  });
}

// ---------------------------------------------------------------- face: sphere deformed into a soft V-line head + painted features
function headDeform(p, r) {
  const ny = p.y / r;
  p.x *= 0.87; p.z *= 0.97;
  if (ny < 0) { const k = -ny; p.y *= 1 + 0.15 * k; p.x *= 1 - 0.27 * Math.pow(k, 1.7); p.z *= 1 - 0.1 * k * k; if (p.z > 0) p.z += 0.004 * k * r / 0.1; }
  else p.y *= 1.03;
  if (p.z < 0) p.z *= 1.06;
  return p;
}
function faceTexture() {
  const W = 4096, H = 2048, K = 652; // K px per radian
  const X = (a) => (0.25 + a / (2 * Math.PI)) * W, Yp = (t) => (t / Math.PI) * H, P = (a, t) => [X(a), Yp(t)];
  return canvas(W, H, (c) => {
    c.fillStyle = '#f8e8de'; c.fillRect(0, 0, W, H);
    const soft = (a, t, rad, rgba) => { const g = c.createRadialGradient(X(a), Yp(t), 0, X(a), Yp(t), rad * K); g.addColorStop(0, rgba); g.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)'));
      c.fillStyle = g; c.fillRect(X(a) - rad * K, Yp(t) - rad * K, 2 * rad * K, 2 * rad * K); };
    soft(-0.4, 2.0, 0.15, 'rgba(242,148,140,0.30)'); soft(0.4, 2.0, 0.15, 'rgba(242,148,140,0.30)');
    c.lineCap = 'round'; c.lineJoin = 'round';
    for (const s of [-1, 1]) {
      const ac = s * 0.37, tc = 1.71, w = 0.4;
      const inner = P(ac - s * w / 2, tc + 0.014), outer = P(ac + s * w / 2, tc - 0.026);
      const upC1 = P(ac - s * w * 0.2, tc - 0.108), upC2 = P(ac + s * w * 0.27, tc - 0.112);
      const loC1 = P(ac + s * w * 0.22, tc + 0.075), loC2 = P(ac - s * w * 0.2, tc + 0.078);
      const almond = () => { c.beginPath(); c.moveTo(...inner); c.bezierCurveTo(...upC1, ...upC2, ...outer); c.bezierCurveTo(...loC1, ...loC2, ...inner); c.closePath(); };
      soft(ac + s * 0.04, tc - 0.08, 0.17, 'rgba(214,150,150,0.22)'); // lid shadow / eyeshadow
      c.save(); almond(); c.fillStyle = '#fcf8f5'; c.fill(); c.clip();
      const [ix, iy] = P(ac + s * 0.01, tc + 0.006), rx = 0.088 * K, ry = 0.1 * K;
      const g = c.createLinearGradient(ix, iy - ry, ix, iy + ry); g.addColorStop(0, '#1e110c'); g.addColorStop(0.5, '#4d2c1b'); g.addColorStop(0.85, '#9c6a3c'); g.addColorStop(1, '#c79458');
      c.fillStyle = g; c.beginPath(); c.ellipse(ix, iy, rx, ry, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#140a07'; c.lineWidth = 8; c.stroke();
      c.fillStyle = '#100604'; c.beginPath(); c.ellipse(ix, iy + 6, rx * 0.4, ry * 0.48, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(150,215,205,0.32)'; c.beginPath(); c.ellipse(ix, iy + ry * 0.5, rx * 0.62, ry * 0.24, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(60,35,30,0.32)'; c.fillRect(ix - 300, iy - ry - 80, 600, ry * 0.8 + 80);
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(ix - s * rx * 0.34, iy - ry * 0.34, rx * 0.3, ry * 0.24, -0.35, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(ix + s * rx * 0.32, iy + ry * 0.4, rx * 0.12, ry * 0.1, 0, 0, Math.PI * 2); c.fill();
      c.restore();
      c.strokeStyle = '#1b1010';
      c.lineWidth = 19; c.beginPath(); c.moveTo(...inner); c.bezierCurveTo(...upC1, ...upC2, ...outer); c.stroke();
      c.lineWidth = 13; c.beginPath(); c.moveTo(...outer); c.quadraticCurveTo(outer[0] + s * 36, outer[1] - 6, outer[0] + s * 58, outer[1] - 30); c.stroke();
      c.lineWidth = 7; for (let k = 0; k < 4; k++) { const ox = outer[0] - s * (k * 26 + 4), oy = outer[1] - 14 + k * 2; c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + s * 20, oy - 24); c.stroke(); }
      c.strokeStyle = 'rgba(150,92,82,0.6)'; c.lineWidth = 5; c.beginPath(); c.moveTo(...P(ac - s * w * 0.4, tc - 0.095)); c.quadraticCurveTo(...P(ac + s * 0.02, tc - 0.158), ...P(ac + s * w * 0.48, tc - 0.075)); c.stroke();
      c.strokeStyle = 'rgba(115,65,55,0.75)'; c.lineWidth = 5; c.beginPath(); c.moveTo(...P(ac - s * w * 0.05, tc + 0.077)); c.bezierCurveTo(...loC1, ...loC1, ...outer); c.stroke();
      c.strokeStyle = '#3a2925'; c.lineWidth = 11; c.beginPath(); c.moveTo(...P(ac - s * 0.17, tc - 0.215)); c.quadraticCurveTo(...P(ac + s * 0.05, tc - 0.29), ...P(ac + s * 0.25, tc - 0.235)); c.stroke();
      c.lineWidth = 16; c.beginPath(); c.moveTo(...P(ac - s * 0.17, tc - 0.215)); c.quadraticCurveTo(...P(ac - s * 0.1, tc - 0.245), ...P(ac - s * 0.02, tc - 0.258)); c.stroke();
    }
    c.strokeStyle = 'rgba(200,140,125,0.8)'; c.lineWidth = 7; c.beginPath(); c.moveTo(...P(-0.04, 2.045)); c.quadraticCurveTo(...P(0, 2.065), ...P(0.035, 2.043)); c.stroke();
    c.strokeStyle = 'rgba(215,165,150,0.35)'; c.lineWidth = 6; c.beginPath(); c.moveTo(...P(0.032, 1.82)); c.quadraticCurveTo(...P(0.035, 1.94), ...P(0.02, 2.015)); c.stroke();
    c.fillStyle = '#e88f8a'; c.beginPath(); c.ellipse(...P(0, 2.318), 0.092 * K, 0.03 * K, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,232,226,0.65)'; c.beginPath(); c.ellipse(...P(0.015, 2.324), 0.036 * K, 0.009 * K, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#b25a56'; c.lineWidth = 8; c.beginPath(); c.moveTo(...P(-0.11, 2.294)); c.bezierCurveTo(...P(-0.05, 2.28), ...P(-0.018, 2.303), ...P(0, 2.295));
    c.bezierCurveTo(...P(0.018, 2.303), ...P(0.05, 2.28), ...P(0.11, 2.294)); c.stroke();
  });
}
// alpha-cut hair sheet texture: strands with pointed tips along the bottom edge (v = 0), streaks, optional highlight
function hairSheetTex(tips, o = {}) {
  return canvas(1024, 512, (c, w, h) => {
    const r = mulberry32(o.seed ?? 5);
    c.clearRect(0, 0, w, h);
    const edge = (u) => { // bottom edge y (px from top) at u
      if (o.edgeFn) return h * o.edgeFn(u);
      let best = 0;
      for (const [u0, wd, depth] of tips) { const d = Math.abs(u - u0) / wd; if (d < 1) best = Math.max(best, depth * (1 - Math.pow(d, 1.4))); }
      return h * ((o.base ?? 0.55) + best * (1 - (o.base ?? 0.55)));
    };
    c.beginPath(); c.moveTo(0, 0); for (let x = 0; x <= w; x += 2) c.lineTo(x, edge(x / w)); c.lineTo(w, 0); c.closePath();
    c.fillStyle = '#1b1b24'; c.fill();
    c.save(); c.clip();
    for (let i = 0; i < 220; i++) { const x = r() * w; c.strokeStyle = r() > 0.5 ? 'rgba(78,90,122,0.32)' : 'rgba(4,4,8,0.45)'; c.lineWidth = 1 + r() * 2.5;
      c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x + (r() - 0.5) * 30, h * 0.5, x + (r() - 0.5) * 50, h); c.stroke(); }
    if (o.ring) { c.fillStyle = 'rgba(125,140,178,0.7)'; c.beginPath(); c.moveTo(0, h * o.ring);
      for (let x = 0; x <= w; x += w / 48) c.lineTo(x, h * o.ring + (r() - 0.5) * 8); for (let x = w; x >= 0; x -= w / 48) c.lineTo(x, h * (o.ring + 0.05) + r() * 22); c.closePath(); c.fill(); }
    c.restore();
    if (o.line === false) return;
    c.strokeStyle = 'rgba(0,0,0,0.85)'; c.lineWidth = 5; c.beginPath(); for (let x = 0; x <= w; x += 2) { const y = edge(x / w); x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
  });
}
// ---------------------------------------------------------------- geometry helpers
function lathe(profile, seg, o = {}) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg, o.phiStart ?? Math.PI, o.phiLength ?? Math.PI * 2);
  const p = g.attributes.position;
  if (o.map) for (let i = 0; i < p.count; i++) { const v = V3(p.getX(i), p.getY(i), p.getZ(i)); o.map(v); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  if ((o.phiLength ?? Math.PI * 2) >= Math.PI * 2 - 1e-6) { // average the seam normals
    const n = g.attributes.normal, rows = profile.length, last = seg * rows;
    for (let j = 0; j < rows; j++) { const a = j, b = last + j; const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b); const l = Math.hypot(x, y, z) || 1;
      n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l); }
  }
  return g;
}
function vcolors(g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3), t = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(t, p.getX(i), p.getY(i), p.getZ(i), i); c.set([t.r, t.g, t.b], i * 3); }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
// ribbon / hair card along a curve. widthFn(u); side(u, p, T) -> unit width direction
function ribbon(curve, segs, widthFn, side, o = {}) {
  const pos = [], uv = [], al = [], ph = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, p = curve.getPointAt(u), T = curve.getTangentAt(u), B = side(u, p, T), w = widthFn(u);
    pos.push(p.x - B.x * w / 2, p.y - B.y * w / 2, p.z - B.z * w / 2, p.x + B.x * w / 2, p.y + B.y * w / 2, p.z + B.z * w / 2);
    uv.push(0, u, 1, u); const a = (o.along0 ?? 0) + u * (o.alongScale ?? 1); al.push(a, a); ph.push(o.phase ?? 0, o.phase ?? 0);
    if (i < segs) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aAlong', new THREE.Float32BufferAttribute(al, 1)); g.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
const curve = (pts) => new THREE.CatmullRomCurve3(pts.map((p) => V3(...p)), false, 'centripetal');

// ---------------------------------------------------------------- body measurements (absolute metres)
const TORSO = [[0.0, 0.99], [0.112, 0.995], [0.115, 1.03], [0.122, 1.08], [0.135, 1.14], [0.147, 1.195], [0.151, 1.24], [0.146, 1.285], [0.138, 1.325],
  [0.142, 1.35], [0.13, 1.385], [0.1, 1.412], [0.062, 1.432], [0.04, 1.442], [0.0, 1.446]];
const tsx = (y) => 1 + 0.18 * sstep(1.29, 1.375, y) * (1 - sstep(1.4, 1.44, y));
const tsz = (y) => 0.72 - 0.07 * sstep(1.3, 1.4, y);
const bust = (y, z) => (z > 0 ? 1 + 0.13 * Math.exp(-(((y - 1.235) / 0.055) ** 2)) : 1);
function rAt(prof, y) { for (let i = 0; i < prof.length - 1; i++) { const [r0, y0] = prof[i], [r1, y1] = prof[i + 1]; if ((y - y0) * (y - y1) <= 0 && y0 !== y1) return lerp(r0, r1, (y - y0) / (y1 - y0)); } return prof[prof.length - 1][0]; }
const torsoFrontZ = (x, y, off = 0) => { const r = rAt(TORSO.slice(1), y), sx = tsx(y), sz = tsz(y); const q = r * r - (x / sx) ** 2; return (q > 0 ? sz * Math.sqrt(q) : 0) * bust(y, 1) + off; };
const SKIRT_OUT = [[0.124, 1.035], [0.15, 0.95], [0.178, 0.85], [0.215, 0.66], [0.27, 0.4], [0.33, 0.17], [0.375, 0.03], [0.385, 0.005]];
const SKIRT_IN = [[0.0, 0.0], [0.34, 0.0], [0.33, 0.04], [0.28, 0.25], [0.215, 0.55], [0.168, 0.82], [0.14, 0.95], [0.118, 1.03]];
const SKIRT_GZ = [[0.128, 1.04], [0.158, 0.95], [0.19, 0.84], [0.235, 0.64], [0.3, 0.38], [0.37, 0.15], [0.42, 0.02], [0.43, 0.0]];

// ---------------------------------------------------------------- the model
export function makeYunyun(o = {}) {
  const root = new THREE.Group();
  const U0 = 1.03;
  const lower = new THREE.Group(); root.add(lower);
  const upper = new THREE.Group(); upper.position.y = U0; root.add(upper);
  const abs = (m) => { m.position.y -= U0; return m; }; // geometry in absolute coords inside `upper`
  const pattern = cloudPattern(), trim = trimTex();
  const qing = col(C.qing), qingD = col(C.qingDeep), tian = col(C.tian), yue = col(C.yue), gold = col(C.gold);

  // --- skirts
  const skirtDef = { mode: 'hem', top: 0.98, len: 0.98, amp: 0.018, pleats: 13, pleat: 0.025 };
  const inner = vcolors(lathe(SKIRT_IN, 72), (t, x, y) => { t.copy(yue); if (y < 0.05) t.lerp(tian, 0.35); });
  lower.add(part(inner, cel(0xffffff, { vc: true, deform: skirtDef }), { th: 0.0035, color: OL_CLOTH, deform: skirtDef }));
  const gap = 0.95;
  const outerG = vcolors(lathe(SKIRT_OUT, 84, { phiStart: gap / 2, phiLength: Math.PI * 2 - gap }), (t, x, y, z) => {
    const k = sstep(1.0, 0.05, y); t.copy(qingD).lerp(qing, sstep(0, 0.35, k)).lerp(tian, sstep(0.45, 1.0, k) * 0.75);
    const a = Math.abs(Math.atan2(x, z)); const edge = Math.min(Math.abs(a - gap / 2), 9);
    if (y < 0.055 || edge < 0.05) t.copy(yue); if ((y >= 0.055 && y < 0.07) || (edge >= 0.05 && edge < 0.065)) t.copy(gold);
  });
  lower.add(part(outerG, cel(0xffffff, { vc: true, map: pattern, side: THREE.DoubleSide, deform: { ...skirtDef, amp: 0.024 } }), { th: 0.004, color: OL_CLOTH, deform: { ...skirtDef, amp: 0.024 } }));
  const gauze = new THREE.Mesh(lathe(SKIRT_GZ, 84), cel(0xc8efe8, { transparent: true, opacity: 0.3, side: THREE.DoubleSide, rim: 0.6, deform: { mode: 'hem', top: 1.0, len: 1.0, amp: 0.04, pleats: 9, pleat: 0.04 } }));
  gauze.renderOrder = 4; lower.add(gauze);

  // --- torso / upper garment
  const torsoG = vcolors(lathe(TORSO, 96, { map: (v) => { v.x *= tsx(v.y); v.z *= tsz(v.y) * bust(v.y, v.z); } }), (t, x, y, z) => {
    t.copy(qing).lerp(qingD, 0.25);
    const xm = y > 1.3 ? lerp(0.0, 0.058, (y - 1.3) / 0.147) : lerp(-0.105, 0.0, (y - 1.08) / 0.22), xu = lerp(0.0, -0.058, (y - 1.31) / 0.137);
    if (z > 0 && y > 1.31 && y < 1.42 && x > xu && x < xm) t.copy(yue);
  });
  upper.add(abs(part(torsoG, cel(0xffffff, { vc: true, map: pattern }), { th: 0.0035, color: OL_CLOTH })));
  const surf = (x, y, off) => V3(x, y, torsoFrontZ(x, y, off));
  const collarSide = (u, p, T) => new THREE.Vector3().crossVectors(T, V3(0, 0, 1)).normalize();
  const collarMat = cel(0xffffff, { map: trim, side: THREE.DoubleSide });
  const mainC = curve([...[[0.05, 1.418]].map(([x, y]) => { const s = surf(x, y, 0.007); return [s.x, s.y, s.z]; }), ...[0.04, 0.02, 0.0, -0.035, -0.07, -0.1].map((x, i) => { const y = [1.405, 1.355, 1.305, 1.235, 1.155, 1.085][i]; const s = surf(x, y, 0.007); return [s.x, s.y, s.z]; })]);
  upper.add(abs(part(ribbon(mainC, 40, () => 0.034, collarSide), collarMat)));
  const underC = curve([...[[-0.05, 1.418], [-0.036, 1.398], [-0.024, 1.375], [-0.012, 1.35], [0.0, 1.322]].map(([x, y]) => { const s = surf(x, y, 0.005); return [s.x, s.y, s.z]; })]);
  upper.add(abs(part(ribbon(underC, 16, () => 0.03, collarSide), collarMat)));
  const band = lathe([[0.05, 1.402], [0.049, 1.42], [0.045, 1.44], [0.041, 1.452]], 48, { map: (v) => { v.z = v.z * 0.92 + 0.004; } });
  upper.add(abs(part(vcolors(band, (t, x, y) => { t.copy(yue); if (y > 1.447) t.copy(qingD); }), cel(0xffffff, { vc: true }), { th: 0.002, color: OL_CLOTH })));
  // sash, bow, hanging ribbons, jade pendant
  const sash = lathe([[0.123, 1.0], [0.127, 1.02], [0.128, 1.05], [0.125, 1.075]], 72, { map: (v) => { v.z *= 0.74; } });
  upper.add(abs(part(vcolors(sash, (t, x, y) => { t.copy(qingD); if (Math.abs(y - 1.003) < 0.006 || Math.abs(y - 1.072) < 0.006) t.copy(gold); }), cel(0xffffff, { vc: true }), { th: 0.003, color: OL_CLOTH })));
  const bow = part(new THREE.TorusGeometry(0.022, 0.009, 8, 16), cel(C.qingDeep), { th: 0.002, color: OL_CLOTH });
  bow.position.set(0.0, 1.04 - U0, 0.097); upper.add(bow);
  const sashDef = { mode: 'along', amp: 0.035 };
  for (const [s, len, ph] of [[-1, 0.62, 0.0], [1, 0.52, 1.3]]) {
    const c = curve([[0.006 * s, 1.035, 0.1], [0.02 * s, 0.9, 0.16], [0.03 * s, 0.7, 0.215], [0.035 * s, 1.035 - len, 0.25 + 0.04 * (len - 0.5)]]);
    upper.add(abs(part(ribbon(c, 30, (u) => 0.03 - 0.008 * u, () => V3(1, 0, 0), { phase: ph }), cel(0xffffff, { map: trim, side: THREE.DoubleSide, deform: sashDef }))));
  }
  const pend = part(new THREE.SphereGeometry(0.016, 14, 10), cel(C.jade, { emissive: 0x1a4a36, ei: 0.6, rim: 0.6 }), { th: 0.0015, color: 0x1f4a3a });
  pend.position.set(0.075, 0.86 - U0, 0.172); pend.scale.set(1, 1.3, 0.6); upper.add(pend);
  const tassel = part(new THREE.ConeGeometry(0.01, 0.09, 8).translate(0, -0.045, 0), cel(C.yue), { th: 0.0015, color: OL_CLOTH });
  tassel.position.set(0.075, 0.84 - U0, 0.172); upper.add(tassel);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.16, 5).translate(0, -0.08, 0), cel(C.gold)); cord.position.set(0.075, 1.02 - U0, 0.105); cord.rotation.x = -0.35; upper.add(cord);

  // --- neck + head
  const skinMat = cel(0xffeee6, { ramp: R_SKIN, rim: 0.25 });
  const neck = part(new THREE.CylinderGeometry(0.03, 0.036, 0.1, 18), skinMat, { th: 0.002, color: OL_SKIN });
  neck.position.set(0, 1.462 - U0, 0.004); upper.add(neck);
  const head = new THREE.Group(); head.position.set(0, 1.488 - U0, 0.01); head.scale.setScalar(1.1); upper.add(head);
  const HC = V3(0, 0.085, 0), R = 0.1;
  const faceG = new THREE.SphereGeometry(R, 72, 54); { const p = faceG.attributes.position; for (let i = 0; i < p.count; i++) { const v = headDeform(V3(p.getX(i), p.getY(i), p.getZ(i)), R); p.setXYZ(i, v.x, v.y, v.z); }
    // nose bridge/tip
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (z > 0.07) { const t = clamp((-y - 0.005) / 0.05); p.setZ(i, z + 0.007 * Math.exp(-((x / 0.011) ** 2)) * Math.sin(Math.PI * Math.min(1, t)) * (t < 1 ? 1 : 0)); } }
    faceG.computeVertexNormals(); }
  const face = part(faceG, cel(0xffffff, { map: faceTexture(), ramp: R_SKIN, rim: 0.2 }), { th: 0.0022, color: OL_SKIN });
  face.position.copy(HC); head.add(face);
  // hair
  const hairCapT = hairTex(true), hairCardT = hairTex(false);
  const hairMat = cel(0xffffff, { map: hairCapT, ramp: R_HAIR, side: THREE.DoubleSide, rim: 0.22 });
  const capGeo = (r, ps, pl, t0, t1, seg = 64) => { const g = new THREE.SphereGeometry(r, seg, 40, ps, pl, t0, t1); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const v = headDeform(V3(p.getX(i), p.getY(i), p.getZ(i)), r); v.y *= 1.02; p.setXYZ(i, v.x, v.y, v.z); } g.computeVertexNormals(); return g; };
  const backCap = part(capGeo(R * 1.075, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9, 0, 2.38), hairMat, { th: 0.0018, color: OL_HAIR });
  const topCap = part(capGeo(R * 1.08, 0, Math.PI * 2, 0, 0.72), hairMat, { th: 0.0018, color: OL_HAIR });
  backCap.position.copy(HC); topCap.position.copy(HC); head.add(backCap, topCap);
  const onHead = (a, t, r) => { const v = V3(-r * Math.cos(Math.PI / 2 + a) * Math.sin(t), r * Math.cos(t), r * Math.sin(Math.PI / 2 + a) * Math.sin(t)); headDeform(v, r); return v.add(HC); };
  const cardMat = (amp, ph) => cel(0xffffff, { map: hairCardT, ramp: R_HAIR, side: THREE.DoubleSide, rim: 0.22, deform: { mode: 'along', amp, phase: ph } });
  const radialSide = (center) => (u, p, T) => { const n = p.clone().sub(center).normalize(); return new THREE.Vector3().crossVectors(T, n).normalize(); };
  // bangs + side hair: alpha-cut sheets shaped to the skull, pointed strand tips along the lower edge
  const sheetGeo = (r, ps, pl, t0, tl, hang) => {
    const g = new THREE.SphereGeometry(r, 72, 40, ps, pl, t0, tl); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let v = V3(p.getX(i), p.getY(i), p.getZ(i)); const th = Math.acos(clamp(v.y / r, -1, 1));
      if (hang && th > Math.PI / 2) { const ph = Math.atan2(v.z, -v.x); const e = V3(-r * Math.cos(ph), 0, r * Math.sin(ph)); headDeform(e, r); e.y = -r * (th - Math.PI / 2) * 1.15; e.x *= 1.0; v = e; }
      else headDeform(v, r);
      const lift = sstep(0.9, 1.6, th) * 0.008; v.multiplyScalar(1 + lift / r);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); return g;
  };
  const sheetMat = (tex) => cel(0xffffff, { map: tex, ramp: R_HAIR, side: THREE.DoubleSide, rim: 0.05, alphaTest: 0.5 });
  const bangEdge = (u) => { // centre part: forehead shows in the middle, curtains fall to the cheeks with pointed strands
    const d = Math.abs(u - 0.5), side = Math.pow(sstep(0.0, 0.24, d), 0.8);
    const ph = (u * 14 + (u > 0.5 ? 0.35 : 0)) % 1, tri = 1 - Math.abs(ph - 0.5) * 2; // 0 at gaps, 1 at strand tips
    return clamp(0.43 + 0.55 * side - (0.01 + 0.16 * side * side) * (1 - Math.pow(tri, 2.2)), 0, 0.995);
  };
  const bangG = sheetGeo(R * 1.095, Math.PI / 2 - 1.3, 2.6, 0.28, 1.36, false);
  const bangsM = new THREE.Mesh(bangG, sheetMat(hairSheetTex(null, { edgeFn: bangEdge, seed: 11, ring: 0.2, line: false }))); bangsM.position.copy(HC); head.add(bangsM);
  for (const s of [-1, 1]) {
    const tips = Array.from({ length: 12 }, (_, i) => { const u = (i + 0.5) / 12; const d = i < 3 ? 1.0 : 0.62 + 0.3 * Math.abs(Math.sin(i * 2.3)); return [s > 0 ? u : 1 - u, 0.07, d]; });
    const g = sheetGeo(R * 1.09, s > 0 ? Math.PI / 2 + 0.8 : Math.PI / 2 - 1.95, 1.15, 0.45, 1.95, true);
    const m = new THREE.Mesh(g, sheetMat(hairSheetTex(tips, { base: 0.62, seed: 20 + s, ring: 0.12, line: false }))); m.position.copy(HC); head.add(m);
  }
  // side locks framing the face
  for (const s of [-1, 1]) {
    const p0 = onHead(s * 1.2, 1.7, R * 1.1), p1 = onHead(s * 1.22, 2.1, R * 1.16);
    const c = curve([[p0.x, p0.y, p0.z], [p1.x, p1.y, p1.z], [s * 0.118, -0.06, 0.03], [s * 0.118, -0.17, 0.07], [s * 0.1, -0.25, 0.095]]);
    head.add(part(ribbon(c, 36, (u) => 0.05 * Math.pow(1 - u, 0.8) + 0.004, (u, p, T) => new THREE.Vector3().crossVectors(T, V3(0.3 * s, 0, 1).normalize()).normalize(), { phase: s }), cardMat(0.012, s), null));
  }
  // half-up bun, 青玉簪, white magnolia
  const bun1 = part(new THREE.SphereGeometry(0.04, 20, 14), hairMat, { th: 0.0025, color: OL_HAIR }); bun1.position.set(0, HC.y + 0.088, -0.062); bun1.scale.set(1.15, 0.85, 0.95); head.add(bun1);
  const bun2 = part(new THREE.TorusGeometry(0.03, 0.014, 10, 20), hairMat, { th: 0.002, color: OL_HAIR }); bun2.position.set(0, HC.y + 0.112, -0.07); bun2.rotation.x = 1.1; head.add(bun2);
  const jade = cel(C.jade, { emissive: 0x16402e, ei: 0.5, rim: 0.6 });
  const pin = part(new THREE.CylinderGeometry(0.0035, 0.0028, 0.17, 8), jade, { th: 0.0012, color: 0x1f4a3a }); pin.position.set(0.0, HC.y + 0.1, -0.065); pin.rotation.z = 1.2; pin.rotation.y = 0.25; head.add(pin);
  const pinHead = part(new THREE.SphereGeometry(0.009, 10, 8), jade, { th: 0.0012, color: 0x1f4a3a }); pinHead.position.set(0.078, HC.y + 0.135, -0.083); head.add(pinHead);
  for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), cel(C.yue, { rim: 0.6 })); b.position.set(0.082, HC.y + 0.118 - k * 0.014, -0.083); head.add(b); }
  const flower = new THREE.Group(); flower.position.set(-0.058, HC.y + 0.098, -0.04); flower.rotation.set(0.3, -0.9, 0.2); head.add(flower);
  const petalShape = new THREE.Shape(); petalShape.moveTo(0, 0); petalShape.bezierCurveTo(0.012, 0.01, 0.01, 0.028, 0, 0.034); petalShape.bezierCurveTo(-0.01, 0.028, -0.012, 0.01, 0, 0);
  const petalG = new THREE.ShapeGeometry(petalShape, 6);
  for (let k = 0; k < 6; k++) { const pm = new THREE.Mesh(petalG, cel(0xfbfbf7, { side: THREE.DoubleSide, rim: 0.5 })); pm.rotation.z = (k / 6) * Math.PI * 2; pm.rotation.x = 0.35; flower.add(pm); }
  const fc = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 6), cel(0xf0d070)); fc.position.z = 0.004; flower.add(fc);
  // long back hair: cards from the back of the head down to the hips (in `upper`, absolute coords)
  const N = 30;
  const backZ = (y) => -(y > 1.03 ? rAt(TORSO.slice(1), y) * tsz(y) : rAt(SKIRT_OUT.slice().reverse(), y) * 0.97);
  for (let k = 0; k < N; k++) {
    const u = k / (N - 1), a = Math.PI + (u - 0.5) * 3.7, ca = Math.cos(a), sa = Math.sin(a);
    const side = Math.abs(u - 0.5) * 2; // 0 = centre back, 1 = beside the face
    const p0 = onHead(a, 0.95, R * 1.05).multiplyScalar(1.1).add(head.position).add(V3(0, U0, 0));
    const p1 = onHead(a, 1.55, R * 1.105).multiplyScalar(1.1).add(head.position).add(V3(0, U0, 0)), p1b = onHead(a, 2.05, R * 1.16).multiplyScalar(1.1).add(head.position).add(V3(0, U0, 0));
    const tipY = 0.84 - 0.09 * Math.sin(u * 17.3 + 0.7) * Math.cos(u * 5.1) - 0.05 * (1 - side) + 0.1 * side * side;
    const pts = [p0, p1, p1b];
    for (const y of [1.39, 1.22, 1.04, tipY]) {
      const bz = backZ(Math.max(y, 0.5)) - 0.028 - 0.012 * (1 - side);
      const xs = sa * (0.1 + 0.07 * side) * (1 + (1.4 - y) * 0.75);
      pts.push(V3(xs, y, bz * (1 - 0.3 * side) - 0.007 * (k % 4)));
    }
    const c = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const g = ribbon(c, 40, (v) => (0.062 + 0.022 * Math.sin(v * Math.PI)) * Math.pow(1 - Math.pow(v, 2.2), 0.9) + 0.003,
      (v, p, T) => new THREE.Vector3().crossVectors(T, V3(p.x, 0, p.z - 0.0).normalize()).normalize(), { phase: k * 0.37 });
    upper.add(abs(part(g, cardMat(0.022, k * 0.37), k % 3 === 0 ? { th: 0.0018, color: OL_HAIR, deform: { mode: 'along', amp: 0.022, phase: k * 0.37 } } : null)));
  }

  // --- arms with wide hanging sleeves
  const sleeveProf = [[0.0, 0.02], [0.038, 0.016], [0.05, 0.0], [0.058, -0.1], [0.066, -0.22], [0.082, -0.33], [0.112, -0.43], [0.15, -0.53], [0.183, -0.62], [0.195, -0.655], [0.196, -0.66], [0.198, -0.668], [0.199, -0.672], [0.204, -0.7]];
  const sleeveDef = { mode: 'hem', top: -0.36, len: 0.36, amp: 0.016, pleats: 7, pleat: 0.03 };
  const arm = (s) => {
    const piv = new THREE.Group(); piv.position.set(0.148 * s, 1.37 - U0, -0.005); upper.add(piv);
    const g = lathe(sleeveProf, 64, { map: (v) => { const k = sstep(-0.36, -0.7, v.y), a = Math.atan2(v.x, v.z);
      v.y -= 0.13 * k * (0.5 + 0.5 * Math.cos(a - Math.PI)) + 0.04 * k * (0.5 + 0.5 * Math.cos(a - s * Math.PI / 2));
      v.x *= 1 - 0.3 * sstep(-0.3, -0.6, v.y); } });
    vcolors(g, (t, x, y) => { const k = sstep(-0.05, -0.75, y); t.copy(qing).lerp(qingD, 0.2 * (1 - k)).lerp(tian, 0.55 * k * k); });
    // cuff trim: recolour by profile row (last rows)
    { const c = g.attributes.color, rows = sleeveProf.length; for (let i = 0; i < c.count; i++) { const row = i % rows; if (row >= rows - 2) c.setXYZ(i, yue.r, yue.g, yue.b); else if (row === rows - 3 || row === rows - 4) c.setXYZ(i, gold.r, gold.g, gold.b); } }
    piv.add(part(g, cel(0xffffff, { vc: true, map: pattern, side: THREE.DoubleSide, deform: sleeveDef }), { th: 0.0035, color: OL_CLOTH, deform: sleeveDef }));
    const fore = part(new THREE.CylinderGeometry(0.022, 0.026, 0.28, 10).translate(0, -0.44, 0), skinMat, null); piv.add(fore);
    const hand = part(new THREE.SphereGeometry(1, 14, 10), skinMat, { th: 0.03, color: OL_SKIN }); hand.scale.set(0.024, 0.062, 0.013); hand.position.set(0, -0.63, 0.008); hand.rotation.z = s * 0.08; piv.add(hand);
    piv.userData.hand = hand; return piv;
  };
  const armL = arm(1), armR = arm(-1);

  // --- 披帛 shawl: across the back, over the forearms, hanging in front of the sleeves
  const shawlTex = canvas(64, 8, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = '#9fd8cf'; c.fillRect(6, 0, w - 12, h); c.fillStyle = '#c4ebe4'; c.fillRect(14, 0, w - 28, h); });
  const shawlMat = cel(0xffffff, { map: shawlTex, transparent: true, opacity: 0.78, side: THREE.DoubleSide, rim: 0.5, deform: { mode: 'along', amp: 0.055 } });
  for (const s of [-1, 1]) {
    const c = curve([[0, 1.27, -0.118], [0.11 * s, 1.26, -0.115], [0.21 * s, 1.2, -0.1], [0.3 * s, 1.1, -0.02], [0.29 * s, 1.03, 0.115], [0.29 * s, 0.88, 0.225], [0.3 * s, 0.66, 0.235], [0.32 * s, 0.4, 0.17], [0.34 * s, 0.13, 0.12]]);
    const g = ribbon(c, 70, (u) => 0.072 + 0.012 * Math.sin(u * 3), (u, p, T) => { const B = new THREE.Vector3().crossVectors(T, V3(0, 0, 1)); if (B.lengthSq() < 0.05) B.crossVectors(T, V3(1, 0, 0)); return B.normalize(); }, { phase: s * 1.1 });
    const m = new THREE.Mesh(g, shawlMat); m.renderOrder = 5; upper.add(abs(m));
  }

  root.traverse((m) => { if (m.isMesh && !m.material.transparent) m.castShadow = true; });
  const pose = (p = {}) => {
    armL.rotation.set(p.armL?.[0] ?? 0.05, 0, p.armL?.[1] ?? 0.22);
    armR.rotation.set(p.armR?.[0] ?? 0.05, 0, p.armR?.[1] ?? -0.22);
    head.rotation.set(p.head ?? 0, p.headTurn ?? 0, p.headTilt ?? 0);
    upper.rotation.set(p.lean ?? 0, p.turn ?? 0, 0);
  };
  pose();
  Object.assign(root.userData, { pose, head, upper, armL, armR });
  return root;
}
