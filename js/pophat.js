// The pop hat: when you pop someone, your own hat pops up at the bottom of the screen and a
// star lands on it. Pop again soon and another star comes: 1 star, 2 stars… 5 for an ace.
// Quick (about 1.7 s), and everything moves like the water in the refill shows (sassy.js):
//   - the stars pop out of thin air with a boing and circle over the hat faster and faster,
//     like the orbit droplets, then arc in one by one and land on the brim
//   - the flower's petals ripple like the water ribbon, the hat gives a little with each
//     landing and does the fumble show's balancing wobble
//   - sparks fly off like the water sparks: a kick, gravity, spinning, shrinking away
// Drawn in the first-person scene, hanging off the camera like the sassy paw.

const POPHAT = {
  born: k => 0.14 + k * 0.08,            // when star k pops in
  land: k => 0.86 + k * 0.07,            // when star k arcs in to land on the hat
  fly: 0.12,                             // how long the arc takes
  end: 1.72,                             // when the hat pops away
};

class PopHat {
  constructor(camera, model) {
    this.camera = camera;
    this.root = new THREE.Group();
    this.root.visible = false;
    this.root.position.set(0, -0.09, -0.5);
    this.root.scale.setScalar(0.27);
    camera.add(this.root);
    this.lift = new THREE.Group();                 // the hat and its stars (bounces as one)
    this.root.add(this.lift);
    // your hat (the same one everyone sees on your head), facing you, tipped so you see the top
    const hat = model && model.hat ? model.hat.clone() : new THREE.Group();
    hat.position.set(0, -0.08, 0);
    hat.traverse(o => { o.castShadow = o.receiveShadow = false; });
    this.hat = hat;
    this.lift.add(hat);
    this.flower = hat.children.find(c => c.isGroup) || null;
    this.petals = this.flower ? this.flower.children.slice(0, 5).map(p => ({ p, home: p.position.clone() })) : [];
    // the stars
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.038 : 0.09;
      if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    shape.closePath();
    const starGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: false });
    starGeo.center();
    this.starMat = new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0x7a5a00, roughness: 0.4, metalness: 0.1 });
    this.stars = [];
    for (let k = 0; k < 5; k++) {
      const s = new THREE.Mesh(starGeo, this.starMat);
      s.visible = false;
      this.lift.add(s);
      this.stars.push(s);
    }
    const lam = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
    this.sparkMats = [lam(0xffffff, 0xffffff), lam(0xffd23f, 0xffd23f), lam(0x7fdcff, 0x7fdcff)];
    this.rainbowMats = [0xff6f61, 0xffd23f, 0x7fffd4, 0x6fb7ff, 0xc77dff].map(c => lam(c, c));
    this.sparkGeo = new THREE.BoxGeometry(0.035, 0.035, 0.035);
    this.particles = [];
    this.t = -1;                                   // not playing
    this.n = 0;
    this.spin = 0;
  }

  get playing() { return this.t >= 0; }

  // n stars (1..5). Another pop while the hat is up: the stars come again, one more this time.
  show(n) {
    this.n = Math.max(1, Math.min(5, n));
    this.lastT = this.t = this.playing && this.t < POPHAT.end - 0.3 ? 0.12 : 0;
    this.root.visible = true;
    this.spin = 0;
  }

  // where star k sits once it has landed: a row along the front of the brim, facing you
  _seat(k) {
    const n = this.n, x = (k - (n - 1) / 2) * 0.15;
    return new THREE.Vector3(x, 0.06 - Math.abs(x) * 0.12, 0.32 - Math.abs(x) * 0.25);
  }

  // the orbit from the refill show: round and round over the hat, faster and faster
  _orbitAt(k, u) {
    u = Math.max(0, u);
    const a = Math.PI * 2 * (2.2 * u + 3.5 * u * u) + k * Math.PI * 2 / 5 + Math.PI;
    return new THREE.Vector3(0.5 * Math.cos(a), 0.3 + 0.12 * Math.cos(a) + 0.03 * Math.sin(u * 20 + k), 0.3 * Math.sin(a));
  }

  _spark(pos, n, rainbow = false) {
    const mats = rainbow ? this.rainbowMats : this.sparkMats;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.sparkGeo, mats[(i + Math.floor(Math.random() * 3)) % mats.length]);
      m.position.copy(pos);
      this.root.add(m);
      const a = Math.random() * Math.PI * 2;
      this.particles.push({ m, vel: new THREE.Vector3(Math.cos(a) * 0.9, Math.sin(a) * 0.9 + 0.4, (Math.random() - 0.5) * 0.4), life: 0.45, max: 0.45 });
    }
  }

  update(dt) {
    // the sparks (same as the water sparks: fly, fall, spin, shrink)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.m.position.addScaledVector(p.vel, dt);
      p.vel.y -= 2.2 * dt;
      p.m.rotation.x += dt * 6; p.m.rotation.y += dt * 5;
      p.m.scale.setScalar(Math.max(0, p.life / p.max));
      if (p.life <= 0) { this.root.remove(p.m); this.particles.splice(i, 1); }
    }
    if (!this.playing) { if (!this.particles.length) this.root.visible = false; return; }
    const lastT = this.lastT, t = (this.t += dt);
    this.lastT = t;
    const crossed = a => lastT < a && t >= a;
    const E = POPHAT.end;
    if (t >= E + 0.1) { this.t = -1; this.lift.visible = false; return; }
    this.lift.visible = true;

    // the hat: up from below with a boing, a slow turn, and it pops away at the end
    const g = span(t, 0, 0.22);
    const inS = ease01(g) * (1 + 0.35 * Math.sin(g * Math.PI));
    const outS = 1 - ease01(span(t, E - 0.08, E));
    this.lift.scale.setScalar(Math.max(0.001, inS * outS));
    this.lift.position.y = -0.5 * (1 - ease01(g)) + 0.12 * Math.sin(Math.PI * span(t, E - 0.14, E - 0.04));   // a little hop before it pops
    this.spin += dt * 0.6;
    let give = 0, wobble = 0;
    for (let k = 0; k < this.n; k++) {                           // gives a little with each landing (the fumble hand)
      const at = POPHAT.land(k) + POPHAT.fly;
      give += 0.05 * Math.sin(Math.PI * span(t, at, at + 0.12));
      if (t >= at - 0.02 && t < at + 0.3) wobble = 1;
    }
    this.hat.position.y = -0.08 - give;
    this.hat.rotation.set(0.5 + 0.08 * Math.sin(t * 7), Math.sin(this.spin) * 0.35, wobble * Math.sin(t * 40) * 0.05);
    // the flower's petals ripple like the water ribbon
    this.petals.forEach(({ p, home }, i) => {
      const r = 1 + 0.18 * Math.sin(t * 28 - i * 0.9);
      p.position.set(home.x * r, home.y * r, home.z);
    });

    // the stars
    for (let k = 0; k < 5; k++) {
      const s = this.stars[k];
      if (k >= this.n) { s.visible = false; continue; }
      const b = POPHAT.born(k), L = POPHAT.land(k), land = L + POPHAT.fly;
      if (t < b) { s.visible = false; continue; }
      s.visible = true;
      let p, sz = 1;
      if (t < L) {                                                // orbiting (pops in with a boing)
        p = this._orbitAt(k, t - b);
        const gg = span(t, b, b + 0.07);
        sz = ease01(gg) * (1 + 0.4 * Math.sin(gg * Math.PI));
        s.rotation.set(0.3, (t - b) * 9, 0);
        if (Math.random() < 0.35) this._spark(p.clone().applyMatrix4(this.lift.matrix), 1);
      } else {                                                    // flicked: an arc onto the hat
        const u = span(t, L, land), seat = this._seat(k);
        p = this._orbitAt(k, L - b).lerp(seat, ease01(u));
        p.y += 0.35 * 4 * u * (1 - u);
        s.rotation.set(0.25, (1 - u) * 6, 0);
        if (u >= 1) {                                             // landed: twinkles in place
          sz = 1 + 0.08 * Math.sin(t * 30 + k);
          s.rotation.z = 0.12 * Math.sin(t * 12 + k);
        }
      }
      s.position.copy(p);
      s.scale.setScalar(sz);
      if (crossed(b)) { Sound.boop(1.5 + k * 0.25); this._spark(this._orbitAt(k, 0).applyMatrix4(this.lift.matrix), 4); }
      if (crossed(land)) { Sound.tick(0.6 + k * 0.1); this._spark(this._seat(k).applyMatrix4(this.lift.matrix), 6, this.n === 5); }
    }
    if (crossed(0.02)) { Sound.plop(); this._spark(new THREE.Vector3(0, 0, 0), 6); }
    if (crossed(E)) { Sound.corkPop(); this._spark(new THREE.Vector3(0, 0.1, 0), 10 + this.n * 3, this.n === 5); }
    if (this.n === 5 && t > POPHAT.land(4) + POPHAT.fly && Math.random() < 0.5) {   // an ace: it rains rainbow sparks
      const a = Math.random() * Math.PI * 2;
      this._spark(new THREE.Vector3(Math.cos(a) * 0.5, 0.5, Math.sin(a) * 0.3).applyMatrix4(this.lift.matrix), 1, true);
    }
  }
}
