// The voxel world: block storage, mesh building, collision and raycasts.
// 1 block = 1 metre. The player is 1.8 blocks tall. Map layouts live in maps.js.

// Each face: outward direction + 4 corners (bottom-left, bottom-right, top-right, top-left
// as seen from outside, so triangles are counter-clockwise).
const FACES = [
  { dir: [1, 0, 0],  kind: 'side',   c: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },
  { dir: [-1, 0, 0], kind: 'side',   c: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
  { dir: [0, 1, 0],  kind: 'top',    c: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
  { dir: [0, -1, 0], kind: 'bottom', c: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
  { dir: [0, 0, 1],  kind: 'side',   c: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
  { dir: [0, 0, -1], kind: 'side',   c: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
];

// Ray vs axis-aligned box (slab method). o, d are [x,y,z] arrays.
// Returns { t, axis, sign } for the entry point, or null.
function rayAABB(o, d, min, max) {
  let tmin = -Infinity, tmax = Infinity, axis = -1, sign = 0;
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
      continue;
    }
    let t1 = (min[a] - o[a]) / d[a];
    let t2 = (max[a] - o[a]) / d[a];
    let s = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
    if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return null;
  }
  if (tmax < 0 || tmin < 0) return null;
  return { t: tmin, axis, sign };
}

class World {
  constructor(sx, sy, sz) {
    this.sx = sx; this.sy = sy; this.sz = sz;
    this.data = new Uint8Array(sx * sy * sz);
    this.mesh = null;
  }

  idx(x, y, z) { return (y * this.sz + z) * this.sx + x; }

  get(x, y, z) {
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz || y < 0) return B.stone; // solid outside
    if (y >= this.sy) return 0;
    return this.data[this.idx(x, y, z)];
  }

  set(x, y, z, id) {
    if (x < 0 || y < 0 || z < 0 || x >= this.sx || y >= this.sy || z >= this.sz) return;
    this.data[this.idx(x, y, z)] = id;
  }

  fill(x0, y0, z0, x1, y1, z1, id) {
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) this.set(x, y, z, id);
  }

  height(id) { return id ? (BLOCK_DEFS[id].h || 1) : 0; }
  isLiquid(id) { return id !== 0 && !!BLOCK_DEFS[id].liquid; }
  isSolid(id) { return id !== 0 && !BLOCK_DEFS[id].liquid; }
  isFull(id) { return id !== 0 && !BLOCK_DEFS[id].h; }

  // ---------- Mesh ----------
  // Two meshes: solid blocks, and see-through water.
  // How shaded a face corner is (0 = tucked in a corner .. 3 = open), from the
  // blocks next to it. Gives soft shadows where walls meet floors ("ambient occlusion").
  _cornerLight(x, y, z, f, c) {
    const a = f.dir[0] ? 0 : f.dir[1] ? 1 : 2;
    const u = (a + 1) % 3, v = (a + 2) % 3;
    const base = [x + f.dir[0], y + f.dir[1], z + f.dir[2]];
    const su = c[u] ? 1 : -1, sv = c[v] ? 1 : -1;
    const at = (du, dv) => {
      const p = base.slice();
      p[u] += du; p[v] += dv;
      return this.isFull(this.get(p[0], p[1], p[2])) ? 1 : 0;
    };
    const s1 = at(su, 0), s2 = at(0, sv), corner = at(su, sv);
    return s1 && s2 ? 0 : 3 - (s1 + s2 + corner);
  }

  buildMesh() {
    const AO = [0.52, 0.7, 0.86, 1];
    const solid = { pos: [], nor: [], uv: [], idx: [], col: [] };
    const liquid = { pos: [], nor: [], uv: [], idx: [], col: [] };
    for (let y = 0; y < this.sy; y++)
      for (let z = 0; z < this.sz; z++)
        for (let x = 0; x < this.sx; x++) {
          const id = this.data[this.idx(x, y, z)];
          if (!id) continue;
          const def = BLOCK_DEFS[id];
          const h = def.h || 1;
          const isLiq = !!def.liquid;
          const buf = isLiq ? liquid : solid;
          for (const f of FACES) {
            const n = this.get(x + f.dir[0], y + f.dir[1], z + f.dir[2]);
            if (isLiq) {
              // water: only draw where it meets air (or the top surface)
              if (this.isLiquid(n) || (this.isFull(n) && f.kind !== 'top')) continue;
              if (f.kind === 'bottom') continue;
            } else {
              // hide faces covered by a full neighbour (a slab's top is never covered)
              if (this.isFull(n) && !(f.kind === 'top' && h < 1)) continue;
            }
            const r = Textures.uv(blockTex(def, f.kind));
            const vTop = f.kind === 'side' ? r.v0 + (r.v1 - r.v0) * h : r.v1;
            const base = buf.pos.length / 3;
            const cuv = [[r.u0, r.v0], [r.u1, r.v0], [r.u1, vTop], [r.u0, vTop]];
            const ao = [3, 3, 3, 3];
            if (!isLiq) for (let k = 0; k < 4; k++) ao[k] = this._cornerLight(x, y, z, f, f.c[k]);
            for (let k = 0; k < 4; k++) {
              const c = f.c[k];
              buf.pos.push(x + c[0], y + c[1] * h, z + c[2]);
              buf.nor.push(f.dir[0], f.dir[1], f.dir[2]);
              buf.uv.push(cuv[k][0], cuv[k][1]);
              const l = AO[ao[k]];
              buf.col.push(l, l, l);
            }
            // split the square along the diagonal that keeps the shading smooth
            if (ao[0] + ao[2] < ao[1] + ao[3]) buf.idx.push(base, base + 1, base + 3, base + 1, base + 2, base + 3);
            else buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
        }
    const toGeo = b => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.idx);
      return g;
    };
    const group = new THREE.Group();
    const ground = new THREE.Mesh(toGeo(solid), new THREE.MeshLambertMaterial({ map: Textures.atlas, vertexColors: true }));
    ground.castShadow = ground.receiveShadow = true;
    group.add(ground);
    if (liquid.pos.length) {
      group.add(new THREE.Mesh(toGeo(liquid), new THREE.MeshLambertMaterial({
        map: Textures.atlas, transparent: true, opacity: 0.7, depthWrite: false,
      })));
    }
    this.mesh = group;
    return group;
  }

  // ---------- Collision ----------
  // Is this exact point inside a solid block? Returns the block's top height, or null.
  solidTopAt(x, y, z) {
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    const id = this.get(bx, by, bz);
    if (!this.isSolid(id)) return null;
    const top = by + this.height(id);
    return y < top ? top : null;
  }

  // All solid block boxes overlapping the given AABB (water is ignored).
  boxesIn(minX, minY, minZ, maxX, maxY, maxZ) {
    const out = [];
    const e = 1e-6;
    for (let y = Math.floor(minY); y <= Math.floor(maxY - e); y++)
      for (let z = Math.floor(minZ); z <= Math.floor(maxZ - e); z++)
        for (let x = Math.floor(minX); x <= Math.floor(maxX - e); x++) {
          const id = this.get(x, y, z);
          if (!this.isSolid(id)) continue;
          const top = y + this.height(id);
          if (top <= minY + 1e-5) continue;
          out.push({ min: [x, y, z], max: [x + 1, top, z + 1] });
        }
    return out;
  }

  // ---------- Raycast (for shots) ----------
  // Steps through the grid cell by cell. Returns { t, point, normal, id } or null.
  raycast(origin, dir, maxDist) {
    const o = [origin.x, origin.y, origin.z], d = [dir.x, dir.y, dir.z];
    const cell = o.map(Math.floor);
    const step = d.map(v => (v > 0 ? 1 : -1));
    const tDelta = d.map(v => (Math.abs(v) < 1e-9 ? Infinity : Math.abs(1 / v)));
    const tMax = d.map((v, a) => {
      if (Math.abs(v) < 1e-9) return Infinity;
      return v > 0 ? (cell[a] + 1 - o[a]) / v : (o[a] - cell[a]) / -v;
    });
    let t = 0;
    for (let i = 0; i < 1024 && t <= maxDist; i++) {
      if (cell[1] >= this.sy && d[1] >= 0) return null;   // flew out the top
      const id = this.get(cell[0], cell[1], cell[2]);
      if (this.isSolid(id)) {
        const min = [cell[0], cell[1], cell[2]];
        const max = [cell[0] + 1, cell[1] + this.height(id), cell[2] + 1];
        const hit = rayAABB(o, d, min, max);
        if (hit && hit.t <= maxDist) {
          const normal = [0, 0, 0];
          normal[hit.axis] = hit.sign;
          return {
            t: hit.t,
            point: new THREE.Vector3(o[0] + d[0] * hit.t, o[1] + d[1] * hit.t, o[2] + d[2] * hit.t),
            normal: new THREE.Vector3(normal[0], normal[1], normal[2]),
            id,
          };
        }
      }
      const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
      t = tMax[a];
      tMax[a] += tDelta[a];
      cell[a] += step[a];
    }
    return null;
  }
}
