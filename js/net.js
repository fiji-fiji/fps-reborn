// LAN play: play with someone on the same Wi-Fi. Nothing to install for them.
//
//   - The host double-clicks "Play with a friend.command". That starts lan.py (a tiny server
//     that serves the game and passes messages between the two browsers) and opens the game.
//   - The host's menu shows two links: one for the same Wi-Fi (like http://192.168.1.23:8000)
//     and one for friends anywhere (https://….trycloudflare.com, if cloudflared is installed).
//     Friends open it in any browser, type a name, press JOIN. The host sorts the teams and
//     presses START.
//
// The host's game is the real match: bots, rounds, hits, money, the seed. Each friend's browser
// moves its own player (so it feels instant), sends what it does (moves, shots, grenades,
// buys), and shows everything else exactly as the host sends it, 20 times a second.
// Up to 10 people (5 per team). Ids: the host is 'H', each friend has a random id, bots go by
// their names.

const NET_RATE = 20;   // updates per second, both ways

// Who plays where. Both computers build this same list, in the same order.
// net.players = [{ id, name, team }] for every human (the host 'H' first); bots fill the
// rest of each team (up to 5) unless net.noBots.
function netRoster(net) {
  const out = [];
  for (const team of ['blue', 'red']) {
    const list = net.players.filter(p => p.team === team).slice(0, 5).map(p => ({ id: p.id, name: p.name, human: true }));
    for (const name of BOT_NAMES[team]) {
      if (list.length >= 5 || net.noBots) break;
      list.push({ id: name, name, human: false });
    }
    list.forEach((r, i) => { r.team = team; r.teamIdx = i; });
    out.push(...list);
  }
  return out;
}

const NET_MAX_TEAM = 5;   // players per team (so 10 people at most)

// Another human, as an entity in your game. On the host it follows what that friend's
// browser sends; on a friend's computer everyone else is a puppet like the bots.
class RemoteHuman {
  constructor(game, name, team, shirt, seed) {
    this.game = game;
    this.name = name;
    this.team = team;
    this.isHuman = true;
    this.mover = new Mover(game.world);
    resetLoadout(this);
    this.money = 0;
    this.health = 100;
    this.alive = false;
    this.respawnIn = 0;
    this.spottedUntil = 0;
    this.carrying = false;
    this.actionHeld = false;
    this.blindUntil = 0;
    this.stats = { pops: 0, outs: 0 };
    this.spawnSeq = 0;
    this.seed = seed;
    const friendly = team === game.playerTeam;
    this.model = new CharacterModel(game.scene, {
      shirt, armed: true, seed, species: TEAM_SPECIES[team], pants: TEAM_PANTS[team],
      name: friendly ? name : null, nameColor: TEAM_CSS[team],
    });
    this.state = null;           // the latest state from the friend's browser (host)
    this._vel = new THREE.Vector3();
  }

  get pos() { return this.mover.pos; }
  get gun() { return this.guns[this.slot] || this.guns.side; }

  spawn(x, y, z, yaw) {
    this.mover.spawn(x, y, z, yaw);
    this.health = 100;
    this.alive = true;
    this.actionHeld = false;
    this.spawnSeq++;
    this.spawnAt = [x, y, z, yaw];
    this.state = null;           // wait for the friend to be there
    this.model.setVisible(true);
  }

  hitboxes() { return characterHitboxes(this.mover.pos, this.mover.bodyHeight); }
  targetPoint(kind, out) { return targetPointOf(this, kind, out); }

  takeHit(dmg, part, attacker) {
    if (!this.alive) return false;
    applyDamage(this, dmg);
    this.model.hitFlash();
    if (this.health === 0) { this.alive = false; this.actionHeld = false; return true; }
    return false;
  }

  burst() {
    const px = this.model.pixelize();
    this.model.setVisible(false);
    return px;
  }

  // host: take what the friend's browser says (older messages from before a respawn are ignored)
  applyState(st) { if (st.seq >= this.spawnSeq) this.state = st; }

  // host, every frame
  update(dt) {
    const g = this.game, m = this.mover;
    this.model.update(dt, g.camera);
    const blind = this.alive ? this.blindUntil - g.time : 0;
    this.model.setAura(blind > 0 ? Math.min(1, blind / 0.6) : 0, g.time);
    if (!this.alive) return;
    const st = this.state;
    if (st) {
      const [x, y, z] = st.p;
      if (dt > 0) this._vel.set((x - m.pos.x) / dt, 0, (z - m.pos.z) / dt);
      m.vel.lerp(this._vel, Math.min(1, dt * 10));
      m.pos.set(x, y, z);
      m.yaw = st.y; m.pitch = st.pi; m.crouch = st.c; m.onGround = !!st.og;
      this.actionHeld = !!st.ah && this.alive;
      if (st.sl === 'seed' ? this.carrying : st.sl === 'nade' || this.guns[st.sl]) this.slot = st.sl;
      this.nadeKind = st.nk || null;
      m.speedMul = this.slot === 'knife' ? KNIFE_SPEED : 1;
    }
    const mode = g.mode;
    this.model.setCarrying(this.carrying);
    this.model.setPose(m.pos, m.yaw, m.pitch, m.horizontalSpeed, dt);
    this.model.setAction(mode.planter === this ? 'plant' : mode.defuser === this ? 'saw' : null, g.time, mode.boo && mode.boo.pos);
  }
}

// ---------------------------------------------------------------------------
// Talking to lan.py: messages come in on a stream, go out as small posts.
const esc = t => String(t).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');
const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

const Net = {
  role: null,
  id: null,

  // 'host' (the launcher opens ?lan=host), 'guest' (a friend opened a shared link) or null
  detect() {
    const p = new URLSearchParams(location.search);
    if (p.get('lan') === 'host') this.role = 'host';
    else if (location.protocol.startsWith('http') && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) this.role = 'guest';
    if (this.role === 'host') this.id = 'H';
    if (this.role === 'guest') {
      // one id per browser tab, kept when the page reloads (so you rejoin as yourself)
      try { this.id = sessionStorage.getItem('fps.lanId'); } catch (e) {}
      if (!this.id) {
        this.id = 'g' + Math.random().toString(36).slice(2, 10);
        try { sessionStorage.setItem('fps.lanId', this.id); } catch (e) {}
      }
    }
    return this.role;
  },

  connect(onMessage) {
    this.onMessage = onMessage;
    const es = new EventSource(`/net/stream?role=${this.role}&id=${this.id}`);
    es.onmessage = ev => {
      let batch;
      try { batch = JSON.parse(ev.data); } catch (e) { return; }
      for (const msg of Array.isArray(batch) ? batch : [batch]) this.onMessage(msg);
    };
    this.es = es;
  },

  // host: to everyone (or one friend, `to`); friend: to the host
  send(msg, to) {
    if (this.role === 'guest') msg.id = this.id;
    const q = `role=${this.role}&id=${this.id}` + (to ? `&to=${to}` : '');
    fetch(`/net/send?${q}`, { method: 'POST', body: JSON.stringify(msg), keepalive: true }).catch(() => {});
  },

  box() { return document.getElementById('lanBox'); },

  // Host: show the links, gather friends, sort teams, START.
  // Resolves with { players: [{ id, name, team }], noBots }.
  hostLobby() {
    const box = this.box();
    box.style.display = 'block';
    document.getElementById('playBtn').disabled = true;
    let noBots = lsGet('fps.lanBots') === 'none';
    let teamsByName = {};
    try { teamsByName = JSON.parse(lsGet('fps.lanTeams') || '{}'); } catch (e) {}
    const friends = [];                      // { id, name, team } in the order they joined
    box.innerHTML = `
      <div class="lanTitle">PLAY WITH FRIENDS</div>
      <div>Same Wi-Fi: <b id="lanLink">…</b> <button class="lanBtn lanCopy" data-for="lanLink">Copy</button></div>
      <div>Anywhere (internet): <b id="lanPublic">…</b> <button class="lanBtn lanCopy" data-for="lanPublic" style="display:none">Copy</button></div>
      <div class="lanRow">Your name: <input id="lanName" maxlength="12" placeholder="Your name" value="${esc(lsGet('fps.lanName'))}"></div>
      <div class="lanRow">Bots:
        <button class="lanBtn lanBots" data-bots="fill">Fill empty spots</button>
        <button class="lanBtn lanBots" data-bots="none">No bots</button></div>
      <div class="lanTeams">
        <div class="lanTeam" data-team="blue"><div class="lanTeamName">DOGS</div><div class="lanList"></div></div>
        <div class="lanTeam" data-team="red"><div class="lanTeamName">CATS</div><div class="lanList"></div></div>
      </div>
      <div class="lanHint">Click a friend to move them to the other team.</div>
      <div class="lanRow"><button id="lanStart" class="lanBtn active" disabled>START MATCH</button>
        <span id="lanStatus" class="lanStatus">Waiting for friends to open a link…</span></div>`;
    const hostName = () => (document.getElementById('lanName').value || '').trim() || 'Host';
    const count = team => 1 * (team === 'blue') + friends.filter(f => f.team === team).length;
    const players = () => [{ id: 'H', name: hostName(), team: 'blue' }, ...friends];
    const tellFriends = () => this.send({ t: 'lobby', players: players(), noBots });
    const paint = () => {
      box.querySelectorAll('.lanBots').forEach(b => b.classList.toggle('active', (b.dataset.bots === 'none') === noBots));
      for (const team of ['blue', 'red']) {
        const list = box.querySelector(`.lanTeam[data-team="${team}"] .lanList`);
        list.innerHTML = players().filter(p => p.team === team).map(p =>
          `<button class="lanBtn lanPlayer" data-id="${esc(p.id)}" ${p.id === 'H' ? 'disabled' : ''}>${esc(p.id === 'H' ? p.name + ' (you)' : p.name)}</button>`).join('') +
          (noBots ? '' : `<span class="lanBotsNote">+ ${Math.max(0, NET_MAX_TEAM - count(team))} bots</span>`);
      }
      box.querySelectorAll('.lanPlayer').forEach(b => b.onclick = () => {
        const f = friends.find(x => x.id === b.dataset.id), other = f && (f.team === 'blue' ? 'red' : 'blue');
        if (!f || count(other) >= NET_MAX_TEAM) return;
        f.team = other;
        teamsByName[f.name] = other; lsSet('fps.lanTeams', JSON.stringify(teamsByName));
        paint(); tellFriends();
      });
      const n = friends.length;
      document.getElementById('lanStart').disabled = n === 0;
      document.getElementById('lanStatus').textContent = n === 0 ? 'Waiting for friends to open a link…'
        : `${n} friend${n > 1 ? 's' : ''} in. Press START MATCH when everyone's here.`;
    };
    box.querySelectorAll('.lanBots').forEach(b => b.addEventListener('click', () => {
      noBots = b.dataset.bots === 'none'; lsSet('fps.lanBots', noBots ? 'none' : 'fill'); paint(); tellFriends();
    }));
    document.getElementById('lanName').addEventListener('change', () => { lsSet('fps.lanName', hostName()); paint(); tellFriends(); });
    box.querySelectorAll('.lanCopy').forEach(b => b.onclick = () => {
      const t = document.getElementById(b.dataset.for).textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(t).catch(() => {});
    });
    paint();
    // the links (the internet one takes a few seconds to appear)
    const info = () => fetch('/net/info').then(r => r.json()).then(i => {
      document.getElementById('lanLink').textContent = i.url;
      const pub = document.getElementById('lanPublic');
      if (i.public) { pub.textContent = i.public; box.querySelector('.lanCopy[data-for="lanPublic"]').style.display = ''; }
      else if (!i.tunnel) pub.textContent = '(not set up: see the Terminal window)';
      else { pub.textContent = 'getting it…'; setTimeout(info, 1500); }
    }).catch(() => { document.getElementById('lanLink').textContent = '(start the game with "Play with a friend.command")'; });
    info();
    return new Promise(resolve => {
      let started = false;
      this.connect(msg => {
        if (started) return;
        if (msg.t === 'hello') {
          let f = friends.find(x => x.id === msg.id);
          if (!f) {
            const name = String(msg.name || 'Friend').slice(0, 12);
            const want = teamsByName[name] || (count('red') < count('blue') ? 'red' : 'blue');
            const team = count(want) < NET_MAX_TEAM ? want : want === 'blue' ? 'red' : 'blue';
            if (count(team) >= NET_MAX_TEAM) { this.send({ t: 'full' }, msg.id); return; }
            f = { id: msg.id, name, team };
            friends.push(f);
          }
          paint(); tellFriends();
        }
        if (msg.t === 'bye') {
          const i = friends.findIndex(x => x.id === msg.id);
          if (i >= 0) { friends.splice(i, 1); paint(); tellFriends(); }
        }
      });
      this.send({ t: 'hostHello' });          // friends already waiting say hello again
      document.getElementById('lanStart').onclick = () => {
        if (!friends.length) return;
        started = true;
        lsSet('fps.lanName', hostName());
        box.querySelectorAll('button, input').forEach(el => { el.disabled = true; });
        document.getElementById('lanStatus').textContent = 'Match ready! Press PLAY.';
        document.getElementById('playBtn').disabled = false;
        resolve({ players: players(), noBots });
      };
    });
  },

  // Friend: type a name, JOIN, wait for the host to start. Resolves with the welcome message.
  guestLobby() {
    const box = this.box();
    box.style.display = 'block';
    document.querySelectorAll('.pick, .pickLabel').forEach(el => { if (!el.closest('.lookRow')) el.style.display = 'none'; });   // the host picks (LOOK is yours)
    document.getElementById('playBtn').disabled = true;
    let name = lsGet('fps.lanName');
    box.innerHTML = `
      <div class="lanTitle">JOIN YOUR FRIEND'S GAME</div>
      <div class="lanRow">Your name: <input id="lanName" maxlength="12" placeholder="Your name" value="${esc(name)}">
        <button id="lanJoin" class="lanBtn active">JOIN</button></div>
      <div id="lanWho" class="lanTeams" style="display:none"></div>
      <div id="lanStatus" class="lanStatus"></div>`;
    const status = t => { document.getElementById('lanStatus').textContent = t; };
    return new Promise(resolve => {
      let joined = false, welcomed = null;
      const hello = () => this.send({ t: 'hello', name });
      this.connect(msg => {
        if (msg.t === 'hostHello' && joined && !welcomed) hello();
        if (msg.t === 'hostHello' && welcomed) location.reload();          // the host restarted: join again
        if (msg.t === 'full') status('Sorry, both teams are full (5 each).');
        if (msg.t === 'started') status('The match already started. Ask the host to go back to the menu and pick the map again to let you in.');
        if (msg.t === 'lobby' && joined && !welcomed) {
          const me = msg.players.find(p => p.id === this.id);
          const who = document.getElementById('lanWho');
          who.style.display = '';
          who.innerHTML = ['blue', 'red'].map(team => `<div class="lanTeam"><div class="lanTeamName">${team === 'blue' ? 'DOGS' : 'CATS'}</div><div class="lanList">` +
            msg.players.filter(p => p.team === team).map(p => `<span class="lanPlayer${p.id === this.id ? ' me' : ''}">${esc(p.name)}</span>`).join('') +
            (msg.noBots ? '' : `<span class="lanBotsNote">+ bots</span>`) + '</div></div>').join('');
          status(me ? `You're in, on the ${me.team === 'blue' ? 'DOGS' : 'CATS'}! Waiting for ${msg.players[0].name} to start…` : 'Waiting for the host…');
        }
        if (msg.t === 'welcome' && joined && !welcomed) {
          if (!msg.players.some(p => p.id === this.id)) { status('The match already started without you. Ask the host to go back to the menu and pick the map again.'); return; }
          welcomed = msg;
          document.getElementById('lanWho').style.display = 'none';
          status(`The match is ready! Press PLAY.`);
          document.getElementById('playBtn').disabled = false;
          resolve(msg);
        } else if (msg.t === 'welcome' && welcomed && msg.sid !== welcomed.sid) location.reload();
        if (welcomed && this.onGame) this.onGame(msg);
      });
      const join = () => {
        name = (document.getElementById('lanName').value || '').trim() || 'Friend';
        lsSet('fps.lanName', name);
        joined = true;
        document.getElementById('lanJoin').disabled = true;
        status('Waiting for the host…');
        hello();
      };
      document.getElementById('lanJoin').onclick = join;
      if (name) setTimeout(join, 300);                                   // came back after a reload: rejoin
    });
  },
};

// ---------------------------------------------------------------------------
// Host side: send the world to the friend, act on what the friend does.
class NetHost {
  constructor(game, settings) {
    this.game = game;
    this.settings = settings;
    this.sid = Math.random().toString(36).slice(2);
    this.events = [];
    this.sendIn = 0;
    this.endCount = 0;
    game.net = this;
    this.guests = new Map(game.remotes.map(r => [r.netId, r]));   // every friend, by id
    const g = game, m = g.mode;
    // what the friend needs to see happen
    const nadeThrow = g.throwables.throw.bind(g.throwables);
    g.throwables.throw = (owner, kind, pos, vel) => {
      nadeThrow(owner, kind, pos, vel);
      this.event({ t: 'nade', o: owner.netId, k: kind, a: v3(pos), v: v3(vel) });
    };
    if (m.boo) {
      const bloom = m.boo.bloom.bind(m.boo), uproot = m.boo.uproot.bind(m.boo);
      m.boo.bloom = () => { bloom(); this.event({ t: 'bloom' }); };
      m.boo.uproot = yaw => { uproot(yaw); this.event({ t: 'uproot', y: yaw }); };
    }
    if (m.endRound) {
      const endRound = m.endRound.bind(m);
      m.endRound = (w, r) => { const was = m.phase; endRound(w, r); if (m.phase !== was) m.netEnd = { w, r, n: ++this.endCount }; };
    }
    Net.onMessage = msg => this.onMessage(msg);
    this.welcome();
  }

  welcome() {
    const s = this.settings;
    Net.send({ t: 'welcome', sid: this.sid, map: s.map, mode: s.mode, bots: s.bots, noBots: !!s.noBots, players: s.players, at: this.game.mode.attackTeam || null });
  }

  event(ev) { this.events.push(ev); }

  onMessage(msg) {
    const g = this.game, r = this.guests.get(msg.id);
    if (msg.t === 'hello') {
      if (r) this.welcome();                                            // a friend reloaded: same match
      else {                                                            // someone new: too late for this match
        Net.send({ t: 'started' }, msg.id);
        if (!this.told || this.told !== msg.id) HUD.flashHint(`${String(msg.name || 'A friend').slice(0, 12)} wants to join: pick the map again in the menu to restart with them`);
        this.told = msg.id;
      }
      return;
    }
    if (msg.t !== 'g' || !r) return;
    if (msg.st) r.applyState(msg.st);
    for (const ev of msg.ev || []) {
      if (!r.alive && ev.t !== 'buy' && ev.t !== 'sell') continue;
      const V = a => new THREE.Vector3(a[0], a[1], a[2]);
      switch (ev.t) {
        case 'shot': {
          const def = WEAPONS[ev.k];
          if (!def) break;
          const gun = Object.values(r.guns).find(x => x && x.def.key === ev.k) || new Gun(def);
          g.fireShot(r, V(ev.eye), V(ev.dir).normalize(), gun);
          g.shotHeard(r, V(ev.eye), ev.k);
          break;
        }
        case 'melee': g.melee(r, V(ev.eye), V(ev.dir).normalize(), WEAPONS.knife); Sound.at(r.pos, 'swish', g._volumeAt(r.pos)); break;
        case 'nade': if (r.nades[ev.k] > 0) { g.throwables.throw(r, ev.k, V(ev.a), V(ev.v)); r.nades[ev.k]--; } break;
        case 'reload': Sound.at(r.pos, 'reloadFar', g._volumeAt(r.pos)); g.reloadHeard(r); break;
        case 'buy': g.buy(r, ev.k); break;
        case 'sell': g.sell(r, ev.k); break;
        case 'pickup': g.drops.trySwap(r); break;
      }
    }
  }

  // every frame: 20 times a second, send the whole picture
  update(dt) {
    this.sendIn -= dt;
    if (this.sendIn > 0) return;
    this.sendIn = 1 / NET_RATE;
    const g = this.game, m = g.mode, t = g.time;
    const ents = [];
    const seenBy = (e, team) => Math.max(0, +((e.seenBy ? (e.seenBy[team] || 0) : 0) - t).toFixed(2));
    for (const e of g.entities) {
      if (!e.netId) continue;
      const mv = e.mover;
      ents.push([e.netId, +mv.pos.x.toFixed(2), +mv.pos.y.toFixed(2), +mv.pos.z.toFixed(2), +mv.yaw.toFixed(3), +mv.pitch.toFixed(3),
        +mv.crouch.toFixed(2), e.alive ? 1 : 0, e.carrying ? 1 : 0, e.gun ? e.gun.def.key : null, Math.max(0, +(e.blindUntil - t).toFixed(2)) || 0,
        seenBy(e, 'blue'), e.stats ? e.stats.pops : 0, e.stats ? e.stats.outs : 0, e.money || 0, e.slot, seenBy(e, 'red')]);
    }
    const msg = { t: 'snap', time: +t.toFixed(3), e: ents };
    if (m.kind === 'standard') {
      const b = m.boo;
      msg.m = { ph: m.phase, tl: +m.timeLeft.toFixed(2), sc: [m.score.blue, m.score.red], r: m.round, at: m.attackTeam, ps: m.plantedSite || null,
        pl: m.planSite, ov: !!m.over, end: m.netEnd || null, bs: b.state, bp: v3(b.pos), bc: b.carrier ? b.carrier.netId : null,
        pr: m.planter ? m.planter.netId : null, pp: +m.plantProgress.toFixed(2), df: m.defuser ? m.defuser.netId : null, dp: +m.defuseProgress.toFixed(2), v: m.version };
    } else if (m.kind === 'skirmish') {
      msg.m = { sk: 1, sc: [m.score.blue, m.score.red] };
    }
    // each friend's own state (lan.py hands every friend only theirs)
    msg.g = {};
    for (const [id, r] of this.guests) {
      msg.g[id] = { hp: r.health, sh: r.shield, $: r.money, al: r.alive ? 1 : 0, mk: r.guns.main ? r.guns.main.def.key : null,
        ma: r.guns.main ? [r.guns.main.ammo, r.guns.main.reserve] : null, sk: r.guns.side ? r.guns.side.def.key : null,
        n: r.nades, seq: r.spawnSeq, sp: r.spawnAt || null, bl: Math.max(0, +(r.blindUntil - t).toFixed(2)), ca: r.carrying ? 1 : 0, rs: r.respawnIn || 0 };
    }
    msg.d = g.drops.items.filter(it => it.landed).map(it => [it.id, it.gun.def.key, +it.pos.x.toFixed(2), +it.floor.toFixed(2), +it.pos.z.toFixed(2)]);
    msg.ev = this.events;
    this.events = [];
    Net.send(msg);
  }
}

// ---------------------------------------------------------------------------
// Friend side: everyone else is a puppet; the round follows the host.
class NetGuest {
  constructor(game, welcome) {
    this.game = game;
    this.welcome = welcome;
    this.outEvents = [];
    this.sendIn = 0;
    this.snap = null;
    this.lastRound = 0;
    this.lastPhase = null;
    this.lastEnd = 0;
    this.lastSeq = -1;
    this.lastBoo = null;
    this.planter = null; this.defuser = null;
    this.dripIn = 0;
    this.drops = new Map();
    game.net = this;
    const g = game, me = g.player;
    // everything else is driven from the host
    for (const e of g.entities) if (e !== me) e._net = null;
    // what you do gets sent to the host (your own screen shows it straight away)
    g.melee = (att, eye, dir) => { if (att.isPlayer) this.out({ t: 'melee', eye: v3(eye), dir: v3(dir) }); return false; };
    g.reloadHeard = e => { if (e.isPlayer) this.out({ t: 'reload' }); };
    g.shotHeard = () => {};
    const nadeThrow = g.throwables.throw.bind(g.throwables);
    g.throwables.throw = (owner, kind, pos, vel) => {
      nadeThrow(owner, kind, pos, vel);
      if (owner.isPlayer) this.out({ t: 'nade', k: kind, a: v3(pos), v: v3(vel) });
    };
    const buy = g.buy.bind(g), sell = g.sell.bind(g);
    g.buy = (e, item) => { const ok = buy(e, item); if (ok && e.isPlayer) this.out({ t: 'buy', k: item }); return ok; };
    g.sell = (e, item) => { const ok = sell(e, item); if (ok && e.isPlayer) this.out({ t: 'sell', k: item }); return ok; };
    g.drops.trySwap = e => { if (e.isPlayer) this.out({ t: 'pickup' }); return true; };
    Net.onMessage = msg => this.onMessage(msg);
    Net.onGame = null;
  }

  out(ev) { this.outEvents.push(ev); }

  onMessage(msg) {
    if (msg.t === 'hostHello' || (msg.t === 'welcome' && msg.sid !== this.welcome.sid)) { location.reload(); return; }
    if (msg.t !== 'snap') return;
    this.snap = msg;
    this.snapAt = performance.now();
    for (const ev of msg.ev || []) this._event(ev);
    this._applySnap(msg);
  }

  _ent(id) { return id == null ? null : this.game.byNetId(id); }

  _event(ev) {
    const g = this.game, me = g.player, fx = g.effects;
    const V = a => new THREE.Vector3(a[0], a[1], a[2]);
    switch (ev.t) {
      case 'shot': {
        if (ev.s === Net.id) break;                   // your own: already drawn
        const a = V(ev.a), b = V(ev.b);
        fx.shotTrail(a, b);
        if (ev.n) { fx.bubbleBurst(b, V(ev.n), 3, 1.2); fx.foamSpot(b, V(ev.n)); }
        Sound.at(a, 'shoot', g._volumeAt(a), ev.k);
        break;
      }
      case 'hit': {
        const att = this._ent(ev.a), vic = this._ent(ev.v), pt = V(ev.pt);
        if (vic === me) { HUD.hurt(att, me); Sound.ouch(); }
        else if (vic && vic.model) vic.model.hitFlash();
        if (att === me) { HUD.hitmarker(ev.p, ev.o, ev.d); if (ev.o) Sound.kill(); else if (ev.p === 'head') Sound.headshot(); else Sound.hit(); }
        if (ev.p === 'head' && vic && vic !== me) fx.starPop(targetPointOf(vic, 'head', new THREE.Vector3()));
        if (vic !== me && !ev.o) { fx.bubbleBurst(pt, V(ev.dir).negate(), 4, 1.5); fx.confettiBurst(pt, ev.p === 'head' ? 10 : 5, 2); }
        break;
      }
      case 'pop': {
        const vic = this._ent(ev.v);
        if (vic && (vic.alive || vic === me)) { vic.alive = true; g.pop(vic, this._ent(ev.a), ev.p, ev.w, true); }
        break;
      }
      case 'nade': { const o = this._ent(ev.o); if (o && o !== me) g.throwables.throw(o, ev.k, V(ev.a), V(ev.v)); break; }
      case 'bloom': g.mode.boo.bloom(); Sound.bloom(); break;
      case 'uproot': g.mode.boo.uproot(ev.y); g.mode.saw.finish(); Sound.at(g.mode.boo.pos, 'timber', 0.4 + 0.6 * g._volumeAt(g.mode.boo.pos)); break;
    }
  }

  _applySnap(s) {
    const g = this.game, me = g.player, t = g.time;
    // everyone else: where they are, what they hold
    for (const row of s.e) {
      const e = this._ent(row[0]);
      if (!e) continue;
      const [, x, y, z, yaw, pitch, crouch, al, ca, key, bl, seenB, pops, outs, money, slot, seenR] = row;
      const seen = me.team === 'blue' ? seenB : seenR;
      if (e.stats) { e.stats.pops = pops; e.stats.outs = outs; }
      if (e !== me && e.team === me.team) e.money = money;
      e.carrying = !!ca;
      if (e === me) continue;
      e._net = { p: [x, y, z], y: yaw, pi: pitch, c: crouch, al, bl };
      e.blindUntil = t + bl;
      if (e.team !== me.team) e.spottedUntil = seen > 0 ? t + seen : Math.min(e.spottedUntil || 0, t + 0.2);
      if (key && WEAPONS[key]) {
        const def = WEAPONS[key];
        if (def.slot === 'main' && (!e.guns.main || e.guns.main.def.key !== key)) e.guns.main = new Gun(def);
        if (def.slot === 'side' && (!e.guns.side || e.guns.side.def.key !== key)) e.guns.side = new Gun(def);
        e.slot = slot === 'knife' || slot === 'main' || slot === 'side' ? slot : def.slot;
      }
    }
    // you: health, money, what you own, respawns, being dazzled
    const p = s.g && s.g.hp === undefined ? s.g[Net.id] : s.g;
    if (p) {
      if (p.seq !== this.lastSeq && p.sp) {
        this.lastSeq = p.seq;
        me.spawn(p.sp[0], p.sp[1], p.sp[2], p.sp[3]);
        HUD.hideOut();
      }
      if (!p.al && me.alive) me.alive = false;
      me.health = p.hp; me.shield = p.sh;
      if (p.$ > me.money && this.snapCount > 0) HUD.moneyGain(p.$ - me.money);
      me.money = p.$;
      const sync = (slot, key, ammo) => {
        const cur = me.guns[slot];
        if (!key) { if (cur && slot === 'main') { me.guns.main = null; if (me.slot === 'main') me.slot = 'side'; } return; }
        if (cur && cur.def.key === key) return;
        me.guns[slot] = new Gun(WEAPONS[key]);
        if (ammo) { me.guns[slot].ammo = ammo[0]; me.guns[slot].reserve = ammo[1]; }
        if (slot === 'main') me.slot = 'main';
      };
      sync('main', p.mk, p.ma);
      sync('side', p.sk, null);
      Object.assign(me.nades, p.n);
      if (p.bl > 0.2 && p.bl > me.blindUntil - t + 0.3) HUD.dazzle(p.bl);
      me.blindUntil = t + p.bl;
      if (p.ca && !me.carrying) { HUD.flashHint('You picked up the seed!'); Sound.pickup(); }
      me.carrying = !!p.ca;
      if (g.mode.kind === 'skirmish' && !me.alive && p.rs > 0) me.respawnIn = p.rs;
    }
    this.snapCount = (this.snapCount || 0) + 1;
    this._applyMode(s.m);
    this._applyDrops(s.d || []);
  }

  // the round, as the host sees it, with banners and sounds from your side
  _applyMode(sm) {
    const g = this.game, m = g.mode, me = g.player;
    if (!sm) return;
    if (sm.sk) { m.score.blue = sm.sc[0]; m.score.red = sm.sc[1]; return; }
    const b = m.boo;
    if (sm.r !== this.lastRound) {
      const first = this.lastRound === 0;
      this.lastRound = sm.r;
      m.round = sm.r;
      m.attackTeam = sm.at;
      if (!first) { b.reset(); m.plantAnim.cancel(); m.saw.cancel(); g.throwables.clear(); }
      this.planter = this.defuser = null;
      refillLoadout(me);
      const mySide = m.sideOf(g.playerTeam), R = m.rules;
      const halftime = sm.r === R.half + 1;
      let sub = mySide === 'attack' ? 'Your team ATTACKS: plant the seed on A or B' : 'Your team DEFENDS: stop them planting the seed';
      if (halftime) sub = 'Halftime! Teams switched sides. ' + sub;
      if (!first) HUD.banner(`ROUND ${sm.r}`, sub, 4);
      if (halftime) HUD.openShopSoon();
      this.lastBoo = null;
    }
    m.attackTeam = sm.at;
    m.score.blue = sm.sc[0]; m.score.red = sm.sc[1];
    m.timeLeft = sm.tl;
    m.planSite = sm.pl;
    m.over = sm.ov;
    m.version = sm.v;
    m.seedForMe = false;
    m.botsMayTake = true;
    // phase changes
    if (sm.ph !== this.lastPhase) {
      const was = this.lastPhase;
      this.lastPhase = sm.ph;
      m.phase = sm.ph;
      if (was === 'prep' && sm.ph === 'live') {
        for (const gun of Object.values(me.guns)) if (gun) { gun.ammo = gun.def.magSize; gun.reserve = gun.def.reserve; gun.reloading = 0; }
        HUD.closeShop(); HUD.banner('GO!', '', 1.2); Sound.go();
      }
      if (sm.ph === 'planted') {
        m.plantedSite = sm.ps;
        m.plantAnim.finish();
        b.plant(new THREE.Vector3(...sm.bp));
        const att = m.sideOf(g.playerTeam) === 'attack';
        HUD.banner(`SEED PLANTED ON ${sm.ps}`, att ? 'Protect the tree until it blooms!' : 'Go uproot it before it blooms!', 3, '#7fffd4');
        Sound.planted();
      }
    }
    m.plantedSite = sm.ps;
    if (sm.end && sm.end.n !== this.lastEnd) {
      this.lastEnd = sm.end.n;
      const mine = sm.end.w === g.playerTeam, color = TEAM_CSS[sm.end.w];
      if (sm.ov) HUD.banner(mine ? 'YOU WIN THE MATCH!' : 'YOU LOSE THE MATCH', `${sm.end.r} · final score ${sm.sc[0]} : ${sm.sc[1]}`, 9999, color);
      else HUD.banner(mine ? 'ROUND WON!' : 'ROUND LOST', sm.end.r, 4, color);
      if (mine) Sound.roundWin(); else Sound.roundLose();
      if (sm.ov) m.winner = sm.end.w;
    }
    // the seed
    if (sm.bs !== this.lastBoo) {
      if (sm.bs === 'dropped') b.drop(new THREE.Vector3(...sm.bp));
      else if (sm.bs === 'carried') b.pickUp();
      this.lastBoo = sm.bs;
    }
    if (sm.bs === 'dropped') b.pos.set(...sm.bp);
    b.carrier = this._ent(sm.bc);
    // planting / sawing shows
    const planter = this._ent(sm.pr), defuser = this._ent(sm.df);
    if (planter !== this.planter) {
      if (planter) m.plantAnim.start(planter); else if (sm.ph !== 'planted') m.plantAnim.cancel();
      this.planter = planter;
    }
    m.planter = planter; m.plantProgress = sm.pp;
    if (defuser !== this.defuser) {
      if (defuser) m.saw.start(defuser, b.pos); else m.saw.cancel();
      this.defuser = defuser;
    }
    m.defuser = defuser; m.defuseProgress = sm.dp;
  }

  // blasters lying on the ground (you pick them up with F; the host decides)
  _applyDrops(list) {
    const g = this.game, seen = new Set();
    for (const [id, key, x, fy, z] of list) {
      seen.add(id);
      let it = this.drops.get(id);
      if (!it) {
        const gun = new Gun(WEAPONS[key]);
        it = { id, gun, group: g.drops._model(gun), pos: new THREE.Vector3(x, fy + 0.22, z), floor: fy, landed: true, age: 0, owner: null, ownerWait: 0 };
        g.scene.add(it.group);
        this.drops.set(id, it);
      }
      it.pos.set(x, it.pos.y, z); it.floor = fy;
    }
    for (const [id, it] of this.drops) if (!seen.has(id)) { g.scene.remove(it.group); this.drops.delete(id); }
    g.drops.items = [...this.drops.values()];
  }

  // every frame (instead of the normal game update)
  update(dt) {
    const g = this.game, m = g.mode, me = g.player;
    g.time += dt;
    me.mover.speedMul = me.slot === 'knife' ? KNIFE_SPEED : 1;
    // everyone else glides to where the host says they are
    const k = 1 - Math.exp(-dt * 16);
    for (const e of g.entities) {
      if (e === me || !e._net || !e.mover) continue;
      const s = e._net, mv = e.mover;
      if (s.al && !e.alive) { e.alive = true; e.model.setVisible(true); mv.pos.set(...s.p); }
      if (!s.al && e.alive) { e.alive = false; e.model.setVisible(false); }
      if (e.model.update) e.model.update(dt, g.camera);
      e.model.setAura(e.alive && s.bl > 0 ? Math.min(1, s.bl / 0.6) : 0, g.time);
      if (!e.alive) continue;
      const ox = mv.pos.x, oz = mv.pos.z;
      const far = Math.hypot(s.p[0] - ox, s.p[2] - oz) > 4;
      if (far) mv.pos.set(...s.p);
      else { mv.pos.x += (s.p[0] - ox) * k; mv.pos.y += (s.p[1] - mv.pos.y) * k; mv.pos.z += (s.p[2] - oz) * k; }
      if (dt > 0 && !far) mv.vel.set((mv.pos.x - ox) / dt, 0, (mv.pos.z - oz) / dt);
      mv.onGround = true;
      mv.yaw += wrapAngle(s.y - mv.yaw) * k;
      mv.pitch += (s.pi - mv.pitch) * k;
      mv.crouch = s.c;
      e.model.setCarrying(e.carrying);
      e.model.setPose(mv.pos, mv.yaw, mv.pitch, mv.horizontalSpeed, dt);
      if (e.model.setAction) e.model.setAction(m.planter === e ? 'plant' : m.defuser === e ? 'saw' : null, g.time, m.boo && m.boo.pos);
      g.footsteps(e, dt);
    }
    g.throwables.update(dt);
    for (const it of g.drops.items) {           // dropped blasters hover and turn
      it.age += dt;
      it.pos.y = it.floor + 0.22 + Math.sin(g.time * 2.4 + it.age) * 0.05;
      it.group.position.copy(it.pos);
      it.group.rotation.y += dt * 0.8;
    }
    // the round's moving parts
    if (m.kind === 'standard') {
      const b = m.boo;
      if (m.phase !== 'end' && m.phase !== 'over') m.timeLeft = Math.max(0, m.timeLeft - dt);
      b.update(dt, g.time);
      m.barriers.update(dt, m.phase === 'prep');
      if (m.phase === 'planted') {
        b.progress = 1 - m.timeLeft / BOOBOO.fuse;
        this.dripIn -= dt;
        if (this.dripIn <= 0) { this.dripIn = b.beatInterval(); Sound.at(b.pos, 'drip', g._volumeAt(b.pos)); }
      }
      if (m.planter) m.plantAnim.update(Math.min(1, m.plantProgress / BOOBOO.plantTime));
      if (m.defuser) m.saw.update(Math.min(1, m.defuseProgress / BOOBOO.uprootTime), dt);
    }
    // tell the host what you're doing
    this.sendIn -= dt;
    if (this.sendIn <= 0) {
      this.sendIn = 1 / NET_RATE;
      const mv = me.mover;
      Net.send({ t: 'g', st: { p: v3(mv.pos), y: +mv.yaw.toFixed(3), pi: +mv.pitch.toFixed(3), c: +mv.crouch.toFixed(2), og: mv.onGround ? 1 : 0,
        ah: me.actionHeld ? 1 : 0, sl: me.slot, nk: me.nadeKind || null, seq: this.lastSeq }, ev: this.outEvents });
      this.outEvents = [];
    }
  }
}
