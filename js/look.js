// The game's two looks, picked in the menu (LOOK: Classic / Clean) and remembered.
//
//   classic — the textured blocks (the original look)
//   clean   — no textures: every surface becomes its own soft flat colour, each block face
//             a hair lighter or darker than its neighbours (a gentle patchwork), bright white
//             fog, a pale sky, no hard shadows. Characters pop out clearly against it.
//   hd      — the same world drawn as a real place: real materials, architecture, bounce light,
//             a proper sky and post-processing (hd.js, hdworld.js, hddress.js)
//
// Nothing is rebuilt for the clean look: Look.flatten() goes over what's in a scene and swaps
// each texture for its average colour (it's run again now and then for things made later).

const Look = {
  name: 'classic',

  // which look: ?look= in the address bar, else the last one picked
  pick() {
    const fromUrl = new URLSearchParams(location.search).get('look');
    let saved = '';
    try { saved = localStorage.getItem('fps.look') || ''; } catch (e) {}
    const v = fromUrl || saved;
    this.name = v === 'clean' || v === 'hd' ? v : 'classic';
    return this.name;
  },
  save(name) { try { localStorage.setItem('fps.look', name); } catch (e) {} },
  get clean() { return this.name === 'clean'; },

  _done: new WeakSet(),        // materials / geometries already flattened
  _avg: new Map(),             // texture uuid -> its average colour
  _cells: null,                // the block atlas: average colour of every tile

  // Average colour of a texture's picture (in the same colour space the shader works in).
  _avgColor(tex) {
    if (this._avg.has(tex.uuid)) return this._avg.get(tex.uuid);
    const c = new THREE.Color(1, 1, 1);
    const img = tex.image;
    try {
      const w = img.width, h = img.height;
      let ctx = img.getContext ? img.getContext('2d') : null;
      if (!ctx) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0); }
      const d = ctx.getImageData(0, 0, w, h).data;
      let r = 0, g = 0, b = 0, n = 0, sq = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
        const l = (d[i] + d[i + 1] + d[i + 2]) / 765; sq += l * l;
      }
      if (n) {
        c.setRGB(r / n / 255, g / n / 255, b / n / 255);
        const mean = (r + g + b) / n / 765;
        c.userData = { busy: Math.sqrt(Math.max(0, sq / n - mean * mean)) > 0.1 };   // a real picture (a face…), not just noise
      }
    } catch (e) {}
    if (tex.encoding === THREE.sRGBEncoding) c.convertSRGBToLinear();
    this._avg.set(tex.uuid, c);
    return c;
  },

  // the block atlas, tile by tile
  _atlasCells() {
    if (this._cells) return this._cells;
    const img = Textures.atlas.image, ctx = img.getContext('2d');
    const N = ATLAS_SIZE, cell = img.width / N;
    const cells = [];
    for (let row = 0; row < N; row++) {
      for (let col = 0; col < N; col++) {
        const d = ctx.getImageData(col * cell + TEX_GUTTER, row * cell + TEX_GUTTER, TEX_INNER, TEX_INNER).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
        const c = new THREE.Color(r / n / 255, g / n / 255, b / n / 255);
        const hsl = {}; c.getHSL(hsl);
        c.setHSL(hsl.h, Math.min(1, hsl.s * 0.9), Math.min(0.92, hsl.l * 1.04 + 0.03));   // a touch softer and lighter
        cells.push(c.convertSRGBToLinear());
      }
    }
    return (this._cells = cells);
  },

  // Atlas-textured geometry (the world, blocky bits): bake each face's tile colour into its
  // vertex colours (keeping the corner shading already there), with a tiny per-face variation.
  _bakeAtlas(geo) {
    if (this._done.has(geo)) return;
    this._done.add(geo);
    const uv = geo.attributes.uv, pos = geo.attributes.position, n = pos.count;
    if (!uv) return;
    const cells = this._atlasCells(), N = ATLAS_SIZE;
    const old = geo.attributes.color;
    const col = new Float32Array(n * 3);
    const quad = n % 4 === 0 ? 4 : 1;
    for (let q = 0; q < n; q += quad) {
      let u = 0, v = 0, x = 0, y = 0, z = 0;
      for (let k = 0; k < quad; k++) { u += uv.getX(q + k); v += uv.getY(q + k); x += pos.getX(q + k); y += pos.getY(q + k); z += pos.getZ(q + k); }
      u /= quad; v /= quad; x /= quad; y /= quad; z /= quad;
      const cx = Math.min(N - 1, Math.max(0, Math.floor(u * N))), cy = Math.min(N - 1, Math.max(0, Math.floor((1 - v) * N)));
      const base = cells[cy * N + cx];
      // the patchwork: each face a hair lighter or darker (stable: from where it is)
      const h = Math.sin(Math.floor(x * 2) * 12.9898 + Math.floor(y * 2) * 78.233 + Math.floor(z * 2) * 37.719) * 43758.5453;
      const jitter = 1 + ((h - Math.floor(h)) - 0.5) * 0.09;
      for (let k = 0; k < quad; k++) {
        const i = q + k, ao = old ? [old.getX(i), old.getY(i), old.getZ(i)] : [1, 1, 1];
        col[i * 3] = base.r * jitter * ao[0]; col[i * 3 + 1] = base.g * jitter * ao[1]; col[i * 3 + 2] = base.b * jitter * ao[2];
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  },

  _material(m, mesh) {
    if (!m || !m.map || !(m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshStandardMaterial)) return;
    if (m.alphaTest > 0) return;                                    // cut-out shapes keep their picture
    if (m.map === Textures.atlas) {
      if (mesh && mesh.geometry) this._bakeAtlas(mesh.geometry);
      if (this._done.has(m)) return;
      this._done.add(m);
      m.map = null;
      m.vertexColors = true;
      m.needsUpdate = true;
      return;
    }
    if (this._done.has(m)) return;
    this._done.add(m);
    const avg = this._avgColor(m.map);
    if (avg.userData && avg.userData.busy) return;                  // faces, eyes, labels: keep the picture
    m.color.multiply(avg);
    m.map = null;
    m.needsUpdate = true;
  },

  // Swap textures for flat colours on everything under `root`.
  flatten(root) {
    if (!this.clean || !root) return;
    root.traverse(o => {
      if (!o.isMesh) return;
      if (Array.isArray(o.material)) o.material.forEach(m => this._material(m, o));
      else this._material(o.material, o);
    });
  },
};
