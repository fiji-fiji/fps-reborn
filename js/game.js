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
const v3 = v => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];   // a vector, small, for sending

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
  // net (LAN play, see net.js): { role: 'host'|'guest', myId, players: [{ id, name, team }], noBots }
  constructor({ scene, world, mapInfo, effects, camera, difficulty = 'easy', modeName = 'standard', net = null }) {
    Object.assign(this, { scene, world, mapInfo, effects, camera });
    this.time = 0;
    this.playerTeam = 'blue';
    this.entities = [];
    this._v = new THREE.Vector3();
    this.arrows = new Arrows(this);
    this.throwables = new Throwables(this);
    this.drops = new Drops(this);
    this.net = null;                     // set by NetHost / NetGuest once the game exists
    this.isGuest = !!net && net.role === 'guest';
    this.firstAttack = (net && net.firstAttack) || null;   // a friend's game: the side the host's game drew
    this.remotes = [];                   // the other human (LAN play)
    this.bots = [];

    if (net && mapInfo.spawns) {
      // LAN: both computers build the same line-up in the same order (so ids, hats and
      // colours match). You are 'H' on the host; each friend has their own id.
      this.nav = new NavGrid(world, mapInfo.spawn.y);
      const roster = netRoster(net), localId = net.myId;
      this.playerTeam = roster.find(r => r.id === localId).team;
      roster.forEach((r, i) => {
        const shirt = TEAM_SHIRTS[r.team][r.teamIdx % 5];
        let e;
        if (r.id === localId) { e = this.player = new PlayerAgent(this); }
        else if (r.human) { e = new RemoteHuman(this, r.name, r.team, shirt, i + 1); this.remotes.push(e); }
        else { e = new Bot(this, r.name, r.team, shirt, difficulty, i + 1); this.bots.push(e); }
        e.netId = r.id;
        this.entities.push(e);
      });
      this.dummies = [];
    } else {
      this.player = new PlayerAgent(this);
      this.entities.push(this.player);
      this.dummies = (mapInfo.buddies || []).map(([x, y, z, s]) => new Dummy(scene, x, y, z, s));
      this.entities.push(...this.dummies);
    }

    if (mapInfo.spawns) {
      if (!net) {
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
      }
      // everyone gets their own hat, with a flower in their own player colour
      let hatN = 0;
      for (const team of ['blue', 'red']) {
        this.entities.filter(e => e.team === team && e.model).forEach((e, i) => {
          e.color = PLAYER_COLORS[i % PLAYER_COLORS.length];
          e.model.addHat(HAT_STYLES[hatN++ % HAT_STYLES.length], e.color);
        });
      }
      this.mode = modeName === 'skirmish' ? new SkirmishMode(this)
        : new StandardMode(this, modeName === 'swiftplay' ? SWIFTPLAY : {});
    } else {
      this.mode = new PracticeMode(this);
    }
  }

  get hasTeams() { return this.bots.length > 0 || this.remotes.length > 0; }
  byNetId(id) { return this.entities.find(e => e.netId === id) || null; }
  _ev(ev) { if (this.net && this.net.event) this.net.event(ev); }    // tell the guest (host only)

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
      e.roundBuys.nades = e.roundBuys.nades || {};
      e.roundBuys.nades[item] = (e.roundBuys.nades[item] || 0) + 1;
      return true;
    }
    if (WEAPONS[item]) {
      const def = WEAPONS[item];
      if (e.guns.main && e.guns.main.def === def) { e.slot = 'main'; return false; }   // already have it
      if (e.roundBuys.main) e.money += this.priceOf(e.roundBuys.main);
      else e.roundBuys.prevMain = e.guns.main;          // what you had before, in case you sell it back
      e.money -= price;
      giveWeapon(e, item);
      e.roundBuys.main = item;
      e.roundBuys.mainGun = e.guns.main;
    } else {
      const s = SHIELDS[item];
      if (!e.roundBuys.shield) e.roundBuys.prevShield = e.shield;
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

  // Changed your mind? Sell back something you bought this buy phase, for the full price.
  sell(e, item) {
    if (!this.mode.canBuy(e)) return false;
    const rb = e.roundBuys;
    if (GRENADES[item]) {
      if (!rb.nades || !rb.nades[item] || e.nades[item] <= 0) return false;
      rb.nades[item]--;
      e.nades[item]--;
      e.money += this.priceOf(item);
    } else if (WEAPONS[item]) {
      if (rb.main !== item || e.guns.main !== rb.mainGun) return false;
      e.money += this.priceOf(item);
      e.guns.main = rb.prevMain || null;
      if (!e.guns.main && e.slot === 'main') e.slot = 'side';
      rb.main = rb.mainGun = rb.prevMain = null;
    } else if (SHIELDS[item]) {
      if (rb.shield !== item) return false;
      e.money += this.priceOf(item);
      e.shield = rb.prevShield || 0;
      rb.shield = null;
    } else return false;
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
    // a map can say which way each spawn faces; otherwise attackers face north, defenders south
    const yaw = rect.yaw !== undefined ? rect.yaw : side === 'attack' ? 0 : Math.PI;
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
  // ---- team intel: what each team knows about where its enemies are (like call-outs) ----
  // seen = actually seen (exact); otherwise heard (rough).
  addIntel(team, who, pos, seen) {
    if (!this.intel) this.intel = {};
    const list = this.intel[team] || (this.intel[team] = []);
    const key = who || pos;
    const old = list.find(i => i.who === key);
    if (old && !seen && old.seen && this.time - old.t < 1.5) return;      // a fresh sighting beats a sound
    const entry = old || { who: key };
    entry.pos = pos.clone(); entry.t = this.time; entry.seen = seen;
    if (!old) list.push(entry);
    if (list.length > 12) list.shift();
  }
  // what `team` knows from the last `maxAge` seconds (living enemies only)
  intelFor(team, maxAge = 8) {
    const list = (this.intel && this.intel[team]) || [];
    return list.filter(i => this.time - i.t <= maxAge && !(i.who && i.who.alive === false));
  }

  // Somewhere `threatEye` can't see. `toward` (optional): prefer spots closer to it (your teammates).
  findCover(from, threatEye, radius = 9, toward = null) {
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
      let score = dMe - dThreat * 0.3;                             // close to us, away from them
      if (toward) score += Math.hypot(p.x - toward.x, p.z - toward.z) * 0.25;   // and back toward friends
      if (score < bestScore) { bestScore = score; best = [x, z]; }
    }
    return best;
  }

  // A good spot to guard from inside an area: next to a wall or crate, and able to
  // watch `watch` ([x, z]) from a sensible distance. Returns [x, z] or null.
  // Whoever is closer to an angle loses: hold it from as far back as you can see it
  // (unless you carry a close-range blaster, then stay close and pounce).
  findHoldSpot(rect, watch, closeRange = false) {
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
      const range = closeRange ? (d < 10 ? 1.5 : -0.5) : Math.min(d, 30) * 0.12;   // far back = safer
      const score = cover + range + Math.random() * 0.8;
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
    // a bot's first shot in a fight never lands on the head (getting one-tapped out of nowhere isn't fun)
    if (!shooter.isPlayer && !shooter.isHuman) {
      if (this.time - (shooter._lastShotT ?? -99) > 1.2) shooter._volleyT = this.time;
      shooter._lastShotT = this.time;
      if (part === 'head' && shooter._volleyT === this.time) part = 'body';
    }
    const end = eye.clone().addScaledVector(dir, best);
    const from = muzzle || shooter.model.muzzlePosition(new THREE.Vector3());
    this.effects.shotTrail(from, end);
    if (this.isGuest) {                            // the guest only draws it (and tells the host)
      if (!target && wallHit) { this.effects.bubbleBurst(wallHit.point, wallHit.normal, 3, 1.2); this.effects.foamSpot(wallHit.point, wallHit.normal); }
      if (shooter.isPlayer) this.net.out({ t: 'shot', eye: v3(eye), dir: v3(dir), k: def.key });
      return;
    }
    this._ev({ t: 'shot', s: shooter.netId, a: v3(from), b: v3(end), k: def.key, n: !target && wallHit ? v3(wallHit.normal) : null });

    if (target) {
      const dmg = Math.round(def.damage[part] * gun.falloff(best));
      this.applyHit(shooter, target, part, dmg, end, dir, def.key);
    } else if (wallHit) {
      this.effects.bubbleBurst(wallHit.point, wallHit.normal, 3, 1.2);
      this.effects.foamSpot(wallHit.point, wallHit.normal);
    }
  }

  // A shot, arrow or bubble bomb landed on someone. `weapon` = what did it (for the pop feed).
  applyHit(shooter, target, part, dmg, point, dir, weapon) {
    if (this.mode.frozen || this.isGuest) return; // before GO, shots are just for practice (and the host decides hits)
    const out = target.takeHit(dmg, part, shooter);
    this._ev({ t: 'hit', a: shooter.netId, v: target.netId, p: part, o: out, d: dmg, pt: v3(point), dir: v3(dir) });
    if (shooter.isPlayer) {
      HUD.hitmarker(part, out, dmg);
      if (out) Sound.kill(); else if (part === 'head') Sound.headshot(); else Sound.hit();
    }
    if (part === 'head' && !target.isPlayer) this.effects.starPop(targetPointOf(target, 'head', new THREE.Vector3()));
    if (!target.isPlayer && !out) {
      this.effects.bubbleBurst(point, dir.clone().negate(), 4, 1.5);
      this.effects.confettiBurst(point, part === 'head' ? 10 : 5, 2);
    }
    if (out) this.pop(target, shooter, part, weapon);
  }

  // Someone is out: burst them into pixels and tell the mode.
  // `attacker` is null when the Boo-Boo bloom got them.
  pop(victim, attacker, part, weapon, fromNet = false) {
    if (this.isGuest && !fromNet) return;           // on the guest, pops come from the host
    if (victim.alive) { victim.alive = false; victim.health = 0; }
    this._ev({ t: 'pop', v: victim.netId, a: attacker ? attacker.netId : null, p: part, w: weapon });
    victim.actionHeld = false;
    if (victim.stats) victim.stats.outs++;
    if (attacker && attacker.stats && attacker.team !== victim.team) attacker.stats.pops++;
    const center = victim.pos.clone();
    center.y += 1;
    const from = attacker ? attacker.pos : (this.mode.boo ? this.mode.boo.pos : victim.pos);
    const push = victim.pos.clone().sub(from).setY(0);
    if (push.lengthSq() > 1e-6) push.normalize();
    this.effects.pixelBurst(victim.burst(), center, push, PIXEL * 0.95);
    Sound.at(center, 'shatter', this._volumeAt(center));
    if (fromNet) { HUD.feed(attacker, victim, part === 'head', weapon); if (victim.isPlayer) HUD.showOut(attacker ? attacker.name : 'the blooming tree', null); return; }
    if (this.mode.kind !== 'practice') this.drops.drop(victim);   // their blaster falls to the ground
    // remember where fights happen: bots keep their crosshair on these spots while moving
    this.hotSpots = this.hotSpots || [];
    this.hotSpots.push(victim.pos.clone());
    if (attacker && attacker.pos && attacker.mover) this.hotSpots.push(attacker.pos.clone());
    while (this.hotSpots.length > 40) this.hotSpots.shift();
    this.mode.onOut(victim, attacker, part, weapon);
    for (const b of this.bots) if (b.alive && b.onPopped) b.onPopped(victim, attacker);
  }

  // Running makes noise (walking with Shift or crouching is silent).
  // Footsteps (running only; walking and crouching are silent). Each step comes from that
  // foot's exact spot (left, right, left…) and sounds like the ground it lands on.
  footsteps(e, dt) {
    const m = e.mover;
    const v = m.horizontalSpeed;
    // landing after a jump or a drop: a thump everyone nearby hears
    if (m.onGround && e._wasAir && (e._fallSpeed || 0) > 3) this._footSound(e, 'land', 1.1);
    e._wasAir = !m.onGround;
    e._fallSpeed = m.onGround ? 0 : Math.max(e._fallSpeed || 0, -m.vel.y);
    if (!m.onGround || v < PLAYER.walkSpeed + 0.4) { e.stepDist = 0; return; }
    e.stepDist = (e.stepDist || 0) + v * dt;
    if (e.stepDist > 2.1) {
      e.stepDist = 0;
      this._footSound(e, 'step', 1);
    }
  }

  _footSound(e, kind, loud) {
    const m = e.mover;
    const id = this.world.get(Math.floor(m.pos.x), Math.floor(m.pos.y - 0.05), Math.floor(m.pos.z));
    const surface = Sound.surfaceOf(id && BLOCK_DEFS[id] ? BLOCK_DEFS[id].name : null);
    e.foot = -(e.foot || 1);                                   // left, right, left…
    if (e.isPlayer) { Sound[kind](0.32 * loud, surface); }
    else {
      const side = new THREE.Vector3(Math.cos(m.yaw), 0, -Math.sin(m.yaw)).multiplyScalar(0.14 * e.foot);
      const at = m.pos.clone().add(side).setY(m.pos.y + 0.05);
      Sound.at(at, kind, this._volumeAt(at) * 1.15 * loud, surface);
    }
    // enemy bots nearby hear it too
    if (!this.isGuest) for (const b of this.bots)
      if (b.alive && b.team !== e.team && b.pos.distanceTo(m.pos) < 22) b.hear(m.pos.clone(), 'step', e);
  }

  _volumeAt(p) {
    const d = this.camera.position.distanceTo(p);
    return 1 / (1 + d / 8);
  }

  // Refilling gurgles: enemies close by hear it.
  reloadHeard(e) {
    for (const b of this.bots)
      if (b.alive && b.team !== e.team && b.pos.distanceTo(e.pos) < 12) b.hear(e.pos.clone(), 'reload', e);
  }

  // A gunshot: everyone hears it (you in 3D), bots get to know roughly where it came from.
  shotHeard(shooter, pos, key) {
    if (!shooter.isPlayer) Sound.at(pos, 'shoot', this._volumeAt(pos), key);
    // shooting gives you away: an enemy who fires near you shows as a red dot on your minimap
    const me = this.player;
    if (me && me.alive && shooter.team !== me.team && shooter.team !== 'buddy' && me.pos.distanceTo(pos) < 40)
      shooter.spottedUntil = Math.max(shooter.spottedUntil || 0, this.time + 1.5);
    for (const b of this.bots)
      if (b.alive && b.team !== shooter.team && b.pos.distanceTo(pos) < 40) b.hear(pos.clone(), 'shot', shooter);
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
    if (this.isGuest) { this.net.update(dt); return; }   // the guest's world follows the host (net.js)
    this.time += dt;
    const frozen = this.mode.frozen;
    // holding the knife makes anyone move 1.5x faster
    for (const e of this.entities) if (e.mover) e.mover.speedMul = e.slot === 'knife' ? KNIFE_SPEED : 1;
    for (const b of this.bots) b.update(dt, frozen);
    for (const dm of this.dummies) dm.update(dt, this.camera);
    this.arrows.update(dt);
    this.throwables.update(dt);
    this.drops.update(dt);
    for (const r of this.remotes) r.update(dt);
    for (const b of this.bots) if (b.alive) this.footsteps(b, dt);
    for (const r of this.remotes) if (r.alive) this.footsteps(r, dt);
    this._separate();
    this.mode.update(dt);
  }
}
