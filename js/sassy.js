// Sassy refill animations: a left hand with fresh hot-pink nails, a gold ring and a
// bracelet does a little show while your blaster refills. One is picked at random
// each time (the classic soap-bottle pour is the other option, in weapons.js).
//   snap   — snaps her fingers, sparkles, the jar fills up
//   file   — files her nails, checks them, flicks her wrist
//   polish — paints one nail a fresh colour and admires it
//   drum   — drums her nails on the jar, then thumbs up
//   peace  — peace sign, a little groove, rainbow sparkles
//   shades — puts on heart-shaped sunglasses (yes, over your eyes), then flips them up
// The clumsy ones (a bit hesitant, like she's not quite sure how this works):
//   knock  — two timid knocks on the jar, waits… three real knocks. Ow.
//   poke   — reaches for the jar, chickens out, finally pokes it and flinches
//   fumble — juggles a wobbly water bubble before it lands in the jar
//   cork   — the cork is stuck, her fingers slip, then POP and she scrambles to catch it

const SASSY_STYLES = ['snap', 'file', 'polish', 'drum', 'peace', 'shades', 'knock', 'poke', 'fumble', 'cork'];
const REFILL_WEIGHTS = { polish: 1.6 };          // everything else is 1

// A random refill show, never the same one twice in a row.
function pickRefillStyle(prev) {
  const styles = ['pour', ...SASSY_STYLES].filter(st => st !== prev);
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
  thumbsUp:  { c: [1.5, 1.5, 1.5, 1.5], th: -0.4 },
  peace:     { c: [0, 0, 1.5, 1.5], th: 0.95 },
  pinch:     { c: [0.7, 0.9, 1.25, 1.4], th: 0.55 },
  fist:      { c: [1.5, 1.5, 1.5, 1.5], th: 0.9 },
  point:     { c: [0, 1.45, 1.5, 1.5], th: 0.9 },
  claw:      { c: [0.9, 0.95, 1, 1.05], th: 0.5 },
};
const NAIL_COLORS = [0xffd23f, 0x7fffd4, 0xc77dff, 0x6fb7ff, 0xff6f61];

class SassyHand {
  constructor(camera) {
    this.camera = camera;
    const lam = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
    // a big fluffy paw: white fur, pink beans, pink painted claws, a gold bracelet + ring
    const furTex = Textures.noisyTexture(0xffffff, 14, 8, 41);
    const skin = new THREE.MeshLambertMaterial({ map: furTex, color: BICHON.fur, emissive: DOG_GLOW });
    const fluff = new THREE.MeshLambertMaterial({ map: furTex, color: BICHON.fur, emissive: DOG_GLOW, flatShading: true });
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
    if (!PUFF_GEO) PUFF_GEO = new THREE.IcosahedronGeometry(1, 1);
    const puff = (parent, r, x, y, z) => { const m = new THREE.Mesh(PUFF_GEO, fluff); m.scale.setScalar(r); m.position.set(x, y, z); parent.add(m); return m; };
    const piv = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    // the paw: toes point up, the back of the paw (with the claws) faces you, beans face away
    this.root = new THREE.Group();
    this.root.scale.setScalar(0.75);                  // the left paw is a bit smaller than the right
    this.root.visible = false;
    camera.add(this.root);
    const R = this.root;
    add(R, 0.08, 0.072, 0.04, skin, 0, 0, 0);                         // the chubby paw
    add(R, 0.038, 0.03, 0.006, bean, 0, -0.008, -0.021);              // big pad
    for (const [x, y, r] of [[0.03, 0.012, 0.016], [-0.03, 0.014, 0.017], [0, -0.016, 0.018], [0.018, -0.02, 0.014], [-0.022, -0.012, 0.015]]) {
      puff(R, r, x, y, 0.017);                                        // fluff on the back of the paw
    }
    this.fingers = [];
    const xs = [0.027, 0.009, -0.009, -0.027], lens = [1, 1.1, 1, 0.85];
    xs.forEach((x, i) => {
      const k = piv(R, x, 0.0325, 0);
      add(k, 0.02, 0.03 * lens[i], 0.026, skin, 0, 0.015 * lens[i], 0);       // fat toe
      const m = piv(k, 0, 0.03 * lens[i], 0);
      add(m, 0.019, 0.024 * lens[i], 0.025, skin, 0, 0.012 * lens[i], 0);
      puff(m, 0.01, 0, 0.004, 0.012);                                         // a tuft on each toe
      add(m, 0.013, 0.011, 0.005, bean, 0, 0.01 * lens[i], -0.013);           // toe bean
      const nail = add(m, 0.011, 0.014, 0.006, i === 0 ? this.paintMat : this.nailMat, 0, 0.02 * lens[i], 0.01);   // painted claw
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
    add(R, 0.078, 0.05, 0.044, skin, 0, -0.066, 0);                   // fluffy forearm
    for (let k = 0; k < 7; k++) {                                     // fur bursting out of the sleeve
      const a = (k / 7) * Math.PI * 2;
      puff(R, 0.016, Math.cos(a) * 0.04, -0.092, Math.sin(a) * 0.022);
    }
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

    this.props = [this.file, this.bottle, this.brush, this.shades, this.bubble];
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

  hide() {
    this.root.visible = false;
    for (const p of this.props) p.visible = false;
    this._tick(1);                                 // clear leftover sparkles
    this.style = null;
    this.wobble = this.wobV = 0;
    this._corkHome();
  }

  _corkHome() { if (this.vm && this.vm.cork) { this.vm.cork.position.copy(this.vm.corkHome); this.vm.cork.rotation.set(0, 0, 0); } }

  // give the jar a nudge
  _bump(v) { this.wobV += v; }

  // How full the jar should be at time t (0..1) of this show. It always rises
  // gradually, so you can watch the water come up.
  fill(style, t) {
    if (style === 'snap') return ease01(span(t, 0.47, 0.78));
    if (style === 'drum') return Math.round(span(t, 0.15, 0.75) * 8) / 8;   // a bit fuller with each tap
    if (style === 'shades') return ease01(span(t, 0.2, 0.75));
    if (style === 'knock') return 0.12 * span(t, 0.2, 0.3) + 0.88 * ease01(span(t, 0.48, 0.8));
    if (style === 'poke') return 0.1 * span(t, 0.25, 0.4) + 0.9 * ease01(span(t, 0.44, 0.8));
    if (style === 'fumble') return 0.15 * span(t, 0.2, 0.52) + 0.85 * ease01(span(t, 0.62, 0.82));
    if (style === 'cork') return ease01(span(t, 0.53, 0.8));
    return ease01(span(t, 0.15, 0.8));
  }

  play(style, t, dt, vm) {
    const R = this.root;
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
    const sdt = Math.min(dt, 0.05);                   // jar jiggle: a springy wobble
    this.wobV += (-140 * this.wobble - 8 * this.wobV) * sdt;
    this.wobble += this.wobV * sdt;

    // slide in from the bottom-left, slide out at the end
    const show = ease01(span(t, 0, 0.15)) * (1 - ease01(span(t, 0.85, 1)));
    const away = new THREE.Vector3(-0.28, -0.32, -0.36);
    const place = (x, y, z, rx, ry, rz) => {
      R.position.lerpVectors(away, this._v.set(x, y, z), show);
      R.rotation.set(rx, ry, rz);
    };
    const crossed = at => lastT < at && t >= at;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    // where the jar is right now (the camera sits at the origin, so this is screen space)
    vm.group.updateMatrixWorld(true);
    const jar = vm.group.localToWorld(vm.jarCenter.clone());
    const jarR = vm.jarRadius * vm.group.scale.x;
    // put the hand so that `local` (a point on the hand) sits on `target`
    const reachTo = (target, local) => {
      R.position.set(0, 0, 0);
      R.updateMatrixWorld(true);
      const at = target.clone().sub(R.localToWorld(local.clone()));
      R.position.lerpVectors(away, at, show);
    };
    const tipOf = i => this._nailPos(i).add(V(0, 0.006, -0.004));

    switch (style) {
      case 'snap': {
        place(-0.07, -0.06, -0.34, 0, 0.2, 0.15 + Math.sin(t * 20) * 0.03 * (t < 0.45 ? 1 : 0));
        if (t < 0.42) this._pose('snapReady');
        else if (t < 0.48) this._pose('snapReady', 'snapped', span(t, 0.42, 0.48));
        else if (t < 0.65) this._pose('snapped');
        else this._pose('snapped', 'open', span(t, 0.65, 0.8));
        if (crossed(0.47)) {
          const tip = this._nailPos(1);
          this._spark(R.localToWorld(tip).clone(), 14);
          Sound.snap();
        }
        if (t > 0.48 && t < 0.75) R.rotation.z += Math.sin(span(t, 0.48, 0.75) * Math.PI) * 0.35;   // little flourish
        break;
      }
      case 'file': {
        place(-0.05, -0.05, -0.33, 0.25, 0.1, 0);
        this._pose('relaxed');
        const filing = t > 0.18 && t < 0.62;
        this.file.visible = filing;
        if (filing) {
          const x = Math.sin(t * 60) * 0.025;
          this.file.position.set(x, 0.085, 0.014);
          this.file.rotation.z = 0.12;
          if (Math.sign(Math.sin(lastT * 60)) !== Math.sign(Math.sin(t * 60))) Sound.file();
        }
        if (t > 0.62) {                               // check the nails… then a flick of the wrist
          const look = ease01(span(t, 0.62, 0.7));
          const flick = t > 0.72 && t < 0.82 ? Math.sin(span(t, 0.72, 0.82) * Math.PI * 2) : 0;
          this._pose('relaxed', 'claw', look * (1 - ease01(span(t, 0.72, 0.76))));
          R.rotation.set(0.25 + look * 0.35, 0.1 - look * 0.5, flick * 0.45);
          if (crossed(0.74)) {
            for (const i of [0, 1, 2]) this._spark(R.localToWorld(this._nailPos(i)).clone(), 3);
            Sound.ting();
          }
        }
        break;
      }
      case 'polish': {
        place(-0.05, -0.05, -0.33, 0.2, 0.15 + (t > 0.62 ? Math.sin(t * 25) * 0.25 : 0), 0);
        this._pose('relaxed');
        const painting = t > 0.2 && t < 0.62;
        this.bottle.visible = this.brush.visible = t > 0.15 && t < 0.7;
        if (this.brush.visible) {
          const nail = this._nailPos(0);
          const bottleTop = new THREE.Vector3(0.075, 0.03, 0.015);
          let k;
          if (t < 0.25) k = span(t, 0.15, 0.25);                 // bottle -> nail
          else if (t < 0.55) k = 1;                               // painting strokes
          else k = 1 - span(t, 0.55, 0.65);                       // back to the bottle
          this.brush.position.lerpVectors(bottleTop, nail.clone().add(new THREE.Vector3(0, 0, 0.006)), ease01(k));
          if (t >= 0.25 && t < 0.55) this.brush.position.y += Math.sin(t * 70) * 0.006;
          this.brush.rotation.z = -0.5;
          if (painting && Math.sign(Math.sin(lastT * 70)) !== Math.sign(Math.sin(t * 70))) Sound.brush();
        }
        if (crossed(0.4)) { this.paintMat.color.set(this.newNail); this.paintMat.emissive.set(new THREE.Color(this.newNail).multiplyScalar(0.3)); }
        if (crossed(0.66)) { this._spark(R.localToWorld(this._nailPos(0)).clone(), 8); Sound.heart(); }
        break;
      }
      case 'drum': {
        // palm down over the jar, nails tapping one after another
        const up = ease01(span(t, 0.75, 0.85));
        place(0.13 - up * 0.17, -0.085 + up * 0.03, -0.3, -1.45 * (1 - up), 0.1, 0.1 + up * 0.2);
        if (t < 0.75) {
          this._pose('flat');
          const rolling = t > 0.15;
          this.fingers.forEach((f, i) => {
            const ph = ((t * 7) + (3 - i) * 0.25) % 1;           // pinky first, then ring, middle, index
            const lift = rolling ? Math.max(0, Math.sin(ph * Math.PI * 2)) : 0;
            f.k.rotation.x = 0.5 * lift;
            const prevPh = ((lastT * 7) + (3 - i) * 0.25) % 1;
            if (rolling && prevPh > 0.5 && ph <= 0.5) Sound.tap();
          });
        } else {
          this._pose('flat', 'thumbsUp', up);
          if (crossed(0.8)) Sound.heart();
        }
        break;
      }

      case 'peace': {
        // peace sign + a little groove; rainbow sparkles on the beat
        const groove = span(t, 0.3, 0.8);
        const beat = groove > 0 && groove < 1 ? Math.sin(groove * Math.PI * 4) : 0;
        place(-0.06 + beat * 0.012, -0.045 + Math.abs(beat) * 0.012, -0.32, 0.1, 0.15, -0.1 + beat * 0.28);
        if (t < 0.3) this._pose('relaxed', 'peace', span(t, 0.12, 0.3)); else this._pose('peace');
        for (const at of [0.35, 0.47, 0.59, 0.71]) if (crossed(at)) {
          this._spark(R.localToWorld(this._nailPos(0)).clone(), 6, true);
          this._spark(R.localToWorld(this._nailPos(1)).clone(), 6, true);
          Sound.tap();
        }
        break;
      }
      case 'shades': {
        // heart sunglasses: up to the eyes, a cool nod, then flipped up onto the head
        this._pose('pinch');
        const up = ease01(span(t, 0.1, 0.36));
        const flip = ease01(span(t, 0.62, 0.78));
        const low = new THREE.Vector3(-0.02, -0.13, -0.3), eyes = new THREE.Vector3(0, -0.004, -0.12), head = new THREE.Vector3(0, 0.15, -0.13);
        const gl = new THREE.Vector3().lerpVectors(low, eyes, up);
        if (flip > 0) gl.lerpVectors(eyes, head, flip);
        if (t > 0.38 && t < 0.62) gl.y += Math.sin(span(t, 0.38, 0.62) * Math.PI * 2) * 0.006;
        // the hand holds the left arm of the glasses. It stays further back (so it isn't huge)
        // but lines up on screen with the hinge, so it looks like it's holding them.
        const hinge = gl.clone().add(new THREE.Vector3(-0.066, 0.01, 0.03));
        const handAt = hinge.clone().multiplyScalar(-0.26 / hinge.z).add(new THREE.Vector3(0.012, -0.075, 0));
        R.position.lerpVectors(new THREE.Vector3(-0.28, -0.32, -0.36), handAt, show);
        R.rotation.set(0.1, 0.25, 0.3);
        this.shades.visible = show > 0.95 && t < 0.8;
        this.shades.position.copy(gl);
        this.shades.rotation.set(-0.7 * (1 - up) - flip * 0.9, 0.5 * (1 - up), 0.25 * (1 - up));
        if (crossed(0.36)) { Sound.ting(); this._spark(new THREE.Vector3(0.05, 0.02, -0.13), 8); }
        if (crossed(0.63)) Sound.swish();
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
        reachTo(V(jar.x - jarR - 0.004 - gap, jar.y + 0.005 + lift, jar.z + 0.01), V(0, 0.045, -0.006));
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
        if (t > 0.2 && t < 0.44) p.y += Math.sin(t * 110) * 0.0015;           // shaky finger
        R.rotation.set(-0.1, 0.05, -1.3);
        reachTo(p, tipOf(0));
        if (crossed(0.44)) { Sound.boop(1); this._bump(3); this._spark(touch.clone(), 6, 'water'); }
        if (crossed(0.66)) { Sound.boop(1.3); this._bump(1.2); }
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
          twist = Math.sin(t * 60) * 0.35;
          cork.position.y += 0.01 * k;
          cork.rotation.y = twist * 1.5;
          at = W(cork.position);
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
