"""云韵 · realistic CG (original design, 青 robe) — Blender 5.x build + render script.

The body/head starts from Blender's CC0 "Human Base Meshes" bundle (realistic female). Everything else — face
styling, skin, eyes, brows, lashes, strand hair, clothing, lights — is generated here, so the same script renders
on a CPU box (preview) or an RTX card (final).

  blender -b -P yunyun_real.py -- --bundle /path/human_base_meshes_bundle.blend --out yunyun.png --device OPTIX
  python3 yunyun_real.py --bundle ... --out ...            # same, with the `bpy` module (pip install bpy)

Bundle: https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip (CC0)
"""
import argparse
import math
import os
import sys
import time

import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

T0 = time.time()
def log(*a):
    print(f'[yunyun {time.time() - T0:6.1f}s]', *a, flush=True)


# ------------------------------------------------------------------------------------------------ args
def parse_args():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    p = argparse.ArgumentParser()
    p.add_argument('--bundle', default='auto', help="path to human_base_meshes_bundle.blend, or 'auto' to download (CC0, ~50 MB)")
    p.add_argument('--out', default='yunyun.png')
    p.add_argument('--res', default='1200x1500')
    p.add_argument('--samples', type=int, default=96)
    p.add_argument('--device', default='AUTO', help='AUTO | CPU | OPTIX | CUDA | HIP | METAL | ONEAPI')
    p.add_argument('--shot', default='portrait', help='portrait | face | face34')
    p.add_argument('--stage', default='full', help='face | hair | full')
    p.add_argument('--hair', type=int, default=60000, help='number of rendered hair strands')
    p.add_argument('--save-blend', default='')
    return p.parse_args(argv)


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


BUNDLE_URL = 'https://download.blender.org/demo/asset-bundles/human-base-meshes/human-base-meshes-bundle-v1.4.1.zip'


def ensure_bundle(path):
    if path and path != 'auto':
        return path
    import urllib.request
    import zipfile
    cache = os.path.join(os.path.expanduser('~'), '.cache', 'yunyun_real')
    blend = os.path.join(cache, 'human-base-meshes-bundle-v1.4.1', 'human_base_meshes_bundle.blend')
    if not os.path.exists(blend):
        os.makedirs(cache, exist_ok=True)
        zpath = os.path.join(cache, 'hbm.zip')
        log('downloading', BUNDLE_URL)
        urllib.request.urlretrieve(BUNDLE_URL, zpath)
        with zipfile.ZipFile(zpath) as z:
            z.extractall(cache)
    return blend


# ------------------------------------------------------------------------------------------------ scene / device
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    return sc


def setup_render(sc, args):
    sc.render.engine = 'CYCLES'
    w, h = (int(v) for v in args.res.lower().split('x'))
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
    cy = sc.cycles
    cy.samples = args.samples
    cy.use_adaptive_sampling = True
    cy.adaptive_threshold = 0.02
    cy.use_denoising = True
    cy.max_bounces = 10
    cy.diffuse_bounces = 4
    cy.glossy_bounces = 4
    cy.transmission_bounces = 8
    cy.transparent_max_bounces = 16
    cy.caustics_reflective = False
    cy.caustics_refractive = False
    cy.blur_glossy = 0.5
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    for look in ('AgX - Medium High Contrast', 'Medium High Contrast'):
        try:
            sc.view_settings.look = look
            break
        except TypeError:
            pass
    sc.cycles.device = 'CPU'
    if args.device.upper() != 'CPU':
        prefs = bpy.context.preferences.addons['cycles'].preferences
        kinds = ['OPTIX', 'CUDA', 'HIP', 'METAL', 'ONEAPI'] if args.device.upper() == 'AUTO' else [args.device.upper()]
        for k in kinds:
            try:
                prefs.compute_device_type = k
                prefs.get_devices()
                devs = [d for d in prefs.devices if d.type == k]
                if devs:
                    for d in prefs.devices:
                        d.use = d.type == k
                    sc.cycles.device = 'GPU'
                    log('render device', k, [d.name for d in devs])
                    break
            except Exception:
                continue
    if sc.cycles.device == 'CPU':
        log('render device CPU')


# ------------------------------------------------------------------------------------------------ base body
EYE_C = {'L': Vector((0.0329, -0.122, 1.5344)), 'R': Vector((-0.0329, -0.1218, 1.5344))}
EYE_R0 = 0.0124
EYE_K = 1.05
IRIS = 0.56


def load_body(sc, bundle):
    with bpy.data.libraries.load(bundle, link=False) as (df, dt):
        dt.objects = [n for n in df.objects if n.startswith('GEO-body_female_realistic')]
    for o in dt.objects:
        sc.collection.objects.link(o)
    body = bpy.data.objects['GEO-body_female_realistic']
    body.location = (0, 0, 0)
    eyes = {s: bpy.data.objects['GEO-body_female_realistic.eye.' + s] for s in 'LR'}
    for m in body.modifiers:
        if m.type == 'MULTIRES':
            m.levels = 1
            m.render_levels = m.total_levels
    bpy.context.view_layer.update()
    return body, eyes


def stylize_face(body, eyes):
    """Gentle donghua-style idealisation of the neutral base face: slightly larger, lifted eyes, finer nose, V jaw,
    fuller lips, softer pointed chin. Works on the multires base level, so the sculpted detail follows."""
    me = body.data
    V = np.empty(len(me.vertices) * 3)
    me.vertices.foreach_get('co', V)
    V = V.reshape(-1, 3)
    x, y, z = V[:, 0], V[:, 1], V[:, 2]
    head = (z > 1.38)
    front = sstep(0.0, -0.06, y)
    D = np.zeros_like(V)
    for s, E in EYE_C.items():
        e = np.array(E)
        d = np.linalg.norm(V - e, axis=1)
        w = (1 - sstep(0.012, 0.036, d)) * sstep(e[1] + 0.02, e[1] - 0.004, y) * head
        D += (V - e) * 0.045 * w[:, None]
        outer = sstep(0.004, 0.016, np.sign(e[0]) * (x - e[0]))
        D[:, 2] += 0.0011 * w * outer
        lid = (1 - sstep(0.006, 0.019, d)) * sstep(e[2] + 0.002, e[2] + 0.007, z) * sstep(e[1] + 0.01, e[1] - 0.006, y) * head
        D[:, 2] -= 0.0014 * lid
        low = (1 - sstep(0.006, 0.017, d)) * sstep(e[2] - 0.003, e[2] - 0.008, z) * sstep(e[1] + 0.01, e[1] - 0.006, y) * head
        D[:, 2] += 0.0006 * low
    wn = np.exp(-((x / 0.017) ** 2 + ((z - 1.505) / 0.022) ** 2)) * sstep(-0.13, -0.15, y) * head
    D[:, 0] -= x * 0.13 * wn
    D[:, 1] += 0.0035 * wn * sstep(-0.145, -0.167, y)
    wj = sstep(1.49, 1.43, z) * sstep(0.014, 0.06, np.abs(x)) * front * (z > 1.385)
    D[:, 0] -= x * 0.075 * wj
    wc = np.exp(-((x / 0.02) ** 2 + ((z - 1.428) / 0.016) ** 2)) * front * head
    D[:, 1] -= 0.0025 * wc
    D[:, 2] -= 0.002 * wc
    wl = np.exp(-((x / 0.022) ** 2 + ((z - 1.468) / 0.009) ** 2)) * sstep(-0.14, -0.15, y) * head
    D[:, 1] -= 0.0016 * wl
    V += D
    me.vertices.foreach_set('co', V.ravel())
    me.update()
    for e in eyes.values():
        e.scale = e.scale * EYE_K
    # skin masks (blush, lips, eye shadow) as a point colour attribute
    blush = np.zeros(len(V))
    for sx in (1, -1):
        c = np.array((0.046 * sx, -0.126, 1.503))
        blush = np.maximum(blush, np.exp(-np.sum(((V - c) / (0.026, 0.03, 0.02)) ** 2, axis=1)))
    lips = np.exp(-((x / 0.021) ** 4 + ((z - 1.467) / 0.0115) ** 4)) * sstep(-0.138, -0.148, y)
    shadow = np.zeros(len(V))
    for s, E in EYE_C.items():
        c = np.array(E) + (0.002 * np.sign(E.x), -0.004, 0.009)
        shadow = np.maximum(shadow, np.exp(-np.sum(((V - c) / (0.02, 0.02, 0.009)) ** 2, axis=1)))
    scalp = np.array([scalp_weight(v) for v in V])
    attr = me.color_attributes.new('skinmask', 'FLOAT_COLOR', 'POINT')
    col = np.stack([blush, lips, shadow, scalp], 1).astype(np.float32)
    attr.data.foreach_set('color', col.ravel())
    bpy.context.view_layer.update()
    log('face styled')


# ------------------------------------------------------------------------------------------------ materials
def newmat(name):
    m = bpy.data.materials.new(name)
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        if hasattr(m, 'use_nodes') and not m.use_nodes:
            m.use_nodes = True
    return m


def node(nt, kind, loc=(0, 0), **inputs):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in inputs.items():
        n.inputs[k].default_value = v
    return n


def mat_skin():
    m = newmat('YY_skin')
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    attr = node(nt, 'ShaderNodeAttribute', (-900, 200)); attr.attribute_name = 'skinmask'
    sep = node(nt, 'ShaderNodeSeparateColor', (-700, 200)); nt.links.new(attr.outputs['Color'], sep.inputs[0])
    tex = node(nt, 'ShaderNodeTexCoord', (-1100, -200))
    noi = node(nt, 'ShaderNodeTexNoise', (-900, -100), Scale=90.0, Detail=4.0)
    nt.links.new(tex.outputs['Object'], noi.inputs['Vector'])
    base = node(nt, 'ShaderNodeMix', (-500, 300)); base.data_type = 'RGBA'
    base.inputs['A'].default_value = (0.6, 0.42, 0.35, 1); base.inputs['B'].default_value = (0.63, 0.45, 0.375, 1)
    nt.links.new(noi.outputs['Fac'], base.inputs['Factor'])
    def mix(prev, fac_out, color, k, loc):
        mm = node(nt, 'ShaderNodeMix', loc); mm.data_type = 'RGBA'; mm.inputs['B'].default_value = color
        mul = node(nt, 'ShaderNodeMath', (loc[0] - 160, loc[1] - 120)); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = k
        nt.links.new(fac_out, mul.inputs[0]); nt.links.new(mul.outputs[0], mm.inputs['Factor'])
        nt.links.new(prev, mm.inputs['A']); return mm.outputs['Result']
    c = mix(base.outputs['Result'], sep.outputs['Red'], (0.8, 0.46, 0.46, 1), 0.2, (-300, 300))
    c = mix(c, sep.outputs['Blue'], (0.70, 0.45, 0.45, 1), 0.3, (-100, 300))
    c = mix(c, sep.outputs['Green'], (0.72, 0.30, 0.31, 1), 0.85, (100, 300))
    c = mix(c, attr.outputs['Alpha'], (0.035, 0.03, 0.03, 1), 0.97, (300, 300))
    nt.links.new(c, bsdf.inputs['Base Color'])
    rough = node(nt, 'ShaderNodeMapRange', (100, 0)); rough.inputs['To Min'].default_value = 0.5; rough.inputs['To Max'].default_value = 0.3
    nt.links.new(sep.outputs['Green'], rough.inputs['Value'])
    rmax = node(nt, 'ShaderNodeMath', (300, 0)); rmax.operation = 'MAXIMUM'
    sc8 = node(nt, 'ShaderNodeMath', (200, -120)); sc8.operation = 'MULTIPLY'; sc8.inputs[1].default_value = 0.85
    nt.links.new(attr.outputs['Alpha'], sc8.inputs[0]); nt.links.new(rough.outputs['Result'], rmax.inputs[0]); nt.links.new(sc8.outputs[0], rmax.inputs[1])
    nt.links.new(rmax.outputs[0], bsdf.inputs['Roughness'])
    bsdf.inputs['Subsurface Weight'].default_value = 1.0
    bsdf.inputs['Subsurface Radius'].default_value = (0.9, 0.42, 0.25)
    bsdf.inputs['Subsurface Scale'].default_value = 0.003
    bsdf.inputs['Specular IOR Level'].default_value = 0.4
    pores = node(nt, 'ShaderNodeTexVoronoi', (-900, -400), Scale=2400.0)
    nt.links.new(tex.outputs['Object'], pores.inputs['Vector'])
    bump = node(nt, 'ShaderNodeBump', (100, -300), Strength=0.035, Distance=0.0002)
    nt.links.new(pores.outputs['Distance'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    return m


def mat_eye():
    m = newmat('YY_eye')
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    tc = node(nt, 'ShaderNodeTexCoord', (-1200, 0))
    nrm = node(nt, 'ShaderNodeVectorMath', (-1000, 0)); nrm.operation = 'NORMALIZE'; nt.links.new(tc.outputs['Object'], nrm.inputs[0])
    dot = node(nt, 'ShaderNodeVectorMath', (-800, 0)); dot.operation = 'DOT_PRODUCT'; dot.inputs[1].default_value = (0, -1, 0)
    nt.links.new(nrm.outputs[0], dot.inputs[0])
    ang = node(nt, 'ShaderNodeMath', (-600, 0)); ang.operation = 'ARCCOSINE'; nt.links.new(dot.outputs['Value'], ang.inputs[0])
    iris = node(nt, 'ShaderNodeMapRange', (-400, 150)); iris.inputs['From Min'].default_value = IRIS - 0.025; iris.inputs['From Max'].default_value = IRIS + 0.005
    iris.inputs['To Min'].default_value = 1; iris.inputs['To Max'].default_value = 0; nt.links.new(ang.outputs[0], iris.inputs['Value'])
    pupil = node(nt, 'ShaderNodeMapRange', (-400, -50)); pupil.inputs['From Min'].default_value = 0.175; pupil.inputs['From Max'].default_value = 0.195
    pupil.inputs['To Min'].default_value = 1; pupil.inputs['To Max'].default_value = 0; nt.links.new(ang.outputs[0], pupil.inputs['Value'])
    rad = node(nt, 'ShaderNodeMapRange', (-400, -250)); rad.inputs['From Min'].default_value = 0.18; rad.inputs['From Max'].default_value = IRIS
    nt.links.new(ang.outputs[0], rad.inputs['Value'])
    fib = node(nt, 'ShaderNodeTexNoise', (-600, -400), Scale=260.0, Detail=6.0, Roughness=0.7)
    nt.links.new(tc.outputs['Object'], fib.inputs['Vector'])
    ir = node(nt, 'ShaderNodeValToRGB', (-200, -300))
    ir.color_ramp.elements[0].position = 0.0; ir.color_ramp.elements[0].color = (0.36, 0.2, 0.08, 1)
    ir.color_ramp.elements[1].position = 1.0; ir.color_ramp.elements[1].color = (0.045, 0.022, 0.01, 1)
    e = ir.color_ramp.elements.new(0.5); e.color = (0.2, 0.105, 0.04, 1)
    e = ir.color_ramp.elements.new(0.86); e.color = (0.12, 0.06, 0.025, 1)
    fr = node(nt, 'ShaderNodeMath', (-300, -450)); fr.operation = 'MULTIPLY_ADD'; fr.inputs[1].default_value = 0.35
    nt.links.new(fib.outputs['Fac'], fr.inputs[0]); nt.links.new(rad.outputs['Result'], fr.inputs[2])
    nt.links.new(fr.outputs[0], ir.inputs['Fac'])
    sclera = node(nt, 'ShaderNodeMix', (0, 100)); sclera.data_type = 'RGBA'
    sclera.inputs['A'].default_value = (0.62, 0.575, 0.55, 1); nt.links.new(ir.outputs['Color'], sclera.inputs['B']); nt.links.new(iris.outputs['Result'], sclera.inputs['Factor'])
    pp = node(nt, 'ShaderNodeMix', (200, 100)); pp.data_type = 'RGBA'; pp.inputs['B'].default_value = (0.006, 0.004, 0.003, 1)
    nt.links.new(sclera.outputs['Result'], pp.inputs['A']); nt.links.new(pupil.outputs['Result'], pp.inputs['Factor'])
    ao = node(nt, 'ShaderNodeAmbientOcclusion', (300, -100)); ao.inputs['Distance'].default_value = 0.006; ao.only_local = True
    aom = node(nt, 'ShaderNodeMix', (420, 100)); aom.data_type = 'RGBA'; aom.blend_type = 'MULTIPLY'; aom.inputs['Factor'].default_value = 0.85
    nt.links.new(pp.outputs['Result'], aom.inputs['A']); nt.links.new(ao.outputs['AO'], aom.inputs['B'])
    nt.links.new(aom.outputs['Result'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.35
    bsdf.inputs['Subsurface Weight'].default_value = 0.25
    bsdf.inputs['Subsurface Radius'].default_value = (0.6, 0.3, 0.2)
    bsdf.inputs['Subsurface Scale'].default_value = 0.002
    return m


def mat_cornea():
    m = newmat('YY_cornea')
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (1, 1, 1, 1)
    b.inputs['Transmission Weight'].default_value = 1.0
    b.inputs['Roughness'].default_value = 0.0
    b.inputs['IOR'].default_value = 1.376
    return m


def mat_hair(name, melanin=0.93, rough=0.3, radial=0.32, tint=(0.92, 0.95, 1.0, 1)):
    m = newmat(name)
    nt = m.node_tree
    out = nt.nodes['Material Output']
    for n in list(nt.nodes):
        if n.type == 'BSDF_PRINCIPLED':
            nt.nodes.remove(n)
    h = node(nt, 'ShaderNodeBsdfHairPrincipled', (0, 0))
    try:
        h.model = 'CHIANG'
    except Exception:
        pass
    h.parametrization = 'MELANIN'
    h.inputs['Melanin'].default_value = melanin
    h.inputs['Melanin Redness'].default_value = 0.06
    h.inputs['Tint'].default_value = tint
    h.inputs['Roughness'].default_value = rough
    h.inputs['Radial Roughness'].default_value = radial
    h.inputs['Coat'].default_value = 0.0
    h.inputs['Random Roughness'].default_value = 0.32
    h.inputs['Random Color'].default_value = 0.08
    nt.links.new(h.outputs[0], out.inputs['Surface'])
    return m


# ------------------------------------------------------------------------------------------------ eyes, lashes, brows
def build_eyes(body, eyes):
    em, cm = mat_eye(), mat_cornea()
    for s, e in eyes.items():
        e.data.materials.clear(); e.data.materials.append(em)
        for p in e.data.polygons:
            p.use_smooth = True
        c = np.array(e.matrix_world.translation)
        R = EYE_R0 * EYE_K; rc = R * 0.66; bd = R * math.cos(IRIS); br = R * math.sin(IRIS)
        d = bd - math.sqrt(max(rc * rc - br * br, 1e-9)); cap = math.acos((bd - d) / rc) + 0.04
        import bmesh
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=64, v_segments=32, radius=rc)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.normalized().dot(Vector((0, -1, 0))) < math.cos(cap)], context='VERTS')
        me = bpy.data.meshes.new('YY_cornea_' + s); bm.to_mesh(me); bm.free()
        for p in me.polygons:
            p.use_smooth = True
        me.materials.append(cm)
        co = newobj('YY_cornea_' + s, me); co.location = Vector(c + np.array((0, -d, 0)))
        co.visible_shadow = False
    bpy.context.view_layer.update()
    log('eyes built')


def make_curves(name, strands, radius_root, radius_tip, material):
    """strands: list of (P_i x 3) numpy arrays."""
    cv = bpy.data.hair_curves.new(name)
    sizes = [len(s) for s in strands]
    cv.add_curves(sizes)
    pos = np.concatenate(strands).astype(np.float32)
    cv.position_data.foreach_set('vector', pos.ravel())
    rad = np.concatenate([np.linspace(radius_root, radius_tip, n) for n in sizes]).astype(np.float32)
    ra = cv.attributes.get('radius') or cv.attributes.new('radius', 'FLOAT', 'POINT')
    ra.data.foreach_set('value', rad)
    cv.materials.append(material)
    ob = bpy.data.objects.new(name, cv)
    bpy.context.scene.collection.objects.link(ob)
    return ob


class Surface:
    """Ray / nearest queries against the evaluated (multires) body."""
    def __init__(self, body):
        dg = bpy.context.evaluated_depsgraph_get()
        self.bvh = BVHTree.FromObject(body, dg)

    def ray(self, origin, direction, dist=1.0):
        loc, nrm, idx, d = self.bvh.ray_cast(Vector(origin), Vector(direction).normalized(), dist)
        return (np.array(loc), np.array(nrm)) if loc is not None else (None, None)

    def nearest(self, p):
        loc, nrm, idx, d = self.bvh.find_nearest(Vector(p))
        return np.array(loc), np.array(nrm), d


def lid_edges(surf, s):
    """Find the upper/lower eyelid rims by scanning down from the front: where the first hit stops being skin."""
    E = np.array(EYE_C[s]); r = EYE_R0 * EYE_K
    upper, lower = [], []
    for t in np.linspace(-0.92, 0.92, 26):
        xo = E[0] + t * r * 1.15
        prev = None
        col_hits = []
        for zz in np.linspace(E[2] + 0.012, E[2] - 0.012, 97):
            o = np.array((xo, E[1] - 0.05, zz))
            loc, n = surf.ray(o, (0, 1, 0), 0.08)
            # eyeball front surface y at this x,z
            q = (xo - E[0]) ** 2 + (zz - E[2]) ** 2
            ey = E[1] - math.sqrt(max(r * r - q, 0)) if q < r * r else None
            skin_in_front = loc is not None and (ey is None or loc[1] < ey - 0.0004)
            col_hits.append((zz, skin_in_front, loc))
        for i in range(1, len(col_hits)):
            if col_hits[i - 1][1] and not col_hits[i][1] and not upper_has(upper, xo):
                upper.append(col_hits[i - 1][2]); break
        for i in range(len(col_hits) - 1, 0, -1):
            if col_hits[i][1] and not col_hits[i - 1][1]:
                lower.append(col_hits[i][2]); break
    return np.array([u for u in upper if u is not None]), np.array([l for l in lower if l is not None])


def upper_has(lst, x):
    return False


def build_lashes_brows(body):
    surf = Surface(body)
    rng = np.random.default_rng(7)
    strands = []
    for s in 'LR':
        E = np.array(EYE_C[s]); side = np.sign(E[0])
        up, lo = lid_edges(surf, s)
        log('lid rim', s, len(up), len(lo))
        if len(up) < 4:
            continue
        # resample upper rim densely
        up = up[np.argsort(up[:, 0] * side)]
        seg = np.linalg.norm(np.diff(up, axis=0), axis=1); L = np.concatenate([[0], np.cumsum(seg)])
        for k in range(150):
            u = rng.uniform(0.08, 1.0)
            p = np.array([np.interp(u * L[-1], L, up[:, i]) for i in range(3)])
            outer = u
            length = 0.006 + 0.005 * outer + rng.normal(0, 0.0006)
            fwd = np.array((side * (0.15 + 0.35 * outer), -1.0, 0.25)); fwd /= np.linalg.norm(fwd)
            upv = np.array((0, 0, 1.0))
            pts = [p + np.array((0, -0.0003, 0.0002))]
            for j in range(1, 7):
                t = j / 6
                d = fwd * (1 - t) * 0.8 + upv * (0.35 + 0.9 * t)
                d /= np.linalg.norm(d)
                pts.append(pts[-1] + d * length / 6)
            strands.append(np.array(pts))
        lo = lo[np.argsort(lo[:, 0] * side)] if len(lo) > 3 else lo
        if len(lo) > 3:
            seg = np.linalg.norm(np.diff(lo, axis=0), axis=1); L = np.concatenate([[0], np.cumsum(seg)])
            for k in range(45):
                u = rng.uniform(0.2, 0.95)
                p = np.array([np.interp(u * L[-1], L, lo[:, i]) for i in range(3)])
                length = 0.0022 + 0.0012 * u
                d = np.array((side * 0.2, -0.8, -0.6)); d /= np.linalg.norm(d)
                strands.append(np.array([p + d * length * t for t in np.linspace(0, 1, 4)]))
    lash = make_curves('YY_lashes', strands, 0.000075, 0.000015, mat_hair('YY_lash_mat', melanin=1.0, rough=0.45))
    # brows: short hairs lying on the skin along an arc above each eye
    strands = []
    for s in 'LR':
        E = np.array(EYE_C[s]); side = np.sign(E[0])
        for k in range(400):
            u = rng.uniform(0, 1)                                   # 0 = inner end, 1 = tail
            bx = E[0] + side * (-0.013 + 0.039 * u)
            bz = E[2] + 0.0172 + 0.0038 * math.sin(math.pi * min(1, u * 1.2)) - 0.0035 * max(0, u - 0.8) * 5
            thick = 0.0026 * (1 - 0.7 * u)
            bz += rng.uniform(-thick / 2, thick / 2)
            loc, n = surf.ray((bx, E[1] - 0.06, bz), (0, 1, 0), 0.1)
            if loc is None:
                continue
            dirv = np.array((side * (0.25 + 0.75 * u), 0, 0.9 * (1 - u) + 0.15)); dirv -= n * np.dot(dirv, n); dirv /= np.linalg.norm(dirv)
            length = 0.006 + 0.002 * rng.random()
            pts = [loc + n * 0.0002]
            for j in range(1, 5):
                pts.append(pts[-1] + dirv * length / 4 + n * 0.00015)
            strands.append(np.array(pts))
    brow = make_curves('YY_brows', strands, 0.000028, 0.000008, mat_hair('YY_brow_mat', melanin=0.97, rough=0.4))
    log('lashes', len(lash.data.curves), 'brows', len(brow.data.curves))


# ------------------------------------------------------------------------------------------------ pose + clothing
def body_arrays(me):
    V = np.empty(len(me.vertices) * 3); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
    E = np.empty(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
    return V, E


def pose_elbows(body):
    """Bring the forearms in a little (the base pose has them splayed ~25 deg)."""
    me = body.data
    V, _ = body_arrays(me)
    for side in (1, -1):
        J = np.array((0.165 * side, 0.0, 1.30)); W = np.array((0.36 * side, -0.035, 0.83))
        a = (W - J) / np.linalg.norm(W - J)
        rel = V - J; s = rel @ a; perp = np.linalg.norm(rel - np.outer(s, a), axis=1)
        arm = (V[:, 0] * side > 0.17) & (perp < 0.085)
        elbow = J + a * 0.27
        w = sstep(0.24, 0.31, s) * arm
        beta = 0.17 * side
        cb, sb = math.cos(beta), math.sin(beta)
        r = V - elbow
        rot = np.stack([r[:, 0] * cb + r[:, 2] * sb, r[:, 1], -r[:, 0] * sb + r[:, 2] * cb], 1) + elbow
        V = V * (1 - w[:, None]) + rot * w[:, None]
    me.vertices.foreach_set('co', V.ravel()); me.update()


def newobj(name, me):
    ob = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(ob); return ob


def shell_from_body(body, name, face_pred, offset, smooth_iter, keep_out, cut_pred=None, drape=False, bisect=None):
    """Copy body faces selected by face_pred(centroid), push out along normals, relax (fabric bridges concavities)
    while staying outside the body, then delete faces with cut_pred(centroid)."""
    import bmesh
    surf = Surface(body)
    bm = bmesh.new(); bm.from_mesh(body.data)
    bm.faces.ensure_lookup_table()
    drop = [f for f in bm.faces if not face_pred(np.array(f.calc_center_median()))]
    bmesh.ops.delete(bm, geom=drop, context='FACES')
    loose = [v for v in bm.verts if not v.link_faces]
    bmesh.ops.delete(bm, geom=loose, context='VERTS')
    bm.verts.ensure_lookup_table(); bm.normal_update()
    V = np.array([tuple(v.co) for v in bm.verts]); N = np.array([tuple(v.normal) for v in bm.verts])
    E = np.array([(e.verts[0].index, e.verts[1].index) for e in bm.edges])
    boundary = np.array([v.is_boundary for v in bm.verts])
    V = V + N * offset(V)[:, None]
    deg = np.bincount(E.ravel(), minlength=len(V)).astype(float)
    for it in range(smooth_iter):
        acc = np.zeros_like(V); np.add.at(acc, E[:, 0], V[E[:, 1]]); np.add.at(acc, E[:, 1], V[E[:, 0]])
        avg = acc / np.maximum(deg, 1)[:, None]
        V = np.where(boundary[:, None], V * 0.7 + avg * 0.3, V * 0.4 + avg * 0.6)
        if it % 3 == 2 or it == smooth_iter - 1:
            for i in range(len(V)):
                loc, n, d = surf.nearest(V[i])
                if loc is not None:
                    k = keep_out(V[i])
                    if np.dot(V[i] - loc, n) < k:
                        V[i] = loc + n * k
    if drape:
        V = drape_envelope(V, N)
    for i, v in enumerate(bm.verts):
        v.co = V[i]
    if drape:
        bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=1, use_grid_fill=True, smooth=0.5)
        bm.verts.ensure_lookup_table(); bm.normal_update()
        for v in bm.verts:
            c = np.array(v.co)
            g = float(sstep(1.2, 1.09, c[2]) * sstep(1.0, 1.07, c[2]))           # gathers just above the sash
            a = math.atan2(c[0], -(c[1] + 0.02))
            v.co += v.normal * (0.0035 * g * math.sin(a * 22.0) + 0.0015 * math.sin(c[2] * 90 + a * 7) * (1 - g) * float(c[2] < 1.3))
    if bisect is not None:
        co, no = bisect
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=co, plane_no=no, clear_outer=True)
    if cut_pred is not None:
        bm.faces.ensure_lookup_table()
        cut = [f for f in bm.faces if cut_pred(np.array(f.calc_center_median()))]
        bmesh.ops.delete(bm, geom=cut, context='FACES')
        loose = [v for v in bm.verts if not v.link_faces]
        bmesh.ops.delete(bm, geom=loose, context='VERTS')
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return newobj(name, me)


def drape_envelope(V, N):
    """Front fabric falls straight from the bust and is only drawn back in toward the sash (no hugging under the bust)."""
    out = V.copy()
    front = (N[:, 1] < -0.25) & (V[:, 2] > 1.0) & (V[:, 2] < 1.32)
    xb = np.round(V[:, 0] / 0.012).astype(int)
    for b in np.unique(xb[front]):
        idx = np.where(front & (xb == b))[0]
        idx = idx[np.argsort(-V[idx, 2])]
        env, zprev = None, None
        for i in idx:
            y, z = V[i, 1], V[i, 2]
            cinch = float(sstep(1.12, 1.06, z))
            if env is None:
                env = y
            else:
                env = min(y, env + 0.32 * (zprev - z) * (0.4 + 1.6 * cinch))
            out[i, 1] = min(y, env * (1 - cinch) + y * cinch)
            zprev = z
    return out


def in_tri(p, a, b, c):
    def sgn(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1, d2, d3 = sgn(p, a, b), sgn(p, b, c), sgn(p, c, a)
    return not ((d1 < 0 or d2 < 0 or d3 < 0) and (d1 > 0 or d2 > 0 or d3 > 0))


NL, NR, VX = (0.07, 1.397), (-0.07, 1.397), (0.0, 1.272)     # neck corners and the crossing point of the collar (x, z)


_FOLD = None
def fold_space():
    global _FOLD
    if _FOLD is None:   # empty that stretches the wrinkle noise vertically -> long hanging folds
        _FOLD = bpy.data.objects.new('YY_fold_space', None); bpy.context.scene.collection.objects.link(_FOLD)
        _FOLD.scale = (0.035, 0.035, 0.22)
    return _FOLD


def add_mods(ob, thick, subd=2, displace=0.0):
    if displace:
        tx = bpy.data.textures.new(ob.name + '_wr', 'CLOUDS'); tx.noise_scale = 1.0; tx.noise_depth = 2; tx.noise_basis = 'ORIGINAL_PERLIN'
        d = ob.modifiers.new('wrinkle', 'DISPLACE'); d.texture = tx; d.strength = displace; d.mid_level = 0.5
        d.texture_coords = 'OBJECT'; d.texture_coords_object = fold_space()
        s0 = ob.modifiers.new('presub', 'SUBSURF'); s0.levels = 1; s0.render_levels = 1
        ob.modifiers.move(len(ob.modifiers) - 1, 0)
    s = ob.modifiers.new('subd', 'SUBSURF'); s.levels = 1; s.render_levels = subd
    so = ob.modifiers.new('thick', 'SOLIDIFY'); so.thickness = thick; so.offset = 1.0
    return ob


def mat_silk(name, c_top, c_bot, pattern=True, sheen=0.55, rough=0.36):
    m = newmat(name); nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tc = node(nt, 'ShaderNodeTexCoord', (-1200, 0))
    sep = node(nt, 'ShaderNodeSeparateXYZ', (-1000, 200)); nt.links.new(tc.outputs['Object'], sep.inputs[0])
    grad = node(nt, 'ShaderNodeMapRange', (-800, 200)); grad.inputs['From Min'].default_value = 1.45; grad.inputs['From Max'].default_value = 0.4
    nt.links.new(sep.outputs['Z'], grad.inputs['Value'])
    cm = node(nt, 'ShaderNodeMix', (-600, 250)); cm.data_type = 'RGBA'; cm.inputs['A'].default_value = c_top; cm.inputs['B'].default_value = c_bot
    nt.links.new(grad.outputs['Result'], cm.inputs['Factor'])
    col_out = cm.outputs['Result']; rough_in = None
    if pattern:   # 团花 / cloud-roundel jacquard: wave rings inside voronoi cells, slightly lighter and glossier
        vor = node(nt, 'ShaderNodeTexVoronoi', (-1000, -150), Scale=48.0); vor.feature = 'F1'
        nt.links.new(tc.outputs['Object'], vor.inputs['Vector'])
        ring = node(nt, 'ShaderNodeMath', (-800, -150)); ring.operation = 'SINE'
        mul = node(nt, 'ShaderNodeMath', (-900, -300)); mul.operation = 'MULTIPLY'; mul.inputs[1].default_value = 60.0
        nt.links.new(vor.outputs['Distance'], mul.inputs[0]); nt.links.new(mul.outputs[0], ring.inputs[0])
        cell = node(nt, 'ShaderNodeMath', (-800, -300)); cell.operation = 'LESS_THAN'; cell.inputs[1].default_value = 0.32
        nt.links.new(vor.outputs['Distance'], cell.inputs[0])
        pat = node(nt, 'ShaderNodeMath', (-600, -200)); pat.operation = 'MULTIPLY'
        rr = node(nt, 'ShaderNodeMath', (-700, -100)); rr.operation = 'GREATER_THAN'; rr.inputs[1].default_value = 0.55
        nt.links.new(ring.outputs[0], rr.inputs[0]); nt.links.new(rr.outputs[0], pat.inputs[0]); nt.links.new(cell.outputs[0], pat.inputs[1])
        pm = node(nt, 'ShaderNodeMix', (-400, 200)); pm.data_type = 'RGBA'; pm.inputs['B'].default_value = (1, 1, 1, 1)
        fac = node(nt, 'ShaderNodeMath', (-500, -50)); fac.operation = 'MULTIPLY'; fac.inputs[1].default_value = 0.025
        nt.links.new(pat.outputs[0], fac.inputs[0]); nt.links.new(fac.outputs[0], pm.inputs['Factor'])
        nt.links.new(col_out, pm.inputs['A']); col_out = pm.outputs['Result']
        rmap = node(nt, 'ShaderNodeMapRange', (-300, -150)); rmap.inputs['To Min'].default_value = rough; rmap.inputs['To Max'].default_value = rough - 0.08
        nt.links.new(pat.outputs[0], rmap.inputs['Value']); rough_in = rmap.outputs['Result']
    nt.links.new(col_out, b.inputs['Base Color'])
    if rough_in is not None:
        nt.links.new(rough_in, b.inputs['Roughness'])
    else:
        b.inputs['Roughness'].default_value = rough
    b.inputs['Sheen Weight'].default_value = sheen; b.inputs['Sheen Roughness'].default_value = 0.32
    b.inputs['Specular IOR Level'].default_value = 0.16
    b.inputs['Sheen Tint'].default_value = (0.9, 1.0, 0.97, 1)
    weave = node(nt, 'ShaderNodeTexNoise', (-500, -450), Scale=3000.0, Detail=1.0)
    nt.links.new(tc.outputs['Object'], weave.inputs['Vector'])
    bump = node(nt, 'ShaderNodeBump', (-200, -400), Strength=0.08, Distance=0.0003)
    nt.links.new(weave.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def mat_trim(name, base=(0.93, 0.94, 0.91, 1), edge=(0.78, 0.6, 0.3, 1)):
    """White collar silk with gold thread edges (by UV across the band width)."""
    m = newmat(name); nt = m.node_tree; b = nt.nodes['Principled BSDF']
    uv = node(nt, 'ShaderNodeUVMap', (-1000, 0))
    sep = node(nt, 'ShaderNodeSeparateXYZ', (-800, 0)); nt.links.new(uv.outputs['UV'], sep.inputs[0])
    d = node(nt, 'ShaderNodeMath', (-600, 0)); d.operation = 'SUBTRACT'; d.inputs[1].default_value = 0.5; nt.links.new(sep.outputs['X'], d.inputs[0])
    a = node(nt, 'ShaderNodeMath', (-450, 0)); a.operation = 'ABSOLUTE'; nt.links.new(d.outputs[0], a.inputs[0])
    g = node(nt, 'ShaderNodeMapRange', (-300, 0)); g.inputs['From Min'].default_value = 0.36; g.inputs['From Max'].default_value = 0.38
    nt.links.new(a.outputs[0], g.inputs['Value'])
    g2 = node(nt, 'ShaderNodeMapRange', (-300, -200)); g2.inputs['From Min'].default_value = 0.46; g2.inputs['From Max'].default_value = 0.44
    nt.links.new(a.outputs[0], g2.inputs['Value'])
    gm = node(nt, 'ShaderNodeMath', (-150, -100)); gm.operation = 'MULTIPLY'; nt.links.new(g.outputs['Result'], gm.inputs[0]); nt.links.new(g2.outputs['Result'], gm.inputs[1])
    cm = node(nt, 'ShaderNodeMix', (0, 100)); cm.data_type = 'RGBA'; cm.inputs['A'].default_value = base; cm.inputs['B'].default_value = edge
    nt.links.new(gm.outputs[0], cm.inputs['Factor']); nt.links.new(cm.outputs['Result'], b.inputs['Base Color'])
    nt.links.new(gm.outputs[0], b.inputs['Metallic'])
    rm = node(nt, 'ShaderNodeMapRange', (0, -200)); rm.inputs['To Min'].default_value = 0.42; rm.inputs['To Max'].default_value = 0.3
    nt.links.new(gm.outputs[0], rm.inputs['Value']); nt.links.new(rm.outputs['Result'], b.inputs['Roughness'])
    b.inputs['Sheen Weight'].default_value = 0.4
    return m


def ribbon_mesh(name, P, Nn, width, mat, thick=0.0025, lift=0.0015):
    P = np.array(P); Nn = np.array(Nn)
    verts, faces, uvs = [], [], []
    T = np.gradient(P, axis=0); T /= np.linalg.norm(T, axis=1)[:, None]
    for i in range(len(P)):
        B = np.cross(T[i], Nn[i]); B /= np.linalg.norm(B)
        c = P[i] + Nn[i] * lift
        verts += [tuple(c - B * width / 2), tuple(c + B * width / 2)]
        if i:
            k = 2 * i; faces.append((k - 2, k - 1, k + 1, k))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            uvl.data[li].uv = ((vi % 2), (vi // 2) / max(1, len(P) - 1))
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    ob = newobj(name, me)
    add_mods(ob, thick, subd=2)
    return ob


def path_on(surf_bvh, pts_xz, y_from=-0.6, n=40):
    """Project a front-view (x, z) polyline onto a surface by rays along +y."""
    C = catmull([(x, 0.0, z) for x, z in pts_xz], n)
    P, Nn = [], []
    for c in C:
        loc, nrm, idx, d = surf_bvh.ray_cast(Vector((c[0], y_from, c[2])), Vector((0, 1, 0)), 2.0)
        if loc is not None:
            P.append(np.array(loc)); Nn.append(np.array(nrm))
    return P, Nn


def ring_on(surf_bvh, z_of_angle, axis_xy, angles, r0=0.3):
    P, Nn = [], []
    for a in angles:
        d = np.array((math.sin(a), -math.cos(a), 0.0))
        z = z_of_angle(a)
        o = np.array((axis_xy[0], axis_xy[1], z)) + d * r0
        loc, nrm, idx, dd = surf_bvh.ray_cast(Vector(o), Vector(-d), r0 * 1.5)
        if loc is not None:
            P.append(np.array(loc)); Nn.append(np.array(nrm))
    return P, Nn


def sleeve_mesh(name, side, mat):
    """Wide hanging sleeve: fitted round the upper arm, flaring and falling straight down, longer at the back."""
    J = np.array((0.176 * side, 0.002, 1.315)); A = np.array((0.29 * side, -0.02, 1.0))
    rings, segs = 40, 64
    verts, faces = [], []
    rng = np.random.default_rng(11 if side > 0 else 12)
    folds = rng.uniform(0, 6.28, 3)
    for i in range(rings + 1):
        t = i / rings
        if t < 0.35:
            c = J + (A - J) * (t / 0.35)
        else:
            c = A + np.array((0.03 * side * (t - 0.35), -0.01, -0.45 * (t - 0.35) / 0.65))
        r = 0.074 + 0.004 * t + 0.165 * sstep(0.3, 1.0, t) ** 1.2
        for j in range(segs):
            a = 2 * math.pi * j / segs
            fold = 1 + (0.06 * math.sin(7 * a + folds[0]) + 0.035 * math.sin(11 * a + folds[1])) * sstep(0.3, 1.0, t)
            dx, dy = math.cos(a) * r * 0.55 * fold, math.sin(a) * r * fold
            back = 0.5 + 0.5 * math.sin(a)          # +y is the back of the arm
            dz = -0.11 * back * sstep(0.45, 1.0, t)
            verts.append((c[0] + dx, c[1] + dy, c[2] + dz))
    for i in range(rings):
        for j in range(segs):
            a, b = i * segs + j, i * segs + (j + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name='UVMap')
    for poly in me.polygons:
        for li, vi in zip(poly.loop_indices, poly.vertices):
            uvl.data[li].uv = ((vi % segs) / segs, (vi // segs) / rings)
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    ob = newobj(name, me)
    add_mods(ob, 0.0015, subd=2, displace=0.004)
    return ob


def build_clothes(body):
    qing = mat_silk('YY_qing', (0.016, 0.15, 0.15, 1), (0.05, 0.31, 0.29, 1), sheen=0.85, rough=0.6)
    inner = mat_silk('YY_inner', (0.82, 0.84, 0.81, 1), (0.82, 0.84, 0.81, 1), pattern=False, sheen=0.4, rough=0.45)
    trim = mat_trim('YY_trim')
    sash = mat_silk('YY_sash', (0.008, 0.07, 0.075, 1), (0.008, 0.07, 0.075, 1), pattern=False, sheen=0.5, rough=0.4)

    def torso_pred(c):
        return 0.66 < c[2] < 1.432 and (abs(c[0]) < 0.205 or c[2] > 1.06)

    def cut_outer(c):
        return c[1] < -0.02 and in_tri((c[0], c[2]), NL, NR, VX)

    outer = shell_from_body(body, 'YY_robe', torso_pred,
                            offset=lambda V: 0.012 + 0.012 * sstep(1.3, 1.1, V[:, 2]),
                            smooth_iter=40, keep_out=lambda p: 0.008 if p[2] > 1.3 else 0.012, cut_pred=cut_outer, drape=True,
                            bisect=((0, 0, 1.401), (0, -0.25, 1)))
    outer.data.materials.append(qing); add_mods(outer, 0.0018, subd=2, displace=0.006)
    def inner_pred(c):
        return 1.22 < c[2] < 1.425 and abs(c[0]) < 0.11 and c[1] < 0.02
    inn = shell_from_body(body, 'YY_inner', inner_pred, offset=lambda V: np.full(len(V), 0.006), smooth_iter=16,
                          keep_out=lambda p: 0.005, bisect=((0, 0, 1.396), (0, -0.2, 1)), cut_pred=lambda c: not (c[1] < -0.01 and in_tri((c[0], c[2]), (NL[0] + 0.02, NL[1] + 0.02), (NR[0] - 0.02, NR[1] + 0.02), (VX[0], VX[1] - 0.03))))
    inn.data.materials.append(inner); add_mods(inn, 0.0012, subd=2)
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    bb = BVHTree.FromObject(body, dg)
    def on_body(x, z, lift):
        loc, nrm, i, d = bb.ray_cast(Vector((x, -0.6, z)), Vector((0, 1, 0)), 2.0)
        return (np.array(loc) + np.array(nrm) * lift, np.array(nrm)) if loc is not None else (None, None)
    # one continuous 交领 band: under-panel edge up the right side, round the back of the neck, down the left, across to the right waist
    front_r = catmull([(-0.004, 0, 1.279), (-0.036, 0, 1.34), (NR[0], 0, NR[1])], 14)
    front_l = catmull([(NL[0], 0, NL[1]), (0.036, 0, 1.34), (VX[0], 0, VX[1]), (-0.05, 0, 1.18), (-0.106, 0, 1.072)], 40)
    P, Nn = [], []
    for c in front_r:
        q, n = on_body(c[0], c[2], 0.014)
        if q is not None: P.append(q); Nn.append(n)
    for a in np.linspace(math.radians(-62), math.radians(-298), 34):
        d = np.array((math.sin(a), -math.cos(a), 0.0)); z = 1.394 + 0.013 * (0.5 - 0.5 * math.cos(a))
        o = np.array((0.0, -0.012, z)) + d * 0.3
        loc, nrm, i, dd = bb.ray_cast(Vector(o), Vector(-d), 0.45)
        if loc is not None: P.append(np.array(loc) + np.array(nrm) * 0.013); Nn.append(np.array(nrm))
    for c in front_l:
        q, n = on_body(c[0], c[2], 0.017)
        if q is not None: P.append(q); Nn.append(n)
    ribbon_mesh('YY_collar', resample(np.array(P), 110), [Nn[min(len(Nn) - 1, int(i * len(Nn) / 110))] for i in range(110)], 0.04, trim, lift=0.0)
    rb = BVHTree.FromObject(outer, dg)
    P, Nn = ring_on(rb, lambda a: 1.05, (0.0, -0.03), np.linspace(0, 2 * math.pi, 73), 0.4)
    if len(P) > 10:
        ribbon_mesh('YY_sash', P + P[:1], Nn + Nn[:1], 0.058, sash, thick=0.003, lift=0.004)
    for sd in (1, -1):
        sleeve_mesh('YY_sleeve_' + ('L' if sd > 0 else 'R'), sd, qing)
    log('clothes built')


# ------------------------------------------------------------------------------------------------ hair
HC = np.array((0.0, -0.048, 1.538))          # head centre (body local == world)
BUN = np.array((0.0, 0.066, 1.572))          # bun centre, back of the head (hides the half-up parting line)
BUN_R = 0.028


def sph(p):
    d = p - HC
    r = np.linalg.norm(d)
    d = d / r
    theta = math.degrees(math.acos(np.clip(d[2], -1, 1)))
    phi = math.degrees(math.atan2(d[0], -d[1]))       # 0 = front, +90 = her left (+x), 180 = back
    return theta, phi


def hairline(phi):
    a = abs(phi)
    return float(np.interp(a, [0, 25, 45, 62, 80, 100, 125, 150, 180], [49, 51, 58, 68, 74, 92, 112, 120, 124]))


def scalp_weight(v):
    d = v - HC
    if np.linalg.norm(d) > 0.14 or v[2] < 1.40:
        return 0.0
    th, ph = sph(v)
    return float(sstep(hairline(ph) + 1.0, hairline(ph) - 5.0, th))


def sdir(theta, phi):
    t, p = math.radians(theta), math.radians(phi)
    return np.array((math.sin(t) * math.sin(p), -math.sin(t) * math.cos(p), math.cos(t)))


def group_of(theta, phi):
    a = abs(phi)
    if a < 36 and 18 <= theta < 80:
        return 'bang'
    if 36 <= a < 100 and theta >= 60:
        return 'side'
    if theta < (66 if a < 120 else 75) and (a >= 36 or theta < 18):
        return 'upper'
    return 'lower'


def catmull(points, n):
    P = np.array(points, float)
    P = np.vstack([P[0] * 2 - P[1], P, P[-1] * 2 - P[-2]])
    seg = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for t in np.linspace(0, 1, 24, endpoint=False):
            t2, t3 = t * t, t * t * t
            seg.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    seg.append(P[-2])
    return resample(np.array(seg), n)


def resample(C, n):
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))])
    u = np.linspace(0, L[-1], n)
    return np.stack([np.interp(u, L, C[:, i]) for i in range(3)], 1)


class HairBuilder:
    def __init__(self, body, seed=3):
        self.surf = Surface(body)
        self.rng = np.random.default_rng(seed)

    def scalp(self, theta, phi, lift=0.0):
        d = sdir(theta, phi)
        loc, n = self.surf.ray(HC + d * 0.3, -d, 0.35)
        if loc is None:
            return None, None
        return loc + n * lift, n

    def waypoints(self, g, root, theta, phi):
        rng = self.rng
        s = 1.0 if phi > 0 else -1.0
        if abs(phi) < 0.5:
            s = rng.choice((-1.0, 1.0))
        if g == 'bang':
            near = 1 - abs(phi) / 36
            p1, _ = self.scalp(min(theta + 12, 72), phi + s * 18, 0.008 + 0.004 * rng.random())
            p2, _ = self.scalp(84, s * (52 + 8 * near), 0.012 + 0.004 * rng.random())
            tipz = 1.42 - 0.025 * rng.random() if near > 0.3 else 1.46 + 0.03 * rng.random()
            u = abs(phi) / 36; v = (theta - 18) / 62
            spread = np.array((s * (0.004 + 0.016 * u), -0.012 + 0.024 * v, 0.0))
            pts = [root, p1, p2, np.array((s * 0.072, -0.104, 1.49)) + spread * 0.6, np.array((s * 0.07, -0.094, tipz)) + spread]
        elif g == 'side':
            p1, _ = self.scalp(min(theta + 12, 104), phi + s * 4, 0.007)
            tipz = 1.06 + 0.1 * rng.random()
            u = (abs(phi) - 36) / 64; v = (theta - 60) / 40
            sp = np.array((s * (-0.02 + 0.045 * u), -0.025 + 0.05 * v, 0.0))
            pts = [root, p1, np.array((s * 0.104, -0.044, 1.43)) + sp * 0.5, np.array((s * 0.124, -0.078, 1.30)) + sp, np.array((s * 0.128, -0.108, 1.18)) + sp * 1.2, np.array((s * 0.13, -0.11, tipz)) + sp * 1.3]
        elif g == 'upper':
            db = (BUN - HC) / np.linalg.norm(BUN - HC)
            dr = (root - HC) / np.linalg.norm(root - HC)
            mids = []
            for k in (0.4, 0.75):
                dd = dr * (1 - k) + db * k; dd /= np.linalg.norm(dd)
                th = math.degrees(math.acos(dd[2])); ph = math.degrees(math.atan2(dd[0], -dd[1]))
                q, _ = self.scalp(th, ph, 0.006 + 0.006 * k + 0.004 * rng.random())
                if q is not None:
                    mids.append(q)
            # coil around the bun axis
            # wind round a ball: random great circle through the entry point, slowly tilting
            entry = mids[-1] if mids else root
            e0 = entry - BUN; e0 /= np.linalg.norm(e0)
            axis = np.cross(e0, rng.normal(size=3)); axis /= np.linalg.norm(axis)
            coil = []
            vcur = e0.copy()
            for k in range(1, 10):
                ang = 0.8
                vcur = vcur * math.cos(ang) + np.cross(axis, vcur) * math.sin(ang) + axis * np.dot(axis, vcur) * (1 - math.cos(ang))
                axis = axis + rng.normal(0, 0.18, 3); axis -= vcur * np.dot(axis, vcur); axis /= np.linalg.norm(axis)
                r = BUN_R * (0.95 - 0.035 * k) * (0.9 + 0.2 * rng.random())
                coil.append(BUN + vcur * r)
            pts = [root] + mids + coil
        else:
            lat = abs(math.sin(math.radians(phi)))
            sx = math.sin(math.radians(phi))
            p1, _ = self.scalp(min(theta + 14, 128), phi, 0.005)
            j = rng.normal(0, 0.006, 3)
            tipz = 0.94 + 0.07 * rng.random() - 0.03 * (1 - lat)
            pts = [root, p1, np.array((sx * 0.072, HC[1] + 0.078 + 0.026 * (1 - lat), 1.40)) + j * 0.5,
                   np.array((sx * 0.15, 0.098 - 0.03 * lat, 1.27)) + j, np.array((sx * 0.17, 0.102, 1.12)) + j * 1.4, np.array((sx * 0.19, 0.096, tipz)) + j * 1.8]
        return [np.array(p, float) for p in pts if p is not None]

    def collide(self, C, scalp_lift, body_lift):
        for _ in range(3):
            for i in range(1, len(C)):
                loc, n, d = self.surf.nearest(C[i])
                if loc is None:
                    continue
                off = scalp_lift if C[i][2] > 1.41 and np.linalg.norm(C[i] - HC) < 0.13 else body_lift
                dvec = C[i] - loc
                if np.dot(dvec, n) < off:
                    C[i] = loc + n * off
            C[1:-1] = C[1:-1] * 0.5 + (C[:-2] + C[2:]) * 0.25
        return C

    def roots(self, n, seed):
        """Fibonacci directions over the scalp mask -> (pos, theta, phi)."""
        out = []
        i = np.arange(n * 4) + 0.5
        z = 1 - 2 * i / (n * 4)
        a = math.pi * (1 + 5 ** 0.5) * i
        rr = np.sqrt(1 - z * z)
        dirs = np.stack([rr * np.cos(a), rr * np.sin(a), z], 1)
        jit = np.random.default_rng(seed).normal(0, 0.004, dirs.shape)
        for d in dirs + jit:
            d = d / np.linalg.norm(d)
            th = math.degrees(math.acos(np.clip(d[2], -1, 1))); ph = math.degrees(math.atan2(d[0], -d[1]))
            if th > hairline(ph) - 1.5:
                continue
            loc, nrm = self.surf.ray(HC + d * 0.3, -d, 0.35)
            if loc is None or loc[2] < 1.40:
                continue
            out.append((loc, th, ph))
        return out

    def build(self, total):
        rng = self.rng
        NP = {'bang': 36, 'side': 56, 'upper': 44, 'lower': 72}
        guides = {g: [] for g in NP}
        for loc, th, ph in self.roots(900, 1):
            g = group_of(th, ph)
            wp = self.waypoints(g, loc, th, ph)
            if len(wp) < 3:
                continue
            C = catmull(wp, NP[g])
            lift = {'bang': 0.005 + 0.008 * rng.random(), 'side': 0.004 + 0.006 * rng.random(), 'upper': 0.005 + 0.007 * rng.random(), 'lower': 0.003 + 0.005 * rng.random()}[g]
            C = self.collide(C, lift, 0.03)
            guides[g].append((loc, C, ph))
        log('hair guides', {g: len(v) for g, v in guides.items()})
        children = self.roots(int(total * 0.55), 2)
        strands, radii = [], []
        G = {g: (np.array([c[0] for c in v]), np.array([c[1] for c in v]), np.array([c[2] for c in v])) for g, v in guides.items() if v}
        for loc, th, ph in children:
            g = group_of(th, ph)
            if g not in G:
                continue
            R, Cs, PH = G[g]
            same = (np.sign(PH) == np.sign(ph)) | (g in ('upper', 'lower')) | (abs(ph) < 2)
            idx = np.where(same)[0] if np.any(same) else np.arange(len(R))
            d = np.linalg.norm(R[idx] - loc, axis=1)
            k = idx[np.argsort(d)[:4]]
            w = 1.0 / (np.linalg.norm(R[k] - loc, axis=1) + 0.002) ** 2; w /= w.sum()
            shape = np.tensordot(w, Cs[k] - R[k][:, None, :], axes=1)
            child = shape + loc
            t = np.linspace(0, 1, len(child))[:, None]
            clump = {'bang': 0.45, 'side': 0.3, 'upper': 0.5, 'lower': 0.68}[g] * t ** 0.8
            cg = Cs[k[0]] + (loc - R[k[0]]) * 0.25
            child = child * (1 - clump) + cg * clump
            amp = {'bang': 0.0015, 'side': 0.005, 'upper': 0.0022, 'lower': 0.009}[g] * (3.0 if rng.random() < 0.015 else 1.0)
            e1 = rng.normal(size=3); e1 /= np.linalg.norm(e1)
            f, p0 = rng.uniform(1.0, 2.5), rng.uniform(0, 6.28)
            child = child + amp * (t ** 1.5) * (np.sin(2 * math.pi * f * t + p0) * e1)
            if g in ('lower', 'side') and rng.random() < 0.5:
                child = child[: max(8, int(len(child) * rng.uniform(0.86, 1.0)))]
            strands.append(child)
            radii.append(rng.uniform(0.8, 1.2))
        log('hair strands', len(strands))
        return strands, radii


def mat_jade():
    m = newmat('YY_jade'); b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.18, 0.55, 0.36, 1); b.inputs['Roughness'].default_value = 0.12
    b.inputs['Subsurface Weight'].default_value = 1.0; b.inputs['Subsurface Radius'].default_value = (0.3, 1.0, 0.6); b.inputs['Subsurface Scale'].default_value = 0.004
    b.inputs['Coat Weight'].default_value = 0.6
    return m


def mat_petal():
    m = newmat('YY_petal'); b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.93, 0.92, 0.86, 1); b.inputs['Roughness'].default_value = 0.45
    b.inputs['Subsurface Weight'].default_value = 1.0; b.inputs['Subsurface Radius'].default_value = (1.0, 0.95, 0.8); b.inputs['Subsurface Scale'].default_value = 0.002
    b.inputs['Sheen Weight'].default_value = 0.4
    return m


def build_accessories():
    import bmesh
    jade = mat_jade()
    # 青玉簪 through the bun, tilted
    d = Vector((0.92, 0.15, 0.36)).normalized()
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=0.0019, depth=0.16, location=tuple(BUN + np.array((0.0, 0.012, 0.004))))
    pin = bpy.context.active_object; pin.name = 'YY_hairpin'; pin.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    pin.data.materials.append(jade); bpy.ops.object.shade_smooth()
    head = Vector(BUN) + Vector((0.0, 0.012, 0.004)) + d * 0.08
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=16, radius=0.0065, location=head)
    h = bpy.context.active_object; h.name = 'YY_pin_head'; h.scale = (1.0, 0.7, 1.35); h.data.materials.append(jade); bpy.ops.object.shade_smooth()
    pearl = newmat('YY_pearl'); pb = pearl.node_tree.nodes['Principled BSDF']
    pb.inputs['Base Color'].default_value = (0.9, 0.88, 0.84, 1); pb.inputs['Roughness'].default_value = 0.18; pb.inputs['Coat Weight'].default_value = 1.0
    for k in range(4):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=0.0028, location=head + Vector((0.002, 0.004, -0.009 - k * 0.0062)))
        o = bpy.context.active_object; o.data.materials.append(pearl); bpy.ops.object.shade_smooth()
    # 白玉兰: cupped petals beside the bun
    pm = mat_petal()
    center = Vector(BUN) + Vector((-0.032, 0.0, 0.014))
    for k in range(8):
        bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=1.0)
        for v in bm.verts:
            v.co.x *= 0.0075; v.co.y *= 0.0016; v.co.z *= 0.017
            v.co.z += 0.016
            v.co.y += 0.006 * (v.co.z / 0.033) ** 2
        me = bpy.data.meshes.new('YY_petal'); bm.to_mesh(me); bm.free()
        for p in me.polygons:
            p.use_smooth = True
        me.materials.append(pm)
        o = newobj('YY_petal_%d' % k, me); o.location = center
        ring = 0 if k < 5 else 1
        o.rotation_euler = (0.35 + 0.35 * ring, 0.0, (k / (5 if ring == 0 else 3)) * 2 * math.pi + ring * 0.5)
        o.rotation_mode = 'XYZ'
    log('accessories built')


def build_hair(body, total):
    hb = HairBuilder(body)
    strands, radii = hb.build(total)
    cv = bpy.data.hair_curves.new('YY_hair')
    sizes = [len(s) for s in strands]
    cv.add_curves(sizes)
    cv.position_data.foreach_set('vector', np.concatenate(strands).astype(np.float32).ravel())
    rad = np.concatenate([np.linspace(0.000055, 0.000018, n) * r for n, r in zip(sizes, radii)]).astype(np.float32)
    ra = cv.attributes.get('radius') or cv.attributes.new('radius', 'FLOAT', 'POINT')
    ra.data.foreach_set('value', rad)
    cv.materials.append(mat_hair('YY_hair_mat', melanin=0.965, rough=0.34, radial=0.36))
    ob = bpy.data.objects.new('YY_hair', cv)
    bpy.context.scene.collection.objects.link(ob)
    log('hair object', len(sizes), 'curves', int(sum(sizes)), 'points')
    return ob


# ------------------------------------------------------------------------------------------------ lights / camera
def light(sc, name, loc, target, energy, size, color=(1, 1, 1)):
    l = bpy.data.lights.new(name, 'AREA'); l.energy = energy; l.size = size; l.color = color
    o = bpy.data.objects.new(name, l); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    sc.collection.objects.link(o)
    return o


def setup_world(sc, hdr='forest.exr', strength=0.35):
    w = bpy.data.worlds.new('YY_world'); sc.world = w
    import warnings
    with warnings.catch_warnings():
        warnings.simplefilter('ignore')
        if hasattr(w, 'use_nodes') and not w.use_nodes:
            w.use_nodes = True
    nt = w.node_tree
    bg = nt.nodes['Background']
    path = os.path.join(bpy.utils.system_resource('DATAFILES'), 'studiolights', 'world', hdr)
    if os.path.exists(path):
        env = nt.nodes.new('ShaderNodeTexEnvironment'); env.image = bpy.data.images.load(path)
        nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    bg.inputs['Strength'].default_value = strength
    lp = nt.nodes.new('ShaderNodeLightPath')
    dim = nt.nodes.new('ShaderNodeBackground'); dim.inputs['Strength'].default_value = strength * 0.55
    if os.path.exists(path):
        nt.links.new(env.outputs['Color'], dim.inputs['Color'])
    mixs = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Camera Ray'], mixs.inputs['Fac']); nt.links.new(bg.outputs[0], mixs.inputs[1]); nt.links.new(dim.outputs[0], mixs.inputs[2])
    nt.links.new(mixs.outputs[0], nt.nodes['World Output'].inputs['Surface'])


def setup_camera(sc, shot):
    cam = bpy.data.objects.new('YY_cam', bpy.data.cameras.new('YY_cam')); sc.collection.objects.link(cam); sc.camera = cam
    c = cam.data
    if shot == 'face':
        tgt, pos, c.lens = Vector((0, -0.12, 1.515)), Vector((0.0, -0.95, 1.53)), 135
    elif shot == 'back':
        tgt, pos, c.lens = Vector((0.0, 0.02, 1.52)), Vector((-0.55, 0.95, 1.75)), 85
    elif shot == 'face34':
        tgt, pos, c.lens = Vector((0.004, -0.11, 1.515)), Vector((0.48, -0.86, 1.535)), 135
    else:
        tgt, pos, c.lens = Vector((0.0, -0.07, 1.43)), Vector((0.42, -1.55, 1.5)), 85
    cam.location = pos
    cam.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler()
    c.dof.use_dof = True
    c.dof.focus_distance = (Vector(EYE_C['L']) - pos).length
    c.dof.aperture_fstop = 2.8 if shot == 'portrait' else 4.0
    c.sensor_width = 36
    return cam


def setup_lights(sc):
    head = (0, -0.1, 1.5)
    light(sc, 'YY_key', (-1.2, -0.8, 1.95), head, 70, 0.55, (1.0, 0.92, 0.84))
    light(sc, 'YY_fill', (1.2, -0.9, 1.4), head, 4, 1.4, (0.82, 0.92, 1.0))
    light(sc, 'YY_rim', (0.85, 0.8, 1.85), head, 90, 0.35, (0.82, 0.92, 1.0))
    light(sc, 'YY_rim2', (-0.75, 0.85, 1.7), head, 40, 0.35, (1.0, 0.9, 0.8))
    light(sc, 'YY_top', (-0.2, 0.35, 2.6), head, 6, 0.8, (1.0, 0.97, 0.92))


# ------------------------------------------------------------------------------------------------ main
def main():
    args = parse_args()
    sc = reset_scene()
    setup_render(sc, args)
    body, eyes = load_body(sc, ensure_bundle(args.bundle))
    stylize_face(body, eyes)
    pose_elbows(body)
    bpy.context.view_layer.update()
    body.data.materials.clear(); body.data.materials.append(mat_skin())
    for p in body.data.polygons:
        p.use_smooth = True
    build_eyes(body, eyes)
    build_lashes_brows(body)
    build_clothes(body)
    if args.stage in ('hair', 'full'):
        build_hair(body, args.hair)
        build_accessories()
    setup_world(sc)
    setup_lights(sc)
    setup_camera(sc, args.shot)
    if args.save_blend:
        bpy.ops.wm.save_as_mainfile(filepath=os.path.abspath(args.save_blend))
    sc.render.filepath = os.path.abspath(args.out)
    log('rendering', args.res, 'samples', args.samples)
    bpy.ops.render.render(write_still=True)
    log('done ->', sc.render.filepath)


if __name__ == '__main__':
    main()
