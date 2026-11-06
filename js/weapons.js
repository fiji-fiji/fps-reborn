// All the blasters, the shields, the shared gun logic (used by you and the bots),
// and the first-person viewmodel (what you see in your hands).
//
// Each weapon: slot ('main' or 'side'), price, plain-words description, shop bars,
// fire behaviour, damage per body part, spread (inaccuracy, radians), recoil, and looks.
// silenced: only heard close by (and quietly), and it doesn't show you on the enemy's minimap.

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
  // --- sidearms (slot 2): the free Dandelion, or buy a better one ---
  buzzy: {
    name: 'Buzzy-11', slot: 'side', price: 400,
    desc: 'A buzzing little sprayer. Great up close, falls apart far away.',
    bars: { power: 0.25, speed: 1, range: 0.15 },
    auto: true, fireRate: 14, magSize: 20, reserve: 60, reloadTime: 1.9, range: 120,
    damage: { head: 52, body: 18, legs: 15 },
    falloff: { start: 10, end: 25, min: 0.6 },
    spread: { base: 0.012, walk: 0.006, run: 0.02, air: 0.12, crouchMul: 0.9, perShot: 0.003, maxSpray: 0.045 },
    recoil: { kicks: [0, 0.004, 0.005, 0.006], sustained: 0.005, side: 0.008, maxUp: 0.06, recover: 10 },
    look: { petal: 0xffd23f, petal2: 0x3a3a4a, center: 0x3a3a4a, size: 0.7, jar: true, short: true, stripes: true },
  },
  hushdaisy: {
    name: 'Hush Daisy', slot: 'side', price: 500,
    desc: 'A quiet Dandelion upgrade: harder hits, steadier aim, and enemies barely hear it.',
    bars: { power: 0.4, speed: 0.5, range: 0.55 },
    silenced: true,
    auto: false, fireRate: 6, magSize: 13, reserve: 52, reloadTime: 1.6, range: 150,
    damage: { head: 104, body: 30, legs: 25 },
    falloff: { start: 35, end: 60, min: 0.85 },
    spread: { base: 0.003, walk: 0.005, run: 0.022, air: 0.15, crouchMul: 0.85, perShot: 0.006, maxSpray: 0.035 },
    recoil: { kicks: [0, 0.01, 0.012], sustained: 0.012, side: 0.003, maxUp: 0.06, recover: 13 },
    look: { petal: 0xffffff, petal2: 0xf4f4ff, center: 0xffd23f, size: 0.7, jar: true, short: true, hush: true },
  },
  cactus: {
    name: 'Cactus Revolver', slot: 'side', price: 800,
    desc: 'Six heavy shots. One head hit pops anyone. Stand still to aim it.',
    bars: { power: 0.9, speed: 0.2, range: 0.6 },
    auto: false, fireRate: 2.2, magSize: 6, reserve: 30, reloadTime: 2.3, range: 160,
    damage: { head: 180, body: 55, legs: 45 },
    falloff: { start: 30, end: 55, min: 0.8 },
    spread: { base: 0.003, walk: 0.03, run: 0.07, air: 0.2, crouchMul: 0.8, perShot: 0.02, maxSpray: 0.05 },
    recoil: { kicks: [0.05], sustained: 0.05, side: 0.01, maxUp: 0.08, recover: 7 },
    look: { petal: 0xff5d8f, petal2: 0xff9ec0, center: 0xffd36b, size: 0.6, jar: true, short: true, cactus: true },
  },
  pansy: {
    name: 'Pansy Pump', slot: 'side', price: 250,
    desc: 'A cheap little splasher. Fine right up close, useless any further.',
    bars: { power: 0.6, speed: 0.3, range: 0.05 },
    auto: false, fireRate: 1.4, magSize: 4, reserve: 20, reloadTime: 2, range: 40,
    pellets: 7, pelletSpread: 0.09,
    damage: { head: 18, body: 10, legs: 8 },
    falloff: { start: 5, end: 12, min: 0.2 },
    spread: { base: 0, walk: 0.005, run: 0.01, air: 0.05, crouchMul: 1, perShot: 0, maxSpray: 0 },
    recoil: { kicks: [0.025], sustained: 0.025, side: 0, maxUp: 0.05, recover: 7 },
    look: { petal: 0x8a4fd8, petal2: 0xffd23f, center: 0x3a2050, size: 0.9, jar: true, short: true, twin: true },
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
  bluebell: {
    name: 'Bluebell Scout', slot: 'main', price: 950,
    desc: 'A light sniper. One head hit pops, a body hit doesn\'t. Right-click to zoom.',
    bars: { power: 0.7, speed: 0.3, range: 1 },
    auto: false, fireRate: 1.1, magSize: 8, reserve: 24, reloadTime: 2.2, range: 250,
    scope: { fov: 32, unscoped: 0.04 },
    damage: { head: 220, body: 80, legs: 65 },
    spread: { base: 0.0008, walk: 0.02, run: 0.05, air: 0.15, crouchMul: 0.8, perShot: 0, maxSpray: 0 },
    recoil: { kicks: [0.035], sustained: 0.035, side: 0, maxUp: 0.05, recover: 7 },
    look: { petal: 0x5b8cff, petal2: 0x8fb0ff, center: 0xeef0ff, size: 0.8, jar: true, long: true, bell: true },
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
  hushbloom: {
    name: 'Hush Bloom', slot: 'main', price: 2900,
    desc: 'Quieter and faster than the Bloom, less kick. But one head hit doesn\'t pop.',
    bars: { power: 0.55, speed: 0.8, range: 0.8 },
    silenced: true,
    auto: true, fireRate: 11.5, magSize: 20, reserve: 60, reloadTime: 1.7, range: 200,
    damage: { head: 92, body: 33, legs: 28 },            // two head hits (or one + a body hit) to pop
    spread: { base: 0.002, walk: 0.011, run: 0.055, air: 0.22, crouchMul: 0.8, perShot: 0.003, maxSpray: 0.028 },
    recoil: { kicks: [0, 0.005, 0.008, 0.01, 0.011, 0.012, 0.012, 0.011], sustained: 0.006, side: 0.005, maxUp: 0.1, recover: 10 },
    look: { petal: 0xc9a7ff, petal2: 0xe2d1ff, center: 0xffd36b, size: 0.9, jar: true, hush: true },
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
// holding the knife makes you move this much faster
const KNIFE_SPEED = 1.5;

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
const SIDE_ORDER = ['dandelion', 'pansy', 'buzzy', 'hushdaisy', 'cactus'];   // sidearms (shop: left column)
const SHOP_ORDER = ['tulip', 'sunflower', 'bloom', 'hushbloom'];             // main blasters (middle column)
const SNIPER_ORDER = ['bluebell', 'lily'];                                    // snipers, also slot 1 (right column)

// ---------------------------------------------------------------------------
// Gun: ammo, fire rate, spread, recoil, refilling. No visuals, no input.
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
  }

  get busy() { return this.reloading > 0; }
  get ready() { return this.cooldown <= 0 && !this.busy; }

  // Returns true if a refill started.
  startReload() {
    if (this.reloading > 0 || this.ammo === this.def.magSize || this.reserve === 0) return false;
    this.reloading = this.def.reloadTime;
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
// The bubble reservoir on top of each blaster: a piece of lab glassware, different for
// every blaster, with blue water inside that drains as you shoot.
//   pts    = the outside of the glass, [radius, height] from the bottom up (it's turned on a lathe)
//   fill   = how high the liquid goes when full; mid/bodyR = the middle of the glass (refill shows aim there)
//   stopper: 'cork' (a cork in the neck) or 'lid' (a little glass lid on a beaker); marks = measuring lines
const WATER = { color: 0x7fdcff, glow: 0x1d4f66 };   // the blue water in every glass
const JAR = { y: 0.04, z: 0.03 };      // where the glass stands on the stem
function _ballBottom(r, n = 8, cy = r) {             // a round bottom: a half ball of radius r
  const out = [];
  for (let i = 0; i <= n; i++) { const a = -Math.PI / 2 + (i / n) * (Math.PI / 2); out.push([Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return out;
}
const VESSELS = {
  // test tube, held in a little clamp
  dandelion: { pts: [..._ballBottom(0.022), [0.022, 0.12], [0.026, 0.125]], fill: 0.1, mid: 0.06, bodyR: 0.024,
    stopper: 'cork', neckR: 0.022, clamp: true },
  // Erlenmeyer flask: a wide flat bottom, a cone up to a narrow neck
  tulip: { pts: [[0, 0], [0.058, 0], [0.062, 0.008], [0.044, 0.05], [0.026, 0.085], [0.018, 0.1], [0.018, 0.13], [0.022, 0.134]],
    fill: 0.07, mid: 0.035, bodyR: 0.05, stopper: 'cork', neckR: 0.018 },
  // round-bottom flask: a big glass ball and a long neck
  sunflower: { pts: (() => { const r = 0.066, out = [];
      for (let i = 0; i <= 14; i++) { const a = -Math.PI / 2 + (i / 14) * (Math.PI * 0.87); out.push([Math.cos(a) * r, r + Math.sin(a) * r]); }
      out.push([0.019, 0.15], [0.019, 0.178], [0.023, 0.182]); return out; })(),
    fill: 0.1, mid: 0.066, bodyR: 0.066, stopper: 'cork', neckR: 0.019 },
  // beaker with a pouring spout, measuring lines, a glass lid
  bloom: { pts: [[0, 0], [0.054, 0], [0.058, 0.006], [0.058, 0.108], [0.062, 0.112]], fill: 0.095, mid: 0.055, bodyR: 0.058,
    stopper: 'lid', neckR: 0.062, marks: [0.03, 0.05, 0.07, 0.09], spout: true },
  // tall graduated cylinder on a wide foot, measuring lines
  lily: { pts: [[0, 0.012], [0.03, 0.012], [0.03, 0.2], [0.035, 0.205]], fill: 0.185, mid: 0.1, bodyR: 0.03,
    stopper: 'cork', neckR: 0.03, marks: [0.05, 0.08, 0.11, 0.14, 0.17], foot: true },
  // volumetric flask: a flat round bulb and a long thin neck with one ring mark
  buzzy: { pts: [[0, 0], [0.03, 0], [0.04, 0.012], [0.044, 0.03], [0.04, 0.048], [0.026, 0.062], [0.012, 0.07], [0.012, 0.15], [0.015, 0.153]],
    fill: 0.065, mid: 0.032, bodyR: 0.044, stopper: 'cork', neckR: 0.012, marks: [0.11] },
  // a little vial with a shoulder
  hushdaisy: { pts: [[0, 0], [0.02, 0], [0.022, 0.004], [0.022, 0.075], [0.017, 0.083], [0.014, 0.086], [0.014, 0.095], [0.016, 0.097]],
    fill: 0.07, mid: 0.04, bodyR: 0.022, stopper: 'cork', neckR: 0.014 },
  // separatory funnel: a pear, pointed at the bottom, with a drip tube
  cactus: { pts: [[0.003, 0], [0.004, 0.012], [0.02, 0.04], [0.034, 0.065], [0.04, 0.085], [0.036, 0.1], [0.016, 0.112], [0.013, 0.12], [0.013, 0.13], [0.016, 0.132]],
    fill: 0.1, mid: 0.075, bodyR: 0.04, stopper: 'cork', neckR: 0.013 },
  // petri dish: wide and flat, with a glass lid
  pansy: { pts: [[0, 0], [0.055, 0], [0.056, 0.002], [0.056, 0.016], [0.058, 0.018]], fill: 0.013, mid: 0.008, bodyR: 0.056,
    stopper: 'lid', neckR: 0.058 },
  // burette: a tall thin tube with a little tap at the bottom, lots of measuring lines
  bluebell: { pts: [[0.004, 0], [0.004, 0.012], [0.009, 0.02], [0.014, 0.03], [0.014, 0.2], [0.017, 0.204]], fill: 0.19, mid: 0.1, bodyR: 0.014,
    stopper: 'cork', neckR: 0.014, marks: [0.06, 0.09, 0.12, 0.15, 0.18], tap: true },
  // Florence flask: a glass ball on a flat bottom, a short neck
  hushbloom: { pts: (() => { const r = 0.055, out = [[0, 0], [r * Math.cos(-Math.PI / 3), 0]];
      for (let i = 1; i <= 10; i++) { const a = -Math.PI / 3 + (i / 10) * (Math.PI / 3 + 1.13); out.push([Math.cos(a) * r, r * (1 + Math.sin(a)) - 0.0074]); }
      out.push([0.02, 0.1], [0.02, 0.13], [0.024, 0.133]); return out; })(),
    fill: 0.08, mid: 0.05, bodyR: 0.055, stopper: 'cork', neckR: 0.02 },
};
VESSELS.default = VESSELS.sunflower;

// radius of the glass at height y (straight lines between the profile points)
function vesselRadius(v, y) {
  const p = v.pts;
  if (y <= p[0][1]) return p[0][0];
  for (let i = 1; i < p.length; i++) {
    if (y <= p[i][1]) { const a = p[i - 1], b = p[i], k = (y - a[1]) / Math.max(1e-6, b[1] - a[1]); return a[0] + (b[0] - a[0]) * k; }
  }
  return p[p.length - 1][0];
}
// the liquid inside: the inside of the glass, cut off flat at the fill level
function vesselLiquidGeometry(v, frac) {
  const q = Math.round(Math.max(0, Math.min(1, frac)) * 24) / 24;
  v._geo = v._geo || new Map();
  if (v._geo.has(q)) return v._geo.get(q);
  const bottom = v.pts[0][1] + 0.004, topY = bottom + Math.max(0.002, q * (v.fill - bottom));
  const pts = [new THREE.Vector2(0, bottom)];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const y = bottom + (topY - bottom) * (i / n);
    pts.push(new THREE.Vector2(Math.max(0.001, vesselRadius(v, y) - 0.005), y));
  }
  pts.push(new THREE.Vector2(0, topY));                 // flat surface on top
  const geo = new THREE.LatheGeometry(pts, 24);
  v._geo.set(q, geo);
  return geo;
}
function setJarLevel(vm, frac) {
  const q = Math.round(Math.max(0, Math.min(1, frac)) * 24) / 24;
  if (q === vm.liquidLevel) return;
  vm.liquidLevel = q;
  vm.liquid.visible = q > 0;
  if (q > 0) vm.liquid.geometry = vesselLiquidGeometry(vm.vessel, q);
}

const INSPECT_TIME = 2.4;   // seconds the [Y] inspect takes

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
      this.models[key] = d.melee ? this._buildKnife() : this._buildFlower(d.look, key);
      this._addPaws(this.models[key]);
      this.camera.add(this.models[key].group);
    }
    for (const m of Object.values(this.models)) m.group.visible = false;
    if (this.sassy) this.sassy.hide();
    this.vm = this.models[key];
    this.vm.group.visible = true;
    this.gun = gun;
    this.swapT = 0.35;
    this.inspectT = 0;
  }

  // [Y]: take a good look at what you're holding (turn it over, show both sides).
  inspect() {
    if (!this.vm || (this.gun && this.gun.reloading > 0)) return;
    this.inspectT = INSPECT_TIME;
  }

  // the inspect show, on top of the normal pose. p = 0..1 through it.
  _applyInspect(g, dt) {
    if (!(this.inspectT > 0)) return;
    this.inspectT -= dt;
    const p = 1 - Math.max(0, this.inspectT) / INSPECT_TIME;
    const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    const w = ease(p / 0.16) - ease((p - 0.84) / 0.16);          // bring it in / put it back
    const flip = ease((p - 0.42) / 0.28);                          // from the left side over to the right side
    if (this.vm.knife) {
      g.position.x -= w * 0.12; g.position.y += w * 0.05;
      g.rotation.y += w * (-0.6 + flip * 1.2);
      g.rotation.z += ease((p - 0.25) / 0.3) * Math.PI * 2;       // a little twirl
      return;
    }
    g.position.x -= w * 0.13;
    g.position.y += w * 0.05;
    g.position.z += w * 0.06;
    g.rotation.x += w * (0.25 + Math.sin(p * Math.PI * 2) * 0.08);
    g.rotation.y += w * (-0.95 + flip * 1.7);
    g.rotation.z += w * (0.35 - flip * 0.6);
  }

  // Hands holding the item. `y` = where the back of the paw faces, `z` = where the
  // forearm goes (both in the item's own space); the toes curl around the grip.
  _orientPaw(paw, y, z, scale, mirror = false) {
    const Y = new THREE.Vector3(...y).normalize(), Z = new THREE.Vector3(...z).normalize();
    const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
    Z.crossVectors(X, Y).normalize();
    paw.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    paw.scale.set(mirror ? -scale : scale, scale, scale);
  }

  _addPaws(vm) {
    const g = vm.group;
    if (vm.knife) {                                     // fist round the handle
      const p = makePaw();
      this._orientPaw(p, [1, 0, 0], [0.2, -1, 0.5], 0.75);
      p.position.set(0.058, -0.015, 0.02);
      p.curl(1.45);
      g.add(p);
      vm.paw = p;
    } else {                                             // right paw round the flower's grip
      const p = makePaw();
      this._orientPaw(p, [1, 0.25, 0], [0.45, -0.75, 1], 1.0);
      p.position.set(0.06, -0.13, 0.2);
      p.curl(1.35);
      g.add(p);
      vm.paw = p;
      // the other paw supports the stem from underneath (it leaves to do the refill shows)
      const s = makePaw();
      this._orientPaw(s, [-0.55, -1, 0], [-0.5, -0.55, 1], 0.95, true);
      s.position.set(-0.05, -0.075, -0.02);
      s.curl(1.1);
      g.add(s);
      vm.supportPaw = s;
    }
  }

  // a paw under the seed / grenade you're holding (palm up)
  _holdPaw() {
    if (!this.holdPawModel) {
      const p = makePaw();
      this._orientPaw(p, [0, -1, 0], [0.35, -0.45, 1], 0.6);
      p.curl(0.55);
      this.camera.add(p);
      this.holdPawModel = p;
    }
    return this.holdPawModel;
  }

  // (Not shown for now.) How full the jar is, in %, carved into the top of the stem (with coloured paint in the
  // grooves): red under 25 · orange under 50 · green under 80 · purple 80 and up
  _jarLabel(vm, frac) {
    if (!vm.pctTag) {
      const canvas = document.createElement('canvas');
      canvas.width = 128; canvas.height = 64;
      const tex = new THREE.CanvasTexture(canvas);
      tex.encoding = THREE.sRGBEncoding;
      tex.anisotropy = 8;
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.056, 0.028),
        new THREE.MeshLambertMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      mesh.rotation.x = -Math.PI / 2;                    // lying flat on the stem, readable from behind
      mesh.position.set(0, 0.0356, 0.17);
      mesh.renderOrder = 2;
      vm.group.add(mesh);
      vm.pctTag = { canvas, tex, text: '' };
    }
    const pct = Math.round(Math.max(0, Math.min(1, frac)) * 100);
    const color = pct < 25 ? '#ff5a5a' : pct < 50 ? '#ffa53d' : pct < 80 ? '#7dff9a' : '#d59bff';
    const text = `${pct}%`;
    if (text === vm.pctTag.text) return;
    vm.pctTag.text = text;
    const c = vm.pctTag.canvas, g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.font = 'bold 46px system-ui, -apple-system, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(200, 255, 190, 0.6)'; g.fillText(text, 66, 35);   // light lower edge of the groove
    g.fillStyle = 'rgba(12, 44, 14, 0.9)'; g.fillText(text, 62, 31);      // dark upper edge (it's cut in)
    g.fillStyle = color; g.fillText(text, 64, 33);                         // paint in the groove
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
  _buildFlower(look, key) {
    const vm = {};
    const g = vm.group = new THREE.Group();
    const lam = (hex, seed) => new THREE.MeshLambertMaterial({ map: Textures.noisyTexture(hex, 18, 8, seed) });
    const stem = lam(0x4caf50, 11), stemDark = lam(0x2e7d32, 12), leaf = lam(0x7bd66b, 13);
    const petalA = lam(look.petal, 14), petalB = lam(look.petal2, 15), center = lam(look.center, 16);
    const add = (...a) => this._box(...a);
    const len = look.long ? 0.75 : look.short ? 0.32 : 0.5;
    const hushLen = look.hush ? 0.16 : 0;                          // the silencer sticks out in front
    const stemMat = look.cactus ? lam(0x3f9a5a, 17) : stem;
    if (look.twin) for (const x of [-0.03, 0.03]) add(g, 0.05, 0.06, len, stemMat, x, 0, -(len - 0.5) / 2);   // two barrels
    else add(g, 0.07, 0.07, len, stemMat, 0, 0, -(len - 0.5) / 2);   // stem body
    if (look.stripes) {                                            // bee stripes
      const black = lam(0x2b2b33, 18);
      for (const z of [-0.06, 0.02, 0.1].map(z => z - (len - 0.5) / 2)) add(g, 0.076, 0.076, 0.03, black, 0, 0, z);
    }
    if (look.cactus) {                                             // a revolver drum, and spines all over
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.09, 12), lam(0x2e7d32, 19));
      drum.rotation.x = Math.PI / 2;
      drum.position.set(0, 0.005, 0.02);
      g.add(drum);
      const spine = new THREE.MeshLambertMaterial({ color: 0xfffbe8, emissive: 0x333322 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2, z = 0.08 - (i % 5) * 0.075;
        const sp = add(g, 0.006, 0.026, 0.006, spine, Math.cos(a) * 0.04, Math.sin(a) * 0.04, z);
        sp.rotation.z = a - Math.PI / 2;
      }
    }
    if (look.hush) {                                               // the silencer: a hollow sage-green reed
      const front = 0.25 - len;
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, hushLen, 14), lam(0xb8cbb0, 20));
      tube.rotation.x = Math.PI / 2;
      tube.position.set(0, 0.002, front - hushLen / 2);
      g.add(tube);
      for (const k of [0.25, 0.75]) add(g, 0.092, 0.092, 0.012, lam(0x8fa688, 21), 0, 0.002, front - hushLen * k);   // reed joints
    }
    add(g, 0.055, 0.15, 0.065, stemDark, 0, -0.1, 0.13);            // grip
    if (!look.short) add(g, 0.06, 0.06, 0.12, stemDark, 0, -0.01, 0.3);   // back end
    const leftLeaf = add(g, 0.16, 0.012, 0.08, leaf, -0.1, 0.01, 0.02);
    leftLeaf.rotation.z = 0.45;
    const rightLeaf = add(g, 0.16, 0.012, 0.08, leaf, 0.1, 0.01, 0.06);
    rightLeaf.rotation.z = -0.45;

    // flower head (spins a little each shot)
    vm.head = new THREE.Group();
    vm.head.position.set(0, 0.01, 0.25 - len - hushLen - 0.05);
    vm.head.scale.setScalar(look.size);
    g.add(vm.head);
    add(vm.head, 0.1, 0.1, 0.05, center, 0, 0, 0);
    const petals = look.size > 1.1 ? 12 : look.bell ? 6 : 8;
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2;
      const p = add(vm.head, 0.065, 0.11, 0.02, i % 2 ? petalA : petalB, Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.01);
      p.rotation.z = a - Math.PI / 2;
      if (look.cup) p.rotation.x = 0.6;                              // tulip cup shape
      if (look.bell) p.rotation.x = 1.0;                             // a bluebell: closed up like a bell
    }
    if (look.bell) for (const z of [0.05, -0.1]) {                   // two little bells hanging off the stem
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.6), petalA);
      b.rotation.x = Math.PI;
      b.position.set(0.045, -0.05, z - (len - 0.5) / 2);
      g.add(b);
    }
    vm.muzzleZ = vm.head.position.z - 0.04;

    // the reservoir: this blaster's own lab glass, with soap that drains as you shoot
    const v = vm.vessel = VESSELS[key] || VESSELS.default;
    const glass = new THREE.MeshLambertMaterial({ color: 0xe0f7ff, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide });
    const jar = new THREE.Group();
    jar.position.set(0, JAR.y, JAR.z);
    g.add(jar);
    const outline = v.pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0005, r), y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(outline, 28), glass);
    body.renderOrder = 1;                              // glass drawn after the liquid inside it
    jar.add(body);
    const top = v.pts[v.pts.length - 1][1];
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x555555 });
    for (const y of v.marks || []) {                   // measuring lines on the side facing you
      const r = vesselRadius(v, y);
      const mk = new THREE.Mesh(new THREE.BoxGeometry(y === v.marks[v.marks.length - 1] || v.marks.indexOf(y) % 2 ? 0.016 : 0.026, 0.0025, 0.002), white);
      mk.position.set(-r * 0.42, y, r * 0.91);
      mk.rotation.y = -0.44;
      jar.add(mk);
    }
    if (v.spout) {                                     // the beaker's little pouring lip
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, 0.02), glass);
      sp.position.set(0, top + 0.001, -v.neckR - 0.004);
      sp.rotation.x = 0.4;
      sp.renderOrder = 1;
      jar.add(sp);
    }
    if (v.foot) {                                      // the graduated cylinder's wide foot
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.054, 0.012, 6), glass);
      foot.position.y = 0.006;
      foot.renderOrder = 1;
      jar.add(foot);
    }
    if (v.tap) {                                       // the burette's little tap
      const tapMat = new THREE.MeshLambertMaterial({ color: 0x5b8cff, emissive: 0x101830 });
      add(jar, 0.04, 0.008, 0.008, tapMat, 0, 0.016, 0);
    }
    if (v.clamp) {                                     // a little clamp holding the test tube up
      const metal = new THREE.MeshLambertMaterial({ color: 0xc9d2dc, emissive: 0x15181c });
      for (const y of [0.03, 0.085]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.004, 6, 16), metal);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        jar.add(ring);
      }
      add(jar, 0.008, 0.07, 0.008, metal, 0.028, 0.055, 0);
    }
    // the stopper: a pink cork in the neck, or a glass lid on the beaker
    const cork = v.stopper === 'lid'
      ? new THREE.Mesh(new THREE.CylinderGeometry(v.neckR + 0.006, v.neckR + 0.006, 0.006, 24), new THREE.MeshLambertMaterial({ color: 0xffb3cf, emissive: 0x2a0a14, transparent: true, opacity: 0.75 }))
      : new THREE.Mesh(new THREE.CylinderGeometry(v.neckR + 0.004, v.neckR - 0.002, 0.022, 16), new THREE.MeshLambertMaterial({ color: 0xffb3cf, emissive: 0x2a0a14 }));
    cork.position.set(0, JAR.y + top + (v.stopper === 'lid' ? 0.004 : 0.008), JAR.z);
    g.add(cork);
    vm.cork = cork;                                    // the "cork" refill pops it off and puts it back
    vm.corkHome = cork.position.clone();
    vm.liquid = new THREE.Mesh(vesselLiquidGeometry(v, 1), new THREE.MeshLambertMaterial({ color: WATER.color, emissive: WATER.glow }));
    jar.add(vm.liquid);
    vm.liquidLevel = 1;
    vm.jarCenter = new THREE.Vector3(0, JAR.y + v.mid, JAR.z);   // the refill shows aim at these
    vm.jarRadius = v.bodyR;

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

  // Left hand (painted nails, sleeve, bracelet) holding a little silver teapot, used for refilling.
  _buildHand(vm) {
    const lam = (hex, o = {}) => new THREE.MeshLambertMaterial({ color: hex, ...o });
    // a big paw (white fur, pink beans + painted claws, gold bracelet) in a team sleeve
    const furTex = Textures.noisyTexture(0xffffff, 14, 8, 41);
    const skin = new THREE.MeshLambertMaterial({ map: furTex, color: BICHON.fur, emissive: DOG_GLOW });
    const nail = lam(0xff3d8b, { emissive: 0x551030 }), bean = lam(PAW.bean, { emissive: 0x3a1020 });
    const sleeve = new THREE.MeshLambertMaterial({ map: Textures.noisyTexture(0xffffff, 20, 8, 43), color: PAW.sleeve });
    const gold = lam(0xffd36b, { emissive: 0x403010 });
    const silver = lam(0xdfe4ec, { emissive: 0x2a3038 });
    const corkMat = lam(0xff8fb1, { emissive: 0x401020 });
    const add = (...a) => this._box(...a);

    // hand = the wrist point. The forearm hangs off it and stays put;
    // the grip (paw + teapot) turns around the wrist to pour.
    const hand = new THREE.Group();
    const grip = new THREE.Group();          // pivots at the wrist
    hand.add(grip);
    const held = new THREE.Group();          // teapot + paw, centred on the pot
    held.position.set(0.047, 0.04, 0);
    grip.add(held);

    // the teapot: a round-ish silver belly, a domed lid with a knob, a handle on the paw's
    // side and a spout that curves up and out on the other (it points down when she tips it)
    const BW = 0.05;
    add(held, 0.078, 0.046, 0.078, silver, 0, -0.008, 0);
    add(held, 0.064, 0.014, 0.064, silver, 0, 0.022, 0);
    add(held, 0.05, 0.012, 0.05, silver, 0, -0.034, 0);                  // the foot
    add(held, 0.044, 0.01, 0.044, silver, 0, 0.034, 0);                  // the lid
    add(held, 0.012, 0.012, 0.012, gold, 0, 0.045, 0);                   // its knob
    add(held, 0.01, 0.034, 0.012, silver, -0.047, -0.016, 0);            // the handle (under the paw)
    add(held, 0.016, 0.008, 0.012, silver, -0.042, 0.004, 0);
    add(held, 0.016, 0.008, 0.012, silver, -0.042, -0.034, 0);
    const spout = add(held, 0.05, 0.014, 0.014, silver, 0.058, 0.014, 0);   // the spout, angled up and out
    spout.rotation.z = 0.65;
    vm.neck = new THREE.Vector3(0.079, 0.03, 0);                         // the spout's mouth, in held space
    const cork = new THREE.Group();                                      // the little cork in the spout: pulled out
    add(cork, 0.012, 0.012, 0.012, corkMat, 0, 0, 0);                    // with her teeth and spat away before the pour
    add(cork, 0.016, 0.006, 0.016, corkMat, 0, 0.008, 0);
    hand.add(cork);                                                      // (on the wrist, so it can go on its own)
    vm.spoutCork = cork;
    vm.corkHome2 = new THREE.Vector3(0.084, 0.036, 0);                   // sitting in the spout, in held space
    add(held, 0.036, 0.09, 0.074, skin, -BW / 2 - 0.016, -0.004, 0);   // the chubby paw
    for (let i = 0; i < 4; i++) {                                       // fat toes round the pot, beans + claws
      const y = 0.03 - i * 0.02;
      const len = i === 3 ? 0.042 : 0.05;
      const toe = new THREE.Group();                                    // turns at its base (the top one points)
      toe.position.set(-BW / 2 - 0.01, y, BW / 2 + 0.012);
      held.add(toe);
      add(toe, len, 0.024, 0.026, skin, len / 2, 0, 0);
      add(toe, 0.012, 0.012, 0.004, bean, len / 2 + 0.006, 0, -0.0115);
      add(toe, 0.01, 0.012, 0.007, nail, len, 0, 0.014);
      if (i === 0) vm.pointer = toe;
    }
    add(held, 0.044, 0.026, 0.026, skin, -0.008, 0.022, -BW / 2 - 0.012);   // dewclaw

    const arm = new THREE.Group();                                      // wrist, bracelet, forearm, sleeve
    arm.rotation.set(-0.75, 0, -0.3);
    hand.add(arm);
    add(arm, 0.066, 0.07, 0.066, skin, 0, -0.03, 0);
    add(arm, 0.07, 0.014, 0.07, gold, 0, -0.05, 0);
    add(arm, 0.075, 0.3, 0.075, sleeve, 0, -0.22, 0);

    hand.scale.setScalar(0.68);                       // the left hand is a bit smaller than the right
    vm.mouth = new THREE.Vector3(0.01, -0.105, -0.27);   // where your mouth is (camera space): the spout comes up to it
    hand.visible = false;
    vm.group.add(hand);
    vm.hand = hand;
    vm.grip = grip;
    vm.held = held;

    const streamGeo = new THREE.BoxGeometry(0.012, 1, 0.012);
    streamGeo.translate(0, -0.5, 0); // hangs down from its top
    vm.stream = new THREE.Mesh(streamGeo, lam(WATER.color, { emissive: WATER.glow, transparent: true, opacity: 0.8 }));   // the same blue water as in the glass
    vm.stream.visible = false;
    vm.group.add(vm.stream);

    vm.jarTopY = vm.corkHome.y + 0.012;                 // top of the stopper
    vm.handPour = new THREE.Vector3(-0.088, vm.jarTopY + 0.086, 0.03);
    vm.handAway = new THREE.Vector3(-0.55, -0.35, 0.3);
    vm.pourTilt = -1.7;
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
    const paw = this._holdPaw();
    if (on) { paw.visible = true; paw.position.set(0.215, -0.235, -0.39); }
    else if (!this.nadeKind) paw.visible = false;
  }

  // Refill choreography, p = 0..1 through the refill: the tea pour (the way mint tea is served,
  // from way up high):
  //   the paw brings the teapot up to your mouth → you bite the cork in the spout, the pot
  //   tugs free, ptoo! you spit the cork out in front of you → the jar's lid floats off by
  //   magic → she tips the pot over the glass → lifts it way up high while it pours, a long
  //   thin stream falling into the glass from above → brings it back down → tips back →
  //   the cork zips back into the spout, the lid settles, and she leaves
  static get POUR_BITE() { return 0.15; }          // the teeth take the cork
  static get POUR_SPIT() { return 0.22; }          // ptoo!
  static get POUR_CORK_BACK() { return 0.87; }     // the cork's back in the spout
  static reloadPhases(p) {
    const inT = ease01(span(p, 0, 0.1));
    const outT = ease01(span(p, 0.9, 1));
    const mouth = ease01(span(p, 0, 0.1)) * (1 - ease01(span(p, 0.23, 0.33)));   // the spout at your mouth
    const tilt = ease01(span(p, 0.3, 0.4)) - ease01(span(p, 0.8, 0.86));
    const dock = ease01(span(p, 0.25, 0.35)) - ease01(span(p, 0.84, 0.9));      // the spout held over the glass
    const high = ease01(span(p, 0.42, 0.58)) - ease01(span(p, 0.66, 0.78));     // way up high, and back down
    const pouring = p > 0.38 && p < 0.8;
    const fill = ease01(span(p, 0.38, 0.8));
    return { reach: inT - outT, mouth, tilt, dock, fill, pouring, high };
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
    if (kind) this._holdPaw().visible = true;
    else if (!(this.seedModel && this.seedModel.visible) && this.holdPawModel) this.holdPawModel.visible = false;
    if (kind !== this.nadeKind) { this.nadeKind = kind; this.swapT = 0.3; }
  }

  // grenade in hand: bob along, wind up after a throw… and fiddle with it while waiting:
  //   Bubble Bomb — squished like a stress ball, then it wobbles back into shape
  //   Sparkle Pop — flicked into a twirl on the paw, spinning down until the next flick
  //   Cloud Puff  — tossed up a little, flips over, and lands back in the paw
  updateNade(dt, mover) {
    const m = this.nadeModels && this.nadeModels[this.nadeKind];
    if (!m) return;
    this.kick = Math.max(0, this.kick - dt * 4);
    this.swapT = Math.max(0, this.swapT - dt);
    const speed = mover.onGround ? mover.horizontalSpeed : 0;
    this.bobPhase += dt * speed * 1.6;
    const bob = Math.sin(this.bobPhase) * 0.01 * Math.min(1, speed / PLAYER.runSpeed);
    const paw = this._holdPaw();
    m.position.set(0.2 + bob, -0.17 - this.swapT * 0.5 - this.kick * 0.3, -0.45);
    m.rotation.set(0.2, 0.5, 0);
    m.scale.setScalar(0.42);
    paw.position.set(0.21 + bob, -0.222 - this.swapT * 0.5 - this.kick * 0.3, -0.42);
    // the fiddling waits while the grenade comes up or gets thrown
    if (this.swapT > 0 || this.kick > 0) { this.fiddleT = -0.5; this.twirl = 0; return; }
    const f = (this.fiddleT = (this.fiddleT || 0) + dt);
    if (f < 0) return;
    const ease = t => t * t * (3 - 2 * t);
    if (this.nadeKind === 'frag') {
      const u = f % 2.6;
      let s = 0;
      if (u < 0.4) s = ease(u / 0.4) * 0.28;                                               // squeeze…
      else if (u < 0.55) s = 0.28 * (1 - (u - 0.4) / 0.15);                                // let go
      else if (u < 1.6) s = Math.sin((u - 0.55) * 26) * 0.09 * Math.exp(-(u - 0.55) * 3.5);   // wobbles back
      m.scale.set(0.42 * (1 + s), 0.42 * (1 - s), 0.42 * (1 + s));
      m.position.y -= s * 0.02;
      paw.position.y -= Math.max(0, s) * 0.012;
    } else if (this.nadeKind === 'flash') {
      const u = f % 3.2;
      this.twirl = (this.twirl || 0) + dt * 16 * Math.exp(-u * 1.7);                        // a flick, spinning down
      m.rotation.y += this.twirl;
      m.rotation.x += Math.sin(this.twirl * 0.5) * 0.12;
      m.position.y += Math.sin(this.twirl) * 0.003;
    } else {
      const u = f % 2.8;                                                                   // toss & catch
      if (u < 0.75) {
        const t = u / 0.75;
        m.position.y += 4 * t * (1 - t) * 0.1;
        m.rotation.z += t * Math.PI * 2;
        m.rotation.x += Math.sin(t * Math.PI) * 0.4;
        paw.position.y += t < 0.15 ? ease(t / 0.15) * 0.015 : t < 0.5 ? 0.015 * (1 - ease((t - 0.15) / 0.35)) : 0;   // the push up
      } else if (u < 0.95) {
        const dip = Math.sin((u - 0.75) / 0.2 * Math.PI) * 0.012;                          // the catch dips the paw
        paw.position.y -= dip; m.position.y -= dip;
      }
    }
  }

  onFire() {
    this.inspectT = 0;
    if (this.gun && this.gun.def.melee) { this.swingT = 0.32; return; }
    this.kick = this.gun && this.gun.def.pellets ? 2 : 1;
    if (this.gun && this.gun.def.key === 'cactus') this.flip = 1;   // the revolver bucks up, cowboy style
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

    if (vm.knife) {
      // swipe from right to left
      this.swingT = Math.max(0, (this.swingT || 0) - dt);
      const s = this.swingT > 0 ? Math.sin((1 - this.swingT / 0.32) * Math.PI) : 0;
      g.position.set(vm.restPos.x + bx - s * 0.18, vm.restPos.y + by + s * 0.05, vm.restPos.z - s * 0.08);
      g.rotation.set(0.25 - s * 0.3, 0.25 + s * 0.9, 0.4 - s * 0.9);
      this._applyInspect(g, dt);
      return;
    }

    vm.flash.visible = this.flashTime > 0;
    vm.flash.scale.setScalar(1 + (0.06 - this.flashTime) * 12);
    const reloading = gun.reloading > 0;
    if (reloading) this.inspectT = 0;
    const t = reloading ? 1 - gun.reloading / gun.def.reloadTime : 0;
    // every refill picks a random little show (the classic pour, or one of the sassy ones)
    if (reloading && !this._wasReloading) {
      this.reloadStyle = this.forcedStyle || pickRefillStyle(this.reloadStyle);   // (practice range: T picks it)
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

    // refilling: the blaster dips and tilts a little towards the hand to present the jar
    const lean = reloading ? (sassy ? 0.35 * Math.sin(t * Math.PI) : ph.reach) : 0;
    g.position.set(vm.restPos.x + bx - lean * 0.02, vm.restPos.y + by - lean * 0.04, vm.restPos.z + this.kick * 0.05);
    g.rotation.set(this.kick * 0.06 + lean * 0.12, 0, lean * 0.22);
    // Cactus Revolver: snaps up hard in a blink, then settles back down slowly before the next shot
    this.flip = Math.max(0, (this.flip || 0) - dt / 0.4);
    if (this.flip > 0) {
      const u = 1 - this.flip;
      const a = u < 0.12 ? u / 0.12 : 1 - ease01((u - 0.12) / 0.88);
      g.rotation.x += a * 0.55;
      g.rotation.z -= a * 0.12;
      g.position.y += a * 0.035;
      g.position.z += a * 0.05;
    }
    this._applyInspect(g, dt);
    g.rotation.z += this.sassy.wobble;                  // something bumped the jar
    g.rotation.x += this.sassy.wobble * 0.4;
    if (sassy) this.sassy.play(this.reloadStyle, t, dt, vm);
    else this.sassy.hide(reloading ? dt : 0);
    // the jar's lid: she lifts one claw off the pot and the lid levitates up off the glass,
    // hovers aside, wobbling, while she pours… and floats back down with a clink
    if (vm.pointer) vm.pointer.rotation.z = 0;
    if (reloading && !sassy && vm.cork && vm.pointer) {
      const lastP = this._pourT || 0, at = x => lastP < x && t >= x;
      vm.pointer.rotation.z = 2.5 * ease01(span(t, 0.24, 0.3)) * (1 - ease01(span(t, 0.86, 0.92)));
      const up = ease01(span(t, 0.27, 0.37)) * (1 - ease01(span(t, 0.82, 0.9)));
      const c = vm.cork;
      c.position.copy(vm.corkHome).add(this._v.set((vm.vessel.neckR + 0.05) * up, (0.08 + 0.006 * Math.sin(t * 14)) * up, -0.01 * up));
      c.rotation.set(0.3 * up * Math.sin(t * 6), 5 * t * up, 0.25 * up + 0.12 * up * Math.cos(t * 5));
      g.updateMatrixWorld(true);
      if (at(0.27)) { Sound.clink(0.35); this.sassy._spark(g.localToWorld(vm.corkHome.clone()), 5); }
      for (const x of [0.33, 0.48, 0.62, 0.74]) if (at(x)) {          // a little magic off her claw
        vm.pointer.updateMatrixWorld(true);
        this.sassy._spark(vm.pointer.localToWorld(this._v.set(0.05, 0, 0.014)).clone(), 2);
        this.sassy._spark(c.getWorldPosition(this._v).clone(), 2);
      }
      if (at(0.9)) { Sound.clink(0.7); this.sassy._bump(1); }
    }

    vm.hand.visible = reloading && ph.reach > 0.001;
    if (vm.supportPaw) vm.supportPaw.visible = !reloading;   // that paw is busy refilling
    vm.stream.visible = false;
    const lastT = this._pourT || 0;
    this._pourT = reloading && !sassy ? t : 0;
    if (vm.hand.visible) {
      const at = x => lastT < x && t >= x;
      const BITE = Viewmodel.POUR_BITE, SPIT = Viewmodel.POUR_SPIT, BACK = Viewmodel.POUR_CORK_BACK;
      vm.hand.position.lerpVectors(vm.handAway, vm.handPour, ph.reach);
      vm.grip.rotation.z = vm.pourTilt * ph.tilt;
      // where the spout goes: your mouth first (the cork comes out with your teeth), then over
      // the glass: close at first, then way up high (the tea pour)
      const top = this._v2 || (this._v2 = new THREE.Vector3());
      top.set(0, vm.jarTopY + 0.02 + 0.26 * ph.high, JAR.z);
      g.updateMatrixWorld(true);
      const mouth = g.worldToLocal(this.camera.localToWorld(vm.mouth.clone()));   // (its own vector: _v is used below)
      const tug = Math.sin(Math.PI * span(t, BITE - 0.03, BITE + 0.03));     // a tug: the pot pulls, the cork holds
      mouth.z += 0.012 * tug + 0.03 * ease01(span(t, BITE, SPIT));           // ...then the pot comes away, cork out
      mouth.y -= 0.004 * tug + 0.015 * ease01(span(t, BITE, SPIT));
      const amount = Math.min(1, ph.mouth + ph.dock);
      if (amount > 0) {
        const target = mouth.multiplyScalar(ph.mouth).addScaledVector(top, ph.dock).divideScalar(ph.mouth + ph.dock);
        const tip = g.worldToLocal(vm.held.localToWorld(this._v.copy(vm.neck)));
        vm.hand.position.addScaledVector(target.sub(tip), amount);
      }
      if (ph.high > 0.98) {                             // holding it up there: a steady hand, almost
        vm.hand.position.x += Math.sin(t * 90) * 0.0015;
        vm.hand.position.z += Math.sin(t * 73 + 1) * 0.001;
      }
      // the spout's cork: in the spout, then held in your teeth, spat out in front of you,
      // and it zips back into the spout at the end
      const cork = vm.spoutCork;
      const home = this._v3 || (this._v3 = new THREE.Vector3());
      home.copy(vm.corkHome2).add(vm.held.position).applyEuler(vm.grip.rotation);   // in the spout (hand space)
      const u = span(t, SPIT, SPIT + 0.3);
      if (t < BITE || t >= BACK) {
        cork.visible = true;
        cork.position.copy(home);
        cork.rotation.copy(vm.grip.rotation);
      } else if (t < SPIT) {                            // in your teeth: stays at your mouth while the pot pulls away
        cork.visible = true;
        g.updateMatrixWorld(true);
        cork.position.copy(vm.hand.worldToLocal(this.camera.localToWorld(this._v.copy(vm.mouth))));
        cork.position.y += 0.004 * Math.sin(t * 50);
        cork.rotation.set(0.4, 0, 0.2);
      } else if (u < 1) {                               // ptoo! away it flies, tumbling, and drops
        cork.visible = true;
        const f = this._corkFrom || (this._corkFrom = cork.position.clone());
        cork.position.set(f.x + 0.06 * u, f.y + 0.1 * u - 0.5 * u * u, f.z - 1.1 * u);
        cork.rotation.set(14 * u, 3 * u, 8 * u);
      } else cork.visible = false;
      if (t < BITE || t >= BACK) this._corkFrom = null;
      if (at(BITE)) { Sound.corkPop(); this.sassy._bump(0.6); }
      if (at(SPIT)) {
        Sound.spit(); this.sassy._bump(0.3);
        g.updateMatrixWorld(true);
        this.sassy._spark(vm.hand.localToWorld(cork.position.clone()), 4);
      }
      if (at(BACK)) { Sound.tick(1.4); g.updateMatrixWorld(true); this.sassy._spark(vm.hand.localToWorld(home.clone()), 4); }
      if (at(0.38)) { Sound.plop(); this.sassy._bump(0.5); }   // the first of it lands
      if (ph.pouring) {
        if (Math.random() < 0.25) Sound.pour(0.7 + 0.5 * ph.high);
        g.updateMatrixWorld(true);
        const s = g.worldToLocal(vm.held.localToWorld(this._v.copy(vm.neck)));
        const len = s.y - vm.jarTopY;
        if (len > 0.005) {                              // the stream: thinner the longer it falls, swaying a little
          vm.stream.visible = true;
          vm.stream.position.copy(s);
          vm.stream.position.x += Math.sin(t * 60) * 0.004 * ph.high;
          vm.stream.scale.set(1 / (1 + len * 4), len, 1 / (1 + len * 4));
        }
        if (Math.random() < 0.15 + 0.5 * ph.high)       // the splash where it lands
          this.sassy._spark(g.localToWorld(this._v.set(0, vm.jarTopY + 0.005, JAR.z)), 1 + Math.round(ph.high * 2), 'water');
      }
    }
  }
}
