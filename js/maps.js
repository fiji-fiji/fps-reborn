// Map layouts. Each map builds its blocks and returns where things are:
//   spawn       where you start in free play
//   buddies     practice targets [x, y, z, strafe?]
//   spawns      team spawn areas (used once rounds exist)
//   sites       seed-planting zones (used once rounds exist)
// Coordinates: x = west→east, z = north→south, y = up. Facing yaw 0 = looking north.

// Pixel letters (5 wide x 7 tall) painted onto walls with coloured blocks.
const LETTERS = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
};

// Paint a letter on a wall that faces south (+z). (x0, yTop) = top-left block.
function paintLetter(w, letter, x0, yTop, z, id) {
  LETTERS[letter].forEach((row, r) => {
    for (let c = 0; c < 5; c++) if (row[c] === '#') w.set(x0 + c, yTop - r, z, id);
  });
}

function palmTree(w, x, y, z, height = 5) {
  w.fill(x, y, z, x, y + height - 1, z, B.palm_log);
  const top = y + height;
  w.set(x, top, z, B.palm_leaves);
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    w.set(x + dx, top, z + dz, B.palm_leaves);
    w.set(x + dx * 2, top, z + dz * 2, B.palm_leaves);
    w.set(x + dx * 3, top - 1, z + dz * 3, B.palm_leaves);   // droopy tips
  }
}

// Market stall: counter, four posts, striped cloth roof.
function stall(w, x0, z0, x1, z1, y, cloth) {
  w.fill(x0, y, z1, x1, y, z1, B.planks);                    // counter on the south edge
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]])
    w.fill(x, y, z, x, y + 2, z, B.palm_log);
  w.fill(x0, y + 3, z0, x1, y + 3, z1, cloth);
}

// A Paris plane tree: a bark trunk (solid) — the leafy crown is added as decoration.
function planeTree(w, x, y, z, decor, height = 4) {
  w.fill(x, y, z, x, y + height - 1, z, B.bark);
  decor.push({ type: 'tree', x: x + 0.5, y: y + height, z: z + 0.5 });
}

const MAPS = {
  // ------------------------------------------------------------------
  garden: {
    name: 'Practice Garden',
    size: [48, 16, 64],
    build(w) {
      const W = w.sx, D = w.sz;
      w.fill(0, 0, 0, W - 1, 0, D - 1, B.grass);          // ground (top surface at y=1)
      w.fill(4, 0, 2, W - 5, 0, 45, B.sand);              // range floor

      w.fill(0, 1, 0, W - 1, 6, 0, B.bricks);             // perimeter walls
      w.fill(0, 1, D - 1, W - 1, 6, D - 1, B.bricks);
      w.fill(0, 1, 0, 0, 6, D - 1, B.bricks);
      w.fill(W - 1, 1, 0, W - 1, 6, D - 1, B.bricks);

      w.fill(4, 1, 46, W - 5, 1, 46, B.sand_slab);        // firing line (walk over it)

      w.fill(6, 1, 51, 8, 1, 52, B.crate);                // spawn-area crates
      w.set(7, 2, 51, B.crate);
      w.fill(14, 1, 56, 15, 1, 57, B.crate);
      w.set(14, 2, 56, B.crate);
      w.fill(17, 1, 52, 17, 2, 56, B.planks);             // a short wall

      w.fill(38, 1, 50, 44, 3, 56, B.stone);              // tower with half-step stairs
      for (let i = 0; i < 6; i++) {
        const h = 0.5 * (i + 1), x = 32 + i, full = Math.floor(h);
        for (let z = 52; z <= 54; z++) {
          if (full > 0) w.fill(x, 1, z, x, full, z, B.stone);
          if (h % 1) w.set(x, 1 + full, z, B.stone_slab);
        }
      }

      w.fill(6, 1, 30, 14, 3, 30, B.bricks);              // wall with a window
      w.set(9, 2, 30, 0); w.set(10, 2, 30, 0);
      w.fill(31, 1, 34, 34, 1, 34, B.crate);              // low crates
      w.fill(21, 1, 4, 27, 3, 7, B.concrete);             // far platform

      return {
        spawn: { x: 24.5, y: 1, z: 58.5, yaw: 0 },
        buddies: [
          [16.5, 1, 40.5], [24.5, 1, 40.5], [32.5, 1, 40.5],
          [24.5, 1, 30.5, { axis: 'x', min: 18, max: 31, speed: 2.5 }],
          [10, 1, 26.5], [32.5, 1, 32.5], [12.5, 1, 18.5], [36.5, 1, 18.5],
          [24.5, 1, 12.5, { axis: 'x', min: 15, max: 34, speed: 4.5 }],
          [24.5, 4, 5.5],
        ],
      };
    },
  },

  // ------------------------------------------------------------------
  // Oasis: a sandy desert town. Attackers start south, defenders north.
  //   West:  long open street → narrow gate → Site A (courtyard)
  //   Mid:   plaza with a wading pond and palms, side alleys to both sites
  //   East:  covered market lane → Site B (market square)
  oasis: {
    name: 'Oasis',
    size: [96, 14, 96],
    build(w) {
      const S = w.sx;
      const rng = makeRng(2024);
      const G = 2; // ground surface height

      // ground: two layers so the pond can be dug into it
      w.fill(0, 0, 0, S - 1, 0, S - 1, B.sandstone);
      w.fill(0, 1, 0, S - 1, 1, S - 1, B.sand);

      // start fully built-up: blocks of houses with varied heights and materials
      const mats = [B.sandstone, B.sandstone_bricks, B.clay, B.sandstone];
      for (let cz = 0; cz < S / 8; cz++)
        for (let cx = 0; cx < S / 8; cx++) {
          const top = 6 + Math.floor(rng() * 4);
          const m = mats[Math.floor(rng() * mats.length)];
          w.fill(cx * 8, G, cz * 8, cx * 8 + 7, top, cz * 8 + 7, m);
        }
      // tall walls behind the sites (for the big site letters)
      w.fill(6, G, 6, 29, 10, 9, B.sandstone_bricks);
      w.fill(64, G, 6, 89, 10, 9, B.sandstone_bricks);
      // outer town wall
      w.fill(0, G, 0, S - 1, 11, 1, B.sandstone_bricks);
      w.fill(0, G, S - 2, S - 1, 11, S - 1, B.sandstone_bricks);
      w.fill(0, G, 0, 1, 11, S - 1, B.sandstone_bricks);
      w.fill(S - 2, G, 0, S - 1, 11, S - 1, B.sandstone_bricks);

      // then carve out the streets and open areas
      const carve = (x0, z0, x1, z1) => w.fill(x0, G, z0, x1, w.sy - 1, z1, 0);
      carve(38, 82, 57, 91);   // attacker spawn
      carve(40, 4, 55, 13);    // defender spawn
      carve(8, 10, 27, 29);    // Site A
      carve(66, 10, 87, 29);   // Site B
      carve(36, 38, 59, 55);   // mid plaza

      carve(12, 84, 37, 89);   // attackers → west
      carve(10, 34, 15, 89);   // long west street
      carve(11, 30, 14, 33);   // narrow gate into A

      carve(40, 56, 44, 81);   // attackers → mid
      carve(22, 40, 35, 43);   // mid → A alley
      carve(22, 30, 25, 43);   // ...turning north into A

      carve(58, 84, 81, 89);   // attackers → east
      carve(76, 30, 81, 89);   // market lane into B
      carve(60, 46, 69, 50);   // mid → B alley
      carve(66, 30, 70, 50);   // ...turning north into B

      carve(52, 14, 56, 37);   // defenders → mid
      carve(28, 10, 39, 14);   // defenders → A
      carve(56, 10, 65, 14);   // defenders → B

      // --- Site A: tiled courtyard, raised platform, crates, palm ---
      w.fill(8, 1, 10, 27, 1, 29, B.plaza);
      w.fill(14, G, 15, 21, G, 20, B.sandstone_bricks);           // platform
      for (let x = 13; x <= 22; x++) { w.set(x, G, 14, B.sandstone_slab); w.set(x, G, 21, B.sandstone_slab); }
      for (let z = 14; z <= 21; z++) { w.set(13, G, z, B.sandstone_slab); w.set(22, G, z, B.sandstone_slab); }
      w.fill(9, G, 25, 10, G, 26, B.crate); w.set(9, G + 1, 25, B.crate);
      w.fill(24, G, 11, 25, G, 12, B.crate);
      w.set(17, G + 1, 17, B.crate);
      palmTree(w, 25, G, 26);
      paintLetter(w, 'A', 15, 9, 9, B.paint_pink);

      // --- Site B: tiled market square with stalls ---
      w.fill(66, 1, 10, 87, 1, 29, B.plaza);
      stall(w, 70, 15, 74, 17, G, B.cloth_red);
      stall(w, 79, 20, 83, 22, G, B.cloth_teal);
      w.fill(67, G, 25, 68, G, 26, B.crate); w.set(67, G + 1, 25, B.crate);
      w.fill(85, G, 12, 86, G, 12, B.crate);
      w.set(84, G, 27, B.crate);
      palmTree(w, 68, G, 12);
      paintLetter(w, 'B', 74, 9, 9, B.paint_teal);

      // --- Mid plaza: wading pond with step-down edge, palms, crates ---
      for (let x = 43; x <= 52; x++)
        for (let z = 43; z <= 50; z++) {
          const edge = x === 43 || x === 52 || z === 43 || z === 50;
          w.set(x, 1, z, edge ? B.sandstone_slab : B.water);
        }
      palmTree(w, 38, G, 40); palmTree(w, 57, G, 40);
      palmTree(w, 38, G, 53); palmTree(w, 57, G, 53, 6);
      w.fill(47, G, 39, 48, G, 39, B.crate); w.set(47, G + 1, 39, B.crate);
      w.fill(41, G, 47, 41, G, 48, B.crate);

      // --- Long west street: some cover ---
      w.fill(14, G, 60, 15, G, 61, B.crate); w.set(15, G + 1, 60, B.crate);
      w.fill(10, G, 45, 10, G, 46, B.crate);

      // --- Market lane: striped awnings overhead, a few crates ---
      for (const [z0, z1, cloth] of [[50, 56, B.cloth_red], [59, 65, B.cloth_teal], [68, 74, B.cloth_red]])
        w.fill(76, G + 3, z0, 81, G + 3, z1, cloth);
      w.fill(80, G, 62, 81, G, 62, B.crate);
      w.set(76, G, 44, B.crate);

      // --- Spawns: a little decoration ---
      palmTree(w, 39, G, 89); palmTree(w, 56, G, 89);

      return {
        spawn: { x: 47.5, y: G, z: 87.5, yaw: 0 },
        spawns: {
          attack: { x0: 39, z0: 84, x1: 56, z1: 90 },
          defend: { x0: 41, z0: 5, x1: 54, z1: 12 },
        },
        // seed sites. entrances: ways in (attacker side first) — where defenders watch;
        // via: routes attackers take to get there
        sites: {
          A: { x0: 8, z0: 10, x1: 27, z1: 29,
               entrances: [[12.5, 31], [23.5, 31], [28, 12]], via: [[12, 62], [24, 40]] },
          B: { x0: 66, z0: 10, x1: 87, z1: 29,
               entrances: [[78.5, 31], [68, 31], [65, 12]], via: [[78, 62], [64, 48]] },
        },
        mid: [[47, 41], [55, 44], [40, 52]],     // where a defender can hold the middle
        midWatch: [[42, 60], [36, 42], [60, 48]],
        // places bots like to go
        points: [
          [17, 22], [24, 13], [11, 25],          // Site A
          [76, 22], [84, 14], [69, 26],          // Site B
          [47, 52], [55, 41], [39, 45],          // mid plaza
          [12, 60], [12, 38], [12, 80],          // long street
          [78, 60], [78, 40],                    // market lane
          [24, 36], [68, 40], [64, 48],          // alleys
          [33, 12], [60, 12], [54, 26],          // defender paths
          [42, 70], [47, 86], [47, 8],           // attacker path, spawns
        ],
      };
    },
  },
  // ------------------------------------------------------------------
  // Petit Paris: an original Paris-inspired town split by a canal.
  // Attackers start at the station square (south), defenders by the park (north).
  //   West:  long street -> west bridge -> Site A (flower market square)
  //   Mid:   cobbled roundabout with a fountain -> centre bridge -> the garden
  //   East:  long street -> east bridge -> Site B (cafe terrace)
  // You can also wade through the canal (jump to get in and out).
  paris: {
    name: 'Petit Paris',
    size: [96, 18, 96],
    build(w) {
      const S = w.sx, G = 2;
      const rng = makeRng(1789);
      const decor = [];

      w.fill(0, 0, 0, S - 1, 0, S - 1, B.limestone);
      w.fill(0, 1, 0, S - 1, 1, S - 1, B.cobble);

      // city blocks: shops on the ground floor, windows above, a stone cornice, zinc mansard roof
      for (let cz = 0; cz < S / 8; cz++)
        for (let cx = 0; cx < S / 8; cx++) {
          const top = 9 + Math.floor(rng() * 4);
          const shop = rng() < 0.5 ? B.shop_green : B.shop_red;
          for (let y = G; y <= top; y++) {
            const id = y === G ? shop : y >= top - 1 ? B.zinc : y === top - 2 ? B.limestone : B.facade;
            w.fill(cx * 8, y, cz * 8, cx * 8 + 7, y, cz * 8 + 7, id);
          }
        }
      // tall walls behind the sites (for the big letters)
      w.fill(6, G, 6, 32, 12, 9, B.facade);
      w.fill(62, G, 6, 90, 12, 9, B.facade);
      // outer walls
      w.fill(0, G, 0, S - 1, 13, 1, B.limestone);
      w.fill(0, G, S - 2, S - 1, 13, S - 1, B.limestone);
      w.fill(0, G, 0, 1, 13, S - 1, B.limestone);
      w.fill(S - 2, G, 0, S - 1, 13, S - 1, B.limestone);

      const carve = (x0, z0, x1, z1) => w.fill(x0, G, z0, x1, w.sy - 1, z1, 0);
      // big open places
      carve(40, 85, 56, 91);   // attacker spawn: station square
      carve(40, 3, 56, 11);    // defender spawn
      carve(8, 10, 30, 38);    // Site A: flower market
      carve(64, 10, 88, 38);   // Site B: cafe terrace
      carve(38, 14, 58, 38);   // the garden (mid, north of the canal)
      carve(38, 52, 58, 67);   // the roundabout (mid, south of the canal)
      // north side streets
      carve(45, 12, 51, 13);   // defenders -> garden
      carve(26, 5, 39, 11);    // defenders -> A
      carve(57, 5, 70, 11);    // defenders -> B
      carve(31, 20, 37, 25);   // garden <-> A
      carve(59, 20, 63, 25);   // garden <-> B
      // bridge landings north of the canal
      carve(18, 39, 25, 42);
      carve(44, 39, 52, 42);
      carve(71, 39, 78, 42);
      // the canal itself
      carve(2, 43, 93, 48);
      // bridge landings south of the canal
      carve(18, 49, 25, 51);
      carve(44, 49, 52, 51);
      carve(71, 49, 78, 51);
      // south side streets
      carve(44, 68, 52, 84);   // station -> roundabout boulevard
      carve(10, 85, 39, 90);   // station -> west
      carve(10, 52, 17, 90);   // west long street
      carve(10, 49, 25, 52);   // ... to the west bridge
      carve(57, 85, 86, 90);   // station -> east
      carve(79, 52, 86, 90);   // east long street
      carve(71, 49, 86, 52);   // ... to the east bridge
      carve(18, 58, 37, 61);   // roundabout <-> west street
      carve(59, 58, 78, 61);   // roundabout <-> east street

      // canal: one block deep, wade-able; three stone bridges with low parapets
      for (let x = 2; x <= 93; x++)
        for (let z = 43; z <= 48; z++) { w.set(x, 1, z, B.water); w.set(x, 0, z, B.limestone); }
      for (const [x0, x1] of [[18, 25], [44, 52], [71, 78]]) {
        w.fill(x0, 1, 43, x1, 1, 48, B.limestone);              // bridge deck (street level)
        w.fill(x0, G, 43, x0, G, 48, B.limestone_slab);         // parapets
        w.fill(x1, G, 43, x1, G, 48, B.limestone_slab);
        for (const x of [x0, x1]) for (const z of [43, 48]) decor.push({ type: 'lamp', x: x + 0.5, y: G + 0.5, z: z + 0.5 });
      }

      // --- the roundabout: fountain with a gilded column, plane trees, lamps ---
      const fx = 48, fz = 59.5;
      for (let x = 42; x <= 54; x++)
        for (let z = 53; z <= 66; z++) {
          const d = Math.hypot(x + 0.5 - fx - 0.5, z + 0.5 - fz);
          if (d < 3.1) w.set(x, G, z, B.water);
          else if (d < 4.1) w.set(x, G, z, B.limestone);
        }
      w.fill(48, G, 59, 48, G + 3, 59, B.limestone);
      w.set(48, G + 4, 59, B.gilded);
      for (const [x, z] of [[39, 53], [57, 53], [39, 66], [57, 66]]) planeTree(w, x, G, z, decor);
      for (let z = 70; z <= 82; z += 6) { decor.push({ type: 'lamp', x: 44.5, y: G, z: z + 0.5 }); decor.push({ type: 'lamp', x: 52.5, y: G, z: z + 0.5 }); }

      // --- Site A: flower market square ---
      w.fill(8, 1, 10, 30, 1, 38, B.gravel);
      stall(w, 11, 15, 15, 17, G, B.cloth_green);
      stall(w, 21, 27, 25, 29, G, B.cloth_green);
      for (const [x0, z0, x1, z1] of [[17, 20, 19, 21], [10, 32, 12, 33], [26, 14, 27, 16]]) {
        w.fill(x0, G, z0, x1, G, z1, B.limestone);              // planters (waist-high cover)
        decor.push({ type: 'flowers', x0, z0, x1, z1, y: G + 1 });
      }
      w.fill(13, G, 24, 14, G + 1, 25, B.crate);                 // flower crates
      w.set(13, G + 2, 24, B.crate);
      planeTree(w, 28, G, 35, decor); planeTree(w, 9, G, 11, decor);
      for (const [x, y, z] of [[13, G + 1, 17], [23, G + 1, 29]]) decor.push({ type: 'flowers', x0: x - 2, z0: z, x1: x + 2, z1: z, y });
      paintLetter(w, 'A', 17, 10, 9, B.paint_pink);

      // --- Site B: cafe terrace ---
      w.fill(64, 1, 10, 88, 1, 38, B.cobble);
      w.fill(66, G + 3, 10, 86, G + 3, 12, B.cloth_red);          // awning along the cafe front
      for (const x of [66, 76, 86]) decor.push({ type: 'pole', x: x + 0.5, y: G, z: 12.5, h: 3 });   // thin awning poles
      for (const [x, z] of [[68, 15], [72, 15], [80, 15], [84, 15], [70, 19], [82, 19]]) decor.push({ type: 'table', x: x + 0.5, y: G, z: z + 0.5 });
      w.fill(75, G, 22, 77, G + 2, 24, B.iron);                   // news kiosk
      w.fill(75, G + 3, 22, 77, G + 3, 24, B.zinc);
      w.fill(66, G, 30, 68, G, 31, B.limestone);                  // planters
      decor.push({ type: 'flowers', x0: 66, z0: 30, x1: 68, z1: 31, y: G + 1 });
      w.fill(84, G, 28, 85, G, 30, B.limestone);
      decor.push({ type: 'flowers', x0: 84, z0: 28, x1: 85, z1: 30, y: G + 1 });
      w.fill(70, G, 33, 71, G + 1, 33, B.crate);
      planeTree(w, 87, G, 36, decor);
      paintLetter(w, 'B', 74, 10, 9, B.paint_teal);

      // --- the garden: gravel paths, hedges, trees ---
      w.fill(38, 1, 14, 58, 1, 38, B.gravel);
      for (const [x0, z0, x1, z1] of [[40, 18, 44, 18], [52, 18, 56, 18], [40, 30, 44, 30], [52, 30, 56, 30], [47, 24, 49, 25]])
        w.fill(x0, G, z0, x1, G, z1, B.hedge);
      for (const [x, z] of [[39, 15], [57, 15], [39, 37], [57, 37], [48, 33]]) planeTree(w, x, G, z, decor);

      // lamps along the long streets
      for (let z = 56; z <= 84; z += 7) { decor.push({ type: 'lamp', x: 10.5, y: G, z: z + 0.5 }); decor.push({ type: 'lamp', x: 86.5, y: G, z: z + 0.5 }); }
      // the iron tower far away on the horizon
      decor.push({ type: 'tower', x: -70, y: 0, z: -60 });

      return {
        spawn: { x: 48.5, y: G, z: 88.5, yaw: 0 },
        decor,
        spawns: {
          attack: { x0: 41, z0: 85, x1: 55, z1: 90 },
          defend: { x0: 41, z0: 4, x1: 55, z1: 10 },
        },
        sites: {
          A: { x0: 8, z0: 10, x1: 30, z1: 38, entrances: [[21, 40], [33, 22], [30, 8]], via: [[13, 70], [48, 60]] },
          B: { x0: 64, z0: 10, x1: 88, z1: 38, entrances: [[75, 40], [61, 22], [66, 8]], via: [[83, 70], [48, 60]] },
        },
        mid: [[45, 28], [51, 21], [44, 34]],
        midWatch: [[48, 41], [34, 22], [61, 22]],
        points: [
          [18, 24], [24, 13], [12, 30], [76, 27], [84, 14], [68, 34],
          [48, 27], [42, 21], [54, 34], [41, 57], [55, 63], [44, 55],
          [13, 70], [13, 55], [83, 70], [83, 55], [21, 45], [48, 45], [75, 45],
          [48, 76], [48, 88], [48, 7], [30, 22], [62, 22],
        ],
      };
    },
  },
  // ------------------------------------------------------------------
  // Barcelona: an original seaside city, 1.5x bigger than the other maps.
  // Attackers start on the beach (east), defenders in a town square (west).
  //   North:      Site A, the old market hall (green iron, a coloured-glass arcade).
  //               Reached along the seafront and the top street, or up the old-town alley from mid.
  //   Mid:        an eight-sided plaza with a mosaic fountain. A long tree-lined promenade
  //               runs to it from the beach; Silk Street cuts north from the promenade to A's street.
  //   South-west: Site B, a mosaic park with a raised terrace. Reached along the harbour
  //               street, or down the covered passage from mid.
  //   Defenders:  a north lane to A, a south lane to B, a kinked street to mid, and a cross
  //               street linking the north lane to the old-town alley.
  barcelona: {
    name: 'Barcelona',
    size: [144, 20, 144],
    build(w) {
      const S = w.sx, G = 2;
      const rng = makeRng(1888);
      const decor = [];

      w.fill(0, 0, 0, S - 1, 0, S - 1, B.gothic);
      w.fill(0, 1, 0, S - 1, 1, S - 1, B.panot);

      // city blocks: a shop at street level, painted floors with balconies, terracotta roof
      const walls = [B.bcn_ochre, B.bcn_pink, B.bcn_cream, B.bcn_ochre];
      const shops = [B.shop_green, B.shop_red, B.shop_blue];
      for (let cz = 0; cz < S / 8; cz++)
        for (let cx = 0; cx < S / 8; cx++) {
          const top = 9 + Math.floor(rng() * 5);
          const wall = walls[Math.floor(rng() * walls.length)], shop = shops[Math.floor(rng() * shops.length)];
          for (let y = G; y <= top; y++) {
            const id = y === G ? shop : y === top ? B.terracotta : y === top - 1 ? B.stucco : wall;
            w.fill(cx * 8, y, cz * 8, cx * 8 + 7, y, cz * 8 + 7, id);
          }
        }
      // tall plain walls for the big site letters
      w.fill(46, G, 3, 80, 14, 7, B.stucco);
      w.fill(22, G, 100, 43, 13, 103, B.stucco);
      // outer walls (the east side is the sea)
      w.fill(0, G, 0, S - 1, 15, 1, B.gothic);
      w.fill(0, G, S - 2, S - 1, 15, S - 1, B.gothic);
      w.fill(0, G, 0, 1, 15, S - 1, B.gothic);

      const carve = (x0, z0, x1, z1) => w.fill(x0, G, z0, x1, w.sy - 1, z1, 0);
      // big open places
      carve(6, 56, 23, 75);      // defender spawn: the town square
      carve(118, 60, S - 1, 92); // attacker spawn: the beach
      carve(50, 8, 76, 32);      // Site A: the market hall
      carve(24, 104, 52, 128);   // Site B: the mosaic park
      carve(56, 56, 82, 82);     // mid plaza (its corners are cut off below)
      // attacker side
      carve(83, 64, 117, 74);    // the promenade: beach -> mid
      carve(120, 14, 127, 59);   // seafront street, north
      carve(84, 14, 127, 21);    // top street, west to A
      carve(77, 15, 83, 20);     // A main gate
      carve(90, 22, 94, 63);     // Silk Street: promenade -> top street
      carve(118, 93, 127, 117);  // seafront street, south
      carve(58, 110, 127, 117);  // harbour street -> B
      carve(53, 111, 57, 116);   // B main gate
      carve(84, 101, 98, 109);   // the old shipyard (a side room off the harbour street)
      // mid
      carve(64, 33, 68, 55);     // old-town alley: mid -> A
      carve(44, 73, 55, 77);     // mid -> covered passage
      carve(44, 73, 49, 103);    // covered passage -> B
      // defender side
      carve(16, 20, 22, 55);     // north lane
      carve(16, 20, 49, 25);     // ... east into A
      carve(12, 76, 19, 111);    // south lane
      carve(12, 106, 23, 112);   // ... east into B
      carve(24, 60, 42, 64);     // spawn -> mid, with a kink
      carve(38, 60, 42, 70);
      carve(42, 66, 55, 70);
      carve(23, 42, 63, 46);     // cross street: north lane <-> old-town alley

      // the mid plaza has its corners cut off (an eight-sided square)
      for (let x = 56; x <= 82; x++)
        for (let z = 56; z <= 82; z++) {
          const dx = Math.min(x - 56, 82 - x), dz = Math.min(z - 56, 82 - z);
          if (dx + dz < 6) { w.fill(x, G, z, x, 10, z, B.bcn_cream); w.set(x, 11, z, B.terracotta); }
        }

      // ---------------- floors ----------------
      const floor = (x0, z0, x1, z1, id) => w.fill(x0, 1, z0, x1, 1, z1, id);
      floor(83, 67, 117, 71, B.wave_tile);          // promenade walk
      floor(64, 33, 68, 55, B.cobble);              // old town
      floor(23, 42, 63, 46, B.cobble);
      floor(50, 8, 76, 32, B.plaza);                // market hall
      floor(24, 104, 52, 128, B.gravel);            // park
      floor(84, 101, 98, 109, B.planks);            // shipyard
      // beach: boardwalk, sand, then the sea (shallow, you can wade in)
      floor(118, 60, 121, 92, B.planks);
      floor(122, 60, 135, 92, B.sand);
      for (let x = 136; x < S; x++)
        for (let z = 60; z <= 92; z++) { w.set(x, 1, z, B.water); w.set(x, 0, z, B.sand); }
      decor.push({ type: 'sea', x: S + 150, y: 1.85, z: 72, w: 300, d: 600 });

      // ---------------- the old-town alley: stone walls and arches overhead ----------------
      for (let z = 33; z <= 55; z++)
        for (let y = G; y <= 12; y++)
          for (const x of [63, 69]) if (w.get(x, y, z)) w.set(x, y, z, B.gothic);
      for (const z of [39, 49]) {
        w.fill(64, G + 4, z, 68, G + 5, z, B.gothic);
        w.set(64, G + 3, z, B.gothic_slab); w.set(68, G + 3, z, B.gothic_slab);
      }
      for (let x = 24; x <= 62; x++)
        for (let y = G; y <= 12; y++)
          for (const z of [41, 47]) if (w.get(x, y, z)) w.set(x, y, z, B.gothic);
      w.fill(36, G + 4, 42, 36, G + 5, 46, B.gothic);           // an arch over the cross street
      w.fill(28, G, 43, 28, G, 44, B.crate);                    // a little cover

      // ---------------- Site A: the market hall ----------------
      // coloured-glass arcade along the north wall, on green iron pillars
      w.fill(50, G + 4, 8, 76, G + 4, 11, B.stained_glass);
      for (let x = 50; x <= 76; x += 6) w.fill(x, G, 11, x, G + 3, 11, B.iron_green);
      // a few lone pillars out in the hall (thin cover)
      for (const [x, z] of [[56, 19], [70, 19], [56, 27], [70, 27]]) w.fill(x, G, z, x, G + 3, z, B.iron_green);
      // market stalls: a counter, iron posts and a striped roof
      const marketStall = (x0, z0, x1, z1, cloth) => {
        w.fill(x0, G, z1, x1, G, z1, B.planks);
        for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) w.fill(x, G, z, x, G + 2, z, B.iron_green);
        w.fill(x0, G + 3, z0, x1, G + 3, z1, cloth);
        decor.push({ type: 'flowers', x0: x0 + 1, z0: z1, x1: x1 - 1, z1, y: G + 1 });
      };
      marketStall(52, 13, 55, 15, B.cloth_yellow);
      marketStall(71, 13, 74, 15, B.cloth_red);
      marketStall(60, 23, 64, 25, B.cloth_green);
      w.fill(73, G, 29, 74, G + 1, 30, B.crate); w.set(73, G + 2, 29, B.crate);
      w.fill(51, G, 30, 52, G, 31, B.crate);
      w.set(75, G, 22, B.crate);
      w.fill(58, G, 30, 60, G, 30, B.crate);
      paintLetter(w, 'A', 61, 13, 7, B.paint_pink);

      // ---------------- mid: the eight-sided plaza with a mosaic fountain ----------------
      const fx = 69.5, fz = 69.5;
      for (let x = 64; x <= 75; x++)
        for (let z = 64; z <= 75; z++) {
          const d = Math.hypot(x + 0.5 - fx, z + 0.5 - fz);
          if (d < 3.2) w.set(x, G, z, B.water);
          else if (d < 4.3) w.set(x, G, z, B.trencadis_slab);
        }
      w.fill(69, G, 69, 69, G + 2, 69, B.trencadis);
      w.set(69, G + 3, 69, B.gilded);
      for (const [x, z] of [[60, 60], [78, 60], [60, 78], [78, 78]]) orangeTree(w, x, G, z, decor);
      for (const [x0, z0, x1, z1] of [[61, 64, 61, 67], [77, 71, 77, 74], [66, 59, 68, 59], [70, 79, 72, 79]])
        w.fill(x0, G, z0, x1, G, z1, B.trencadis_slab);            // mosaic benches (low cover)
      w.fill(57, G, 63, 58, G + 1, 63, B.crate);
      for (const [x, z] of [[57, 70], [81, 63], [69, 57], [63, 81]]) decor.push({ type: 'lamp', x: x + 0.5, y: G, z: z + 0.5 });

      // ---------------- the promenade: plane trees, flower kiosks, cafe tables ----------------
      for (const x of [86, 98, 104, 110, 116]) planeTree(w, x, G, 65, decor);
      for (const x of [86, 92, 98, 104, 110, 116]) planeTree(w, x, G, 73, decor);
      for (const [x0, cloth] of [[94, B.cloth_yellow], [106, B.cloth_red]]) {
        w.fill(x0, G, 68, x0 + 2, G + 1, 70, B.iron_green);       // kiosk
        w.fill(x0 - 1, G + 2, 67, x0 + 3, G + 2, 71, cloth);       // its roof
        decor.push({ type: 'flowers', x0: x0 - 1, z0: 67, x1: x0 + 3, z1: 67, y: G });
        decor.push({ type: 'flowers', x0: x0 - 1, z0: 71, x1: x0 + 3, z1: 71, y: G });
      }
      for (const [x, z] of [[88, 67], [88, 71], [101, 67], [113, 71]]) decor.push({ type: 'table', x: x + 0.5, y: G, z: z + 0.5 });
      for (let x = 89; x <= 115; x += 13) { decor.push({ type: 'lamp', x: x + 0.5, y: G, z: 64.5 }); decor.push({ type: 'lamp', x: x + 0.5, y: G, z: 74.5 }); }

      // ---------------- the attackers' streets ----------------
      w.fill(100, G, 15, 101, G + 1, 16, B.crate);                 // top street
      w.fill(112, G, 19, 112, G, 20, B.crate);
      w.set(88, G, 21, B.crate);
      for (const [x, z] of [[105, 20], [108, 20]]) decor.push({ type: 'table', x: x + 0.5, y: G, z: z + 0.5 });
      for (let z = 24; z <= 56; z += 10) decor.push({ type: 'lamp', x: 127.5, y: G, z: z + 0.5 });
      w.fill(120, G, 40, 121, G, 41, B.crate);                     // seafront north
      w.set(92, G, 44, B.crate);                                   // Silk Street
      w.fill(90, G, 31, 90, G + 1, 32, B.crate);
      w.fill(123, G, 101, 124, G + 1, 102, B.crate);               // seafront south
      // harbour street: crates, barrels and iron bollards along the quay
      w.fill(70, G, 111, 71, G + 1, 112, B.crate); w.set(70, G + 2, 111, B.crate);
      w.set(82, G, 116, B.crate);
      w.fill(100, G, 110, 101, G, 110, B.crate);
      w.fill(112, G, 114, 112, G + 1, 115, B.crate);
      w.fill(62, G, 116, 63, G, 116, B.crate);
      for (let x = 60; x <= 124; x += 8) w.set(x, G, 117, B.iron);
      // the old shipyard: red brick inside, stacks of crates
      for (let x = 83; x <= 99; x++)
        for (let y = G; y <= 10; y++)
          for (const z of [100]) if (w.get(x, y, z)) w.set(x, y, z, B.brick_red);
      for (let z = 100; z <= 109; z++)
        for (let y = G; y <= 10; y++)
          for (const x of [83, 99]) if (w.get(x, y, z)) w.set(x, y, z, B.brick_red);
      w.fill(86, G, 102, 87, G + 2, 103, B.crate);
      w.fill(94, G, 104, 96, G + 1, 105, B.crate);
      w.set(90, G, 107, B.crate);

      // ---------------- the beach (attacker spawn) ----------------
      for (const [x, z] of [[124, 61], [132, 62], [124, 91], [133, 90]]) palmTree(w, x, G, z, 6);
      for (const [x, z, color] of [[129, 67, 'coral'], [131, 79, 'blue'], [127, 86, 'coral'], [134, 73, 'blue']])
        decor.push({ type: 'umbrella', x: x + 0.5, y: G, z: z + 0.5, color });

      // ---------------- the covered passage: a roof on arches ----------------
      w.fill(44, G + 4, 80, 49, G + 4, 98, B.brick_red);
      for (let z = 80; z <= 98; z += 6) { w.set(44, G + 3, z, B.gothic_slab); w.set(49, G + 3, z, B.gothic_slab); }
      w.set(48, G, 88, B.crate);

      // ---------------- Site B: the mosaic park ----------------
      // a raised stone terrace in the south-west corner with mosaic steps and a wavy mosaic bench
      w.fill(27, G, 120, 35, G, 128, B.gothic);
      for (let x = 26; x <= 36; x++) w.set(x, G, 119, B.trencadis_slab);
      for (let z = 120; z <= 128; z++) { w.set(26, G, z, B.trencadis_slab); w.set(36, G, z, B.trencadis_slab); }
      for (let x = 28; x <= 34; x++) w.set(x, G + 1, x % 2 ? 122 : 123, B.trencadis_slab);
      // a mosaic planter in the middle, benches and a hedge
      w.fill(38, G, 110, 39, G, 111, B.trencadis);
      decor.push({ type: 'flowers', x0: 38, z0: 110, x1: 39, z1: 111, y: G + 1 });
      w.fill(30, G, 113, 33, G, 113, B.trencadis_slab);
      w.fill(41, G, 117, 44, G, 117, B.trencadis_slab);
      w.fill(46, G, 122, 50, G, 122, B.hedge);
      w.fill(49, G, 106, 50, G + 1, 107, B.crate);
      w.fill(34, G, 116, 35, G + 1, 116, B.crate); w.set(34, G + 2, 116, B.crate);
      w.fill(45, G, 111, 46, G, 112, B.trencadis);
      decor.push({ type: 'flowers', x0: 45, z0: 111, x1: 46, z1: 112, y: G + 1 });
      for (const [x, z] of [[28, 106], [50, 126], [42, 125]]) orangeTree(w, x, G, z, decor);
      palmTree(w, 25, G, 116, 6);
      paintLetter(w, 'B', 30, 11, 103, B.paint_teal);

      // ---------------- the defenders' side ----------------
      for (const [x, z] of [[7, 57], [22, 57], [7, 74], [22, 74]]) orangeTree(w, x, G, z, decor);
      for (const [x, z] of [[14, 57], [14, 74]]) decor.push({ type: 'lamp', x: x + 0.5, y: G, z: z + 0.5 });
      w.fill(34, G, 21, 35, G + 1, 22, B.crate);                   // north lane -> A
      w.set(16, G, 38, B.crate);
      w.fill(18, G, 92, 19, G + 1, 93, B.crate);                   // south lane
      w.fill(30, G, 62, 30, G, 63, B.crate);                       // spawn -> mid

      // the basilica's spires on the horizon
      decor.push({ type: 'spires', x: -60, y: 0, z: -70 });

      return {
        spawn: { x: 128.5, y: G, z: 76.5, yaw: Math.PI / 2 },
        decor,
        spawns: {
          attack: { x0: 122, z0: 64, x1: 133, z1: 88, yaw: Math.PI / 2 },    // face west
          defend: { x0: 8, z0: 58, x1: 21, z1: 73, yaw: -Math.PI / 2 },     // face east
        },
        sites: {
          A: { x0: 50, z0: 8, x1: 76, z1: 32, entrances: [[80, 18], [66, 35], [47, 23]], via: [[104, 18], [92, 42], [66, 50]] },
          B: { x0: 24, z0: 104, x1: 52, z1: 128, entrances: [[56, 114], [46, 101], [21, 109]], via: [[96, 114], [46, 88]] },
        },
        mid: [[69, 60], [60, 70], [77, 76], [62, 77]],
        midWatch: [[84, 69], [66, 50], [46, 75], [50, 68]],
        points: [
          [56, 20], [70, 22], [63, 29], [74, 12],                   // Site A
          [32, 110], [44, 122], [31, 125], [48, 108],               // Site B
          [69, 62], [61, 70], [76, 77], [63, 76],                   // mid
          [100, 69], [112, 70], [88, 69],                           // promenade
          [123, 30], [104, 18], [92, 40], [80, 18],                 // north routes
          [123, 104], [96, 114], [70, 114], [90, 105],              // south routes
          [66, 44], [46, 88], [40, 44], [19, 38], [15, 92], [33, 62], [50, 68],
          [128, 76], [14, 66],                                      // spawns
        ],
      };
    },
  },
};

// A little orange tree: a short trunk (solid) with a round crown full of oranges (decoration).
function orangeTree(w, x, y, z, decor) {
  w.fill(x, y, z, x, y + 2, z, B.bark);
  decor.push({ type: 'orange', x: x + 0.5, y: y + 2.2, z: z + 0.5 });
}
