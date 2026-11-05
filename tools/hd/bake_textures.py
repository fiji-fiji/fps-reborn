# HD block textures, baked in Blender (for the HD look: js/hd.js).
#
# Takes the game's own 16x16 block designs (exported from js/textures.js, see export_tiles.html)
# and turns each one into a 512x512 tile with real depth:
#   1. a height field per tile (mortar and seams sink, stones and frames stand out, plus fine
#      tileable detail: grain, pebbles, weave, plaster...), from the settings in TILES below
#   2. Blender builds that relief as actual geometry (3x3 copies, so the edges tile seamlessly)
#      and Cycles bakes it onto a flat tile: a normal map and ambient occlusion
#   3. the colour, normal, height and roughness/metal maps are packed into three atlases with the
#      same layout as the game's atlas (same proportions, so the block UVs don't change), saved
#      as WebP (much smaller than PNG):
#        assets/hd/atlas_albedo.webp   colour (sRGB; the baked ambient occlusion is in it)
#        assets/hd/atlas_normal.webp   tangent-space normals (OpenGL / three.js convention)
#        assets/hd/atlas_hrm.webp      R = height (0 = 4 cm deep .. 1 = top, for the parallax
#                                      effect in hd.js), G = roughness, B = metalness
#
# Run (from the repo folder):
#   blender -b --factory-startup --python tools/hd/bake_textures.py
# Takes about 6-8 minutes on a GPU. Re-run after changing a design in textures.js
# (export the designs again first: see export_tiles.html).

import base64, json, os, sys, time
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pngio import read_png, write_png  # noqa: E402

REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, 'assets', 'hd')
N = 512            # pixels per tile (the game's own atlas uses 128)
GUTTER = 32        # padding around each tile (same 1/18 proportion as the game's atlas)
PX = N / 256       # the sizes in TILES are in pixels of a 256 tile: scaled to N
HMAX = 0.04        # height map range: 4 cm (must match HEIGHT_RANGE in js/hd.js)
CELL = N + 2 * GUTTER
GRID = 8           # 8x8 tiles in the atlas, as in textures.js
PREVIEW = '--preview' in sys.argv   # also write a shaded preview of every tile

# ---------------------------------------------------------------------------------------------
# Per-tile settings.
#   relief: how the design's pattern becomes height
#       ('lum', depth)       lighter = higher (mortar/seams are darker in most designs)
#       ('inv', depth)       darker = higher (crate frame, light grout...)
#       ('raise', depth, [colours])   those exact design colours stand out, the rest is low
#   boost: colours that stand out whatever their shade (the iron balcony on the facade)
#       ('lower', depth, [colours])   those colours sink (grout), the rest is high
#   bevel: how soft the pattern's edges are
#   detail: list of fine relief layers (sizes in pixels of a 256 tile):
#       ('noise', wavelength_px, amplitude_m)       soft lumps
#       ('grain', wavelength_px, amplitude_m, 'x'|'y')  long streaks (wood)
#       ('pebbles', cells, amplitude_m)             rounded stones (gravel, dirt)
#       ('weave', period_px, amplitude_m)           cloth
#   rough / metal: surface finish. glossy: design colours that are glass (shiny, smooth)
#   tint: how much the fine detail lightens/darkens the colour
# ---------------------------------------------------------------------------------------------
GLASS = [[74, 96, 118], [120, 150, 175], [130, 160, 185]]
PLASTER = [('noise', 3, 0.0001), ('noise', 22, 0.0005)]          # kept calm: busy walls hide enemies
STONE_D = [('noise', 4, 0.0005), ('noise', 18, 0.0018)]
FOLIAGE = [('noise', 2, 0.0012), ('noise', 5, 0.003), ('noise', 14, 0.004)]

TILES = {
    'grass_top':        dict(detail=FOLIAGE, rough=0.85, tint=0.35),
    'grass_side':       dict(relief=('lum', 0.012), bevel=2, detail=[('noise', 3, 0.001), ('noise', 12, 0.003)], rough=0.9, tint=0.3),
    'dirt':             dict(detail=[('pebbles', 120, 0.0025), ('noise', 3, 0.0012), ('noise', 24, 0.005)], rough=0.95, tint=0.3),
    'stone':            dict(detail=[('pebbles', 10, 0.004), ('noise', 4, 0.0015), ('noise', 30, 0.008)], rough=0.85, tint=0.3),
    'bricks':           dict(relief=('lum', 0.025), bevel=3, detail=STONE_D, rough=0.85, tint=0.25),
    'planks':           dict(relief=('lum', 0.012), bevel=1.5, detail=[('grain', 10, 0.0015, 'x'), ('noise', 3, 0.0004)], rough=0.7, tint=0.3),
    'sand':             dict(detail=[('noise', 2, 0.0006), ('grain', 40, 0.0025, 'x'), ('noise', 60, 0.003)], rough=0.95, tint=0.2),
    'concrete':         dict(detail=[('noise', 2, 0.0006), ('noise', 40, 0.003)], rough=0.8, tint=0.2),
    'crate':            dict(relief=('inv', 0.018), bevel=1.5, detail=[('grain', 10, 0.0015, 'x'), ('noise', 3, 0.0004)], rough=0.75, tint=0.3),
    'sandstone':        dict(relief=('lum', 0.006), bevel=2, detail=[('noise', 3, 0.0004), ('noise', 24, 0.0012)], rough=0.9, tint=0.1),
    'sandstone_bricks': dict(relief=('lum', 0.02), bevel=3, detail=STONE_D, rough=0.9, tint=0.22),
    'clay':             dict(detail=[('noise', 3, 0.0012), ('noise', 30, 0.005)], rough=0.85, tint=0.25),
    'palm_log':         dict(relief=('lum', 0.014), bevel=3, detail=[('grain', 10, 0.002, 'y'), ('noise', 3, 0.0008)], rough=0.85, tint=0.3),
    'palm_leaves':      dict(relief=('inv', 0.006), bevel=2, detail=[('grain', 6, 0.002, 'y'), ('noise', 14, 0.004)], rough=0.6, tint=0.3),
    'cloth_red':        dict(relief=('lum', 0.002), bevel=2, detail=[('weave', 4, 0.0007), ('noise', 40, 0.0012)], rough=0.9, tint=0.06),
    'cloth_teal':       dict(relief=('lum', 0.002), bevel=2, detail=[('weave', 4, 0.0007), ('noise', 40, 0.0012)], rough=0.9, tint=0.06),
    'water':            dict(detail=[('noise', 18, 0.004), ('noise', 50, 0.008)], rough=0.04, tint=0.15),
    'plaza':            dict(relief=('lum', 0.01), bevel=2, detail=STONE_D, rough=0.8, tint=0.2),
    'paint_pink':       dict(detail=PLASTER, rough=0.55, tint=0.05),
    'paint_teal':       dict(detail=PLASTER, rough=0.55, tint=0.05),
    'limestone':        dict(relief=('lum', 0.014), bevel=2.5, detail=STONE_D, rough=0.8, tint=0.2),
    'facade':           dict(relief=('lum', 0.03), boost=[[44, 44, 52]], bevel=1.5, detail=PLASTER, rough=0.75, glossy=GLASS, tint=0.05),
    'shop_green':       dict(relief=('lum', 0.03), bevel=1.5, detail=[('grain', 14, 0.0008, 'y')], rough=0.45, glossy=GLASS, tint=0.15),
    'shop_red':         dict(relief=('lum', 0.03), bevel=1.5, detail=[('grain', 14, 0.0008, 'y')], rough=0.45, glossy=GLASS, tint=0.15),
    'zinc':             dict(relief=('lum', 0.006), bevel=2, detail=[('noise', 30, 0.002)], rough=0.4, metal=0.6, tint=0.15),
    'cobble':           dict(relief=('lum', 0.03), bevel=4, detail=STONE_D, rough=0.8, tint=0.3),
    'iron':             dict(detail=[('noise', 3, 0.0005), ('noise', 30, 0.002)], rough=0.45, metal=0.8, tint=0.2),
    'hedge':            dict(detail=FOLIAGE, rough=0.8, tint=0.4),
    'bark':             dict(relief=('lum', 0.01), bevel=3, detail=[('noise', 4, 0.002), ('grain', 8, 0.002, 'y')], rough=0.9, tint=0.3),
    'cloth_green':      dict(relief=('lum', 0.002), bevel=2, detail=[('weave', 4, 0.0007), ('noise', 40, 0.0012)], rough=0.9, tint=0.06),
    'gravel':           dict(detail=[('pebbles', 220, 0.004), ('noise', 2, 0.0006)], rough=0.95, tint=0.3),
    'gilded':           dict(detail=[('noise', 8, 0.0012), ('noise', 40, 0.003)], rough=0.28, metal=1.0, tint=0.2),
    'bcn_ochre':        dict(relief=('lum', 0.03), bevel=1.5, detail=PLASTER, rough=0.85, tint=0.05),
    'bcn_pink':         dict(relief=('lum', 0.03), bevel=1.5, detail=PLASTER, rough=0.85, tint=0.05),
    'bcn_cream':        dict(relief=('lum', 0.03), bevel=1.5, detail=PLASTER, rough=0.85, tint=0.05),
    'bcn_ochre_plain':  dict(detail=PLASTER, rough=0.85, tint=0.05),
    'bcn_pink_plain':   dict(detail=PLASTER, rough=0.85, tint=0.05),
    'bcn_cream_plain':  dict(detail=PLASTER, rough=0.85, tint=0.05),
    'stucco':           dict(detail=PLASTER + [('noise', 6, 0.0005)], rough=0.85, tint=0.08),
    'terracotta':       dict(relief=('lum', 0.02), bevel=3, detail=[('noise', 3, 0.0008), ('noise', 20, 0.002)], rough=0.7, tint=0.2),
    'panot':            dict(relief=('lum', 0.008), bevel=2, detail=[('noise', 3, 0.0003), ('noise', 30, 0.001)], rough=0.75, tint=0.06),
    'wave_tile':        dict(relief=('lum', 0.006), bevel=3, detail=[('noise', 3, 0.0008), ('noise', 30, 0.002)], rough=0.7, tint=0.15),
    'trencadis':        dict(relief=('lower', 0.01, [[232, 230, 222]]), bevel=1.2, detail=[('noise', 20, 0.0015)], rough=0.25, tint=0.1),
    'gothic':           dict(relief=('lum', 0.025), bevel=3, detail=[('pebbles', 18, 0.002), ('noise', 4, 0.0008), ('noise', 24, 0.004)], rough=0.9, tint=0.18),
    'iron_green':       dict(relief=('lum', 0.008), bevel=1.5, detail=[('noise', 30, 0.0015)], rough=0.5, metal=0.3, tint=0.15),
    'stained_glass':    dict(relief=('raise', 0.008, [[44, 86, 70]]), bevel=1.2, detail=[('noise', 10, 0.001)], rough=0.12,
                             glossy=[[110, 180, 230], [250, 200, 90], [240, 120, 110], [130, 200, 140]], tint=0.1),
    'brick_red':        dict(relief=('inv', 0.025), bevel=3, detail=STONE_D, rough=0.85, tint=0.25),
    'orange_leaves':    dict(relief=('raise', 0.006, [[255, 150, 40]]), bevel=2, detail=FOLIAGE, rough=0.7, tint=0.4),
    'cloth_yellow':     dict(relief=('lum', 0.002), bevel=2, detail=[('weave', 4, 0.0007), ('noise', 40, 0.0012)], rough=0.9, tint=0.06),
    'shop_blue':        dict(relief=('lum', 0.03), bevel=1.5, detail=[('grain', 14, 0.0008, 'y')], rough=0.45, glossy=GLASS, tint=0.15),
    'plinth':           dict(relief=('lum', 0.006), bevel=2, detail=STONE_D, rough=0.85, tint=0.2),
}


# ---------------------------------------------------------------------------------------------
# Tileable image helpers (everything wraps around, so tiles repeat without seams)
# ---------------------------------------------------------------------------------------------
fy, fx = np.meshgrid(np.fft.fftfreq(N) * N, np.fft.fftfreq(N) * N, indexing='ij')   # cycles per tile


def blur(img, sigma):
    """Gaussian blur that wraps around the edges."""
    if sigma <= 0:
        return img
    k = np.exp(-2 * (np.pi * sigma / N) ** 2 * (fx ** 2 + fy ** 2))
    if img.ndim == 3:
        return np.stack([blur(img[..., c], sigma) for c in range(img.shape[2])], -1)
    return np.real(np.fft.ifft2(np.fft.fft2(img) * k))


def lowpass_noise(rng, wavelength, ax=1.0, ay=1.0):
    """Smooth random lumps about `wavelength` pixels across (ax/ay stretch it), std 1."""
    f0 = N / (wavelength * PX)
    k = np.exp(-((fx * ax) ** 2 + (fy * ay) ** 2) / (f0 ** 2))
    k[0, 0] = 0
    n = np.real(np.fft.ifft2(np.fft.fft2(rng.standard_normal((N, N))) * k))
    return n / (n.std() + 1e-9)


def pebbles(rng, cells):
    """Rounded stones: cells of a wrapped Voronoi pattern, domed, with crevices between."""
    pts = rng.random((cells, 2)) * N
    yy, xx = np.mgrid[0:N, 0:N].astype(np.float32) + 0.5
    f1 = np.full((N, N), 1e9, np.float32); f2 = f1.copy()
    for px, py in pts:
        dx = np.abs(xx - px); dx = np.minimum(dx, N - dx)
        dy = np.abs(yy - py); dy = np.minimum(dy, N - dy)
        d = np.sqrt(dx * dx + dy * dy)
        f2 = np.where(d < f1, f1, np.minimum(f2, d)); f1 = np.minimum(f1, d)
    edge = f2 - f1                                   # 0 on the cracks between stones
    r = N / np.sqrt(cells) * 0.5
    h = np.sqrt(np.clip(edge / r, 0, 1))             # domed
    return (h - h.mean()) / (h.std() + 1e-9)


def weave(period):
    period *= PX
    yy, xx = np.mgrid[0:N, 0:N] + 0.5
    a = np.sin(2 * np.pi * xx / period); b = np.sin(2 * np.pi * yy / period)
    w = np.where((np.floor(xx / period) + np.floor(yy / period)) % 2 == 0, a, b)
    return w / (w.std() + 1e-9)


def upscale(design, sigma):
    """16x16 design -> NxN: each design pixel a crisp block, then softened a little."""
    s = N // design.shape[0]
    return blur(design.repeat(s, 0).repeat(s, 1).astype(np.float64), sigma)


def vectorize(design, sigma=4.5 * PX):
    """16x16 design -> NxN with smooth shapes instead of pixel stair-steps: each colour's area
    is blurred and every HD pixel takes the colour that's strongest there (so diagonals become
    straight lines, specks become dots, corners get a slight round). Crisp, then anti-aliased."""
    flat = design.reshape(-1, 3)
    pal, idx = np.unique(flat, axis=0, return_inverse=True)
    idx = idx.reshape(design.shape[:2])
    if len(pal) == 1:
        return np.broadcast_to(pal[0].astype(np.float64), (N, N, 3)).copy()
    s = N // design.shape[0]
    best = np.full((N, N), -1.0); pick = np.zeros((N, N), np.int64)
    for k in range(len(pal)):
        m = blur((idx == k).repeat(s, 0).repeat(s, 1).astype(np.float64), sigma)
        better = m > best
        best = np.where(better, m, best); pick = np.where(better, k, pick)
    return pal[pick].astype(np.float64)       # crisp (anti-aliased later, after the masks are taken)


def color_mask(design, colors, tol=10):
    m = np.zeros(design.shape[:2])
    for c in colors:
        m = np.maximum(m, (np.abs(design.astype(int) - np.array(c)).max(-1) <= tol).astype(float))
    return m


def luminance(img):
    return img[..., 0] * 0.299 + img[..., 1] * 0.587 + img[..., 2] * 0.114


# ---------------------------------------------------------------------------------------------
# Per tile: height (metres), plus the bits the colour/roughness maps need
# ---------------------------------------------------------------------------------------------
def tile_maps(i, name, clean, noisy):
    cfg = TILES[name]
    rng = np.random.default_rng(1000 + i)
    bevel = cfg.get('bevel', 2)
    crisp = vectorize(clean)
    relief = np.zeros((N, N))
    rel = cfg.get('relief')
    if rel:
        kind, depth = rel[0], rel[1]
        if kind in ('lum', 'inv'):
            l = luminance(crisp)
            span = l.max() - l.min()
            m = (l - l.min()) / span if span > 4 else np.zeros_like(l)
            if kind == 'inv':
                m = 1 - m
        else:
            m = color_mask(crisp, rel[2])
            if kind == 'lower':
                m = 1 - m
        if cfg.get('boost'):                          # these colours stand out whatever their shade
            m = np.maximum(m, color_mask(crisp, cfg['boost']))
        relief = blur(m, bevel * 2 * PX) * depth     # (bevel is in design-ish units)
    detail = np.zeros((N, N))
    for d in cfg.get('detail', []):
        if d[0] == 'noise':
            detail += lowpass_noise(rng, d[1]) * d[2]
        elif d[0] == 'grain':
            ax, ay = (8.0, 1.0) if d[3] == 'x' else (1.0, 8.0)     # long streaks along x (or y): slow change that way
            detail += lowpass_noise(rng, d[1], ax, ay) * d[2]
        elif d[0] == 'pebbles':
            detail += pebbles(rng, d[1]) * d[2]
        elif d[0] == 'weave':
            detail += weave(d[1]) * d[2]
    height = relief + detail
    return cfg, crisp, relief, detail, height


# ---------------------------------------------------------------------------------------------
# Blender: build the relief as geometry and bake normals + AO onto a flat tile
# ---------------------------------------------------------------------------------------------
import bpy  # noqa: E402

M = 3 * N    # 3x3 copies of the tile, one vertex per pixel


def setup_scene():
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
    gpu = any(d.use and d.type != 'CPU' for d in prefs.devices)
    sc.cycles.device = 'GPU' if gpu else 'CPU'
    print(f'[bake] Cycles on {"GPU (" + prefs.compute_device_type + ")" if gpu else "CPU"}')
    sc.cycles.samples = 64
    sc.render.bake.margin = 0
    world = bpy.data.worlds.new('w'); sc.world = world
    world.light_settings.distance = 0.06              # AO reach: a few cm (crevices, mortar)

    # the detailed relief: a grid with one vertex per pixel, 3x3 tiles wide
    me = bpy.data.meshes.new('high')
    xs = (np.arange(M) + 0.5) / N - 1.5
    gx, gy = np.meshgrid(xs, xs)
    co = np.stack([gx.ravel(), gy.ravel(), np.zeros(M * M)], -1).astype(np.float32)
    me.vertices.add(M * M)
    me.vertices.foreach_set('co', co.ravel())
    r, c = np.mgrid[0:M - 1, 0:M - 1]
    v0 = (r * M + c).ravel()
    quads = np.stack([v0, v0 + 1, v0 + 1 + M, v0 + M], -1).astype(np.int32)
    nq = len(quads)
    me.loops.add(nq * 4); me.loops.foreach_set('vertex_index', quads.ravel())
    me.polygons.add(nq)
    me.polygons.foreach_set('loop_start', np.arange(0, nq * 4, 4, dtype=np.int32))
    me.update(calc_edges=True)
    me.shade_smooth()
    high = bpy.data.objects.new('high', me); sc.collection.objects.link(high)

    # the flat tile it's baked onto
    bpy.ops.mesh.primitive_plane_add(size=1)
    low = bpy.context.active_object
    img_n = bpy.data.images.new('bake_n', N, N, float_buffer=True, is_data=True)
    img_ao = bpy.data.images.new('bake_ao', N, N, float_buffer=True, is_data=True)
    for img in (img_n, img_ao):
        img.colorspace_settings.name = 'Non-Color'
    mat = bpy.data.materials.new('bake'); mat.use_nodes = True
    node = mat.node_tree.nodes.new('ShaderNodeTexImage')
    mat.node_tree.nodes.active = node
    low.data.materials.append(mat)
    for o in sc.objects:
        o.select_set(False)
    high.select_set(True); low.select_set(True)
    bpy.context.view_layer.objects.active = low
    return high, low, node, img_n, img_ao


def bake(high, node, img, kind, height):
    tiled = np.tile(height, (3, 3))[::-1]              # image rows run top-down, Blender's y runs up
    co = np.zeros(M * M * 3, np.float32)
    high.data.vertices.foreach_get('co', co)
    co = co.reshape(-1, 3); co[:, 2] = tiled.ravel()
    high.data.vertices.foreach_set('co', co.ravel())
    high.data.update()
    node.image = img
    kw = dict(type=kind, use_selected_to_active=True, cage_extrusion=0.15, margin=0)
    if kind == 'NORMAL':
        kw.update(normal_space='TANGENT')
    bpy.ops.object.bake(**kw)
    px = np.zeros(N * N * 4, np.float32)
    img.pixels.foreach_get(px)
    return px.reshape(N, N, 4)[::-1, :, :3]            # back to top-down rows


def save_webp(path, arr, quality):
    """Save an 8-bit RGB image as WebP through Blender (quality 100 = lossless)."""
    h, w = arr.shape[:2]
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'       # raw bytes in, raw bytes out
    px = np.ones((h, w, 4), np.float32)
    px[..., :3] = arr[::-1] / 255.0
    img.pixels.foreach_set(px.ravel())
    img.file_format = 'WEBP'
    img.filepath_raw = path
    img.save(filepath=path, quality=quality)
    bpy.data.images.remove(img)
    print(f'[bake] wrote {os.path.basename(path)} ({os.path.getsize(path) / 1e6:.1f} MB)')


# ---------------------------------------------------------------------------------------------
def main():
    t0 = time.time()
    clean_d = json.load(open(os.path.join(HERE, 'tiles_clean.json')))
    noisy_d = json.load(open(os.path.join(HERE, 'tiles_noisy.json')))
    names = clean_d['names']
    cell = clean_d['cell']
    assert cell == 16 and clean_d['atlas'] == GRID, 'export the designs at 16px, no padding (see export_tiles.html)'
    clean_img = read_png(base64.b64decode(clean_d['png'].split(',')[1]))[:, :, :3]
    noisy_img = read_png(base64.b64decode(noisy_d['png'].split(',')[1]))[:, :, :3]
    missing = [n for n in names if n not in TILES]
    if missing:
        raise SystemExit(f'No HD settings for: {missing} (add them to TILES)')

    high, low, node, img_n, img_ao = setup_scene()
    W = CELL * GRID
    albedo = np.zeros((W, W, 3), np.uint8)
    normal = np.zeros((W, W, 3), np.uint8); normal[..., 2] = 255; normal[..., :2] = 128
    orm = np.zeros((W, W, 3), np.uint8); orm[..., 0] = 255; orm[..., 1] = 230
    previews = []
    light = np.array([-0.45, 0.55, 0.7]); light /= np.linalg.norm(light)

    for i, name in enumerate(names):
        row, col = divmod(i, GRID)
        clean = clean_img[row * 16:(row + 1) * 16, col * 16:(col + 1) * 16]
        noisy = noisy_img[row * 16:(row + 1) * 16, col * 16:(col + 1) * 16]
        cfg, crisp, relief, detail, height = tile_maps(i, name, clean, noisy)

        nrm = bake(high, node, img_n, 'NORMAL', height)
        ao = bake(high, node, img_ao, 'AO', height)[..., 0]

        # colour: the design, crisp but soft-edged, + the original's gentle per-pixel variation,
        # + the fine detail, darkened in the crevices
        base = blur(crisp, 0.8)
        base += 0.35 * upscale(noisy.astype(float) - clean.astype(float), 6 * PX)
        dn = detail / (np.abs(detail).max() + 1e-9)
        base *= (1 + cfg.get('tint', 0.2) * dn)[..., None]
        base *= (0.45 + 0.55 * ao)[..., None]
        col_rgb = np.clip(base, 0, 255)

        # roughness: rougher in the low bits (mortar, gaps), glass is smooth
        rough = np.full((N, N), cfg.get('rough', 0.8))
        if relief.max() > 0:
            rough += 0.12 * (1 - relief / relief.max())
        rough += 0.05 * dn
        gl = cfg.get('glossy')
        if gl:
            g = blur(color_mask(crisp, gl, 16), 1.0 * PX)
            rough = rough * (1 - g) + 0.07 * g
        metal = np.full((N, N), cfg.get('metal', 0.0))

        def place(atlas, tile):
            y0, x0 = row * CELL, col * CELL
            atlas[y0:y0 + CELL, x0:x0 + CELL] = np.pad(tile, ((GUTTER, GUTTER), (GUTTER, GUTTER), (0, 0)), mode='wrap')

        place(albedo, col_rgb.astype(np.uint8))
        place(normal, np.clip(nrm * 255 + 0.5, 0, 255).astype(np.uint8))
        hgt = np.clip((height - height.min()) / HMAX, 0, 1)
        place(orm, np.clip(np.stack([hgt, rough, metal], -1) * 255 + 0.5, 0, 255).astype(np.uint8))

        if PREVIEW:   # quick shading check: the tile lit from the top left
            nv = nrm * 2 - 1
            shade = np.clip(nv @ light, 0, 1) * 0.75 + 0.35
            previews.append(np.clip(col_rgb * shade[..., None], 0, 255).astype(np.uint8)[::2, ::2])
        print(f'[bake] {i + 1:2d}/{len(names)} {name:18s} {time.time() - t0:5.1f}s', flush=True)

    os.makedirs(OUT, exist_ok=True)
    save_webp(os.path.join(OUT, 'atlas_albedo.webp'), albedo, 92)
    save_webp(os.path.join(OUT, 'atlas_normal.webp'), normal, 95)
    save_webp(os.path.join(OUT, 'atlas_hrm.webp'), orm, 96)
    for old in ('atlas_albedo.png', 'atlas_normal.png', 'atlas_orm.png'):   # the old 256 versions
        if os.path.exists(os.path.join(OUT, old)):
            os.remove(os.path.join(OUT, old))
    if PREVIEW:
        out = os.environ.get('HD_PREVIEW_DIR', OUT)
        h = N // 2
        sheet = np.zeros((7 * h, 8 * h, 3), np.uint8)
        for k, p in enumerate(previews):
            r_, c_ = divmod(k, 8); sheet[r_ * h:(r_ + 1) * h, c_ * h:(c_ + 1) * h] = p
        write_png(os.path.join(out, 'preview_shaded.png'), sheet)
    print(f'[bake] done in {time.time() - t0:.0f}s -> {OUT}')


main()
