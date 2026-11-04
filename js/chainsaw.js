// Uprooting the tree, the loud way: whoever uproots pulls the cord on a big pink
// chainsaw (put-put-put… VRRRRRM) and cuts through the trunk while wood chips fly.
// It's LOUD on purpose: everyone on the map can hear someone is cutting the tree down.
// When it's through, the tree tips over (TIMBER!) and shrinks away.

class ChainsawAnim {
  constructor(game) {
    this.game = game;
    const lam = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
    const add = (parent, w, h, d, m, x, y, z) => {
      const b = new THREE.Mesh(roundedBoxGeometry(w, h, d, Math.min(w, h, d) * 0.25, 2), m);
      b.position.set(x, y, z);
      b.castShadow = true;
      parent.add(b);
      return b;
    };
    // local space: the tree trunk is at the origin, +z points at the person sawing
    this.group = new THREE.Group();
    this.group.visible = false;
    game.scene.add(this.group);

    // the saw: body at the back, the bar (with its chain) sticking forward (-z)
    this.saw = new THREE.Group();
    this.group.add(this.saw);
    const pink = lam(0xff5d9e, 0x330816), yellow = lam(0xffd23f, 0x332a00), dark = lam(0x2e2e36), metal = lam(0xd6dde6, 0x1a1d22);
    add(this.saw, 0.2, 0.18, 0.3, pink, 0, 0.0, 0.2);                   // engine body
    add(this.saw, 0.21, 0.04, 0.26, yellow, 0, 0.1, 0.2);               // yellow stripe on top
    add(this.saw, 0.04, 0.06, 0.18, dark, 0, 0.12, 0.38);               // rear handle
    add(this.saw, 0.25, 0.04, 0.04, dark, 0, 0.17, 0.08);               // front handle (the loop over the top)
    add(this.saw, 0.04, 0.12, 0.04, dark, 0.11, 0.11, 0.08);
    add(this.saw, 0.04, 0.12, 0.04, dark, -0.11, 0.11, 0.08);
    add(this.saw, 0.03, 0.09, 0.62, metal, 0, -0.01, -0.26);            // the bar
    this.chain = [];
    for (let i = 0; i < 14; i++) {                                       // the chain teeth (they run round the bar)
      const t = add(this.saw, 0.036, 0.016, 0.03, dark, 0, 0, 0);
      this.chain.push(t);
    }
    this.cord = add(this.saw, 0.008, 0.008, 1, lam(0xffffff), 0.11, 0.02, 0.2);   // pull cord (only when starting)
    this.cord.geometry.translate(0, 0, 0.5);

    // two paws: one on the rear handle, one on the front loop
    this.pawBack = makePaw({ shadow: true });
    this.pawFront = makePaw({ shadow: true });
    this.pawBack.scale.setScalar(0.85);
    this.pawFront.scale.set(-0.85, 0.85, 0.85);        // a left paw
    this.group.add(this.pawBack, this.pawFront);

    // the cut in the trunk (a dark notch that gets deeper)
    this.notch = add(this.group, 0.3, 0.06, 0.3, lam(0x3d2a17), 0, 0.45, 0.14);

    // flying wood chips
    this.chips = [];
    const chipMats = [0xd9a066, 0xb5835a, 0xf2d0a4].map(c => lam(c));
    for (let i = 0; i < 50; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.022), chipMats[i % 3]);
      m.visible = false;
      this.group.add(m);
      this.chips.push({ m, vel: new THREE.Vector3(), life: 0 });
    }
    this.chipNext = 0;
    this.active = false;
    this.cutY = 0.45;
  }

  // `e` starts sawing the tree at `treePos`
  start(e, treePos) {
    this.group.position.copy(treePos);
    this.group.rotation.y = Math.atan2(e.pos.x - treePos.x, e.pos.z - treePos.z);
    this.group.visible = true;
    this.active = true;
    this.who = e;
    this.lastP = 0;
    this.time = 0;
    const c = pawColors(e);
    for (const p of [this.pawBack, this.pawFront]) { p.setFur(c.fur); p.setSleeve(c.sleeve); }
    for (const ch of this.chips) { ch.life = 0; ch.m.visible = false; }
    this.update(0, 0);
  }

  // which way the tree should fall: away from whoever cut it
  get fallYaw() { return this.group.rotation.y + Math.PI; }

  cancel() {
    if (!this.active) return;
    this.active = false;
    this.group.visible = false;
    Sound.chainsaw(0);
  }

  finish() { this.cancel(); }

  _chip(at, n) {
    for (let i = 0; i < n; i++) {
      const c = this.chips[this.chipNext];
      this.chipNext = (this.chipNext + 1) % this.chips.length;
      c.m.position.copy(at);
      const side = Math.random() < 0.5 ? -1 : 1;
      c.vel.set(side * (0.8 + Math.random() * 1.2), 0.8 + Math.random() * 1.6, 0.6 + Math.random() * 1.2);
      c.life = 0.6 + Math.random() * 0.4;
      c.m.visible = true;
    }
  }

  // p = 0..1 through the uproot
  update(p, dt) {
    if (!this.active) return;
    const lastP = this.lastP;
    this.lastP = p;
    this.time += dt;
    const crossed = at => lastP < at && p >= at;
    const vol = this.game._volumeAt(this.group.position);
    const loud = 0.35 + 0.65 * vol;                    // you hear it from anywhere on the map

    // 1) pull the cord: put… put… VRRRM
    const started = p >= 0.07;
    const pulls = [0.005, 0.035, 0.065];
    let yank = 0;
    for (const at of pulls) { const k = (p - at) / 0.02; if (k > 0 && k < 1) yank = Math.sin(k * Math.PI); }
    for (const at of pulls) if (crossed(at)) Sound.pullCord(loud);
    // 2) cut: the bar goes into the trunk
    const cut = span(p, 0.1, 0.97);
    const buzz = started ? 0.006 : 0;
    const shakeX = Math.sin(this.time * 90) * buzz, shakeY = Math.cos(this.time * 77) * buzz;
    const barTip = 0.14 + 0.06 - cut * 0.32;              // tip of the bar: just touching the bark … all the way through
    this.saw.position.set(shakeX, this.cutY + shakeY, (started ? barTip + 0.57 : 0.95) + yank * 0.04);
    this.saw.rotation.set(started ? 0 : -0.15, 0, 0);
    // the chain runs round the bar
    const run = this.time * (started ? 6 : 0);
    this.chain.forEach((t, i) => {
      const u = ((i / this.chain.length) + run) % 1;
      const top = u < 0.5, k = top ? u * 2 : (u - 0.5) * 2;
      t.position.set(0, top ? 0.04 : -0.06, top ? 0.03 - k * 0.58 : -0.55 + k * 0.58);
    });
    // the pull cord stretches out on each yank
    this.cord.visible = !started;
    this.cord.scale.z = 0.02 + yank * 0.25;
    // paws: one on the rear handle (it does the yanking), one on the front loop
    this.saw.updateMatrix();
    const S = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(this.saw.matrix);
    this.pawBack.position.copy(S(0.06, 0.13, 0.42 + yank * 0.25));
    this.pawBack.rotation.set(0.35, 0.25, -1.2);
    this.pawBack.curl(1.3);
    this.pawFront.position.copy(S(-0.02, 0.21, 0.12));
    this.pawFront.rotation.set(0.2, -0.1, 0.1);
    this.pawFront.curl(1.35);
    // the notch gets deeper; chips fly while cutting
    this.notch.visible = cut > 0;
    this.notch.scale.set(1, 1, Math.max(0.05, cut));
    this.notch.position.set(0, this.cutY, 0.14 - cut * 0.14);
    if (started && cut > 0 && cut < 1 && Math.floor(this.time * 30) !== Math.floor((this.time - dt) * 30))
      this._chip(new THREE.Vector3(0, this.cutY, 0.15), 2);
    for (const c of this.chips) {
      if (c.life <= 0) continue;
      c.life -= dt;
      c.vel.y -= 6 * dt;
      c.m.position.addScaledVector(c.vel, dt);
      if (c.m.position.y < 0.01) { c.m.position.y = 0.01; c.vel.set(0, 0, 0); }
      c.m.rotation.x += dt * 9; c.m.rotation.z += dt * 7;
      if (c.life <= 0) c.m.visible = false;
    }
    // the tree trembles as it's being cut
    const tree = this.game.mode.boo && this.game.mode.boo.tree;
    if (tree) tree.rotation.z = started ? Math.sin(this.time * 47) * 0.012 * (0.3 + cut) : 0;

    // engine: idles while starting, screams while cutting
    if (started) Sound.chainsaw(loud, cut > 0 ? 1 : 0.3);
  }
}
