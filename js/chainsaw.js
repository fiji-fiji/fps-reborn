// Uprooting the tree: whoever uproots pulls the cord on a big pink chainsaw and cuts
// through the trunk while wood chips fly. The joke is the sound: instead of a roar, the
// saw makes a tiny squeaky fart when it starts, then little pffts while it cuts.
// The whole show plays in the world, so everyone who can see the tree sees it. The saw is
// always in the cutter's hands: other people see it in their character's arms; the cutter
// sees their own fluffy paws on the two handles, forearms coming from their shoulders.
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

    // the saw: body at the back, the bar (with its chain) sticking forward (-z).
    // It lives in world space (it follows the cutter's hands, not the tree).
    this.saw = new THREE.Group();
    this.saw.visible = false;
    game.scene.add(this.saw);
    const pink = lam(0xff5d9e, 0x330816), yellow = lam(0xffd23f, 0x332a00), dark = lam(0x2e2e36), metal = lam(0xd6dde6, 0x1a1d22);
    add(this.saw, 0.2, 0.18, 0.3, pink, 0, 0.0, 0.2);                   // engine body
    add(this.saw, 0.21, 0.04, 0.26, yellow, 0, 0.1, 0.2);               // yellow stripe on top
    add(this.saw, 0.04, 0.06, 0.18, dark, 0, 0.12, 0.38);               // rear handle
    add(this.saw, 0.25, 0.04, 0.04, dark, 0, 0.17, 0.08);               // front handle (the loop over the top)
    add(this.saw, 0.04, 0.12, 0.04, dark, 0.11, 0.11, 0.08);
    add(this.saw, 0.04, 0.12, 0.04, dark, -0.11, 0.11, 0.08);
    this.bar = add(this.saw, 0.03, 0.09, 0.62, metal, 0, -0.01, -0.26); // the bar (stretches to reach the trunk)
    this.chain = [];
    for (let i = 0; i < 14; i++) {                                       // the chain teeth (they run round the bar)
      const t = add(this.saw, 0.036, 0.016, 0.03, dark, 0, 0, 0);
      this.chain.push(t);
    }
    this.cord = add(this.saw, 0.008, 0.008, 1, lam(0xffffff), 0.11, 0.02, 0.2);   // pull cord (only when starting)
    this.cord.geometry.translate(0, 0, 0.5);

    // your own two paws (only when it's you sawing): one on the rear handle, one on the front loop
    this.pawBack = makePaw({ shadow: true });
    this.pawFront = makePaw({ shadow: true });
    this.pawBack.scale.setScalar(0.62);
    this.pawFront.scale.set(-0.62, 0.62, 0.62);        // a left paw
    this.pawBack.visible = this.pawFront.visible = false;
    game.scene.add(this.pawBack, this.pawFront);
    this._q = new THREE.Quaternion(); this._m = new THREE.Matrix4();

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
    // the saw starts a little closer to whoever's holding it when they stand far back
    this.reachZ = Math.max(0, Math.min(0.3, Math.hypot(e.pos.x - treePos.x, e.pos.z - treePos.z) - 1.3));
    this.group.visible = true;
    this.saw.visible = true;
    this.active = true;
    this.who = e;
    this.lastP = 0;
    this.time = 0;
    this.nextPuff = Infinity;
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
    this.saw.visible = false;
    this.pawBack.visible = this.pawFront.visible = false;
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

  // Put the saw in the cutter's hands, its bar reaching into the trunk.
  _place(started, cut, yank, shakeX, shakeY) {
    const e = this.who, model = e && e.model, V = (x, y, z) => new THREE.Vector3(x, y, z);
    const up = V(0, 1, 0);
    const trunk = this.group.position.clone().setY(this.group.position.y + this.cutY);
    // first person (your own model is hidden): the hands are just below your eyes
    const fp = !model || !model.group || !model.group.visible;
    let R, Lh, eye = null, right = null;
    if (fp) {
      eye = this.game.camera.position.clone();
      const f = trunk.clone().sub(eye).setY(0).normalize();
      right = new THREE.Vector3().crossVectors(f, up).normalize();
      // held off to the right, so the bar goes into the trunk at an angle and you can watch the cut
      R = eye.clone().addScaledVector(f, 0.5).addScaledVector(up, -0.64).addScaledVector(right, 0.36);
      Lh = eye.clone().addScaledVector(f, 0.74).addScaledVector(up, -0.58).addScaledVector(right, 0.2);
    } else {
      model.group.updateMatrixWorld(true);
      R = model.rArm.localToWorld(V(0, -0.6, 0));
      Lh = model.lArm.localToWorld(V(0, -0.6, 0));
    }
    const M = R.clone().add(Lh).multiplyScalar(0.5);
    // where the bar's tip should be: touching the bark … all the way through
    const toHolder = M.clone().sub(trunk).setY(0).normalize();
    const tip = trunk.clone().addScaledVector(toHolder, started ? 0.2 - cut * 0.32 : 0.45);
    // the saw's axes: +z back toward whoever holds it, the bar along -z
    const Z = M.clone().sub(tip).normalize();
    const X = new THREE.Vector3().crossVectors(up, Z).normalize();
    const Y = new THREE.Vector3().crossVectors(Z, X);
    this._m.makeBasis(X, Y, Z);
    this.saw.quaternion.setFromRotationMatrix(this._m);
    // the middle of the two handles goes between the hands
    const H = V(0, 0.145, 0.23).applyQuaternion(this.saw.quaternion);
    this.saw.position.copy(M).sub(H).add(V(shakeX, shakeY, 0));
    // the bar stretches from the saw to the tip
    const barStart = this.saw.position.clone().add(V(0, -0.01, 0.05).applyQuaternion(this.saw.quaternion));
    this.barLen = Math.max(0.35, Math.min(1.3, barStart.distanceTo(tip)));
    this.bar.scale.z = this.barLen / 0.62;
    this.bar.position.z = 0.05 - this.barLen / 2;
    // your own paws on the handles, forearms back to your shoulders
    this.pawBack.visible = this.pawFront.visible = fp;
    if (fp) {
      this.saw.updateMatrixWorld(true);
      const grip = (paw, local, shoulderSide, back) => {
        const at = this.saw.localToWorld(local.clone());
        const shoulder = eye.clone().addScaledVector(up, -0.35).addScaledVector(right, shoulderSide * 0.24);
        const Zp = shoulder.clone().sub(at).normalize();
        const Xp = new THREE.Vector3().crossVectors(up, Zp).normalize();
        const Yp = new THREE.Vector3().crossVectors(Zp, Xp);
        paw.quaternion.setFromRotationMatrix(this._m.makeBasis(Xp, Yp, Zp));
        paw.position.copy(at).addScaledVector(Zp, back);
      };
      grip(this.pawBack, V(0, 0.16, 0.4), 1, yank * 0.22);              // rear handle (it yanks the cord)
      grip(this.pawFront, V(-0.03, 0.2, 0.08), -1, 0);                 // front loop
      this.pawBack.curl(1.3); this.pawFront.curl(1.35);
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
    const soft = 0.08 + 0.92 * vol;                    // discreet: you hear it properly only nearby

    // 1) pull the cord: put… put… VRRRM
    const started = p >= 0.07;
    const pulls = [0.005, 0.035, 0.065];
    let yank = 0;
    for (const at of pulls) { const k = (p - at) / 0.02; if (k > 0 && k < 1) yank = Math.sin(k * Math.PI); }
    // 2) cut: the bar goes into the trunk
    const cut = span(p, 0.1, 0.97);
    const buzz = started ? 0.006 : 0;
    const shakeX = Math.sin(this.time * 90) * buzz, shakeY = Math.cos(this.time * 77) * buzz;
    this._place(started, cut, yank, shakeX, shakeY);
    // the chain runs round the bar
    const run = this.time * (started ? 6 : 0), L = this.barLen;
    this.chain.forEach((t, i) => {
      const u = ((i / this.chain.length) + run) % 1;
      const top = u < 0.5, k = top ? u * 2 : (u - 0.5) * 2;
      t.position.set(0, top ? 0.04 : -0.06, top ? 0.03 - k * (L - 0.04) : 0.01 - L + k * (L - 0.04));
    });
    // the pull cord stretches out on each yank
    this.cord.visible = !started;
    this.cord.scale.z = 0.02 + yank * 0.25;
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

    // sound: one long squeaky fart as it starts… then short little ones while it cuts
    const at = this.group.position.clone().setY(this.group.position.y + this.cutY);
    if (crossed(0.07)) { Sound.at(at, 'fart', soft, 'long'); this.nextPuff = this.time + 1.3; }
    if (started && cut > 0 && cut < 1 && this.time >= this.nextPuff) {
      Sound.at(at, 'fart', soft * 0.8, 'short');
      this.nextPuff = this.time + 0.45 + Math.random() * 0.6;
    }
  }
}
