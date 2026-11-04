// All the blasters, the shields, the shared gun logic (used by you and the bots),
// and the first-person viewmodel (what you see in your hands).
//
// Each weapon: slot ('main' or 'side'), price, plain-words description, shop bars,
// fire behaviour, damage per body part, spread (inaccuracy, radians), recoil, and looks.

const WEAPONS = {
  dandelion: {
    name: 'Dandelion', slot: 'side', price: 0,
    desc: 'Free little sidearm. One click = one shot.',
    bars: { power: 0.3, speed: 0.5, range: 0.45 },
    auto: false, fireRate: 6.5, magSize: 12, reserve: 48, reloadTime: 1.5, range: 150,
    damage: { head: 78, body: 26, legs: 22 },
    falloff: { start: 30, end: 50, min: 0.8 },
    spread: { base: 0.004, walk: 0.006, run: 0.025, air: 0.15, crouchMul: 0.85, perShot: 0.008, maxSpray: 0.04 },
    recoil: { kicks: [0, 0.012, 0.014], sustained: 0.014, side: 0.004, maxUp: 0.07, recover: 12 },
    look: { petal: 0xfff27a, petal2: 0xffffff, center: 0xffd36b, size: 0.7, jar: true, short: true },
  },
  tulip: {
    name: 'Tulip Popper', slot: 'main', price: 900,
    desc: 'Sprays super fast and stays accurate while running. Weaker far away.',
    bars: { power: 0.35, speed: 0.95, range: 0.3 },
    auto: true, fireRate: 13, magSize: 30, reserve: 90, reloadTime: 1.6, range: 150,
    damage: { head: 66, body: 26, legs: 22 },
    falloff: { start: 15, end: 30, min: 0.75 },
    spread: { base: 0.008, walk: 0.004, run: 0.012, air: 0.12, crouchMul: 0.9, perShot: 0.002, maxSpray: 0.03 },
    recoil: { kicks: [0, 0.004, 0.006, 0.007], sustained: 0.005, side: 0.006, maxUp: 0.07, recover: 10 },
    look: { petal: 0xff5d73, petal2: 0xff8c9a, center: 0xffd36b, size: 0.85, jar: true, cup: true },
  },
  sunflower: {
    name: 'Sunflower Splash', slot: 'main', price: 1800,
    desc: 'A huge splash of bubbles up close. Useless far away.',
    bars: { power: 1, speed: 0.2, range: 0.1 },
    auto: false, fireRate: 1.1, magSize: 5, reserve: 15, reloadTime: 2.2, range: 60,
    pellets: 12, pelletSpread: 0.075,
    damage: { head: 24, body: 12, legs: 10 },
    falloff: { start: 7, end: 18, min: 0.25 },
    spread: { base: 0, walk: 0.005, run: 0.01, air: 0.05, crouchMul: 1, perShot: 0, maxSpray: 0 },
    recoil: { kicks: [0.03], sustained: 0.03, side: 0, maxUp: 0.06, recover: 6 },
    look: { petal: 0xffd23f, petal2: 0xffc107, center: 0x6b4a2b, size: 1.2, jar: true },
  },
  rosebow: {
    name: 'Rose Bow', slot: 'main', price: 2200,
    desc: 'Hold click to pull, let go to shoot. Arrows fly in an arc!',
    bars: { power: 0.9, speed: 0.25, range: 0.9 },
    bow: true, auto: false, fireRate: 1.6, magSize: 1, reserve: 14, reloadTime: 0.5, range: 200,
    draw: { time: 0.85, minSpeed: 20, maxSpeed: 70, gravity: 14 },
    damage: { head: 200, body: 90, legs: 70 },          // at full pull; weaker when not fully pulled
    spread: { base: 0.001, walk: 0.01, run: 0.03, air: 0.08, crouchMul: 0.8, perShot: 0, maxSpray: 0 },
    recoil: { kicks: [0], sustained: 0, side: 0, maxUp: 0, recover: 10 },
  },
  bloom: {
    name: 'Bloom Blaster', slot: 'main', price: 2900,
    desc: 'Strong at any distance. The all-rounder.',
    bars: { power: 0.65, speed: 0.7, range: 0.85 },
    auto: true, fireRate: 9.75, magSize: 25, reserve: 75, reloadTime: 1.8, range: 200,
    damage: { head: 156, body: 39, legs: 33 },           // one head hit pops someone
    spread: { base: 0.002, walk: 0.012, run: 0.06, air: 0.22, crouchMul: 0.8, perShot: 0.004, maxSpray: 0.035 },
    recoil: { kicks: [0, 0.006, 0.010, 0.013, 0.015, 0.016, 0.016, 0.014], sustained: 0.008, side: 0.006, maxUp: 0.13, recover: 9 },
    look: { petal: 0xff8fb1, petal2: 0xffb3cc, center: 0xffd36b, size: 1, jar: true },
  },
  lily: {
    name: 'Lily Longshot', slot: 'main', price: 4500,
    desc: 'One body hit pops. Right-click to zoom in. Slow to shoot.',
    bars: { power: 1, speed: 0.1, range: 1 },
    auto: false, fireRate: 0.75, magSize: 5, reserve: 15, reloadTime: 2.6, range: 250,
    scope: { fov: 28, unscoped: 0.07 },
    damage: { head: 255, body: 150, legs: 120 },
    spread: { base: 0.0008, walk: 0.03, run: 0.09, air: 0.2, crouchMul: 0.8, perShot: 0, maxSpray: 0 },
    recoil: { kicks: [0.05], sustained: 0.05, side: 0, maxUp: 0.06, recover: 5 },
    look: { petal: 0xffffff, petal2: 0xeef0ff, center: 0xffd36b, size: 1, jar: true, long: true },
  },
};
// Everyone always carries one (key 3). Pops in one hit, but only up close.
WEAPONS.knife = {
  name: 'Frosting Knife', slot: 'knife', price: 0, melee: true,
  desc: 'A cake knife. One swipe pops someone, but only right up close.',
  reach: 2.2, auto: false, fireRate: 2, magSize: 1, reserve: 0, reloadTime: 0, range: 3,
  damage: { head: 999, body: 999, legs: 999 },
  spread: { base: 0, walk: 0, run: 0, air: 0, crouchMul: 1, perShot: 0, maxSpray: 0 },
  recoil: { kicks: [0], sustained: 0, side: 0, maxUp: 0, recover: 10 },
};

// fill in each weapon's key
for (const [k, d] of Object.entries(WEAPONS)) d.key = k;

const SHIELDS = {
  light: { key: 'light', name: 'Bubble Wrap', price: 400, amount: 25, desc: '+25 shield on top of your health.' },
  heavy: { key: 'heavy', name: 'Big Bubble', price: 1000, amount: 50, desc: '+50 shield on top of your health.' },
};
const SHOP_ORDER = ['tulip', 'sunflower', 'rosebow', 'bloom', 'lily'];

// ---------------------------------------------------------------------------
// Gun: ammo, fire rate, spread, recoil, refilling (and bow drawing). No visuals, no input.
class Gun {
  constructor(def) {
    this.def = def;
    this.reset();
  }

  reset() {
    this.ammo = this.def.magSize;
    this.reserve = this.def.reserve;
    this.cooldown = 0;
    this.reloading = 0;          // seconds left, 0 = not refilling
    this.sprayIndex = 0;
    this.sinceShot = 10;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.drawTime = 0;           // bow: how long the string has been pulled
  }

  get busy() { return this.reloading > 0; }
  get ready() { return this.cooldown <= 0 && !this.busy; }
  // bow: 0..1 how far the string is pulled
  get charge() { return this.def.bow ? Math.min(1, this.drawTime / this.def.draw.time) : 0; }

  // Returns true if a refill started.
  startReload() {
    if (this.reloading > 0 || this.ammo === this.def.magSize || this.reserve === 0) return false;
    this.reloading = this.def.reloadTime;
    this.drawTime = 0;
    return true;
  }

  // Inaccuracy (radians) based on how the shooter is moving.
  computeSpread(mover, scoped = false) {
    const s = this.def.spread;
    const v = mover.horizontalSpeed;
    let move = 0;
    if (!mover.onGround) move = s.air;
    else if (v > 0.5) {
      move = v <= PLAYER.walkSpeed + 0.2
        ? s.walk * (v / PLAYER.walkSpeed)
        : s.walk + (s.run - s.walk) * Math.min(1, (v - PLAYER.walkSpeed) / (PLAYER.runSpeed - PLAYER.walkSpeed));
    }
    const spray = Math.min(s.maxSpray, Math.max(0, this.sprayIndex - 1) * s.perShot);
    let total = s.base + move + spray;
    if (mover.crouch > 0.5 && mover.onGround) total *= s.crouchMul;
    if (this.def.scope && !scoped) total += this.def.scope.unscoped;
    return total;
  }

  // Damage multiplier for distance (some blasters get weaker far away).
  falloff(dist) {
    const f = this.def.falloff;
    if (!f || dist <= f.start) return 1;
    if (dist >= f.end) return f.min;
    return 1 - (1 - f.min) * (dist - f.start) / (f.end - f.start);
  }

  // Call once per frame.
  tick(dt) {
    const d = this.def;
    this.cooldown -= dt;
    this.sinceShot += dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.reloading = 0;
        const take = Math.min(d.magSize - this.ammo, this.reserve);
        this.ammo += take;
        this.reserve -= take;
      }
    }
    // recoil settles once you stop shooting
    if (this.sinceShot > 1 / d.fireRate + 0.05) {
      const k = Math.exp(-d.recoil.recover * dt);
      this.recoilPitch *= k;
      this.recoilYaw *= k;
      if (this.sinceShot > 0.35) this.sprayIndex = 0;
    }
  }

  // Fire looking along (yaw, pitch). Returns the shot directions (several for the Sunflower).
  fire(yaw, pitch, mover, scoped = false) {
    const d = this.def, r = d.recoil;
    this.ammo--;
    // keep leftover frame time while spraying so fire rate stays exact
    this.cooldown = Math.max(this.cooldown, -0.05) + 1 / d.fireRate;
    this.sinceShot = 0;
    this.drawTime = 0;

    const p = pitch + this.recoilPitch;
    const y = yaw + this.recoilYaw;
    const fwd = new THREE.Vector3(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
    const right = new THREE.Vector3(Math.cos(y), 0, -Math.sin(y));
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const jitter = (spread) => {
      const ang = Math.random() * Math.PI * 2;
      const rad = Math.sqrt(Math.random()) * spread;
      return fwd.clone()
        .addScaledVector(right, Math.cos(ang) * Math.tan(rad))
        .addScaledVector(up, Math.sin(ang) * Math.tan(rad))
        .normalize();
    };
    const spread = this.computeSpread(mover, scoped);
    const dirs = [];
    for (let i = 0; i < (d.pellets || 1); i++) dirs.push(jitter(spread + (d.pelletSpread || 0)));

    // recoil climbs for the first shots, then wobbles side to side
    const i = this.sprayIndex;
    const upKick = i < r.kicks.length ? r.kicks[i] : r.sustained;
    this.recoilPitch = Math.min(r.maxUp, this.recoilPitch + upKick);
    if (i >= 4) this.recoilYaw += (Math.random() - 0.5) * 2 * r.side;
    this.sprayIndex++;
    return dirs;
  }
}

// ---------------------------------------------------------------------------
// Viewmodel: what you hold. One model per weapon (built the first time it's needed).
// The round bubble jar on top of each blaster: a glass ball (radius r, bottom at y) a bit
// longer front-to-back. The soapy liquid inside is a ball cut off flat at the fill level.
const JAR = { r: 0.06, y: 0.04, stretch: 1.25 };
const _jarGeoCache = new Map();
function jarLiquidGeometry(frac) {
  const q = Math.round(Math.max(0, Math.min(1, frac)) * 24) / 24;
  if (_jarGeoCache.has(q)) return _jarGeoCache.get(q);
  const r = JAR.r - 0.005, cy = JAR.r, bottom = cy - r;
  const topY = bottom + Math.max(0.002, q * 2 * r);
  const pts = [new THREE.Vector2(0, bottom)];
  const n = 14;
  for (let i = 1; i <= n; i++) {
    const y = bottom + (topY - bottom) * (i / n);
    pts.push(new THREE.Vector2(Math.sqrt(Math.max(0, r * r - (y - cy) * (y - cy))), y));
  }
  pts.push(new THREE.Vector2(0, topY));                 // flat surface on top
  const geo = new THREE.LatheGeometry(pts, 24);
  _jarGeoCache.set(q, geo);
  return geo;
}
function setJarLevel(vm, frac) {
  const q = Math.round(Math.max(0, Math.min(1, frac)) * 24) / 24;
  if (q === vm.liquidLevel) return;
  vm.liquidLevel = q;
  vm.liquid.visible = q > 0;
  if (q > 0) vm.liquid.geometry = jarLiquidGeometry(q);
}

class Viewmodel {
  constructor(viewCamera) {
    this.camera = viewCamera;
    this.models = {};
    this.vm = null;
    this.gun = null;
    this.kick = 0;
    this.bobPhase = 0;
    this.flashTime = 0;
    this.swapT = 0;
    this._v = new THREE.Vector3();
  }

  get group() { return this.vm ? this.vm.group : null; }
  setVisible(v) { if (this.vm) this.vm.group.visible = v; }

  // Switch to showing this gun (with a little "bring it up" animation).
  setGun(gun) {
    if (gun === this.gun) return;
    const key = gun.def.key;
    if (!this.models[key]) {
      const d = gun.def;
      this.models[key] = d.bow ? this._buildBow() : d.melee ? this._buildKnife() : this._buildFlower(d.look);
      this.camera.add(this.models[key].group);
    }
    for (const m of Object.values(this.models)) m.group.visible = false;
    if (this.sassy) this.sassy.hide();
    this.vm = this.models[key];
    this.vm.group.visible = true;
    this.gun = gun;
    this.swapT = 0.35;
  }

  // How full the jar is, in %, on a little tag stuck to the front of the jar.
  // red under 25 · orange under 50 · green under 80 · purple 80 and up
  _jarLabel(vm, frac) {
    if (!vm.pctTag) {
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 64;
      const tex = new THREE.CanvasTexture(canvas);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = 4;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.05),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      mesh.position.set(0, JAR.y + JAR.r * 0.9, 0.03 + JAR.r * JAR.stretch + 0.004);
      mesh.renderOrder = 2;                              // after the glass
      vm.group.add(mesh);
      vm.pctTag = { canvas, tex, text: '' };
    }
    const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
    const color = pct < 25 ? '#ff5a5a' : pct < 50 ? '#ffa53d' : pct < 80 ? '#5ee08a' : '#c77dff';
    const text = `${pct}%`;
    if (text === vm.pctTag.text) return;
    vm.pctTag.text = text;
    const c = vm.pctTag.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = 'rgba(20, 24, 36, 0.72)';
    g.beginPath();
    if (g.roundRect) g.roundRect(4, 6, 120, 52, 26); else g.rect(4, 6, 120, 52);
    g.fill();
    g.font = 'bold 38px system-ui, -apple-system, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = color;
    g.fillText(text, 64, 34);
    vm.pctTag.tex.needsUpdate = true;
  }

  _box(parent, w, h, d, m, x, y, z) {
    const mesh = new THREE.Mesh(roundedBoxGeometry(w, h, d, Math.min(w, h, d) * 0.3, 3), m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  }

  // A blocky flower: stem body, leaves, a petal head that blows bubbles,
  // and a bubble jar on top whose level shows how many shots are left.
  _buildFlower(look) {
    const vm = {};
    const g = vm.group = new THREE.Group();
    const lam = (hex, seed) => new THREE.MeshLambertMaterial({ map: Textures.noisyTexture(hex, 18, 8, seed) });
    const stem = lam(0x4caf50, 11), stemDark = lam(0x2e7d32, 12), leaf = lam(0x7bd66b, 13);
    const petalA = lam(look.petal, 14), petalB = lam(look.petal2, 15), center = lam(look.center, 16);
    const add = (...a) => this._box(...a);
    const len = look.long ? 0.75 : look.short ? 0.32 : 0.5;
    add(g, 0.07, 0.07, len, stem, 0, 0, -(len - 0.5) / 2);         // stem body
    add(g, 0.055, 0.15, 0.065, stemDark, 0, -0.1, 0.13);            // grip
    if (!look.short) add(g, 0.06, 0.06, 0.12, stemDark, 0, -0.01, 0.3);   // back end
    const leftLeaf = add(g, 0.16, 0.012, 0.08, leaf, -0.1, 0.01, 0.02);
    leftLeaf.rotation.z = 0.45;
    const rightLeaf = add(g, 0.16, 0.012, 0.08, leaf, 0.1, 0.01, 0.06);
    rightLeaf.rotation.z = -0.45;

    // flower head (spins a little each shot)
    vm.head = new THREE.Group();
    vm.head.position.set(0, 0.01, 0.25 - len - 0.05);
    vm.head.scale.setScalar(look.size);
    g.add(vm.head);
    add(vm.head, 0.1, 0.1, 0.05, center, 0, 0, 0);
    const petals = look.size > 1.1 ? 12 : 8;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2;
      const p = add(vm.head, 0.065, 0.11, 0.02, i % 2 ? petalA : petalB, Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.01);
      p.rotation.z = a - Math.PI / 2;
      if (look.cup) p.rotation.x = 0.6;                              // tulip cup shape
    }
    vm.muzzleZ = vm.head.position.z - 0.04;

    // bubble jar: a round glass bulb with a cork + soapy liquid that drains as you shoot
    const glass = new THREE.MeshLambertMaterial({ color: 0xe0f7ff, transparent: true, opacity: 0.35, depthWrite: false });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(JAR.r, 24, 16), glass);
    bulb.position.set(0, JAR.y + JAR.r, 0.03);
    bulb.scale.z = JAR.stretch;
    bulb.renderOrder = 1;                              // glass drawn after the liquid inside it
    g.add(bulb);
    const top = JAR.y + JAR.r * 2;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.02, 16), glass);
    neck.position.set(0, top - 0.002, 0.03);
    neck.renderOrder = 1;
    g.add(neck);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.022, 0.02, 16), new THREE.MeshLambertMaterial({ color: 0xffb3cf, emissive: 0x2a0a14 }));
    cork.position.set(0, top + 0.014, 0.03);
    g.add(cork);
    vm.cork = cork;                                    // the "cork" refill pops it off and puts it back
    vm.corkHome = cork.position.clone();
    vm.liquid = new THREE.Mesh(jarLiquidGeometry(1), new THREE.MeshLambertMaterial({ color: 0x7fdcff, emissive: 0x1d4f66 }));
    vm.liquid.position.set(0, JAR.y, 0.03);
    vm.liquid.scale.z = JAR.stretch;
    vm.liquidLevel = 1;
    g.add(vm.liquid);

    // little bubble puff when shooting
    vm.flash = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x88aacc, transparent: true, opacity: 0.6 }));
    vm.flash.position.set(0, 0.01, vm.muzzleZ);
    vm.flash.visible = false;
    g.add(vm.flash);

    this._buildHand(vm);

    g.scale.setScalar(0.6);
    g.position.set(0.17, -0.16, -0.38);
    vm.restPos = g.position.clone();
    g.visible = false;
    return vm;
  }

  // Left hand (painted nails, sleeve, bracelet) holding a soap bottle, used for refilling.
  _buildHand(vm) {
    const lam = (hex, o = {}) => new THREE.MeshLambertMaterial({ color: hex, ...o });
    const skin = lam(0xf2c6a0), nail = lam(0xff3d8b, { emissive: 0x551030 });
    const sleeve = new THREE.MeshLambertMaterial({ map: Textures.noisyTexture(0xc9a7ff, 16, 8, 21) });
    const gold = lam(0xffd36b, { emissive: 0x403010 });
    const bottleMat = lam(0xfff1a6, { emissive: 0x2a2410 });
    const cap = lam(0xffffff);
    const add = (...a) => this._box(...a);

    // hand = the wrist point. The forearm hangs off it and stays put;
    // the grip (hand + bottle) turns around the wrist to pour.
    const hand = new THREE.Group();
    const grip = new THREE.Group();          // pivots at the wrist
    hand.add(grip);
    const held = new THREE.Group();          // bottle + hand, centred on the bottle
    held.position.set(0.047, 0.04, 0);
    grip.add(held);

    const BW = 0.05;
    add(held, BW, 0.085, BW, bottleMat, 0, 0, 0);
    add(held, 0.022, 0.02, 0.022, cap, 0, 0.052, 0);
    vm.spout = add(held, 0.012, 0.016, 0.012, cap, 0, 0.07, 0);
    add(held, 0.022, 0.075, 0.06, skin, -BW / 2 - 0.011, -0.004, 0);   // palm
    for (let i = 0; i < 4; i++) {                                       // fingers + painted nails
      const y = 0.026 - i * 0.017;
      const len = i === 3 ? 0.04 : 0.05;
      add(held, len, 0.014, 0.014, skin, -BW / 2 + len / 2 - 0.006, y, BW / 2 + 0.007);
      add(held, 0.009, 0.012, 0.004, nail, -BW / 2 + len - 0.01, y, BW / 2 + 0.0155);
    }
    add(held, 0.04, 0.016, 0.016, skin, -0.008, 0.02, -BW / 2 - 0.008);   // thumb

    const arm = new THREE.Group();                                      // wrist, bracelet, sleeve
    arm.rotation.set(-0.75, 0, -0.3);
    hand.add(arm);
    add(arm, 0.045, 0.06, 0.045, skin, 0, -0.025, 0);
    add(arm, 0.05, 0.012, 0.05, gold, 0, -0.05, 0);
    add(arm, 0.06, 0.3, 0.06, sleeve, 0, -0.2, 0);

    hand.scale.setScalar(0.68);                       // the left hand is a bit smaller than the right
    hand.visible = false;
    vm.group.add(hand);
    vm.hand = hand;
    vm.grip = grip;

    const streamGeo = new THREE.BoxGeometry(0.012, 1, 0.012);
    streamGeo.translate(0, -0.5, 0); // hangs down from its top
    vm.stream = new THREE.Mesh(streamGeo, lam(0x7fdcff, { emissive: 0x1d4f66, transparent: true, opacity: 0.8 }));
    vm.stream.visible = false;
    vm.group.add(vm.stream);

    vm.handPour = new THREE.Vector3(-0.088, 0.27, 0.03);
    vm.handAway = new THREE.Vector3(-0.55, -0.35, 0.3);
    vm.pourTilt = -1.7;
    vm.jarTopY = JAR.y + JAR.r * 2 + 0.024;   // top of the cork
  }

  // Frosting knife: pink handle, silver blade, a dollop of pink frosting with sprinkles.
  _buildKnife() {
    const vm = { knife: true };
    const g = vm.group = new THREE.Group();
    const lam = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
    const add = (...a) => this._box(...a);
    add(g, 0.05, 0.05, 0.2, lam(0xff8fb1), 0, 0, 0.08);                 // handle
    add(g, 0.09, 0.03, 0.025, lam(0xffd36b, 0x332200), 0, 0, -0.03);    // guard
    add(g, 0.012, 0.07, 0.3, lam(0xe8eef4, 0x222a33), 0, 0.012, -0.19); // blade
    add(g, 0.012, 0.04, 0.06, lam(0xe8eef4, 0x222a33), 0, 0.002, -0.36);
    add(g, 0.03, 0.05, 0.1, lam(0xffc1d9, 0x331520), 0, 0.03, -0.26);   // frosting
    const sprinkle = [0x7fdcff, 0xffd36b, 0xa8e6a1, 0xc9a7ff];
    for (let i = 0; i < 6; i++)
      add(g, 0.032, 0.008, 0.008, lam(sprinkle[i % 4]), 0, 0.055 + (i % 2) * 0.01, -0.22 - i * 0.015);
    g.scale.setScalar(0.85);
    g.position.set(0.2, -0.17, -0.38);
    g.rotation.set(0.25, 0.25, 0.4);
    vm.restPos = g.position.clone();
    g.visible = false;
    return vm;
  }

  // The seed, held in your hand (slot 4).
  holdSeed(on) {
    if (!this.seedModel) {
      this.seedModel = makeSeedPod();
      this.seedModel.scale.setScalar(0.45);
      this.seedModel.position.set(0.2, -0.18, -0.42);
      this.camera.add(this.seedModel);
    }
    this.seedModel.visible = on;
    if (on && this.vm) this.vm.group.visible = false;
  }

  // Rose bow: green limbs with thorns, pink roses at the tips, a string that
  // pulls back as you draw, and an arrow with a rosebud tip.
  _buildBow() {
    const vm = { bow: true };
    const g = vm.group = new THREE.Group();
    const lam = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
    const limb = lam(0x3f9a3a), thorn = lam(0x2e6b2a), rose = lam(0xff5d8f, 0x330815), leaf = lam(0x7bd66b);
    const add = (...a) => this._box(...a);
    // limbs: an arc in the x/y plane bulging forward (-z)
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 4 - 1;                          // -1..1
      pts.push(new THREE.Vector3(0, t * 0.34, -0.13 * (1 - t * t)));
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const seg = add(g, 0.035, a.distanceTo(b) + 0.01, 0.035, limb, mid.x, mid.y, mid.z);
      seg.rotation.x = Math.atan2(b.z - a.z, b.y - a.y);   // tilt the box's length along the arc
      if (i % 2 === 1) add(g, 0.012, 0.012, 0.03, thorn, mid.x + 0.02, mid.y, mid.z - 0.01);
    }
    add(g, 0.05, 0.1, 0.05, lam(0x6b4a2b), 0, 0, -0.13);              // grip
    for (const s of [-1, 1]) {                                        // roses at both tips
      add(g, 0.07, 0.07, 0.07, rose, 0, s * 0.35, 0);
      add(g, 0.05, 0.02, 0.03, leaf, 0.03, s * 0.31, 0);
    }
    vm.tipTop = new THREE.Vector3(0, 0.35, 0);
    vm.tipBot = new THREE.Vector3(0, -0.35, 0);
    // string: two thin boxes from the tips to the nock point
    const strMat = lam(0xffffff);
    vm.strA = add(g, 0.006, 1, 0.006, strMat, 0, 0, 0);
    vm.strB = add(g, 0.006, 1, 0.006, strMat, 0, 0, 0);
    // arrow (points forward, -z)
    vm.arrow = new THREE.Group();
    g.add(vm.arrow);
    add(vm.arrow, 0.018, 0.018, 0.62, lam(0x7bd66b), 0, 0, -0.31);
    add(vm.arrow, 0.05, 0.05, 0.07, rose, 0, 0, -0.64);
    add(vm.arrow, 0.04, 0.005, 0.06, leaf, 0, 0, -0.03);
    add(vm.arrow, 0.005, 0.04, 0.06, leaf, 0, 0, -0.03);

    g.scale.setScalar(0.48);
    g.position.set(0.19, -0.15, -0.46);
    g.rotation.set(0, 0.18, 0.25);      // angled in a little so you can see the arrow
    vm.restPos = g.position.clone();
    g.visible = false;
    return vm;
  }

  // Refill choreography, p = 0..1 through the refill:
  //   hand comes in → tips the bottle → pours → tips back → leaves
  static reloadPhases(p) {
    const ease = t => t * t * (3 - 2 * t);
    const clamp01 = t => Math.max(0, Math.min(1, t));
    const inT = ease(clamp01(p / 0.2));
    const outT = ease(clamp01((p - 0.88) / 0.12));
    const tilt = ease(clamp01((p - 0.2) / 0.12)) - ease(clamp01((p - 0.78) / 0.1));
    const fill = clamp01((p - 0.32) / 0.46);
    const pouring = p > 0.3 && p < 0.8;
    return { reach: inT - outT, tilt, fill, pouring };
  }

  // Hold a grenade instead of a blaster (kind = null to go back to the blaster).
  holdNade(kind) {
    if (!this.nadeModels) this.nadeModels = {};
    if (kind && !this.nadeModels[kind]) {
      const m = makeNadeMesh(kind);
      m.scale.setScalar(0.42);
      this.camera.add(m);
      this.nadeModels[kind] = m;
    }
    for (const [k, m] of Object.entries(this.nadeModels)) m.visible = k === kind;
    if (this.vm) this.vm.group.visible = !kind;
    if (kind !== this.nadeKind) { this.nadeKind = kind; this.swapT = 0.3; }
  }

  // grenade in hand: bob along, wind up after a throw
  updateNade(dt, mover) {
    const m = this.nadeModels && this.nadeModels[this.nadeKind];
    if (!m) return;
    this.kick = Math.max(0, this.kick - dt * 4);
    this.swapT = Math.max(0, this.swapT - dt);
    const speed = mover.onGround ? mover.horizontalSpeed : 0;
    this.bobPhase += dt * speed * 1.6;
    const bob = Math.sin(this.bobPhase) * 0.01 * Math.min(1, speed / PLAYER.runSpeed);
    m.position.set(0.2 + bob, -0.17 - this.swapT * 0.5 - this.kick * 0.3, -0.45);
    m.rotation.y += dt * 1.2;
  }

  onFire() {
    if (this.gun && this.gun.def.melee) { this.swingT = 0.32; return; }
    this.kick = this.gun && this.gun.def.pellets ? 2 : 1;
    this.flashTime = 0.06;
    if (this.vm && this.vm.head) this.vm.head.rotation.z += 0.35;
  }

  update(dt, mover, scoped) {
    const vm = this.vm, gun = this.gun;
    if (!vm) return;
    const g = vm.group;
    g.visible = !scoped;
    this.kick = Math.max(0, this.kick - dt * 12);
    this.flashTime -= dt;
    this.swapT = Math.max(0, this.swapT - dt);

    const speed = mover.onGround ? mover.horizontalSpeed : 0;
    this.bobPhase += dt * speed * 1.6;
    const bobAmt = Math.min(1, speed / PLAYER.runSpeed);
    const bx = Math.sin(this.bobPhase) * 0.012 * bobAmt;
    const by = -Math.abs(Math.cos(this.bobPhase)) * 0.012 * bobAmt - this.swapT * 0.5;

    if (vm.bow) return this._updateBow(vm, gun, bx, by);
    if (vm.knife) {
      // swipe from right to left
      this.swingT = Math.max(0, (this.swingT || 0) - dt);
      const s = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.32) * Math.PI) : 0;
      g.position.set(vm.restPos.x + bx - s * 0.18, vm.restPos.y + by + s * 0.05, vm.restPos.z - s * 0.08);
      g.rotation.set(0.25 - s * 0.3, 0.25 + s * 0.9, 0.4 - s * 0.9);
      return;
    }

    vm.flash.visible = this.flashTime > 0;
    vm.flash.scale.setScalar(1 + (0.06 - this.flashTime) * 12);
    const reloading = gun.reloading > 0;
    const t = reloading ? 1 - gun.reloading / gun.def.reloadTime : 0;
    // every refill picks a random little show (the classic pour, or one of the sassy ones)
    if (reloading && !this._wasReloading) {
      this.reloadStyle = pickRefillStyle(this.reloadStyle);
    }
    this._wasReloading = reloading;
    const sassy = reloading && this.reloadStyle !== 'pour';
    if (!this.sassy) this.sassy = new SassyHand(this.camera);
    const ph = Viewmodel.reloadPhases(reloading && !sassy ? t : 0);

    // jar level = ammo; it rises while the bottle pours (or when the sassy hand says so)
    let level = gun.ammo;
    if (reloading) {
      const target = gun.ammo + Math.min(gun.def.magSize - gun.ammo, gun.reserve);
      level += (target - gun.ammo) * (sassy ? this.sassy.fill(this.reloadStyle, t) : ph.fill);
    }
    this.jarFrac = level / gun.def.magSize;
    setJarLevel(vm, this.jarFrac);
    this._jarLabel(vm, this.jarFrac);

    // refilling: the blaster dips and tilts a little towards the hand to present the jar
    const lean = reloading ? (sassy ? 0.35 * Math.sin(t * Math.PI) : ph.reach) : 0;
    g.position.set(vm.restPos.x + bx - lean * 0.02, vm.restPos.y + by - lean * 0.04, vm.restPos.z + this.kick * 0.05);
    g.rotation.set(this.kick * 0.06 + lean * 0.12, 0, lean * 0.22);
    if (sassy) {
      g.rotation.z += this.sassy.wobble;                // she bumped the jar
      g.rotation.x += this.sassy.wobble * 0.4;
      this.sassy.play(this.reloadStyle, t, dt, vm);
    } else this.sassy.hide();

    vm.hand.visible = reloading && ph.reach > 0.001;
    vm.stream.visible = false;
    if (vm.hand.visible) {
      vm.hand.position.lerpVectors(vm.handAway, vm.handPour, ph.reach);
      vm.grip.rotation.z = vm.pourTilt * ph.tilt;
      if (ph.pouring) {
        g.updateMatrixWorld(true);
        const s = vm.spout.getWorldPosition(this._v);
        g.worldToLocal(s);
        const len = s.y - vm.jarTopY;
        if (len > 0.005) {
          vm.stream.visible = true;
          vm.stream.position.copy(s);
          vm.stream.scale.y = len;
        }
      }
    }
  }

  _updateBow(vm, gun, bx, by) {
    const g = vm.group;
    const pull = gun.charge;                                    // 0..1
    const nockZ = 0.02 + pull * 0.26;
    g.position.set(vm.restPos.x + bx, vm.restPos.y + by, vm.restPos.z + pull * 0.04);
    // string from each tip to the nock point
    const nock = new THREE.Vector3(0, 0, nockZ);
    for (const [s, tip] of [[vm.strA, vm.tipTop], [vm.strB, vm.tipBot]]) {
      const mid = tip.clone().add(nock).multiplyScalar(0.5);
      s.position.copy(mid);
      s.scale.y = tip.distanceTo(nock);
      s.rotation.x = Math.atan2(nock.z - tip.z, nock.y - tip.y);
    }
    // arrow sits on the string; hidden while nocking the next one
    const nocking = gun.reloading > 0;
    vm.arrow.visible = gun.ammo > 0 && !nocking;
    vm.arrow.position.z = nockZ;
  }
}
