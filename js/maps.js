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
};
