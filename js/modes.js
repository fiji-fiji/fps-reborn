// Game modes: the rules of a match and what the bots should be doing.
//   StandardMode  — rounds with the Boo-Boo, money + shop, first to 13 (win by two)
//   SkirmishMode  — team fight with respawns
//   PracticeMode  — practice garden with buddies (free shop)
// Every mode answers the same questions for the rest of the game:
//   sideOf(team), botGoal(bot), onOut(victim, attacker, part), update(dt), frozen,
//   isBusy(e), canBuy(e), freeShop, hintFor(me), actionFor(me), hud(), booMarker(team),
//   markersFor(me), version

const ROUND = {
  buy: 20,          // seconds frozen in spawn to shop before the round starts
  live: 100,        // round timer
  end: 5,           // seconds showing the result before the next round
  toWin: 13,        // first to 13…
  half: 12,         // sides swap after 12 rounds (and every round in overtime)
};
const ECON = { start: 800, win: 3000, loss: [1900, 2400, 2900], pop: 200, plant: 300 };

const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const flatDist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function weightedPick(opts) {
  const total = opts.reduce((s, o) => s + o[1], 0);
  let r = Math.random() * total;
  for (const [v, w] of opts) { r -= w; if (r <= 0) return v; }
  return opts[opts.length - 1][0];
}
function siteCenter(r) { return { x: (r.x0 + r.x1 + 1) / 2, z: (r.z0 + r.z1 + 1) / 2 }; }

// ---------------------------------------------------------------------------
class StandardMode {
  constructor(game) {
    this.game = game;
    game.mode = this;              // spawning below needs to know the mode
    this.kind = 'standard';
    this.freeShop = false;
    this.version = 0;              // bumps whenever bots should rethink their goal
    this.score = { blue: 0, red: 0 };
    this.lossStreak = { blue: 0, red: 0 };
    this.round = 0;
    this.attackTeam = game.playerTeam;   // you attack first
    this.boo = new BooBoo(game.scene, game.effects);
    this.plantAnim = new PlantAnim(game);
    this.barriers = new SpawnBarriers(game);
    this.phase = 'prep';
    this.timeLeft = 0;
    this.over = false;
    for (const e of this._players()) { resetLoadout(e); e.money = ECON.start; e.survived = false; }
    this.startRound();
  }

  _players() { return this.game.entities.filter(e => e.team !== 'buddy'); }
  get defendTeam() { return otherTeam(this.attackTeam); }
  sideOf(team) { return team === this.attackTeam ? 'attack' : 'defend'; }
  get frozen() { return this.phase === 'prep' || this.phase === 'over'; }
  get sites() { return this.game.mapInfo.sites; }
  members(team) { return this.game.entities.filter(e => e.team === team); }
  aliveCount(team) { return this.members(team).filter(e => e.alive).length; }
  canBuy(e) { return this.phase === 'prep' && e.alive; }

  siteAt(pos) {
    for (const [name, r] of Object.entries(this.sites))
      if (pos.x >= r.x0 && pos.x < r.x1 + 1 && pos.z >= r.z0 && pos.z < r.z1 + 1) return name;
    return null;
  }

  _pay(e, amount) { e.money = Math.min(MAX_MONEY, e.money + amount); if (e.isPlayer) HUD.moneyGain(amount); }

  // ---------------- round flow ----------------
  startRound() {
    const g = this.game;
    this.round++;
    let swapped = false;
    if (this.round === ROUND.half + 1 || this.round > ROUND.half * 2) {
      this.attackTeam = otherTeam(this.attackTeam);
      swapped = true;
    }
    const halftime = this.round === ROUND.half + 1;
    for (const e of this._players()) {
      // popped last round (or halftime): back to just the Dandelion
      if (halftime) { resetLoadout(e); e.money = ECON.start; }
      else if (!e.survived) resetLoadout(e);
      refillLoadout(e);
      e.carrying = false;
      e.actionHeld = false;
      e.survived = false;
      g.spawnAt(e);
    }
    if (halftime) this.lossStreak = { blue: 0, red: 0 };
    g.arrows.clear();
    g.throwables.clear();
    this.plantAnim.cancel();
    this.boo.reset();
    const carrier = pick(this.members(this.attackTeam));
    carrier.carrying = true;
    this.boo.state = 'carried';
    this.boo.carrier = carrier;

    // bot plan for this round
    this.planSite = pick(Object.keys(this.sites));
    this.plantCell = null;
    this.via = new Map();
    this.viaDone = new Set();
    for (const b of this.members(this.attackTeam)) this.via.set(b, pick(this.sites[this.planSite].via));
    const posts = ['A', 'B', 'A', 'B', 'mid'].sort(() => Math.random() - 0.5);
    this.posts = new Map();
    this.members(this.defendTeam).forEach((b, i) => this.posts.set(b, posts[i % posts.length]));
    this.alertSite = null; this.alertUntil = 0;
    this.uprooter = null;
    // sometimes one attacker sneaks around the other side to catch defenders rotating
    const lurkers = this.members(this.attackTeam).filter(e => !e.isPlayer && e !== carrier);
    this.lurker = lurkers.length && Math.random() < 0.5 ? pick(lurkers) : null;

    this.planter = null; this.plantProgress = 0;
    this.defuser = null; this.defuseProgress = 0;
    this.phase = 'prep';
    this.timeLeft = this.round === 1 ? 5 : ROUND.buy;   // round 1: nothing much to buy, start right away
    this.version++;
    this._botsBuy();

    HUD.hideOut();
    const mySide = this.sideOf(g.playerTeam);
    let title = `ROUND ${this.round}`;
    if (this.round > ROUND.half * 2) title += ' · OVERTIME';
    let sub = mySide === 'attack' ? 'Your team ATTACKS: plant the seed on A or B' : 'Your team DEFENDS: stop them planting the seed';
    if (swapped && halftime) sub = 'Halftime! Teams switched sides. ' + sub;
    for (const t of ['blue', 'red']) {
      const s = this.score[t] + 1, o = this.score[otherTeam(t)];
      if (s >= ROUND.toWin && s - o >= 2) { title += ' · MATCH POINT'; break; }
    }
    HUD.banner(title, sub, 4);
    if (halftime) HUD.openShopSoon();                          // fresh money after halftime: show the shop
  }

  // Bots spend their money: save when poor, rifles + shields when rich, a few bows and lilies.
  _botsBuy() {
    const g = this.game;
    const pistolRound = this.round === 1 || this.round === ROUND.half + 1;
    for (const b of g.bots) {
      if (!b.guns.main && !pistolRound) {
        const m = b.money, opts = [];
        if (m >= 5500) opts.push(['lily', 1]);
        if (m >= 3300) opts.push(['bloom', 5]);
        if (m >= 2600) opts.push(['rosebow', 1.5]);
        if (m >= 1800) opts.push(['sunflower', 1]);
        if (m >= 900) opts.push(['tulip', m < 2900 ? 2 : 0.5]);
        const saving = m < 2000 && Math.random() < 0.5;
        if (opts.length && !saving) g.buy(b, weightedPick(opts));
      }
      if (b.shield < 50 && b.money >= 1000 && !pistolRound) g.buy(b, 'heavy');
      else if (b.shield < 25 && b.money >= 400) g.buy(b, 'light');
      // grenades: attackers like clouds + sparkles to take a site, anyone may grab a bubble bomb
      if (this.sideOf(b.team) === 'attack') {
        if (b.money >= 200 && Math.random() < 0.8) g.buy(b, 'smoke');
        if (b.money >= 250 && Math.random() < 0.5) g.buy(b, 'flash');
      }
      if (b.money >= 400 && Math.random() < 0.35) g.buy(b, 'frag');
    }
  }

  endRound(winner, reason) {
    if (this.phase === 'end' || this.phase === 'over') return;
    this.score[winner]++;
    this.planter = this.defuser = null;
    this.plantProgress = this.defuseProgress = 0;
    const loser = otherTeam(winner);
    this.over = this.score[winner] >= ROUND.toWin && this.score[winner] - this.score[loser] >= 2;
    this.phase = 'end';
    this.timeLeft = ROUND.end;
    this.version++;

    // money for next round
    const lossPay = ECON.loss[Math.min(this.lossStreak[loser], ECON.loss.length - 1)];
    this.lossStreak[loser]++;
    this.lossStreak[winner] = 0;
    for (const e of this._players()) {
      e.survived = e.alive;
      this._pay(e, e.team === winner ? ECON.win : lossPay);
    }

    const mine = winner === this.game.playerTeam;
    const color = TEAM_CSS[winner];
    if (this.over) {
      this.winner = winner;
      HUD.banner(mine ? 'YOU WIN THE MATCH!' : 'THE CATS WIN THE MATCH',
        `${reason} · final score ${this.score.blue} : ${this.score.red}`, 9999, color);
    } else {
      HUD.banner(mine ? 'ROUND WON!' : 'ROUND LOST', reason, 4, color);
    }
    if (mine) Sound.roundWin(); else Sound.roundLose();
  }

  update(dt) {
    const g = this.game, b = this.boo;
    b.update(dt, g.time);
    this.barriers.update(dt, this.phase === 'prep');
    switch (this.phase) {
      case 'prep':
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          this.phase = 'live';
          this.timeLeft = ROUND.live;
          this.version++;
          HUD.closeShop();
          HUD.banner('GO!', '', 1.2);
          Sound.go();
        }
        break;

      case 'live':
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        this._carry();
        this._planting(dt);
        if (this.phase !== 'live') break;
        // timer at 0:00: the round only ends once nobody is mid-plant
        if (this.timeLeft === 0 && !this.planter) { this.endRound(this.defendTeam, "Time's up, no seed was planted"); break; }
        this._eliminations();
        break;

      case 'planted':
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        b.progress = 1 - this.timeLeft / BOOBOO.fuse;
        this.beat -= dt;
        if (this.beat <= 0) { this.beat = b.beatInterval(); Sound.drip(g._volumeAt(b.pos)); }
        this._uprooting(dt);
        if (this.phase !== 'planted') break;
        if (this.timeLeft === 0) { this._bloom(); break; }
        this._eliminations();
        break;

      case 'end':
        this.timeLeft -= dt;
        if (this.timeLeft <= 0) {
          if (this.over) this.phase = 'over';
          else this.startRound();
        }
        break;
    }
    // if you carry the Boo-Boo, your bot teammates head for the site you're going to
    const c = b.state === 'carried' ? b.carrier : null;
    if (c && c.isPlayer) {
      for (const [name, r] of Object.entries(this.sites)) {
        const cc = siteCenter(r);
        if (Math.hypot(c.pos.x - cc.x, c.pos.z - cc.z) < 22 && this.planSite !== name) { this.planSite = name; this.version++; }
      }
    }
  }

  _carry() {
    const b = this.boo;
    if (b.state !== 'dropped') return;
    for (const e of this.members(this.attackTeam)) {
      if (!e.alive || flatDist(e.pos, b.pos) > BOOBOO.pickupRadius || Math.abs(e.pos.y - b.pos.y) > 1.5) continue;
      b.pickUp();
      b.carrier = e;
      e.carrying = true;
      this.version++;
      if (e.isPlayer) { HUD.flashHint('You picked up the seed!'); Sound.pickup(); }
      break;
    }
  }

  _planting(dt) {
    const b = this.boo, c = b.carrier;
    const can = b.state === 'carried' && c && c.alive && c.actionHeld && c.mover.onGround && this.siteAt(c.pos);
    // a new plant can't start at 0:00, but one already going may finish
    if (can && (this.planter === c || this.timeLeft > 0)) {
      if (this.planter !== c) { this.planter = c; this.plantProgress = 0; this.plantAnim.start(c); }
      this.plantProgress += dt;
      this.plantAnim.update(Math.min(1, this.plantProgress / BOOBOO.plantTime));
      if (this.plantProgress >= BOOBOO.plantTime) this._plant(c);
    } else if (this.planter) {
      this.planter = null;
      this.plantProgress = 0;
      this.plantAnim.cancel();
    }
  }

  _plant(c) {
    const site = this.siteAt(c.pos);
    const spot = this.plantAnim.active ? this.plantAnim.digPoint.clone() : c.pos.clone();
    this.plantAnim.finish();
    this.boo.plant(spot);
    this.boo.carrier = null;
    c.carrying = false;
    this.planter = null;
    this.plantProgress = 0;
    this.plantedSite = site;
    this.phase = 'planted';
    this.timeLeft = BOOBOO.fuse;
    this.beat = 0;
    this.uprooter = null;
    this.version++;
    for (const e of this.members(this.attackTeam)) this._pay(e, ECON.plant);
    const att = this.sideOf(this.game.playerTeam) === 'attack';
    HUD.banner(`SEED PLANTED ON ${site}`, att ? 'Protect the tree until it blooms!' : 'Go uproot it before it blooms!', 3, '#7fffd4');
    Sound.planted();
  }

  _uprooting(dt) {
    const b = this.boo;
    let d = null;
    for (const e of this.members(this.defendTeam)) {
      if (!e.alive || !e.actionHeld || !e.mover.onGround) continue;
      if (flatDist(e.pos, b.pos) > BOOBOO.uprootReach || Math.abs(e.pos.y - b.pos.y) > 1.5) continue;
      d = e;
      if (e === this.defuser) break;
    }
    if (d && d === this.defuser) this.defuseProgress += dt;
    else if (d) { this.defuser = d; this.defuseProgress = dt; Sound.dig(this.game._volumeAt(d.pos)); }
    else { this.defuser = null; this.defuseProgress = 0; }
    if (this.defuseProgress >= BOOBOO.uprootTime) {
      b.uproot();
      Sound.uproot();
      this.endRound(this.defendTeam, 'The tree was uprooted!');
    }
  }

  _bloom() {
    const g = this.game, b = this.boo;
    b.bloom();
    Sound.bloom();
    const center = b.pos.clone();
    for (const e of g.entities) {
      if (!e.alive || e.team === 'buddy') continue;
      if (e.pos.distanceTo(center) <= BOOBOO.bloomRadius) g.pop(e, null, 'body', 'tree');
    }
    this.endRound(this.attackTeam, 'The tree bloomed!');
  }

  _eliminations() {
    const att = this.aliveCount(this.attackTeam), def = this.aliveCount(this.defendTeam);
    if (this.phase === 'live') {
      if (att === 0) this.endRound(this.defendTeam, 'Every attacker got popped');
      else if (def === 0) this.endRound(this.attackTeam, 'Every defender got popped');
    } else if (this.phase === 'planted' && def === 0) {
      this.endRound(this.attackTeam, 'Every defender got popped');
    }
  }

  onOut(victim, attacker, part, weapon) {
    if (victim.team === 'buddy') return;
    if (victim.carrying) {
      victim.carrying = false;
      this.boo.carrier = null;
      this.boo.drop(victim.pos.clone());
      this.version++;
    }
    if (victim === this.planter) { this.planter = null; this.plantProgress = 0; this.plantAnim.cancel(); }
    if (victim === this.defuser) { this.defuser = null; this.defuseProgress = 0; }
    if (attacker && attacker.team !== victim.team) this._pay(attacker, ECON.pop);
    HUD.feed(attacker, victim, part === 'head', weapon);
    if (victim.isPlayer) HUD.showOut(attacker ? attacker.name : 'the blooming tree', null);
  }

  // defenders who spot an attacker near a site call for help there
  onSpotted(bot, enemy) {
    if (this.sideOf(bot.team) !== 'defend' || this.phase !== 'live') return;
    for (const [name, r] of Object.entries(this.sites)) {
      const c = siteCenter(r);
      if (Math.hypot(enemy.pos.x - c.x, enemy.pos.z - c.z) < 20) {
        if (this.alertSite !== name) { this.alertSite = name; this.version++; }
        this.alertUntil = this.game.time + 12;
      }
    }
  }

  isBusy(e) { return e === this.planter || e === this.defuser; }

  // Before GO you can walk around, but only inside your own spawn area.
  spawnFence(e) { return this.phase === 'prep' ? this.game.mapInfo.spawns[this.sideOf(e.team)] : null; }

  // ---------------- what bots should do ----------------
  botGoal(bot) {
    if (this.phase !== 'live' && this.phase !== 'planted') return null;
    const nav = this.game.nav, b = this.boo, side = this.sideOf(bot.team);
    const near = (x, z, r) => nav.randomIn({ x0: Math.floor(x - r), z0: Math.floor(z - r), x1: Math.floor(x + r), z1: Math.floor(z + r) });
    const goalAt = (c, extra) => (c ? Object.assign({ x: c[0] + 0.5, z: c[1] + 0.5 }, extra) : null);

    if (side === 'attack') {
      if (b.state === 'planted') {
        const watch = pick(this.sites[this.plantedSite].entrances);
        const around = { x0: Math.floor(b.pos.x - 8), z0: Math.floor(b.pos.z - 8), x1: Math.floor(b.pos.x + 8), z1: Math.floor(b.pos.z + 8) };
        return goalAt(this.game.findHoldSpot(around, watch) || near(b.pos.x, b.pos.z, 7), { hold: 5 + Math.random() * 5, lookAt: watch });
      }
      if (b.state === 'dropped') {
        const bots = this.members(this.attackTeam).filter(e => e.alive && !e.isPlayer);
        const closest = bots.sort((p, q) => flatDist(p.pos, b.pos) - flatDist(q.pos, b.pos))[0];
        if (closest === bot) return { x: b.pos.x, z: b.pos.z, hold: 0 };
      }
      const site = this.sites[this.planSite];
      if (bot === this.lurker && ROUND.live - this.timeLeft < 40) {
        const otherName = Object.keys(this.sites).find(n => n !== this.planSite);
        const other = this.sites[otherName], p = other.via[0];
        return goalAt(near(p[0], p[1], 2), { hold: 10 + Math.random() * 6, lookAt: pick(other.entrances.slice(0, 2)) });
      }
      // first walk the chosen route, then onto the site
      const via = this.via.get(bot);
      if (via && !this.viaDone.has(bot)) {
        if (Math.hypot(bot.pos.x - via[0], bot.pos.z - via[1]) < 6) this.viaDone.add(bot);
        else return { x: via[0], z: via[1], hold: 0 };
      }
      if (bot.carrying) {
        if (!this.plantCell) this.plantCell = nav.randomIn(site);
        return goalAt(this.plantCell, { action: 'plant' });
      }
      return goalAt(nav.randomIn(site), { hold: 2 + Math.random() * 4, lookAt: pick(site.entrances) });
    }

    // defending
    if (b.state === 'planted') {
      if (!this.uprooter || !this.uprooter.alive) {
        const bots = this.members(this.defendTeam).filter(e => e.alive && !e.isPlayer);
        this.uprooter = bots.sort((p, q) => flatDist(p.pos, b.pos) - flatDist(q.pos, b.pos))[0] || null;
      }
      if (bot === this.uprooter) return { x: b.pos.x, z: b.pos.z, action: 'uproot' };
      return goalAt(near(b.pos.x, b.pos.z, 6), { hold: 2 + Math.random() * 3, lookAt: [b.pos.x, b.pos.z] });
    }
    let post = this.posts.get(bot) || 'mid';
    if (this.alertSite && this.game.time < this.alertUntil) post = this.alertSite;
    if (post === 'mid') {
      const p = pick(this.game.mapInfo.mid);
      return goalAt(near(p[0], p[1], 2), { hold: 6 + Math.random() * 6, lookAt: pick(this.game.mapInfo.midWatch) });
    }
    const s = this.sites[post];
    const watch = pick(s.entrances.slice(0, 2));
    return goalAt(this.game.findHoldSpot(s, watch) || nav.randomIn(s), { hold: 6 + Math.random() * 6, lookAt: watch });
  }

  // ---------------- for the HUD (plain words; [E] shows as a key) ----------------
  hintFor(me) {
    if (this.phase === 'over') return 'Press [Enter] to play another match';
    if (this.phase === 'prep') return this.round === 1
      ? `Get ready! The round starts in ${Math.ceil(this.timeLeft)}`
      : `Shopping time! Press [B] to buy · starts in ${Math.ceil(this.timeLeft)}`;
    if (!me.alive || this.phase === 'end') return '';
    const b = this.boo;
    if (this.planter === me) return 'Planting… keep holding [E]';
    if (this.sideOf(me.team) === 'attack') {
      if (me.carrying) return this.siteAt(me.pos) ? 'Hold [E] to plant the seed here' : 'You have the seed! Bring it to A or B';
      if (b.state === 'dropped') return 'The seed was dropped. Walk over it to pick it up!';
      if (b.state === 'planted') return 'Keep the enemy away from the tree until it blooms!';
      return `Go with your team to site ${this.planSite}`;
    }
    if (b.state === 'planted') {
      return flatDist(me.pos, b.pos) <= BOOBOO.uprootReach ? 'Hold [E] to uproot the tree' : `The seed is planted on ${this.plantedSite}! Go uproot it`;
    }
    return 'Guard sites A and B. Stop the enemy planting!';
  }

  actionFor(me) {
    if (this.planter === me) return { label: 'Planting the seed…', frac: this.plantProgress / BOOBOO.plantTime };
    if (this.defuser === me) return { label: 'Uprooting…', frac: this.defuseProgress / BOOBOO.uprootTime };
    return null;
  }

  hud() {
    return {
      scores: this.score,
      sides: { blue: this.sideOf('blue'), red: this.sideOf('red') },
      timer: this.phase === 'end' || this.phase === 'over' ? null : this.timeLeft,
      planted: this.phase === 'planted',
      buying: this.phase === 'prep',
      round: this.round,
      alive: { blue: this.aliveCount('blue'), red: this.aliveCount('red') },
      total: { blue: this.members('blue').length, red: this.members('red').length },
    };
  }

  // where to draw the Boo-Boo on a team's minimap
  booMarker(team) {
    const b = this.boo;
    if (b.state === 'planted') return { x: b.pos.x, z: b.pos.z, planted: true };
    if (this.sideOf(team) !== 'attack') return null;
    if (b.state === 'dropped') return { x: b.pos.x, z: b.pos.z };
    if (b.state === 'carried' && b.carrier && !b.carrier.isPlayer) return { x: b.carrier.pos.x, z: b.carrier.pos.z, carried: true };
    return null;
  }

  // floating labels in the world showing where to go
  markersFor(me) {
    if (!me.alive || this.phase === 'end' || this.phase === 'over') return [];
    const out = [], b = this.boo, y0 = this.game.mapInfo.spawn.y;
    if (b.state === 'planted') {
      const att = this.sideOf(me.team) === 'attack';
      out.push({ x: b.pos.x, y: b.pos.y + 4.6, z: b.pos.z, label: att ? '✿ Protect' : '✿ Uproot!', color: '#7fffd4' });
      return out;
    }
    if (this.sideOf(me.team) === 'attack' && b.state === 'dropped')
      out.push({ x: b.pos.x, y: b.pos.y + 1.2, z: b.pos.z, label: '✿ Seed', color: '#5fbf4a' });
    for (const [name, r] of Object.entries(this.sites)) {
      const c = siteCenter(r);
      const sub = this.sideOf(me.team) === 'attack' ? (me.carrying ? ' · plant' : '') : ' · guard';
      out.push({ x: c.x, y: y0 + 3.2, z: c.z, label: name + sub, color: name === 'A' ? '#ff8fb1' : '#50c8d2' });
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
const SKIRMISH_RESPAWN = 4;

class SkirmishMode {
  constructor(game) {
    this.game = game;
    game.mode = this;              // spawning below needs to know the mode
    this.kind = 'skirmish';
    this.freeShop = false;
    this.version = 0;
    this.score = { blue: 0, red: 0 };
    this.frozen = false;
    for (const e of game.entities) {
      if (e.team === 'buddy') continue;
      this._kit(e);
      game.spawnAt(e);
    }
  }
  _kit(e) { resetLoadout(e); giveWeapon(e, 'bloom'); }
  sideOf(team) { return team === 'blue' ? 'attack' : 'defend'; }
  canBuy() { return false; }

  botGoal(bot) {
    const pts = this.game.mapInfo.points;
    for (let i = 0; i < 5; i++) {
      const [x, z] = pick(pts);
      const jx = x + Math.round((Math.random() - 0.5) * 4), jz = z + Math.round((Math.random() - 0.5) * 4);
      if (Math.hypot(jx - bot.pos.x, jz - bot.pos.z) >= 6) return { x: jx, z: jz };
    }
    return null;
  }

  onOut(victim, attacker, part, weapon) {
    if (victim.team === 'buddy') return;
    if (attacker) this.score[attacker.team]++;
    victim.respawnIn = SKIRMISH_RESPAWN;
    HUD.feed(attacker, victim, part === 'head', weapon);
    if (victim.isPlayer) HUD.showOut(attacker ? attacker.name : '?', SKIRMISH_RESPAWN);
  }

  update(dt) {
    for (const e of this.game.entities) {
      if (e.team === 'buddy' || e.alive) continue;
      e.respawnIn -= dt;
      if (e.respawnIn <= 0) {
        this._kit(e);
        this.game.spawnAt(e);
        if (e.isPlayer) HUD.hideOut();
      }
    }
  }

  isBusy() { return false; }
  hintFor() { return ''; }
  actionFor() { return null; }
  booMarker() { return null; }
  markersFor() { return []; }
  hud() {
    const n = t => this.game.entities.filter(e => e.team === t);
    return {
      scores: this.score, sides: null, timer: null, planted: false, round: null,
      alive: { blue: n('blue').filter(e => e.alive).length, red: n('red').filter(e => e.alive).length },
      total: { blue: n('blue').length, red: n('red').length },
    };
  }
}

// ---------------------------------------------------------------------------
class PracticeMode {
  constructor(game) {
    this.game = game;
    game.mode = this;
    this.kind = 'practice';
    this.freeShop = true;          // try every blaster for free
    this.version = 0;
    this.frozen = false;
    const p = game.player;
    resetLoadout(p);
    giveWeapon(p, 'bloom');
    p.money = 0;
    const s = game.mapInfo.spawn;
    p.spawn(s.x, s.y, s.z, s.yaw);
  }
  sideOf() { return 'attack'; }
  canBuy() { return true; }
  botGoal() { return null; }
  onOut() {}
  update() {}
  isBusy() { return false; }
  hintFor() { return 'Press [B] to try any blaster for free'; }
  actionFor() { return null; }
  booMarker() { return null; }
  markersFor() { return []; }
  hud() { return null; }
}
