// The match: who's in it (you, bots, practice buddies), loadouts and buying,
// shots and arrows hitting people, popping into pixels, spawning, and
// characters bumping into each other.
// The rules (rounds, Boo-Boo, money, respawns...) live in the game mode (modes.js).

// your team: fluffy Bichon dogs · the other team: cats
const BOT_NAMES = {
  blue: ['Biscuit', 'Marshmallow', 'Snowball', 'Cotton'],
  red: ['Whiskers', 'Mittens', 'Pumpkin', 'Shadow', 'Tiger'],
};
const MAX_MONEY = 9000;

// ---- loadouts: every character has a main slot, a sidearm, and a shield ----
function resetLoadout(e) {
  e.guns = { main: null, side: new Gun(WEAPONS.dandelion), knife: new Gun(WEAPONS.knife) };
  e.slot = 'side';
  e.shield = 0;
  e.nades = { smoke: 0, flash: 0, frag: 0 };
  e.nadeKind = null;
  e.roundBuys = {};
}
function giveWeapon(e, key) {
  const def = WEAPONS[key];
  e.guns[def.slot] = new Gun(def);
  e.slot = def.slot;
}
function refillLoadout(e) {
  for (const g of Object.values(e.guns)) if (g) g.reset();
  e.slot = e.guns.main ? 'main' : 'side';
  e.blindUntil = 0;
  e.roundBuys = {};
}
// shields soak up damage first, then health
function applyDamage(e, dmg) {
  const soak = Math.min(e.shield, dmg);
  e.shield -= soak;
  e.health = Math.max(0, e.health - (dmg - soak));
}

// You, as seen by the rest of the game (the camera is your eyes).
class PlayerAgent {
  constructor(game) {
    this.game = game;
    this.isPlayer = true;
    this.team = game.playerTeam;
    this.name = 'You';
    this.mover = new Mover(game.world);
    resetLoadout(this);
    this.money = 0;
    this.health = 100;
    this.alive = true;
    this.respawnIn = 0;
    this.spottedUntil = 0;
    this.carrying = false;
    this.actionHeld = false;
    this.blindUntil = 0;
    this.stats = { pops: 0, outs: 0 };
    // never drawn (first person) — only used to make your pixels when you're popped
    this.model = new CharacterModel(game.scene, { shirt: TEAM_SHIRTS[this.team][0], armed: true, seed: 99,
      species: TEAM_SPECIES[this.team], pants: TEAM_PANTS[this.team] });
    this.model.setVisible(false);
  }

  get pos() { return this.mover.pos; }
  get gun() { return this.guns[this.slot] || this.guns.side; }

  spawn(x, y, z, yaw) {
    this.mover.spawn(x, y, z, yaw);
    this.health = 100;
    this.alive = true;
    this.actionHeld = false;
  }

  hitboxes() { return characterHitboxes(this.mover.pos, this.mover.bodyHeight); }
  targetPoint(kind, out) { return targetPointOf(this, kind, out); }

  takeHit(dmg, part, attacker) {
    if (!this.alive) return false;
    applyDamage(this, dmg);
    HUD.hurt(attacker, this);
    Sound.ouch();
    if (this.health === 0) { this.alive = false; this.actionHeld = false; return true; }
    return false;
  }

  burst() {
    this.model.setPose(this.mover.pos, this.mover.yaw, this.mover.pitch);
    return this.model.pixelize();
  }
}

class Game {
  // modeName: 'standard' | 'swiftplay' | 'skirmish' (maps without team spawns use practice)
  constructor({ scene, world, mapInfo, effects, camera, difficulty = 'easy', modeName = 'standard' }) {
    Object.assign(this, { scene, world, mapInfo, effects, camera });
    this.time = 0;
    this.playerTeam = 'blue';
    this.entities = [];
    this._v = new THREE.Vector3();
    this.arrows = new Arrows(this);
    this.throwables = new Throwables(this);
    this.drops = new Drops(this);

    this.player = new PlayerAgent(this);
    this.entities.push(this.player);

    this.dummies = (mapInfo.buddies || []).map(([x, y, z, s]) => new Dummy(scene, x, y, z, s));
    this.entities.push(...this.dummies);

    this.bots = [];
    if (mapInfo.spawns) {
      this.nav = new NavGrid(world, mapInfo.spawn.y);
      let seed = 1;
      for (const team of ['blue', 'red']) {
        BOT_NAMES[team].forEach((name, i) => {
          const shirt = TEAM_SHIRTS[team][(i + (team === this.playerTeam ? 1 : 0)) % 5];
          const bot = new Bot(this, name, team, shirt, difficulty, seed++);
          this.bots.push(bot);
          this.entities.push(bot);
        });
      }
      this.mode = modeName === 'skirmish' ? new SkirmishMode(this)
        : new StandardMode(this, modeName === 'swiftplay' ? SWIFTPLAY : {});
    } else {
      this.mode = new PracticeMode(this);
    }
  }

  get hasTeams() { return this.bots.length > 0; }

  // ---- buying ----
  // item: a WEAPONS key or a SHIELDS key. Things bought this buy phase are refunded
  // if you swap them for something else.
  priceOf(item) {
    if (this.mode.freeShop) return 0;
    return (WEAPONS[item] || SHIELDS[item] || GRENADES[item]).price;
  }

  canAfford(e, item) {
    if (GRENADES[item]) return this.mode.freeShop || e.money >= this.priceOf(item);
    const refund = WEAPONS[item] ? (e.roundBuys.main ? this.priceOf(e.roundBuys.main) : 0)
      : (e.roundBuys.shield ? this.priceOf(e.roundBuys.shield) : 0);
    return this.mode.freeShop || e.money + refund >= this.priceOf(item);
  }

  buy(e, item) {
    if (!this.mode.canBuy(e) || !this.canAfford(e, item)) return false;
    const price = this.priceOf(item);
    if (GRENADES[item]) {
      if (e.nades[item] >= GRENADES[item].max) return false;
      e.money -= price;
      e.nades[item]++;
      return true;
    }
    if (WEAPONS[item]) {
      const def = WEAPONS[item];
      if (e.guns.main && e.guns.main.def === def) { e.slot = 'main'; return false; }   // already have it
      if (e.roundBuys.main) e.money += this.priceOf(e.roundBuys.main);
      e.money -= price;
      giveWeapon(e, item);
      e.roundBuys.main = item;
    } else {
      const s = SHIELDS[item];
      if (e.roundBuys.shield) {
        e.money += this.priceOf(e.roundBuys.shield);
        e.shield = Math.max(0, e.shield - SHIELDS[e.roundBuys.shield].amount);
      }
      if (e.shield >= s.amount) { e.roundBuys.shield = null; return false; }
      e.money -= price;
      e.shield = s.amount;
      e.roundBuys.shield = item;
    }
    if (!this.mode.freeShop) e.money = Math.min(MAX_MONEY, e.money);
    return true;
  }

  // Put someone at a free spot in their side's spawn area.
  spawnAt(e) {
    const side = this.mode.sideOf(e.team);
    const rect = this.mapInfo.spawns[side];
    let cell = null;
    for (let i = 0; i < 20; i++) {
      const c = this.nav.randomIn(rect);
      const crowded = this.entities.some(o => o !== e && o.alive && o.mover &&
        Math.hypot(o.pos.x - (c[0] + 0.5), o.pos.z - (c[1] + 0.5)) < 1.5);
      cell = c;
      if (!crowded) break;
    }
    const yaw = side === 'attack' ? 0 : Math.PI;   // attackers face north, defenders south
    e.spawn(cell[0] + 0.5, this.nav.floorAt(cell[0], cell[1]), cell[1] + 0.5, yaw);
  }

  // Is any part (head or chest) of `e` visible from `eye`?
  canSee(eye, e) {
    for (const kind of ['head', 'chest']) {
      const pt = targetPointOf(e, kind, this._v);
      const dx = pt.x - eye.x, dy = pt.y - eye.y, dz = pt.z - eye.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 0.01) return true;
      const dir = new THREE.Vector3(dx / len, dy / len, dz / len);
      if (!this.world.raycast(eye, dir, len) && !this.throwables.blocksSight(eye, pt)) return true;
    }
    return false;
  }

  // Clear view between two points? (walls and Cloud Puffs block it)
  lineOfSight(from, to) {
    const d = to.clone().sub(from);
    const len = d.length();
    if (len < 0.01) return true;
    d.divideScalar(len);
    return !this.world.raycast(from, d, len) && !this.throwables.blocksSight(from, to);
  }

  // A nearby walkable spot that someone at `threatEye` can't see. Returns [x, z] or null.
  findCover(from, threatEye, radius = 9) {
    const nav = this.nav, p = new THREE.Vector3();
    const [cx, cz] = nav.cellOf(from);
    let best = null, bestScore = Infinity;
    for (let i = 0; i < 48; i++) {
      const x = cx + Math.round((Math.random() * 2 - 1) * radius);
      const z = cz + Math.round((Math.random() * 2 - 1) * radius);
      if (!nav.walkable(x, z)) continue;
      const fy = nav.floorAt(x, z);
      if (Math.abs(fy - from.y) > 1.1) continue;
      p.set(x + 0.5, fy + 1.5, z + 0.5);
      if (this.lineOfSight(threatEye, p)) continue;               // they'd still see us there
      const dMe = Math.hypot(p.x - from.x, p.z - from.z);
      const dThreat = Math.hypot(p.x - threatEye.x, p.z - threatEye.z);
      const score = dMe - dThreat * 0.3;                           // close to us, away from them
      if (score < bestScore) { bestScore = score; best = [x, z]; }
    }
    return best;
  }

  // A good spot to guard from inside an area: next to a wall or crate, and able to
  // watch `watch` ([x, z]) from a sensible distance. Returns [x, z] or null.
  findHoldSpot(rect, watch) {
    const nav = this.nav, p = new THREE.Vector3();
    const w = new THREE.Vector3(watch[0], this.mapInfo.spawn.y + 1.4, watch[1]);
    let best = null, bestScore = -Infinity;
    for (let i = 0; i < 30; i++) {
      const x = rect.x0 + Math.floor(Math.random() * (rect.x1 - rect.x0 + 1));
      const z = rect.z0 + Math.floor(Math.random() * (rect.z1 - rect.z0 + 1));
      if (!nav.walkable(x, z)) continue;
      p.set(x + 0.5, nav.floorAt(x, z) + 1.5, z + 0.5);
      const d = Math.hypot(p.x - w.x, p.z - w.z);
      if (d < 6 || !this.lineOfSight(p, w)) continue;
      const cover = nav.penalty[z * nav.sx + x] > 0 ? 2 : 0;     // tucked against something
      const score = cover + (d > 8 && d < 22 ? 1 : 0) + Math.random() * 0.8;
      if (score > bestScore) { bestScore = score; best = [x, z]; }
    }
    return best;
  }

  // Knife swipe: pops the closest enemy right in front of you (within reach). Returns true on a hit.
  melee(attacker, eye, dir, def) {
    let best = null, bestD = Infinity;
    const chest = new THREE.Vector3();
    for (const e of this.entities) {
      if (!e.alive || e === attacker || e.team === attacker.team) continue;
      targetPointOf(e, 'chest', chest);
      const to = chest.clone().sub(eye);
      const d = to.length();
      if (d > def.reach + 0.3 || to.divideScalar(d).dot(dir) < 0.72) continue;   // too far / not in front
      if (!this.lineOfSight(eye, chest)) continue;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (!best) return false;
    const point = targetPointOf(best, 'chest', new THREE.Vector3());
    this.applyHit(attacker, best, 'body', def.damage.body, point, dir, 'knife');
    return true;
  }

  // One bubble shot (one pellet). Bubbles pass through teammates.
  fireShot(shooter, eye, dir, gun, muzzle = null) {
    const def = gun.def;
    if (this.onShot) this.onShot(shooter);
    const wallHit = this.world.raycast(eye, dir, def.range);
    let best = wallHit ? wallHit.t : def.range;
    let target = null, part = null;
    const o = [eye.x, eye.y, eye.z], d = [dir.x, dir.y, dir.z];
    for (const e of this.entities) {
      if (!e.alive || e === shooter || e.team === shooter.team) continue;
      for (const hb of e.hitboxes()) {
        const r = rayAABB(o, d, hb.min, hb.max);
        if (r && r.t < best) { best = r.t; target = e; part = hb.part; }
      }
    }
    const end = eye.clone().addScaledVector(dir, best);
    const from = muzzle || shooter.model.muzzlePosition(new THREE.Vector3());
    this.effects.bubbleTrail(from, end);

    if (target) {
      const dmg = Math.round(def.damage[part] * gun.falloff(best));
      this.applyHit(shooter, target, part, dmg, end, dir, def.key);
    } else if (wallHit) {
      this.effects.bubbleBurst(wallHit.point, wallHit.normal, 6, 1.2);
      this.effects.foamSpot(wallHit.point, wallHit.normal);
    }
  }

  // A shot, arrow or bubble bomb landed on someone. `weapon` = what did it (for the pop feed).
  applyHit(shooter, target, part, dmg, point, dir, weapon) {
    const out = target.takeHit(dmg, part, shooter);
    if (shooter.isPlayer) {
      HUD.hitmarker(part, out, dmg);
      if (out) Sound.kill(); else if (part === 'head') Sound.headshot(); else Sound.hit();
    }
    if (!target.isPlayer && !out) {
      this.effects.bubbleBurst(point, dir.clone().negate(), 6, 1.5);
      this.effects.confettiBurst(point, part === 'head' ? 10 : 5, 2);
    }
    if (out) this.pop(target, shooter, part, weapon);
  }

  // Someone is out: burst them into pixels and tell the mode.
  // `attacker` is null when the Boo-Boo bloom got them.
  pop(victim, attacker, part, weapon) {
    if (victim.alive) { victim.alive = false; victim.health = 0; }
    victim.actionHeld = false;
    if (victim.stats) victim.stats.outs++;
    if (attacker && attacker.stats && attacker.team !== victim.team) attacker.stats.pops++;
    const center = victim.pos.clone();
    center.y += 1;
    const from = attacker ? attacker.pos : (this.mode.boo ? this.mode.boo.pos : victim.pos);
    const push = victim.pos.clone().sub(from).setY(0);
    if (push.lengthSq() > 1e-6) push.normalize();
    this.effects.pixelBurst(victim.burst(), center, push, PIXEL * 0.95);
    Sound.shatter(this._volumeAt(center));
    if (this.mode.kind !== 'practice') this.drops.drop(victim);   // their blaster falls to the ground
    this.mode.onOut(victim, attacker, part, weapon);
    for (const b of this.bots) if (b.alive && b.onPopped) b.onPopped(victim, attacker);
  }

  // Running makes noise (walking with Shift or crouching is silent).
  footsteps(e, dt) {
    const m = e.mover;
    const v = m.horizontalSpeed;
    if (!m.onGround || v < PLAYER.walkSpeed + 0.4) { e.stepDist = 0; return; }
    e.stepDist = (e.stepDist || 0) + v * dt;
    if (e.stepDist > 2.1) {
      e.stepDist = 0;
      Sound.step(e.isPlayer ? 0.35 : this._volumeAt(m.pos) * 0.9);
      // enemy bots nearby hear it
      for (const b of this.bots)
        if (b.alive && b.team !== e.team && b.pos.distanceTo(m.pos) < 20) b.hear(m.pos.clone());
    }
  }

  _volumeAt(p) {
    const d = this.camera.position.distanceTo(p);
    return 1 / (1 + d / 8);
  }

  // Characters can't stand inside each other: gently push overlapping pairs apart.
  _separate() {
    const movers = this.entities.filter(e => e.alive && e.mover);
    const minD = PLAYER.radius * 2;
    for (let i = 0; i < movers.length; i++)
      for (let j = i + 1; j < movers.length; j++) {
        const a = movers[i].mover, b = movers[j].mover;
        if (Math.abs(a.pos.y - b.pos.y) > 1.7) continue;
        let dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        let d = Math.hypot(dx, dz);
        if (d >= minD) continue;
        if (d < 1e-4) { dx = Math.random() - 0.5; dz = Math.random() - 0.5; d = Math.hypot(dx, dz); }
        const push = (minD - d) / 2;
        this._nudge(a, -dx / d * push, -dz / d * push);
        this._nudge(b, dx / d * push, dz / d * push);
      }
  }

  // Move sideways only if it doesn't put them inside a wall.
  _nudge(m, dx, dz) {
    const r = PLAYER.radius, p = m.pos;
    if (!this.world.boxesIn(p.x + dx - r, p.y + 0.01, p.z + dz - r, p.x + dx + r, p.y + m.bodyHeight, p.z + dz + r).length) {
      p.x += dx; p.z += dz;
    }
  }

  update(dt) {
    this.time += dt;
    const frozen = this.mode.frozen;
    for (const b of this.bots) b.update(dt, frozen);
    for (const dm of this.dummies) dm.update(dt, this.camera);
    this.arrows.update(dt);
    this.throwables.update(dt);
    this.drops.update(dt);
    for (const b of this.bots) if (b.alive) this.footsteps(b, dt);
    this._separate();
    this.mode.update(dt);
  }
}
