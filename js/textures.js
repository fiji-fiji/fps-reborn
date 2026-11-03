// Procedural textures packed into one atlas. Each design is painted on a 16x16 grid,
// with only a little noise, then smoothly scaled up 4x for a clean "toy" look.
// Everything is generated in code, so there are no image files to manage.

const TILE = 16;        // design grid per texture
const ATLAS_SIZE = 8;   // atlas is 8x8 tiles
const TEX_SCALE = 8;    // each design pixel becomes 8x8 smooth pixels
const TEX_INNER = TILE * TEX_SCALE;
const TEX_GUTTER = 8;   // padding around each tile so far-away mipmaps don't bleed
const TEX_CELL = TEX_INNER + TEX_GUTTER * 2;
const TEX_NOISE = 0.35; // how much of the original noise to keep (lower = cleaner)

// Accurate colour handling: colours are given in normal (sRGB) hex and the renderer
// outputs sRGB, so lighting blends naturally.
THREE.ColorManagement.legacyMode = false;

// A box with softly rounded edges and smooth shading (used for characters and
// the things you hold). r = how round the edges are.
function roundedBoxGeometry(w, h, d, r, seg = 5) {
  r = Math.max(0.0005, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const pos = g.attributes.position, nor = g.attributes.normal;
  const half = [w / 2 - r, h / 2 - r, d / 2 - r];
  const v = new THREE.Vector3(), inner = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    inner.set(
      Math.max(-half[0], Math.min(half[0], v.x)),
      Math.max(-half[1], Math.min(half[1], v.y)),
      Math.max(-half[2], Math.min(half[2], v.z)));
    n.subVectors(v, inner);
    if (n.lengthSq() > 1e-12) {
      n.normalize();
      v.copy(inner).addScaledVector(n, r);
      pos.setXYZ(i, v.x, v.y, v.z);
      nor.setXYZ(i, n.x, n.y, n.z);
    }
  }
  return g;
}

// Small seeded random so the textures look identical every launch.
function makeRng(seed) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

const Textures = (() => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX_CELL * ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  const tileCanvas = document.createElement('canvas');      // one design at a time
  tileCanvas.width = tileCanvas.height = TILE;
  const tctx = tileCanvas.getContext('2d');
  const rand = makeRng(1337);
  const clamp = v => Math.max(0, Math.min(255, v | 0));

  const tiles = {};   // name -> { index, color }
  let next = 0;

  function makeTile(name, baseColor, paint) {
    const i = next++;
    const px = (x, y, c, n = 0) => {
      n *= TEX_NOISE;
      tctx.fillStyle = `rgb(${clamp(c[0] + n)},${clamp(c[1] + n)},${clamp(c[2] + n)})`;
      tctx.fillRect(x, y, 1, 1);
    };
    paint(px);
    // scale it up smoothly into its cell, repeating it into the padding so it tiles cleanly
    const cx = (i % ATLAS_SIZE) * TEX_CELL, cy = Math.floor(i / ATLAS_SIZE) * TEX_CELL;
    ctx.save();
    ctx.beginPath(); ctx.rect(cx, cy, TEX_CELL, TEX_CELL); ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        ctx.drawImage(tileCanvas, cx + TEX_GUTTER + dx * TEX_INNER, cy + TEX_GUTTER + dy * TEX_INNER, TEX_INNER, TEX_INNER);
    ctx.restore();
    tiles[name] = { index: i, color: baseColor };
  }

  // Fill a whole tile with noise around a base colour.
  const noise = (c, amt) => px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) px(x, y, c, (rand() - 0.5) * amt);
  };

  const GRASS = [95, 159, 53], DIRT = [134, 96, 67], STONE = [125, 125, 125];
  const BRICK = [118, 118, 122], PLANK = [162, 130, 78], SAND = [219, 207, 163];
  const CONCRETE = [196, 196, 190], CRATE = [150, 112, 60];

  makeTile('grass_top', GRASS, noise(GRASS, 34));
  makeTile('grass_side', DIRT, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const edge = 3 + ((rand() * 2) | 0);
        px(x, y, y < edge ? GRASS : DIRT, (rand() - 0.5) * 30);
      }
  });
  makeTile('dirt', DIRT, noise(DIRT, 34));
  makeTile('stone', STONE, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++)
        px(x, y, STONE, (rand() - 0.5) * 26 - (rand() < 0.08 ? 30 : 0));
  });
  makeTile('bricks', BRICK, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const offset = (y >> 2) % 2 === 0 ? 0 : 4;
        const mortar = y % 4 === 3 || (x + offset) % 8 === 7;
        px(x, y, mortar ? [80, 80, 84] : BRICK, (rand() - 0.5) * 20);
      }
  });
  makeTile('planks', PLANK, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const seam = y % 4 === 3 || (x === ((y >> 2) * 5 + 3) % 16);
        px(x, y, seam ? [110, 85, 50] : PLANK, (rand() - 0.5) * 18);
      }
  });
  makeTile('sand', SAND, noise(SAND, 22));
  makeTile('concrete', CONCRETE, noise(CONCRETE, 12));
  makeTile('crate', CRATE, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const border = x < 2 || y < 2 || x > 13 || y > 13;
        const diag = Math.abs(x - y) < 2 && !border;
        px(x, y, border || diag ? [100, 72, 38] : CRATE, (rand() - 0.5) * 20);
      }
  });

  // --- desert town ---
  const SANDSTONE = [222, 196, 140], SS_BRICK = [212, 182, 124], CLAY = [214, 140, 96];
  const LOG = [150, 112, 70], LEAF = [88, 170, 70], WATER = [90, 180, 230], PLAZA = [236, 216, 172];
  const CREAM = [250, 240, 228];

  makeTile('sandstone', SANDSTONE, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++)
        px(x, y, SANDSTONE, (rand() - 0.5) * 14 - (y === 0 || y === 15 ? 14 : 0));
  });
  makeTile('sandstone_bricks', SS_BRICK, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const offset = (y >> 3) % 2 === 0 ? 0 : 4;
        const mortar = y % 8 === 7 || (x + offset) % 8 === 7;
        px(x, y, mortar ? [178, 150, 100] : SS_BRICK, (rand() - 0.5) * 14);
      }
  });
  makeTile('clay', CLAY, noise(CLAY, 18));
  makeTile('palm_log', LOG, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++)
        px(x, y, y % 4 === 0 ? [118, 86, 52] : LOG, (rand() - 0.5) * 18);
  });
  makeTile('palm_leaves', LEAF, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const vein = x === 7 || x === 8 || (Math.abs(x - 7.5) - 1 === (y % 6));
        px(x, y, vein ? [60, 130, 50] : LEAF, (rand() - 0.5) * 28);
      }
  });
  makeTile('cloth_red', [230, 100, 110], px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++)
        px(x, y, (x >> 2) % 2 ? CREAM : [236, 104, 118], (rand() - 0.5) * 10);
  });
  makeTile('cloth_teal', [70, 180, 180], px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++)
        px(x, y, (x >> 2) % 2 ? CREAM : [70, 184, 184], (rand() - 0.5) * 10);
  });
  makeTile('water', WATER, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const ripple = (x + y * 3) % 11 === 0 || (x * 2 + y) % 13 === 0;
        px(x, y, ripple ? [170, 225, 250] : WATER, (rand() - 0.5) * 14);
      }
  });
  makeTile('plaza', PLAZA, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const grout = x % 8 === 0 || y % 8 === 0;
        px(x, y, grout ? [200, 178, 136] : PLAZA, (rand() - 0.5) * 10);
      }
  });
  makeTile('paint_pink', [255, 143, 177], noise([255, 143, 177], 12));
  makeTile('paint_teal', [80, 200, 210], noise([80, 200, 210], 12));

  // --- Petit Paris ---
  const LIME = [234, 226, 206], LIME_LINE = [205, 195, 172], GLASS = [74, 96, 118], IRON = [44, 44, 52];
  const ZINC = [122, 136, 150], COBBLE = [150, 146, 140], HEDGE = [64, 128, 66], GRAVEL = [214, 204, 182];
  // cut limestone: courses of stone blocks
  makeTile('limestone', LIME, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const off = (y >> 2) % 2 ? 4 : 0;
        const line = y % 4 === 3 || (x + off) % 8 === 7;
        px(x, y, line ? LIME_LINE : LIME, (rand() - 0.5) * 10);
      }
  });
  // facade: stone with a tall window and a little iron balcony
  makeTile('facade', LIME, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        let c = y % 8 === 7 ? LIME_LINE : LIME;
        const inWin = x >= 4 && x <= 11 && y >= 2 && y <= 13;
        if (inWin) {
          const frame = x === 4 || x === 11 || y === 2 || x === 7 || x === 8 || y === 7;
          c = frame ? [245, 240, 228] : (x + y) % 7 === 0 ? [120, 150, 175] : GLASS;
        }
        if (y >= 11 && y <= 13 && x >= 3 && x <= 12 && (y === 11 || x % 2 === 1)) c = IRON;   // balcony rail
        if (y === 1 && x >= 3 && x <= 12) c = LIME_LINE;                                        // window cap
        px(x, y, c, (rand() - 0.5) * 8);
      }
  });
  // shopfronts: painted wooden frame + big glass
  const shop = frameCol => px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        let c = frameCol;
        if (x >= 2 && x <= 13 && y >= 4 && y <= 14) c = (x + y) % 9 === 0 ? [130, 160, 185] : GLASS;
        if (y <= 2) c = [frameCol[0] * 0.8, frameCol[1] * 0.8, frameCol[2] * 0.8];              // sign band
        if (y === 3 || x === 7 || x === 8) c = frameCol;
        px(x, y, c, (rand() - 0.5) * 8);
      }
  };
  makeTile('shop_green', [40, 92, 72], shop([40, 92, 72]));
  makeTile('shop_red', [128, 40, 52], shop([128, 40, 52]));
  makeTile('zinc', ZINC, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) px(x, y, x % 4 === 0 ? [150, 162, 176] : ZINC, (rand() - 0.5) * 8);
  });
  // cobblestones: rounded stones with dark gaps
  makeTile('cobble', COBBLE, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const off = (y >> 2) % 2 ? 2 : 0;
        const gap = y % 4 === 0 || (x + off) % 4 === 0;
        px(x, y, gap ? [104, 100, 96] : COBBLE, (rand() - 0.5) * 22);
      }
  });
  makeTile('iron', IRON, noise(IRON, 8));
  makeTile('hedge', HEDGE, px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) px(x, y, rand() < 0.25 ? [84, 156, 82] : HEDGE, (rand() - 0.5) * 26);
  });
  makeTile('bark', [150, 140, 112], px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const patch = Math.sin(x * 1.3 + y * 0.6) + Math.cos(x * 0.5 - y * 1.1) > 0.6;
        px(x, y, patch ? [196, 188, 156] : [140, 130, 104], (rand() - 0.5) * 14);
      }
  });
  makeTile('cloth_green', [70, 150, 100], px => {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) px(x, y, (x >> 2) % 2 ? CREAM : [64, 150, 98], (rand() - 0.5) * 10);
  });
  makeTile('gravel', GRAVEL, noise(GRAVEL, 26));
  makeTile('gilded', [226, 184, 70], noise([226, 184, 70], 18));

  const atlas = new THREE.CanvasTexture(canvas);
  atlas.encoding = THREE.sRGBEncoding;
  atlas.magFilter = THREE.LinearFilter;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.generateMipmaps = true;
  atlas.anisotropy = 8;

  // UV rectangle for a tile's inner area (the padding is only there for mipmaps).
  function uv(name) {
    const i = tiles[name].index;
    const W = TEX_CELL * ATLAS_SIZE;
    const col = i % ATLAS_SIZE, row = Math.floor(i / ATLAS_SIZE);
    const x0 = col * TEX_CELL + TEX_GUTTER, y0 = row * TEX_CELL + TEX_GUTTER;
    return {
      u0: x0 / W, u1: (x0 + TEX_INNER) / W,
      v0: 1 - (y0 + TEX_INNER) / W, v1: 1 - y0 / W,
    };
  }

  // Small standalone texture with a gentle variation, used for characters and the blasters.
  function noisyTexture(hex, amt = 20, size = 8, seed = 7) {
    amt *= TEX_NOISE;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const r = makeRng(seed);
    const base = new THREE.Color(hex);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const n = (r() - 0.5) * amt;
        g.fillStyle = `rgb(${clamp(base.r * 255 + n)},${clamp(base.g * 255 + n)},${clamp(base.b * 255 + n)})`;
        g.fillRect(x, y, 1, 1);
      }
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  }

  // 8x8 friendly smiling face for the practice buddies.
  function faceTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const g = c.getContext('2d');
    const r = makeRng(42);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const n = (r() - 0.5) * 12;
        g.fillStyle = `rgb(${clamp(240 + n)},${clamp(200 + n)},${clamp(160 + n)})`;
        g.fillRect(x, y, 1, 1);
      }
    g.fillStyle = '#6b4a2b'; g.fillRect(0, 0, 8, 2);           // hair
    g.fillStyle = '#2a2a3a'; g.fillRect(2, 3, 1, 2); g.fillRect(5, 3, 1, 2); // eyes
    g.fillStyle = '#ff9eb5'; g.fillRect(1, 5, 1, 1); g.fillRect(6, 5, 1, 1); // rosy cheeks
    g.fillStyle = '#c0505a';                                    // smile
    g.fillRect(2, 5, 1, 1); g.fillRect(5, 5, 1, 1); g.fillRect(3, 6, 2, 1);
    const t = new THREE.CanvasTexture(c);
    t.encoding = THREE.sRGBEncoding;
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  }

  return { atlas, uv, tiles, noisyTexture, faceTexture };
})();

// Block types. `h` = height (0.5 for slabs, which you can walk up like stairs).
const BLOCK_DEFS = [
  null,                                                                     // 0 air
  { name: 'grass', top: 'grass_top', side: 'grass_side', bottom: 'dirt' }, // 1
  { name: 'dirt', all: 'dirt' },                                           // 2
  { name: 'stone', all: 'stone' },                                         // 3
  { name: 'bricks', all: 'bricks' },                                       // 4
  { name: 'planks', all: 'planks' },                                       // 5
  { name: 'crate', all: 'crate' },                                         // 6
  { name: 'sand', all: 'sand' },                                           // 7
  { name: 'concrete', all: 'concrete' },                                   // 8
  { name: 'stone_slab', all: 'stone', h: 0.5 },                            // 9
  { name: 'sand_slab', all: 'sand', h: 0.5 },                              // 10
  { name: 'sandstone', all: 'sandstone' },                                 // 11
  { name: 'sandstone_bricks', all: 'sandstone_bricks' },                   // 12
  { name: 'clay', all: 'clay' },                                           // 13
  { name: 'palm_log', all: 'palm_log' },                                   // 14
  { name: 'palm_leaves', all: 'palm_leaves' },                             // 15
  { name: 'cloth_red', all: 'cloth_red' },                                 // 16
  { name: 'cloth_teal', all: 'cloth_teal' },                               // 17
  { name: 'water', all: 'water', h: 0.85, liquid: true },                  // 18 (walk through it)
  { name: 'plaza', all: 'plaza' },                                         // 19
  { name: 'paint_pink', all: 'paint_pink' },                               // 20
  { name: 'paint_teal', all: 'paint_teal' },                               // 21
  { name: 'sandstone_slab', all: 'sandstone', h: 0.5 },                    // 22
  // Petit Paris
  { name: 'limestone', all: 'limestone' },                                 // 23
  { name: 'facade', all: 'facade' },                                       // 24
  { name: 'shop_green', all: 'shop_green' },                               // 25
  { name: 'shop_red', all: 'shop_red' },                                   // 26
  { name: 'zinc', all: 'zinc' },                                           // 27
  { name: 'cobble', all: 'cobble' },                                       // 28
  { name: 'iron', all: 'iron' },                                           // 29
  { name: 'hedge', all: 'hedge' },                                         // 30
  { name: 'bark', all: 'bark' },                                           // 31
  { name: 'cloth_green', all: 'cloth_green' },                             // 32
  { name: 'gravel', all: 'gravel' },                                       // 33
  { name: 'gilded', all: 'gilded' },                                       // 34
  { name: 'limestone_slab', all: 'limestone', h: 0.5 },                    // 35
];
const B = {};
BLOCK_DEFS.forEach((d, i) => { if (d) B[d.name] = i; });

function blockTex(def, face) {
  if (def.all) return def.all;
  return face === 'top' ? def.top : face === 'bottom' ? def.bottom : def.side;
}
