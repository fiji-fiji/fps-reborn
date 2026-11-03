// Grenades, the friendly way:
//   Cloud Puff  (smoke) — a big fluffy cloud nobody can see through
//   Sparkle Pop (flash) — glitter burst; enemies looking at it can't see for a moment
//   Bubble Bomb (frag)  — giant bubble splash that pops anyone close
// They're thrown, bounce off blocks, then go off after their fuse.
// Your own grenades never affect you or your teammates.

const GRENADES = {
  smoke: { key: 'smoke', name: 'Cloud Puff', price: 200, max: 2, fuse: 1.3, icon: '☁️',
           desc: 'Puffs into a big cloud for 15 s. Nobody can see through it.' },
  flash: { key: 'flash', name: 'Sparkle Pop', price: 250, max: 2, fuse: 0.9, icon: '✨',
           desc: 'Bursts into glitter. Enemies looking at it can\'t see for a moment.' },
  frag:  { key: 'frag', name: 'Bubble Bomb', price: 400, max: 1, fuse: 1.8, icon: '🫧',
           desc: 'Bounces, then a giant bubble splash pops anyone close.' },
};
const NADE_ORDER = ['smoke', 'flash', 'frag'];
const NADE_GRAVITY = 18;
const SMOKE = { radius: 3.6, life: 15 };
const FRAG = { radius: 6, full: 1.5, max: 130 };
const FLASH = { range: 35 };

// Velocity that lobs something from `from` to land on `to`.
function solveLob(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  const T = Math.max(0.5, Math.min(1.6, d / 12));
  return new THREE.Vector3(dx / T, (dy + 0.5 * NADE_GRAVITY * T * T) / T, dz / T);
}

// Small held/thrown models, built once per kind.
function makeNadeMesh(kind) {
  const g = new THREE.Group();
  const lam = (c, e = 0, o) => new THREE.MeshLambertMaterial(Object.assign({ color: c, emissive: e }, o));
  const add = (w, h, d, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  if (kind === 'frag') {
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), lam(0xbfefff, 0x2a5a78, { transparent: true, opacity: 0.8 })));
    add(0.1, 0.06, 0.1, lam(0xff8fb1), 0, 0.13, 0);
    add(0.03, 0.06, 0.03, lam(0xffffff), 0, 0.18, 0);
  } else if (kind === 'flash') {
    const gold = lam(0xffe66b, 0x665500);
    add(0.2, 0.08, 0.08, gold); add(0.08, 0.2, 0.08, gold); add(0.08, 0.08, 0.2, gold);
    add(0.1, 0.1, 0.1, lam(0xffffff, 0x666666));
  } else {
    const white = lam(0xffffff, 0x333333);
    add(0.2, 0.16, 0.18, white); add(0.12, 0.12, 0.12, white, 0.09, 0.06, 0); add(0.12, 0.1, 0.12, white, -0.08, 0.05, 0.03);
  }
  return g;
}

class Throwables {
  constructor(game) {
    this.game = game;
    this.list = [];       // grenades in flight / rolling
    this.smokes = [];     // active clouds
    this.temp = [];       // short-lived effect meshes (bomb shock bubble)
    this.cloudMats = [0xffffff, 0xf3eaff, 0xeaf6ff].map(c =>
      new THREE.MeshLambertMaterial({ color: c, emissive: 0x2a2a33, side: THREE.DoubleSide }));
  }

  throw(owner, kind, pos, vel) {
    const mesh = makeNadeMesh(kind);
    mesh.position.copy(pos);
    this.game.scene.add(mesh);
    this.list.push({ owner, kind, pos: pos.clone(), vel: vel.clone(), fuse: GRENADES[kind].fuse, mesh,
      spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, 0) });
    Sound.toss(this.game._volumeAt(pos));
  }

  update(dt) {
    const w = this.game.world;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      n.fuse -= dt;
      // bouncy physics against blocks
      const r = 0.12;
      n.vel.y -= NADE_GRAVITY * dt;
      const nx = n.pos.x + n.vel.x * dt;
      if (w.solidTopAt(nx + Math.sign(n.vel.x) * r, n.pos.y, n.pos.z) !== null) { n.vel.x *= -0.45; Sound.tick(this.game._volumeAt(n.pos)); }
      else n.pos.x = nx;
      const nz = n.pos.z + n.vel.z * dt;
      if (w.solidTopAt(n.pos.x, n.pos.y, nz + Math.sign(n.vel.z) * r) !== null) { n.vel.z *= -0.45; Sound.tick(this.game._volumeAt(n.pos)); }
      else n.pos.z = nz;
      const ny = n.pos.y + n.vel.y * dt;
      const floor = n.vel.y <= 0 ? w.solidTopAt(n.pos.x, ny - r, n.pos.z) : null;
      if (floor !== null) {
        n.pos.y = floor + r;
        if (Math.abs(n.vel.y) > 2) Sound.tick(this.game._volumeAt(n.pos));
        n.vel.y = Math.abs(n.vel.y) > 1.5 ? -n.vel.y * 0.4 : 0;
        const k = Math.exp(-dt * 5);
        n.vel.x *= k; n.vel.z *= k;                    // rolls to a stop
      } else if (n.vel.y > 0 && w.solidTopAt(n.pos.x, ny + r, n.pos.z) !== null) {
        n.vel.y *= -0.3;
      } else {
        n.pos.y = ny;
      }
      n.mesh.position.copy(n.pos);
      n.mesh.rotation.x += n.spin.x * dt; n.mesh.rotation.y += n.spin.y * dt;

      if (n.fuse <= 0) {
        this.game.scene.remove(n.mesh);
        this.list.splice(i, 1);
        this._detonate(n);
      }
    }

    // clouds grow, drift a little, then shrink away
    for (let i = this.smokes.length - 1; i >= 0; i--) {
      const s = this.smokes[i];
      s.t += dt;
      const grow = Math.min(1, s.t / 0.6), fade = Math.min(1, (SMOKE.life - s.t) / 1.2);
      s.density = Math.max(0, Math.min(grow, fade));
      s.puffs.forEach((p, j) => {
        p.mesh.scale.setScalar(p.size * (0.2 + 0.8 * s.density));
        p.mesh.position.y = p.base.y + Math.sin(s.t * 0.7 + j) * 0.08;
      });
      if (s.t >= SMOKE.life) {
        this.game.scene.remove(s.group);
        this.smokes.splice(i, 1);
      }
    }

    for (let i = this.temp.length - 1; i >= 0; i--) {
      const t = this.temp[i];
      t.t += dt;
      const k = t.t / t.life;
      t.mesh.scale.setScalar(0.3 + k * t.size);
      t.mesh.material.opacity = 0.5 * (1 - k);
      if (k >= 1) { this.game.scene.remove(t.mesh); this.temp.splice(i, 1); }
    }
  }

  _detonate(n) {
    const g = this.game;
    if (n.kind === 'smoke') return this._smoke(n.pos);
    if (n.kind === 'flash') return this._flash(n);
    return this._frag(n);
  }

  _smoke(pos) {
    const group = new THREE.Group();
    const center = pos.clone(); center.y += 1.2;
    const puffs = [];
    const rng = makeRng(Math.floor(Math.random() * 1e6) + 1);
    for (let i = 0; i < 46; i++) {
      // fill a sphere-ish blob, a bit flatter near the ground
      let v;
      do { v = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1); } while (v.lengthSq() > 1);
      v.multiplyScalar(SMOKE.radius * 0.8);
      v.y = Math.max(-1.0, v.y * 0.75);
      const size = 1.3 + rng() * 1.1;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.cloudMats[i % 3]);
      mesh.position.copy(center).add(v);
      mesh.rotation.set(rng(), rng(), rng());
      group.add(mesh);
      puffs.push({ mesh, size, base: mesh.position.clone() });
    }
    this.game.scene.add(group);
    this.smokes.push({ center, group, puffs, t: 0, density: 0 });
    this.game.effects.bubbleBurst(center, new THREE.Vector3(0, 1, 0), 12, 2, 0.12);
    Sound.puff(this.game._volumeAt(center));
  }

  _flash(n) {
    const g = this.game, p = n.pos.clone();
    p.y += 0.3;
    g.effects.confettiBurst(p, 70, 7);
    g.effects.bubbleBurst(p, new THREE.Vector3(0, 1, 0), 16, 3, 0.1);
    Sound.sparkle(g._volumeAt(p));
    const eye = new THREE.Vector3();
    for (const e of g.entities) {
      if (!e.alive || !e.mover || e.team === n.owner.team) continue;    // only enemies get dazzled
      e.mover.eyePosition(eye);
      const to = p.clone().sub(eye);
      const dist = to.length();
      if (dist > FLASH.range) continue;
      to.divideScalar(dist);
      if (g.world.raycast(eye, to, dist) || this.blocksSight(eye, p)) continue;   // wall or cloud in the way
      const look = new THREE.Vector3(-Math.sin(e.mover.yaw) * Math.cos(e.mover.pitch), Math.sin(e.mover.pitch),
        -Math.cos(e.mover.yaw) * Math.cos(e.mover.pitch));
      const facing = look.dot(to);
      const amount = facing > 0.5 ? 1 : facing > 0 ? 0.6 : 0.15;
      const secs = (0.3 + 2.0 * amount) * (1 - 0.5 * dist / FLASH.range);
      e.blindUntil = g.time + secs;
      e.blindFor = secs;
      if (e.isPlayer) HUD.dazzle(secs);
    }
  }

  _frag(n) {
    const g = this.game, p = n.pos.clone();
    p.y += 0.3;
    g.effects.bubbleBurst(p, new THREE.Vector3(0, 1, 0), 70, 7, 0.22);
    g.effects.confettiBurst(p, 40, 6);
    const shock = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshLambertMaterial({ color: 0xd8f6ff, emissive: 0x3a6a88, transparent: true, opacity: 0.5, depthWrite: false }));
    shock.position.copy(p);
    g.scene.add(shock);
    this.temp.push({ mesh: shock, t: 0, life: 0.45, size: FRAG.radius });
    Sound.boom(g._volumeAt(p));
    const chest = new THREE.Vector3();
    for (const e of g.entities) {
      if (!e.alive || e === n.owner || e.team === n.owner.team) continue;   // never hurts you or your team
      targetPointOf(e, 'chest', chest);
      const to = chest.clone().sub(p);
      const dist = to.length();
      if (dist > FRAG.radius) continue;
      to.divideScalar(dist);
      if (g.world.raycast(p, to, dist)) continue;                            // walls protect you
      const k = dist <= FRAG.full ? 1 : 1 - (dist - FRAG.full) / (FRAG.radius - FRAG.full);
      const dmg = Math.round(FRAG.max * k);
      if (dmg > 0) g.applyHit(n.owner, e, 'body', dmg, chest.clone(), to, 'frag');
    }
  }

  // Does an active cloud block the line from a to b?
  blocksSight(a, b) {
    for (const s of this.smokes) {
      if (s.density < 0.35) continue;
      const R = SMOKE.radius * 0.95 * s.density;
      // closest point on segment a-b to the cloud centre
      const ab = b.clone().sub(a), ac = s.center.clone().sub(a);
      const t = Math.max(0, Math.min(1, ac.dot(ab) / ab.lengthSq()));
      const closest = a.clone().addScaledVector(ab, t);
      if (closest.distanceTo(s.center) < R) return true;
    }
    return false;
  }

  // 0..1: how deep inside a cloud a point is (for the white haze on your screen)
  smokeAt(p) {
    let best = 0;
    for (const s of this.smokes) {
      const d = p.distanceTo(s.center);
      if (d < SMOKE.radius) best = Math.max(best, s.density * Math.min(1, (SMOKE.radius - d) / 1.2));
    }
    return best;
  }

  clear() {
    for (const n of this.list) this.game.scene.remove(n.mesh);
    for (const s of this.smokes) this.game.scene.remove(s.group);
    for (const t of this.temp) this.game.scene.remove(t.mesh);
    this.list = []; this.smokes = []; this.temp = [];
  }
}
