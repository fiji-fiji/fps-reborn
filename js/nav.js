// Navigation grid for bots: which floor cells are walkable, how high each floor is,
// and A* pathfinding between cells. Built once from the world blocks.

class MinHeap {
  constructor() { this.items = []; this.keys = []; }
  get size() { return this.items.length; }
  push(item, key) {
    const a = this.items, k = this.keys;
    a.push(item); k.push(key);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [a[p], a[i]] = [a[i], a[p]]; [k[p], k[i]] = [k[i], k[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items, k = this.keys;
    const top = a[0];
    const lastA = a.pop(), lastK = k.pop();
    if (a.length) {
      a[0] = lastA; k[0] = lastK;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && k[l] < k[m]) m = l;
        if (r < a.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; [k[m], k[i]] = [k[i], k[m]];
        i = m;
      }
    }
    return top;
  }
}

const NAV_MAX_UP = 1.05;     // highest ledge a bot can get onto (with a jump)
const NAV_MAX_DROP = 3.5;

class NavGrid {
  constructor(world, groundY) {
    this.world = world;
    this.sx = world.sx; this.sz = world.sz;
    const N = this.sx * this.sz;
    this.floor = new Float32Array(N).fill(NaN);
    for (let z = 0; z < this.sz; z++)
      for (let x = 0; x < this.sx; x++) {
        // standing surface = top of the solid stack from the ground up
        let y = 0, top = 0;
        while (y < world.sy) {
          const id = world.get(x, y, z);
          if (!world.isSolid(id)) break;
          top = y + world.height(id);
          if (world.height(id) < 1) break;
          y++;
        }
        if (top - groundY > 2.6) continue;                  // rooftops: not for walking
        const c = Math.ceil(top - 1e-6);
        if (world.isSolid(world.get(x, c, z)) || world.isSolid(world.get(x, c + 1, z))) continue; // no headroom
        this.floor[z * this.sx + x] = top;
      }
    // cells next to walls cost a bit more, so bots walk down the middle of lanes
    this.penalty = new Float32Array(N);
    for (let z = 0; z < this.sz; z++)
      for (let x = 0; x < this.sx; x++) {
        if (!this.walkable(x, z)) continue;
        let near = 0;
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++)
            if ((dx || dz) && !this.walkable(x + dx, z + dz)) near++;
        this.penalty[z * this.sx + x] = near ? 0.8 : 0;
      }
  }

  walkable(x, z) {
    if (x < 0 || z < 0 || x >= this.sx || z >= this.sz) return false;
    return !Number.isNaN(this.floor[z * this.sx + x]);
  }
  floorAt(x, z) { return this.floor[z * this.sx + x]; }
  cellOf(pos) { return [Math.floor(pos.x), Math.floor(pos.z)]; }

  _step(ax, az, bx, bz) {
    const dh = this.floorAt(bx, bz) - this.floorAt(ax, az);
    return dh <= NAV_MAX_UP && dh >= -NAV_MAX_DROP;
  }

  // Closest walkable cell to (x, z), searching outward a few cells.
  nearest(x, z, maxR = 5) {
    if (this.walkable(x, z)) return [x, z];
    for (let r = 1; r <= maxR; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++)
          if (Math.max(Math.abs(dx), Math.abs(dz)) === r && this.walkable(x + dx, z + dz)) return [x + dx, z + dz];
    return null;
  }

  // Random walkable cell inside a rectangle { x0, z0, x1, z1 } (or near a point).
  randomIn(r, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const x = r.x0 + Math.floor(Math.random() * (r.x1 - r.x0 + 1));
      const z = r.z0 + Math.floor(Math.random() * (r.z1 - r.z0 + 1));
      if (this.walkable(x, z) && this.penalty[z * this.sx + x] === 0) return [x, z];
    }
    return this.nearest(Math.round((r.x0 + r.x1) / 2), Math.round((r.z0 + r.z1) / 2), 8);
  }

  // A* from cell (sx,sz) to (gx,gz). Returns [{ x, z, y, jump }] cell centres, or null.
  findPath(sx, sz, gx, gz) {
    const s = this.nearest(sx, sz), g = this.nearest(gx, gz);
    if (!s || !g) return null;
    [sx, sz] = s; [gx, gz] = g;
    const W = this.sx, N = W * this.sz;
    const start = sz * W + sx, goal = gz * W + gx;
    const cost = new Float32Array(N).fill(Infinity);
    const came = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const h = (x, z) => {
      const dx = Math.abs(x - gx), dz = Math.abs(z - gz);
      return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
    };
    const open = new MinHeap();
    cost[start] = 0;
    open.push(start, h(sx, sz));
    let expanded = 0;
    while (open.size && expanded < 30000) {
      const cur = open.pop();
      if (closed[cur]) continue;
      closed[cur] = 1;
      expanded++;
      if (cur === goal) break;
      const cx = cur % W, cz = (cur / W) | 0;
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx, nz = cz + dz;
          if (!this.walkable(nx, nz)) continue;
          const ni = nz * W + nx;
          if (closed[ni] || !this._step(cx, cz, nx, nz)) continue;
          let step = 1;
          if (dx && dz) {
            // diagonals only on flat-ish ground and when both side cells are free (no corner cutting)
            if (!this.walkable(cx + dx, cz) || !this.walkable(cx, cz + dz)) continue;
            if (Math.abs(this.floorAt(nx, nz) - this.floorAt(cx, cz)) > 0.55) continue;
            step = 1.414;
          }
          const rise = this.floorAt(nx, nz) - this.floorAt(cx, cz);
          const c = cost[cur] + step + this.penalty[ni] + (rise > 0.55 ? 1.5 : 0);
          if (c < cost[ni]) {
            cost[ni] = c;
            came[ni] = cur;
            open.push(ni, c + h(nx, nz));
          }
        }
    }
    if (came[goal] === -1 && goal !== start) return null;
    const cells = [];
    for (let i = goal; i !== -1; i = came[i]) cells.push(i);
    cells.reverse();
    const path = [];
    let prevFloor = this.floor[start];
    for (const i of cells) {
      const x = i % W, z = (i / W) | 0, y = this.floor[i];
      path.push({ x: x + 0.5, z: z + 0.5, y, jump: y - prevFloor > 0.55 });
      prevFloor = y;
    }
    return path;
  }
}
