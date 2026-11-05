# Turns the Poly Haven sky (fetch_polyhaven.py -> tools/hd/cache/) into the HD look's sky:
#   assets/hd/sky.webp   the upper half of the sky (+ a little below the horizon), equirectangular,
#                        4096 wide; colour = sRGB(linear / MAXV), dithered (no banding)
#   assets/hd/sky.json   how to read it: MAXV, the rows' elevation range, where the photo's sun is
# The sun itself is squeezed out of the photo (the game draws its own, where the map puts it,
# and the sky is turned so the photo's bright side lines up with it).
#
# Run (Blender, for the image IO):
#   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b --factory-startup --python tools/hd/make_sky.py

import json, math, os, sys
import numpy as np
import bpy

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
CACHE = os.path.join(HERE, 'cache')
OUT = os.path.join(ROOT, 'assets', 'hd')

W_OUT, H_OUT = 4096, 1024
E0, E1 = -10.0, 90.0          # elevation of the bottom and top rows (degrees)
KNEE, MAXV = 2.6, 4.0         # brightness: kept as is up to KNEE, then eased into MAXV
QUALITY = 90


def main():
    info = json.load(open(os.path.join(CACHE, 'scans.json')))['_sky']
    img = bpy.data.images.load(os.path.join(CACHE, info['file']))
    W, H = img.size
    a = np.empty(W * H * 4, np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(H, W, 4)[::-1, :, :3]                      # rows top-down
    bpy.data.images.remove(img)
    lum = a @ np.array([0.2126, 0.7152, 0.0722], np.float32)

    # where the sun is (the brightest spot)
    j, i = np.unravel_index(np.argmax(lum), lum.shape)
    sun_u = (i + 0.5) / W
    sun_el = 90 - (j + 0.5) / H * 180

    # the rows we keep, resampled to H_OUT (linear between source rows)
    el = E1 - (np.arange(H_OUT) + 0.5) / H_OUT * (E1 - E0)
    src = (90 - el) / 180 * H - 0.5
    j0 = np.clip(np.floor(src).astype(int), 0, H - 1)
    j1 = np.clip(j0 + 1, 0, H - 1)
    f = (src - j0)[:, None, None]
    rows = a[j0] * (1 - f) + a[j1] * f
    # columns: 4096 -> W_OUT (same if the photo is 4k)
    if W != W_OUT:
        x = (np.arange(W_OUT) + 0.5) / W_OUT * W - 0.5
        i0 = np.floor(x).astype(int) % W
        i1 = (i0 + 1) % W
        g = (x - np.floor(x))[None, :, None]
        rows = rows[:, i0] * (1 - g) + rows[:, i1] * g

    # squeeze the sun and its blinding halo: brightness above KNEE eased towards MAXV (hue kept)
    L = rows @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    over = np.maximum(L - KNEE, 0)
    L2 = np.where(L > KNEE, KNEE + (MAXV - KNEE) * (1 - np.exp(-over / (MAXV - KNEE))), L)
    rows = rows * (L2 / np.maximum(L, 1e-6))[..., None]
    rows = np.minimum(rows, MAXV)                             # (a saturated channel may still poke out)

    # encode: sRGB of linear / MAXV, with a little noise so the smooth blue doesn't band
    x = np.clip(rows / MAXV, 0, 1)
    s = np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)
    rng = np.random.default_rng(7)
    s8 = np.clip(s * 255 + rng.random(s.shape, np.float32) - 0.5 + 0.5, 0, 255).astype(np.uint8)

    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, 'sky.webp')
    im = bpy.data.images.new('sky', W_OUT, H_OUT, alpha=False, float_buffer=False)
    im.colorspace_settings.name = 'Non-Color'
    px = np.ones((H_OUT, W_OUT, 4), np.float32)
    px[..., :3] = s8[::-1] / 255.0                            # Blender's rows run bottom-up
    im.pixels.foreach_set(px.ravel())
    im.file_format = 'WEBP'
    im.filepath_raw = path
    im.save(filepath=path, quality=QUALITY)
    bpy.data.images.remove(im)

    # the mean colour just above the horizon (the haze blends towards the fog there)
    hz = rows[(el >= 0) & (el < 4)].reshape(-1, 3).mean(0)
    meta = {
        'source': f"Poly Haven: {info['asset']} (CC0)", 'authors': info.get('authors', {}),
        'maxv': MAXV, 'elev': [E0, E1],
        'sunU': round(float(sun_u), 5), 'sunElev': round(float(sun_el), 3),
        'horizon': [round(float(v), 4) for v in hz],
    }
    json.dump(meta, open(os.path.join(OUT, 'sky.json'), 'w'), indent=1)
    print(f"[sky] {W}x{H} -> {W_OUT}x{H_OUT}, sun at u={sun_u:.4f} elev={sun_el:.1f}, "
          f"{os.path.getsize(path) / 1e6:.2f} MB", flush=True)


main()
