// The planting show, played in the world right in front of whoever is planting.
// Every plant picks one of ten little shows (never the same twice in a row). They all
// share the same beats: dig a hole → the seed goes in → cover it → a tiny sprout pops out.
// When it finishes, the real Boo-Boo tree takes over at the same spot.
//
//   shovel  — the classic: a little pink shovel, three scoops, pat pat pat
//   paws    — digs with her bare hands like a puppy… then cleans the dirt out from
//             under every single nail, because priorities
//   spoon   — a dainty teaspoon, lots of tiny scoops flicked over her shoulder
//   claws   — scratches like a cat, a nail flies off, she finds it and clicks it back on
//   heel    — takes off her stiletto and stabs the hole open with the heel
//   karate  — HI-YA! one chop opens the hole (ow), then she tosses the seed in… almost
//   card    — scrapes the hole with her gold card, then wipes it clean on her sleeve
//   drill   — a pink power drill, brrrr, then a little gunslinger twirl
//   teacup  — digs with her teacup, waters the seed with the tea, then takes a sip
//   perfume — dainty one-finger flicks, then a spritz of perfume on the sprout

const PLANT_STYLES = ['shovel', 'paws', 'spoon', 'claws', 'heel', 'karate', 'card', 'drill', 'teacup', 'perfume'];
// when the hole is dug, the seed is in, and the hole is covered (the sprout pops after that)
const PLANT_TIMING = { quick: [0.36, 0.48, 0.62], normal: [0.45, 0.6, 0.85] };
const PLANT_FINALE = { paws: 1, claws: 1, card: 1, drill: 1, teacup: 1, perfume: 1 };   // these have an extra bit at the end
const FINALE_AT = 0.7;

class PlantAnim {
  constructor(game) {
    this.game = game;
    const lam = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
    this._lam = lam;
    const dirt = lam(0x7a5230), dirt2 = lam(0x8b5e34), dark = lam(0x3d2a17);
    const add = (parent, w, h, d, m, x, y, z) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      b.position.set(x, y, z);
      b.castShadow = true;
      parent.add(b);
      return b;
    };
    const cyl = (parent, rt, rb, h, m, x, y, z) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 14), m);
      c.position.set(x, y, z);
      parent.add(c);
      return c;
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

    // two hands (palm down, nails on top so you see them from above). A is the left one.
    const skin = lam(0xf2c6a0), nail = lam(0xff3d8b, 0x551030), gold = lam(0xffd36b, 0x403010);
    const sleeve = new THREE.MeshLambertMaterial({ map: Textures.noisyTexture(0xc9a7ff, 16, 8, 21) });
    const makeHand = mirror => {
      const h = piv(G, 0, 0.3, 0.5);
      h.scale.set(mirror ? -0.8 : 0.8, 0.8, 0.8);     // the hands are a bit small and dainty
      add(h, 0.11, 0.035, 0.12, skin, 0, 0, 0);                                     // palm
      h.userData.nails = [];
      for (let i = 0; i < 4; i++) {
        const x = 0.04 - i * 0.027, len = [0.085, 0.095, 0.085, 0.07][i];
        add(h, 0.022, 0.024, len, skin, x, 0, -0.06 - len / 2);
        h.userData.nails.push(add(h, 0.018, 0.006, 0.022, nail, x, 0.014, -0.06 - len + 0.012));
      }
      add(h, 0.024, 0.024, 0.07, skin, 0.07, -0.004, -0.02).rotation.y = -0.5;   // thumb
      add(h, 0.12, 0.02, 0.04, gold, 0, 0, 0.075);                                 // bracelet
      add(h, 0.13, 0.06, 0.3, sleeve, 0, 0, 0.24);
      return h;
    };
    this.hand = makeHand(false);
    this.handB = makeHand(true);
    this.seed = makeSeedPod();
    this.seed.scale.setScalar(0.7);
    G.add(this.seed);

    // --- props (the ones held in a hand are children of hand B; grip ≈ under the fingers) ---
    const B = this.handB, silver = lam(0xdfe6ee, 0x1a1d22), pink = lam(0xff8fb1, 0x2a0a14), hot = lam(0xff3d8b, 0x551030);
    this.spoon = piv(B, 0, -0.03, -0.1);
    add(this.spoon, 0.014, 0.008, 0.16, silver, 0, 0, -0.07);
    add(this.spoon, 0.05, 0.016, 0.065, silver, 0, -0.004, -0.17);
    this.spoonDirt = add(this.spoon, 0.04, 0.014, 0.05, dirt, 0, 0.008, -0.17);

    this.card = piv(B, 0, -0.03, -0.11);
    add(this.card, 0.11, 0.07, 0.005, gold, 0, -0.04, 0);
    add(this.card, 0.11, 0.012, 0.006, lam(0x3a3a4a), 0, -0.02, 0);
    add(this.card, 0.02, 0.016, 0.007, lam(0xfff2b0, 0x554a20), -0.03, -0.045, 0);   // the chip

    this.shoe = piv(B, 0, -0.02, -0.11);               // a stiletto held by the toe, heel down
    add(this.shoe, 0.065, 0.2, 0.02, hot, 0, -0.1, 0);                     // sole
    add(this.shoe, 0.07, 0.07, 0.05, pink, 0, -0.03, 0.025);               // toe
    add(this.shoe, 0.05, 0.03, 0.05, pink, 0, -0.2, 0.02);                 // heel cup
    add(this.shoe, 0.014, 0.1, 0.014, gold, 0, -0.26, 0.03);               // the spike
    this.shoe.scale.setScalar(1.5);                    // a big statement shoe
    this.shoeTip = new THREE.Vector3(0, -0.02 - 0.31 * 1.5, -0.11 + 0.03 * 1.5);   // spike tip, in hand B space

    this.drill = piv(B, 0, -0.06, -0.04);              // pistol grip; points along -z
    add(this.drill, 0.05, 0.06, 0.16, hot, 0, 0.04, -0.06);                // body
    add(this.drill, 0.04, 0.11, 0.045, pink, 0, -0.02, 0.0);               // handle
    add(this.drill, 0.052, 0.03, 0.04, lam(0x3a3a4a), 0, -0.07, 0.0);      // battery
    this.bit = piv(this.drill, 0, 0.04, -0.14);
    add(this.bit, 0.012, 0.012, 0.13, silver, 0, 0, -0.065);
    add(this.bit, 0.026, 0.004, 0.004, silver, 0, 0, -0.04);               // the twisty bits
    add(this.bit, 0.004, 0.026, 0.004, silver, 0, 0, -0.08);

    this.cup = piv(B, 0, -0.06, -0.12);
    const china = lam(0xffffff, 0x222222);
    cyl(this.cup, 0.045, 0.032, 0.05, china, 0, 0, 0);
    cyl(this.cup, 0.047, 0.047, 0.008, hot, 0, 0.024, 0);                   // pink rim
    add(this.cup, 0.012, 0.03, 0.03, china, 0.05, 0.002, 0);                // handle
    this.tea = cyl(this.cup, 0.04, 0.04, 0.004, lam(0xb5651d, 0x2a1406), 0, 0.02, 0);
    this.cupDirt = cyl(this.cup, 0.038, 0.038, 0.02, dirt, 0, 0.025, 0);
    this.stream = add(G, 0.012, 1, 0.012, lam(0xb5651d, 0x2a1406), 0, 0, 0);
    this.stream.geometry.translate(0, -0.5, 0);                             // hangs down from its top

    this.perfume = piv(B, 0, -0.07, -0.1);
    const glass = new THREE.MeshLambertMaterial({ color: 0xff9ecf, emissive: 0x401026, transparent: true, opacity: 0.8 });
    add(this.perfume, 0.06, 0.07, 0.035, glass, 0, 0, 0);
    add(this.perfume, 0.022, 0.025, 0.022, gold, 0, 0.047, 0);
    add(this.perfume, 0.008, 0.008, 0.02, gold, 0, 0.052, -0.018);         // nozzle
    this.nozzle = new THREE.Vector3(0, -0.07 + 0.052, -0.1 - 0.03);

    this.looseNail = add(G, 0.018 * 0.8, 0.006 * 0.8, 0.022 * 0.8, nail, 0, 0, 0);

    // sprout
    this.sprout = piv(G, 0, 0.08, 0);
    const green = lam(0x5fbf4a);
    add(this.sprout, 0.03, 0.2, 0.03, green, 0, 0.1, 0);
    add(this.sprout, 0.12, 0.02, 0.06, lam(0x7bd66b), 0.06, 0.19, 0).rotation.z = 0.4;
    add(this.sprout, 0.12, 0.02, 0.06, lam(0x7bd66b), -0.06, 0.17, 0).rotation.z = -0.4;

    this.props = [this.shovel, this.hand, this.handB, this.seed, this.spoon, this.card, this.shoe, this.drill,
      this.cup, this.stream, this.perfume, this.looseNail];

    // little specks of dirt / sparkles (a small pool, flying in the show's own space)
    this.specks = [];
    this._speckMats = {};
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), dirt);
      m.visible = false;
      G.add(m);
      this.specks.push({ m, vel: new THREE.Vector3(), life: 0, grav: 0 });
    }
    this.speckNext = 0;

    this.digPoint = new THREE.Vector3();
    this.active = false;
    this.style = null;
    this.forceStyle = null;                            // for testing: always play this one
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
    const options = PLANT_STYLES.filter(s => s !== this.style);
    this.style = this.forceStyle || options[Math.floor(Math.random() * options.length)];
    this.nailOff = false;
    this.nailPos = null;
    this._prevF = 0;
    this.hand.userData.nails.forEach(n => { n.visible = true; });
    for (const s of this.specks) { s.life = 0; s.m.visible = false; }
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

  // a few flying specks: dirt (falls) or sparkles (float)
  _specks(at, n, { vel = [0, 1, 0], spread = 0.6, colors = [0x7a5230, 0x8b5e34], size = 0.018, life = 0.7, grav = 5 } = {}) {
    for (let i = 0; i < n; i++) {
      const s = this.specks[this.speckNext];
      this.speckNext = (this.speckNext + 1) % this.specks.length;
      const c = colors[i % colors.length];
      if (!this._speckMats[c]) this._speckMats[c] = this._lam(c, grav ? 0 : c);
      s.m.material = this._speckMats[c];
      s.m.position.copy(at);
      s.m.scale.setScalar(size * (0.7 + Math.random() * 0.6));
      s.m.visible = true;
      s.vel.set(vel[0] + (Math.random() - 0.5) * spread, vel[1] + (Math.random() - 0.5) * spread, vel[2] + (Math.random() - 0.5) * spread);
      s.life = s.max = life * (0.7 + Math.random() * 0.6);
      s.grav = grav;
    }
  }
  _sparkle(at, n = 8, colors = [0xffffff, 0xffd23f, 0xff8fb1]) { this._specks(at, n, { vel: [0, 0.3, 0], spread: 0.9, colors, size: 0.014, life: 0.5, grav: 0 }); }

  _tickSpecks(dt) {
    for (const s of this.specks) {
      if (s.life <= 0) continue;
      s.life -= dt;
      s.vel.y -= s.grav * dt;
      s.m.position.addScaledVector(s.vel, dt);
      if (s.m.position.y < 0.01 && s.grav) { s.m.position.y = 0.01; s.vel.set(0, 0, 0); }
      s.m.rotation.x += dt * 8; s.m.rotation.y += dt * 6;
      if (!s.grav) s.m.scale.setScalar(s.m.scale.x * (1 - dt * 1.5));
      if (s.life <= 0) s.m.visible = false;
    }
  }

  // where a point given in a hand's own space is, in the show's space
  _at(hand, local) { return local.clone().multiply(hand.scale).applyQuaternion(hand.quaternion).add(hand.position); }
  // move a hand so that `local` (a point on it) lands on `target`
  _put(hand, local, target) { hand.position.copy(target).sub(local.clone().multiply(hand.scale).applyQuaternion(hand.quaternion)); }
  _tip(i) { return new THREE.Vector3(0.04 - i * 0.027, 0.004, -0.06 - [0.085, 0.095, 0.085, 0.07][i]); }   // under nail i

  _snd(name, ...args) { if (this.vol > 0.12 && Sound[name]) Sound[name](...args); }

  update(p) {
    if (!this.active) return;
    const lastP = this.lastP;
    this._prevP = lastP;
    this.lastP = p;
    const dt = Math.max(0, p - lastP) * BOOBOO.plantTime;
    const crossed = at => lastP < at && p >= at;
    this.vol = this.game._volumeAt(this.digPoint);
    const style = this.style;
    const [D, S, C] = PLANT_FINALE[style] ? PLANT_TIMING.quick : PLANT_TIMING.normal;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    for (const o of this.props) o.visible = false;
    this.hand.rotation.set(0, 0, 0);
    this.handB.rotation.set(0, 0, 0);
    this.drill.rotation.set(0, 0, 0);
    this.card.rotation.set(0, 0, 0);
    this.cup.rotation.set(0, 0, 0);
    this._tickSpecks(dt);

    // --- the ground: the hole opens while digging, the pile grows, then it's all filled back in ---
    let dig = span(p, 0, D);
    if (style === 'karate') dig = p < 0.31 ? 0.05 : 1;          // one chop and it's open
    this.hole.scale.set(Math.max(0.05, dig), 1, Math.max(0.05, dig));
    const refill = span(p, S, C);
    this.pile.scale.setScalar(Math.max(0.001, Math.min(1, dig * 1.2) * (1 - refill * 0.85)));
    this.mound.scale.setScalar(Math.max(0.001, refill));
    this.mound.visible = refill > 0;
    this.hole.visible = refill < 1;

    // --- dig ---
    if (p < D + 0.02) this['_dig_' + style](span(p, 0, D), p, crossed, V);

    // --- the seed goes in (the karate one gets tossed) ---
    if (p > D - 0.02 && p < S + 0.02) {
      if (style === 'karate') this._tossSeed(p, crossed, V);
      else {
        const seedIn = span(p, D, S);
        this.hand.visible = this.seed.visible = true;
        this.hand.position.lerpVectors(V(0.1, 0.9, 0.7), V(0, 0.22, 0.12), ease01(seedIn * 1.6));
        this.seed.position.set(this.hand.position.x, Math.max(0.03, this.hand.position.y - 0.08 - span(seedIn, 0.55, 1) * 0.2), this.hand.position.z - 0.08);
        if (crossed(D + (S - D) * 0.55)) this._snd('pickup');
      }
    }

    // --- cover it: pat pat pat (or water it with tea) ---
    if (p >= S && p < C + 0.07) {
      if (style === 'teacup') this._pourTea(p, S, C, V);
      else {
        const pats = span(p, S, C);
        const bob = Math.abs(Math.sin(pats * Math.PI * 3));
        const leave = span(p, C, C + 0.07);
        this.hand.visible = true;
        this.hand.position.set(0, 0.12 + bob * 0.12 + leave * 0.8, 0.1 + leave * 0.5);
        for (const k of [1, 2, 3]) if (crossed(S + (C - S) * k / 3)) this._snd('tap');
      }
    }

    // --- the sprout pops out ---
    const sp = span(p, C, C + 0.14);
    this.sprout.visible = sp > 0;
    const bounce = sp < 1 ? Math.sin(sp * Math.PI) * 0.25 : 0;
    this.sprout.scale.setScalar(Math.max(0.001, sp + bounce));
    this.sprout.rotation.set(0, 0, 0);
    if (crossed(C + 0.01)) this._snd('sprout');

    // --- the funny bit at the end ---
    if (PLANT_FINALE[style] && p >= FINALE_AT) this['_finale_' + style](span(p, FINALE_AT, 1), crossed, V, p);

    // a nail that came off stays where it fell
    if (this.nailOff) { this._flyNail(dt); this.looseNail.visible = true; }
  }

  // ======================= the digs (d = 0..1 through the dig) =======================

  _dig_shovel(d, p, crossed) {
    this.shovel.visible = d < 1;
    const s = (d * 3) % 1;                                  // where we are in this scoop
    const plunge = new THREE.Vector3(0, -0.05, 0), up = new THREE.Vector3(0, 0.32, 0.05), dump = new THREE.Vector3(-0.38, 0.32, 0.06);
    const start = new THREE.Vector3(0.05, 0.35, 0.2);
    const pos = new THREE.Vector3();
    if (s < 0.35) pos.lerpVectors(start, plunge, ease01(s / 0.35));
    else if (s < 0.65) pos.lerpVectors(plunge, up, ease01((s - 0.35) / 0.3));
    else pos.lerpVectors(up, dump, ease01((s - 0.65) / 0.35));
    this.shovel.position.copy(pos);
    this.shovel.rotation.set(0.5, 0, s > 0.8 ? (s - 0.8) * 4 : 0);   // handle leans toward the planter; tips to dump
    this.clump.visible = s > 0.4 && s < 0.85;
    for (const at of [0.35 / 3, 1.35 / 3, 2.35 / 3]) if (crossed(at * 0.45)) Sound.dig(this.vol);
    for (const at of [0.85 / 3, 1.85 / 3, 2.85 / 3]) if (crossed(at * 0.45)) this._dirtBurst(new THREE.Vector3(-0.38, 0.3, 0.06));
  }

  // both hands, like a puppy: scoop, fling it back, scoop, fling…
  _dig_paws(d, p, crossed, V) {
    if (d >= 1) return;
    const prev = span(this._prevP, 0, PLANT_TIMING.quick[0]);
    [[this.hand, 1, 0], [this.handB, -1, 0.5]].forEach(([h, side, k]) => {
      h.visible = true;
      const s = (d * 5 + k) % 1, sPrev = (prev * 5 + k) % 1;
      const x = side * 0.08;
      if (s < 0.4) {
        const u = ease01(s / 0.4);
        h.position.lerpVectors(V(x, 0.2, 0.04), V(x, 0.07, -0.1), u);
        h.rotation.x = -0.6 - 0.6 * u;
      } else if (s < 0.75) {
        const u = ease01((s - 0.4) / 0.35);
        h.position.lerpVectors(V(x, 0.07, -0.1), V(x, 0.08, 0.14), u);
        h.rotation.x = -1.2 + 0.7 * u;
      } else {
        const u = ease01((s - 0.75) / 0.25);
        h.position.lerpVectors(V(x, 0.08, 0.14), V(x, 0.2, 0.04), u);
        h.rotation.x = -0.5 - 0.1 * u;
      }
      h.rotation.z = side * 0.15;
      if (sPrev < 0.75 && s >= 0.75) {                      // fling!
        this._specks(V(x, 0.08, 0.1), 5, { vel: [side * 0.3 - 0.5, 1.4, 0.7] });
        if (side > 0) Sound.dig(this.vol * 0.6);
      }
    });
  }

  // a teaspoon: lots of tiny scoops, flicked over her shoulder
  _dig_spoon(d, p, crossed, V) {
    if (d >= 1) return;
    const B = this.handB;
    B.visible = this.spoon.visible = true;
    const prev = span(this._prevP, 0, PLANT_TIMING.normal[0]);
    const s = (d * 8) % 1, sPrev = (prev * 8) % 1;
    let dip = 0, flick = 0;
    if (s < 0.45) dip = ease01(s / 0.45);
    else if (s < 0.7) { dip = 1 - ease01((s - 0.45) / 0.25); flick = ease01((s - 0.45) / 0.25); }
    else flick = 1 - ease01((s - 0.7) / 0.3);
    B.rotation.set(-0.5 - dip * 0.3 + flick * 1.1, 0.2, 0);
    B.position.set(0.12 - Math.sin(d * 23) * 0.04, 0.27 - dip * 0.06, 0.2);
    this.spoonDirt.visible = s > 0.4 && s < 0.65;
    if (sPrev < 0.6 && s >= 0.6) {
      this._specks(this._at(B, V(0, -0.03, -0.27)), 4, { vel: [0.2, 1.8, 1.4], spread: 0.4 });
      this._snd('tap');
    }
  }

  // scratching like a cat; one nail pops off
  _dig_claws(d, p, crossed, V) {
    if (d >= 1) return;
    const A = this.hand;
    A.visible = true;
    A.rotation.set(-1.0, 0, Math.sin(d * 40) * 0.15);
    A.position.set(Math.sin(d * 9) * 0.05, 0.11, 0.0 + Math.sin(d * 70) * 0.05);
    const prev = span(this._prevP, 0, PLANT_TIMING.quick[0]);
    if (Math.floor(d * 14) !== Math.floor(prev * 14)) {
      this._specks(this._at(A, V(0, 0, -0.14)), 3, { vel: [-0.3, 1.2, 1.0] });
      if (Math.floor(d * 14) % 2) this._snd('file');
    }
    if (crossed(PLANT_TIMING.quick[0] * 0.8) && !this.nailOff) {            // ping! there goes a nail
      this.nailOff = true;
      A.userData.nails[1].visible = false;
      this.nailPos = this._at(A, V(0.013, 0.014, -0.143));
      this.nailVel = V(0.5, 1.3, 0.4);
      this.nailRest = false;
      this._snd('oops');
    }
  }

  _flyNail(dt) {
    if (!this.nailOff || this.nailRest || !this.nailVel) return;
    this.nailVel.y -= 5 * dt;
    this.nailPos.addScaledVector(this.nailVel, dt);
    if (this.nailPos.y <= 0.01) { this.nailPos.y = 0.01; this.nailRest = true; this._snd('tap'); }
    this.looseNail.position.copy(this.nailPos);
    this.looseNail.rotation.y += dt * 12;
  }

  // takes off her stiletto and stabs the hole open with the heel
  _dig_heel(d, p, crossed, V) {
    if (d >= 1) return;
    const B = this.handB;
    B.visible = this.shoe.visible = true;
    const s = (d * 3) % 1;
    let h;
    if (s < 0.55) h = 0.22 * ease01(s / 0.55);                  // wind up
    else if (s < 0.65) h = 0.22 * (1 - (s - 0.55) / 0.1);      // STAB
    else if (s < 0.82) h = 0;                                   // stuck a moment
    else h = 0.1 * ease01((s - 0.82) / 0.18);                   // pull it out
    B.rotation.set(0, 0.3, 0);
    this._put(B, this.shoeTip, V(0.03 + Math.sin(d * 5) * 0.04, -0.02 + h, -0.02));
    for (const k of [0, 1, 2]) if (crossed((k + 0.65) / 3 * PLANT_TIMING.normal[0])) {
      this._snd('stab', this.vol);
      this._specks(V(0.03, 0.02, -0.02), 7, { vel: [-0.2, 1.3, 0.3], spread: 0.9 });
    }
  }

  // HI-YA!
  _dig_karate(d, p, crossed, V) {
    if (p > 0.47) return;
    const A = this.hand;
    A.visible = true;
    A.rotation.set(0, 0, Math.PI / 2);                          // hand on its edge
    if (p < 0.28) {
      const k = ease01(span(p, 0.02, 0.28));
      A.position.set(0.05, 0.3 + k * 0.32 + Math.sin(p * 260) * 0.005 * k, 0.15 + k * 0.05);
    } else if (p < 0.31) {
      A.position.lerpVectors(V(0.05, 0.62, 0.2), V(0.02, 0.04, 0.0), ease01(span(p, 0.28, 0.31)));
    } else {
      const k = span(p, 0.31, 0.45);                            // ow ow ow
      A.position.lerpVectors(V(0.02, 0.04, 0.0), V(0.12, 0.35, 0.25), ease01(span(k, 0, 0.3)));
      A.rotation.z = Math.PI / 2 + Math.sin(p * 120) * 0.5 * (1 - k);
    }
    if (crossed(0.31)) {
      this._snd('chop', this.vol);
      this._dirtBurst(V(0, 0.05, 0), 12);
      this._specks(V(0, 0.03, 0), 14, { vel: [0, 1.5, 0], spread: 1.6 });
    }
    if (crossed(0.33)) this._snd('oops');
  }

  _tossSeed(p, crossed, V) {
    this.seed.visible = true;
    this.hand.visible = p < 0.53;
    this.hand.rotation.set(-0.3, 0, 0);
    this.hand.position.set(0.12, 0.35 - span(p, 0.45, 0.47) * 0.05, 0.25);
    const rim = V(0.17, 0.04, -0.04), hole = V(0, 0.03, 0);
    if (p < 0.465) this.seed.position.set(0.1, 0.27, 0.17);
    else if (p < 0.52) {                                       // up… and it hits the edge
      const u = span(p, 0.465, 0.52);
      this.seed.position.lerpVectors(V(0.1, 0.27, 0.17), rim, u);
      this.seed.position.y += 0.28 * 4 * u * (1 - u);
    } else {                                                   // hop… plop, in it goes
      const u = span(p, 0.52, 0.58);
      this.seed.position.lerpVectors(rim, hole, u);
      this.seed.position.y += 0.07 * 4 * u * (1 - u);
    }
    if (crossed(0.52)) this._snd('boop', 0.9);
    if (crossed(0.58)) this._snd('plop');
  }

  // scraping with a gold card
  _dig_card(d, p, crossed, V) {
    if (d >= 1) return;
    const B = this.handB;
    B.visible = this.card.visible = true;
    B.rotation.set(-0.35, 0, 0);
    const x = Math.sin(d * 28) * 0.08;
    B.position.set(x, 0.17 - d * 0.04, 0.12);
    const prev = span(this._prevP, 0, PLANT_TIMING.quick[0]);
    if (Math.sign(Math.cos(d * 28)) !== Math.sign(Math.cos(prev * 28))) {
      this._specks(V(x, 0.04, 0.02), 4, { vel: [-0.9 * Math.sign(Math.cos(d * 28)), 1.0, 0.3] });
      this._snd('file');
    }
  }

  // a pink power drill
  _dig_drill(d, p, crossed, V) {
    if (d >= 1) return;
    const B = this.handB;
    B.visible = this.drill.visible = true;
    B.rotation.set(-1.35, 0, 0);                               // pointing straight down
    const shake = Math.sin(p * 400) * 0.006;
    B.position.set(0.03 + shake, 0.38 - ease01(d) * 0.14, 0.02 + Math.cos(p * 330) * 0.006);
    this.bit.rotation.z = p * 600;
    const prev = span(this._prevP, 0, PLANT_TIMING.quick[0]);
    if (Math.floor(d * 20) !== Math.floor(prev * 20)) {
      const a = Math.random() * Math.PI * 2;
      this._specks(V(0.03, 0.03, 0), 3, { vel: [Math.cos(a) * 0.9, 1.1, Math.sin(a) * 0.9], spread: 0.3 });
    }
    for (const k of [0.02, 0.35, 0.68]) if (crossed(k * PLANT_TIMING.quick[0])) this._snd('drill', this.vol);
  }

  // scooping with a teacup
  _dig_teacup(d, p, crossed, V) {
    if (d >= 1) return;
    const B = this.handB;
    B.visible = this.cup.visible = true;
    this.tea.visible = false;
    const s = (d * 3) % 1;
    const start = V(0.08, 0.3, 0.2), down = V(0.02, 0.1, 0.02), dump = V(-0.32, 0.32, 0.1);
    if (s < 0.35) { B.position.lerpVectors(start, down, ease01(s / 0.35)); B.rotation.set(-0.6 * ease01(s / 0.35), 0, 0); }
    else if (s < 0.65) { B.position.lerpVectors(down, dump, ease01((s - 0.35) / 0.3)); B.rotation.set(-0.6 + ease01((s - 0.35) / 0.3) * 0.6, 0, 0); }
    else { B.position.lerpVectors(dump, start, ease01((s - 0.65) / 0.35)); B.rotation.set(0, 0, s < 0.8 ? 1.4 * Math.sin(span(s, 0.65, 0.8) * Math.PI) : 0); }
    this.cupDirt.visible = s > 0.3 && s < 0.72;
    for (const k of [0, 1, 2]) {
      if (crossed((k + 0.3) / 3 * PLANT_TIMING.quick[0])) Sound.dig(this.vol * 0.7);
      if (crossed((k + 0.7) / 3 * PLANT_TIMING.quick[0])) this._specks(V(-0.32, 0.3, 0.1), 5, { vel: [0, 0.4, 0], spread: 0.5 });
    }
  }

  // dainty one-finger flicks, with little pauses (is this how you do it?)
  _dig_perfume(d, p, crossed, V) {
    if (d >= 1) return;
    const A = this.hand;
    A.visible = true;
    const s = (d * 6) % 1;
    const flick = s > 0.6 && s < 0.78 ? Math.sin(span(s, 0.6, 0.78) * Math.PI) : 0;
    A.rotation.set(-0.9 + flick * 0.6, 0.2, 0);
    A.position.set(0.04 + Math.sin(d * 7) * 0.05, 0.14 + flick * 0.05 + (s < 0.6 ? Math.sin(p * 200) * 0.003 : 0), 0.02 + flick * 0.06);
    const prev = span(this._prevP, 0, PLANT_TIMING.quick[0]);
    if ((prev * 6) % 1 < 0.68 && s >= 0.68) {
      this._specks(this._at(A, V(0, 0, -0.14)), 2, { vel: [0.1, 0.9, 0.5], spread: 0.3 });
      this._snd('tap');
    }
  }

  // ======================= covering with tea =======================

  _pourTea(p, S, C, V) {
    const B = this.handB;
    const k = span(p, S, C), leave = span(p, C, C + 0.07);
    B.visible = this.cup.visible = this.tea.visible = true;
    this.cupDirt.visible = false;
    B.rotation.set(0, 0, -1.3 * ease01(span(k, 0, 0.2)) * (1 - ease01(span(k, 0.85, 1))));
    B.position.set(0.12, 0.3 + leave * 0.5, 0.06 + leave * 0.3);
    const pouring = k > 0.15 && k < 0.88;
    this.stream.visible = pouring;
    if (pouring) {
      const lip = this._at(B, V(-0.045, -0.04, -0.12));
      this.stream.position.copy(lip);
      this.stream.scale.y = Math.max(0.01, lip.y - 0.06);
      if (Math.floor(p * 60) !== Math.floor(this._lastPour || 0)) this._snd('pour', this.vol);
      this._lastPour = p * 60;
    }
  }

  // ======================= the funny bits at the end (f = 0..1) =======================

  // cleans the dirt out from under every single nail
  _finale_paws(f, crossed, V, p) {
    const A = this.hand, B = this.handB;
    A.visible = B.visible = true;
    A.rotation.set(0.75, 0, 0.15 + (f > 0.8 ? Math.sin(f * 60) * 0.2 * (1 - span(f, 0.8, 1)) : 0));
    A.position.lerpVectors(V(0, 0.3, 0.2), V(0.04, 0.42, 0.18), ease01(span(f, 0, 0.15)));
    // B's fingertip goes under A's nails, one after another
    const i = Math.min(3, Math.floor(span(f, 0.15, 0.75) * 4));
    const under = this._at(A, this._tip(i).add(V(0, -0.008, 0.004)));
    B.rotation.set(0.9, -0.9, 0);
    const scrape = Math.sin(f * 220) * 0.006;
    const target = f < 0.15 ? V(0.25, 0.3, 0.25).lerp(under, ease01(f / 0.15)) : f < 0.78 ? under.add(V(0, scrape, 0)) : under.add(V(0.2, -0.2, 0.1).multiplyScalar(ease01(span(f, 0.78, 0.9))));
    this._put(B, this._tip(1), target);
    B.visible = f < 0.9;
    if (f > 0.15 && f < 0.78 && Math.floor(f * 14) !== Math.floor((this._prevF ?? 0) * 14)) {
      this._snd('file');
      this._specks(under, 3, { vel: [0, -0.2, 0], spread: 0.25, size: 0.01 });
    }
    if (f > 0.17 && f < 0.75 && Math.floor(f * 30) !== Math.floor((this._prevF ?? 0) * 30)) this._specks(under, 1, { vel: [0, -0.1, 0], spread: 0.15, size: 0.008 });
    if (crossed(FINALE_AT + 0.82 * (1 - FINALE_AT))) {
      for (const n of [0, 1, 2, 3]) this._sparkle(this._at(A, this._tip(n)), 3);
      this._snd('ting');
    }
    this._prevF = f;
  }

  // finds the nail that flew off and clicks it back on
  _finale_claws(f, crossed, V, p) {
    const A = this.hand, B = this.handB;
    A.visible = B.visible = true;
    A.rotation.set(0.75, 0, 0.15);
    A.position.lerpVectors(V(0, 0.3, 0.2), V(0.02, 0.42, 0.18), ease01(span(f, 0.1, 0.35)));
    B.rotation.set(-0.4, -0.5, 0);
    const nailAt = this.nailPos || V(0.2, 0.01, 0.1);
    let tipTarget;
    if (f < 0.3) tipTarget = V(0.3, 0.3, 0.3).lerp(nailAt.clone().add(V(0, 0.01, 0)), ease01(f / 0.3));   // pick it up
    else if (f < 0.6) {                                                                                       // bring it over
      const slot = this._at(A, V(0.013, 0.016, -0.143));
      tipTarget = nailAt.clone().add(V(0, 0.01, 0)).lerp(slot, ease01(span(f, 0.3, 0.55)));
      B.rotation.set(0.3, -0.7, 0);
    } else tipTarget = this._at(A, V(0.013, 0.016, -0.143)).add(V(0.25, -0.25, 0.1).multiplyScalar(ease01(span(f, 0.65, 0.85))));
    this._put(B, this._tip(0), tipTarget);
    B.visible = f < 0.88;
    if (f > 0.3 && f < 0.6) { this.looseNail.position.copy(this._at(B, this._tip(0)).add(V(0, 0.008, 0))); this.nailRest = true; }
    if (crossed(FINALE_AT + 0.6 * (1 - FINALE_AT))) {                                                         // click!
      this.nailOff = false;
      A.userData.nails[1].visible = true;
      this._snd('tap');
      this._snd('ting');
      this._sparkle(this._at(A, V(0.013, 0.016, -0.143)), 8);
    }
    if (f > 0.65) A.rotation.z = 0.15 + Math.sin(f * 40) * 0.12;   // admire it
  }

  // wipes the card on her sleeve, then bling
  _finale_card(f, crossed, V, p) {
    const A = this.hand, B = this.handB;
    B.visible = this.card.visible = true;
    A.visible = f < 0.6;
    A.rotation.set(0, 1.3, 0);                                    // arm across in front
    A.position.set(0.02, 0.32, 0.12);
    const sleeve = this._at(A, V(0, 0.04, 0.22));
    const along = this._at(A, V(0, 0.04, 0.06)).sub(sleeve);
    B.rotation.set(-0.2, 0, 0);
    if (f < 0.55) {
      const w = Math.sin(span(f, 0.1, 0.55) * Math.PI * 4);
      const cardAt = sleeve.clone().addScaledVector(along, w).add(V(0, 0.07, 0));
      B.position.lerpVectors(V(0.3, 0.3, 0.2), cardAt, ease01(span(f, 0, 0.1)));
    } else {
      B.position.lerpVectors(sleeve.clone().add(V(0, 0.07, 0)), V(0.06, 0.42, 0.2), ease01(span(f, 0.55, 0.7)));
      this.card.rotation.y = Math.sin(span(f, 0.7, 1) * Math.PI * 2) * 0.6;
    }
    const prev = this._prevF ?? 0;
    if (f > 0.1 && f < 0.55 && Math.sign(Math.cos(span(f, 0.1, 0.55) * Math.PI * 4)) !== Math.sign(Math.cos(span(prev, 0.1, 0.55) * Math.PI * 4))) this._snd('file');
    if (crossed(FINALE_AT + 0.72 * (1 - FINALE_AT))) { this._sparkle(this._at(B, V(0, -0.07, -0.11)), 10); this._snd('ting'); }
    this._prevF = f;
  }

  // a little gunslinger twirl, then she points it at the sky like a boss
  _finale_drill(f, crossed, V, p) {
    const B = this.handB;
    B.visible = this.drill.visible = f < 0.95;
    B.position.lerpVectors(V(0.03, 0.26, 0.02), V(0.1, 0.48, 0.3), ease01(span(f, 0, 0.15)));
    B.position.y -= ease01(span(f, 0.85, 1)) * 0.4;
    B.rotation.set(-1.35 * (1 - ease01(span(f, 0, 0.15))), 0, 0);
    this.drill.rotation.x = -Math.PI * 4 * ease01(span(f, 0.15, 0.6)) + 1.3 * ease01(span(f, 0.62, 0.72));
    this.bit.rotation.z = p * 600 * (1 - span(f, 0, 0.2));
    if (crossed(FINALE_AT + 0.15 * (1 - FINALE_AT))) this._snd('swish');
    if (crossed(FINALE_AT + 0.72 * (1 - FINALE_AT))) {
      B.updateMatrixWorld(true);
      this._sparkle(this.group.worldToLocal(this.bit.localToWorld(V(0, 0, -0.13))), 8);
      this._snd('ting');
    }
  }

  // a little sip of the tea
  _finale_teacup(f, crossed, V, p) {
    const B = this.handB;
    B.visible = this.cup.visible = this.tea.visible = f < 0.95;
    this.cupDirt.visible = false;
    const up = ease01(span(f, 0.05, 0.35)), down = ease01(span(f, 0.75, 0.95));
    B.position.lerpVectors(V(0.1, 0.4, 0.15), V(0.02, 0.58, 0.32), up);
    B.position.y -= down * 0.5;
    B.rotation.set(0.9 * up * (1 - down), 0, 0);
    if (crossed(FINALE_AT + 0.42 * (1 - FINALE_AT))) this._snd('sip', this.vol);
    if (crossed(FINALE_AT + 0.7 * (1 - FINALE_AT))) this._snd('ting');
  }

  // spritz spritz on the sprout, and it wiggles
  _finale_perfume(f, crossed, V, p) {
    const B = this.handB;
    B.visible = this.perfume.visible = f < 0.95;
    B.rotation.set(0, -0.6, 0);
    const at = V(0.22, 0.32, 0.16);
    B.position.lerpVectors(V(0.4, 0.5, 0.4), at, ease01(span(f, 0, 0.2)));
    B.position.y -= ease01(span(f, 0.85, 1)) * 0.4;
    for (const k of [0.3, 0.45, 0.6]) if (crossed(FINALE_AT + k * (1 - FINALE_AT))) {
      const nz = this._at(B, this.nozzle);
      const to = V(0, 0.22, 0).sub(nz).multiplyScalar(2.2);
      this._specks(nz, 10, { vel: [to.x, to.y, to.z], spread: 0.35, colors: [0xff8fb1, 0xffffff, 0xffc4e1], size: 0.012, life: 0.5, grav: 0 });
      this._snd('spritz', this.vol);
    }
    if (f > 0.35) this.sprout.rotation.z = Math.sin(f * 50) * 0.25 * (1 - span(f, 0.75, 1));
    if (crossed(FINALE_AT + 0.75 * (1 - FINALE_AT))) { this._sparkle(V(0, 0.3, 0), 10); this._snd('ting'); }
  }
}
