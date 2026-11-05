# The HD look's characters: the dog (a fluffy white Bichon) and the cat, as smooth, rigged
# bodies for js/hdchar.js (which adds the fur, the eyes, the clothes and the animation).
#
# Each body is a distance field (rounded limbs, an ellipsoid skull, a muzzle, cheeks, ears,
# a tail...) melted together and turned into a mesh (surface nets), then in Blender: smoothed,
# decimated, unwrapped, and skinned to a skeleton (Blender's automatic weights).
#
# Out: assets/hd/char/<species>.json (skeleton, eyes, sizes, where things are in the .bin)
#      assets/hd/char/<species>.bin  (vertices: position, normal, uv, bones, weights, masks)
# Coordinates are the game's: metres, y up, the character faces +z, feet at y = 0.
#
# Run:  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup
#           --python tools/hd/make_characters.py [-- --preview DIR] [--only dog]

import json, math, os, sys
import numpy as np
import bpy, bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'hd', 'char')
ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
PREVIEW = ARGS[ARGS.index('--preview') + 1] if '--preview' in ARGS else None
ONLY = ARGS[ARGS.index('--only') + 1].split(',') if '--only' in ARGS else None

H = 0.0065                    # grid step of the distance field (m)
TARGET_FACES = 9000           # triangles after decimation (the fur multiplies them)


# ---------------------------------------------------------------------------------------
# Distance-field shapes (numpy, all points at once)
# ---------------------------------------------------------------------------------------
def rot(euler):
    """3x3 rotation from (x, y, z) angles in radians (applied x, then y, then z)."""
    x, y, z = euler
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


def ellipsoid(c, r, euler=(0, 0, 0)):
    c, r = np.array(c, np.float32), np.array(r, np.float32)
    R = rot(euler).astype(np.float32)
    def f(P):
        q = (P - c) @ R                                # into the ellipsoid's frame
        k0 = np.linalg.norm(q / r, axis=-1)
        k1 = np.linalg.norm(q / (r * r), axis=-1)
        return k0 * (k0 - 1) / np.maximum(k1, 1e-6)
    f.bounds = (c - r.max() - 0.02, c + r.max() + 0.02)
    return f


def limb(a, b, ra, rb, flat=1.0, flat_axis=None):
    """A rounded, tapering limb from a (radius ra) to b (radius rb); `flat` < 1 squashes it
    across flat_axis (ears)."""
    a, b = np.array(a, np.float32), np.array(b, np.float32)
    ba = b - a
    L2 = float(ba @ ba)
    fa = None if flat_axis is None else np.array(flat_axis, np.float32) / np.linalg.norm(flat_axis)
    def f(P):
        pa = P - a
        t = np.clip(pa @ ba / L2, 0, 1)
        d = pa - t[..., None] * ba
        if fa is not None:                              # stretch the across-direction: flatter
            dn = d @ fa
            d = d + (dn / flat - dn)[..., None] * fa
        return (np.linalg.norm(d, axis=-1) - (ra + (rb - ra) * t)) * (flat if fa is not None else 1)
    m = max(ra, rb) + 0.02
    f.bounds = (np.minimum(a, b) - m, np.maximum(a, b) + m)
    return f


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.maximum(k - np.abs(a - b), 0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


def evaluate(shapes, P):
    """shapes: [(fn, k, op)] op '+' smooth-union, '-' smooth-subtract. Each shape only touches
    the points inside its bounds (much faster)."""
    D = np.full(P.shape[:-1], 1.0, np.float32)
    for fn, k, op in shapes:
        lo, hi = fn.bounds
        lo, hi = lo - k, hi + k
        m = np.all((P >= lo) & (P <= hi), axis=-1)
        if not m.any():
            continue
        d = fn(P[m])
        D[m] = smin(D[m], d, k) if op == '+' else smax(D[m], -d, k)
    return D


# ---------------------------------------------------------------------------------------
# Surface nets: the field's zero level as a quad mesh
# ---------------------------------------------------------------------------------------
def surface_nets(D, origin, h):
    nx, ny, nz = D.shape
    inside = D < 0
    # each cell (nx-1, ny-1, nz-1) with a sign change gets a vertex: the mean of its edge crossings
    acc = np.zeros((nx - 1, ny - 1, nz - 1, 3), np.float32)
    cnt = np.zeros((nx - 1, ny - 1, nz - 1), np.float32)
    corners = [(i, j, k) for i in (0, 1) for j in (0, 1) for k in (0, 1)]
    edges = [(c0, c1) for c0 in corners for c1 in corners if sum(abs(np.subtract(c1, c0))) == 1 and c0 < c1]
    sl = lambda o: (slice(o[0], nx - 1 + o[0]), slice(o[1], ny - 1 + o[1]), slice(o[2], nz - 1 + o[2]))
    for c0, c1 in edges:
        d0, d1 = D[sl(c0)], D[sl(c1)]
        s = (d0 < 0) != (d1 < 0)
        t = np.where(s, d0 / np.where(s, d0 - d1, 1), 0)
        p = np.array(c0, np.float32) + t[..., None] * (np.array(c1, np.float32) - np.array(c0, np.float32))
        acc += np.where(s[..., None], p, 0)
        cnt += s
    act = cnt > 0
    idx = -np.ones(cnt.shape, np.int64)
    idx[act] = np.arange(act.sum())
    cell = np.argwhere(act)
    verts = (cell + acc[act] / cnt[act][:, None]) * h + origin
    faces = []
    # each grid edge with a sign change: a quad of the 4 cells around it
    for axis in range(3):
        a1, a2 = [x for x in range(3) if x != axis]
        sel = [slice(None)] * 3
        sel[axis] = slice(0, -1)
        d0 = D[tuple(sel)]
        sel[axis] = slice(1, None)
        d1 = D[tuple(sel)]
        s = (d0 < 0) != (d1 < 0)
        pts = np.argwhere(s)
        pts = pts[(pts[:, a1] > 0) & (pts[:, a2] > 0) & (pts[:, a1] < D.shape[a1] - 1) & (pts[:, a2] < D.shape[a2] - 1)]
        flip = d0[tuple(pts.T)] < 0
        def c(da, db):
            q = pts.copy()
            q[:, a1] -= da
            q[:, a2] -= db
            return idx[tuple(q.T)]
        q = np.stack([c(1, 1), c(0, 1), c(0, 0), c(1, 0)], 1)
        q = np.where(flip[:, None] ^ (axis == 1), q[:, ::-1], q)
        faces.append(q)
    faces = np.concatenate(faces)
    faces = faces[np.all(faces >= 0, axis=1)][:, ::-1]      # (outward-facing)
    return verts, faces


# ---------------------------------------------------------------------------------------
# The two characters (game coordinates: x right... well, x = the character's left, y up, +z front)
# ---------------------------------------------------------------------------------------
def mirror(fn_maker, *a, **kw):
    """The same shape on both sides: a function of side s = +1 / -1."""
    return [fn_maker(s, *a, **kw) for s in (1, -1)]


def joints(sp):
    """Skeleton (A-pose arms): name -> (parent, head position). Tails = the first child or + a bit."""
    cat = sp == 'cat'
    J = {
        'root': (None, (0, 0, 0)),
        'hips': ('root', (0, 0.86, 0)),
        'spine': ('hips', (0, 1.0, 0.0)),
        'chest': ('spine', (0, 1.17, 0.0)),
        'neck': ('chest', (0, 1.33, 0.0)),
        'head': ('neck', (0, 1.45, 0.01)),
    }
    for s, n in ((1, 'L'), (-1, 'R')):
        J[f'shoulder.{n}'] = ('chest', (s * 0.07, 1.30, 0.0))
        J[f'upperarm.{n}'] = (f'shoulder.{n}', (s * 0.2, 1.31, 0.0))
        J[f'forearm.{n}'] = (f'upperarm.{n}', (s * 0.33, 1.08, 0.0))
        J[f'hand.{n}'] = (f'forearm.{n}', (s * 0.44, 0.87, 0.02))
        J[f'thigh.{n}'] = ('hips', (s * 0.105, 0.80, 0.0))
        J[f'shin.{n}'] = (f'thigh.{n}', (s * 0.11, 0.44, 0.025))
        J[f'foot.{n}'] = (f'shin.{n}', (s * 0.115, 0.095, -0.005))
        J[f'ear.{n}'] = ('head', (s * 0.1, 1.71, -0.02) if cat else (s * 0.15, 1.67, -0.01))
    tail = ([(0, 0.88, -0.11), (0, 0.84, -0.27), (0, 0.9, -0.41), (0, 1.06, -0.5), (0, 1.22, -0.5)] if cat else
            [(0, 0.9, -0.12), (0, 0.98, -0.2), (0, 1.07, -0.23), (0, 1.14, -0.19)])
    prev = 'hips'
    for i, p in enumerate(tail):
        J[f'tail{i}'] = (prev, p)
        prev = f'tail{i}'
    return J


def body(sp):
    cat = sp == 'cat'
    J = {k: np.array(v[1], np.float32) for k, v in joints(sp).items()}
    S = []
    add = lambda f, k=0.03: S.append((f, k, '+'))
    sub = lambda f, k=0.01: S.append((f, k, '-'))
    th = 0.88 if cat else 1.0                                  # cats: slimmer
    # legs and feet (chunky thighs, a soft knee, big paws)
    for n in 'LR':
        s = 1 if n == 'L' else -1
        add(limb(J[f'thigh.{n}'] + (0, 0.02, 0), J[f'shin.{n}'], 0.118 * th, 0.082 * th), 0.05)
        add(limb(J[f'shin.{n}'], J[f'foot.{n}'], 0.078 * th, 0.06 * th), 0.04)
        add(ellipsoid((s * 0.118, 0.052, 0.07), (0.07 * th, 0.055, 0.12)), 0.05)
        for t in (-1, 0, 1):                                    # toes
            add(ellipsoid((s * 0.118 + t * 0.03 * th, 0.035, 0.155 + (0.0 if t else 0.01)), (0.028, 0.03, 0.035)), 0.02)
    # torso: hips, round belly, chest
    add(ellipsoid((0, 0.88, -0.015), (0.205 * th, 0.15, 0.155 * th)), 0.06)
    add(ellipsoid((0, 1.02, 0.025), (0.21 * th, 0.2, 0.17 * th)), 0.07)
    add(ellipsoid((0, 1.2, 0.0), (0.215 * th, 0.165, 0.15 * th)), 0.07)
    add(limb(J['chest'] + (0, 0.1, -0.01), J['head'] + (0, 0.06, 0), 0.1 * th, 0.088 * th), 0.06)    # neck
    # arms (A-pose) and paws
    for n in 'LR':
        s = 1 if n == 'L' else -1
        add(ellipsoid(J[f'upperarm.{n}'] + (-s * 0.035, -0.02, 0), (0.08 * th, 0.065, 0.075 * th)), 0.06)   # shoulder
        add(limb(J[f'upperarm.{n}'], J[f'forearm.{n}'], 0.072 * th, 0.06 * th), 0.04)
        add(limb(J[f'forearm.{n}'], J[f'hand.{n}'], 0.062 * th, 0.05 * th), 0.03)
        d = J[f'hand.{n}'] - J[f'forearm.{n}']
        d /= np.linalg.norm(d)
        add(ellipsoid(J[f'hand.{n}'] + d * 0.055, (0.055, 0.07, 0.06), (0, 0, s * 0.45)), 0.035)
    # head
    if not cat:
        add(ellipsoid((0, 1.6, -0.01), (0.175, 0.168, 0.168)), 0.07)                   # skull
        add(ellipsoid((0, 1.535, 0.13), (0.1, 0.082, 0.105)), 0.07)                     # muzzle
        add(ellipsoid((0, 1.555, 0.19), (0.07, 0.055, 0.055)), 0.05)                    # top of the snout
        for s in (1, -1):
            add(ellipsoid((s * 0.08, 1.54, 0.07), (0.075, 0.07, 0.07)), 0.06)          # cheeks
            add(ellipsoid((s * 0.06, 1.652, 0.105), (0.058, 0.036, 0.048)), 0.045)      # brows
            add(ellipsoid((s * 0.17, 1.55, -0.02), (0.045, 0.125, 0.08), (0.15, 0, s * 0.2)), 0.045)   # floppy ears
        add(ellipsoid((0, 1.578, 0.238), (0.038, 0.027, 0.026)), 0.02)                  # nose
        add(ellipsoid((0, 1.48, 0.1), (0.065, 0.032, 0.055)), 0.035)                   # chin
        for s in (1, -1):
            sub(ellipsoid((s * 0.066, 1.615, 0.142), (0.034, 0.034, 0.03)), 0.012)       # eye sockets
        sub(ellipsoid((0, 1.505, 0.2), (0.07, 0.006, 0.05)), 0.008)                    # mouth line
    else:
        add(ellipsoid((0, 1.595, -0.01), (0.172, 0.158, 0.16)), 0.07)                  # skull
        for s in (1, -1):
            add(ellipsoid((s * 0.09, 1.54, 0.045), (0.092, 0.075, 0.08)), 0.06)        # cheeks (ruff)
            add(ellipsoid((s * 0.032, 1.538, 0.13), (0.044, 0.035, 0.042)), 0.035)     # whisker pads
            # upright ears: flattened cones, hollow at the front
            base = np.array((s * 0.1, 1.69, -0.02), np.float32)
            tip = np.array((s * 0.16, 1.87, -0.04), np.float32)
            add(limb(base, tip, 0.075, 0.01, 0.38, (0, 0.25, 1)), 0.035)
            sub(limb(base + (0, 0.025, 0.026), tip + (-s * 0.006, -0.018, 0.012), 0.052, 0.004, 0.3, (0, 0.25, 1)), 0.008)
        add(ellipsoid((0, 1.5, 0.106), (0.042, 0.03, 0.042)), 0.03)                     # chin
        add(ellipsoid((0, 1.572, 0.163), (0.024, 0.016, 0.016)), 0.012)                 # nose
        add(ellipsoid((0, 1.605, 0.125), (0.034, 0.045, 0.04)), 0.035)                  # bridge of the nose
        for s in (1, -1):
            sub(ellipsoid((s * 0.07, 1.612, 0.126), (0.039, 0.031, 0.033), (0, 0, s * 0.18)), 0.012)   # eye sockets
        sub(ellipsoid((0, 1.513, 0.15), (0.045, 0.005, 0.03)), 0.006)                  # mouth line
    # tail
    tail = [J[f'tail{i}'] for i in range(5 if cat else 4)]
    rr = [0.045, 0.038, 0.034, 0.03, 0.024] if cat else [0.055, 0.055, 0.05, 0.04]
    for i in range(len(tail) - 1):
        add(limb(tail[i], tail[i + 1], rr[i], rr[i + 1]), 0.04 if i == 0 else 0.015)
    eyes = ([((s * 0.066, 1.615, 0.141), 0.032) for s in (1, -1)] if not cat else
            [((s * 0.07, 1.612, 0.113), 0.031) for s in (1, -1)])
    nose = (0, 1.578, 0.238) if not cat else (0, 1.572, 0.163)
    return S, eyes, nose


def build_mesh(sp):
    S, eyes, nose = body(sp)
    lo = np.array([-0.62, -0.03, -0.66], np.float32)
    hi = np.array([0.62, 1.95, 0.36], np.float32)
    n = np.ceil((hi - lo) / H).astype(int) + 1
    g = [lo[i] + np.arange(n[i], dtype=np.float32) * H for i in range(3)]
    P = np.stack(np.meshgrid(*g, indexing='ij'), -1)
    D = evaluate(S, P)
    del P
    v, f = surface_nets(D, lo, H)
    return v, f, eyes, nose


# ---------------------------------------------------------------------------------------
# Blender: game coords (x, y, z) <-> Blender (x, -z, y)
# ---------------------------------------------------------------------------------------
G2B = lambda p: (p[0], -p[2], p[1])
B2G = lambda p: (p[0], p[2], -p[1])


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)


def make_object(sp, v, f):
    me = bpy.data.meshes.new(sp)
    me.from_pydata([G2B(p) for p in v.tolist()], [], f.tolist())
    me.update()
    ob = bpy.data.objects.new(sp, me)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    # smooth out the grid's steps, then fewer triangles
    m = ob.modifiers.new('smooth', 'LAPLACIANSMOOTH')
    m.iterations, m.lambda_factor, m.use_volume_preserve = 6, 0.6, True
    bpy.ops.object.modifier_apply(modifier='smooth')
    d = ob.modifiers.new('dec', 'DECIMATE')
    d.ratio = min(1.0, TARGET_FACES / max(1, len(me.polygons) * 2))
    bpy.ops.object.modifier_apply(modifier='dec')
    bpy.ops.object.shade_smooth()
    return ob


def preview(objs, path):
    """Front, side and three-quarter views: the whole body, then the heads close up."""
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.display.shading.light = 'STUDIO'
    sc.display.shading.color_type = 'OBJECT'
    sc.display.shading.show_cavity = True
    sc.render.resolution_x, sc.render.resolution_y = 1500, 700
    cam = bpy.data.cameras.new('cam')
    cam.type = 'ORTHO'
    co = bpy.data.objects.new('cam', cam)
    sc.collection.objects.link(co)
    sc.camera = co
    for k, turn in enumerate((math.pi / 2, math.pi / 4)):    # side (facing right), three-quarter
        for o in objs:
            o2 = o.copy()
            sc.collection.objects.link(o2)
            o2.matrix_world = (__import__('mathutils').Matrix.Translation(((k + 1) * 1.0, 0, 0)) @
                               __import__('mathutils').Matrix.Rotation(turn, 4, 'Z') @ o.matrix_world)
    co.rotation_euler = (math.pi / 2, 0, 0)
    for tag, x, z, scale in (('body', 1.0, 0.95, 4.4), ('head', 1.0, 1.62, 2.7)):
        cam.ortho_scale = scale
        co.location = (x, -5, z)
        sc.render.filepath = path.replace('.png', f'_{tag}.png')
        bpy.ops.render.render(write_still=True)


# ---------------------------------------------------------------------------------------
# Skeleton + automatic weights (Blender's heat diffusion)
# ---------------------------------------------------------------------------------------
def rig(sp, ob):
    J = joints(sp)
    names = list(J)
    kids = {n: [c for c in names if J[c][0] == n] for n in names}
    arm = bpy.data.armatures.new(sp + '_rig')
    ao = bpy.data.objects.new(sp + '_rig', arm)
    bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for n in names:
        parent, p = J[n]
        b = arm.edit_bones.new(n)
        head = np.array(p, np.float32)
        # the tail: the child in line (spine chain, limb), else a short stub
        ch = [c for c in kids[n] if not c.startswith(('ear', 'shoulder', 'thigh', 'tail'))] or kids[n]
        if n == 'hips':
            ch = ['spine']
        if ch:
            tail = np.array(J[ch[0]][1], np.float32)
        elif n == 'head':
            tail = head + (0, 0.2, 0.02)
        elif n.startswith('foot'):
            tail = head + (0, -0.03, 0.15)
        elif n.startswith('ear'):
            tail = head + ((0.02 * np.sign(head[0]), 0.13, -0.01) if sp == 'cat' else (0.025 * np.sign(head[0]), -0.16, 0))
        else:
            pp = np.array(J[parent][1], np.float32)
            d = head - pp
            tail = head + d / max(np.linalg.norm(d), 1e-6) * 0.08
        if np.linalg.norm(tail - head) < 1e-3:
            tail = head + (0, 0.05, 0)
        b.head, b.tail = G2B(head.tolist()), G2B(tail.tolist())
        b.use_deform = n != 'root'
        eb[n] = b
    for n in names:
        if J[n][0]:
            eb[n].parent = eb[J[n][0]]
    bpy.ops.object.mode_set(mode='OBJECT')
    # skin: mesh selected, armature active
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    ao.select_set(True)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    missing = sum(1 for v in ob.data.vertices if not v.groups)
    print(f'[char] {sp}: skinned, {missing} vertices without weights', flush=True)
    return names


def unwrap(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.01)
    bpy.ops.object.mode_set(mode='OBJECT')


# ---------------------------------------------------------------------------------------
# Masks per vertex: how long the fur is, and where the coat is light / pink skin / dark skin
# ---------------------------------------------------------------------------------------
def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def masks(sp, P, N, bone_of, eyes, nose):
    cat = sp == 'cat'
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    dist = lambda c: np.linalg.norm(P - np.array(c, np.float32), axis=1)
    near_eye = np.minimum(*[dist(c) - r for c, r in eyes])
    starts = lambda pre: np.char.startswith(bone_of, pre)
    head = np.isin(bone_of, ['head', 'neck']) & (y > 1.45)
    face = head & (z > 0.06)
    light = np.zeros(len(P), np.float32)
    pink = np.zeros(len(P), np.float32)
    dark = np.zeros(len(P), np.float32)
    dn = dist(nose)
    if not cat:
        fur = np.full(len(P), 0.045, np.float32)
        fur = np.where(head, 0.055, fur)                                   # fluffy head
        fur = np.where(starts('ear'), 0.06, fur)
        fur = np.where(starts('tail'), 0.065, fur)
        fur = np.where(face, 0.03 + 0.02 * sstep(0.2, 0.1, z), fur)         # shorter on the snout
        fur = np.where(dn < 0.07, fur * sstep(0.03, 0.07, dn), fur)
        dark = np.maximum(dark, sstep(0.042, 0.03, dn))                     # the nose: black leather
        dark = np.maximum(dark, sstep(0.012, 0.002, near_eye))             # eye rims
        mouth = sstep(0.012, 0.0, np.abs(y - 1.505)) * sstep(0.12, 0.17, z) * face
        dark = np.maximum(dark, mouth * 0.9)
    else:
        fur = np.full(len(P), 0.014, np.float32)
        fur = np.where(starts('tail'), 0.022, fur)
        cheeks = head & (np.abs(x) > 0.1) & (y < 1.6)
        fur = np.where(cheeks, 0.024, fur)                                  # the ruff
        fur = np.where(face, 0.009, fur)
        pink = np.maximum(pink, sstep(0.03, 0.02, dn))                      # pink nose
        fur = np.where(dn < 0.04, fur * sstep(0.02, 0.04, dn), fur)
        dark = np.maximum(dark, sstep(0.012, 0.002, near_eye))
        # the inside of the ears: pink, almost bare
        ear = starts('ear') | (head & (y > 1.72))
        inner = ear & (N[:, 2] > 0.35) & (y > 1.71)
        pink = np.maximum(pink, inner * 0.8)
        fur = np.where(inner, 0.004, fur)
        # the white parts: muzzle, chin, chest, belly
        muzzle = face & (y < 1.585) & (np.abs(x) < 0.08)
        chest = (z > 0.05) & (y > 0.85) & (y < 1.42) & (np.abs(x) < 0.11 + 0.05 * sstep(1.4, 1.1, y)) & ~head
        light = np.maximum(muzzle.astype(np.float32), chest.astype(np.float32) * sstep(0.05, 0.1, z))
        mouth = sstep(0.004, 0.0, np.abs(y - 1.513 - 0.25 * x * x / 0.002)) * sstep(0.1, 0.13, z) * sstep(0.045, 0.03, np.abs(x)) * face
        dark = np.maximum(dark, mouth * 0.5)
    fur = fur * sstep(0.0, 0.016 if cat else 0.04, near_eye)               # bare round the eyes
    # paw pads under the feet and on the palms
    pads = ((y < 0.025) | (starts('hand') & (N[:, 1] < -0.5))).astype(np.float32)
    fur = np.where(pads > 0, 0.004, fur)
    if cat:
        pink = np.maximum(pink, pads * 0.8)
    else:
        dark = np.maximum(dark, pads * 0.75)
    return fur, light, pink, dark


def vest_region(sp, P, bone_of):
    """Where the team vest (and its armbands) can be: a bit more than it covers (the game cuts its
    exact shape, neckline and armholes, per pixel: hdchar.js vestMask)."""
    y = P[:, 1]
    away = np.zeros(len(P), bool)
    for pre in ('forearm', 'hand', 'head', 'ear', 'tail', 'shin', 'foot'):
        away |= np.char.startswith(bone_of, pre)
    return (y > 0.88) & (y < 1.44) & ~away


# ---------------------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------------------
def export(sp, ob, names, eyes, nose):
    me = ob.data
    me.calc_loop_triangles()
    uvl = me.uv_layers.active.data
    nv = len(me.vertices)
    P = np.array([B2G(v.co) for v in me.vertices], np.float32)
    N = np.array([B2G(v.normal) for v in me.vertices], np.float32)
    # weights: the 4 biggest per vertex
    gi = {g.index: g.name for g in ob.vertex_groups}
    bi = {n: i for i, n in enumerate(names)}
    SI = np.zeros((nv, 4), np.uint8)
    SW = np.zeros((nv, 4), np.float32)
    bone_of = []
    # the ears only move the ears (heat weighting also hands them the side of the skull)
    if sp == 'cat':
        earness = sstep(1.67, 1.72, P[:, 1]) * sstep(0.04, 0.07, np.abs(P[:, 0]))
    else:
        q = (np.abs(P[:, 0]) - 0.17) / 0.06, (P[:, 1] - 1.55) / 0.14, (P[:, 2] + 0.02) / 0.095
        earness = sstep(1.35, 1.0, np.sqrt(q[0] ** 2 + q[1] ** 2 + q[2] ** 2)) * sstep(0.12, 0.15, np.abs(P[:, 0]))
    for v in me.vertices:
        wd = {}
        for g in v.groups:
            n = gi[g.group]
            if n in bi and g.weight > 0:
                wd[n] = wd.get(n, 0) + g.weight
        for n in ('ear.L', 'ear.R'):
            if n in wd:
                w = wd[n]
                wd[n] = w * earness[v.index]
                wd['head'] = wd.get('head', 0) + w * (1 - earness[v.index])
        ws = sorted(((w, n) for n, w in wd.items() if w > 1e-4), reverse=True)[:4]
        if not ws:
            ws = [(1.0, 'hips')]
        tot = sum(w for w, _ in ws) or 1
        for k, (w, n) in enumerate(ws):
            SI[v.index, k] = bi[n]
            SW[v.index, k] = w / tot
        bone_of.append(ws[0][1])
    bone_of = np.array(bone_of, dtype=str)
    fur, light, pink, dark = masks(sp, P, N, bone_of, eyes, nose)
    vest = vest_region(sp, P, bone_of)
    if '--debug' in ARGS:
        u, c = np.unique(bone_of, return_counts=True)
        print('[char] bones:', dict(zip(u.tolist(), c.tolist())), 'vest verts', int(vest.sum()), flush=True)
    # split vertices where the uv map has seams
    key, src, uvs, tris = {}, [], [], []
    for t in me.loop_triangles:
        tri = []
        for li, vi in zip(t.loops, t.vertices):
            u = uvl[li].uv
            k = (vi, round(u[0], 5), round(u[1], 5))
            if k not in key:
                key[k] = len(src)
                src.append(vi)
                uvs.append((u[0], u[1]))
            tri.append(key[k])
        tris.append(tri)
    src = np.array(src)
    tris = np.array(tris, np.uint32)                 # (Blender -> game is a rotation: the winding stays)
    vest_tri = np.all(vest[src[tris]], axis=1)
    n = len(src)
    # how many metres one uv unit is (for the fur's strand density)
    U = np.array(uvs, np.float32)
    a3 = sum(t.area for t in me.loop_triangles)
    A, B, C = U[tris[:, 0]], U[tris[:, 1]], U[tris[:, 2]]
    uva = np.abs((B[:, 0] - A[:, 0]) * (C[:, 1] - A[:, 1]) - (C[:, 0] - A[:, 0]) * (B[:, 1] - A[:, 1])).sum() / 2
    uv_m = math.sqrt(a3 / max(uva, 1e-9))
    # buffers
    pos = P[src].astype(np.float32)
    nn = N[src] / np.maximum(np.linalg.norm(N[src], axis=1, keepdims=True), 1e-6)
    nrm = np.zeros((n, 4), np.int8)
    nrm[:, :3] = np.clip(np.round(nn * 127), -127, 127)
    si = SI[src]
    sw = np.clip(np.round(SW[src] * 255), 0, 255).astype(np.int32)
    sw[:, 0] = np.clip(255 - sw[:, 1:].sum(1), 0, 255)                     # (they add up to 255 again)
    sw = sw.astype(np.uint8)
    msk = np.stack([light[src], pink[src], dark[src], fur[src] / 0.08], 1)
    msk = np.clip(np.round(msk * 255), 0, 255).astype(np.uint8)
    it = np.uint16 if n < 65536 else np.uint32
    blobs, layout, off = [], {}, 0
    for name, arr in (('position', pos), ('normal', nrm), ('uv', U), ('skinIndex', si), ('skinWeight', sw),
                      ('masks', msk), ('index', tris.astype(it).ravel()),
                      ('vestIndex', tris[vest_tri].astype(it).ravel())):
        b = np.ascontiguousarray(arr).tobytes()
        pad = (-len(b)) % 4
        layout[name] = {'offset': off, 'count': int(arr.size), 'type': str(arr.dtype)}
        blobs.append(b + b'\0' * pad)
        off += len(b) + pad
    J = joints(sp)
    meta = {
        'species': sp, 'vertices': n, 'uvMetres': round(uv_m, 5), 'furMax': 0.08,
        'bones': [{'name': k, 'parent': J[k][0], 'pos': [round(float(c), 4) for c in J[k][1]]} for k in names],
        'eyes': [{'pos': [float(c) for c in e[0]], 'r': e[1]} for e in eyes], 'nose': [float(c) for c in nose],
        'layout': layout,
    }
    with open(os.path.join(OUT, f'{sp}.bin'), 'wb') as fh:
        fh.write(b''.join(blobs))
    json.dump(meta, open(os.path.join(OUT, f'{sp}.json'), 'w'), indent=1)
    print(f'[char] {sp}: {n} vertices, {len(tris)} triangles ({int(vest_tri.sum())} vest), '
          f'uv 1 = {uv_m:.2f} m, {off / 1e6:.2f} MB', flush=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    for sp in ('dog', 'cat'):
        if ONLY and sp not in ONLY:
            continue
        clear()
        v, f, eyes, nose = build_mesh(sp)
        print(f'[char] {sp}: field -> {len(v)} verts, {len(f)} quads', flush=True)
        ob = make_object(sp, v, f)
        print(f'[char] {sp}: {len(ob.data.polygons)} faces after decimation', flush=True)
        unwrap(ob)
        names = rig(sp, ob)
        export(sp, ob, names, eyes, nose)
        if PREVIEW:
            os.makedirs(PREVIEW, exist_ok=True)
            objs = [ob]
            for c, r in eyes:
                bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=G2B(c))
                e = bpy.context.active_object
                e.color = (0.05, 0.04, 0.03, 1)
                objs.append(e)
            preview(objs, os.path.join(PREVIEW, f'{sp}_shape.png'))


main()
