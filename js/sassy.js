// Sassy refill animations: a left hand with fresh hot-pink nails, a gold ring and a
// bracelet does a little show while your blaster refills. One is picked at random
// each time (the classic soap-bottle pour is the other option, in weapons.js).
//   snap      — snaps her fingers, sparkles, jar is full
//   file      — files her nails, then blows on them
//   polish    — paints one nail a fresh colour and admires it
//   fingergun — finger-gun "pew" at you, a little heart pops out
//   drum      — drums her nails on the jar, then thumbs up

const SASSY_STYLES = ['snap', 'file', 'polish', 'fingergun', 'drum'];

const ease01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const span = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

// finger curls [index, middle, ring, pinky] (0 straight .. 1.6 curled) + thumb (−0.4 up .. 1 tucked)
const HAND_POSES = {
  open:      { c: [0, 0, 0, 0], th: 0 },
  relaxed:   { c: [0.25, 0.3, 0.35, 0.45], th: 0.2 },
  flat:      { c: [0.05, 0.05, 0.05, 0.05], th: 0.1 },
  snapReady: { c: [0.5, 0.55, 1.35, 1.45], th: 0.95 },
  snapped:   { c: [0.5, 1.6, 1.4, 1.5], th: 0.25 },
  gun:       { c: [0, 1.45, 1.5, 1.5], th: -0.3 },
  thumbsUp:  { c: [1.5, 1.5, 1.5, 1.5], th: -0.4 },
};
const NAIL_COLORS = [0xffd23f, 0x7fffd4, 0xc77dff, 0x6fb7ff, 0xff6f61];

class SassyHand {
  constructor(camera) {
    this.camera = camera;
    const lam = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
    const skin = lam(0xf2c6a0), gold = lam(0xffd36b, 0x403010);
    this.nailMat = lam(0xff3d8b, 0x551030);
    this.paintMat = lam(0xff3d8b, 0x551030);           // the nail that gets repainted
    const sleeve = new THREE.MeshLambertMaterial({ map: Textures.noisyTexture(0xc9a7ff, 16, 8, 21) });
    const add = (parent, w, h, d, m, x, y, z) => {
      const b = new THREE.Mesh(roundedBoxGeometry(w, h, d, Math.min(w, h, d) * 0.35, 3), m);
      b.position.set(x, y, z);
      parent.add(b);
      return b;
    };
    const piv = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    // the hand: fingers point up, the back of the hand (with the nails) faces you
    this.root = new THREE.Group();
    this.root.scale.setScalar(0.75);                  // the left hand is a bit smaller than the right
    this.root.visible = false;
    camera.add(this.root);
    const R = this.root;
    add(R, 0.06, 0.065, 0.02, skin, 0, 0, 0);                         // palm
    this.fingers = [];
    const xs = [0.0215, 0.007, -0.007, -0.0215], lens = [1, 1.1, 1, 0.82];
    xs.forEach((x, i) => {
      const k = piv(R, x, 0.0325, 0);
      add(k, 0.0135, 0.03 * lens[i], 0.015, skin, 0, 0.015 * lens[i], 0);
      const m = piv(k, 0, 0.03 * lens[i], 0);
      add(m, 0.013, 0.026 * lens[i], 0.014, skin, 0, 0.013 * lens[i], 0);
      const nail = add(m, 0.011, 0.014, 0.003, i === 0 ? this.paintMat : this.nailMat, 0, 0.016 * lens[i], 0.0085);
      if (i === 2) add(k, 0.016, 0.006, 0.018, gold, 0, 0.012, 0);      // gold ring
      this.fingers.push({ k, m, nail });
    });
    const tb = piv(R, 0.029, -0.012, 0.002);
    add(tb, 0.015, 0.026, 0.015, skin, 0, 0.013, 0);
    const tt = piv(tb, 0, 0.026, 0);
    add(tt, 0.014, 0.022, 0.014, skin, 0, 0.011, 0);
    add(tt, 0.011, 0.012, 0.003, this.nailMat, 0, 0.014, 0.008);
    this.thumb = { b: tb, t: tt };
    add(R, 0.066, 0.012, 0.026, gold, 0, -0.038, 0);                  // bracelet
    add(R, 0.07, 0.12, 0.03, sleeve, 0, -0.104, 0);                   // sleeve

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
    this.heart = new THREE.Group();
    const heartMat = lam(0xff5d8f, 0x661030);
    ['.X.X.', 'XXXXX', '.XXX.', '..X..'].forEach((row, r) => {
      for (let c = 0; c < 5; c++) if (row[c] === 'X') add(this.heart, 0.007, 0.007, 0.007, heartMat, (c - 2) * 0.007, -r * 0.007, 0);
    });
    camera.add(this.heart);
    this.props = [this.file, this.bottle, this.brush, this.heart];
    for (const p of this.props) p.visible = false;

    this.particles = [];
    this.sparkMats = [0xffd23f, 0xffffff, 0xff8fb1, 0x7fffd4].map(c => lam(c, c));
    this.puffMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x777777, transparent: true, opacity: 0.6 });
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

  _spark(pos, n = 10) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.006, 0.006), this.sparkMats[i % 4]);
      m.position.copy(pos);
      this.camera.add(m);
      const a = Math.random() * Math.PI * 2;
      this.particles.push({ m, vel: new THREE.Vector3(Math.cos(a) * 0.12, Math.sin(a) * 0.12 + 0.05, (Math.random() - 0.5) * 0.05), life: 0.5, max: 0.5 });
    }
  }

  _puff(from, to) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), this.puffMat);
    m.position.copy(from);
    this.camera.add(m);
    this.particles.push({ m, vel: to.clone().sub(from).multiplyScalar(2.2), life: 0.45, max: 0.45, grow: true });
  }

  _tick(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.m.position.addScaledVector(p.vel, dt);
      p.vel.y -= p.grow ? 0 : 0.25 * dt;
      p.m.rotation.x += dt * 6; p.m.rotation.y += dt * 5;
      const k = Math.max(0, p.life / p.max);
      p.m.scale.setScalar(p.grow ? 1 + (1 - k) * 2 : k);
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
  }

  // How full the jar should be at time t (0..1) of this show.
  fill(style, t) {
    if (style === 'snap') return t > 0.47 ? 1 : 0;
    if (style === 'fingergun') return t > 0.45 ? 1 : 0;
    if (style === 'drum') return Math.round(span(t, 0.15, 0.75) * 8) / 8;   // a bit fuller with each tap
    return ease01(span(t, 0.15, 0.8));
  }

  play(style, t, dt) {
    const R = this.root;
    if (style !== this.style || t < this.lastT) {      // a new show starts
      this.style = style;
      this.fired = false;
      this.paintMat.color.set(0xff3d8b); this.paintMat.emissive.set(0x551030);
      this.newNail = NAIL_COLORS[Math.floor(Math.random() * NAIL_COLORS.length)];
      for (const p of this.props) p.visible = false;
    }
    const lastT = this.lastT;
    this.lastT = t;
    R.visible = true;
    this._tick(dt);

    // slide in from the bottom-left, slide out at the end
    const show = ease01(span(t, 0, 0.15)) * (1 - ease01(span(t, 0.85, 1)));
    const away = new THREE.Vector3(-0.28, -0.32, -0.36);
    const place = (x, y, z, rx, ry, rz) => {
      R.position.lerpVectors(away, this._v.set(x, y, z), show);
      R.rotation.set(rx, ry, rz);
    };
    const crossed = at => lastT < at && t >= at;

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
        if (t > 0.64 && t < 0.82) {                   // blow on the fresh nails
          this._pose('relaxed', 'open', span(t, 0.64, 0.7));
          if (Math.floor(t * 60) !== Math.floor(lastT * 60)) {
            R.updateMatrixWorld(true);
            const target = R.localToWorld(new THREE.Vector3(0, 0.07, 0.02));
            this._puff(new THREE.Vector3(-0.02, -0.16, -0.22), target);
          }
          if (crossed(0.65)) Sound.blow();
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
      case 'fingergun': {
        const kick = t > 0.45 ? Math.max(0, 1 - (t - 0.45) * 8) : 0;
        place(-0.05, -0.035, -0.33, 0.55 - kick * 0.45, -0.35, -0.35);
        this._pose(t < 0.3 ? 'relaxed' : 'gun', t < 0.3 ? 'gun' : null, span(t, 0.15, 0.3));
        if (crossed(0.45)) {
          R.updateMatrixWorld(true);
          this.heart.position.copy(R.localToWorld(this._nailPos(0)));
          this.heart.visible = true;
          this.heartT = 0;
          Sound.pew();
        }
        if (this.heart.visible) {
          this.heartT += dt;
          this.heart.position.y += dt * 0.06;
          this.heart.position.z += dt * 0.12;
          this.heart.scale.setScalar(1 + this.heartT * 3);
          if (this.heartT > 0.6) this.heart.visible = false;
        }
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
    }
  }
}
