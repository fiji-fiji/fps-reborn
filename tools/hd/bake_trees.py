# HD tree crowns, modelled and baked in Blender (for the HD look: js/hd.js).
#
# The classic look builds each leafy crown from a few faceted balls. For HD, Blender makes
# proper canopies:
#   1. a cluster of metaballs (soft blobs that melt into one shape), turned into a mesh
#   2. the surface pushed in and out by 3D noise: big leaf clumps + small leafy bumps
#   3. colours per vertex: a few greens by clump, sunlit and a little yellower on top,
#      darker underneath, then Cycles bakes ambient occlusion into them (deep inside the
#      canopy is shadowed)
# A few variants of each kind are written to assets/hd/crowns.json (positions, normals,
# colours, triangles; three.js axes: y up).
#
# Run (from the repo folder):
#   blender -b --factory-startup --python tools/hd/bake_trees.py
# Takes under a minute on a GPU.

import json, math, os, random, time
import bpy
import numpy as np
from mathutils import Vector, noise

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, 'assets', 'hd', 'crowns.json')

# Sizes match the classic crowns (decor.js), so they sit on the same trunks and the oranges
# stay on the surface. Units: metres; centre = the crown's anchor point in decor.js.
# scale/pivot: the finished crown is scaled by `scale` around height `pivot`.
KINDS = {
    # Paris plane trees: a big round canopy on a 4 m trunk
    'tree':   dict(variants=3, blobs=(7, 9), centre=(0, 1.8, 0), spread=(1.35, 0.75, 1.35), radius=(1.15, 1.6),
                   resolution=0.13, clump=0.55, clumpAmp=0.22, bumpAmp=0.06,
                   greens=['#5fae4e', '#6dbd57', '#4e9a45', '#58a84a'], scale=1.3, pivot=1.9),
    # Barcelona orange trees: small and round (the oranges are added by decor.js)
    'orange': dict(variants=2, blobs=(5, 6), centre=(0, 1.3, 0), spread=(0.3, 0.2, 0.3), radius=(0.72, 0.85),
                   resolution=0.08, clump=0.32, clumpAmp=0.1, bumpAmp=0.035,
                   greens=['#4f9a45', '#5aa84c', '#468c3e'], scale=1.45, pivot=1.3),
}


def srgb_to_linear(c):
    c = np.asarray(c, float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def hex_rgb(h):
    return np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)])


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for t in ('OPTIX', 'CUDA', 'HIP', 'ONEAPI', 'METAL'):
        try:
            prefs.compute_device_type = t
            prefs.get_devices()
            if any(d.type != 'CPU' for d in prefs.devices):
                break
        except Exception:
            continue
    for d in prefs.devices:
        d.use = True
    sc.cycles.device = 'GPU' if any(d.use and d.type != 'CPU' for d in prefs.devices) else 'CPU'
    sc.cycles.samples = 96
    sc.render.bake.target = 'VERTEX_COLORS'
    sc.world = bpy.data.worlds.new('w')
    return sc


def make_crown(sc, kind, cfg, seed):
    rnd = random.Random(seed)
    # 1. blobs (Blender is z-up: game (x, y, z) -> Blender (x, -z, y))
    mb = bpy.data.metaballs.new(f'{kind}{seed}')
    mb.resolution = cfg['resolution']
    mb.render_resolution = cfg['resolution']
    mb.threshold = 0.6
    cx, cy, cz = cfg['centre']
    sx, sy, sz = cfg['spread']
    n = rnd.randint(*cfg['blobs'])
    for i in range(n):
        if i == 0:
            off = (0, 0, 0)
        else:
            a = rnd.random() * math.tau
            r = 0.55 + rnd.random() * 0.45
            off = (math.cos(a) * r * sx, (rnd.random() * 2 - 0.8) * sy, math.sin(a) * r * sz)
        e = mb.elements.new()
        e.co = (cx + off[0], -(cz + off[2]), cy + off[1])
        e.radius = rnd.uniform(*cfg['radius']) * (1.15 if i == 0 else 1.0)
    obj = bpy.data.objects.new(f'mb{kind}{seed}', mb)
    sc.collection.objects.link(obj)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(obj.evaluated_get(dg))
    bpy.data.objects.remove(obj)
    crown = bpy.data.objects.new(f'crown{kind}{seed}', me)
    sc.collection.objects.link(crown)

    # 2. leafy surface: big clumps (cellular) + small bumps, pushed out along the normal
    me.update()
    co = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    nrm = np.array([v.normal[:] for v in me.vertices])
    shift = Vector((seed * 7.31, seed * 3.17, seed * 5.53))
    clump_id = np.zeros(len(co))
    for i, (p, nv) in enumerate(zip(co, nrm)):
        v = Vector(p)
        d, pts = noise.voronoi(v / cfg['clump'] + shift, distance_metric='DISTANCE')
        f1, f2 = d[0], d[1]
        clump = math.sqrt(max(0.0, min(1.0, (f2 - f1) * 1.6)))           # domed clumps, creases between
        bump = noise.noise(v * (2.6 / cfg['clump']) + shift) * 0.5 + noise.noise(v * (6.0 / cfg['clump']) + shift) * 0.25
        h = (clump - 0.5) * cfg['clumpAmp'] + bump * cfg['bumpAmp']
        co[i] = p + nv * h
        q = pts[0]
        clump_id[i] = abs(math.sin(q[0] * 12.9898 + q[1] * 78.233 + q[2] * 37.719) * 43758.5453) % 1.0
    me.vertices.foreach_set('co', co.ravel())
    me.update()
    me.shade_smooth()

    # 3. colours: greens by clump, sunlit top, darker underside...
    greens = [hex_rgb(g) for g in cfg['greens']]
    zmin, zmax = co[:, 2].min(), co[:, 2].max()
    attr = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    me.color_attributes.active_color = attr
    base = np.zeros((len(co), 3))
    for i in range(len(co)):
        g = greens[int(clump_id[i] * len(greens)) % len(greens)]
        t = (co[i, 2] - zmin) / max(1e-6, zmax - zmin)                    # 0 bottom .. 1 top
        c = g * (0.72 + 0.42 * t)
        c = c + np.array([0.06, 0.05, -0.02]) * max(0.0, t - 0.55) * 2   # sun-kissed tips
        base[i] = np.clip(c, 0, 1)
    # ...then ambient occlusion from Cycles (into the same colour attribute)
    mat = bpy.data.materials.new('leaf'); mat.use_nodes = True
    me.materials.append(mat)
    for o in sc.objects:
        o.select_set(False)
    crown.select_set(True)
    bpy.context.view_layer.objects.active = crown
    sc.world.light_settings.distance = 1.2 * cfg['clump'] / 0.55
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    ao = np.zeros(len(co) * 4, np.float32); attr.data.foreach_get('color', ao); ao = ao.reshape(-1, 4)[:, 0]
    col = srgb_to_linear(base) * (0.35 + 0.65 * ao)[:, None]

    # export: triangles, three.js axes (x, y, z) = Blender (x, z, -y)
    me.calc_loop_triangles()
    tris = np.zeros(len(me.loop_triangles) * 3, np.int32); me.loop_triangles.foreach_get('vertices', tris)
    nrm = np.array([v.normal[:] for v in me.vertices])
    pos3 = np.stack([co[:, 0], co[:, 2], -co[:, 1]], -1)
    pos3[:, 1] -= cfg['pivot']; pos3 *= cfg['scale']; pos3[:, 1] += cfg['pivot']   # final size (see KINDS)
    nrm3 = np.stack([nrm[:, 0], nrm[:, 2], -nrm[:, 1]], -1)
    out = {
        'pos': np.round(pos3, 3).ravel().tolist(),
        'nor': np.round(nrm3, 3).ravel().tolist(),
        'col': np.round(col, 3).ravel().tolist(),
        'idx': tris.tolist(),
    }
    bpy.data.objects.remove(crown)
    return out, len(co), len(tris) // 3


def main():
    t0 = time.time()
    sc = setup()
    result = {}
    for kind, cfg in KINDS.items():
        result[kind] = []
        for v in range(cfg['variants']):
            data, nv, nt = make_crown(sc, kind, cfg, 11 + v * 17 + (0 if kind == 'tree' else 100))
            result[kind].append(data)
            print(f'[trees] {kind} #{v + 1}: {nv} vertices, {nt} triangles  {time.time() - t0:.1f}s', flush=True)
    with open(OUT, 'w') as f:
        json.dump(result, f, separators=(',', ':'))
    print(f'[trees] wrote {OUT} ({os.path.getsize(OUT) / 1e6:.2f} MB) in {time.time() - t0:.0f}s')


main()
