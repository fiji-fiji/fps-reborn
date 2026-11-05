# HD materials: the realistic surfaces of the HD world (js/hdworld.js).
#
# Unlike the block textures (one little picture per 1 m block, which is what makes a voxel game
# look like Minecraft), these are real-world materials laid over whole walls and floors at their
# true size: bricks are 25 cm long, cobbles 20 cm, a stone course 50 cm high... and each picture
# covers 1-2 metres before it repeats, so the block grid never shows.
#
# Most are photoscans from Poly Haven (CC0), downloaded once with fetch_polyhaven.py and resized
# here; the rest (Barcelona's flower tiles, Gaudi's hexagons and mosaic, glass, shutters, zinc...)
# are generated from noise and simple shapes. Without the downloads, everything is generated.
# Each material, at 1024 x 1024:
#   <name>_a.webp   colour (sRGB). Neutral where the game tints it (one plaster for every wall colour)
#   <name>_n.webp   R G = surface direction (tangent-space normal), B = height (for the parallax effect)
#   <name>_r.webp   R = roughness, G = tint mask (1 = takes the block's colour), B = cavity (crevices)
# plus assets/hd/materials.json: each material's real size and depth, read by js/hdworld.js.
#
# Image rows run with the texture's v (row 0 = the bottom of the material: upright, like the game
# samples it). Previews (--preview) are flipped back so they look right.
#
# Run with Blender (it has numpy, and saves WebP):
#   blender -b --factory-startup --python tools/hd/make_materials.py
#   blender -b --factory-startup --python tools/hd/make_materials.py -- --only brick,plaster --preview DIR
# --preview DIR writes a shaded contact sheet (DIR/materials_preview.png) to check the look.
# Takes about a minute.

import json, math, os, sys, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pngio import write_png  # noqa: E402

REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, 'assets', 'hd', 'mat')
N = 1024

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ONLY = None
PREVIEW = None
NO_SAVE = '--no-save' in args
NO_SCANS = '--no-scans' in args          # ignore the downloaded scans (generated materials only)
for i, a in enumerate(args):
    if a == '--only':
        ONLY = set(args[i + 1].split(','))
    if a == '--preview':
        PREVIEW = args[i + 1]

# ---------------------------------------------------------------------------------------------
# Tileable helpers (everything wraps around)
# ---------------------------------------------------------------------------------------------
FY, FX = np.meshgrid(np.fft.fftfreq(N) * N, np.fft.fftfreq(N) * N, indexing='ij')   # cycles per tile
YY, XX = np.mgrid[0:N, 0:N].astype(np.float64)


def blur(img, sigma):
    """Gaussian blur (sigma in pixels) that wraps around."""
    if sigma <= 0:
        return img
    k = np.exp(-2 * (np.pi * sigma / N) ** 2 * (FX ** 2 + FY ** 2))
    if img.ndim == 3:
        return np.stack([blur(img[..., c], sigma) for c in range(img.shape[2])], -1)
    return np.real(np.fft.ifft2(np.fft.fft2(img) * k))


def noise(rng, wl, ax=1.0, ay=1.0, angle=0.0):
    """Smooth random lumps about `wl` pixels across, std 1. ax > 1 stretches them along x (long
    streaks along u), ay along y; angle turns the stretch."""
    f0 = N / wl
    c, s = math.cos(angle), math.sin(angle)
    fu = FX * c + FY * s
    fv = -FX * s + FY * c
    k = np.exp(-((fu * ax) ** 2 + (fv * ay) ** 2) / (f0 ** 2))
    k[0, 0] = 0
    n = np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal((N, N))) * k))
    return n / (n.std() + 1e-12)


def fbm(rng, wl, octaves=4, gain=0.5, ax=1.0, ay=1.0):
    out = np.zeros((N, N)); a = 1.0; tot = 0
    for _ in range(octaves):
        out += noise(rng, wl, ax, ay) * a; tot += a * a
        wl /= 2; a *= gain
    return out / math.sqrt(tot)


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def voronoi(rng, cu, cv, jitter=0.85):
    """Wrapped jittered-grid Voronoi with cu x cv cells. Returns f1, f2 (pixels), cell id and the
    offset (pixels) from each pixel to its cell's point."""
    pts = 0.5 + (rng.random((cv, cu, 2)) - 0.5) * jitter
    U = (XX + 0.5) / N * cu; V = (YY + 0.5) / N * cv
    ci = np.floor(U).astype(int); cj = np.floor(V).astype(int)
    su, sv = N / cu, N / cv
    f1 = np.full((N, N), 1e9); f2 = f1.copy(); cid = np.zeros((N, N), int)
    ox = np.zeros((N, N)); oy = np.zeros((N, N))
    for dj in (-1, 0, 1):
        for di in (-1, 0, 1):
            ni = (ci + di) % cu; nj = (cj + dj) % cv
            p = pts[nj, ni]
            dx = (U - (ci + di + p[..., 0])) * su
            dy = (V - (cj + dj + p[..., 1])) * sv
            d = np.sqrt(dx * dx + dy * dy)
            closer = d < f1
            f2 = np.where(closer, f1, np.minimum(f2, d))
            cid = np.where(closer, nj * cu + ni, cid)
            ox = np.where(closer, dx, ox); oy = np.where(closer, dy, oy)
            f1 = np.where(closer, d, f1)
    return f1, f2, cid, ox, oy


def cell_rand(cid, rng, n=None):
    """A random number per cell (same for all its pixels)."""
    m = int(cid.max()) + 1
    return rng.random(m)[cid] if n is None else rng.random((m, n))[cid]


def rows(rng, P, row_h, lengths, shift=None, jitter_rows=0.0):
    """Blocks laid in courses (bricks, stones, setts, planks). P = (width, height) in metres.
    row_h: list of course heights (scaled to fill P[1]); lengths(rng) -> a block length.
    shift(r, rng) -> how far course r is slid along. Returns per-pixel dict: id, du/dv (metres to the
    nearest vertical/horizontal joint), lu/lv (metres from the block's corner), bw/bh (block size)."""
    rh = np.array(row_h, float); rh *= P[1] / rh.sum()
    yb = np.concatenate([[0], np.cumsum(rh)])
    U = (np.arange(N) + 0.5) / N * P[0]
    V = (np.arange(N) + 0.5) / N * P[1]
    out = {k: np.zeros((N, N)) for k in ('du', 'dv', 'lu', 'lv', 'bw', 'bh')}
    bid = np.zeros((N, N), int)
    nid = 0
    for r in range(len(rh)):
        ys = np.where((V >= yb[r]) & (V < yb[r + 1]))[0]
        if len(ys) == 0:
            continue
        ls = []
        while sum(ls) < P[0] * 0.999:
            ls.append(lengths(rng))
        ls = np.array(ls)
        if len(ls) > 1 and ls[-1] < 0.4 * ls[:-1].mean():      # a sliver at the end: merge it
            ls = np.concatenate([ls[:-2], [ls[-2] + ls[-1]]])
        ls *= P[0] / ls.sum()
        xb = np.concatenate([[0], np.cumsum(ls)])
        s = shift(r, rng) if shift else rng.random() * P[0]
        uu = (U - s) % P[0]
        k = np.clip(np.searchsorted(xb, uu, 'right') - 1, 0, len(ls) - 1)
        x0, x1 = xb[k], xb[k + 1]
        lv = V[ys] - yb[r]
        out['du'][ys] = np.minimum(uu - x0, x1 - uu)[None, :]
        out['lu'][ys] = (uu - x0)[None, :]
        out['bw'][ys] = (x1 - x0)[None, :]
        out['dv'][ys] = np.minimum(lv, rh[r] - lv)[:, None]
        out['lv'][ys] = lv[:, None]
        out['bh'][ys] = rh[r]
        bid[ys] = (k + nid)[None, :]
        nid += len(ls)
    out['id'] = bid
    out['d'] = np.minimum(out['du'], out['dv'])
    return out


def per_block(bid, rng, n=1):
    v = rng.random((int(bid.max()) + 1, n))
    return v[bid] if n > 1 else v[bid][..., 0]


def draw_cracks(rng, count, length_px, wander=0.35):
    """Thin random cracks (a mask 0..1), wrapping around."""
    m = np.zeros((N, N))
    for _ in range(count):
        x, y = rng.random() * N, rng.random() * N
        a = rng.random() * math.tau
        for _ in range(int(length_px * 2)):
            a += rng.normal() * wander
            x = (x + math.cos(a) * 0.5) % N; y = (y + math.sin(a) * 0.5) % N
            m[int(y), int(x)] = 1
            if rng.random() < 0.004:                             # a branch now and then
                a += rng.choice([-1, 1]) * 0.9
    return np.clip(blur(m, 0.6) * 3.0, 0, 1)


def rgb(*c):
    return np.array(c, float)


def mix(a, b, t):
    t = np.asarray(t)
    if t.ndim == 2 and np.ndim(a) >= 1 and np.ndim(a) != 2:
        t = t[..., None]
    return a + (b - a) * t


def shade(base, lum):
    """Colour image: base (N,N,3 or 3,) times a brightness field."""
    if base.ndim == 1:
        base = np.broadcast_to(base, (N, N, 3))
    return base * lum[..., None]


# ---------------------------------------------------------------------------------------------
# The materials. Each returns: P (metres across, up), albedo (N,N,3 sRGB 0-255), height (metres),
# rough (0-1), tint mask (0-1), metal (0/1 for the whole material).
# ---------------------------------------------------------------------------------------------
MATS = {}


def material(name):
    def deco(fn):
        MATS[name] = fn
        return fn
    return deco


@material('plaster')
def plaster(rng):
    """Smooth lime render: gentle trowel marks, fine sand, a few hairline cracks. Tinted."""
    P = (2.0, 2.0)
    patch = sstep(-0.3, 0.8, noise(rng, 260))
    trowel = sum(noise(rng, 90, ax=4.0, angle=a) for a in rng.random(3) * math.pi) / 1.7
    h = 0.00035 * fbm(rng, 300, 3) + 0.00028 * trowel * (0.35 + 0.65 * patch) + 0.00006 * noise(rng, 2.0)
    cracks = draw_cracks(rng, 3, 160)
    h -= cracks * 0.0005
    lum = 1 + 0.03 * fbm(rng, 400, 3) + 0.015 * noise(rng, 40) + 0.012 * noise(rng, 3) - 0.18 * cracks
    lum *= 1 - 0.03 * sstep(0.4, 1.0, noise(rng, 120, ay=6.0))       # faint vertical weather streaks
    alb = shade(rgb(243, 239, 231), lum)
    rough = 0.86 + 0.04 * noise(rng, 60) - 0.04 * trowel * patch
    return P, alb, h, rough, 1.0, 0


@material('render')
def render(rng):
    """Rough adobe / clay render: lumpy, with straw and grit. Tinted."""
    P = (2.0, 2.0)
    lumps = fbm(rng, 140, 4)
    grit = noise(rng, 1.5)
    straw = np.clip(sum(np.abs(noise(rng, 6, ax=14.0, angle=a)) for a in rng.random(4) * math.pi) - 3.2, 0, None)
    h = 0.0018 * lumps + 0.0002 * grit + 0.0003 * straw
    lum = 1 + 0.06 * fbm(rng, 300, 3) + 0.04 * noise(rng, 2) + 0.12 * np.clip(straw, 0, 1) - 0.05 * sstep(0.5, 1.5, -lumps)
    alb = shade(rgb(240, 232, 220), lum)
    rough = 0.92 + 0.03 * noise(rng, 30)
    return P, alb, h, rough, 1.0, 0


def stone_courses(rng, P, heights, lmin, lmax, joint, rough_face):
    L = rows(rng, P, heights, lambda r: r.uniform(lmin, lmax))
    d = L['d']
    bt = per_block(L['id'], rng, 4)
    j2 = joint / 2
    edge = sstep(j2, j2 + 0.012, d)                                   # chamfered arris
    pillow = np.sqrt(np.clip(d / 0.08, 0, 1))
    tilt = (bt[..., 0] - 0.5) * 0.004 * (L['lu'] / np.maximum(L['bw'], 1e-3) - 0.5) + \
           (bt[..., 1] - 0.5) * 0.003 * (L['lv'] / np.maximum(L['bh'], 1e-3) - 0.5)
    f1, f2, cid, _, _ = voronoi(rng, 70, 70)
    pits = np.clip(1 - f1 / 3.0, 0, 1) * (cell_rand(cid, rng) < 0.25)
    tooling = noise(rng, 6) * 0.00035 + fbm(rng, 120, 3) * 0.0006 * rough_face
    h = -0.007 * (1 - edge) + edge * (0.0015 * pillow + tilt + tooling - 0.0012 * pits)
    return L, bt, edge, pits, h


@material('ashlar')
def ashlar(rng):
    """Dressed stone in courses of different heights (so the courses never line up with the
    1 m blocks). Neutral warm stone, tinted per block (Paris limestone, Barcelona Gothic stone...)."""
    P = (2.0, 2.0)
    L, bt, edge, pits, h = stone_courses(rng, P, [0.46, 0.54, 0.5, 0.42, 0.58, 0.5], 0.45, 1.05, 0.007, 1.0)
    blk = 1 + (bt[..., 2] - 0.5) * 0.1
    hue = (bt[..., 3] - 0.5) * 0.06
    lum = blk * (1 + 0.035 * fbm(rng, 150, 3) + 0.025 * noise(rng, 3)) - 0.12 * pits
    stone = shade(rgb(236, 230, 218), lum)
    stone[..., 0] *= 1 + hue; stone[..., 2] *= 1 - hue
    stone *= (1 - 0.06 * sstep(0.3, 1.2, noise(rng, 200, ay=5.0)))[..., None]   # weathering runs
    mortar = shade(rgb(214, 208, 196), 1 + 0.05 * noise(rng, 4))
    alb = mix(mortar, stone, edge)
    rough = mix(0.95, 0.84, edge) + 0.04 * noise(rng, 50)
    tint = 0.6 + 0.4 * edge
    return P, alb, h, rough, tint, 0


@material('rubble')
def rubble(rng):
    """Rough rubble stone wall: irregular stones in deep mortar. Tinted."""
    P = (2.0, 2.0)
    f1, f2, cid, ox, oy = voronoi(rng, 11, 15, 0.8)
    e = (f2 - f1) * (P[0] / N)                                       # ~ metres to the stone's edge
    stone = sstep(0.006, 0.03, e)
    cr = cell_rand(cid, rng, 3)
    dome = np.sqrt(np.clip(e / 0.09, 0, 1))
    h = -0.02 + stone * (0.02 + 0.012 * dome + 0.002 * fbm(rng, 30, 3)) + 0.0003 * noise(rng, 2)
    lum = (0.86 + 0.28 * cr[..., 0]) * (1 + 0.06 * fbm(rng, 40, 3))
    st = shade(rgb(226, 220, 208), lum)
    st[..., 0] *= 1 + (cr[..., 1] - 0.5) * 0.12; st[..., 2] *= 1 - (cr[..., 1] - 0.5) * 0.12
    mortar = shade(rgb(196, 188, 172), 1 + 0.08 * noise(rng, 3))
    alb = mix(mortar, st, stone)
    rough = mix(0.97, 0.86, stone)
    return P, alb, h, rough, 0.5 + 0.5 * stone, 0


@material('brick')
def brick(rng):
    """Red brick in running bond, 25 x 7.7 cm courses, recessed mortar, per-brick colour."""
    P = (2.0, 2.0)
    L = rows(rng, P, [1] * 26, lambda r: 0.25, shift=lambda r, g: (0.125 if r % 2 else 0.0) + g.normal() * 0.004)
    d = L['d']
    edge = sstep(0.0045, 0.009, d + 0.0012 * noise(rng, 3))                 # slightly chipped arrises
    bt = per_block(L['id'], rng, 4)
    face = 0.0005 * fbm(rng, 20, 3) + 0.00025 * noise(rng, 1.5)
    h = -0.006 * (1 - edge) + edge * (face + (bt[..., 0] - 0.5) * 0.0015)
    base = rgb(176, 84, 58)
    lum = (0.78 + 0.36 * bt[..., 1]) * (1 + 0.07 * fbm(rng, 25, 3) + 0.05 * noise(rng, 2))
    br = shade(base, lum)
    burnt = (bt[..., 2] < 0.12)[..., None]
    br = np.where(burnt, br * rgb(0.55, 0.5, 0.52), br)
    br[..., 1] *= 1 + (bt[..., 3] - 0.5) * 0.25                      # oranger / redder
    mortar = shade(rgb(196, 190, 178), 1 + 0.08 * noise(rng, 2.5))
    alb = mix(mortar, br, edge)
    alb *= (1 - 0.08 * sstep(0.2, 1.2, noise(rng, 180, ay=5.0)))[..., None]
    rough = mix(0.95, 0.82, edge) + 0.03 * noise(rng, 30)
    return P, alb, h, rough, 0.35, 0


@material('cobble')
def cobble(rng):
    """Granite setts in rows (old-town streets): domed, worn smooth on top, dirt in the joints."""
    P = (2.0, 2.0)
    L = rows(rng, P, [1] * 13, lambda r: r.uniform(0.15, 0.24), jitter_rows=0)
    d = L['d']
    j = 0.007 + 0.003 * noise(rng, 20)
    edge = sstep(j, j + 0.02, d + 0.002 * noise(rng, 4))
    bt = per_block(L['id'], rng, 4)
    cu = (L['lu'] / L['bw'] - 0.5) * 2; cv = (L['lv'] / L['bh'] - 0.5) * 2
    dome = 1 - np.clip(cu * cu * 0.6 + cv * cv * 0.6, 0, 1)
    h = -0.012 * (1 - edge) + edge * (0.004 * dome + (bt[..., 0] - 0.5) * 0.003 + 0.0004 * noise(rng, 3))
    speck = np.clip(noise(rng, 1.2) * 0.8, -1.2, 1.2)
    lum = (0.86 + 0.22 * bt[..., 1]) * (1 + 0.05 * speck + 0.04 * noise(rng, 30))
    g = shade(rgb(192, 188, 180), lum)
    g[..., 2] *= 1 + (bt[..., 2] - 0.5) * 0.12; g[..., 0] *= 1 - (bt[..., 2] - 0.5) * 0.06
    dirt = shade(rgb(92, 84, 72), 1 + 0.15 * noise(rng, 4))
    alb = mix(dirt, g, edge)
    rough = mix(0.98, 0.78, edge) - 0.18 * dome * edge
    return P, alb, h, rough, 0.45 * edge, 0


@material('panot')
def panot(rng):
    """Barcelona pavement: 20 cm grey cement tiles with the four-petal flower (the 'flor de
    Barcelona') pressed in, fine joints, worn and dirty in the grooves."""
    P = (1.0, 1.0)
    T = 0.2
    U = (XX + 0.5) / N * P[0]; V = (YY + 0.5) / N * P[1]
    a = (U % T) - T / 2; b = (V % T) - T / 2
    r0 = 0.032
    groove = np.zeros((N, N))
    def ring(cx, cy, r, w=0.0028):
        dd = np.abs(np.sqrt((a - cx) ** 2 + (b - cy) ** 2) - r)
        return 1 - sstep(w * 0.5, w, dd)
    for cx, cy in ((r0, 0), (-r0, 0), (0, r0), (0, -r0)):
        groove = np.maximum(groove, ring(cx, cy, r0))
    for cx, cy in ((T / 2, T / 2), (-T / 2, T / 2), (T / 2, -T / 2), (-T / 2, -T / 2)):
        groove = np.maximum(groove, ring(cx, cy, 0.055))
    jd = np.minimum(T / 2 - np.abs(a), T / 2 - np.abs(b))
    joint = 1 - sstep(0.001, 0.0025, jd)
    tid = (np.floor(U / T) + np.floor(V / T) * 13).astype(int)
    tr = per_block(tid, rng, 3)
    h = -0.0018 * groove - 0.003 * joint + 0.0004 * fbm(rng, 60, 3) + 0.00015 * noise(rng, 1.5) + (tr[..., 0] - 0.5) * 0.0008
    lum = (0.93 + 0.12 * tr[..., 1]) * (1 + 0.05 * fbm(rng, 200, 3) + 0.04 * noise(rng, 2)) - 0.18 * groove - 0.35 * joint
    alb = shade(rgb(226, 224, 218), lum)
    rough = 0.82 - 0.1 * sstep(0, 1, fbm(rng, 150, 2)) + 0.12 * groove
    return P, alb, h, rough, 0.75, 0


@material('slabs')
def slabs(rng):
    """Big stone paving flags (plazas): rows of 50 cm, random lengths, fine joints."""
    P = (2.0, 2.0)
    L = rows(rng, P, [1] * 4, lambda r: r.choice([0.5, 0.75, 1.0]))
    d = L['d']
    edge = sstep(0.002, 0.006, d)
    bt = per_block(L['id'], rng, 3)
    h = -0.004 * (1 - edge) + edge * (0.0006 * fbm(rng, 80, 3) + (bt[..., 0] - 0.5) * 0.0015 + 0.00015 * noise(rng, 1.5))
    lum = (0.9 + 0.16 * bt[..., 1]) * (1 + 0.05 * fbm(rng, 120, 3) + 0.03 * noise(rng, 2.5))
    s = shade(rgb(236, 232, 224), lum)
    s[..., 0] *= 1 + (bt[..., 2] - 0.5) * 0.06
    alb = mix(shade(rgb(150, 144, 132), np.ones((N, N))), s, edge)
    rough = mix(0.95, 0.8, edge) + 0.04 * noise(rng, 50)
    return P, alb, h, rough, 0.7 * edge + 0.3, 0


@material('hextile')
def hextile(rng):
    """Gaudi's hexagonal pavement tiles with a sea-shell swirl pressed in."""
    s = 0.13                                                           # hexagon side
    P = (3 * s * 3, math.sqrt(3) * s * 5)
    U = (XX + 0.5) / N * P[0]; V = (YY + 0.5) / N * P[1]
    # nearest hexagon centre (two offset rectangular lattices)
    best = np.full((N, N), 1e9); hx = np.zeros((N, N)); hy = np.zeros((N, N))
    for ox, oy in ((0, 0), (1.5 * s, math.sqrt(3) / 2 * s)):
        cx = np.round((U - ox) / (3 * s)) * 3 * s + ox
        cy = np.round((V - oy) / (math.sqrt(3) * s)) * math.sqrt(3) * s + oy
        dd = (U - cx) ** 2 + (V - cy) ** 2
        better = dd < best
        best = np.where(better, dd, best); hx = np.where(better, U - cx, hx); hy = np.where(better, V - cy, hy)
    r = np.sqrt(hx * hx + hy * hy); th = np.arctan2(hy, hx)
    # distance to the hexagon's edge (flat-topped: its edges face 30, 90 and 150 degrees)
    ed = s * math.sqrt(3) / 2 - np.max(np.stack([np.abs(hx * math.cos(k * math.pi / 3 + math.pi / 6) + hy * math.sin(k * math.pi / 3 + math.pi / 6)) for k in range(3)]), 0)
    joint = 1 - sstep(0.001, 0.003, ed)
    spiral = np.sin(r / 0.012 * math.tau / 2.2 - th * 2) * sstep(0.095, 0.06, r)
    h = 0.0012 * spiral - 0.003 * joint + 0.0003 * fbm(rng, 60, 3)
    lum = (1 + 0.04 * fbm(rng, 150, 3) + 0.03 * noise(rng, 2)) + 0.06 * spiral - 0.3 * joint
    alb = shade(rgb(226, 230, 226), lum)
    rough = 0.72 + 0.06 * noise(rng, 40) - 0.05 * spiral
    return P, alb, h, rough, 0.85, 0


@material('rasilla')
def rasilla(rng):
    """Flat roof terrace: terracotta tiles 28 x 14 cm, weathered, a little moss in the joints."""
    P = (2.0, 2.0)
    L = rows(rng, P, [1] * 14, lambda r: 2.0 / 7, shift=lambda r, g: (1.0 / 7 if r % 2 else 0.0))
    d = L['d']
    edge = sstep(0.003, 0.008, d)
    bt = per_block(L['id'], rng, 3)
    h = -0.005 * (1 - edge) + edge * (0.0006 * fbm(rng, 30, 3) + (bt[..., 0] - 0.5) * 0.002)
    lum = (0.8 + 0.32 * bt[..., 1]) * (1 + 0.08 * fbm(rng, 40, 3) + 0.05 * noise(rng, 2))
    t = shade(rgb(196, 102, 66), lum)
    t[..., 1] *= 1 + (bt[..., 2] - 0.5) * 0.2
    stain = sstep(0.4, 1.4, fbm(rng, 260, 3))
    t = mix(t, t * rgb(0.62, 0.62, 0.6), stain * 0.6)
    moss = shade(rgb(110, 110, 70), 1 + 0.2 * noise(rng, 3))
    alb = mix(mix(moss, rgb(170, 160, 140), 0.5), t, edge)
    rough = mix(0.95, 0.8, edge)
    return P, alb, h, rough, 0.25, 0


@material('zinc')
def zinc(rng):
    """Paris roofs: zinc sheet with standing seams every 50 cm, dull and streaky. Slightly metal."""
    P = (2.0, 2.0)
    U = (XX + 0.5) / N * P[0]
    sd = np.abs(((U + 0.25) % 0.5) - 0.25)                             # distance to a seam
    seam = 1 - sstep(0.004, 0.012, sd)
    oil = noise(rng, 220, ay=0.3) * 0.0012                              # panels a bit wavy across
    h = 0.012 * seam + oil + 0.00008 * noise(rng, 1.5)
    lum = 1 + 0.08 * fbm(rng, 240, 3, ay=4.0) + 0.04 * noise(rng, 3) + 0.08 * seam
    lum += 0.12 * sstep(0.6, 1.6, noise(rng, 50, ax=0.12))             # whitish run-off streaks
    alb = shade(rgb(214, 220, 226), lum)
    rough = 0.42 + 0.1 * fbm(rng, 120, 2) - 0.08 * seam
    return P, alb, h, rough, 0.6, 0.55


@material('planks')
def planks(rng):
    """Weathered deck boards, 14 cm wide, random lengths, wood grain along them, gaps between."""
    P = (2.0, 2.0)
    L = rows(rng, P, [1] * 14, lambda r: r.uniform(0.9, 2.0))
    gap_v = sstep(0.0015, 0.004, L['dv'])
    gap_u = sstep(0.001, 0.003, L['du'])
    edge = gap_v * gap_u
    bt = per_block(L['id'], rng, 4)
    grain = noise(rng, 5, ax=26.0) * 0.7 + noise(rng, 18, ax=10.0) * 0.5
    knots = np.zeros((N, N))
    for _ in range(10):
        kx, ky = rng.random() * N, rng.random() * N
        dx = np.minimum(np.abs(XX - kx), N - np.abs(XX - kx)); dy = np.minimum(np.abs(YY - ky), N - np.abs(YY - ky))
        knots = np.maximum(knots, np.exp(-((dx / 9) ** 2 + (dy / 5) ** 2)))
    h = -0.004 * (1 - edge) + edge * (0.00035 * grain + (bt[..., 0] - 0.5) * 0.0012 - 0.0006 * knots +
                                      0.0008 * np.sin(np.clip(L['lv'] / L['bh'], 0, 1) * math.pi))   # cupped boards
    lum = (0.8 + 0.3 * bt[..., 1]) * (1 + 0.1 * grain + 0.05 * fbm(rng, 80, 3)) - 0.3 * knots
    w = shade(rgb(214, 182, 138), lum)
    w = mix(w, w.mean(-1, keepdims=True) * rgb(1.02, 1.0, 0.97), 0.35 * bt[..., 2])   # some greyed by the sun
    alb = mix(shade(rgb(50, 40, 30), np.ones((N, N))), w, edge)
    rough = mix(0.95, 0.74, edge) + 0.04 * grain
    return P, alb, h, rough, 0.55, 0


@material('crate')
def crate(rng):
    """Packing-crate wood: narrow planks with a heavy frame round each 1 m face."""
    P = (1.0, 1.0)
    L = rows(rng, P, [1] * 6, lambda r: 1.0, shift=lambda r, g: 0.0)
    U = (XX + 0.5) / N; V = (YY + 0.5) / N
    fd = np.minimum(np.minimum(U, 1 - U), np.minimum(V, 1 - V))
    frame = sstep(0.115, 0.105, fd)
    diag = np.abs(U - V) < 0.06
    brace = np.where(diag & (fd > 0.1), 1.0, 0.0)
    brace = blur(brace, 1.0)
    grain = noise(rng, 5, ax=26.0) * 0.6 + noise(rng, 16, ax=8.0) * 0.4
    grain_v = noise(rng, 5, ay=26.0) * 0.6
    gap = sstep(0.001, 0.004, L['dv'])
    bt = per_block(L['id'], rng, 2)
    fe = sstep(0.0, 0.006, np.abs(fd - 0.11)) * sstep(0.0, 0.004, fd)
    h = (-0.003 * (1 - gap) + 0.0003 * grain) * (1 - frame) + frame * (0.012 + 0.0003 * grain_v) * fe + brace * 0.01 * (1 - frame)
    lum = (0.85 + 0.25 * bt[..., 1]) * (1 + 0.1 * grain) * (1 - frame) + frame * (0.82 + 0.1 * grain_v) - 0.25 * (1 - gap) * (1 - frame)
    alb = shade(rgb(214, 172, 116), lum)
    rough = 0.78 + 0.05 * grain
    return P, alb, h, rough, 0.6, 0


@material('sand')
def sand(rng):
    """Beach sand: soft wind ripples and grains."""
    P = (2.0, 2.0)
    warp = noise(rng, 200) * 18
    rip = np.sin((YY + warp + noise(rng, 90) * 4) / N * math.tau * 34)
    rip = rip * sstep(-0.6, 0.6, noise(rng, 250))
    h = 0.0015 * rip + 0.002 * fbm(rng, 200, 3) + 0.00012 * noise(rng, 1.2)
    lum = 1 + 0.04 * fbm(rng, 250, 3) + 0.06 * noise(rng, 1.2) + 0.015 * rip
    alb = shade(rgb(232, 222, 196), lum)
    rough = 0.95 + 0.02 * noise(rng, 20)
    return P, alb, h, rough, 0.85, 0


@material('gravel')
def gravel(rng):
    """Park gravel: small rounded pebbles of mixed stone."""
    P = (1.0, 1.0)
    f1, f2, cid, ox, oy = voronoi(rng, 46, 46, 0.95)
    e = f2 - f1
    peb = sstep(1.0, 4.0, e)
    cr = cell_rand(cid, rng, 3)
    dome = np.sqrt(np.clip(e / 9.0, 0, 1))
    h = -0.005 + peb * (0.003 + 0.004 * dome * (0.6 + 0.6 * cr[..., 0]))
    lum = (0.7 + 0.5 * cr[..., 1]) * (1 + 0.06 * noise(rng, 2))
    st = shade(rgb(222, 214, 198), lum)
    st[..., 0] *= 1 + (cr[..., 2] - 0.5) * 0.2; st[..., 2] *= 1 - (cr[..., 2] - 0.5) * 0.2
    alb = mix(shade(rgb(120, 108, 92), np.ones((N, N))), st, peb)
    rough = mix(0.98, 0.7, peb)
    return P, alb, h, rough, 0.6, 0


@material('grass')
def grass(rng):
    """Short lawn: lots of little blades in every direction, darker at the roots."""
    P = (1.5, 1.5)
    blades = np.zeros((N, N))
    for a in rng.random(7) * math.pi:
        blades += np.clip(noise(rng, 2.2, ax=7.0, angle=a), 0, None)
    blades /= blades.max()
    clump = fbm(rng, 120, 3)
    h = 0.006 * blades + 0.003 * clump
    lum = 0.55 + 0.75 * blades + 0.08 * clump
    alb = shade(rgb(150, 200, 110), lum)
    alb[..., 0] *= 1 + 0.25 * sstep(0.5, 1.5, noise(rng, 80))        # a few dry patches
    rough = 0.9 - 0.15 * blades
    return P, alb, h, rough, 0.7, 0


@material('dirt')
def dirt(rng):
    """Packed earth with small stones."""
    P = (2.0, 2.0)
    f1, f2, cid, _, _ = voronoi(rng, 60, 60)
    stones = (cell_rand(cid, rng) < 0.18) * np.sqrt(np.clip((f2 - f1) / 6.0, 0, 1))
    h = 0.004 * fbm(rng, 160, 4) + 0.003 * stones + 0.0003 * noise(rng, 1.5)
    lum = 1 + 0.12 * fbm(rng, 200, 3) + 0.08 * noise(rng, 2) + 0.25 * stones
    alb = shade(rgb(196, 170, 140), lum)
    rough = 0.96 - 0.1 * stones
    return P, alb, h, rough, 0.8, 0


@material('foliage')
def foliage(rng):
    """A dense hedge / leafy mass: overlapping leaves, each lit like a little dome."""
    P = (1.0, 1.0)
    h = np.zeros((N, N)); lum = np.zeros((N, N)) + 0.25; tone = np.zeros((N, N))
    for size, depth in ((26, 0.0), (17, 0.012), (12, 0.022)):
        f1, f2, cid, ox, oy = voronoi(rng, size, size, 1.0)
        cr = cell_rand(cid, rng, 2)
        leaf = sstep(0.5, 3.0, f2 - f1) * (cr[..., 0] < 0.8)
        dome = np.clip(1 - f1 / (N / size * 0.7), 0, 1)
        lh = depth + 0.01 * dome
        on = leaf * (lh > h)
        h = np.where(on > 0.5, lh, h)
        lum = np.where(on > 0.5, 0.65 + 0.5 * dome + 0.2 * (oy / (N / size)), lum)
        tone = np.where(on > 0.5, cr[..., 1], tone)
    alb = shade(rgb(176, 220, 140), lum)
    alb[..., 0] *= 1 + (tone - 0.5) * 0.35
    rough = 0.7 + 0.15 * noise(rng, 20)
    return P, alb, h * 0.6, rough, 0.75, 0


@material('bark')
def bark(rng):
    """Tree bark: deep vertical fissures."""
    P = (1.0, 1.0)
    ridges = 1 - np.abs(noise(rng, 40, ay=10.0) * 0.6)
    ridges = np.clip(ridges, 0, 1) ** 1.5
    h = 0.006 * ridges + 0.001 * fbm(rng, 40, 3, ay=4.0)
    lum = 0.7 + 0.4 * ridges + 0.06 * noise(rng, 3, ay=3.0)
    alb = shade(rgb(196, 182, 160), lum)
    rough = 0.92
    return P, alb, h, rough, 0.8, 0


@material('palmbark')
def palmbark(rng):
    """Palm trunk (used when the scan isn't downloaded): the bark texture."""
    return bark(rng)


@material('paint')
def paint(rng):
    """Painted metal / wood (railings, posts, shopfronts): smooth gloss paint, faint brush
    marks, the odd chip. Tinted."""
    P = (1.0, 1.0)
    brush = noise(rng, 8, ay=12.0) * 0.5 + noise(rng, 40) * 0.3
    f1, f2, cid, _, _ = voronoi(rng, 30, 30)
    chips = (cell_rand(cid, rng) < 0.012) * sstep(6, 2, f1)
    h = 0.00008 * brush + 0.0002 * fbm(rng, 100, 2) - 0.0004 * chips
    lum = 1 + 0.02 * brush + 0.03 * fbm(rng, 200, 2)
    alb = shade(rgb(240, 240, 240), lum)
    alb = mix(alb, rgb(70, 64, 60), chips)
    rough = 0.38 + 0.05 * brush + 0.4 * chips
    return P, alb, h, rough, 1 - chips, 0


@material('gold')
def gold(rng):
    """Hammered gilding: small dents that catch the light. Metal, coloured by the block."""
    P = (1.0, 1.0)
    f1, f2, cid, _, _ = voronoi(rng, 42, 42, 0.9)
    dent = (f1 / (N / 42)) ** 2
    h = 0.0012 * dent + 0.0002 * fbm(rng, 80, 2)
    lum = 1 + 0.06 * noise(rng, 30) - 0.05 * dent
    alb = shade(rgb(250, 250, 250), lum)
    rough = 0.2 + 0.08 * fbm(rng, 60, 2) + 0.05 * dent
    return P, alb, h, rough, 1.0, 1


@material('canvas')
def canvas(rng):
    """Awning canvas: fine weave, wide stripes (the coloured ones take the block's colour)."""
    P = (1.0, 1.0)
    U = (XX + 0.5) / N
    stripe = sstep(-0.04, 0.04, np.sin(U / 0.5 * math.tau))             # 25 cm stripes
    wv = np.sin(XX / N * math.tau * 340) * np.sin(YY / N * math.tau * 340)
    h = 0.00012 * wv + 0.0006 * fbm(rng, 200, 2)
    lum = 1 + 0.03 * wv + 0.04 * fbm(rng, 200, 2)
    cream = shade(rgb(246, 238, 224), lum)
    col = shade(rgb(250, 250, 250), lum)
    alb = mix(cream, col, stripe)
    rough = 0.9 + 0.03 * wv
    return P, alb, h, rough, stripe, 0


@material('mosaic')
def mosaic(rng):
    """Gaudi's trencadis: broken tiles in white grout, every shard tilted a little differently
    so they glitter."""
    P = (1.0, 1.0)
    f1, f2, cid, ox, oy = voronoi(rng, 15, 15, 1.0)                    # shards of 5-9 cm
    e = f2 - f1
    shard = sstep(2.0, 4.5, e + 1.2 * noise(rng, 6))                  # broken, uneven edges
    cr = cell_rand(cid, rng, 5)
    tilt = ((cr[..., 0] - 0.5) * ox + (cr[..., 1] - 0.5) * oy) * (1.0 / N) * 0.08
    h = -0.003 + shard * (0.003 + tilt) + 0.00004 * noise(rng, 1.2)
    # mostly white and cream with blue, then yellow, green, orange (like the Park Guell bench)
    pal = np.array([[246, 244, 236], [236, 228, 206], [40, 92, 168], [96, 150, 206], [244, 200, 70],
                    [92, 160, 96], [222, 110, 62], [72, 176, 184]], float)
    wts = np.array([0.28, 0.12, 0.16, 0.1, 0.12, 0.1, 0.06, 0.06])
    pick = np.searchsorted(np.cumsum(wts) / wts.sum(), cr[..., 2])
    c = pal[np.clip(pick, 0, len(pal) - 1)] * (0.9 + 0.16 * cr[..., 3])[..., None]
    c *= (1 + 0.05 * noise(rng, 30))[..., None]                       # glaze not quite even
    grout = shade(rgb(214, 210, 200), 1 + 0.06 * noise(rng, 2))
    alb = mix(grout, c, shard)
    rough = mix(0.9, 0.12 + 0.12 * cr[..., 4], shard)
    return P, alb, h, rough, 0.0, 0


@material('glass')
def glass(rng):
    """Stained glass: coloured panes in lead lines."""
    P = (2.0, 2.0)
    f1, f2, cid, _, _ = voronoi(rng, 12, 12, 0.7)
    U = (XX + 0.5) / N * P[0]; V = (YY + 0.5) / N * P[1]
    frame = np.minimum(np.abs(((U + 0.25) % 0.5) - 0.25), np.abs(((V + 0.25) % 0.5) - 0.25))
    lead = np.maximum(1 - sstep(1.0, 2.5, f2 - f1), 1 - sstep(0.004, 0.008, frame))
    cr = cell_rand(cid, rng, 2)
    pal = np.array([[60, 120, 200], [240, 190, 70], [210, 70, 70], [90, 170, 110], [140, 190, 230], [250, 230, 170]], float)
    c = pal[(cr[..., 0] * len(pal)).astype(int)] * (0.85 + 0.25 * cr[..., 1])[..., None]
    c *= (1 + 0.08 * noise(rng, 20))[..., None]
    alb = mix(c, rgb(50, 52, 56), lead)
    h = 0.003 * lead + 0.0004 * noise(rng, 30)
    rough = mix(0.06, 0.6, lead)
    return P, alb, h, rough, 0.0, 0


@material('clearglass')
def clearglass(rng):
    """Window glass: dark (a room behind it), very smooth, the faint waviness of old glass."""
    P = (1.0, 1.0)
    h = 0.0003 * noise(rng, 300, ay=3.0) + 0.00005 * noise(rng, 60)
    lum = 1 + 0.08 * fbm(rng, 300, 3)
    alb = shade(rgb(250, 250, 250), lum)
    rough = 0.04 + 0.02 * noise(rng, 200)
    return P, alb, h, rough, 1.0, 0


@material('louver')
def louver(rng):
    """Louvred shutter: slats 5 cm apart, each tilted so it sheds rain, painted. Tinted."""
    P = (1.0, 1.0)
    V = (YY + 0.5) / N
    s = (V % 0.05) / 0.05                                              # 0 at a slat's bottom .. 1 at its top
    h = 0.006 * s - 0.006 * sstep(0.85, 1.0, s)                       # a ramp, then the gap
    wood = noise(rng, 6, ax=20.0)
    h += 0.0002 * wood
    lum = (0.7 + 0.35 * s) * (1 + 0.04 * wood + 0.03 * fbm(rng, 200, 2)) - 0.45 * sstep(0.88, 1.0, s)
    alb = shade(rgb(244, 244, 240), lum)
    rough = 0.55 + 0.05 * wood
    return P, alb, h, rough, 1.0, 0


@material('concrete')
def concrete(rng):
    """Smooth cast concrete with small air holes. Tinted."""
    P = (2.0, 2.0)
    f1, f2, cid, _, _ = voronoi(rng, 50, 50)
    holes = (cell_rand(cid, rng) < 0.1) * sstep(3.0, 1.0, f1)
    h = 0.0005 * fbm(rng, 200, 3) + 0.0001 * noise(rng, 1.5) - 0.0015 * holes
    lum = 1 + 0.06 * fbm(rng, 260, 3) + 0.04 * noise(rng, 2) - 0.3 * holes
    alb = shade(rgb(236, 234, 228), lum)
    rough = 0.82 + 0.05 * noise(rng, 40)
    return P, alb, h, rough, 0.9, 0


@material('sandstone')
def sandstone(rng):
    """Desert sandstone / adobe: soft, wind-worn, with faint broad layers and pitting. Tinted."""
    P = (2.0, 2.0)
    layers = noise(rng, 110, ax=5.0) + 0.6 * noise(rng, 260, ax=3.0)
    f1, f2, cid, _, _ = voronoi(rng, 40, 40)
    pits = (cell_rand(cid, rng) < 0.12) * sstep(4.0, 1.5, f1)
    h = 0.0009 * layers + 0.0018 * fbm(rng, 180, 4) + 0.00025 * noise(rng, 1.5) - 0.0012 * pits
    lum = 1 + 0.02 * layers + 0.045 * fbm(rng, 220, 3) + 0.035 * noise(rng, 2) - 0.12 * pits
    alb = shade(rgb(242, 232, 214), lum)
    rough = 0.93
    return P, alb, h, rough, 0.9, 0


# ---------------------------------------------------------------------------------------------
# Photoscanned materials (Poly Haven, CC0), downloaded by fetch_polyhaven.py into tools/hd/cache/.
# Each keeps its real size. tint: how much the block's colour applies (1 = all of it: the scan's
# average becomes the block's colour, its natural variation kept); desat: take the colour out
# first; depth: how deep its relief really is (metres, for the parallax). Without the cache, the
# generated versions above are used instead.
# ---------------------------------------------------------------------------------------------
SCAN_CFG = {
    'plaster':   dict(tint=1.0, desat=0.8, depth=0.003),
    'render':    dict(tint=1.0, desat=0.6, depth=0.012),
    'ashlar':    dict(tint=0.9, desat=0.7, depth=0.02),
    'rubble':    dict(tint=0.6, desat=0.4, depth=0.04),
    'brick':     dict(tint=0.0, desat=0.0, depth=0.015),
    'cobble':    dict(tint=0.5, desat=0.3, depth=0.025),
    'slabs':     dict(tint=0.8, desat=0.6, depth=0.008),
    'rasilla':   dict(tint=0.0, desat=0.0, depth=0.008),
    'planks':    dict(tint=0.0, desat=0.0, depth=0.01),
    'gravel':    dict(tint=0.5, desat=0.3, depth=0.015),
    'grass':     dict(tint=0.5, desat=0.0, depth=0.02),
    'dirt':      dict(tint=0.6, desat=0.2, depth=0.02),
    'bark':      dict(tint=0.6, desat=0.3, depth=0.02),
    'palmbark':  dict(tint=0.4, desat=0.2, depth=0.025),
    'concrete':  dict(tint=0.9, desat=0.8, depth=0.004),
    'sandstone': dict(tint=0.9, desat=0.5, depth=0.015),
}
CACHE = os.path.join(HERE, 'cache')
SCANS = json.load(open(os.path.join(CACHE, 'scans.json'))) if os.path.exists(os.path.join(CACHE, 'scans.json')) else {}


def load_map(path, gray=False):
    """An image from the cache as floats 0..1, N x N, rows bottom-up (= our v), raw values."""
    import bpy
    img = bpy.data.images.load(path)
    img.colorspace_settings.name = 'Non-Color'
    if img.size[0] != N or img.size[1] != N:
        img.scale(N, N)
    px = np.array(img.pixels[:], np.float32).reshape(N, N, 4)
    bpy.data.images.remove(img)
    return px[..., 0] if gray else px[..., :3]


def scan_material(name):
    info, cfg = SCANS[name], SCAN_CFG[name]
    d = os.path.join(CACHE, info['asset'])
    path = lambda k: next((os.path.join(d, f) for f in os.listdir(d) if f.startswith(k + '.')), None)
    P = (info['size_m'][0], info['size_m'][1])
    alb = load_map(path('diff')) * 255.0
    if cfg['desat']:
        l = alb @ np.array([0.299, 0.587, 0.114])
        alb = alb + (l[..., None] - alb) * cfg['desat']
    disp = load_map(path('disp'), gray=True) if path('disp') else np.zeros((N, N))
    h = (disp - disp.mean()) * cfg['depth']
    rough = load_map(path('rough'), gray=True) if path('rough') else np.full((N, N), 0.8)
    nrm = load_map(path('nor')) * 2 - 1 if path('nor') else None
    return P, alb, h, rough, cfg['tint'], 0, nrm


# ---------------------------------------------------------------------------------------------
# Derived maps and output
# ---------------------------------------------------------------------------------------------
def normals(h, P):
    dx, dy = P[0] / N, P[1] / N
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * dx)
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / (2 * dy)
    n = np.stack([-gx, -gy, np.ones_like(h)], -1)
    return n / np.linalg.norm(n, axis=-1, keepdims=True)


def cavity(h, P):
    """How tucked-in each pixel is (1 = open, lower in crevices), from the height map."""
    px = P[0] / N
    occ = np.zeros_like(h)
    for s in (1.5, 4, 10, 24):
        occ += np.clip((blur(h, s) - h) / (s * px), 0, None)
    return np.exp(-occ * 1.6)


def save_webp(path, arr, quality):
    import bpy
    hgt, w = arr.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), w, hgt, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    px = np.ones((hgt, w, 4), np.float32)
    px[..., :3] = arr[::-1] / 255.0          # Blender's rows run bottom-up: the file keeps our row order
    img.pixels.foreach_set(px.ravel())
    img.file_format = 'WEBP'
    img.filepath_raw = path
    img.save(filepath=path, quality=quality)
    bpy.data.images.remove(img)


def to8(x):
    return np.clip(x + 0.5, 0, 255).astype(np.uint8)


def main():
    t0 = time.time()
    os.makedirs(OUT, exist_ok=True)
    manifest_path = os.path.join(REPO, 'assets', 'hd', 'materials.json')
    manifest = {}
    if os.path.exists(manifest_path):
        manifest = json.load(open(manifest_path)).get('materials', {})
    previews = []
    light = np.array([-0.5, 0.45, 0.74]); light /= np.linalg.norm(light)
    for idx, (name, fn) in enumerate(MATS.items()):
        if ONLY and name not in ONLY:
            continue
        rng = np.random.default_rng(4000 + idx * 17)
        source = 'generated'
        if name in SCANS and name in SCAN_CFG and not NO_SCANS:
            P, alb, h, rough, tint, metal, nrm = scan_material(name)
            source = 'Poly Haven: ' + SCANS[name]['asset']
            h = np.asarray(h, float)
            cav = cavity(h, P)
            alb = np.clip(alb, 0, 255) * (0.85 + 0.15 * cav)[..., None]  # (the photo already has its shading)
        else:
            P, alb, h, rough, tint, metal = fn(rng)
            h = np.asarray(h, float)
            nrm = normals(h, P)
            cav = cavity(h, P)
            alb = np.clip(alb, 0, 255) * (0.55 + 0.45 * cav)[..., None]  # crevices are darker
        tint = np.broadcast_to(np.asarray(tint, float), (N, N))
        rough = np.clip(np.broadcast_to(np.asarray(rough, float), (N, N)), 0.02, 1)
        lo, hi = float(h.min()), float(h.max())
        hn = (h - lo) / max(hi - lo, 1e-9)
        # mean linear colour of the tinted part (the game divides it out so tints keep their colour)
        lin = ((alb / 255.0 + 0.055) / 1.055) ** 2.4
        wts = tint.ravel() + 1e-6
        mean = (lin.reshape(-1, 3) * wts[:, None]).sum(0) / wts.sum()
        avg = lin.reshape(-1, 3).mean(0)
        manifest[name] = dict(period=[round(P[0], 4), round(P[1], 4)], depth=round(hi - lo, 5), metal=metal, source=source,
                              tintMean=[round(float(v), 4) for v in mean], avg=[round(float(v), 4) for v in avg])
        if not NO_SAVE:
            save_webp(os.path.join(OUT, f'{name}_a.webp'), to8(alb), 90)
            save_webp(os.path.join(OUT, f'{name}_n.webp'), to8(np.concatenate([(nrm[..., :2] * 0.5 + 0.5) * 255, hn[..., None] * 255], -1)), 94)
            save_webp(os.path.join(OUT, f'{name}_r.webp'), to8(np.stack([rough, tint, cav], -1) * 255), 92)
        if PREVIEW:
            sh = np.clip(nrm @ light, 0, 1) * 0.8 + 0.3
            spec = np.clip(nrm @ (light + np.array([0, 0, 1])) / np.linalg.norm(light + np.array([0, 0, 1])), 0, 1) ** (2 / max(rough.mean(), 0.05) ** 2 * 2) * (1 - rough) * 120
            img = np.clip(alb * sh[..., None] + spec[..., None], 0, 255)[::-1]
            previews.append((name, img[::4, ::4].astype(np.uint8)))
        print(f'[materials] {name:10s} {P[0]:.2f}x{P[1]:.2f} m, depth {(hi - lo) * 1000:5.1f} mm  {time.time() - t0:5.1f}s', flush=True)
    if not NO_SAVE or not ONLY:
        json.dump({'size': N, 'materials': manifest}, open(manifest_path, 'w'), indent=1)
    if PREVIEW and previews:
        cols = min(6, len(previews)); rws = (len(previews) + cols - 1) // cols
        s = N // 4
        sheet = np.zeros((rws * s, cols * s, 3), np.uint8)
        for k, (_, p) in enumerate(previews):
            r_, c_ = divmod(k, cols)
            sheet[r_ * s:(r_ + 1) * s, c_ * s:(c_ + 1) * s] = p
        os.makedirs(PREVIEW, exist_ok=True)
        write_png(os.path.join(PREVIEW, 'materials_preview.png'), sheet)
        print('[materials] preview order:', ', '.join(n for n, _ in previews))
    print(f'[materials] done in {time.time() - t0:.0f}s')


main()
