// The planting show, played in the world right in front of whoever is planting:
//   0.00–0.45  a little pink shovel digs three scoops, the hole opens, the dirt pile grows
//   0.45–0.60  a hand with painted nails lowers the seed into the hole
//   0.60–0.85  the hand pats the soil back (the pile goes back in the hole)
//   0.85–1.00  a tiny sprout pops out of the mound
// When it finishes, the real Boo-Boo tree takes over at the same spot.

class PlantAnim {
  constructor(game) {
    this.game = game;
    const lam = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
    const dirt = lam(0x7a5230), dirt2 = lam(0x8b5e34), dark = lam(0x3d2a17);
    const add = (parent, w, h, d, m, x, y, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      b.castShadow = true;
      parent.add(b);
      return b;
    };
    const piv = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    // local space: -z = away from the planter, +z = toward them (like their view)
    this.group = new THREE.Group();
    this.group.visible = false;
    game.scene.add(this.group);
    const G = this.group;
    this.hole = add(G, 0.38, 0.025, 0.38, dark, 0, 0.012, 0);
    this.pile = piv(G, -0.42, 0, 0.06);
    add(this.pile, 0.26, 0.12, 0.24, dirt, 0, 0.06, 0);
    add(this.pile, 0.16, 0.1, 0.16, dirt2, 0.03, 0.15, 0.02);
    add(this.pile, 0.1, 0.07, 0.1, dirt, -0.02, 0.22, 0);
    this.mound = add(G, 0.34, 0.08, 0.34, dirt2, 0, 0.04, 0);

    // shovel (pivot at the blade tip)
    this.shovel = piv(G, 0, 0, 0);
    add(this.shovel, 0.2, 0.24, 0.025, lam(0xff8fb1, 0x2a0a14), 0, 0.12, 0);   // pastel pink blade
    add(this.shovel, 0.035, 0.85, 0.035, lam(0xb5835a), 0, 0.66, 0);           // handle
    add(this.shovel, 0.14, 0.035, 0.035, lam(0xb5835a), 0, 1.08, 0);           // grip
    this.clump = add(this.shovel, 0.14, 0.06, 0.1, dirt, 0, 0.06, 0.03);         // dirt on the blade

    // hand (palm down, nails on top so you see them from above)
    this.hand = piv(G, 0, 0.3, 0.5);
    this.hand.scale.setScalar(0.8);                   // the left hand is a bit smaller than the right
    const skin = lam(0xf2c6a0), nail = lam(0xff3d8b, 0x551030), gold = lam(0xffd36b, 0x403010);
    add(this.hand, 0.11, 0.035, 0.12, skin, 0, 0, 0);                               // palm
    for (let i = 0; i < 4; i++) {
      const x = 0.04 - i * 0.027, len = [0.085, 0.095, 0.085, 0.07][i];
      add(this.hand, 0.022, 0.024, len, skin, x, 0, -0.06 - len / 2);
      add(this.hand, 0.018, 0.006, 0.022, nail, x, 0.014, -0.06 - len + 0.012);
    }
    add(this.hand, 0.024, 0.024, 0.07, skin, 0.07, -0.004, -0.02).rotation.y = -0.5;   // thumb
    add(this.hand, 0.12, 0.02, 0.04, gold, 0, 0, 0.075);                             // bracelet
    add(this.hand, 0.13, 0.06, 0.3, new THREE.MeshLambertMaterial({ map: Textures.noisyTexture(0xc9a7ff, 16, 8, 21) }), 0, 0, 0.24);
    this.seed = makeSeedPod();
    this.seed.scale.setScalar(0.7);
    G.add(this.seed);

    // sprout
    this.sprout = piv(G, 0, 0.08, 0);
    const green = lam(0x5fbf4a);
    add(this.sprout, 0.03, 0.2, 0.03, green, 0, 0.1, 0);
    add(this.sprout, 0.12, 0.02, 0.06, lam(0x7bd66b), 0.06, 0.19, 0).rotation.z = 0.4;
    add(this.sprout, 0.12, 0.02, 0.06, lam(0x7bd66b), -0.06, 0.17, 0).rotation.z = -0.4;

    this.digPoint = new THREE.Vector3();
    this.active = false;
  }

  // Where the hole goes: just in front of the planter's feet (or at their feet if a wall is there).
  static digSpot(e, world) {
    const yaw = e.mover.yaw;
    const p = e.pos.clone().add(new THREE.Vector3(-Math.sin(yaw) * 0.75, 0, -Math.cos(yaw) * 0.75));
    if (world.solidTopAt(p.x, e.pos.y + 0.3, p.z) !== null) p.copy(e.pos);
    return p;
  }

  start(e) {
    this.digPoint.copy(PlantAnim.digSpot(e, this.game.world));
    this.group.position.copy(this.digPoint);
    this.group.rotation.y = e.mover.yaw;
    this.group.visible = true;
    this.active = true;
    this.lastP = 0;
    this.planter = e;
    this.update(0);
  }

  cancel() { this.group.visible = false; this.active = false; }
  finish() { this.cancel(); }

  _dirtBurst(localPos, n = 7) {
    const world = this.group.localToWorld(localPos.clone());
    const items = [];
    for (let i = 0; i < n; i++) items.push({ pos: world.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.12, Math.random() * 0.08, (Math.random() - 0.5) * 0.12)), color: i % 2 ? 0x7a5230 : 0x8b5e34 });
    this.game.effects.pixelBurst(items, world.clone().setY(world.y - 0.2), new THREE.Vector3(), 0.06);
  }

  update(p) {
    if (!this.active) return;
    const lastP = this.lastP;
    this.lastP = p;
    const crossed = at => lastP < at && p >= at;
    const vol = this.game._volumeAt(this.digPoint);

    // 1) dig: three scoops
    const dig = span(p, 0, 0.45);
    this.hole.scale.set(Math.max(0.05, dig), 1, Math.max(0.05, dig));
    const refill = span(p, 0.6, 0.85);
    this.pile.scale.setScalar(Math.max(0.001, Math.min(1, dig * 1.2) * (1 - refill * 0.85)));
    this.mound.scale.set(Math.max(0.001, refill), Math.max(0.001, refill), Math.max(0.001, refill));
    this.mound.visible = refill > 0;
    this.hole.visible = refill < 1;

    this.shovel.visible = p < 0.47;
    if (this.shovel.visible) {
      const s = (dig * 3) % 1;                               // where we are in this scoop
      const plunge = new THREE.Vector3(0, -0.05, 0), up = new THREE.Vector3(0, 0.32, 0.05), dump = new THREE.Vector3(-0.38, 0.32, 0.06);
      const start = new THREE.Vector3(0.05, 0.35, 0.2);
      const pos = new THREE.Vector3();
      if (s < 0.35) pos.lerpVectors(start, plunge, ease01(s / 0.35));
      else if (s < 0.65) pos.lerpVectors(plunge, up, ease01((s - 0.35) / 0.3));
      else pos.lerpVectors(up, dump, ease01((s - 0.65) / 0.35));
      this.shovel.position.copy(pos);
      this.shovel.rotation.set(0.5, 0, s > 0.8 ? (s - 0.8) * 4 : 0);      // handle leans toward the planter; tips to dump
      this.clump.visible = s > 0.4 && s < 0.85;
      for (const at of [0.35 / 3, 1.35 / 3, 2.35 / 3]) if (crossed(at * 0.45)) Sound.dig(vol);
      for (const at of [0.85 / 3, 1.85 / 3, 2.85 / 3]) if (crossed(at * 0.45)) this._dirtBurst(new THREE.Vector3(-0.38, 0.3, 0.06));
    }

    // 2) seed goes in, 3) pat pat pat
    const seedIn = span(p, 0.45, 0.6);
    this.hand.visible = p > 0.43 && p < 0.92;
    this.seed.visible = p > 0.43 && p < 0.62;
    if (p < 0.6) {
      this.hand.position.lerpVectors(new THREE.Vector3(0.1, 0.9, 0.7), new THREE.Vector3(0, 0.22, 0.12), ease01(seedIn * 1.6));
      this.seed.position.set(this.hand.position.x, Math.max(0.03, this.hand.position.y - 0.08 - span(p, 0.53, 0.6) * 0.2), this.hand.position.z - 0.08);
    } else {
      const pats = span(p, 0.6, 0.85);
      const bob = Math.abs(Math.sin(pats * Math.PI * 3));
      const leave = span(p, 0.85, 0.92);
      this.hand.position.set(0, 0.12 + bob * 0.12 + leave * 0.8, 0.1 + leave * 0.5);
      for (const at of [0.6 + 0.25 / 3, 0.6 + 0.5 / 3, 0.85]) if (crossed(at)) Sound.tap();
    }
    if (crossed(0.53)) Sound.pickup();

    // 4) sprout
    const sp = span(p, 0.85, 1);
    this.sprout.visible = sp > 0;
    const bounce = sp < 1 ? Math.sin(sp * Math.PI) * 0.25 : 0;
    this.sprout.scale.setScalar(Math.max(0.001, sp + bounce));
    if (crossed(0.86)) Sound.sprout();
  }
}
