// Refill animations: your left paw (fresh hot-pink claws, a gold ring and a bracelet) does a
// little show while your blaster refills. One is picked at random each time.
//
// PRIMARY refills, the ones that play: magical water-bending. Water appears out of thin air
// and the paw moves it around like magic, until it ends up in the glass. Every show has its own
// hand movement; only orbit and rain are the palm-up magician (paw on the left of the
// screen, palm up, the water floating over it and flying across to the glass).
//   fumble  — juggles a wobbly water bubble before it lands in the jar
//   ribbon  — draws a swirling ribbon of water with one claw and sends it into the glass
//   orbit   — three droplets circle over her palm like little planets, flicked in one by one
//   rain    — a tiny cloud puffs up over her palm, she wafts it over the glass, and it rains in
//   yoyo    — a ball of water on a thread of water, yo-yo'd from her claws, then dropped in
//   whirl   — the hypnotist: claws rippling, wrist circling, a waterspout spins down into the glass
//   wand    — pinches a ring of water with a soap film, a big bubble swells out, floats over, pops in
//   dribble — dribbles a ball of water like a basketball, then a bank shot off the lid
//   lasso   — the cowboy: her fist swings a lasso of water, catches the runaway lid, it drains in
//   pearls  — a string of water pearls; pinky up, she tugs the end and it zips in like a noodle
//   snap    — (from the reference video) snap ready… up close… the tension builds… SNAP: sparkles, full
// …and every one has its own lid trick:
//   fumble: pops off, crumbles to dust, comes slowly back out of a tiny tiny black hole, SNAP
//   ribbon, orbit, rain: floats off by telekinesis, hovers aside, settles back
//   yoyo: flipped like a coin · whirl: caught in the whirl like a frisbee · wand: floats off in a
//   bubble of its own · dribble: a backboard · lasso: runs away and gets lassoed · pearls: hinges
//   open like a jewellery box and claps shut · snap: leaves the lid alone, it's all in the snap
//
// SECONDARY refills, parked for now (they don't play; we'll come back to them):
//   pour   — the classic soap-bottle pour (in weapons.js)
//   file   — files her nails, checks them, flicks her wrist
//   polish — paints one nail a fresh colour and admires it
//   drum   — drums her nails on the jar, then thumbs up
//   peace  — peace sign, a little groove, rainbow sparkles
//   shades — puts on heart-shaped sunglasses (yes, over your eyes), then flips them up
//   knock  — two timid knocks on the jar, waits… three real knocks. Ow.
//   poke   — reaches for the jar, chickens out, finally pokes it and flinches
//   cork   — the cork is stuck, her fingers slip, then POP and she scrambles to catch it

const PRIMARY_REFILLS = ['fumble', 'ribbon', 'orbit', 'rain', 'yoyo', 'whirl', 'wand', 'dribble', 'lasso', 'pearls', 'snap'];
const SECONDARY_REFILLS = ['pour', 'file', 'polish', 'drum', 'peace', 'shades', 'knock', 'poke', 'cork'];
const SASSY_STYLES = [...PRIMARY_REFILLS, ...SECONDARY_REFILLS].filter(st => st !== 'pour');   // every show the paw does
const REFILL_WEIGHTS = { polish: 1.6 };          // everything else is 1

// SURVEY MODE: every show (primary and secondary) plays in matches, so they can all be seen
// and ranked. Set it back to false to play only the primaries.
const SURVEY_ALL_REFILLS = true;

// A random refill show, never the same one twice in a row.
function pickRefillStyle(prev) {
  const pool = SURVEY_ALL_REFILLS ? [...PRIMARY_REFILLS, ...SECONDARY_REFILLS] : PRIMARY_REFILLS;
  const styles = pool.filter(st => st !== prev);
  const w = st => REFILL_WEIGHTS[st] || 1;
  let r = Math.random() * styles.reduce((a, st) => a + w(st), 0);
  for (const st of styles) { r -= w(st); if (r < 0) return st; }
  return styles[styles.length - 1];
}

const ease01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const span = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

// finger curls [index, middle, ring, pinky] (0 straight .. 1.6 curled) + thumb (−0.4 up .. 1 tucked)
const HAND_POSES = {
  open:      { c: [0, 0, 0, 0], th: 0 },
  relaxed:   { c: [0.25, 0.3, 0.35, 0.45], th: 0.2 },
  flat:      { c: [0.05, 0.05, 0.05, 0.05], th: 0.1 },
  snapReady: { c: [0.5, 0.55, 1.35, 1.45], th: 0.95 },
  snapped:   { c: [0.5, 1.6, 1.4, 1.5], th: 0.25 },
  snapPress: { c: [0.62, 0.72, 1.42, 1.52], th: 1.08 },   // pressing hard, about to go
  snapGun:   { c: [0.05, 1.6, 1.45, 1.5], th: -0.25 },    // snapped: claw out like a finger gun, thumb up
  pinky:     { c: [1.45, 1.45, 1.4, 0.1], th: 0.9 },     // pinky up, like holding a teacup
  thumbsUp:  { c: [1.5, 1.5, 1.5, 1.5], th: -0.4 },
  peace:     { c: [0, 0, 1.5, 1.5], th: 0.95 },
  pinch:     { c: [0.7, 0.9, 1.25, 1.4], th: 0.55 },
  fist:      { c: [1.5, 1.5, 1.5, 1.5], th: 0.9 },
  point:     { c: [0, 1.45, 1.5, 1.5], th: 0.9 },
  claw:      { c: [0.9, 0.95, 1, 1.05], th: 0.5 },
  flickReady:{ c: [1.35, 0.5, 0.6, 0.7], th: 1 },     // claw cocked under the dewclaw…
  flick:     { c: [0, 0.45, 0.55, 0.65], th: 0.5 },   // …and let go
};
// Timelines shared by the water-bending shows and fill(), so the glass fills exactly as the water lands.
const RIBBON = {
  N: 16, gap: 0.02,                       // drops in the ribbon, and their spacing along its path
  // how far along its path the ribbon's head is: 0..0.7 drawn by her claw, 0.7..1 flying into the glass
  head(t) {
    if (t < 0.6) return 0.7 * ease01(span(t, 0.18, 0.56));
    const u = span(t, 0.6, 0.76);
    return 0.7 + (0.3 + this.N * this.gap) * u * u;
  },
};
const ORBIT = { born: [0.18, 0.24, 0.3], launch: [0.52, 0.6, 0.68], fly: 0.07 };
const RAIN = { from: 0.52, to: 0.76 };
const YOYO = { throws: [[0.2, 0.32], [0.34, 0.44], [0.46, 0.56]], drop: 0.66, land: 0.71 };
const WHIRL = { from: 0.3, to: 0.74 };
const WAND = { free: 0.5, pop: 0.68 };
const DRIBBLE = { bounces: 4, gather: 0.54, shoot: 0.6, bank: 0.67, land: 0.73 };
const LASSO = { throw: 0.5, catch: 0.57, reel: 0.7, drain: 0.76 };
const SNAP = { at: 0.68, ticks: [0.5, 0.56, 0.6, 0.63, 0.65, 0.662, 0.672] };   // the snap, and the ticks before it
const PEARLS = { N: 10, slide: t => Math.pow(span(t, 0.5, 0.72), 1.7) };

const NAIL_COLORS = [0xffd23f, 0x7fffd4, 0xc77dff, 0x6fb7ff, 0xff6f61];

class SassyHand {
  constructor(camera) {
    this.camera = camera;
    const lam = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
    // a big paw: white fur, pink beans, pink painted claws, a gold bracelet + ring
    const furTex = Textures.noisyTexture(0xffffff, 14, 8, 41);
    const skin = new THREE.MeshLambertMaterial({ map: furTex, color: BICHON.fur, emissive: DOG_GLOW });
    const gold = lam(0xffd36b, 0x403010), bean = lam(PAW.bean, 0x3a1020);
    this.nailMat = lam(0xff3d8b, 0x551030);
    this.paintMat = lam(0xff3d8b, 0x551030);           // the claw that gets repainted
    const sleeve = new THREE.MeshLambertMaterial({ map: Textures.noisyTexture(0xffffff, 20, 8, 43), color: PAW.sleeve });   // team sleeve
    const add = (parent, w, h, d, m, x, y, z) => {
      const b = new THREE.Mesh(roundedBoxGeometry(w, h, d, Math.min(w, h, d) * 0.45, 3), m);
      b.position.set(x, y, z);
      parent.add(b);
      return b;
    };
    const piv = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    // the paw: toes point up, the back of the paw (with the claws) faces you, beans face away
    this.root = new THREE.Group();
    this.root.scale.setScalar(0.75);                  // the left paw is a bit smaller than the right
    this.root.visible = false;
    camera.add(this.root);
    const R = this.root;
    add(R, 0.08, 0.072, 0.04, skin, 0, 0, 0);                         // the chubby paw
    add(R, 0.038, 0.03, 0.006, bean, 0, -0.008, -0.021);              // big pad
    this.fingers = [];
    const xs = [0.027, 0.009, -0.009, -0.027], lens = [1, 1.1, 1, 0.85];
    xs.forEach((x, i) => {
      const k = piv(R, x, 0.0325, 0);
      add(k, 0.02, 0.03 * lens[i], 0.026, skin, 0, 0.015 * lens[i], 0);       // fat toe
      const m = piv(k, 0, 0.03 * lens[i], 0);
      add(m, 0.019, 0.024 * lens[i], 0.025, skin, 0, 0.012 * lens[i], 0);
      add(m, 0.013, 0.011, 0.005, bean, 0, 0.01 * lens[i], -0.013);           // toe bean
      const nail = add(m, 0.011, 0.014, 0.006, i === 3 ? this.paintMat : this.nailMat, 0, 0.02 * lens[i], 0.01);   // painted claw
      if (i === 2) add(k, 0.024, 0.006, 0.03, gold, 0, 0.012, 0);      // gold ring
      this.fingers.push({ k, m, nail });
    });
    const tb = piv(R, 0.036, -0.012, 0.002);                          // dewclaw
    add(tb, 0.02, 0.026, 0.022, skin, 0, 0.013, 0);
    const tt = piv(tb, 0, 0.026, 0);
    add(tt, 0.019, 0.02, 0.021, skin, 0, 0.01, 0);
    add(tt, 0.011, 0.012, 0.006, this.nailMat, 0, 0.014, 0.01);
    this.thumb = { b: tb, t: tt };
    add(R, 0.084, 0.014, 0.046, gold, 0, -0.04, 0);                   // bracelet
    add(R, 0.078, 0.05, 0.044, skin, 0, -0.066, 0);                   // forearm
    add(R, 0.086, 0.11, 0.05, sleeve, 0, -0.15, 0);                   // team sleeve

    // props
    this.file = add(R, 0.11, 0.009, 0.012, lam(0xf3c9a6, 0x221510), 0, 0.09, 0.012);   // nail file
    this.bottle = new THREE.Group();
    R.add(this.bottle);
    add(this.bottle, 0.026, 0.03, 0.026, lam(0xff3d8b, 0x330816), 0, 0, 0);
    add(this.bottle, 0.012, 0.022, 0.012, lam(0xffffff), 0, 0.026, 0);
    this.bottle.position.set(0.075, -0.01, 0.012);
    this.brush = new THREE.Group();
    R.add(this.brush);
    add(this.brush, 0.004, 0.04, 0.004, lam(0x222222), 0, 0.02, 0);
    this.brushTip = add(this.brush, 0.007, 0.01, 0.007, this.paintMat, 0, 0, 0);
    // --- props for the second set of shows ---
    const basic = (c, o = {}) => new THREE.MeshBasicMaterial(Object.assign({ color: c }, o));
    const frame = lam(0xffd36b, 0x403010), hot = lam(0xff3d8b, 0x551030);

    // heart-shaped sunglasses (in view space: they go right over your eyes)
    this.shades = new THREE.Group();
    camera.add(this.shades);
    // a smooth heart outline, point down, `w` wide, centred on 0,0
    const heartPath = (w, P = THREE.Shape) => {
      const k = w / 22, p = new P();
      const X = x => (x - 5) * k, Y = y => -(y - 9.5) * k;
      p.moveTo(X(5), Y(5));
      p.bezierCurveTo(X(5), Y(5), X(4), Y(0), X(0), Y(0));
      p.bezierCurveTo(X(-6), Y(0), X(-6), Y(7), X(-6), Y(7));
      p.bezierCurveTo(X(-6), Y(11), X(-3), Y(15.4), X(5), Y(19));
      p.bezierCurveTo(X(12), Y(15.4), X(16), Y(11), X(16), Y(7));
      p.bezierCurveTo(X(16), Y(7), X(16), Y(0), X(10), Y(0));
      p.bezierCurveTo(X(7), Y(0), X(5), Y(5), X(5), Y(5));
      return p;
    };
    const lensMat = basic(0x5a1035, { transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
    const rimMat = basic(0xff3d8b, { side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const lens = new THREE.Mesh(new THREE.ShapeGeometry(heartPath(0.052), 24), lensMat);
      lens.position.set(s * 0.034, 0, 0);
      this.shades.add(lens);
      const rimShape = heartPath(0.06);
      rimShape.holes.push(heartPath(0.051, THREE.Path));
      const rim = new THREE.Mesh(new THREE.ShapeGeometry(rimShape, 24), rimMat);
      rim.position.set(s * 0.034, -0.0004, 0.0005);
      this.shades.add(rim);
    }
    add(this.shades, 0.014, 0.004, 0.004, frame, 0, 0.012, 0.001);    // gold bridge
    for (const s of [-1, 1]) add(this.shades, 0.004, 0.004, 0.06, hot, s * 0.064, 0.012, 0.03);   // arms

    // a wobbly water bubble (fumble)
    this.bubble = new THREE.Group();
    const water = new THREE.Mesh(new THREE.SphereGeometry(0.013, 16, 12), lam(0x7fdcff, 0x1d4f66));
    water.material.transparent = true; water.material.opacity = 0.85;
    this.bubble.add(water);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 8, 6), basic(0xffffff));
    shine.position.set(-0.005, 0.005, 0.009);
    this.bubble.add(shine);
    camera.add(this.bubble);

    // water for the water-bending shows: a pool of droplets (same water as the bubble)…
    this.drops = [];
    for (let i = 0; i < 24; i++) {
      const d = new THREE.Group();
      d.add(new THREE.Mesh(water.geometry, water.material));
      const sh = new THREE.Mesh(shine.geometry, shine.material);
      sh.position.copy(shine.position);
      d.add(sh);
      camera.add(d);
      this.drops.push(d);
    }
    // …and a tiny fluffy rain cloud
    this.cloud = new THREE.Group();
    const cloudTop = lam(0xffffff, 0x8a96a8), cloudBottom = lam(0xdfe8f2, 0x5a6678);
    const ball = new THREE.SphereGeometry(1, 14, 10);
    for (const [x, y, z, r, low] of [[0, 0.004, 0, 0.017], [0.017, 0, 0.002, 0.013], [-0.017, 0, 0, 0.014], [0.007, 0.013, -0.002, 0.012],
      [-0.008, 0.011, 0.004, 0.011], [0.029, -0.004, 0, 0.009], [-0.029, -0.004, 0, 0.01], [0, -0.007, 0.004, 0.014, 1], [0.016, -0.008, 0, 0.011, 1], [-0.016, -0.008, 0, 0.011, 1]]) {
      const m = new THREE.Mesh(ball, low ? cloudBottom : cloudTop);
      m.position.set(x, y, z);
      m.scale.setScalar(r);
      this.cloud.add(m);
    }
    camera.add(this.cloud);
    // …and a tiny tiny black hole (the lid comes back out of it)
    this.hole = new THREE.Group();
    this.hole.add(new THREE.Mesh(new THREE.SphereGeometry(0.004, 12, 8), basic(0x000000)));
    const ring = (r, tube, c, o) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 24), basic(c, { transparent: true, opacity: o }));
      m.rotation.x = 1.2;                                // tilted, so it reads as a swirling disc
      this.hole.add(m);
    };
    ring(0.0075, 0.0016, 0xb070ff, 0.9);
    ring(0.012, 0.0009, 0x7fdcff, 0.6);
    camera.add(this.hole);
    // …two big soap bubbles, a ring with a soap film for the bubble wand, and a ripple ring
    const soapMat = new THREE.MeshLambertMaterial({ color: 0xe8f8ff, emissive: 0x2a4a5a, transparent: true, opacity: 0.3, depthWrite: false });
    const mkSoap = () => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), soapMat));
      const sh = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), basic(0xffffff, { transparent: true, opacity: 0.8 }));
      sh.position.set(-0.4, 0.45, 0.75);
      g.add(sh);
      camera.add(g);
      return g;
    };
    this.soap = [mkSoap(), mkSoap()];
    this.wandRing = new THREE.Group();
    this.wandRing.add(new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0022, 8, 24), water.material));
    this.wandRing.add(new THREE.Mesh(new THREE.CircleGeometry(0.012, 20), new THREE.MeshLambertMaterial({ color: 0xe8f8ff, emissive: 0x2a4a5a, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide })));
    camera.add(this.wandRing);
    this.rippleMat = basic(0xb8f0ff, { transparent: true, opacity: 0.8, depthWrite: false });
    this.ripple = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 6, 28), this.rippleMat);
    camera.add(this.ripple);

    this.props = [this.file, this.bottle, this.brush, this.shades, this.bubble, this.cloud, this.hole, this.wandRing, this.ripple, ...this.soap, ...this.drops];
    for (const p of this.props) p.visible = false;

    this.particles = [];
    this.sparkMats = [0xffd23f, 0xffffff, 0xff8fb1, 0x7fffd4].map(c => lam(c, c));
    this.rainbowMats = [0xff6f91, 0xffd23f, 0x7fffd4, 0x6fb7ff, 0xc77dff].map(c => lam(c, c));
    this.waterMats = [0x7fdcff, 0xb8f0ff, 0xffffff].map(c => lam(c, c));
    this.wobble = 0; this.wobV = 0;                // the jar jiggles when she bumps it (weapons.js reads this)
    this._v = new THREE.Vector3();
    this.style = null;
    this.lastT = 0;
  }

  _pose(a, b, k) {
    const A = HAND_POSES[a], Bp = HAND_POSES[b || a];
    k = b ? k : 0;
    this.fingers.forEach((f, i) => {
      const c = A.c[i] + (Bp.c[i] - A.c[i]) * k;
      f.k.rotation.x = -c;
      f.m.rotation.x = -c * 1.15;
    });
    const th = A.th + (Bp.th - A.th) * k;
    this.thumb.b.rotation.set(-Math.max(0, th) * 0.6, 0, -0.5 + th * 1.1);
    this.thumb.t.rotation.z = Math.max(0, th) * 0.5;
  }

  _spark(pos, n = 10, rainbow = false) {
    const mats = rainbow === 'water' ? this.waterMats : rainbow ? this.rainbowMats : this.sparkMats;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.006), mats[i % mats.length]);
      m.position.copy(pos);
      this.camera.add(m);
      const a = Math.random() * Math.PI * 2;
      this.particles.push({ m, vel: new THREE.Vector3(Math.cos(a) * 0.12, Math.sin(a) * 0.12 + 0.05, (Math.random() - 0.5) * 0.05), life: 0.5, max: 0.5 });
    }
  }

  // `obj` crumbles into dust: little bits in its colour drift out of a disc of radius r around pos
  _dust(pos, n, r, obj) {
    let col = null;
    obj.traverse(o => { if (!col && o.material && o.material.color) col = o.material.color; });
    const hex = col ? col.getHex() : 0xffffff;
    this._dustMats = this._dustMats || {};
    const mat = this._dustMats[hex] || (this._dustMats[hex] = new THREE.MeshLambertMaterial({ color: hex, emissive: new THREE.Color(hex).multiplyScalar(0.4) }));
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.004), mat);
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
      m.position.copy(pos).add(new THREE.Vector3(Math.cos(a) * d, (Math.random() - 0.5) * 0.006, Math.sin(a) * d));
      this.camera.add(m);
      this.particles.push({ m, vel: new THREE.Vector3(Math.cos(a) * 0.05, 0.06 + Math.random() * 0.05, Math.sin(a) * 0.05), life: 0.6, max: 0.6 });
    }
  }

  _tick(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.m.position.addScaledVector(p.vel, dt);
      p.vel.y -= 0.25 * dt;
      p.m.rotation.x += dt * 6; p.m.rotation.y += dt * 5;
      const k = Math.max(0, p.life / p.max);
      p.m.scale.setScalar(k);
      if (p.life <= 0) { this.camera.remove(p.m); this.particles.splice(i, 1); }
    }
  }

  _nailPos(i) {                                    // where a fingertip nail is, in hand space
    this.root.updateMatrixWorld(true);
    return this.root.worldToLocal(this.fingers[i].nail.getWorldPosition(this._v).clone());
  }

  // dt > 0: the paw is away but the sparkles and the jar's wobble carry on (the soap-bottle pour)
  hide(dt = 0) {
    this.root.visible = false;
    for (const p of this.props) p.visible = false;
    this.style = null;
    this._corkHome();
    if (dt > 0) { this._tick(dt); this._spring(dt); return; }
    this._tick(1);                                 // clear leftover sparkles
    this.wobble = this.wobV = 0;
  }

  _corkHome() { if (this.vm && this.vm.cork) { const c = this.vm.cork; c.position.copy(this.vm.corkHome); c.rotation.set(0, 0, 0); c.scale.setScalar(1); c.visible = true; } }

  // give the jar a nudge
  _bump(v) { this.wobV += v; }

  // How full the jar should be at time t (0..1) of this show. It always rises
  // gradually, so you can watch the liquid come up in the glass: part of it before the
  // paw touches the glass, the rest after.
  fill(style, t) {
    const surge = (at, before) => before * ease01(span(t, 0.15, at)) + (1 - before) * ease01(span(t, at, Math.min(at + 0.25, 0.9)));
    if (style === 'snap') return t >= SNAP.at ? 1 : 0;   // full the instant she snaps
    if (style === 'file') return surge(0.74, 0.35);
    if (style === 'polish') return surge(0.72, 0.4);
    if (style === 'drum') return 0.4 * Math.round(span(t, 0.15, 0.46) * 6) / 6 + 0.6 * ease01(span(t, 0.6, 0.85));   // a bit fuller with each tap
    if (style === 'peace') return surge(0.62, 0.3);
    if (style === 'shades') return surge(0.74, 0.35);
    if (style === 'knock') return 0.12 * span(t, 0.2, 0.3) + 0.88 * ease01(span(t, 0.5, 0.8));
    if (style === 'poke') return 0.1 * span(t, 0.25, 0.4) + 0.9 * ease01(span(t, 0.44, 0.8));
    if (style === 'fumble') return 0.15 * span(t, 0.2, 0.52) + 0.85 * ease01(span(t, 0.62, 0.82));
    if (style === 'cork') return ease01(span(t, 0.53, 0.8));
    if (style === 'ribbon') return span(RIBBON.head(t), 1, 1 + RIBBON.N * RIBBON.gap);
    if (style === 'orbit') return ORBIT.launch.reduce((a, L) => a + ease01(span(t, L + ORBIT.fly - 0.01, L + ORBIT.fly + 0.06)) / 3, 0);
    if (style === 'rain') return ease01(span(t, RAIN.from + 0.03, RAIN.to + 0.04));
    if (style === 'yoyo') return ease01(span(t, YOYO.land - 0.01, YOYO.land + 0.11));
    if (style === 'whirl') return ease01(span(t, WHIRL.from + 0.02, WHIRL.to + 0.06));
    if (style === 'wand') return ease01(span(t, WAND.pop + 0.02, WAND.pop + 0.14));
    if (style === 'dribble') return ease01(span(t, DRIBBLE.land - 0.01, DRIBBLE.land + 0.11));
    if (style === 'lasso') return ease01(span(t, LASSO.reel + 0.01, LASSO.reel + 0.12));
    if (style === 'pearls') return PEARLS.slide(t);
    return ease01(span(t, 0.15, 0.8));
  }

  // the jar's springy wobble (and the sparkles) carry on even when this paw isn't out
  _spring(dt) {
    const sdt = Math.min(dt, 0.05);
    this.wobV += (-140 * this.wobble - 8 * this.wobV) * sdt;
    this.wobble += this.wobV * sdt;
  }

  play(style, t, dt, vm) {
    const R = this.root;
    R.rotation.order = 'XYZ';
    if (vm !== this.vm) { this._corkHome(); this.vm = vm; }
    if (style !== this.style || t < this.lastT) {      // a new show starts
      this.style = style;
      this.fired = false;
      this.paintMat.color.set(0xff3d8b); this.paintMat.emissive.set(0x551030);
      this.newNail = NAIL_COLORS[Math.floor(Math.random() * NAIL_COLORS.length)];
      for (const p of this.props) p.visible = false;
      this.wobble = this.wobV = 0;
      this._corkHome();
    }
    const lastT = this.lastT;
    this.lastT = t;
    R.visible = true;
    this._tick(dt);
    this._spring(dt);

    // slide in from the bottom-left, slide out at the end
    const show = ease01(span(t, 0, 0.15)) * (1 - ease01(span(t, 0.85, 1)));
    const away = new THREE.Vector3(-0.28, -0.32, -0.36);
    const crossed = at => lastT < at && t >= at;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    // where the jar is right now (the camera sits at the origin, so this is screen space)
    vm.group.updateMatrixWorld(true);
    const jar = vm.group.localToWorld(vm.jarCenter.clone());
    const jarR = vm.jarRadius * vm.group.scale.x;
    // where the hand must be so that `local` (a point on the hand) sits on `target`
    const posFor = (target, local) => {
      R.position.set(0, 0, 0);
      R.updateMatrixWorld(true);
      return target.clone().sub(R.localToWorld(local.clone()));
    };
    const reachTo = (target, local) => R.position.lerpVectors(away, posFor(target, local), show);
    const tipOf = i => this._nailPos(i).add(V(0, 0.006, -0.004));
    const tipIn = (pose, i) => { this._pose(pose); return tipOf(i); };    // fingertip i, in that pose
    // a spot on the glass, in glass radii from its middle (x right, y up, z towards you)
    const glass = (dx, dy, dz) => V(jar.x + dx * jarR, jar.y + dy * jarR, jar.z + dz * jarR);
    // THE TENSION (like the karate chop): the paw comes close (a→b), creeps back trembling
    // more and more (b→c)… WHAM onto the glass at c, stays until d, lets go.
    // 0 = away … 1 = touching the glass. `from` = where it starts (1 if it's already on the glass).
    const strike = (a, b, c, d, from = 0) => {
      if (t < b) return from + (0.75 - from) * ease01(span(t, a, b));
      if (t < c) return 0.75 - 0.18 * ease01(span(t, b, c));
      if (t < c + 0.04) return 0.57 + 0.43 * ease01(span(t, c, c + 0.04));
      if (t < d) return 1;
      return 1 - ease01(span(t, d, d + 0.1));
    };
    // the trembling that builds up from a to c (gone the moment it strikes)
    const shiver = (a, c, amt = 0.004) => {
      if (t < a || t >= c) return V(0, 0, 0);
      const k = ease01(span(t, a, c)) * 0.3;
      return V(Math.sin(t * 260) * amt * k, Math.sin(t * 337 + 1) * amt * 0.7 * k, 0);
    };
    // put `local` on `spot`, pulled back along `from` by (1 - k), plus a little `extra`
    const touch = (spot, local, from, k, extra) => reachTo(spot.clone().addScaledVector(from, 1 - k).add(extra || V(0, 0, 0)), local);
    const hit = (pos, n = 10, kind) => { Sound.clink(); this._bump(2); this._spark(pos.clone(), n, kind); };

    // the top of the glass, where the water goes in (the lid floats out of the way)
    const mouth = vm.group.localToWorld(vm.corkHome.clone());
    // telekinesis: the lid (or cork) floats up off the glass all by itself (a→b), hovers,
    // tilting and turning, out of the water's way… and settles back down with a clink (c→d)
    const liftLid = (a, b, c, d, up = 0.045) => {
      const lid = vm.cork, aside = vm.vessel.neckR * vm.group.scale.x + 0.028;   // wide lids float further aside
      if (!lid) return;
      const k = ease01(span(t, a, b)) * (1 - ease01(span(t, c, d)));
      lid.position.copy(vm.corkHome);
      lid.rotation.set(0, 0, 0);
      const home = vm.group.localToWorld(vm.corkHome.clone());
      if (k > 0) {
        const p = home.clone().add(V(aside * k, (up + 0.004 * Math.sin(t * 14)) * k, -0.01 * k));
        lid.position.copy(vm.group.worldToLocal(p));
        lid.rotation.set(0.35 * k * Math.sin(t * 6), 6 * (t - a) * k, 0.3 * k + 0.15 * k * Math.cos(t * 5));
      }
      if (crossed(a + 0.01)) { Sound.clink(0.35); this._spark(home.clone(), 5); }
      for (const at of [0.4, 0.58]) if (crossed(at)) this._spark(lid.getWorldPosition(new THREE.Vector3()), 2);
      if (crossed(d)) { Sound.clink(0.7); this._bump(1); }
    };
    // shared bits for the lid tricks
    const theLid = vm.cork, lidHome = vm.group.localToWorld(vm.corkHome.clone());
    const lidR = vm.vessel.neckR * vm.group.scale.x, lidAside = lidR + 0.028;
    const putLid = (p, rx = 0, ry = 0, rz = 0, sc = 1) => {     // put the lid at world spot p
      if (!theLid) return;
      theLid.position.copy(vm.group.worldToLocal(p.clone()));
      theLid.rotation.set(rx, ry, rz);
      theLid.scale.setScalar(Math.max(0.001, sc));
      theLid.visible = sc > 0.01;
    };
    if (theLid && PRIMARY_REFILLS.includes(style)) {             // on the glass unless a show moves it
      theLid.position.copy(vm.corkHome); theLid.rotation.set(0, 0, 0); theLid.scale.setScalar(1); theLid.visible = true;
    }
    // the fumble's lid trick: POP, it jumps off the glass and crumbles into dust… and right away a
    // tiny tiny black hole opens beside the glass and slowly, slowly brings it back, bit by bit,
    // drifts it over the glass… and SNAP, on it goes at the very last moment
    const lidMagic = () => {
      if (!theLid) return;
      const POP = 0.1, GONE = 0.2, SNAP = 0.8;
      const side = lidHome.clone().add(V(lidAside, 0.04, -0.01));
      const holeAt = side.lerp(lidHome.clone().add(V(0, 0.03, 0)), ease01(span(t, 0.65, 0.78)));
      if (t >= POP && t < GONE) {                          // pop! up it jumps… and crumbles away
        const u = ease01(span(t, POP, POP + 0.05));
        putLid(lidHome.clone().add(V(0.008 * u, 0.022 * u, 0)), 0.75 * u, 2.5 * u, 0.5 * u, 1 - ease01(span(t, POP + 0.05, GONE)));
      } else if (t >= GONE && t < SNAP + 0.025) {          // slowly, slowly back out of the hole… SNAP
        const sc = ease01(span(t, 0.22, 0.74)), snap = span(t, SNAP, SNAP + 0.025), wob = 1 - snap;
        const p = holeAt.clone().add(V(0, 0.012 * sc, 0)).lerp(lidHome, snap * snap);
        putLid(p, 0.25 * Math.sin(t * 4) * wob, t * 3 * wob, 0.2 * wob, sc);
      }
      const h = ease01(span(t, 0.16, 0.22)) * (1 - ease01(span(t, SNAP, SNAP + 0.03)));
      if (h > 0) {
        this.hole.visible = true;
        this.hole.position.copy(holeAt);
        this.hole.scale.setScalar(h * (1 + 0.12 * Math.sin(t * 90)));
        this.hole.children[1].rotation.z = t * 40;
        this.hole.children[2].rotation.z = -t * 25;
      }
      const at = theLid.getWorldPosition(new THREE.Vector3());
      if (crossed(POP)) { Sound.corkPop(); this._spark(lidHome.clone(), 5); }
      if (crossed(POP + 0.05)) { Sound.spritz(0.4); this._dust(at, 16, lidR, theLid); }
      if (crossed(POP + 0.075)) this._dust(at, 10, lidR * 0.7, theLid);
      if (crossed(0.17)) Sound.boop(0.5);
      if (crossed(SNAP + 0.025)) { Sound.clink(1); this._bump(2.2); this._spark(lidHome.clone(), 6); }
    };
    // water to bend: put a droplet at `pos` (s = size, stretch = longer up/down)
    let nd = 0;
    for (const d of this.drops) d.visible = false;
    this.cloud.visible = false;
    this.hole.visible = false;
    this.wandRing.visible = false; this.ripple.visible = false;
    for (const b of this.soap) b.visible = false;
    const drop = (pos, s = 1, stretch = 1) => {
      const d = this.drops[nd++];
      if (!d) return;
      d.visible = true;
      d.position.copy(pos);
      d.scale.set(s / Math.sqrt(stretch), s * stretch, s / Math.sqrt(stretch));
    };

    // THE MAGICIAN (orbit and rain): her paw stays over on the left
    // of the screen, palm up, claws softly fluttering, and the water floats above it and flies
    // across to the glass. `lift` raises the paw, `send` tips the palm towards the glass (off you
    // go!), `curl` closes the claws, `extra` nudges the paw.
    const palm = V(jar.x - 0.29, jar.y + 0.03, jar.z + 0.03);
    const above = (h, dx = 0, dz = 0) => palm.clone().add(V(dx, h, dz));    // a spot over her palm
    const magician = (lift = 0, send = 0, curl = 0, extra) => {
      if (curl > 0) this._pose('relaxed', 'claw', Math.min(1, curl));
      else this._pose('open', 'relaxed', 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(t * 9)));
      R.rotation.set(-1.15 + 0.2 * send, Math.PI + 0.5 * send, 0.3 + 0.05 * Math.sin(t * 4));
      const at = palm.clone().add(V(0.01 * send, lift + 0.003 * Math.sin(t * 6), 0));
      reachTo(extra ? at.add(extra) : at, V(0, 0.005, -0.024));
    };

    switch (style) {
      case 'snap': {
        // (from the reference video) snap ready, low on the left, palm to you… she brings it up close and
        // upright… and holds it there, pressing harder and harder, trembling, little crackles of
        // magic at her claws, tick… tick, tick-tick… SNAP! The paw whips back into a finger gun
        // pointed at the glass, a burst of sparkles, and the glass is full. Instantly.
        const C = SNAP.at;
        const ready = V(jar.x - 0.27, jar.y + 0.005, jar.z + 0.03);
        const close = V(jar.x - 0.235, jar.y + 0.035, jar.z + 0.11);
        const gun = V(jar.x - 0.255, jar.y + 0.012, jar.z + 0.02);
        const up = ease01(span(t, 0.34, 0.44));                // the wind-up: in close and upright
        const press = ease01(span(t, 0.44, C));                // the tension builds…
        const amp = Math.pow(press, 1.6);                     // …and the trembling with it
        const tremble = t < C ? V(Math.sin(t * 260) * 0.004 * amp, Math.sin(t * 337 + 1) * 0.0028 * amp, 0) : V(0, 0, 0);
        let at;
        if (t < C) {
          at = ready.clone().lerp(close, up).add(V(0, 0.004 * Math.sin(t * 7) * (1 - up), 0.012 * press)).add(tremble);
        } else {                                               // SNAP: whips back, then settles
          const u = ease01(span(t, C, C + 0.025)), rec = Math.sin(Math.PI * span(t, C, C + 0.1));
          at = close.clone().add(V(0, 0, 0.012)).lerp(gun, u).add(V(0, 0, -0.012 * rec));
        }
        const aim = ease01(span(t, C, C + 0.02));
        R.rotation.set(-0.3 + 0.2 * up - 0.25 * aim, Math.PI, 0.5 - 0.35 * up + 0.7 * aim + 0.04 * amp * Math.sin(t * 300) * (1 - aim));
        if (t < C) this._pose('snapReady', 'snapPress', press);
        else if (t < 0.84) this._pose('snapPress', 'snapGun', span(t, C, C + 0.012));
        else this._pose('snapGun', 'relaxed', ease01(span(t, 0.84, 0.9)));
        reachTo(at, V(0, 0.01, 0));
        R.updateMatrixWorld(true);
        const tip = R.localToWorld(this._nailPos(1));
        // the shockwave ring off her claws
        if (t >= C && t < C + 0.07) {
          const s = span(t, C, C + 0.07);
          this.ripple.visible = true;
          this.ripple.position.copy(tip);
          this.ripple.rotation.set(0, 0, 0);
          this.ripple.scale.setScalar(0.006 + 0.05 * s);
          this.rippleMat.opacity = 0.9 * (1 - s);
        }
        if (crossed(0.44)) Sound.bowDraw();
        SNAP.ticks.forEach((a, i) => { if (crossed(a)) { Sound.tick(0.3 + 0.1 * i); this._spark(tip.clone(), 2); } });
        if (crossed(C)) {
          Sound.snap(); Sound.sparkle(1);
          this._spark(tip.clone(), 18, true);
          this._spark(mouth.clone(), 16);
          this._spark(jar.clone(), 10, 'water');
          this._bump(2.6);
        }
        break;
      }
      case 'file': {
        // files her claws, leaning on the glass… checks them… cocks her wrist back, trembling…
        // FLICK! claws on the glass
        const F = 0.74, spot = glass(-0.7, 0.2, 0.7);
        const lean = ease01(span(t, 0.06, 0.18)) * (1 - ease01(span(t, 0.82, 0.9)));
        const look = ease01(span(t, 0.5, 0.58)) * (1 - ease01(span(t, 0.6, 0.64)));
        const cock = ease01(span(t, 0.6, F));
        let rz = 0;
        if (t >= 0.6 && t < F) rz = 0.17 * cock + Math.sin(t * 260) * 0.015 * cock;
        else if (t >= F) rz = 0.17 - 0.62 * ease01(span(t, F, F + 0.04)) + 0.45 * ease01(span(t, 0.8, 0.88));
        this._pose('relaxed', 'claw', look);
        R.rotation.set(0.25 + look * 0.35, 0.1 - look * 0.5, rz);
        const filing = t > 0.18 && t < 0.5;
        this.file.visible = filing;
        if (filing) {
          const x = Math.sin(t * 60) * 0.025;
          this.file.position.set(x, 0.085, 0.014);
          this.file.rotation.z = 0.12;
          if (Math.sign(Math.sin(lastT * 60)) !== Math.sign(Math.sin(t * 60))) Sound.file();
        }
        touch(spot, V(0.045, -0.02, 0), V(-0.08, -0.04, 0.03), lean);   // the side of her paw rests on the glass
        if (crossed(F)) { Sound.ting(); hit(R.localToWorld(this._nailPos(1)).clone(), 8); }
        break;
      }
      case 'polish': {
        // claw tips resting on the glass while she paints one… holds it up to dry, trembling
        // (is it dry? is it?)… TING, the fresh claw taps the glass
        const T = 0.72, spot = glass(-0.85, 0.5, 0.45);
        R.rotation.set(-0.15, 0.1, -1.15);
        this._pose('relaxed');
        // her paw lies on its side (claws pointing at the glass), so the little claw is on top,
        // nearest you: that's the one she paints. The bottle stands up beside it, and the
        // brush handle points up and away (never into the paw or the glass).
        this.bottle.visible = this.brush.visible = t > 0.15 && t < 0.58;
        this.bottle.position.set(-0.07, -0.01, 0.02);
        this.bottle.rotation.set(0, 0, 1.15);
        if (this.brush.visible) {
          const nail = this._nailPos(3);
          const bottleTop = new THREE.Vector3(-0.1065, 0.0063, 0.02);
          let k;
          if (t < 0.22) k = span(t, 0.15, 0.22);                 // bottle -> nail
          else if (t < 0.48) k = 1;                               // painting strokes
          else k = 1 - span(t, 0.48, 0.56);                       // back to the bottle
          this.brush.position.lerpVectors(bottleTop, nail.clone().add(new THREE.Vector3(0, 0, 0.006)), ease01(k));
          if (t >= 0.22 && t < 0.48) this.brush.position.y += Math.sin(t * 70) * 0.006;
          this.brush.rotation.set(0, 0, 1.5);
          if (t > 0.22 && t < 0.48 && Math.sign(Math.sin(lastT * 70)) !== Math.sign(Math.sin(t * 70))) Sound.brush();
        }
        if (crossed(0.36)) { this.paintMat.color.set(this.newNail); this.paintMat.emissive.set(new THREE.Color(this.newNail).multiplyScalar(0.3)); }
        const k = t < 0.56 ? ease01(span(t, 0.06, 0.16)) : strike(0.56, 0.6, T, 0.8, 1);
        const local = tipOf(2).lerp(tipOf(3), ease01(span(t, 0.56, 0.64)));   // ring claw resting… then the painted one
        touch(spot, local, V(-0.07, 0.02, 0.03), k, shiver(0.6, T));
        if (crossed(T)) { Sound.heart(); hit(spot, 10); }
        break;
      }
      case 'drum': {
        // claws drumming on the glass, faster and faster… paw up, claws up, trembling…
        // SLAM! …thumbs up
        const S = 0.6, spot = vm.group.localToWorld(V(-vm.jarRadius * 0.55, vm.jarTopY - 0.008, JAR.z));   // the top left of the rim
        const up = ease01(span(t, 0.72, 0.82));
        R.rotation.order = 'YXZ';                                   // palm down, claws pointing at the glass
        R.rotation.set(-1.45 * (1 - up), -1.2 * (1 - up), 0.1 + up * 0.2);
        const k = t < 0.46 ? ease01(span(t, 0.05, 0.15)) : strike(0.46, 0.48, S, 0.72, 1);
        if (t < 0.72) {
          this._pose('flat');
          const ph = tt => tt * 5 + tt * tt * 9;                    // the drumroll speeds up
          this.fingers.forEach((f, i) => {
            if (t < 0.46) {
              const a = (ph(t) + (3 - i) * 0.25) % 1;               // pinky first, then ring, middle, index
              const lift = t > 0.15 ? Math.max(0, Math.sin(a * Math.PI * 2)) : 0;
              f.k.rotation.x = 0.5 * lift;
              const b = (ph(lastT) + (3 - i) * 0.25) % 1;
              if (t > 0.15 && b > 0.5 && a <= 0.5) { Sound.tap(); this._bump(0.25); }
            } else if (t < S) f.k.rotation.x = 0.25 * ease01(span(t, 0.46, S - 0.04));  // claws up…
            else f.k.rotation.x = 0;                                                    // …SLAM
          });
        } else {
          this._pose('flat', 'thumbsUp', up);
          if (crossed(0.8)) Sound.heart();
        }
        touch(spot, V(0, 0.07, -0.02), V(-0.03, 0.05, 0), k, shiver(0.48, S));
        if (crossed(S)) { Sound.knock(0.8); hit(spot, 12); }
        break;
      }

      case 'peace': {
        // a little groove with a peace sign… aims it at the glass, trembling… BOOP, both
        // fingertips on the glass, rainbow sparkles
        const B = 0.62, spot = glass(-0.55, 0.4, 0.85);
        const groove = span(t, 0.22, 0.48);
        const beat = groove > 0 && groove < 1 ? Math.sin(groove * Math.PI * 4) : 0;
        R.rotation.set(0.1, 0.15, -1.1 + beat * 0.28);
        if (t < 0.3) this._pose('relaxed', 'peace', span(t, 0.12, 0.3)); else this._pose('peace');
        const local = tipOf(0).add(tipOf(1)).multiplyScalar(0.5);
        const k = strike(0.06, 0.48, B, 0.72);
        touch(spot, local, V(-0.08, 0, 0.04), k, V(beat * 0.012, Math.abs(beat) * 0.012, 0).add(shiver(0.48, B)));
        for (const at of [0.28, 0.41]) if (crossed(at)) {
          this._spark(R.localToWorld(this._nailPos(0)).clone(), 5, true);
          this._spark(R.localToWorld(this._nailPos(1)).clone(), 5, true);
          Sound.tap();
        }
        if (crossed(B)) { Sound.boop(1.2); hit(spot, 14, true); }
        break;
      }
      case 'shades': {
        // heart sunglasses: up to the eyes, a cool nod, flipped up onto the head… then the paw
        // goes to the glass, a claw cocked under the dewclaw, trembling… FLICK! TING
        const F = 0.74, spot = glass(-0.55, 0.35, 0.85);
        const up = ease01(span(t, 0.08, 0.28));
        const flip = ease01(span(t, 0.42, 0.54));
        const low = new THREE.Vector3(-0.02, -0.13, -0.3), eyes = new THREE.Vector3(0, -0.004, -0.12), head = new THREE.Vector3(0, 0.15, -0.13);
        const gl = new THREE.Vector3().lerpVectors(low, eyes, up);
        if (flip > 0) gl.lerpVectors(eyes, head, flip);
        if (t > 0.28 && t < 0.42) gl.y += Math.sin(span(t, 0.28, 0.42) * Math.PI * 2) * 0.006;
        // the hand holds the left arm of the glasses. It stays further back (so it isn't huge)
        // but lines up on screen with the hinge, so it looks like it's holding them.
        const hinge = gl.clone().add(new THREE.Vector3(-0.066, 0.01, 0.03));
        const handAt = hinge.clone().multiplyScalar(-0.26 / hinge.z).add(new THREE.Vector3(0.012, -0.075, 0));
        this.shades.visible = show > 0.95 && t < 0.8;
        this.shades.position.copy(gl);
        this.shades.rotation.set(-0.7 * (1 - up) - flip * 0.9, 0.5 * (1 - up), 0.25 * (1 - up));
        const go = ease01(span(t, 0.52, 0.6));                     // off to the glass
        if (go <= 0) {
          this._pose('pinch');
          R.rotation.set(0.1, 0.25, 0.3);
          R.position.lerpVectors(away, handAt, show);
        } else {
          R.rotation.set(0.1 * (1 - go), 0.25 - 0.1 * go, 0.3 - 1.4 * go);
          const local = tipIn('flick', 0);
          if (t < F) this._pose('pinch', 'flickReady', go);
          else this._pose('flickReady', 'flick', span(t, F, F + 0.03));
          const k = strike(0.56, 0.62, F, 0.8);
          const at = posFor(spot.clone().addScaledVector(V(-0.07, -0.02, 0.04), 1 - k).add(shiver(0.62, F)), local);
          R.position.lerpVectors(handAt, at, go).lerp(away, 1 - show);
        }
        if (crossed(0.28)) { Sound.ting(); this._spark(new THREE.Vector3(0.05, 0.02, -0.13), 8); }
        if (crossed(0.43)) Sound.swish();
        if (crossed(F)) { Sound.ting(); hit(spot, 10); }
        break;
      }
      // ---- the clumsy ones ----
      case 'knock': {
        // knuckles to the jar: two timid knocks… hello? …three real ones… ow!
        const ow = span(t, 0.64, 0.7);
        this._pose('fist', 'open', ow);
        const hit = (at, w) => Math.max(0, 1 - Math.abs(t - at) / w);
        let gap = 0.028, lift = 0, tilt = 0, shake = 0;
        gap -= 0.028 * Math.max(hit(0.22, 0.03), hit(0.28, 0.03));
        if (t > 0.31 && t < 0.47) {                    // waits, leans back, listens
          const w = Math.sin(span(t, 0.31, 0.47) * Math.PI);
          gap += 0.02 * w; lift = 0.012 * w; tilt = 0.25 * w;
        }
        gap -= 0.028 * Math.max(hit(0.5, 0.025), hit(0.56, 0.025), hit(0.62, 0.025));
        if (t > 0.64) {                                // shakes the sore hand
          shake = Math.sin(t * 90) * 0.35 * Math.sin(span(t, 0.64, 0.84) * Math.PI);
          gap += 0.03 * ease01(ow); lift += 0.015 * ease01(ow);
        }
        R.rotation.set(0.15, 0.3, -1.25 + tilt + shake);
        reachTo(V(jar.x - jarR - 0.004 - gap, jar.y + 0.005 + lift, jar.z + 0.01).add(shiver(0.36, 0.49, 0.003)), V(0, 0.045, -0.006));
        for (const at of [0.22, 0.28]) if (crossed(at)) { Sound.knock(0.45); this._bump(0.8); }
        for (const at of [0.5, 0.56, 0.62]) if (crossed(at)) { Sound.knock(1); this._bump(2.2); }
        if (crossed(0.65)) Sound.oops();
        break;
      }
      case 'poke': {
        // finger out… almost… nope… okay… *boop*, eek! …one more tiny boop
        this._pose('point', 'claw', Math.sin(span(t, 0.48, 0.6) * Math.PI) * 0.6);
        let k;                                          // 0 = hovering back, 1 = touching the jar
        if (t < 0.26) k = 0.6 * ease01(span(t, 0.15, 0.26));
        else if (t < 0.36) k = 0.6 - 0.45 * ease01(span(t, 0.26, 0.34));        // …never mind
        else if (t < 0.44) k = 0.15 + 0.85 * ease01(span(t, 0.36, 0.44));
        else if (t < 0.5) k = 1 - 1.35 * ease01(span(t, 0.44, 0.49));           // flinch!
        else if (t < 0.62) k = -0.35 + 0.35 * ease01(span(t, 0.52, 0.62));
        else if (t < 0.7) k = Math.sin(span(t, 0.62, 0.7) * Math.PI) * 1.0;
        else k = 0;
        const touch = V(jar.x - jarR * 0.3, jar.y + jarR * 0.85, jar.z + jarR * 0.8);    // upper front of the glass
        const p = touch.clone().addScaledVector(V(-0.05, 0, 0.025), 1 - k);
        p.add(shiver(0.18, 0.44, 0.003));                                     // shaky finger, shakier and shakier
        R.rotation.set(-0.1, 0.05, -1.3);
        reachTo(p, tipOf(0));
        if (crossed(0.44)) { Sound.boop(1); this._bump(3); this._spark(touch.clone(), 6, 'water'); }
        if (crossed(0.66)) { Sound.boop(1.3); this._bump(1.2); }
        break;
      }
      case 'ribbon': {
        // a flick of the claw and a drop of water appears… she draws it out into a swirling
        // ribbon, round and round… then points at the glass: off it flows, right in
        const C = V(jar.x - 0.1, jar.y + 0.075, jar.z + 0.03);
        const loopAt = a => {
          const th = Math.PI * 0.5 + a * Math.PI * 2 * 1.2, r = 0.016 + 0.018 * a;
          return C.clone().add(V(r * Math.cos(th), r * Math.sin(th), 0.012 * Math.sin(a * Math.PI * 2)));
        };
        const E0 = loopAt(1), Q = E0.clone().lerp(mouth, 0.5).add(V(0, 0.06, 0));
        const path = s => {                            // 0..0.7 the swirl, 0.7..1 the arc into the glass
          if (s <= 0.7) return loopAt(s / 0.7);
          const u = (s - 0.7) / 0.3, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
          return V(E0.x * a + Q.x * b + mouth.x * c, E0.y * a + Q.y * b + mouth.y * c, E0.z * a + Q.z * b + mouth.z * c);
        };
        const head = RIBBON.head(t), wasHead = RIBBON.head(lastT);
        if (t >= 0.16) for (let i = 0; i < RIBBON.N; i++) {
          const s = head - i * RIBBON.gap;
          if (s < 0 || s > 1) continue;
          const p = path(s);
          p.y += 0.0025 * Math.sin(t * 28 - i * 0.9);   // a little ripple runs along it
          drop(p, (0.62 - 0.3 * i / RIBBON.N) * ease01(span(t, 0.16, 0.2)));
        }
        // her claw leads the ribbon's head while she draws it, then points it at the glass
        const send = ease01(span(t, 0.58, 0.64)) * (1 - ease01(span(t, 0.78, 0.86)));
        const anchor = tipIn('point', 0);
        this._pose('point', 'relaxed', ease01(span(t, 0.76, 0.84)));
        R.rotation.set(0.1, 0.25, -0.45 - 0.6 * send + 0.08 * Math.sin(t * 9));
        const lead = path(Math.min(head, 0.7)).add(V(-0.004, -0.011, -0.004));
        reachTo(lead.add(mouth.clone().sub(E0).normalize().multiplyScalar(0.022 * send)), anchor);
        if (crossed(0.16)) { Sound.boop(1.8); this._spark(path(0), 5, 'water'); }
        for (const a of [0.26, 0.36, 0.46]) if (crossed(a)) this._spark(path(head), 2, 'water');
        if (t > 0.18 && t < 0.56 && Math.random() < 0.2) Sound.pour(0.5);
        if (crossed(0.6)) Sound.spritz(0.5);
        if (wasHead < 1 && head >= 1) { Sound.plop(); this._bump(1.5); this._spark(mouth.clone(), 8, 'water'); }
        if (head > 1 && head < 1 + RIBBON.N * RIBBON.gap && Math.random() < 0.3) Sound.pour(0.7);
        liftLid(0.12, 0.24, 0.78, 0.87);
        break;
      }
      case 'orbit': {
        // three droplets pop out of thin air and circle over her palm like little planets, faster
        // and faster… a flick of the palm, three times: one by one they arc into the glass
        const O = above(0.045);
        const spin = u => { u = Math.max(0, u); return Math.PI * 2 * (2.2 * u + 3.5 * u * u); };
        const orbitAt = (k, tt) => {
          const a = spin(tt - 0.18) + k * Math.PI * 2 / 3;
          return O.clone().add(V(0.056 * Math.cos(a), 0.016 * Math.cos(a) + 0.004 * Math.sin(tt * 20 + k), 0.036 * Math.sin(a)));
        };
        ORBIT.born.forEach((b, k) => {
          const L = ORBIT.launch[k], land = L + ORBIT.fly;
          if (t < b || t >= land) return;
          let p, sz = 0.85;
          if (t < L) {                                 // orbiting (pops in with a little boing)
            p = orbitAt(k, t);
            const g = span(t, b, b + 0.05);
            sz *= ease01(g) * (1 + 0.4 * Math.sin(g * Math.PI));
          } else {                                     // flicked: an arc into the glass
            const u = span(t, L, land);
            p = orbitAt(k, L).lerp(mouth, u);
            p.y += 0.08 * 4 * u * (1 - u);
            sz *= 1 - 0.3 * span(u, 0.8, 1);
          }
          drop(p, sz);
        });
        let kick = 0;                                  // a little flick of the palm at each launch
        for (const L of ORBIT.launch) if (t >= L - 0.01 && t < L + 0.05) kick = Math.sin(Math.PI * span(t, L - 0.01, L + 0.05));
        magician(0.008 * kick, 0.7 * kick);
        ORBIT.born.forEach((b, k) => { if (crossed(b)) { Sound.boop(1.5 + k * 0.25); this._spark(orbitAt(k, b), 4, 'water'); } });
        ORBIT.launch.forEach((L, k) => {
          if (crossed(L)) Sound.boop(2.2);
          if (crossed(L + ORBIT.fly)) { Sound.plop(); this._bump(1 + k * 0.4); this._spark(mouth.clone(), 6, 'water'); }
        });
        liftLid(0.12, 0.24, 0.78, 0.87);
        break;
      }
      case 'rain': {
        // a tiny cloud puffs up over her palm… she wafts it across, over the glass, wiggles her
        // claws at it… and it rains right in. Then poof, it's gone.
        const A = above(0.07);
        const over = mouth.clone().add(V(0, 0.06, 0));       // where the cloud ends up
        const drag = ease01(span(t, 0.36, 0.5));
        const born = span(t, 0.24, 0.36), gone = span(t, 0.76, 0.82);
        const grow = born < 1 ? ease01(born) * (1 + 0.35 * Math.sin(born * Math.PI)) : 1;
        const raining = t > RAIN.from && t < RAIN.to;
        if (t >= 0.24 && gone < 1) {
          const k = grow * (1 - ease01(gone)), puff = raining ? 0.05 * Math.sin(t * 40) : 0;
          this.cloud.visible = true;
          this.cloud.position.copy(A).lerp(over, drag);
          this.cloud.position.y += 0.02 * Math.sin(Math.PI * drag) + (raining ? 0.003 * Math.sin(t * 13) : 0);
          this.cloud.scale.set(k * (1 + puff), k * (1 - puff), k);
          this.cloud.rotation.set(0, 0, 0.12 * Math.sin(t * 9) * (1 - drag));
        }
        const fall = over.y - 0.012 - mouth.y, frac = x => x - Math.floor(x);
        for (let k = 0; k < 12; k++) {                        // the rain
          const cyc = 0.06, u = frac((t - RAIN.from) / cyc + frac(k * 0.618));
          const at = t - u * cyc;
          if (at < RAIN.from || at > RAIN.to) continue;
          drop(over.clone().add(V((frac(k * 0.37) - 0.5) * 0.022, -0.012 - u * fall, (frac(k * 0.71) - 0.5) * 0.012)), 0.32, 2.2);
        }
        // her palm: cups the cloud as it grows, wafts it across, then wiggles her claws at it
        const waft = Math.sin(Math.PI * span(t, 0.34, 0.52));
        magician(0.006 * waft, waft, 0.6 * span(t, 0.24, 0.3) * (1 - span(t, 0.34, 0.4)));
        if (t >= 0.52 && t < 0.78) this._pose('open', 'claw', 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * 70)));
        if (crossed(0.26)) { Sound.boop(1.1); this._spark(A.clone(), 6); }
        for (const a of [0.58, 0.64, 0.7]) if (crossed(a)) { this._spark(mouth.clone(), 3, 'water'); this._bump(0.6); }
        if (raining && Math.random() < 0.35) Sound.pour(0.6);
        if (crossed(0.8)) { Sound.boop(2.4); this._spark(over.clone(), 6); }
        liftLid(0.14, 0.26, 0.8, 0.89, 0.025);   // lower: the cloud is up there
        break;
      }
      case 'yoyo': {
        // a ball of water on a thread of water: down… up… down-up… down… then she swings it over
        // the glass and lets go: plop. Meanwhile the lid flips up like a coin, hangs there
        // turning end over end, falls back, rattles and settles.
        const P = V(jar.x - 0.09, jar.y + 0.1, jar.z + 0.03);
        const over = mouth.clone().add(V(-0.004, 0.075, 0));
        const claw = P.clone().lerp(over, ease01(span(t, 0.58, 0.66)));
        let down = 0;
        for (const [a, b] of YOYO.throws) if (t >= a && t < b) {
          const u = span(t, a, b);
          down = Math.pow(Math.sin(Math.PI * u), 0.7);
          claw.y -= 0.008 * Math.sin(Math.PI * 2 * u);       // throw… yank
        }
        if (t >= 0.56) down = 0.35 * ease01(span(t, 0.56, 0.62));
        const hang = claw.clone().add(V(0, -0.012, 0));
        const thread = [];
        let ball = null;
        if (t >= 0.16 && t < YOYO.drop) {
          ball = hang.clone().add(V(0.006 * Math.sin(t * 12) * down, -0.075 * down, 0));
          for (let j = 1; j <= 5; j++) thread.push(hang.clone().lerp(ball, j / 6));
        } else if (t >= YOYO.drop && t < YOYO.land + 0.04) { // let go: the ball (and its thread) drop in
          const top = over.clone().add(V(0, -0.012, 0)), start = top.clone().add(V(0, -0.075 * 0.35, 0));
          const u = span(t, YOYO.drop, YOYO.land);
          if (u < 1) ball = start.clone().lerp(mouth, u * u);
          for (let j = 1; j <= 5; j++) {
            const d = 0.006 * (6 - j), v = span(t, YOYO.drop + d, YOYO.land + d);
            if (v < 1) thread.push(top.clone().lerp(start, j / 6).lerp(mouth, v * v));
          }
        }
        if (ball) drop(ball, 1.05 * ease01(span(t, 0.16, 0.2)));
        for (const q of thread) drop(q, 0.22);
        const anchor = tipIn('claw', 1);
        this._pose('claw', 'open', ease01(span(t, YOYO.drop - 0.01, YOYO.drop + 0.03)));
        R.rotation.set(-1, 0, 0.6);                          // palm down, arm in from the lower right
        reachTo(claw, anchor);
        // the coin flip
        if (theLid && t >= 0.14 && t < 0.88) {
          const up = 0.075, bob = 0.004 * Math.sin(t * 10) * span(t, 0.3, 0.4);
          const r74 = Math.PI * 6 + 0.44 * 8;
          let k = 0, y = 0, rx = 0, rz = 0;
          if (t < 0.3) { const u = span(t, 0.14, 0.3); k = 1 - (1 - u) * (1 - u); y = up * k; rx = u * Math.PI * 6; }
          else if (t < 0.74) { k = 1; y = up + bob; rx = Math.PI * 6 + (t - 0.3) * 8; }
          else if (t < 0.8) { const u = span(t, 0.74, 0.8); k = 1 - u * u; y = (up + bob) * k; rx = r74 + (Math.PI * 10 - r74) * u; }
          else { const u = span(t, 0.8, 0.88); rx = 0.12 * (1 - u) * Math.sin(u * 50); rz = 0.12 * (1 - u) * Math.cos(u * 50); }
          putLid(lidHome.clone().add(V(lidAside * k, y, -0.01 * k)), rx, 0, rz);
        }
        if (crossed(0.14)) { Sound.ting(); this._spark(lidHome.clone(), 4); }
        if (crossed(0.16)) { Sound.boop(1.4); this._spark(hang.clone(), 5, 'water'); }
        YOYO.throws.forEach(([a, b], i) => { if (crossed(a)) Sound.boop(0.9 + i * 0.1); if (crossed(b - 0.02)) Sound.boop(1.3); });
        if (crossed(YOYO.drop)) Sound.boop(2);
        if (crossed(YOYO.land)) { Sound.plop(); this._bump(1.8); this._spark(mouth.clone(), 8, 'water'); }
        if (crossed(0.8)) { Sound.clink(0.8); this._bump(1); }
        if (crossed(0.84)) Sound.clink(0.3);
        break;
      }
      case 'whirl': {
        // she twirls a claw and a little waterspout spins down out of it into the glass. The lid
        // gets caught in the whirl and goes round and round it like a frisbee.
        const top = mouth.clone().add(V(-0.045, 0.085, 0.012));
        const tw = ease01(span(t, 0.16, 0.24)) * (1 - ease01(span(t, 0.76, 0.84)));
        const ang = t * 38;
        const claw = top.clone().add(V(0.006 * Math.cos(ang) * tw, 0.003 * Math.sin(ang) * tw, 0.006 * Math.sin(ang) * tw));
        const axis = v => top.clone().lerp(mouth, v);
        const reach = span(t, WHIRL.from - 0.06, WHIRL.from + 0.04), drain = span(t, WHIRL.to - 0.04, WHIRL.to + 0.04);
        for (let i = 0; i < 20; i++) {
          const v = (t * 2.4 + i / 20) % 1;
          if (v > reach || v < drain) continue;
          const r = 0.003 + 0.018 * Math.pow(Math.sin(Math.PI * v), 0.8) * (0.6 + 0.4 * tw);
          const a = v * Math.PI * 5 + t * 45;
          drop(axis(v).add(V(r * Math.cos(a), 0, r * Math.sin(a))), 0.38 + 0.14 * Math.sin(v * Math.PI));
        }
        // the hypnotist: palm to you, claws rippling in a wave, her wrist circling over the spout
        this._pose('claw', 'relaxed', ease01(span(t, 0.8, 0.86)));
        this.fingers.forEach((f, i) => { const w = 0.4 * tw * Math.sin(t * 22 - i * 1.1); f.k.rotation.x -= w; f.m.rotation.x -= w; });
        R.rotation.set(-0.15, Math.PI, 0.55 + 0.12 * Math.sin(ang) * tw);
        reachTo(claw, V(0, 0.07, -0.02));
        // the frisbee lid, round and round the waterspout
        const k = ease01(span(t, 0.14, 0.26)) * (1 - ease01(span(t, 0.78, 0.86)));
        if (k > 0) {
          const a = t * 14, rr = lidR + 0.03;
          const orbit = axis(0.45).add(V(rr * Math.cos(a), 0.006 * Math.sin(a * 2), rr * 0.6 * Math.sin(a)));
          putLid(lidHome.clone().lerp(orbit, k), 0.25 * k, t * 30 * k, 0.15 * k * Math.sin(a));
        }
        if (crossed(0.14)) { Sound.clink(0.35); this._spark(lidHome.clone(), 5); }
        if (crossed(0.18)) { Sound.boop(1.5); this._spark(top.clone(), 4, 'water'); }
        if (crossed(WHIRL.from)) Sound.spritz(0.4);
        if (t > WHIRL.from && t < WHIRL.to + 0.04 && Math.random() < 0.35) Sound.pour(0.6);
        if (crossed(0.86)) { Sound.clink(0.7); this._bump(1); }
        break;
      }
      case 'wand': {
        // she curls her claws round a little ring, a shimmering film across it… sweeps it through
        // the air and a big bubble swells out, wobbles free, floats over the glass and POP: it
        // rains in. The lid floats off in a bubble of its own, until that one pops too.
        const A = V(jar.x - 0.13, jar.y + 0.06, jar.z + 0.03), B = V(jar.x - 0.08, jar.y + 0.09, jar.z + 0.03);
        const sweep = ease01(span(t, 0.3, 0.48));
        const hold = A.clone().lerp(B, sweep);
        hold.y += 0.01 * Math.sin(Math.PI * sweep);
        const ringAt = hold.clone().add(V(0.016, 0.006, 0)), ringN = V(Math.sin(0.8), 0, Math.cos(0.8));
        const anchor = tipIn('pinch', 0);
        if (t < 0.8) this._pose('open', 'pinch', ease01(span(t, 0.14, 0.22)));
        else this._pose('pinch', 'open', ease01(span(t, 0.8, 0.86)));
        R.rotation.set(0.15, 0.3, -0.5);
        reachTo(hold, anchor);
        const ring = ease01(span(t, 0.18, 0.24)) * (1 - ease01(span(t, 0.8, 0.84)));
        if (ring > 0) {
          this.wandRing.visible = true;
          this.wandRing.position.copy(ringAt);
          this.wandRing.rotation.set(0, 0.8, 0);             // the film faces us, a little turned
          this.wandRing.scale.setScalar(ring);
        }
        // the big bubble
        const WR = 0.024, over = mouth.clone().add(V(0, 0.035, 0));
        const freeAt = B.clone().add(V(0.016, 0.006, 0)).addScaledVector(ringN, WR + 0.004);
        let bub = null, br = 0;
        if (t >= 0.3 && t < WAND.free) { br = 0.004 + (WR - 0.004) * ease01(span(t, 0.3, 0.48)); bub = ringAt.clone().addScaledVector(ringN, br + 0.004); }
        else if (t >= WAND.free && t < WAND.pop) {
          const u = span(t, WAND.free, WAND.pop);
          br = WR;
          bub = freeAt.clone().lerp(over, ease01(u));
          bub.y += 0.012 * Math.sin(Math.PI * u) + 0.003 * Math.sin(t * 20);
        }
        if (bub) {
          const sb = this.soap[0], sq = 0.06 * Math.sin(t * 30);
          sb.visible = true;
          sb.position.copy(bub);
          sb.scale.set(br * (1 + sq), br * (1 - sq), br);
        }
        if (t >= WAND.pop && t < WAND.pop + 0.09) for (let j = 0; j < 8; j++) {   // POP: it rains in
          const a = (j / 8) * Math.PI * 2, u = span(t, WAND.pop + 0.004 * j, WAND.pop + 0.05 + 0.004 * j);
          if (u >= 1) continue;
          drop(over.clone().add(V(Math.cos(a) * WR * 0.8, Math.sin(a) * WR * 0.6, Math.sin(a) * 0.006)).lerp(mouth, u * u), 0.45);
        }
        // the lid in its own bubble
        if (theLid && t >= 0.14 && t < 0.84) {
          const bobAt = tt => lidHome.clone().add(V(lidAside + 0.012, 0.072 + 0.006 * Math.sin(tt * 11), -0.04));
          if (t < 0.78) {
            const k = ease01(span(t, 0.14, 0.28)), p = lidHome.clone().lerp(bobAt(t), k);
            putLid(p, 0.2 * k * Math.sin(t * 5), t * 2 * k, 0.15 * k * Math.cos(t * 4));
            const sb = this.soap[1], r = (lidR * 1.25 + 0.008) * ease01(span(t, 0.14, 0.2)), sq = 0.04 * Math.sin(t * 25);
            sb.visible = true;
            sb.position.copy(p);
            sb.scale.set(r * (1 + sq), r * (1 - sq), r);
          } else {
            const u = span(t, 0.78, 0.82), from = bobAt(0.78), w = 1 - u;
            const p = V(from.x + (lidHome.x - from.x) * ease01(u), from.y + (lidHome.y - from.y) * u * u, from.z + (lidHome.z - from.z) * u);
            putLid(p, 0.2 * Math.sin(0.78 * 5) * w, 0.78 * 2 * w, 0.15 * Math.cos(0.78 * 4) * w);
          }
        }
        if (crossed(0.14)) Sound.boop(1);
        if (crossed(0.18)) { Sound.boop(1.3); this._spark(ringAt.clone(), 4, 'water'); }
        if (t > 0.3 && t < 0.48 && Math.random() < 0.2) Sound.pour(0.4);
        if (crossed(WAND.free)) Sound.boop(1.8);
        if (crossed(WAND.pop)) { Sound.plop(); Sound.spritz(0.5); this._spark(over.clone(), 10, 'water'); }
        if (crossed(WAND.pop + 0.06)) this._bump(1.6);
        if (crossed(0.78)) { Sound.snap(); this._spark(lidHome.clone().add(V(lidAside + 0.012, 0.072, -0.04)), 8, 'water'); }
        if (crossed(0.82)) { Sound.clink(0.8); this._bump(1.2); }
        break;
      }
      case 'dribble': {
        // she dribbles a ball of water like a basketball (a ripple on the air at each bounce)
        // while the lid swings up behind the glass like a backboard… she shoots: off the board… in!
        const D = V(jar.x - 0.1, jar.y + 0.06, jar.z + 0.035), floorY = jar.y - 0.03, BR = 0.0145;
        const board = lidHome.clone().add(V(0.004, 0.06, -0.035));
        const bank = board.clone().add(V(0, -0.008, 0.008 + BR));
        const a0 = 0.2, per = (DRIBBLE.gather - a0) / DRIBBLE.bounces;
        let ball = null;
        const palm = D.clone();
        if (t >= 0.16 && t < a0) ball = D.clone().add(V(0, -BR, 0));
        else if (t >= a0 && t < DRIBBLE.gather) {
          const k = Math.floor((t - a0) / per), u = (t - a0) / per - k;
          ball = V(D.x, floorY + BR + (D.y - 2 * BR - floorY) * Math.pow(Math.abs(2 * u - 1), 0.85), D.z);
          palm.y = Math.min(D.y, Math.max(D.y - 0.012, ball.y + BR));
        } else if (t >= DRIBBLE.gather && t < DRIBBLE.shoot) {
          palm.y -= 0.008 * Math.sin(Math.PI * span(t, DRIBBLE.gather, DRIBBLE.shoot));
          ball = palm.clone().add(V(0, -BR, 0));
        } else if (t >= DRIBBLE.shoot && t < DRIBBLE.bank) {   // the shot…
          const u = span(t, DRIBBLE.shoot, DRIBBLE.bank);
          ball = D.clone().add(V(0, -BR, 0)).lerp(bank, u);
          ball.y += 0.05 * 4 * u * (1 - u);
        } else if (t >= DRIBBLE.bank && t < DRIBBLE.land) {    // …off the board… in!
          const u = span(t, DRIBBLE.bank, DRIBBLE.land);
          ball = bank.clone().lerp(mouth, u * u);
        }
        if (ball) drop(ball, 1.1 * ease01(span(t, 0.16, 0.2)));
        // a ripple on the air where it bounces
        const m = Math.floor((t - a0) / per - 0.5), th = a0 + (m + 0.5) * per;
        if (m >= 0 && m < DRIBBLE.bounces && t - th < 0.07) {
          const s = span(t, th, th + 0.07);
          this.ripple.visible = true;
          this.ripple.position.set(D.x, floorY, D.z);
          this.ripple.rotation.set(Math.PI / 2, 0, 0);
          this.ripple.scale.setScalar(0.006 + 0.03 * s);
          this.rippleMat.opacity = 0.8 * (1 - s);
        }
        // her paw: palm down on the ball… then the shot
        const shot = ease01(span(t, DRIBBLE.shoot - 0.02, DRIBBLE.shoot + 0.03)) * (1 - ease01(span(t, 0.76, 0.84)));
        this._pose('flat', 'flick', shot);
        R.rotation.set(-1 + 0.6 * shot, 0, 0.65 - 0.4 * shot);   // palm down, arm in from the lower right
        reachTo(palm.add(V(0.01 * shot, 0.015 * shot, 0)), V(0, 0.03, -0.02));
        // the backboard lid
        const k = ease01(span(t, 0.14, 0.26)) * (1 - ease01(span(t, 0.78, 0.86)));
        if (k > 0) {
          const j = t > DRIBBLE.bank ? Math.sin(Math.PI * span(t, DRIBBLE.bank, DRIBBLE.bank + 0.04)) : 0;
          putLid(lidHome.clone().lerp(board, k).add(V(0, 0, -0.006 * j)), (Math.PI / 2) * k + 0.15 * j, 0, 0.05 * Math.sin(t * 7) * k);
        }
        for (let i = 0; i < DRIBBLE.bounces; i++) if (crossed(a0 + (i + 0.5) * per)) { Sound.boop(0.7); this._spark(V(D.x, floorY, D.z), 3, 'water'); }
        if (crossed(0.14)) { Sound.clink(0.35); this._spark(lidHome.clone(), 4); }
        if (crossed(0.16)) { Sound.boop(1.4); this._spark(D.clone(), 4, 'water'); }
        if (crossed(DRIBBLE.shoot)) Sound.boop(2);
        if (crossed(DRIBBLE.bank)) { Sound.clink(1); this._spark(bank.clone(), 5); }
        if (crossed(DRIBBLE.land)) { Sound.plop(); Sound.spritz(0.4); this._bump(1.8); this._spark(mouth.clone(), 8, 'water'); }
        if (crossed(0.86)) { Sound.clink(0.7); this._bump(1); }
        break;
      }
      case 'lasso': {
        // the lid floats off and tries to sneak away… she spins a lasso of water over her paw,
        // throws it, catches the lid, reels it back over the glass, and the lasso drains into it
        const S = V(jar.x - 0.095, jar.y + 0.12, jar.z + 0.02);
        const claw0 = V(jar.x - 0.1, jar.y + 0.085, jar.z + 0.03);
        const back = lidHome.clone().add(V(0, 0.05, 0));
        const away = tt => lidHome.clone().add(V(lidAside + 0.03 * span(tt, 0.24, 0.5) + 0.004 * Math.sin(tt * 17), 0.05 + 0.006 * Math.sin(tt * 9), -0.015));
        const lidAt = tt => {
          if (tt < LASSO.catch) return lidHome.clone().lerp(away(tt), ease01(span(tt, 0.12, 0.24)));
          if (tt < LASSO.reel) return away(LASSO.catch).lerp(back, ease01(span(tt, LASSO.catch, LASSO.reel)));
          return back.clone().lerp(lidHome, Math.pow(span(tt, 0.74, 0.8), 2));
        };
        const lp = lidAt(t);
        if (t >= 0.12 && t < 0.8) putLid(lp, 0.15 * Math.sin(t * 8), t < LASSO.catch ? 0.3 * Math.sin(t * 6) : 0, 0.1 * Math.sin(t * 11) * (t < LASSO.reel ? 1 : 0));
        // the claw twirls the lasso, throws it, reels it in
        const twirl = ease01(span(t, 0.16, 0.22)) * (1 - span(t, LASSO.throw, LASSO.throw + 0.03));
        const claw = claw0.clone().add(V(0.005 * Math.cos(t * 30) * twirl, 0, 0.005 * Math.sin(t * 30) * twirl));
        claw.x += 0.015 * Math.sin(Math.PI * span(t, LASSO.throw - 0.02, LASSO.catch)) - 0.02 * Math.sin(Math.PI * span(t, LASSO.catch, LASSO.reel + 0.04));
        let c, r;
        if (t < LASSO.throw) { c = S.clone().add(V(0, 0.004 * Math.sin(t * 15), 0)); r = 0.035 * ease01(span(t, 0.16, 0.26)); }
        else if (t < LASSO.catch) {
          const u = span(t, LASSO.throw, LASSO.catch);
          c = S.clone().lerp(lp, ease01(u)).add(V(0, 0.02 * Math.sin(Math.PI * u), 0));
          r = 0.035 + (lidR + 0.006 - 0.035) * ease01(u);
        } else { c = lp.clone(); r = lidR + 0.006; }
        const spin = t * 30 - Math.max(0, t - LASSO.catch) * 24;
        const loop = [];
        for (let j = 0; j < 14; j++) {
          const a = spin + (j / 14) * Math.PI * 2;
          loop.push(c.clone().add(V(r * Math.cos(a), 0.15 * r * Math.sin(a), 0.55 * r * Math.sin(a))));
        }
        const knot = c.clone().add(V(-r, 0, 0)), rope = [];
        for (let j = 1; j <= 5; j++) { const f = j / 6; rope.push(claw.clone().lerp(knot, f).add(V(0, -0.006 * Math.sin(Math.PI * f), 0))); }
        if (t >= 0.16) [...loop, ...rope].forEach((q, j) => {
          if (t >= LASSO.reel) {                                // the lasso drains into the glass
            const u = span(t, LASSO.reel + 0.003 * j, LASSO.drain - 0.01 + 0.003 * j);
            if (u >= 1) return;
            q = q.clone().lerp(mouth, u * u);
          }
          drop(q, j < 14 ? 0.4 : 0.3);
        });
        // the cowboy: a fist round the rope, her wrist swinging it round and round
        this._pose('fist', 'relaxed', ease01(span(t, 0.78, 0.84)));
        const swing = t * 30;
        R.rotation.set(-0.5 + 0.25 * Math.sin(swing) * twirl, 0.3 * Math.cos(swing) * twirl, -0.5 + 0.3 * Math.sin(Math.PI * span(t, LASSO.catch, LASSO.reel)));
        reachTo(claw.clone().add(V(0.006 * Math.cos(swing) * twirl, 0, 0.006 * Math.sin(swing) * twirl)), V(0, 0.045, -0.005));
        if (crossed(0.12)) { Sound.clink(0.35); this._spark(lidHome.clone(), 4); }
        if (crossed(0.3)) Sound.boop(2.6);                       // tee-hee, the lid's off
        if (crossed(0.16)) { Sound.boop(1.3); this._spark(claw0.clone(), 4, 'water'); }
        if (crossed(LASSO.throw)) Sound.spritz(0.5);
        if (crossed(LASSO.catch)) { Sound.clink(0.6); Sound.boop(1.6); this._spark(lp.clone(), 5, 'water'); }
        if (crossed(LASSO.reel)) Sound.plop();
        if (t > LASSO.reel && t < LASSO.drain && Math.random() < 0.4) Sound.pour(0.7);
        if (crossed(LASSO.drain)) { this._bump(1.6); this._spark(mouth.clone(), 6, 'water'); }
        if (crossed(0.8)) { Sound.clink(0.8); this._bump(1); }
        break;
      }
      case 'pearls': {
        // a string of water pearls pops into the air, one by one, from the glass out to her paw…
        // she takes the end, tugs it tight… and the whole string zips into the glass like a noodle,
        // pulling her paw along. The lid hinges open like a jewellery box and claps shut at the end.
        const N = PEARLS.N;
        const E = V(jar.x - 0.125, jar.y + 0.065, jar.z + 0.035);
        const tug = ease01(span(t, 0.38, 0.48));
        const end = E.clone().add(V(-0.012 * tug, 0.004 * tug, 0)).add(shiver(0.4, 0.5, 0.004));
        const sag = 0.03 * (1 - 0.7 * tug);
        const curve = f => mouth.clone().lerp(end, f).add(V(0, -sag * Math.sin(Math.PI * f) + 0.006 * f, 0));
        const slide = PEARLS.slide(t), wasSlide = PEARLS.slide(lastT);
        for (let i = 0; i < N; i++) {
          const f0 = i / (N - 1), f = f0 - slide, born = 0.14 + 0.02 * i;
          if (t < born || f < 0) continue;
          const g = span(t, born, born + 0.03);
          drop(curve(f), 0.55 * ease01(g) * (1 + 0.4 * Math.sin(Math.PI * g)));
          if (wasSlide < f0 && slide >= f0) { Sound.plop(); this._spark(mouth.clone(), 2, 'water'); }
        }
        // her pinky holds the end pearl and gets pulled along… lets go
        const fEnd = Math.max(1 - slide, 0.42), letGo = ease01(span(1 - slide, 0.46, 0.4));
        // pinky up, like a teacup: the end pearl hooked on her pinky claw
        const anchor = tipIn('pinky', 3);
        if (t < 0.36) this._pose('open', 'pinky', ease01(span(t, 0.3, 0.36)));
        else this._pose('pinky', 'open', Math.max(letGo, ease01(span(t, 0.8, 0.86))));
        R.rotation.set(0.15, 0.3, -0.5 + 0.2 * letGo);
        reachTo(curve(fEnd).add(V(-0.004, 0.004, 0.004)).add(V(-0.015 * letGo, 0.01 * letGo, 0)), anchor);
        // the jewellery-box lid: hinged on the far side of the rim
        if (theLid) {
          const r = vm.vessel.neckR;
          const th = 1.9 * ease01(span(t, 0.12, 0.2)) * (1 - Math.pow(span(t, 0.78, 0.8), 2)) + 0.06 * Math.sin(t * 20) * span(t, 0.2, 0.3) * (1 - span(t, 0.7, 0.78));
          theLid.position.copy(vm.corkHome).add(V(r - r * Math.cos(th), r * Math.sin(th), 0));
          theLid.rotation.set(0, 0, -th);
        }
        for (let i = 0; i < N; i++) if (crossed(0.14 + 0.02 * i)) Sound.boop(1.3 + 0.07 * i);
        if (crossed(0.12)) { Sound.tap(); Sound.clink(0.3); }
        if (crossed(0.36)) Sound.tap();
        if (crossed(0.4)) Sound.oops();
        if (crossed(0.72)) this._bump(1.6);
        if (crossed(0.8)) { Sound.clink(1); this._bump(1.5); this._spark(lidHome.clone(), 5); }
        break;
      }
      case 'fumble': {
        // a wobbly water bubble bounces on the back of her hand… whoa… got it… in!
        this._pose('flat', 'claw', span(t, 0.44, 0.5) * (1 - span(t, 0.55, 0.62)) * 0.5);
        const base = V(jar.x - 0.11, jar.y + 0.04, jar.z + 0.02);
        const C = [                                     // [when it touches the hand, where, how high it then bounces]
          [0.22, V(0, 0, 0), 0.032],
          [0.31, V(0.022, 0.004, 0), 0.036],
          [0.4, V(-0.024, -0.004, 0.004), 0.075],      // oops, way too high
          [0.53, V(0.004, -0.035, 0.012), 0.06],       // low scramble save, then a flick to the jar
        ].map(([at, off, h]) => ({ at, p: base.clone().add(off), h }));
        const LAND = 0.63, into = V(jar.x, jar.y + jarR + 0.012, jar.z);
        // her hand chases the next spot the bubble will come down on, always a bit late
        let hand = C[0].p.clone();
        for (let i = 0; i < C.length - 1; i++) if (t >= C[i].at && t < C[i + 1].at) {
          const u = span(t, C[i].at, C[i + 1].at);
          hand = C[i].p.clone().lerp(C[i + 1].p, ease01(span(u, i === 2 ? 0.55 : 0.3, 1)));
          hand.y -= 0.006 * Math.sin(Math.PI * span(u, 0, 0.25));            // gives a little with each bounce
        }
        if (t >= C[3].at) {
          hand = C[3].p.clone();
          hand.y += 0.012 * Math.sin(Math.PI * span(t, 0.53, 0.58));         // flick!
          hand.y += 0.02 * ease01(span(t, 0.64, 0.72));                      // phew
        }
        R.rotation.set(-1.3, 0.1, 0.1 + (t > 0.2 && t < LAND ? Math.sin(t * 40) * 0.12 : 0));   // balancing act
        reachTo(hand, V(0, 0.035, 0.012));

        let b = null;
        const top = 0.014;                              // the bubble sits on her hand, not in it
        if (t >= 0.13 && t < C[0].at) {
          const u = span(t, 0.13, C[0].at);
          b = C[0].p.clone().add(V(0, top + 0.07 * (1 - u * u), 0));
        }
        for (let i = 0; i < C.length; i++) {
          const to = i < C.length - 1 ? C[i + 1] : { at: LAND, p: into.clone().sub(V(0, top, 0)) };
          if (t >= C[i].at && t < to.at) {
            const u = span(t, C[i].at, to.at);
            b = C[i].p.clone().lerp(to.p, u);
            b.y += top + C[i].h * 4 * u * (1 - u);
          }
        }
        this.bubble.visible = !!b;
        if (b) {
          this.bubble.position.copy(b);
          const sq = Math.sin(t * 50) * 0.08;
          const sink = 1 - span(t, LAND - 0.03, LAND);
          this.bubble.scale.set((1 + sq) * sink, (1 - sq) * sink, sink);
        }
        if (crossed(0.13)) { this._spark(C[0].p.clone().add(V(0, 0.08, 0)), 6, 'water'); Sound.plop(); }
        C.forEach((c, i) => { if (crossed(c.at)) Sound.boop(1.5 + i * 0.12); });
        if (crossed(0.42)) Sound.oops();
        if (crossed(LAND)) { Sound.plop(); this._spark(into.clone(), 10, 'water'); this._bump(2); }
        lidMagic();
        break;
      }
      case 'cork': {
        // pinch the cork… it's stuck… fingers slip! …twist, tug… POP! catch it! …put it back
        const cork = vm.cork, home = vm.corkHome;
        const W = p => vm.group.localToWorld(p.clone());
        const homeW = W(home);
        const POP = 0.53, CATCH = 0.63;
        const flyTo = home.clone().add(V(-0.08, 0.1, 0.04));
        let at, hold = 1, twist = 0;                   // at = the cork-grip point for her fingertips
        cork.position.copy(home);
        cork.rotation.set(0, 0, 0);
        if (t < 0.24) at = homeW.clone().add(V(-0.05, 0.035, 0.03).multiplyScalar(1 - ease01(span(t, 0.12, 0.24))));
        else if (t < 0.34) {                            // tug… it won't budge
          cork.position.y += 0.004 * span(t, 0.24, 0.34);
          at = W(cork.position).add(V(0, Math.sin(t * 120) * 0.0012, 0));
        } else if (t < 0.46) {                          // slips off! …tries again
          const slip = ease01(span(t, 0.34, 0.38)) * (1 - ease01(span(t, 0.4, 0.46)));
          at = homeW.clone().add(V(-0.01 * slip, 0.035 * slip, 0.01 * slip));
          hold = 1 - slip;
        } else if (t < POP) {                           // twist and tug
          const k = span(t, 0.46, POP);
          twist = Math.sin(t * 60) * (0.32 + 0.09 * k);  // a bit harder…
          cork.position.y += 0.01 * k;
          cork.rotation.y = twist * 1.5;
          at = W(cork.position).add(shiver(0.46, POP, 0.003));
        } else if (t < CATCH) {                         // POP! it flies… grab it!
          const u = span(t, POP, CATCH);
          cork.position.lerpVectors(home, flyTo, u);
          cork.position.y += 0.12 * 4 * u * (1 - u);
          cork.rotation.set(u * 9, 0, u * 4);
          const recoil = homeW.clone().add(V(-0.015, 0.03, 0.015));
          at = recoil.lerp(W(cork.position), ease01(span(u, 0.35, 1)));
          hold = span(u, 0.8, 1);
        } else if (t < 0.8) {                           // got it… back in you go
          const flown = W(flyTo);
          at = flown.lerp(homeW, ease01(span(t, 0.66, 0.78)));
          cork.position.copy(vm.group.worldToLocal(at.clone()));
        } else {                                        // done, let go
          at = homeW.clone().add(V(-0.01, 0.03 * ease01(span(t, 0.8, 0.86)), 0.01));
          hold = 1 - span(t, 0.8, 0.84);
        }
        this._pose('pinch', 'open', 1 - hold);
        R.rotation.set(0.15, 0.35 + twist, -0.45);
        reachTo(at.add(V(-0.004, 0.006, 0.004)), tipOf(0));
        if (crossed(0.34)) Sound.oops();
        if (crossed(POP)) { Sound.corkPop(); this._spark(homeW.clone(), 10, 'water'); this._bump(2.5); }
        if (crossed(CATCH)) Sound.tap();
        if (crossed(0.78)) { Sound.tap(); this._bump(0.8); }
        break;
      }
    }
  }
}
