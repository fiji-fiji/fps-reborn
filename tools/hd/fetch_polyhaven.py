# Downloads the photoscanned materials and the sky used by the HD look from Poly Haven
# (polyhaven.com: free, CC0 — no strings attached) into tools/hd/cache/ (not committed).
# make_materials.py then turns them into the game's materials (assets/hd/mat/), and
# make_sky.py the sky (assets/hd/sky.*).
#
# Run (needs internet, plain Python 3):   py -3 tools/hd/fetch_polyhaven.py

import json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, 'cache')

# game material -> Poly Haven texture (each one's real size comes with it)
SCANS = {
    'plaster': 'painted_plaster_wall',
    'render': 'clay_plaster',
    'ashlar': 'stone_block_wall',          # (medieval_blocks_03's height map is blank)
    'rubble': 'stone_wall',
    'brick': 'brick_wall_001',
    'cobble': 'square_cobblestone',
    'slabs': 'rectangular_paving',
    'rasilla': 'terracotta_floor_tiles',
    'planks': 'weathered_planks',
    'gravel': 'gravel_floor_02',
    'grass': 'leafy_grass',
    'dirt': 'dirt',
    'bark': 'bark_platanus',
    'palmbark': 'palm_tree_bark',
    'concrete': 'concrete_floor_02',
    'sandstone': 'sandstone_cracks',
}
MAPS = {'Diffuse': 'diff', 'nor_gl': 'nor', 'Rough': 'rough', 'Displacement': 'disp'}
SKY = 'kloofendal_48d_partly_cloudy_puresky'
RES = '2k'
SKY_RES = '4k'                         # (the sky fills the screen: needs more pixels)
UA = {'User-Agent': 'fps-reborn-asset-tool'}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return
    data = get(url)
    with open(path, 'wb') as f:
        f.write(data)
    print(f'  {os.path.relpath(path, HERE)} ({len(data) / 1e6:.1f} MB)', flush=True)


def main():
    os.makedirs(CACHE, exist_ok=True)
    info = {}
    for mat, asset in SCANS.items():
        print(f'{mat}: {asset}', flush=True)
        files = json.loads(get(f'https://api.polyhaven.com/files/{asset}'))
        meta = json.loads(get(f'https://api.polyhaven.com/info/{asset}'))
        d = os.path.join(CACHE, asset)
        os.makedirs(d, exist_ok=True)
        for key, short in MAPS.items():
            m = files.get(key, {}).get(RES, {})
            f = (m.get('png') or m.get('jpg')) if key == 'Displacement' else (m.get('jpg') or m.get('png'))   # (height: png, finer steps)
            if not f:
                print(f'  (no {key})')
                continue
            fetch(f['url'], os.path.join(d, short + os.path.splitext(f['url'])[1]))
        info[mat] = {'asset': asset, 'size_m': [v / 1000 for v in meta['dimensions']], 'authors': meta.get('authors', {})}
    print(f'sky: {SKY}', flush=True)
    files = json.loads(get(f'https://api.polyhaven.com/files/{SKY}'))
    fetch(files['hdri'][SKY_RES]['hdr']['url'], os.path.join(CACHE, f'{SKY}_{SKY_RES}.hdr'))
    info['_sky'] = {'asset': SKY, 'file': f'{SKY}_{SKY_RES}.hdr', 'authors': json.loads(get(f'https://api.polyhaven.com/info/{SKY}')).get('authors', {})}
    json.dump(info, open(os.path.join(CACHE, 'scans.json'), 'w'), indent=1)
    print('done')


if __name__ == '__main__':
    sys.exit(main())
