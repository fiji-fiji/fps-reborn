// Bots: they move around the map using the nav grid, spot enemies they can actually
// see, turn to aim (with human-like error, wobble and reaction time), shoot in bursts,
// strafe between bursts, chase where they last saw you, and turn toward whoever hits
// them. Where they go comes from the game mode (plant, defend a site, uproot, ...).
// They use the same movement and blaster as you.
//
// How they think (fps principles: information wins fights):
//  - Team intel: what one bot sees or hears is shared with its team (call-outs).
//  - Cone of danger: when not fighting, the crosshair sits on the freshest known enemy spot.
//  - Info advantage: if we know where someone is and they don't know about us, go peek
//    them pre-aimed (they still have to notice us and turn). A reload or close footsteps
//    heard with a close-range blaster = pounce.
//  - Stealth vs spotted: once an enemy has seen us (or we shot), don't stay put and don't
//    chase blindly: relocate somewhere hidden, back toward teammates.
//  - Hold angles from far back (closer to the corner = seen first), unless close-range.
//  - Sound is information: footsteps, shots, refills and the chainsaw all tell them things.
//  - Hard bots are cunning (see BOT_LEVELS.hard.cunning): sneakier and crueller, never better aim.
//
// Pre-aim fundamentals (how good players think before they aim):
//  - Reticle placement: while moving, the crosshair sits on where enemies most likely are
//    (spots where fights happened, site entrances) instead of on the path ahead.
//  - Teammates are clearing help: when one falls back hurt, healthy friends nearby cover the
//    way the threat comes from.
//  - Don't get sandwiched: enemies known on two sides = back off and take them one at a time.
//  - Red-dot luring (cunning): fire a couple of shots to give away a spot, then move off and
//    hold whoever comes to check it.

const BOT_LEVELS = {
  easy: {
    reaction: 0.9,      // seconds from spotting you to first shot (+ a bit more when far)
    sight: 38,          // how far they notice people (m)
    turnSpeed: 4,       // how quickly the aim settles (higher = snappier)
    maxTurn: 3,         // rad/s turning limit
    aimError: 0.16,     // starting aim offset (radians), shrinks while tracking
    errorDecay: 0.7,
    wobble: 0.03,       // aim never fully steady
    headChance: 0.05,   // chance of aiming at the head instead of the body
    recoilComp: 0.1,    // how well they pull down against recoil
    fireCone: 0.09,
    burst: [3, 6], burstPause: 0.8,
    stopToShoot: false, strafe: false,
  },
  normal: {
    reaction: 0.6, sight: 48, turnSpeed: 6, maxTurn: 5, aimError: 0.1, errorDecay: 1.2,
    wobble: 0.016, headChance: 0.15, recoilComp: 0.4, fireCone: 0.055,
    burst: [3, 5], burstPause: 0.55, stopToShoot: true, strafe: true,
  },
  hard: {
    reaction: 0.38, sight: 60, turnSpeed: 9, maxTurn: 8, aimError: 0.055, errorDecay: 2.2,
    wobble: 0.008, headChance: 0.35, recoilComp: 0.7, fireCone: 0.035,
    burst: [2, 4], burstPause: 0.35, stopToShoot: true, strafe: true,
    // the aim numbers above never go up for "smarter" bots. Hard bots are nastier in how they
    // PLAY instead: silent walking, fakes, lurkers cutting off rotations, ambushes on footsteps,
    // grouped retakes, sparkles before peeks, pouncing on weak or dazzled players, jiggly strafes.
    cunning: true,
  },
};

const wrapAngle = a => Math.atan2(Math.sin(a), Math.cos(a));
const randRange = ([a, b]) => a + Math.floor(Math.random() * (b - a + 1));

// Point on a character to aim at: 'head' or 'chest'.
function targetPointOf(e, kind, out) {
  const k = (e.mover ? e.mover.bodyHeight : PLAYER.height) / PLAYER.height;
  return out.set(e.pos.x, e.pos.y + (kind === 'head' ? 1.6 : 1.1) * k, e.pos.z);
}

// yaw/pitch (Mover convention) to look from `from` at `to`.
function anglesTo(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  return [Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz))];
}

class Bot {
  constructor(game, name, team, shirt, levelName = 'easy', seed = 1) {
    this.game = game;
    this.name = name;
    this.team = team;
    this.level = BOT_LEVELS[levelName] || BOT_LEVELS.easy;
    this.mover = new Mover(game.world);
    resetLoadout(this);          // main slot + Dandelion sidearm + shield
    this.money = 0;
    const friendly = team === game.playerTeam;
    this.model = new CharacterModel(game.scene, {
      shirt, armed: true, seed, species: TEAM_SPECIES[team], pants: TEAM_PANTS[team],
      name: friendly ? name : null, nameColor: TEAM_CSS[team],
    });
    this.seed = seed;
    this.alive = false;
    this.health = 100;
    this.respawnIn = 0;
    this.spottedUntil = 0;
    this.carrying = false;
    this.actionHeld = false;     // holding "plant" / "uproot"
    this.blindUntil = 0;         // dazzled by a Sparkle Pop
    this.stats = { pops: 0, outs: 0 };
    this.lastNade = -99;
    this.utilRound = -1;
    // sneaky stuff
    this.boldness = (Math.random() - 0.5) * 0.8;   // personality: some bots take more risks
    this.tactic = null;          // { type: 'hide' | 'hold', look, until } — retreating to cover / holding an angle
    this.heardAt = -99; this.lastSeenAt = -99; this.lastEval = -99; this.lastHide = -99;

    this.path = null; this.pathIdx = 0;
    this.goal = null; this.goalVersion = -1;
    this.waitTimer = 0; this.idleYaw = 0;
    this.target = null; this.targetVisible = false;
    this.seenTime = 0; this.lostTime = 0;
    this.lastSeen = new THREE.Vector3();
    this.lookAt = null;
    this.aimHead = false; this.errYaw = 0; this.errPitch = 0;
    this.burstLeft = 3; this.pauseTimer = 0;
    this.strafeDir = 1; this.strafeTimer = 0;
    this.scanTimer = Math.random() * 0.1;
    this.stuckTimer = 0; this.stuckCount = 0; this.stuckPos = new THREE.Vector3();
    this._eye = new THREE.Vector3(); this._pt = new THREE.Vector3();
  }

  get pos() { return this.mover.pos; }
  get gun() { return this.guns[this.slot] || this.guns.side; }

  spawn(x, y, z, yaw) {
    this.mover.spawn(x, y, z, yaw);
    this.fakeSmoked = false;
    this.health = 100;
    this.alive = true;
    this.carrying = false;
    this.actionHeld = false;
    this.path = null; this.goal = null;
    this.target = null; this.targetVisible = false; this.lookAt = null; this.chasing = false;
    this.tactic = null; this.heardAt = -99; this.lastSeenAt = -99;
    this.waitTimer = Math.random() * 0.8;
    this.idleYaw = yaw;
    this.model.setVisible(true);
    this.model.setPose(this.mover.pos, yaw);
  }

  hitboxes() { return characterHitboxes(this.mover.pos, this.mover.bodyHeight); }
  targetPoint(kind, out) { return targetPointOf(this, kind, out); }

  // Returns true if this hit popped the bot.
  takeHit(dmg, part, attacker) {
    if (!this.alive) return false;
    applyDamage(this, dmg);
    this.model.hitFlash();
    if (this.health === 0) { this.alive = false; this.actionHeld = false; return true; }
    // hit by someone we can't see: turn toward them
    if (attacker && attacker.pos && !this.targetVisible) {
      this.target = attacker;
      this.lostTime = 0;
      this.seenTime = 0;
      this.lastSeen.copy(attacker.pos);
      this.lookAt = attacker.pos.clone().setY(attacker.pos.y + 1.4);
      if (this.health + this.shield < 60 && !this.carrying) this._hideFrom(attacker.pos);
    }
    return false;
  }

  burst() {
    const px = this.model.pixelize();
    this.model.setVisible(false);
    return px;
  }

  // ------------------------------------------------------------------
  update(dt, frozen) {
    this.model.update(dt, this.game.camera);
    // dazzled by a Sparkle Pop: a golden aura everyone can see (fades out at the end)
    const blind = this.alive ? this.blindUntil - this.game.time : 0;
    this.model.setAura(blind > 0 ? Math.min(1, blind / 0.6) : 0, this.game.time);
    if (!this.alive) return;
    this.model.setCarrying(this.carrying);
    if (frozen) { this._prepWander(dt); return; }       // round hasn't started: stroll around spawn
    if (this.prepPath) { this.prepPath = null; this.path = null; }   // GO! drop the stroll
    const mode = this.game.mode;
    this.slot = this.guns.main ? 'main' : 'side';           // bots always use their best blaster
    for (const g of Object.values(this.guns)) if (g) g.tick(dt);
    this.pauseTimer -= dt;

    // the objective changed (Boo-Boo dropped / planted, new rotation...): rethink
    if (this.goal && this.goalVersion !== mode.version) {
      this.goal = null; this.path = null; this.waitTimer = 0; this.actionHeld = false;
    }

    this.scanTimer -= dt;
    if (this.scanTimer <= 0) { this.scanTimer = 0.1; this._perceive(0.1); }
    const engaged = this.target && this.target.alive && this.targetVisible;
    if (engaged) {
      this.seenTime += dt;
      if (this.actionHeld) { this.actionHeld = false; this.path = null; }   // stop planting to fight
    }

    this._siteUtility();
    if (!engaged) { this._considerPeek(); this._lure(); }
    const cmd = { fwd: 0, right: 0, jump: false, crouch: false, walk: this._shouldSneak() };
    const move = this.actionHeld ? null : this._decideMove(dt, engaged, cmd);
    if (this.tactic && this.tactic.type === 'hold') cmd.crouch = true;   // small and quiet while holding an angle
    this._aim(dt, engaged, move);
    this._toCommand(move, cmd);
    this.mover.update(dt, cmd);
    this._checkStuck(dt, move);
    const hiding = this.tactic && this.tactic.type === 'hide';
    const close = engaged && this.target.pos.distanceTo(this.pos) < 6;
    if (engaged && (!hiding || close)) this._tryFire(dt); else this._idleReload();

    this.model.setPose(this.mover.pos, this.mover.yaw, this.mover.pitch + this.gun.recoilPitch,
      this.mover.horizontalSpeed, dt);
    // planting / sawing: the whole body does it, so everyone can see what's going on
    this.model.setAction(mode.planter === this ? 'plant' : mode.defuser === this ? 'saw' : null, this.game.time, mode.boo && mode.boo.pos);
  }

  // Before GO: wander around inside our spawn (walking, looking around), never leaving it.
  _prepWander(dt) {
    const g = this.game, me = this.mover;
    const fence = g.mode.spawnFence ? g.mode.spawnFence(this) : null;
    const cmd = { fwd: 0, right: 0, jump: false, crouch: false, walk: true };
    let move = null;
    if (fence && g.nav) {
      if (!this.prepPath || this.prepIdx >= this.prepPath.length) {
        this.prepWait = (this.prepWait || 0) - dt;
        if (this.prepWait <= 0) {
          const c = g.nav.randomIn(fence);
          this.prepPath = c ? g.nav.findPath(...g.nav.cellOf(me.pos), c[0], c[1]) : null;
          this.prepIdx = 1;
          this.prepWait = 0.8 + Math.random() * 2.5;
          this.idleYaw = me.yaw + (Math.random() - 0.5) * 2.5;
        }
      } else {
        const p = this.prepPath[this.prepIdx];
        const dx = p.x - me.pos.x, dz = p.z - me.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.5) this.prepIdx++;
        else move = { x: dx / d, z: dz / d };
      }
    }
    this.lookAt = null;
    this._aim(dt, false, move);
    this._toCommand(move, cmd);
    me.update(dt, cmd);
    if (fence) {
      me.pos.x = Math.max(fence.x0 + 0.35, Math.min(fence.x1 + 0.65, me.pos.x));
      me.pos.z = Math.max(fence.z0 + 0.35, Math.min(fence.z1 + 0.65, me.pos.z));
    }
    this.model.setPose(me.pos, me.yaw, 0, me.horizontalSpeed, dt);
  }

  // Look for the closest enemy we can actually see.
  _perceive(interval) {
    const g = this.game, me = this.mover, L = this.level;
    if (this.blindUntil > g.time) { this.targetVisible = false; return; }   // dazzled: can't see anyone
    const eye = me.eyePosition(this._eye);
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
    let best = null, bestD = Infinity;
    for (const e of g.entities) {
      if (!e.alive || e.team === this.team || e.team === 'buddy') continue;
      const dx = e.pos.x - me.pos.x, dz = e.pos.z - me.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > L.sight && e !== this.target) continue;
      const facing = (dx * fx + dz * fz) / (d || 1);
      if (d > 3 && facing < 0.3 && e !== this.target) continue;   // outside field of view
      if (!g.canSee(eye, e)) continue;
      if (d < bestD) { bestD = d; best = e; }
    }

    if (best) {
      if (best !== this.target) {
        this.target = best;
        this.seenTime = -bestD * 0.01;                 // farther = a little slower to react
        this.aimHead = Math.random() < L.headChance;
        const a = Math.random() * Math.PI * 2;
        const err = L.aimError * (0.6 + Math.random() * 0.8) * (1 + bestD / 30);
        this.errYaw = Math.cos(a) * err;
        this.errPitch = Math.sin(a) * err * 0.6;
        this.burstLeft = randRange(L.burst);
      } else if (!this.targetVisible) {
        this.seenTime = Math.min(this.seenTime, L.reaction * 0.5);   // re-spotted: quicker
      }
      const fresh = !this.targetVisible || best !== this._lastJudged;
      this.targetVisible = true;
      this.lostTime = 0;
      this.lastSeen.copy(best.pos);
      this.lastSeenAt = g.time;
      g.addIntel(this.team, best, best.pos, true);              // call it out to the team
      if (fresh || g.time - this.lastEval > 0.6) { this.lastEval = g.time; this._lastJudged = best; this._decideDuel(best, bestD); }
      this.lookAt = null;
      this.chasing = false;
      if (this.team === g.playerTeam) best.spottedUntil = g.time + 1.2;   // shows on your minimap
      (best.seenBy || (best.seenBy = {}))[this.team] = g.time + 1.2;      // (and on a LAN friend's, whichever team)
      if (g.mode.onSpotted) g.mode.onSpotted(this, best);
    } else if (this.target) {
      this.targetVisible = false;
      this.lostTime += interval;
      if (!this.target.alive || this.lostTime > 3) {
        this.target = null;
        this.lookAt = null;
        this.chasing = false;
        this.path = null;
      } else if (!this.chasing && this._spotted() && !this.carrying && !this._mustRush() &&
                 (this.health + this.shield < 80 || this.boldness < 0.15) && this._relocate(this.lastSeen)) {
        // they know where we are now: don't sit here and don't run at them; move somewhere else
      } else if (!this.chasing) {
        // go check where we last saw them
        this.chasing = true;
        this.goal = null;            // the objective resumes after the chase
        const d = Math.hypot(this.lastSeen.x - me.pos.x, this.lastSeen.z - me.pos.z);
        if (d > 5 && d < 25 && g.time - this.lastNade > 4 && Math.random() < 0.6) this._throw('frag', this.lastSeen.clone().setY(this.lastSeen.y + 0.3));
        this.lookAt = this.lastSeen.clone().setY(this.lastSeen.y + 1.4);
        this._pathTo(this.lastSeen.x, this.lastSeen.z);
      }
    }
  }

  // Were we seen (or did we shoot) in the last couple of seconds? Then they know where we are.
  _spotted() {
    const g = this.game, t = g.time;
    if (t - (this.gun.lastShotAt ?? -99) < 2 || t - (this.firedAt || -99) < 2) return true;
    for (const e of g.entities) {
      if (!e.alive || e.team === this.team || e.team === 'buddy') continue;
      if (e.target === this && e.targetVisible) return true;
      if ((e.isPlayer || e.isHuman) && e.mover) {                    // is a human looking at us?
        const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z, d = Math.hypot(dx, dz) || 1;
        const dot = (-Math.sin(e.mover.yaw) * dx - Math.cos(e.mover.yaw) * dz) / d;
        if (dot > 0.75 && d < 45 && g.canSee(e.mover.eyePosition(new THREE.Vector3()), this)) return true;
      }
    }
    return false;
  }

  // the objective says: go now (e.g. the tree has to be cut down)
  _mustRush() { return !!(this.goal && this.goal.rush) || !!(this.game.mode.botMustRush && this.game.mode.botMustRush(this)); }

  // the closest teammate (to fall back toward)
  _nearestFriend() {
    let best = null, bd = Infinity;
    for (const e of this.game.entities) {
      if (e === this || !e.alive || e.team !== this.team || !e.mover) continue;
      const d = e.pos.distanceTo(this.pos);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // Spotted: move to somewhere `threatPos` can't see, back toward the team.
  _relocate(threatPos) {
    const friend = this._nearestFriend();
    const eye = threatPos.clone().setY(threatPos.y + 1.5);
    const c = this.game.findCover(this.pos, eye, 10, friend ? friend.pos : null);
    if (!c || !this._pathTo(c[0] + 0.5, c[1] + 0.5)) return false;
    this.goal = null; this.chasing = false;
    this.tactic = { type: 'hide', look: threatPos.clone().setY(threatPos.y + 1.4), until: this.game.time + 6 };
    this.lastHide = this.game.time;
    if (this.health + this.shield < 60) this._askCover(threatPos);
    return true;
  }

  // Info advantage: walk up pre-aimed at where we know an enemy is.
  _peek(pos, seconds = 3) {
    if (!this._pathTo(pos.x, pos.z)) return false;
    // cunning: blind them first
    const d = Math.hypot(pos.x - this.pos.x, pos.z - this.pos.z);
    if (this.level.cunning && d > 6 && this.game.time - (this.lastNade || -99) > 5) this._throw('flash', pos.clone().setY(pos.y + 1.2));
    this.goal = null; this.chasing = false;
    this.tactic = { type: 'peek', look: pos.clone().setY(pos.y + 1.4), until: this.game.time + seconds };
    this.lookAt = this.tactic.look.clone();
    return true;
  }

  // Every so often: is there an enemy we know about who doesn't know about us? Go get them.
  _considerPeek() {
    const g = this.game, t = g.time;
    if (t - (this.lastPeekCheck || -9) < 0.6) return;
    this.lastPeekCheck = t;
    if (this.tactic || this.carrying || this.actionHeld || this._mustRush() || this._spotted()) return;
    if (this.health + this.shield < 55 || this.gun.busy) return;
    let best = null, bd = Infinity;
    for (const i of g.intelFor(this.team, 4)) {
      const d = Math.hypot(i.pos.x - this.pos.x, i.pos.z - this.pos.z);
      if (d < 5 || d > 16) continue;
      const enemy = i.who && i.who.alive !== undefined ? i.who : null;
      if (enemy && enemy.target === this && enemy.targetVisible) continue;   // they're onto us
      if (d < bd) { bd = d; best = i; }
    }
    if (!best) return;
    const enemy = best.who && best.who.alive !== undefined ? best.who : null;
    const score = enemy ? this._duelScore(enemy, bd) : this.boldness;
    if (score > -0.2) this._peek(best.pos, 3.5);
  }

  // Returns a world-space move direction { x, z } (or null to stand still).
  _decideMove(dt, engaged, cmd) {
    const L = this.level, me = this.mover, t = this.game.time;
    const tac = this.tactic;
    if (tac && t > tac.until) this.tactic = null;
    if (this.tactic && !engaged && this._mustRush()) { this.tactic = null; this.path = null; }   // the objective comes first
    if (this.tactic && this.tactic.type === 'hide') {
      if (!this.path) { this._startHold(this.tactic.look); return null; }
      return this._followPath(engaged, cmd);                        // backing off to cover
    }
    if (this.tactic && this.tactic.type === 'peek' && !engaged) {
      if (!this.path) { this._startHold(this.tactic.look, 1.5); return null; }   // nobody there: hold a moment
      return this._followPath(engaged, cmd);
    }
    if (engaged) {
      const aboutToShoot = this.seenTime >= L.reaction * 0.5 && this.pauseTimer <= 0 && this.gun.ammo > 0 && !this.gun.busy;
      if (L.stopToShoot && aboutToShoot) return null;                  // stand still for accuracy
      if (L.strafe) {                                                  // dodge side to side
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeDir = Math.random() < 0.5 ? -1 : 1;
          this.strafeTimer = L.cunning ? 0.18 + Math.random() * 0.3 : 0.3 + Math.random() * 0.5;   // cunning: jittery, hard to track
        }
        if (L.cunning) cmd.crouch = Math.sin(t * 6 + this.seed) > 0.55;   // ...and ducks now and then
        return { x: Math.cos(me.yaw) * this.strafeDir, z: -Math.sin(me.yaw) * this.strafeDir };
      }
      // easy bots just keep walking while shooting
    }
    if (this.tactic && this.tactic.type === 'hold') return null;     // waiting at a corner, pre-aimed

    if (!this.path) {
      if (this.waitTimer > 0) {
        this.waitTimer -= dt;
        cmd.crouch = !!(this.goal && this.goal.hold >= 5);           // crouch while guarding a spot
        return null;
      }
      this._pickGoal();
      if (!this.path) return null;
    }
    return this._followPath(engaged, cmd);
  }

  _followPath(engaged, cmd) {
    const me = this.mover;
    const p = this.path[this.pathIdx];
    const dx = p.x - me.pos.x, dz = p.z - me.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.5) {
      this.pathIdx++;
      if (this.pathIdx >= this.path.length) { this._arrived(engaged); return null; }
      return this._followPath(engaged, cmd);
    }
    if (p.jump && d < 1.4 && me.onGround) cmd.jump = true;
    return { x: dx / d, z: dz / d };
  }

  _arrived(engaged) {
    this.path = null;
    if (this.tactic && (this.tactic.type === 'hide' || this.tactic.type === 'peek')) { this._startHold(this.tactic.look, this.tactic.type === 'peek' ? 1.5 : undefined); return; }
    this.chasing = false;
    if (!engaged) this.lookAt = null;
    const goal = this.goal;
    if (goal && goal.fakeSmoke && !this.fakeSmoked) {           // the fake: a cloud on the site we're NOT taking
      this.fakeSmoked = true;
      this._throw('smoke', new THREE.Vector3(goal.fakeSmoke[0], this.mover.pos.y, goal.fakeSmoke[1]));
    }
    if (goal && goal.action) {
      this.actionHeld = true;                               // plant / uproot: hold still
      return;
    }
    this.waitTimer = goal && goal.hold != null ? goal.hold : 0.4 + Math.random() * 2;
    if (goal && goal.lookAt) {
      const [y] = anglesTo(this.mover.pos, new THREE.Vector3(goal.lookAt[0], this.mover.pos.y, goal.lookAt[1]));
      this.idleYaw = y;
    } else {
      this.idleYaw = this.mover.yaw + (Math.random() - 0.5) * 3;
    }
  }

  _pickGoal() {
    const mode = this.game.mode;
    this.goalVersion = mode.version;
    for (let tries = 0; tries < 4; tries++) {
      // no main blaster and one lying close by? go get it first
      const goal = (tries === 0 && this.game.drops.goalFor(this)) || mode.botGoal(this);
      if (!goal) { this.waitTimer = 0.5; return; }
      this.goal = goal;
      if (this._pathTo(goal.x, goal.z)) return;
    }
    this.goal = null;
    this.waitTimer = 0.5;
  }

  _pathTo(x, z) {
    const nav = this.game.nav;
    const [sx, sz] = nav.cellOf(this.mover.pos);
    this.path = nav.findPath(sx, sz, Math.floor(x), Math.floor(z));
    this.pathIdx = this.path && this.path.length > 1 ? 1 : 0;
    return !!this.path;
  }

  _aim(dt, engaged, move) {
    const L = this.level, me = this.mover;
    const eye = me.eyePosition(this._eye);
    let yaw, pitch;
    if (engaged) {
      const pt = this.target.targetPoint(this.aimHead ? 'head' : 'chest', this._pt);
      [yaw, pitch] = this._aimAngles(eye, pt);
      const k = Math.exp(-L.errorDecay * dt);
      this.errYaw *= k; this.errPitch *= k;
      const t = this.game.time + this.seed * 7.3;
      yaw += this.errYaw + (Math.sin(t * 2.3) + 0.5 * Math.sin(t * 5.1)) * L.wobble;
      pitch += this.errPitch + (Math.sin(t * 1.9 + 1) + 0.5 * Math.sin(t * 4.3)) * L.wobble * 0.7;
      // pull against recoil (better bots compensate more)
      pitch -= this.gun.recoilPitch * L.recoilComp;
      yaw -= this.gun.recoilYaw * L.recoilComp;
    } else if (this.lookAt) {
      [yaw, pitch] = anglesTo(eye, this.lookAt);
    } else if (this._danger()) {
      [yaw, pitch] = anglesTo(eye, this._danger());               // crosshair on where they probably are
    } else if (move && this._preAim(eye, move)) {
      [yaw, pitch] = anglesTo(eye, this._preAimPt);               // ...or on where fights usually happen
    } else if (move) {
      yaw = Math.atan2(-move.x, -move.z);
      pitch = 0;
    } else {
      yaw = this.idleYaw;
      pitch = 0;
    }
    const k = 1 - Math.exp(-L.turnSpeed * dt), lim = L.maxTurn * dt;
    const dyaw = Math.max(-lim, Math.min(lim, wrapAngle(yaw - me.yaw) * k));
    const dpitch = Math.max(-lim, Math.min(lim, (pitch - me.pitch) * k));
    me.yaw = wrapAngle(me.yaw + dyaw);
    me.pitch += dpitch;
  }

  // While moving with nothing known: the likeliest enemy spot ahead of us that we can see
  // (where fights happened before, site entrances), so the crosshair is already there.
  _preAim(eye, move) {
    const g = this.game, t = g.time;
    if (t - (this._preAimAt || -9) < 0.35) return !!this._preAimPt;
    this._preAimAt = t;
    this._preAimPt = null;
    const mode = g.mode, spots = [];
    for (const p of g.hotSpots || []) spots.push([p.x, p.z, 1.5]);
    if (mode.sites) for (const s of Object.values(mode.sites)) for (const e of s.entrances) spots.push([e[0], e[1], 1]);
    let best = null, bestScore = 0.25;
    const y = g.mapInfo.spawn.y + 1.4;
    for (const [x, z, w] of spots) {
      const dx = x - eye.x, dz = z - eye.z, d = Math.hypot(dx, dz);
      if (d < 5 || d > 30) continue;
      const ahead = (dx * move.x + dz * move.z) / d;               // in front of where we're walking
      if (ahead < 0.2) continue;
      const score = ahead * w * (1 - d / 45);
      if (score <= bestScore) continue;
      const pt = new THREE.Vector3(x, y, z);
      if (!g.lineOfSight(eye, pt)) continue;
      bestScore = score; best = pt;
    }
    this._preAimPt = best;
    return !!best;
  }

  // Ask healthy teammates nearby to cover us while we fall back from `threatPos`.
  _askCover(threatPos) {
    const look = threatPos.clone().setY(threatPos.y + 1.4);
    for (const f of this.game.bots) {
      if (f === this || !f.alive || f.team !== this.team) continue;
      if (f.pos.distanceTo(this.pos) > 14 || f.health + f.shield < 60) continue;
      if (f.targetVisible || f.tactic || f.carrying || f.actionHeld || f._mustRush()) continue;
      f._startHold(look, 3 + Math.random() * 2);
    }
  }

  // Enemies known on two different sides of us (within 20 m)? Then we'd get sandwiched.
  _sandwiched() {
    const g = this.game, dirs = [];
    for (const i of g.intelFor(this.team, 4)) {
      const dx = i.pos.x - this.pos.x, dz = i.pos.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d > 2 && d < 20) dirs.push(Math.atan2(dx, dz));
    }
    for (let a = 0; a < dirs.length; a++)
      for (let b = a + 1; b < dirs.length; b++)
        if (Math.abs(wrapAngle(dirs[a] - dirs[b])) > 1.9) return true;
    return false;
  }

  // Cunning defenders, bored on a quiet site: fire a couple of shots to give away this spot
  // (they'll hear it and come to check), then slip off somewhere that sees this spot.
  _lure() {
    const g = this.game, mode = g.mode, t = g.time;
    if (!this.level.cunning || mode.kind !== 'standard' || mode.phase !== 'live' || mode.sideOf(this.team) !== 'defend') return;
    if (this.targetVisible || this.tactic || this.path || this.waitTimer <= 0 || this.carrying) return;
    if (t - (this.lastLure || -99) < 30 || Math.random() > 0.01) return;
    const gun = this.gun;
    if (gun.def.bow || gun.ammo < 3 || !gun.ready) return;
    this.lastLure = t;
    const eye = this.mover.eyePosition(new THREE.Vector3());
    for (let i = 0; i < 2; i++) for (const dir of gun.fire(this.mover.yaw, this.mover.pitch, this.mover, true)) g.fireShot(this, eye.clone(), dir, gun);
    g.shotHeard(this, eye.clone(), gun.def.key);
    const here = this.pos.clone();
    const rect = { x0: Math.floor(here.x - 9), z0: Math.floor(here.z - 9), x1: Math.floor(here.x + 9), z1: Math.floor(here.z + 9) };
    const c = g.findHoldSpot(rect, [here.x, here.z], closeRangeGun(this));
    if (!c || !this._pathTo(c[0] + 0.5, c[1] + 0.5)) return;
    this.goal = null; this.waitTimer = 0;
    this.tactic = { type: 'hide', look: here.setY(here.y + 1.4), until: t + 12 };
  }

  // The freshest place an enemy is known to be (within 30 m, last 5 s), at head height.
  _danger() {
    const g = this.game;
    if (this._dangerAt === g.time) return this._dangerPos;
    this._dangerAt = g.time;
    let best = null, bt = -Infinity;
    for (const i of g.intelFor(this.team, 5)) {
      if (Math.hypot(i.pos.x - this.pos.x, i.pos.z - this.pos.z) > 30 || i.t <= bt) continue;
      bt = i.t; best = i;
    }
    this._dangerPos = best ? best.pos.clone().setY(best.pos.y + 1.4) : null;
    return this._dangerPos;
  }

  // Turn a world-space move direction into forward/right input relative to where we look.
  _toCommand(move, cmd) {
    if (!move) return;
    const yaw = this.mover.yaw;
    cmd.fwd = move.x * -Math.sin(yaw) + move.z * -Math.cos(yaw);
    cmd.right = move.x * Math.cos(yaw) + move.z * -Math.sin(yaw);
  }

  _checkStuck(dt, move) {
    this.stuckTimer += dt;
    if (this.stuckTimer < 0.8) return;
    this.stuckTimer = 0;
    const moved = this.stuckPos.distanceTo(this.mover.pos);
    this.stuckPos.copy(this.mover.pos);
    if (!move || !this.path || moved > 0.3) { this.stuckCount = 0; return; }
    this.stuckCount++;
    if (this.mover.onGround) this.mover.vel.y = PLAYER.jumpSpeed;   // hop over whatever is in the way
    if (this.stuckCount > 2) { this.path = null; this.stuckCount = 0; }
  }

  // ---------------- sneaky decisions ----------------

  // How well does a blaster suit this distance? (+ good, - bad)
  static weaponFit(def, d) {
    if (!def) return 0;
    switch (def.key) {
      case 'sunflower': return d < 8 ? 1.2 : d < 14 ? 0 : -1.2;
      case 'tulip': return d < 15 ? 0.4 : -0.4;
      case 'lily': return d > 15 ? 0.8 : -0.3;
      case 'rosebow': return d > 10 ? 0.4 : -0.3;
      case 'bloom': return 0.3;
      default: return -0.3;                                  // Dandelion
    }
  }

  // Positive = this fight is worth taking right now.
  _duelScore(enemy, dist) {
    const g = this.game;
    let s = this.boldness;
    s += (this.health + this.shield - (enemy.health + (enemy.shield || 0))) / 60;
    s += Bot.weaponFit(this.gun.def, dist) - 0.5 * Bot.weaponFit(enemy.gun && enemy.gun.def, dist);
    // are they looking at me? (backs turned = free pop, aimed at me = risky)
    if (enemy.mover) {
      const ey = enemy.mover.yaw;
      const tx = this.pos.x - enemy.pos.x, tz = this.pos.z - enemy.pos.z, tl = Math.hypot(tx, tz) || 1;
      const dot = (-Math.sin(ey) * tx - Math.cos(ey) * tz) / tl;
      if (dot < 0.3) s += 1.5; else if (dot > 0.85) s -= 0.6;
    }
    // numbers: friends close by vs enemies close by
    let friends = 0, foes = 0;
    for (const e of g.entities) {
      if (!e.alive || e === this || !e.mover) continue;
      const d = e.pos.distanceTo(this.pos);
      if (e.team === this.team && d < 12) friends++;
      else if (e.team !== this.team && e.team !== 'buddy' && d < 20) foes++;
    }
    s += 0.5 * (friends - (foes - 1));
    if (this.gun.busy) s -= 1.5;
    else if (!this.gun.def.bow && this.gun.ammo < this.gun.def.magSize * 0.25) s -= 1.2;
    if (this.tactic && this.tactic.type === 'hold') s += 0.8;     // we're already pre-aimed here
    if (dist < 5) s += 1.5;                                        // too close to run away
    if (dist >= 5 && this._sandwiched()) s -= 1.2;                 // enemies on two sides: don't stand between them
    if (this.level.cunning) {
      s += Math.max(0, 100 - enemy.health) / 45;                   // cruel: finish off the wounded
      if (enemy.blindUntil > g.time) s += 2;                       // ...and the dazzled
      if (enemy.gun && enemy.gun.busy) s += 1;                     // ...and the ones refilling
    }
    return s + this._urgency();
  }

  // The objective sometimes means you have to fight anyway.
  _urgency() {
    const mode = this.game.mode;
    if (mode.kind !== 'standard') return 0.3;
    const side = mode.sideOf(this.team);
    if (mode.phase === 'planted') return side === 'defend' ? (mode.timeLeft < 20 ? 2.5 : 0.6) : 0.3;
    if (mode.phase === 'live' && side === 'attack') {
      // attackers have to make something happen: the later it gets, the more they commit
      return 0.4 + 2.2 * (1 - mode.timeLeft / ROUND.live);
    }
    return 0;
  }

  _decideDuel(enemy, dist) {
    const hiding = this.tactic && this.tactic.type === 'hide';
    const score = this._duelScore(enemy, dist);
    const giveUpAt = this.carrying ? -1.2 : 0;                     // the seed carrier only runs when it's really bad
    if (score >= giveUpAt) { if (hiding) this.tactic = null; return; }
    if (!hiding) this._hideFrom(enemy.pos);
  }

  // Back off to a spot `threatPos` can't see. Returns true if we found one.
  _hideFrom(threatPos) {
    const t = this.game.time;
    if (t - this.lastHide < 6 && this.health + this.shield > 40) return false;   // don't keep running away
    const eye = threatPos.clone().setY(threatPos.y + 1.5);
    const c = this.game.findCover(this.pos, eye);
    if (!c) return false;
    const look = threatPos.clone().setY(threatPos.y + 1.4);
    this.goal = null; this.chasing = false; this.actionHeld = false;
    if (!this._pathTo(c[0] + 0.5, c[1] + 0.5)) return false;
    this.tactic = { type: 'hide', look, until: t + 7 };
    this.lastHide = t;
    if (this.health + this.shield < 60) this._askCover(threatPos);
    return true;
  }

  // Crouch at a corner, aimed at where they'll come from.
  _startHold(look, seconds = 3 + Math.random() * 3) {
    this.tactic = { type: 'hold', look, until: this.game.time + seconds };
    this.lookAt = look.clone();
    this.path = null;
    this.goal = null;
  }

  // Heard something: 'step' (running footsteps), 'shot' or 'reload'. `who` made it.
  hear(pos, kind = 'step', who = null) {
    if (!this.alive) return;
    const g = this.game, d = pos.distanceTo(this.pos);
    // tell the team (a sound only gives a rough spot, more so from far away)
    const rough = pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * d * 0.08, 0, (Math.random() - 0.5) * d * 0.08));
    g.addIntel(this.team, who, rough, false);
    if (this.targetVisible || this.carrying || this.actionHeld || this._mustRush()) return;
    this.heardAt = g.time;
    if (this.tactic && this.tactic.type !== 'hold') return;
    const strong = this.health + this.shield >= 60;
    const closeGun = this.gun.def.key === 'sunflower' || this.gun.def.key === 'tulip';
    // they're refilling right next to us: they can't shoot back right now. Go!
    if (kind === 'reload' && d < 12 && strong && this._peek(pos, 3)) return;
    // close footsteps + a close-range blaster + they don't know we're here: pounce
    if (kind === 'step' && d < 9 && closeGun && strong && !this._spotted() && this._peek(pos, 2.5)) return;
    if (kind === 'shot' && d > 14) return;                         // far shots: just good to know
    // cunning: footsteps coming and they don't know we're here? Freeze, crouch, pre-aim: ambush.
    if (this.level.cunning && kind === 'step' && d < 22 && !this._spotted() && !this.tactic) {
      this._startHold(pos.clone().setY(pos.y + 1.4), 3 + Math.random() * 3);
      return;
    }
    const mode = g.mode;
    const attacking = mode.kind === 'standard' && mode.sideOf(this.team) === 'attack' && mode.phase === 'live';
    if (this.tactic || attacking || Math.random() < 0.4) return;   // attackers keep moving (the crosshair still turns to it)
    if (strong) this._startHold(pos.clone().setY(pos.y + 1.4), 2 + Math.random() * 3);
    else this._relocate(pos) || this._hideFrom(pos);
  }

  // Someone just got popped.
  onPopped(victim, attacker) {
    if (!this.alive || this.carrying || this.actionHeld) return;
    if (attacker === this) {
      // got one: we're spotted now (their friends heard it). Don't keep standing on the same spot.
      if (!this._mustRush() && (this.level.cunning || Math.random() < 0.75)) this._relocate(victim.pos) || this._hideFrom(victim.pos);
      return;
    }
    if (victim.team === this.team && attacker && attacker.pos && !this.targetVisible &&
        victim.pos.distanceTo(this.pos) < 16) {
      // a teammate got popped near us: don't run into the same shot — hold that angle (or hide)
      if (this.health + this.shield < 70) this._hideFrom(attacker.pos);
      else this._startHold(attacker.pos.clone().setY(attacker.pos.y + 1.4));
    }
  }

  // Walk (silently) when enemies are probably close, or when sneaking up on a site.
  _shouldSneak() {
    const g = this.game, t = g.time, mode = g.mode;
    if (this.goal && this.goal.rush) return false;               // no time to be quiet
    if (this.goal && this.goal.loud) return false;               // faking: they WANT to be heard
    if (this.tactic) return true;
    if (this.level.cunning) {
      // cunning: silent almost all the time, only running when the clock really says so
      if (mode.kind !== 'standard') return t - this.heardAt < 12 || t - this.lastSeenAt < 10;
      if (mode.phase === 'planted') return mode.sideOf(this.team) === 'attack' || mode.timeLeft > 30;
      if (mode.phase === 'live' && mode.sideOf(this.team) === 'attack') return mode.timeLeft > 35 && !(this.carrying && mode.timeLeft < 50);
      return true;
    }
    const attacking = mode.kind === 'standard' && mode.phase === 'live' && mode.sideOf(this.team) === 'attack';
    if (attacking) {
      if (mode.timeLeft < 55 || this.carrying) return false;      // no time to be sneaky anymore
      const c = siteCenter(mode.sites[mode.planSite]);
      return Math.hypot(c.x - this.pos.x, c.z - this.pos.z) < 26;
    }
    return t - this.heardAt < 8 || t - this.lastSeenAt < 6;
  }

  // Throw a grenade so it lands on `target`. Returns true if thrown.
  _throw(kind, target) {
    if (!this.nades[kind]) return false;
    const from = this.mover.eyePosition(new THREE.Vector3());
    this.game.throwables.throw(this, kind, from, solveLob(from, target));
    this.nades[kind]--;
    this.lastNade = this.game.time;
    return true;
  }

  // Attackers: smoke off the defenders' side of the site and toss a Sparkle Pop in before going in.
  _siteUtility() {
    const mode = this.game.mode;
    if (mode.kind !== 'standard' || mode.phase !== 'live' || mode.sideOf(this.team) !== 'attack') return;
    if (this.utilRound === mode.round || !mode.planSite) return;
    const site = mode.sites[mode.planSite];
    const c = siteCenter(site);
    if (Math.hypot(c.x - this.pos.x, c.z - this.pos.z) > 24) return;
    this.utilRound = mode.round;
    const y = this.game.mapInfo.spawn.y;
    const back = site.entrances[site.entrances.length - 1];       // the defenders' way in
    this._throw('smoke', new THREE.Vector3((c.x + back[0]) / 2, y, (c.z + back[1]) / 2));
    if (Math.random() < 0.7) this._throw('flash', new THREE.Vector3(c.x, y + 1, c.z));
  }

  // Where to look to hit `pt`. For the bow, aim above the target so the arrow's drop lands on it.
  _aimAngles(eye, pt) {
    const def = this.gun.def;
    if (!def.bow) return anglesTo(eye, pt);
    const dx = pt.x - eye.x, dz = pt.z - eye.z, d = Math.hypot(dx, dz), h = pt.y - eye.y;
    const v = def.draw.maxSpeed, g = def.draw.gravity, v2 = v * v;
    const disc = v2 * v2 - g * (g * d * d + 2 * h * v2);
    const pitch = disc < 0 ? Math.atan2(h, d) + 0.3 : Math.atan((v2 - Math.sqrt(disc)) / (g * d));
    return [Math.atan2(-dx, -dz), pitch];
  }

  _tryFire(dt) {
    const L = this.level, gun = this.gun, me = this.mover;
    if (this.seenTime < L.reaction) return;
    if (gun.ammo === 0) { this._reload(); return; }
    if (!gun.ready || this.pauseTimer > 0) return;

    if (gun.def.bow) {                       // pull the string all the way first
      gun.drawTime += dt;
      if (gun.charge < 1) return;
    }

    // only shoot when the aim is close enough to the real target point
    const eye = me.eyePosition(this._eye);
    const pt = this.target.targetPoint(this.aimHead ? 'head' : 'chest', this._pt);
    const [ty, tp] = this._aimAngles(eye, pt);
    const sy = me.yaw + gun.recoilYaw, sp = me.pitch + gun.recoilPitch;
    const err = Math.hypot(wrapAngle(ty - sy) * Math.cos(tp), tp - sp);
    const dist = eye.distanceTo(pt);
    if (err > L.fireCone + Math.atan2(0.3, dist)) return;

    const scoped = me.horizontalSpeed < 0.5;   // standing still counts as zoomed in for bots
    const dirs = gun.fire(me.yaw, me.pitch, me, scoped);
    if (gun.def.bow) {
      this.game.arrows.fire(this, this.model.muzzlePosition(new THREE.Vector3()), dirs[0], gun.def, 1);
    } else {
      for (const dir of dirs) this.game.fireShot(this, eye.clone(), dir, gun);
      this.game.shotHeard(this, eye.clone(), gun.def.key);
    }
    this.firedAt = this.game.time;
    this.burstLeft--;
    if (this.burstLeft <= 0) {
      this.burstLeft = randRange(L.burst);
      this.pauseTimer = L.burstPause * (0.7 + Math.random() * 0.6);
    }
  }

  _idleReload() {
    const gun = this.gun;
    if (!gun.busy && gun.ammo < gun.def.magSize * 0.5) this._reload();
  }

  // refilling makes a little gurgle that people nearby can hear (good to know!)
  _reload() {
    if (!this.gun.startReload()) return;
    const at = this.mover.eyePosition(new THREE.Vector3());
    Sound.at(at, 'reloadFar', this.game._volumeAt(at));
    for (const b of this.game.bots)
      if (b.alive && b.team !== this.team && b.pos.distanceTo(at) < 12) b.hear(at.clone(), 'reload', this);
  }
}
