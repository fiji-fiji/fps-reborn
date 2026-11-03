// The Boo-Boo: a magic seed. Attackers carry it and plant it on a site; a little
// rain cloud waters it and a tree grows over 45 seconds. If it fully blooms, it
// bursts into petals and pops everyone nearby. Defenders can uproot it in time.

const BOOBOO = {
  plantTime: 4,       // seconds holding E to plant
  fuse: 45,           // seconds from planting to full bloom
  uprootTime: 7,      // seconds holding E to uproot
  bloomRadius: 10,    // everyone this close pops when it blooms
  pickupRadius: 1.1,
  uprootReach: 1.6,
};

class BooBoo {
  constructor(scene, effects) {
    this.scene = scene;
    this.effects = effects;
    this.state = 'none';           // none | carried | dropped | planted | bloomed | gone
    this.pos = new THREE.Vector3();
    this.progress = 0;
    this.leaving = 0;
    const lam = (hex, seed, amt = 18) => new THREE.MeshLambertMaterial({ map: Textures.noisyTexture(hex, amt, 8, seed) });

    // dropped on the ground
    this.pod = makeSeedPod();
    this.pod.scale.setScalar(1.4);
    this.pod.visible = false;
    scene.add(this.pod);

    // the growing tree
    this.tree = new THREE.Group();
    const mound = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.7), lam(0x7a5230, 31));
    mound.position.y = 0.07;
    this.tree.add(mound);
    const trunkGeo = new THREE.BoxGeometry(0.28, 1, 0.28);
    trunkGeo.translate(0, 0.5, 0);
    this.trunk = new THREE.Mesh(trunkGeo, lam(0x8b5a2b, 32));
    this.tree.add(this.trunk);
    this.crown = new THREE.Group();
    this.tree.add(this.crown);
    const leaf = lam(0x5fbf4a, 33, 30), leafDark = lam(0x3f9a3a, 34, 30);
    for (const [x, y, z, s, m] of [
      [0, 0, 0, 1.4, leaf], [0.85, -0.25, 0, 1.0, leafDark], [-0.85, -0.2, 0.1, 1.0, leafDark],
      [0, -0.2, 0.85, 1.0, leaf], [0.1, -0.25, -0.85, 1.0, leaf], [0, 0.8, 0, 0.9, leafDark],
    ]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.8, s), m);
      b.position.set(x, y, z);
      this.crown.add(b);
    }
    // blossoms appear as it grows and pulse faster near the end
    this.flowerMats = [0xff8fb1, 0xffd36b, 0xffffff, 0xf58fd0].map(c =>
      new THREE.MeshLambertMaterial({ color: c, emissive: 0x000000 }));
    this.flowers = [];
    const rng = makeRng(77);
    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI * 2, up = rng() * 1.2 - 0.25;
      const r = 1.35 + rng() * 0.2;            // sit on the outside of the leaves
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), this.flowerMats[i % 4]);
      f.position.set(Math.cos(a) * r, up, Math.sin(a) * r);
      f.rotation.set(rng(), rng(), rng());
      this.crown.add(f);
      this.flowers.push(f);
    }
    this.tree.visible = false;
    scene.add(this.tree);

    // rain cloud
    this.cloud = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x334455 });
    for (const [x, y, z, w, h, d] of [
      [0, 0, 0, 2.4, 0.7, 1.8], [1.0, 0.3, 0.3, 1.5, 0.8, 1.3], [-1.0, 0.25, -0.2, 1.5, 0.7, 1.4], [0.2, 0.5, -0.5, 1.3, 0.6, 1.1],
    ]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), white);
      b.position.set(x, y, z);
      this.cloud.add(b);
    }
    this.cloud.visible = false;
    scene.add(this.cloud);

    this.dropCount = 70;
    this.rain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.28, 0.03),
      new THREE.MeshBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.8 }), this.dropCount);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.drops = [];
    for (let i = 0; i < this.dropCount; i++) this.drops.push({ x: 0, y: 0, z: 0, v: 8 });
    scene.add(this.rain);
    this._m = new THREE.Matrix4();
  }

  reset() {
    this.state = 'none';
    this.progress = 0;
    this.leaving = 0;
    this.pod.visible = this.tree.visible = this.cloud.visible = this.rain.visible = false;
    this.tree.scale.setScalar(1);
  }

  drop(pos) {
    this.state = 'dropped';
    this.pos.copy(pos);
    this.pod.visible = true;
  }

  pickUp() {
    this.state = 'carried';
    this.pod.visible = false;
  }

  plant(pos) {
    this.state = 'planted';
    this.pos.copy(pos);
    this.progress = 0;
    this.tree.position.copy(pos);
    this.tree.scale.setScalar(1);
    this.tree.visible = true;
    this.cloud.position.set(pos.x, pos.y + 6.2, pos.z);
    this.cloud.visible = true;
    this.rain.visible = true;
    for (const d of this.drops) this._resetDrop(d, true);
    this._grow(0, 0);
  }

  _resetDrop(d, anywhere) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 1.4;
    d.x = this.cloud.position.x + Math.cos(a) * r;
    d.z = this.cloud.position.z + Math.sin(a) * r;
    const top = this.cloud.position.y - 0.3;
    d.y = anywhere ? this.pos.y + Math.random() * (top - this.pos.y) : top;
    d.v = 7 + Math.random() * 3;
  }

  // Seconds between "drip" beats: slow at first, fast near the end.
  beatInterval() { return 1.0 - 0.88 * Math.pow(this.progress, 1.6); }

  _grow(p, time) {
    const ease = t => t * t * (3 - 2 * t);
    const h = 0.15 + 3.0 * ease(p);
    this.trunk.scale.y = h;
    this.crown.position.y = h + 0.2;
    this.crown.scale.setScalar(Math.max(0.05, ease(Math.min(1, p * 1.25))));
    const shown = Math.floor(Math.max(0, (p - 0.35) / 0.6) * this.flowers.length);
    this.flowers.forEach((f, i) => { f.visible = i < shown; });
    // blossoms glow in time with the beat
    const beat = Math.pow(Math.max(0, Math.cos(time * Math.PI * 2 / this.beatInterval())), 8);
    for (const m of this.flowerMats) m.emissive.setRGB(beat * 0.5, beat * 0.4, beat * 0.4);
  }

  update(dt, time) {
    if (this.state === 'dropped') {
      this.pod.position.set(this.pos.x, this.pos.y + 0.3 + Math.sin(time * 3) * 0.08, this.pos.z);
      this.pod.rotation.y += dt * 1.5;
    }
    if (this.state === 'planted') {
      this._grow(this.progress, time);
      this.cloud.position.y = this.pos.y + 6.2 + Math.sin(time * 0.8) * 0.1;
      for (let i = 0; i < this.dropCount; i++) {
        const d = this.drops[i];
        d.y -= d.v * dt;
        if (d.y < this.pos.y) this._resetDrop(d, false);
        this._m.makeTranslation(d.x, d.y, d.z);
        this.rain.setMatrixAt(i, this._m);
      }
      this.rain.instanceMatrix.needsUpdate = true;
    }
    if (this.leaving > 0) {                         // uprooted: shrink away
      this.leaving = Math.max(0, this.leaving - dt);
      this.tree.scale.setScalar(this.leaving / 0.6);
      if (this.leaving === 0) this.tree.visible = false;
    }
  }

  // Full bloom: a big burst of petals (the game pops everyone nearby).
  bloom() {
    this.state = 'bloomed';
    const c = this.pos.clone();
    c.y += 3.2;
    const petals = [];
    const cols = [0xff8fb1, 0xffd36b, 0xffffff, 0xf58fd0, 0x5fbf4a, 0x7bd66b];
    for (let i = 0; i < 260; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize()
        .multiplyScalar(Math.random() * 1.5);
      petals.push({ pos: c.clone().add(v), color: cols[i % cols.length] });
    }
    this.effects.pixelBurst(petals, c.clone().setY(c.y - 1), new THREE.Vector3(), 0.16);
    this.effects.confettiBurst(c, 120, 9);
    this.effects.bubbleBurst(c, new THREE.Vector3(0, 1, 0), 60, 6, 0.2);
    this.tree.visible = this.cloud.visible = this.rain.visible = false;
  }

  uproot() {
    this.state = 'gone';
    this.leaving = 0.6;
    this.cloud.visible = this.rain.visible = false;
    const c = this.pos.clone();
    c.y += 1;
    this.effects.confettiBurst(c, 30, 3);
    this.effects.bubbleBurst(c, new THREE.Vector3(0, 1, 0), 20, 2.5, 0.1);
  }
}
