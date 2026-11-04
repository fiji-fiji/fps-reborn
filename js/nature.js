// A little nature: a gentle wind that comes in gusts, grass tufts that sway with it,
// petals and leaves drifting past, a few butterflies, and birds chirping from the trees
// (in 3D, like everything else). It's all soft on purpose: footsteps must stay easy to hear.

class Nature {
  constructor(game, mapInfo) {
    this.game = game;
    this.time = 0;
    this.gust = 0;                                  // 0 calm .. 1 gusty
    this.wind = new THREE.Vector3(1, 0, 0.3).normalize();
    this.birdIn = 2 + Math.random() * 3;
    this._buildGrass(mapInfo);
    this._buildPetals();
    this._buildButterflies(mapInfo);
  }

  // Grass tufts on open ground, bending in the wind (done on the GPU so it's cheap).
  _buildGrass(mapInfo) {
    const nav = this.game.nav, world = this.game.world;
    const spots = [];
    for (let i = 0; i < 9000 && spots.length < 900; i++) {
      const x = Math.floor(Math.random() * nav.sx), z = Math.floor(Math.random() * nav.sz);
      if (!nav.walkable(x, z)) continue;
      const y = nav.floorAt(x, z);
      // only along edges (next to a wall), where grass would really grow
      const edge = !nav.walkable(x + 1, z) || !nav.walkable(x - 1, z) || !nav.walkable(x, z + 1) || !nav.walkable(x, z - 1);
      if (!edge && Math.random() > 0.08) continue;
      const id = world.get(x, Math.floor(y - 0.05), z);
      const name = id && BLOCK_DEFS[id] ? BLOCK_DEFS[id].name : '';
      if (/water|plank|crate/.test(name)) continue;
      spots.push([x + 0.15 + Math.random() * 0.7, y, z + 0.15 + Math.random() * 0.7]);
    }
    // one tuft = three thin blades
    const blade = new THREE.PlaneGeometry(0.06, 0.32, 1, 3);
    blade.translate(0, 0.16, 0);
    const geos = [0, 1, 2].map(i => {
      const g = blade.clone();
      g.rotateY(i * Math.PI / 3);
      g.translate((i - 1) * 0.04, 0, (i % 2) * 0.03);
      g.scale(1, 0.8 + i * 0.2, 1);
      return g;
    });
    const merged = mergeGeos(geos);
    const mat = new THREE.MeshLambertMaterial({ color: 0x6fc25a, side: THREE.DoubleSide });
    this.grassUniforms = { uTime: { value: 0 }, uGust: { value: 0 }, uWind: { value: new THREE.Vector2(1, 0.3) } };
    mat.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, this.grassUniforms);
      shader.vertexShader = 'uniform float uTime; uniform float uGust; uniform vec2 uWind;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
         float bend = position.y * position.y * 3.0;
         float sway = sin(uTime * 2.2 + wp.x * 0.7 + wp.z * 0.5) * 0.35 + 0.25 + uGust * 0.9;
         transformed.x += uWind.x * bend * sway * 0.18;
         transformed.z += uWind.y * bend * sway * 0.18;`);
    };
    const mesh = new THREE.InstancedMesh(merged, mat, spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const tints = [0x6fc25a, 0x7fd06a, 0x5aa94a, 0x8bd47a];
    spots.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
      s.setScalar(0.7 + Math.random() * 0.7);
      m.compose(new THREE.Vector3(...p), q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(tints[i % tints.length]));
    });
    mesh.receiveShadow = true;
    this.game.scene.add(mesh);
    this.grass = mesh;
  }

  // Petals and leaves floating by on the wind, around wherever you are.
  _buildPetals() {
    this.petalCount = 90;
    const geo = new THREE.PlaneGeometry(0.07, 0.05);
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
    this.petals = new THREE.InstancedMesh(geo, mat, this.petalCount);
    this.petals.frustumCulled = false;
    const cols = [0xff9ebb, 0xffc4d8, 0xffffff, 0x8fd46f, 0xffd36b];
    this.petalState = [];
    for (let i = 0; i < this.petalCount; i++) {
      this.petals.setColorAt(i, new THREE.Color(cols[i % cols.length]));
      this.petalState.push({ pos: new THREE.Vector3(), spin: new THREE.Euler(), life: 0, phase: Math.random() * 10 });
    }
    this.game.scene.add(this.petals);
  }

  _respawnPetal(p, around) {
    const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 22;
    p.pos.set(around.x + Math.cos(a) * r, around.y + 2 + Math.random() * 6, around.z + Math.sin(a) * r);
    p.life = 6 + Math.random() * 8;
  }

  // A few butterflies fluttering around open spots.
  _buildButterflies(mapInfo) {
    this.flies = [];
    const nav = this.game.nav;
    const cols = [[0xffd23f, 0xff9e5e], [0x8fd3ff, 0xffffff], [0xff8fb1, 0xc77dff]];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const [c1, c2] = cols[i % cols.length];
      const wingMat = new THREE.MeshLambertMaterial({ color: c1, emissive: new THREE.Color(c2).multiplyScalar(0.25), side: THREE.DoubleSide });
      const L = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.09), wingMat); L.geometry.translate(-0.055, 0, 0);
      const R = new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.09), wingMat); R.geometry.translate(0.055, 0, 0);
      L.rotation.x = R.rotation.x = -Math.PI / 2;
      const wl = new THREE.Group(), wr = new THREE.Group();
      wl.add(L); wr.add(R);
      g.add(wl, wr);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.08), new THREE.MeshLambertMaterial({ color: 0x3a2a20 }));
      g.add(body);
      let c = null;
      for (let k = 0; k < 40 && !c; k++) c = nav.randomIn({ x0: 0, z0: 0, x1: nav.sx - 1, z1: nav.sz - 1 });
      if (!c) continue;
      const home = new THREE.Vector3(c[0] + 0.5, nav.floorAt(c[0], c[1]) + 1.2, c[1] + 0.5);
      g.position.copy(home);
      this.game.scene.add(g);
      this.flies.push({ g, wl, wr, home, phase: Math.random() * 10, target: home.clone() });
    }
  }

  update(dt, listener) {
    this.time += dt;
    const t = this.time;
    // gusts come and go (a few slow waves on top of each other)
    this.gust = Math.max(0, Math.sin(t * 0.21) * 0.5 + Math.sin(t * 0.53 + 1.3) * 0.35 + Math.sin(t * 1.7) * 0.1);
    const wa = 0.4 + Math.sin(t * 0.03) * 0.6;
    this.wind.set(Math.cos(wa), 0, Math.sin(wa));
    Sound.wind(this.gust);

    if (this.grassUniforms) {
      this.grassUniforms.uTime.value = t;
      this.grassUniforms.uGust.value = this.gust;
      this.grassUniforms.uWind.value.set(this.wind.x, this.wind.z);
    }

    // petals
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < this.petalCount; i++) {
      const p = this.petalState[i];
      p.life -= dt;
      if (p.life <= 0 || p.pos.y < listener.y - 3) this._respawnPetal(p, listener);
      const push = 0.6 + this.gust * 2.2;
      p.pos.x += (this.wind.x * push + Math.sin(t * 1.3 + p.phase) * 0.3) * dt;
      p.pos.z += (this.wind.z * push + Math.cos(t * 1.1 + p.phase) * 0.3) * dt;
      p.pos.y -= (0.35 - this.gust * 0.15) * dt;
      p.spin.set(t * 1.7 + p.phase, t * 1.1 + p.phase * 2, t * 0.7);
      q.setFromEuler(p.spin);
      m.compose(p.pos, q, one);
      this.petals.setMatrixAt(i, m);
    }
    this.petals.instanceMatrix.needsUpdate = true;

    // butterflies: flutter toward a new nearby spot every now and then
    for (const f of this.flies) {
      f.phase += dt;
      if (f.g.position.distanceTo(f.target) < 0.3 || Math.random() < dt * 0.15) {
        f.target.set(f.home.x + (Math.random() - 0.5) * 6, f.home.y + Math.random() * 1.6 - 0.4, f.home.z + (Math.random() - 0.5) * 6);
      }
      const to = f.target.clone().sub(f.g.position);
      const step = Math.min(to.length(), 1.1 * dt);
      to.normalize();
      f.g.position.addScaledVector(to, step);
      f.g.position.y += Math.sin(f.phase * 9) * 0.004;
      f.g.rotation.y = Math.atan2(to.x, to.z);
      const flap = Math.sin(f.phase * 26) * 1.0;
      f.wl.rotation.z = flap; f.wr.rotation.z = -flap;
    }

    // birds: a chirp from somewhere up in the trees every few seconds
    this.birdIn -= dt;
    if (this.birdIn <= 0) {
      this.birdIn = 3 + Math.random() * 7;
      const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 20;
      const at = new THREE.Vector3(listener.x + Math.cos(a) * r, listener.y + 5 + Math.random() * 5, listener.z + Math.sin(a) * r);
      Sound.at(at, 'bird', 0.55);
    }
  }
}

// merge a few BufferGeometries (same attributes) into one
function mergeGeos(geos) {
  const pos = [], nor = [], uv = [], idx = [];
  let off = 0;
  for (const g of geos) {
    const gi = g.index ? g.index.array : null;
    pos.push(...g.attributes.position.array);
    nor.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array);
    if (gi) for (const v of gi) idx.push(v + off);
    off += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
