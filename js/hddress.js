// HD architecture (part of the HD look: hd.js, hdworld.js). Reads the map's blocks and dresses
// them as real buildings — none of this changes the game (collisions, shots: still the blocks),
// and nothing sticks out more than ~40 cm (balconies, high above the street):
//
//   - windows on every facade, in a regular rhythm per floor, in each city's style:
//       Barcelona: tall windows in moulded surrounds, louvred shutters (open, closed or half
//                  down), wrought-iron balconies on the upper floors, iron grilles on the ground
//       Paris:     tall French windows in stone surrounds with little iron railings
//       Oasis:     small deep windows with wooden lintels and lattice screens
//   - doors and shopfronts where the map has shop blocks
//   - cornices where the facade meets the roof, parapets with tiled coping (Barcelona), sloping
//     zinc mansard roofs with dormer windows (Paris), crenellated parapets (Oasis)
//   - round tree trunks (instead of 1 x 1 columns), palms with real fronds, cast-iron columns,
//     harbour bollards
//
// Geometry goes into the world's own meshes (hdworld.js Geo), so it gets the same materials, light
// bouncing and shadows as the blocks.

const HDDress = (() => {
  if (!HD.on) return null;

  const G = 2;                                       // the maps' street level (maps.js)
  const name = id => (id && BLOCK_DEFS[id] ? BLOCK_DEFS[id].name : '');
  const WALL = {
    bcn_ochre: 'bcn', bcn_pink: 'bcn', bcn_cream: 'bcn', bcn_ochre_plain: 'bcn', bcn_pink_plain: 'bcn', bcn_cream_plain: 'bcn',
    facade: 'paris', sandstone: 'oasis', sandstone_bricks: 'oasis', clay: 'oasis',
  };
  const ORIGINAL_WINDOW = new Set(['bcn_ochre', 'bcn_pink', 'bcn_cream', 'facade']);
  const SHOP = new Set(['shop_green', 'shop_red', 'shop_blue']);
  const SHOP_COL = { shop_green: 0x2a5e4a, shop_red: 0x7a2832, shop_blue: 0x284e80 };

  // a little random number for each spot (the same every time)
  function hash(x, y, z, k = 0) {
    let h = (x * 374761393 + y * 668265263 + z * 2147483647 + k * 1274126177) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

  function prepare(world, spec) {
    const { sx, sy, sz } = world;
    const at = (x, y, z) => world.get(x, y, z);
    const full = id => id !== 0 && !BLOCK_DEFS[id].h;
    const nm = (x, y, z) => name(at(x, y, z));
    const cell = (x, y, z) => (y * sz + z) * sx + x;
    const hide = new Uint8Array(sx * sy * sz);          // blocks drawn as something else

    // ---- things that replace whole blocks: trunks, palms, columns, bollards ----
    const trunks = [], palms = [], columns = [], bollards = [];
    const lone = (x, y, z, n) => ![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => nm(x + dx, y, z + dz) === n);
    for (let y = 0; y < sy; y++)
      for (let z = 0; z < sz; z++)
        for (let x = 0; x < sx; x++) {
          const n = nm(x, y, z);
          if (!n) continue;
          if ((n === 'bark' || n === 'palm_log') && nm(x, y - 1, z) !== n && lone(x, y, z, n)) {
            let h = 0;
            while (nm(x, y + h, z) === n) { hide[cell(x, y + h, z)] = 1; h++; }
            (n === 'bark' ? trunks : palms).push({ x, y, z, h });
          } else if (n === 'iron_green' && nm(x, y - 1, z) !== n && lone(x, y, z, n)) {
            let h = 0;
            while (nm(x, y + h, z) === n && lone(x, y + h, z, n)) { hide[cell(x, y + h, z)] = 1; h++; }
            columns.push({ x, y, z, h });
          } else if (n === 'iron' && lone(x, y, z, n) && !at(x, y + 1, z) && nm(x, y - 1, z) !== n) {
            hide[cell(x, y, z)] = 1;
            bollards.push({ x, y, z });
          } else if (n === 'palm_leaves') hide[cell(x, y, z)] = 1;
        }

    // ---- smooth, organic shapes: Gaudi's mosaic (and the dome on it), gilding, hedges ----
    const smooth = new Uint8Array(sx * sy * sz);
    const SMOOTH = new Set(['trencadis', 'trencadis_slab', 'gilded', 'hedge']);
    for (let i = 0; i < smooth.length; i++) if (SMOOTH.has(name(world.data[i]))) smooth[i] = 1;
    {                                                 // terracotta touching the mosaic is its dome
      const stack = [];
      for (let i = 0; i < smooth.length; i++) if (smooth[i] && name(world.data[i]) !== 'hedge') stack.push(i);
      while (stack.length) {
        const i = stack.pop();
        const x = i % sx, z = Math.floor(i / sx) % sz, y = Math.floor(i / (sx * sz));
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const qx = x + dx, qy = y + dy, qz = z + dz;
          if (qx < 0 || qy < 0 || qz < 0 || qx >= sx || qy >= sy || qz >= sz) continue;
          const j = cell(qx, qy, qz);
          if (!smooth[j] && name(world.data[j]) === 'terracotta' && !WALL[nm(qx, qy - 2, qz)]) { smooth[j] = 1; stack.push(j); }
        }
      }
    }
    for (let i = 0; i < smooth.length; i++) if (smooth[i]) hide[i] = 1;

    // ---- restyled / hidden faces ----
    const wallBelow = (x, y, z) => {                    // the facade under a roof block
      for (let k = 1; k <= 4; k++) { const id = at(x, y - k, z); if (WALL[name(id)]) return id; }
      return 0;
    };
    const roofExposed = (x, y, z) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => !full(at(x + dx, y, z + dz)));
    function face(x, y, z, id, f, sp) {
      if (hide[cell(x, y, z)]) return null;
      const n = name(id);
      if (n === 'zinc' && nm(x, y + 1, z) !== 'zinc' && nm(x, y - 1, z) === 'zinc') {
        // the top of a mansard: the sloping roof (below) replaces the edges
        if (f.kind === 'side') return null;
        if (f.kind === 'top' && roofExposed(x, y, z)) return null;
      }
      if (n === 'zinc' && nm(x, y + 1, z) === 'zinc' && f.kind === 'side') return null;
      if (n === 'terracotta' && f.kind === 'side') {       // Barcelona parapet: the house's own plaster
        const w = wallBelow(x, y, z);
        if (w) return spec[w].side;
      }
      if (SHOP.has(n) && f.kind === 'side' && WALL[nm(x, y + 1, z)] === 'bcn') return spec[B.plinth].side;   // a door in the stone base
      return undefined;
    }

    function build(api) {
      const { Geo, layer, ratio, FACE } = api;
      const M = {};                                     // material shortcuts: [layer, ratio]
      const mat = (m, col) => [layer(m), ratio(m, col)];
      let g = null;                                     // the chunk geometry being filled

      // ---------- geometry helpers, in a face's frame: X along the wall, Y up, Z out ----------
      let F = null;
      function setFrame(x, y, z, f) {
        let o = null, best = Infinity;
        for (const cc of f.c) {
          const p = [x + cc[0], y + cc[1], z + cc[2]];
          if (cc[1] !== 0) continue;
          const u = dot(p, f.u);
          if (u < best) { best = u; o = p; }
        }
        F = { o, X: f.u, Y: [0, 1, 0], Z: f.n };
        g = api.geo(x + 0.5, z + 0.5);
      }
      const W = (X, Y, Z) => [F.o[0] + F.X[0] * X + F.Y[0] * Y + F.Z[0] * Z,
                               F.o[1] + F.X[1] * X + F.Y[1] * Y + F.Z[1] * Z,
                               F.o[2] + F.X[2] * X + F.Y[2] * Y + F.Z[2] * Z];
      const WN = (X, Y, Z) => [F.X[0] * X + F.Y[0] * Y + F.Z[0] * Z, F.X[1] * X + F.Y[1] * Y + F.Z[1] * Z, F.X[2] * X + F.Y[2] * Y + F.Z[2] * Z];
      function quadW(p, n, m) {                         // 4 world points (counter-clockwise from outside)
        const vs = p.map(q => g.vert(q[0], q[1], q[2], n[0], n[1], n[2], 0, 0, m[0], 0, m[1]));
        g.quad(vs[0], vs[1], vs[2], vs[3]);
      }
      // a box in the frame (back face against the wall left out)
      function box(x0, y0, z0, x1, y1, z1, m, back = false) {
        for (const fc of FACES) {
          const d = fc.dir;
          if (d[2] === -1 && !back) continue;
          const pts = fc.c.map(c => W(c[0] ? x1 : x0, c[1] ? y1 : y0, c[2] ? z1 : z0));
          quadW(pts, WN(d[0], d[1], d[2]), m);
        }
      }
      // a flat panel facing out, at depth z
      function panel(x0, y0, x1, y1, z, m) {
        quadW([W(x0, y0, z), W(x1, y0, z), W(x1, y1, z), W(x0, y1, z)], WN(0, 0, 1), m);
      }
      // a moulding: profile [[out, up], ...] (bottom to top) run along the face from X=0 to 1;
      // sL / sR: +1 the wall turns away at that end (mitre outwards), -1 it turns in, 0 straight on
      function extrude(profile, yBase, sL, sR, m, capL = false, capR = false) {
        for (let i = 0; i < profile.length - 1; i++) {
          const [z0, y0] = profile[i], [z1, y1] = profile[i + 1];
          const dz = z1 - z0, dy = y1 - y0, l = Math.hypot(dz, dy) || 1;
          const n = WN(0, -dz / l, dy / l);
          quadW([W(-sL * z0, yBase + y0, z0), W(1 + sR * z0, yBase + y0, z0), W(1 + sR * z1, yBase + y1, z1), W(-sL * z1, yBase + y1, z1)], n, m);
        }
        const cap = (X, dir) => {                        // close an open end
          const c = profile.map(([z, y]) => W(X, yBase + y, z));
          const n = WN(dir, 0, 0);
          const vs = c.map(q => g.vert(q[0], q[1], q[2], n[0], n[1], n[2], 0, 0, m[0], 0, m[1]));
          for (let i = 1; i < vs.length - 1; i++) (dir < 0 ? g.tri(vs[0], vs[i], vs[i + 1]) : g.tri(vs[0], vs[i + 1], vs[i]));
        };
        if (capL) cap(0, -1);
        if (capR) cap(1, 1);
      }
      // a turned shape (trunks, columns, bollards) in world space: rings [[y, r, ox, oz], ...]
      function lathe(cx, cz, rings, seg, m, wobble = 0, seed = 0, top = false) {
        const g2 = api.geo(cx, cz);
        const rows = [];
        const rRef = rings.reduce((s, r) => s + r[1], 0) / rings.length;
        for (let i = 0; i < rings.length; i++) {
          const [y, r, ox = 0, oz = 0] = rings[i];
          const [yp, rp] = rings[Math.max(0, i - 1)], [yn, rn] = rings[Math.min(rings.length - 1, i + 1)];
          const slope = (rn - rp) / Math.max(1e-4, yn - yp);
          const row = [];
          for (let k = 0; k <= seg; k++) {
            const a = (k / seg) * Math.PI * 2;
            const wob = wobble ? 1 + wobble * (hash(seed, i, k % seg) - 0.5) : 1;
            const ca = Math.cos(a), sa = Math.sin(a);
            const nl = Math.hypot(1, slope);
            row.push(g2.vert(cx + ox + ca * r * wob, y, cz + oz + sa * r * wob, ca / nl, -slope / nl, sa / nl,
              a * rRef, y, m[0], 1024, m[1]));
          }
          rows.push(row);
        }
        for (let i = 0; i < rows.length - 1; i++)
          for (let k = 0; k < seg; k++) g2.quad(rows[i][k], rows[i + 1][k], rows[i + 1][k + 1], rows[i][k + 1]);
        if (top) {
          const [y, , ox = 0, oz = 0] = rings[rings.length - 1];
          const c = g2.vert(cx + ox, y, cz + oz, 0, 1, 0, 0, 0, m[0], 1024, m[1]);
          const last = rows[rows.length - 1];
          for (let k = 0; k < seg; k++) g2.tri(c, last[k + 1], last[k]);
        }
      }

      // what's next to a face, along the wall (for mitres): +1 outer corner, -1 inner, 0 straight
      function endType(x, y, z, f, dir) {
        const t = dir < 0 ? [-f.u[0], -f.u[1], -f.u[2]] : f.u;
        const qx = x + t[0], qy = y, qz = z + t[2];
        if (!full(at(qx, qy, qz))) return 1;
        return full(at(qx + f.n[0], qy, qz + f.n[2])) ? -1 : 0;
      }
      // does the face at the next block along the wall have the same moulding?
      const sameAlong = (x, y, z, f, dir, test) => {
        const t = dir < 0 ? [-f.u[0], 0, -f.u[2]] : f.u;
        return test(x + t[0], y, z + t[2], f);
      };
      const exposed = (x, y, z, f) => !full(at(x + f.n[0], y + f.n[1], z + f.n[2])) || hidden(x + f.n[0], y + f.n[1], z + f.n[2]);

      // ---------- materials ----------
      const STONE_LIGHT = mat('ashlar', 0xe6dccb), STONE_PARIS = mat('ashlar', 0xeee6d4), STONE_BCN = mat('ashlar', 0xd8cdb8);
      const MOULD_BCN = mat('plaster', 0xf2e8d6);
      const IRON = mat('paint', 0x26282c);
      const FRAME_WHITE = mat('paint', 0xeeebe2), FRAME_DARK = mat('paint', 0x3a4038);
      const GLASS = mat('clearglass', 0x1e252c), GLASS_CURTAIN = mat('clearglass', 0x343b44);
      const GLASS_SHOP = mat('clearglass', 0x3a3229), GLASS_SHOP2 = mat('clearglass', 0x2c3036);   // a dim shop inside
      const TILE = mat('rasilla', null);
      const ZINC = mat('zinc', 0x7a8896), ZINC_DARK = mat('zinc', 0x5e6a76);
      const WOOD = mat('planks', 0x7a5636);
      const DARK = mat('render', 0x2c2420);
      const SHUTTERS = [0x4a6b52, 0x6b4b34, 0x5b7a86, 0x3f5e45, 0x8a6e4a].map(c => mat('louver', c));
      const SHUTTERS_OASIS = [0x7a5a3a, 0x5e8a8a, 0x8a4a3a].map(c => mat('louver', c));

      // ================= windows =================
      function bcnWindow(x, y, z, f, tall, upper, ground) {
        const s0 = ground ? 0.15 : 0.05, H = tall ? 1.72 : 0.85;
        const xa = 0.12, xb = 0.88, top = s0 + H;
        const curtain = hash(x, y, z, 3) < 0.25;
        panel(xa, s0, xb, top, 0.004, curtain ? GLASS_CURTAIN : GLASS);
        // window frame + glazing bars
        const fr = FRAME_WHITE;
        box(xa, s0, 0, xa + 0.05, top, 0.035, fr); box(xb - 0.05, s0, 0, xb, top, 0.035, fr);
        box(xa, top - 0.05, 0, xb, top, 0.035, fr); box(xa, s0, 0, xb, s0 + 0.05, 0.035, fr);
        box(0.48, s0, 0, 0.52, top, 0.03, fr);
        if (tall) box(xa, s0 + H * 0.72, 0, xb, s0 + H * 0.72 + 0.035, 0.03, fr);
        // moulded surround and a little cornice on top
        box(xa - 0.08, s0, 0, xa, top + 0.08, 0.025, MOULD_BCN); box(xb, s0, 0, xb + 0.08, top + 0.08, 0.025, MOULD_BCN);
        box(xa - 0.08, top, 0, xb + 0.08, top + 0.08, 0.025, MOULD_BCN);
        box(xa - 0.12, top + 0.08, 0, xb + 0.12, top + 0.13, 0.06, MOULD_BCN);
        // shutters (persianes): open against the wall, closed, or half down
        const sh = SHUTTERS[Math.floor(hash(Math.floor(x / 8), 0, Math.floor(z / 8), 7) * SHUTTERS.length)];
        const v = hash(x, y, z, 1);
        if (v < 0.4) {
          const w = (xb - xa) / 2;
          box(xa - 0.08 - w, s0, 0.025, xa - 0.08, top, 0.05, sh); box(xb + 0.08, s0, 0.025, xb + 0.08 + w, top, 0.05, sh);
        } else if (v < 0.62) {
          box(xa + 0.01, s0, 0.012, 0.5, top - 0.01, 0.04, sh); box(0.5, s0, 0.012, xb - 0.01, top - 0.01, 0.04, sh);
        } else if (v < 0.85) {
          box(xa + 0.01, top - H * (0.35 + 0.4 * hash(x, y, z, 2)), 0.012, xb - 0.01, top - 0.01, 0.04, sh);
        }
        // sill
        box(xa - 0.1, s0 - 0.06, 0, xb + 0.1, s0, upper ? 0.05 : 0.08, STONE_BCN);
        if (upper && tall) {
          // wrought-iron balcony on a stone slab with two brackets
          const bx0 = -0.12, bx1 = 1.12, bz = 0.42, ry = s0 + 0.95;
          box(bx0, s0 - 0.1, 0, bx1, s0 - 0.02, bz, STONE_BCN);
          for (const bx of [0.08, 0.92]) box(bx - 0.04, s0 - 0.3, 0, bx + 0.04, s0 - 0.1, 0.25, STONE_BCN);
          box(bx0 + 0.02, ry, bz - 0.05, bx1 - 0.02, ry + 0.04, bz - 0.01, IRON);
          box(bx0 + 0.02, s0 + 0.04, bz - 0.04, bx1 - 0.02, s0 + 0.07, bz - 0.02, IRON);
          for (const sx of [bx0 + 0.02, bx1 - 0.06]) {
            box(sx, ry, 0, sx + 0.04, ry + 0.04, bz - 0.01, IRON);
            for (let k = 1; k < 4; k++) box(sx + 0.01, s0 - 0.02, k * bz / 4 - 0.008, sx + 0.025, ry, k * bz / 4 + 0.008, IRON);
          }
          for (let bx = bx0 + 0.1; bx < bx1 - 0.05; bx += 0.1) box(bx - 0.008, s0 - 0.02, bz - 0.036, bx + 0.008, ry, bz - 0.022, IRON);
        } else if (ground) {
          // an iron grille in front of a ground-floor window
          for (let k = 0; k < 6; k++) { const bx = xa + 0.06 + k * (xb - xa - 0.12) / 5; box(bx - 0.01, s0, 0.07, bx + 0.01, top, 0.09, IRON); }
          for (const yy of [s0 + 0.1, top - 0.1]) box(xa, yy - 0.012, 0.06, xb, yy + 0.012, 0.1, IRON);
        }
      }

      function parisWindow(x, y, z, f, tall) {
        const s0 = 0.25, H = tall ? 1.95 : 0.9;
        const xa = 0.1, xb = 0.9, top = s0 + H;
        panel(xa, s0, xb, top, 0.004, hash(x, y, z, 3) < 0.3 ? GLASS_CURTAIN : GLASS);
        const fr = FRAME_WHITE;
        box(xa, s0, 0, xa + 0.05, top, 0.04, fr); box(xb - 0.05, s0, 0, xb, top, 0.04, fr);
        box(xa, top - 0.05, 0, xb, top, 0.04, fr); box(xa, s0, 0, xb, s0 + 0.06, 0.04, fr);
        box(0.48, s0, 0, 0.52, top, 0.035, fr);
        for (let k = 1; k < (tall ? 4 : 2); k++) { const yy = s0 + (H * k) / (tall ? 4 : 2); box(xa, yy - 0.015, 0, xb, yy + 0.015, 0.03, fr); }
        // carved stone surround, keystone and a small cornice
        box(xa - 0.1, s0 - 0.02, 0, xa, top + 0.14, 0.05, STONE_PARIS); box(xb, s0 - 0.02, 0, xb + 0.1, top + 0.14, 0.05, STONE_PARIS);
        box(xa - 0.1, top, 0, xb + 0.1, top + 0.14, 0.05, STONE_PARIS);
        box(0.45, top - 0.02, 0, 0.55, top + 0.16, 0.08, STONE_PARIS);
        box(xa - 0.16, top + 0.14, 0, xb + 0.16, top + 0.2, 0.11, STONE_PARIS);
        box(xa - 0.12, s0 - 0.07, 0, xb + 0.12, s0, 0.07, STONE_PARIS);
        if (tall) {
          // a little wrought-iron railing across the bottom of the window
          const z0 = 0.09, ry = s0 + 0.9;
          box(xa - 0.04, ry, z0, xb + 0.04, ry + 0.035, z0 + 0.035, IRON);
          box(xa - 0.04, s0 + 0.08, z0, xb + 0.04, s0 + 0.1, z0 + 0.02, IRON);
          box(xa - 0.04, s0 + 0.45, z0, xb + 0.04, s0 + 0.465, z0 + 0.015, IRON);
          for (let bx = xa; bx <= xb + 0.001; bx += 0.08) box(bx - 0.007, s0, z0 + 0.003, bx + 0.007, ry, z0 + 0.017, IRON);
          for (const ex of [xa - 0.04, xb + 0.02]) box(ex, s0, 0, ex + 0.02, ry, z0 + 0.03, IRON);
        }
      }

      function oasisWindow(x, y, z, f) {
        const s0 = 0.3, top = 1.05, xa = 0.24, xb = 0.76;
        panel(xa, s0, xb, top, 0.002, DARK);
        if (hash(x, y, z, 5) < 0.55) {
          const sh = SHUTTERS_OASIS[Math.floor(hash(Math.floor(x / 8), 0, Math.floor(z / 8), 9) * SHUTTERS_OASIS.length)];
          box(xa + 0.02, s0, 0.004, xb - 0.02, top - 0.02, 0.03, sh);
        }
        box(xa - 0.1, top, 0, xb + 0.1, top + 0.1, 0.07, WOOD);             // wooden lintel
        box(xa - 0.05, s0 - 0.05, 0, xb + 0.05, s0, 0.06, mat('sandstone', 0xd8c090));
        // the opening's sides, so it looks set deep in a thick wall
        box(xa - 0.04, s0, 0, xa, top, 0.05, mat('render', 0xcdb487)); box(xb, s0, 0, xb + 0.04, top, 0.05, mat('render', 0xcdb487));
      }

      // ================= doors and shopfronts =================
      function bcnDoor(x, y, z, f, col) {
        const P = mat('paint', col);
        const xa = 0.14, xb = 0.86, top = 2.25;
        box(xa, 0, 0.004, 0.5, top, 0.03, P); box(0.5, 0, 0.004, xb, top, 0.03, P);
        for (const [a, b] of [[xa + 0.06, 0.44], [0.56, xb - 0.06]]) {
          panel(a, 1.0, b, top - 0.12, 0.032, GLASS);
          box(a, 0.15, 0.03, b, 0.85, 0.045, P);                          // a raised panel below
          box((a + b) / 2 - 0.012, 1.0, 0.03, (a + b) / 2 + 0.012, top - 0.12, 0.045, P);
        }
        box(0.47, 0.95, 0.03, 0.49, 1.15, 0.06, mat('gold', 0xd8b050));   // door handle
        box(0.02, 0, 0, xa, top + 0.15, 0.06, STONE_BCN); box(xb, 0, 0, 0.98, top + 0.15, 0.06, STONE_BCN);
        box(0.02, top, 0, 0.98, top + 0.15, 0.06, STONE_BCN);
        box(-0.02, top + 0.15, 0, 1.02, top + 0.2, 0.1, STONE_BCN);
      }

      function parisShop(x, y, z, f, col, a, sL, sR) {
        const P = mat('paint', col), Pd = mat('paint', darken(col));
        const door = ((a % 6) + 6) % 6 === 3;
        box(0, 0, 0, 1, 0.45, 0.06, P);                                   // stall riser
        if (door) {
          box(0.15, 0, 0.004, 0.85, 2.15, 0.03, P);
          panel(0.22, 0.9, 0.78, 2.05, 0.032, GLASS);
          box(0.22, 0.2, 0.03, 0.78, 0.75, 0.045, P);
        } else {
          panel(0, 0.45, 1, 2.15, 0.01, hash(x, y, z, 4) < 0.5 ? GLASS_SHOP : GLASS_SHOP2);
          box(0, 0.45, 0, 1, 0.52, 0.07, P);
          box(0.485, 0.45, 0, 0.515, 2.15, 0.05, P);                      // glazing bar
        }
        if (((a % 3) + 3) % 3 === 0 || sL) box(0, 0, 0, 0.12, 2.2, 0.09, P);   // pilaster
        if (sR) box(0.88, 0, 0, 1, 2.2, 0.09, P);
        // the fascia (sign board) right along the front, with a little cornice
        box(-0.1 * sL, 2.15, 0, 1 + 0.1 * sR, 2.7, 0.1, Pd);
        box(-0.14 * sL, 2.7, 0, 1 + 0.14 * sR, 2.78, 0.14, P);
        box(-0.1 * sL, 2.15, 0, 1 + 0.1 * sR, 2.2, 0.12, P);
      }
      function darken(c) { return (((c >> 16) & 255) * 0.75 << 16) | (((c >> 8) & 255) * 0.75 << 8) | ((c & 255) * 0.75); }

      // ================= mouldings =================
      const P_BCN = [[0, -0.2], [0.03, -0.18], [0.05, -0.12], [0.1, -0.08], [0.17, -0.04], [0.21, 0], [0.21, 0.07], [0, 0.07]];
      const P_PLINTH = [[0, -0.05], [0.04, -0.03], [0.04, 0.025], [0, 0.04]];
      const P_PARIS = [[0, -0.34], [0.04, -0.32], [0.06, -0.24], [0.12, -0.18], [0.15, -0.13], [0.26, -0.07], [0.31, -0.02], [0.33, 0.04], [0.33, 0.1], [0, 0.1]];
      const P_COPING = [[0, -0.07], [0.05, -0.07], [0.05, 0.0], [0.025, 0.05], [-0.3, 0.05], [-0.3, 0.0]];
      const P_MANSARD = [[0.27, 0.1], [0.02, 1.15], [-0.1, 1.45], [-0.8, 2.0]];
      const P_OASIS = [[0, -0.06], [0.06, -0.04], [0.06, 0.02], [0, 0.03]];

      // ================= go over every block face =================
      const { sx: X, sy: Y, sz: Z } = world;
      const sides = FACE.filter(f => f.kind === 'side');
      const wallStyle = (x, y, z) => WALL[nm(x, y, z)];
      const windowsDone = new Set();
      for (let y = 1; y < Y; y++)
        for (let z = 0; z < Z; z++)
          for (let x = 0; x < X; x++) {
            const id = at(x, y, z);
            if (!id || hide[cell(x, y, z)]) continue;
            const n = name(id);
            for (const f of sides) {
              if (!exposed(x, y, z, f)) continue;
              const a = dot([x, y, z], f.u), am = k => ((a % k) + k) % k;
              const style = WALL[n];

              // ---- windows ----
              if (style) {
                const above = (k) => wallStyle(x, y + k, z) === style && exposed(x, y + k, z, f);
                const along = d => { const t = d < 0 ? [-f.u[0], 0, -f.u[2]] : f.u; return wallStyle(x + t[0], y, z + t[2]) === style && exposed(x + t[0], y, z + t[2], f); };
                let win = false, tall = false;
                if (style === 'bcn' && (y - G) % 3 === 1) {
                  win = ORIGINAL_WINDOW.has(n) || (am(3) === 1 && along(-1) && along(1));
                  tall = above(1);
                } else if (style === 'paris' && y >= G + 2 && (y - G - 2) % 3 === 0) {
                  win = am(2) === 0 && along(-1) && along(1);
                  tall = above(1);
                } else if (style === 'oasis' && (y - G) % 3 === 1) {
                  win = am(4) === 2 && along(-1) && along(1);
                }
                const key = `${f.n}|${y}|${a}`;
                if (win && style === 'bcn' && !ORIGINAL_WINDOW.has(n)) {
                  // keep clear of the map's own windows next door
                  for (const d of [-1, 1]) { const t = d < 0 ? [-f.u[0], 0, -f.u[2]] : f.u; if (ORIGINAL_WINDOW.has(nm(x + t[0], y, z + t[2]))) win = false; }
                }
                if (win && !windowsDone.has(key + x + z)) {
                  windowsDone.add(key + x + z);
                  setFrame(x, y, z, f);
                  if (style === 'bcn') bcnWindow(x, y, z, f, tall, y >= G + 4, y === G + 1);
                  else if (style === 'paris') parisWindow(x, y, z, f, tall);
                  else oasisWindow(x, y, z, f);
                }
                // Oasis: a parapet with merlons along the top of the wall
                if (style === 'oasis' && !at(x, y + 1, z)) {
                  setFrame(x, y, z, f);
                  const sL = endType(x, y, z, f, -1), sR = endType(x, y, z, f, 1);
                  extrude(P_OASIS, 1, sL, sR, mat('sandstone', 0xd8c090));
                  for (const m0 of [0.06, 0.56]) box(m0, 1, -0.32, m0 + 0.3, 1.32, 0.02, mat(n === 'clay' ? 'render' : 'sandstone', n === 'clay' ? 0xd28c62 : 0xdec48c), true);
                }
              }

              // ---- doors and shopfronts ----
              if (SHOP.has(n)) {
                const up = wallStyle(x, y + 1, z);
                setFrame(x, y, z, f);
                if (up === 'paris') parisShop(x, y, z, f, SHOP_COL[n], a, endType(x, y, z, f, -1) === 1 ? 1 : 0, endType(x, y, z, f, 1) === 1 ? 1 : 0);
                else bcnDoor(x, y, z, f, SHOP_COL[n]);
              }

              // ---- cornices ----
              const up = nm(x, y + 1, z);
              const run = (test, profile, yb, m) => {
                setFrame(x, y, z, f);
                const sL = endType(x, y, z, f, -1), sR = endType(x, y, z, f, 1);
                const capL = sL === 0 && !sameAlong(x, y, z, f, -1, test), capR = sR === 0 && !sameAlong(x, y, z, f, 1, test);
                extrude(profile, yb, sL, sR, m, capL, capR);
              };
              if (n === 'stucco' && up === 'terracotta') {
                run((qx, qy, qz, ff) => nm(qx, qy, qz) === 'stucco' && nm(qx, qy + 1, qz) === 'terracotta' && exposed(qx, qy, qz, ff), P_BCN, 1, MOULD_BCN);
              }
              if (n === 'plinth' && wallStyle(x, y + 1, z) === 'bcn') {
                run((qx, qy, qz, ff) => nm(qx, qy, qz) === 'plinth' && exposed(qx, qy, qz, ff), P_PLINTH, 1, STONE_BCN);
              }
              if (n === 'terracotta' && !at(x, y + 1, z)) {
                run((qx, qy, qz, ff) => nm(qx, qy, qz) === 'terracotta' && !at(qx, qy + 1, qz) && exposed(qx, qy, qz, ff), P_COPING, 1, TILE);
              }
              if (n === 'limestone' && up === 'zinc') {
                run((qx, qy, qz, ff) => nm(qx, qy, qz) === 'limestone' && nm(qx, qy + 1, qz) === 'zinc' && exposed(qx, qy, qz, ff), P_PARIS, 1, STONE_PARIS);
              }
              // ---- Paris: the mansard roof (lower zinc layer: slope up to the top) ----
              if (n === 'zinc' && up === 'zinc' && nm(x, y - 1, z) !== 'zinc') {
                setFrame(x, y, z, f);
                const sL = endType(x, y, z, f, -1), sR = endType(x, y, z, f, 1);
                extrude(P_MANSARD, 0, sL, sR, ZINC);
                if (am(2) === 0 && sL === 0 && sR === 0) {
                  // a dormer window poking out of the slope
                  const z0 = -0.05, zf = 0.12, yb = 0.35, yt = 1.25;
                  box(0.22, yb, z0 - 0.4, 0.78, yt, zf, ZINC_DARK);
                  panel(0.3, yb + 0.08, 0.7, yt - 0.06, zf + 0.002, GLASS);
                  box(0.3, yb + 0.08, zf, 0.33, yt - 0.06, zf + 0.025, FRAME_WHITE); box(0.67, yb + 0.08, zf, 0.7, yt - 0.06, zf + 0.025, FRAME_WHITE);
                  box(0.3, yt - 0.09, zf, 0.7, yt - 0.06, zf + 0.025, FRAME_WHITE); box(0.3, yb + 0.08, zf, 0.7, yb + 0.12, zf + 0.04, FRAME_WHITE);
                  box(0.485, yb + 0.08, zf, 0.515, yt - 0.06, zf + 0.02, FRAME_WHITE);
                  // its little pointed roof
                  const r0 = W(0.16, yt, zf + 0.06), r1 = W(0.84, yt, zf + 0.06), rt = W(0.5, yt + 0.32, zf + 0.06);
                  const b0 = W(0.16, yt, z0 - 0.5), b1 = W(0.84, yt, z0 - 0.5), bt = W(0.5, yt + 0.32, z0 - 0.5);
                  quadW([r1, b1, bt, rt], norm(WN(0.43, 0.9, 0)), ZINC_DARK);
                  quadW([b0, r0, rt, bt], norm(WN(-0.43, 0.9, 0)), ZINC_DARK);
                  const nv = WN(0, 0, 1), tv = [r0, r1, rt].map(q => g.vert(q[0], q[1], q[2], nv[0], nv[1], nv[2], 0, 0, ZINC_DARK[0], 0, ZINC_DARK[1]));
                  g.tri(tv[0], tv[1], tv[2]);
                }
              }
            }
            // ---- Paris: the flat top of the mansard, kept clear of the slopes ----
            if (n === 'zinc' && nm(x, y + 1, z) !== 'zinc' && nm(x, y - 1, z) === 'zinc' && roofExposed(x, y, z)) {
              const d = 0.8;
              const x0 = x + (!full(at(x - 1, y, z)) ? d : 0), x1 = x + 1 - (!full(at(x + 1, y, z)) ? d : 0);
              const z0 = z + (!full(at(x, y, z - 1)) ? d : 0), z1 = z + 1 - (!full(at(x, y, z + 1)) ? d : 0);
              if (x1 > x0 && z1 > z0) {
                const gg = api.geo(x + 0.5, z + 0.5), yy = y + 1;
                const vs = [[x0, z1], [x1, z1], [x1, z0], [x0, z0]].map(([px, pz]) => gg.vert(px, yy, pz, 0, 1, 0, 0, 0, ZINC[0], 0, ZINC[1]));
                gg.quad(vs[0], vs[1], vs[2], vs[3]);
              }
            }
          }

      // ================= arches under the stone beams over streets =================
      // a half block (a corbel) under a beam, with the beam running across open air to another one:
      // a shallow stone arch springs from one to the other
      for (let y = 1; y < Y - 1; y++)
        for (let z = 0; z < Z; z++)
          for (let x = 0; x < X; x++) {
            if (nm(x, y, z) !== 'gothic_slab' || !full(at(x, y + 1, z))) continue;
            for (const [dx, dz] of [[1, 0], [0, 1]]) {
              if (at(x + dx, y, z + dz) !== 0 || !full(at(x + dx, y + 1, z + dz))) continue;
              let L = 0;
              for (let k = 1; k <= 14; k++) {
                const qx = x + dx * k, qz = z + dz * k;
                if (!full(at(qx, y + 1, qz))) break;
                if (nm(qx, y, qz) === 'gothic_slab') { L = k; break; }
                if (at(qx, y, qz) !== 0) break;
              }
              if (L < 2) continue;
              const beam = spec[at(x + dx, y + 1, z + dz)].side, m = [beam.layer, beam.ratio];
              const span = L - 1, rise = 1;
              F = dx ? { o: [x + 1, y, z], X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] }
                     : { o: [x + 1, y, z + 1], X: [0, 0, 1], Y: [0, 1, 0], Z: [-1, 0, 0] };
              g = api.geo(x + 0.5 + dx * L / 2, z + 0.5 + dz * L / 2);
              const R = (span * span / 4 + rise * rise) / (2 * rise), cX = span / 2, cY = rise - R;
              const NS = 14, pts = [];
              let arc = 0;
              for (let i = 0; i <= NS; i++) {
                const X0 = (span * i) / NS, Y0 = cY + Math.sqrt(Math.max(0, R * R - (X0 - cX) ** 2));
                if (i) arc += Math.hypot(X0 - pts[i - 1][0], Y0 - pts[i - 1][1]);
                pts.push([X0, Y0, arc]);
              }
              for (let i = 0; i < NS; i++) {
                const [xa, ya, sa] = pts[i], [xb, yb, sb] = pts[i + 1];
                // the underside (smooth, curving)
                const na = WN((cX - xa) / R, (cY - ya) / R, 0), nb = WN((cX - xb) / R, (cY - yb) / R, 0);
                const q = [[xa, ya, 0, na, 0, sa], [xb, yb, 0, nb, 0, sb], [xb, yb, 1, nb, 1, sb], [xa, ya, 1, na, 1, sa]]
                  .map(([X0, Y0, Z0, n, u, v]) => { const p = W(X0, Y0, Z0); return g.vert(p[0], p[1], p[2], n[0], n[1], n[2], u, v, m[0], 1024, m[1]); });
                g.quad(q[0], q[1], q[2], q[3]);
                // the flat faces either side, up to the beam
                quadW([W(xa, ya, 0), W(xa, rise, 0), W(xb, rise, 0), W(xb, yb, 0)], WN(0, 0, -1), m);
                quadW([W(xb, yb, 1), W(xb, rise, 1), W(xa, rise, 1), W(xa, ya, 1)], WN(0, 0, 1), m);
              }
            }
          }

      // ================= trunks, palms, columns, bollards =================
      const BARK = mat('bark', 0x9a8e74), BARK_PLANE = mat('bark', 0xb0a488), PALM = mat('palmbark', 0xb4a082);
      for (const t of trunks) {
        const cx = t.x + 0.5, cz = t.z + 0.5, small = t.h <= 3;
        const rb = small ? 0.13 : 0.24, rt = small ? 0.1 : 0.18;
        const lean = [(hash(t.x, t.y, t.z, 1) - 0.5) * 0.25, (hash(t.x, t.y, t.z, 2) - 0.5) * 0.25];
        const rings = [];
        const H = t.h + (small ? 0.35 : 0.6);
        for (let i = 0; i <= 10; i++) {
          const k = i / 10, yy = t.y + k * H, hh = k * H;
          const r = (rb + (rt - rb) * k) * (1 + 0.9 * Math.exp(-hh / 0.22));     // a root flare at the bottom
          rings.push([yy, r, lean[0] * k * k, lean[1] * k * k]);
        }
        lathe(cx, cz, rings, 14, small ? BARK : BARK_PLANE, 0.12, t.x * 31 + t.z);
        if (!small) {                                   // three big branches up into the crown
          for (let b = 0; b < 3; b++) {
            const ang = hash(t.x, b, t.z, 5) * Math.PI * 2, tilt = 0.5 + 0.3 * hash(t.x, b, t.z, 6);
            const y0 = t.y + t.h - 0.7, L = 1.3;
            const rr = [];
            for (let i = 0; i <= 4; i++) {
              const k = i / 4;
              rr.push([y0 + k * L * Math.cos(tilt), 0.09 * (1 - 0.6 * k), lean[0] + Math.cos(ang) * Math.sin(tilt) * L * k, lean[1] + Math.sin(ang) * Math.sin(tilt) * L * k]);
            }
            lathe(cx, cz, rr, 7, BARK_PLANE, 0, 0, true);
          }
        }
      }
      for (const p of palms) {
        const cx = p.x + 0.5, cz = p.z + 0.5;
        const ang = hash(p.x, p.y, p.z, 1) * Math.PI * 2, bend = 0.35 + 0.35 * hash(p.x, p.y, p.z, 2);
        const H = p.h + 0.9;
        const rings = [];
        for (let i = 0; i <= 24; i++) {
          const k = i / 24, hh = k * H;
          const ring = 1 + 0.06 * Math.sin(hh * Math.PI * 2 / 0.22);     // ringed leaf scars
          rings.push([p.y + hh, (0.2 + 0.07 * (1 - k) + 0.12 * Math.exp(-hh / 0.3)) * ring,
            Math.cos(ang) * bend * k * k, Math.sin(ang) * bend * k * k]);
        }
        lathe(cx, cz, rings, 12, PALM, 0.06, p.x * 13 + p.z, true);
        p.top = [cx + Math.cos(ang) * bend, p.y + H, cz + Math.sin(ang) * bend];
      }
      const GREEN_IRON = mat('paint', 0x386c58);
      for (const c of columns) {
        const cx = c.x + 0.5, cz = c.z + 0.5, y0 = c.y, y1 = c.y + c.h;
        // square base, fluted shaft, flared capital, square top
        setFrame(c.x, c.y, c.z, FACE[4]);
        const sqBox = (yb, yt, r) => {
          const gg = api.geo(cx, cz);
          for (const fc of FACES) {
            const pts = fc.c.map(cc => [cx + (cc[0] ? r : -r), cc[1] ? yt : yb, cz + (cc[2] ? r : -r)]);
            const vs = pts.map(q => gg.vert(q[0], q[1], q[2], fc.dir[0], fc.dir[1], fc.dir[2], 0, 0, GREEN_IRON[0], 0, GREEN_IRON[1]));
            gg.quad(vs[0], vs[1], vs[2], vs[3]);
          }
        };
        sqBox(y0, y0 + 0.22, 0.36);
        sqBox(y1 - 0.12, y1, 0.4);
        const rings = [[y0 + 0.22, 0.3], [y0 + 0.32, 0.27], [y0 + 0.4, 0.21], [y1 - 0.75, 0.19], [y1 - 0.4, 0.22], [y1 - 0.2, 0.32], [y1 - 0.12, 0.36]];
        lathe(cx, cz, rings, 20, GREEN_IRON);
      }
      const BOLLARD = mat('paint', 0x2a2c30);
      for (const b of bollards) {
        const y0 = b.y;
        lathe(b.x + 0.5, b.z + 0.5, [[y0, 0.3], [y0 + 0.12, 0.28], [y0 + 0.2, 0.22], [y0 + 0.6, 0.2], [y0 + 0.72, 0.26], [y0 + 0.82, 0.25], [y0 + 0.92, 0.17], [y0 + 0.98, 0.06]], 16, BOLLARD, 0, 0, true);
      }
      buildSmooth(api);
      state.palms = palms;
    }

    // ---- the smooth shapes: a surface wrapped round the blocks at half-block detail ("surface
    // nets"), relaxed so corners round off, then coloured with each block's material ----
    function buildSmooth(api) {
      const R = 2;                                       // samples per block
      // clusters of touching smooth blocks, each done in its own little box
      const seen = new Uint8Array(sx * sy * sz);
      for (let i0 = 0; i0 < smooth.length; i0++) {
        if (!smooth[i0] || seen[i0]) continue;
        let x0 = sx, y0 = sy, z0 = sz, x1 = 0, y1 = 0, z1 = 0;
        const stack = [i0]; seen[i0] = 1;
        while (stack.length) {
          const i = stack.pop();
          const x = i % sx, z = Math.floor(i / sx) % sz, y = Math.floor(i / (sx * sz));
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
          for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
            const qx = x + dx, qy = y + dy, qz = z + dz;
            if (qx < 0 || qy < 0 || qz < 0 || qx >= sx || qy >= sy || qz >= sz) continue;
            const j = cell(qx, qy, qz);
            if (smooth[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
          }
        }
        surfaceNet(api, x0 - 1, y0 - 1, z0 - 1, x1 + 1, y1 + 1, z1 + 1, R);
      }
    }

    function surfaceNet(api, bx0, by0, bz0, bx1, by1, bz1, R) {
      const nx = (bx1 - bx0 + 1) * R, ny = (by1 - by0 + 1) * R, nz = (bz1 - bz0 + 1) * R;
      const S = (i, j, k) => (j * nz + k) * nx + i;
      // samples: 0 empty, 1 other solid, 2 smooth solid (and which block)
      const val = new Uint8Array(nx * ny * nz), bid = new Uint16Array(nx * ny * nz);
      for (let j = 0; j < ny; j++)
        for (let k = 0; k < nz; k++)
          for (let i = 0; i < nx; i++) {
            const wx = bx0 + (i + 0.5) / R, wy = by0 + (j + 0.5) / R, wz = bz0 + (k + 0.5) / R;
            const x = Math.floor(wx), y = Math.floor(wy), z = Math.floor(wz);
            const id = at(x, y, z);
            if (!id || BLOCK_DEFS[id].liquid) continue;
            const h = BLOCK_DEFS[id].h || 1;
            if (wy - y >= h) continue;
            const inS = x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz && smooth[cell(x, y, z)];
            val[S(i, j, k)] = inS ? 2 : 1; bid[S(i, j, k)] = id;
          }
      // one vertex per mixed cube (cube (i,j,k) has corner samples i..i+1, j..j+1, k..k+1)
      const cx = nx - 1, cy = ny - 1, cz = nz - 1;
      const C = (i, j, k) => (j * cz + k) * cx + i;
      const vid = new Int32Array(cx * cy * cz).fill(-1);
      const vp = [];
      const E = [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1],
                 [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1],
                 [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
      for (let j = 0; j < cy; j++)
        for (let k = 0; k < cz; k++)
          for (let i = 0; i < cx; i++) {
            let px = 0, py = 0, pz = 0, n = 0, anyS = false;
            for (const e of E) {
              const a = val[S(i + e[0], j + e[1], k + e[2])] > 0, b = val[S(i + e[3], j + e[4], k + e[5])] > 0;
              if (a === b) continue;
              px += (e[0] + e[3]) / 2; py += (e[1] + e[4]) / 2; pz += (e[2] + e[5]) / 2; n++;
            }
            if (!n) continue;
            for (let d = 0; d < 8; d++) if (val[S(i + (d & 1), j + ((d >> 1) & 1), k + ((d >> 2) & 1))] === 2) anyS = true;
            if (!anyS) continue;
            vid[C(i, j, k)] = vp.length / 3;
            vp.push(i + px / n, j + py / n, k + pz / n);
          }
      // relax: each vertex moves toward its neighbours (rounds the corners off), staying near its cube
      for (let it = 0; it < 4; it++) {
        const np = vp.slice();
        for (let j = 0; j < cy; j++)
          for (let k = 0; k < cz; k++)
            for (let i = 0; i < cx; i++) {
              const v = vid[C(i, j, k)];
              if (v < 0) continue;
              let sxv = 0, syv = 0, szv = 0, c = 0;
              for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
                const a = i + di, b = j + dj, d = k + dk;
                if (a < 0 || b < 0 || d < 0 || a >= cx || b >= cy || d >= cz) continue;
                const w = vid[C(a, b, d)];
                if (w < 0) continue;
                sxv += vp[w * 3]; syv += vp[w * 3 + 1]; szv += vp[w * 3 + 2]; c++;
              }
              if (!c) continue;
              const t = 0.5;
              np[v * 3] = Math.min(i + 1.3, Math.max(i - 0.3, vp[v * 3] * (1 - t) + (sxv / c) * t));
              np[v * 3 + 1] = Math.min(j + 1.3, Math.max(j - 0.3, vp[v * 3 + 1] * (1 - t) + (syv / c) * t));
              np[v * 3 + 2] = Math.min(k + 1.3, Math.max(k - 0.3, vp[v * 3 + 2] * (1 - t) + (szv / c) * t));
            }
        for (let q = 0; q < vp.length; q++) vp[q] = np[q];
      }
      // quads: across every sample edge from smooth-solid to empty
      const quads = [];
      const vn = new Float32Array(vp.length);
      for (let j = 0; j < ny; j++)
        for (let k = 0; k < nz; k++)
          for (let i = 0; i < nx; i++) {
            const s0 = val[S(i, j, k)];
            for (let a = 0; a < 3; a++) {
              const ii = i + (a === 0), jj = j + (a === 1), kk = k + (a === 2);
              if (ii >= nx || jj >= ny || kk >= nz) continue;
              const s1 = val[S(ii, jj, kk)];
              if ((s0 > 0) === (s1 > 0)) continue;
              const solidFirst = s0 > 0;
              if ((solidFirst ? s0 : s1) !== 2) continue;            // only the smooth blocks' surface
              const blk = solidFirst ? bid[S(i, j, k)] : bid[S(ii, jj, kk)];
              const b = (a + 1) % 3, c = (a + 2) % 3;
              const base = [i, j, k];
              const cube = (db, dc) => {
                const p = base.slice(); p[b] -= db; p[c] -= dc;
                if (p[0] < 0 || p[1] < 0 || p[2] < 0 || p[0] >= cx || p[1] >= cy || p[2] >= cz) return -1;
                return vid[C(p[0], p[1], p[2])];
              };
              let q = [cube(1, 1), cube(0, 1), cube(0, 0), cube(1, 0)];
              if (q.some(v => v < 0)) continue;
              if (!solidFirst) q = [q[3], q[2], q[1], q[0]];
              quads.push(q, a, solidFirst ? 1 : -1, blk);
              // area normal, added to the corners (for smooth shading)
              const P = q.map(v => [vp[v * 3], vp[v * 3 + 1], vp[v * 3 + 2]]);
              const d1 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]], d2 = [P[3][0] - P[1][0], P[3][1] - P[1][1], P[3][2] - P[1][2]];
              const n = [d1[1] * d2[2] - d1[2] * d2[1], d1[2] * d2[0] - d1[0] * d2[2], d1[0] * d2[1] - d1[1] * d2[0]];
              for (const v of q) { vn[v * 3] += n[0]; vn[v * 3 + 1] += n[1]; vn[v * 3 + 2] += n[2]; }
            }
          }
      const toW = v => [bx0 + (vp[v * 3] + 0.5) / R, by0 + (vp[v * 3 + 1] + 0.5) / R, bz0 + (vp[v * 3 + 2] + 0.5) / R];
      for (let qi = 0; qi < quads.length; qi += 4) {
        const q = quads[qi], a = quads[qi + 1], sgn = quads[qi + 2], blk = quads[qi + 3];
        const kind = a === 1 ? (sgn > 0 ? 'top' : 'bottom') : 'side';
        const sp = spec[blk][kind];
        const P = q.map(toW);
        const g = api.geo((P[0][0] + P[2][0]) / 2, (P[0][2] + P[2][2]) / 2);
        const vs = q.map((v, k) => {
          let n = [vn[v * 3], vn[v * 3 + 1], vn[v * 3 + 2]];
          const l = Math.hypot(n[0], n[1], n[2]) || 1;
          n = [n[0] / l, n[1] / l, n[2] / l];
          return g.vert(P[k][0], P[k][1], P[k][2], n[0], n[1], n[2], 0, 0, sp.layer, 0, sp.ratio);
        });
        g.quad(vs[0], vs[1], vs[2], vs[3]);
      }
    }

    function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

    // palm fronds: their own mesh (thin leaves, both sides, swaying)
    function extras(group) {
      if (!state.palms || !state.palms.length) return;
      const pos = [], col = [], idx = [];
      const leaf = [0.2, 0.4, 0.1], tip = [0.46, 0.52, 0.16], stalk = [0.36, 0.34, 0.16];
      const push = (p, c) => { pos.push(p[0], p[1], p[2]); col.push(c[0], c[1], c[2]); return pos.length / 3 - 1; };
      const add = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
      for (const p of state.palms) {
        const [tx, ty, tz] = p.top;
        const nF = 15;
        for (let i = 0; i < nF; i++) {
          const az = (i / nF) * Math.PI * 2 + hash(p.x, i, p.z, 3) * 0.5;
          const young = i % 4 === 0;                                           // a few still pointing up
          const elev = young ? 0.9 + 0.3 * hash(p.x, i, p.z, 4) : 0.15 + 0.45 * hash(p.x, i, p.z, 4);
          const L = (young ? 2.0 : 2.5) + 0.8 * hash(p.x, i, p.z, 5);
          const d = [Math.cos(az), 0, Math.sin(az)], side = [-Math.sin(az), 0, Math.cos(az)];
          const S = 24;
          const at = t => {
            const l = t * L;
            return [tx + d[0] * Math.cos(elev) * l, ty + Math.sin(elev) * l - 0.75 * l * l / L, tz + d[2] * Math.cos(elev) * l];
          };
          // the stalk (rachis): a thin strip
          let prev = null;
          for (let s = 0; s <= S; s++) {
            const c = at(s / S), w = 0.035 * (1 - s / S) + 0.006;
            const a = push(add(c, side, -w), stalk), b = push(add(c, side, w), stalk);
            if (prev) { idx.push(prev[0], prev[1], b, prev[0], b, a); }
            prev = [a, b];
          }
          // leaflets: separate narrow blades on both sides, swept toward the tip and hanging down
          for (let s = 2; s < S; s++) {
            const t = s / S, c = at(t), c2 = at(Math.min(1, t + 0.5 / S));
            const dir = [c2[0] - c[0], c2[1] - c[1], c2[2] - c[2]];
            const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
            const fwd = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
            const wl = 0.75 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.02)), 0.6) + 0.08;
            const m = Math.min(1, t * 1.1);
            const col0 = [0, 1, 2].map(j => (leaf[j] + (tip[j] - leaf[j]) * m * 0.4) * (0.55 + 0.45 * Math.min(1, t * 3)));
            const col1 = [0, 1, 2].map(j => leaf[j] + (tip[j] - leaf[j]) * m);
            for (const sgn of [-1, 1]) {
              const hang = 0.35 + 0.45 * t + 0.15 * hash(p.x + s, i, sgn, 6);
              const out = add(add(add([0, 0, 0], side, sgn * wl * 0.85), fwd, wl * 0.45), [0, -1, 0], hang * wl);
              const b0 = add(c, fwd, -0.025), b1 = add(c, fwd, 0.025);
              const mid = add(add(c, out, 0.5), [0, -0.04, 0], 1);
              const tp = add(c, out, 1);
              const w2 = add(fwd, [0, 0, 0], 0.028);
              const i0 = push(b0, col0), i1 = push(b1, col0), i2 = push(add(mid, w2, 1), col1), i3 = push(add(mid, w2, -1), col1), i4 = push(tp, col1);
              idx.push(i0, i1, i2, i0, i2, i3, i3, i2, i4);
            }
          }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.6, metalness: 0, envMapIntensity: 0.8 });
      m.onBeforeCompile = shader => {
        shader.uniforms.hdTime = HDWorld.time;
        shader.vertexShader = 'uniform float hdTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            transformed.y += sin(hdTime * 2.1 + position.x * 1.7 + position.z * 1.3) * 0.03;
            transformed.x += sin(hdTime * 1.3 + position.x * 0.4 + position.z * 0.3) * 0.04;
          }`);
      };
      HDWorld.addGi(m);
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
    }

    const state = {};
    const hidden = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < sx && y < sy && z < sz && hide[cell(x, y, z)] === 1;
    return { face, build, extras, hidden };
  }

  return { prepare };
})();
