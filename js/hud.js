// Updates the HTML overlay: crosshair, hit markers, health/shield, money, ammo +
// weapon slots, match bar (scores, timer, who's alive), banners, hints, markers
// over places to go, plant/uproot progress, pop feed, hurt flash, "you're out"
// message and the minimap. Text in [brackets] is drawn as a keyboard key.

const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const keysToHtml = s => String(s || '').replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>');
const fmtMoney = n => n.toLocaleString('en-US');

const HUD = {
  init(game) {
    this.game = game;
    const $ = id => document.getElementById(id);
    this.el = {
      chTop: document.querySelector('.ch-top'),
      chBottom: document.querySelector('.ch-bottom'),
      chLeft: document.querySelector('.ch-left'),
      chRight: document.querySelector('.ch-right'),
      hit: $('hitmarker'), dmg: $('dmgText'),
      health: $('health'), healthFill: $('healthFill'), shield: $('shieldBadge'),
      money: $('money'), moneyNum: $('moneyNum'), moneyGain: $('moneyGain'),
      ammo: $('ammo'), reserve: $('reserve'), weaponName: $('weaponName'),
      reloadBar: $('reloadBar'), reloadFill: $('reloadFill'), slots: $('slots'),
      drawBar: $('drawBar'), drawFill: $('drawFill'), scope: $('scope'), crosshair: $('crosshair'),
      score: $('score'), scoreA: $('scoreA'), scoreB: $('scoreB'), roleA: $('roleA'), roleB: $('roleB'),
      timer: $('timer'), roundNo: $('roundNo'), aliveA: $('aliveA'), aliveB: $('aliveB'),
      banner: $('banner'), bannerTitle: $('bannerTitle'), bannerSub: $('bannerSub'),
      hint: $('hint'), action: $('action'), actionLabel: $('actionLabel'), actionFill: $('actionFill'),
      carry: $('carry'), spectate: $('spectate'), markers: $('markers'),
      feed: $('feed'), hurt: $('hurt'), hurtDir: $('hurtDir'),
      out: $('outMsg'), outBy: $('outBy'), outWhen: $('outWhen'),
      dazzle: $('dazzle'), haze: $('haze'), board: $('scoreboard'), ammoLabel: $('ammoLabel'),
    };
    this.dazzleLeft = 0;
    this.dazzleTotal = 1;
    this.hitTime = 0;
    this.dmgTime = 0;
    this.hurtTime = 0;
    this.outLeft = 0;
    this.bannerLeft = 0;
    this.flashHintLeft = 0;
    this.gainLeft = 0;
    this.markerEls = [];
    this.el.score.style.display = game.mode.hud() ? 'flex' : 'none';
  },

  // ---- shop hooks (the shop itself lives in shop.js) ----
  openShopSoon() { this._openShopNext = true; },
  closeShop() { if (this.shop) this.shop.close(true); },

  // spread in radians -> crosshair gap in pixels
  setSpread(spread, camera) {
    const pxPerUnit = (window.innerHeight / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const gap = 4 + Math.min(120, Math.tan(spread) * pxPerUnit);
    const e = this.el, len = 9;
    e.chTop.style.top = `${-gap - len}px`;
    e.chBottom.style.top = `${gap}px`;
    e.chLeft.style.left = `${-gap - len}px`;
    e.chRight.style.left = `${gap}px`;
  },

  hitmarker(part, out, damage) {
    this.el.hit.className = out ? 'kill' : part === 'head' ? 'head' : '';
    this.hitTime = 0.15;
    const d = this.el.dmg;
    d.textContent = out ? 'POP!' : part === 'head' ? `BULLSEYE ${damage}` : `${damage}`;
    d.style.color = out ? '#ff8fb1' : part === 'head' ? '#ffd23f' : '#fff';
    this.dmgTime = 0.6;
  },

  // You got hit: soft pink flash + an arrow pointing where it came from.
  hurt(attacker, me) {
    this.hurtTime = 0.35;
    if (!attacker) return;
    const dx = attacker.pos.x - me.pos.x, dz = attacker.pos.z - me.pos.z;
    const toward = Math.atan2(-dx, -dz);                       // yaw that would face the attacker
    const rel = toward - me.mover.yaw;                          // 0 = straight ahead
    this.el.hurtDir.style.transform = `translate(-50%, -50%) rotate(${-rel}rad) translateY(-7rem)`;
    this.el.hurtDir.style.opacity = 1;
  },

  // "Pip [blaster icon] ✦ Kiki" — ✦ means it was a head hit.
  feed(attacker, victim, head, weapon) {
    const row = document.createElement('div');
    row.className = 'feedRow';
    const name = e => `<span style="color:${TEAM_CSS[e.team]}">${e.name}</span>`;
    const who = attacker ? name(attacker) : '<span style="color:#7fffd4">The tree</span>';
    const icon = WeaponIcons.html(weapon || (attacker ? 'bloom' : 'tree'));
    row.innerHTML = `${who} <span class="pop">${icon}${head ? '<b class="headIcon">✦</b>' : ''}</span> ${name(victim)}`;
    this.el.feed.prepend(row);
    while (this.el.feed.children.length > 5) this.el.feed.lastChild.remove();
    setTimeout(() => row.remove(), 6000);
  },

  // Big message in the middle of the screen.
  banner(title, sub = '', seconds = 3, color = '#ffffff') {
    this.el.bannerTitle.textContent = title;
    this.el.bannerTitle.style.color = color;
    this.el.bannerSub.innerHTML = keysToHtml(sub);
    this.el.banner.style.display = 'block';
    this.bannerLeft = seconds;
  },

  // Short-lived hint (overrides the normal one for a moment).
  flashHint(text) { this.flashText = text; this.flashHintLeft = 2.5; },

  // Sparkle Pop got you: bright glittery screen that fades out.
  dazzle(seconds) {
    this.dazzleLeft = Math.max(this.dazzleLeft, seconds);
    this.dazzleTotal = Math.max(this.dazzleLeft, 0.01);
  },

  // Hold Tab: everyone's pops and outs (money only for your team).
  scoreboard(show, game, me) {
    const el = this.el.board;
    if (!show || !game.hasTeams) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    const rows = team => game.entities.filter(e => e.team === team)
      .sort((a, b) => b.stats.pops - a.stats.pops)
      .map(e => `<tr class="${e.alive ? '' : 'out'}${e === me ? ' me' : ''}">
        <td style="color:${TEAM_CSS[e.team]}">${e.name}${e.carrying && team === me.team ? ' ✿' : ''}</td>
        <td>${e.stats.pops}</td><td>${e.stats.outs}</td>
        <td>${team === me.team && game.mode.kind === 'standard' ? '🪙 ' + fmtMoney(e.money) : ''}</td></tr>`).join('');
    const html = `<table><tr><th>YOUR TEAM</th><th>Pops</th><th>Outs</th><th></th></tr>${rows(me.team)}</table>
      <table><tr><th>ENEMY</th><th>Pops</th><th>Outs</th><th></th></tr>${rows(otherTeam(me.team))}</table>`;
    if (html !== this._lastBoard) { el.innerHTML = html; this._lastBoard = html; }
  },

  moneyGain(amount) {
    this.el.moneyGain.textContent = `+${fmtMoney(amount)}`;
    this.gainLeft = 2.5;
  },

  showOut(byName, seconds) {
    this.outLeft = seconds || 0;
    this.outShowLeft = 2;                       // only on screen for 2 s, then you just watch your team
    this.el.outBy.textContent = byName;
    this.el.outWhen.textContent = seconds ? `Back in ${Math.ceil(seconds)}…` : "You'll be back next round. Watch your team meanwhile!";
    this.el.out.style.display = 'block';
    this.el.out.style.opacity = 1;
  },
  hideOut() { this.outLeft = 0; this.el.out.style.display = 'none'; },

  setSpectating(name) {
    this.el.spectate.style.display = name ? 'block' : 'none';
    if (name) this.el.spectate.innerHTML = `Watching <b>${name}</b> · ${keysToHtml('[Click]')} to switch`;
  },

  // The match bar at the top: your team vs the enemy, sides, timer, round, who's still in.
  updateMatch(data) {
    if (!data) return;
    const e = this.el;
    e.scoreA.textContent = data.scores.blue;
    e.scoreB.textContent = data.scores.red;
    const word = s => (s === 'attack' ? 'ATTACKING' : 'DEFENDING');
    e.roleA.textContent = data.sides ? word(data.sides.blue) : 'TEAM';
    e.roleB.textContent = data.sides ? word(data.sides.red) : 'TEAM';
    if (data.timer == null) {
      e.timer.textContent = data.round ? '—' : 'SKIRMISH';
      e.timer.className = '';
    } else {
      e.timer.textContent = (data.planted ? '✿ ' : data.buying ? '🛒 ' : '') + fmtTime(Math.ceil(data.timer));
      e.timer.className = data.planted ? 'planted' : data.timer <= 10 && !data.buying ? 'low' : '';
    }
    e.roundNo.textContent = data.round ? `ROUND ${data.round} · FIRST TO 13` : '';
    const pips = (alive, total, team) => {
      let s = '';
      for (let i = 0; i < total; i++) s += `<i class="${i < alive ? team : 'gone'}"></i>`;
      return s;
    };
    const a = pips(data.alive.blue, data.total.blue, 'blue'), b = pips(data.alive.red, data.total.red, 'red');
    if (a !== this._lastA) { e.aliveA.innerHTML = a; this._lastA = a; }
    if (b !== this._lastB) { e.aliveB.innerHTML = b; this._lastB = b; }
  },

  // Floating labels over places to go. list: [{ x, y, z, label, color }]
  updateMarkers(camera, me, list) {
    const els = this.markerEls, wrap = this.el.markers;
    while (els.length < list.length) {
      const d = document.createElement('div');
      d.className = 'marker';
      d.innerHTML = '<div class="tag"></div><div class="dist"></div><div class="pin"></div>';
      wrap.appendChild(d);
      els.push(d);
    }
    const W = window.innerWidth, H = window.innerHeight, pad = 60;
    const v = new THREE.Vector3();
    els.forEach((el, i) => {
      const m = list[i];
      if (!m) { el.style.display = 'none'; return; }
      v.set(m.x, m.y, m.z).project(camera);
      const behind = v.z > 1;
      let sx = (v.x * 0.5 + 0.5) * W, sy = (-v.y * 0.5 + 0.5) * H;
      if (behind) { sx = W - sx; sy = H - pad; }
      const edge = behind || sx < pad || sx > W - pad || sy < pad || sy > H - pad;
      sx = Math.max(pad, Math.min(W - pad, sx));
      sy = Math.max(pad + 20, Math.min(H - pad, sy));
      el.style.display = 'flex';
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;
      el.style.color = m.color;
      el.classList.toggle('edge', edge);
      const tag = el.firstChild;
      if (tag.textContent !== m.label) tag.textContent = m.label;
      el.children[1].textContent = `${Math.round(Math.hypot(m.x - me.pos.x, m.z - me.pos.z))} m`;
    });
  },

  update(dt, me, mode, view) {
    this.hitTime = Math.max(0, this.hitTime - dt);
    this.dmgTime = Math.max(0, this.dmgTime - dt);
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.el.hit.style.opacity = this.hitTime > 0 ? 1 : 0;
    this.el.dmg.style.opacity = Math.min(1, this.dmgTime * 3);
    this.el.hurt.style.opacity = this.hurtTime * 2;
    if (this.hurtTime === 0) this.el.hurtDir.style.opacity = 0;
    if (this.outLeft > 0) {
      this.outLeft = Math.max(0, this.outLeft - dt);
      this.el.outWhen.textContent = `Back in ${Math.ceil(this.outLeft)}…`;
    }
    if (this.outShowLeft > 0) {
      this.outShowLeft -= dt;
      this.el.out.style.opacity = Math.min(1, this.outShowLeft * 3);
      if (this.outShowLeft <= 0) this.el.out.style.display = 'none';
    }
    this.dazzleLeft = Math.max(0, this.dazzleLeft - dt);
    this.el.dazzle.style.opacity = Math.min(1, (this.dazzleLeft / this.dazzleTotal) * 1.8);
    this.el.haze.style.opacity = (view.haze || 0) * 0.9;
    if (this.bannerLeft > 0) {
      this.bannerLeft -= dt;
      this.el.banner.style.opacity = Math.min(1, this.bannerLeft * 2);
      if (this.bannerLeft <= 0) this.el.banner.style.display = 'none';
    }

    // hint + plant/uproot progress
    this.flashHintLeft = Math.max(0, this.flashHintLeft - dt);
    let hint = this.flashHintLeft > 0 ? this.flashText : mode.hintFor(me);
    const gun = me.gun;
    if (!hint && me.alive && gun.ammo === 0 && gun.reserve > 0 && !gun.busy) hint = 'Out of bubbles! Press [R] to refill';
    if (hint !== this._lastHint) { this.el.hint.innerHTML = keysToHtml(hint); this._lastHint = hint; }
    this.el.hint.style.display = hint ? 'block' : 'none';
    const act = mode.actionFor(me);
    this.el.action.style.display = act ? 'block' : 'none';
    if (act) {
      this.el.actionLabel.textContent = act.label;
      this.el.actionFill.style.width = `${Math.min(1, act.frac) * 100}%`;
    }
    this.el.carry.style.display = me.carrying && me.alive ? 'block' : 'none';
    this.updateMatch(mode.hud());

    // health, shield, money
    this.el.health.textContent = Math.ceil(me.health);
    this.el.healthFill.style.width = `${me.health}%`;
    this.el.shield.style.display = me.shield > 0 ? 'inline' : 'none';
    this.el.shield.textContent = `🛡 ${Math.ceil(me.shield)}`;
    const showMoney = mode.kind === 'standard' || mode.freeShop;
    this.el.money.style.display = showMoney ? 'block' : 'none';
    this.el.moneyNum.textContent = mode.freeShop ? 'FREE' : fmtMoney(me.money);
    this.gainLeft = Math.max(0, this.gainLeft - dt);
    this.el.moneyGain.style.opacity = Math.min(1, this.gainLeft);

    // ammo + slots (or the grenade you're holding)
    const holdingNade = me.slot === 'nade' && me.nadeKind;
    if (me.slot === 'seed') {
      this.el.ammo.textContent = '✿';
      this.el.reserve.textContent = '1';
      this.el.weaponName.textContent = 'The seed';
      this.el.ammoLabel.innerHTML = keysToHtml('Hold [E] or [Click] on A or B');
    } else if (me.slot === 'knife') {
      this.el.ammo.textContent = '∞';
      this.el.reserve.textContent = '';
      this.el.weaponName.textContent = gun.def.name;
      this.el.ammoLabel.innerHTML = keysToHtml('[Click] up close = pop');
    } else if (holdingNade) {
      const nd = GRENADES[me.nadeKind];
      this.el.ammo.textContent = me.nades[me.nadeKind];
      this.el.reserve.textContent = nd.max;
      this.el.weaponName.textContent = `${nd.icon} ${nd.name}`;
      this.el.ammoLabel.innerHTML = keysToHtml('[Click] far · [Right-click] short');
    } else {
      this.el.ammo.textContent = gun.ammo;
      this.el.reserve.textContent = gun.reserve;
      this.el.weaponName.textContent = gun.def.name;
      this.el.ammoLabel.textContent = gun.def.bow ? 'ARROWS' : 'BUBBLES';
    }
    const reloading = gun.reloading > 0;
    this.el.reloadBar.style.visibility = reloading ? 'visible' : 'hidden';
    if (reloading) this.el.reloadFill.style.width = `${(1 - gun.reloading / gun.def.reloadTime) * 100}%`;
    const nadeText = NADE_ORDER.filter(k => me.nades[k] > 0).map(k => `${GRENADES[k].icon}×${me.nades[k]}`).join(' ');
    const slotsHtml = [['main', '1'], ['side', '2'], ['knife', '3']]
      .filter(([s]) => me.guns[s])
      .map(([s, k]) => `<div class="slot${me.slot === s ? ' on' : ''}">${keysToHtml(`[${k}]`)} ${me.guns[s].def.name}</div>`)
      .join('')
      + (me.carrying ? `<div class="slot${me.slot === 'seed' ? ' on' : ''}">${keysToHtml('[4]')} ✿ Seed</div>` : '')
      + (nadeText ? `<div class="slot${me.slot === 'nade' ? ' on' : ''}">${keysToHtml('[5]')} ${nadeText}</div>` : '');
    if (slotsHtml !== this._lastSlots) { this.el.slots.innerHTML = slotsHtml; this._lastSlots = slotsHtml; }

    // bow pull meter + sniper zoom
    if (holdingNade || me.slot === 'seed' || me.slot === 'knife') this.el.reloadBar.style.visibility = 'hidden';
    const drawing = !holdingNade && me.slot !== 'seed' && gun.def.bow && gun.drawTime > 0;
    this.el.drawBar.style.display = drawing ? 'block' : 'none';
    if (drawing) this.el.drawFill.style.width = `${gun.charge * 100}%`;
    this.el.scope.style.display = view.scoped ? 'block' : 'none';
    this.el.crosshair.style.display = view.scoped ? 'none' : 'block';
  },

  // ---------- Minimap (whole map, north up) ----------
  initMinimap(world, mapInfo) {
    const RES = 480; // internal pixels on the longest side (shown at half size, crisp on Retina)
    const s = RES / Math.max(world.sx, world.sz);
    const c = document.getElementById('minimap');
    c.width = Math.round(world.sx * s);
    c.height = Math.round(world.sz * s);
    c.style.width = `${(c.width / RES) * 15}rem`;
    c.style.height = `${(c.height / RES) * 15}rem`;
    this.mm = { canvas: c, ctx: c.getContext('2d'), scale: s };

    // draw the static layout once into an offscreen canvas
    const bg = document.createElement('canvas');
    bg.width = c.width; bg.height = c.height;
    const g = bg.getContext('2d');
    const ground = mapInfo.spawn.y;
    for (let z = 0; z < world.sz; z++)
      for (let x = 0; x < world.sx; x++) {
        // walk up the solid stack to find the standing surface
        let y = 0, top = 0, topId = 0;
        while (y < world.sy) {
          const id = world.get(x, y, z);
          if (!world.isSolid(id)) break;
          top = y + world.height(id); topId = id;
          if (world.height(id) < 1) break;
          y++;
        }
        const above = world.get(x, Math.floor(top), z);
        const rise = top - ground;
        let col;
        if (world.isLiquid(above)) col = '#6ec6ee';                 // water
        else if (rise > 2.1) col = '#5d4e3c';                        // buildings / walls
        else if (rise > 0.6) col = '#b08f5e';                        // crates / platforms
        else if (topId === B.plaza) col = '#f6e7c2';                 // site floor
        else col = '#e0cfa2';                                        // street
        g.fillStyle = col;
        g.fillRect(Math.floor(x * s), Math.floor(z * s), Math.ceil(s), Math.ceil(s));
      }
    if (mapInfo.sites) {
      g.font = `bold ${Math.round(s * 9)}px "Arial Rounded MT Bold", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const [name, r] of Object.entries(mapInfo.sites)) {
        const cx = ((r.x0 + r.x1 + 1) / 2) * s, cy = ((r.z0 + r.z1 + 1) / 2) * s;
        g.fillStyle = name === 'A' ? '#ff8fb1' : '#50c8d2';
        g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = s * 0.8;
        g.strokeText(name, cx, cy); g.fillText(name, cx, cy);
      }
    }
    this.mm.bg = bg;
  },

  // Teammates always show; enemies only while your team can see them.
  drawMinimap(me, entities, time, boo) {
    if (!this.mm) return;
    const { ctx, scale: s, bg, canvas } = this.mm;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bg, 0, 0);

    for (const e of entities) {
      if (e === me || !e.alive) continue;
      const enemy = e.team !== me.team && e.team !== 'buddy';
      if (enemy && e.spottedUntil < time) continue;
      ctx.fillStyle = e.team === 'buddy' ? '#ff6f9f' : TEAM_CSS[e.team];
      ctx.strokeStyle = '#10141a'; ctx.lineWidth = s * 0.4;
      ctx.beginPath();
      ctx.arc(e.pos.x * s, e.pos.z * s, s * (enemy ? 1.7 : 1.4), 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }

    // the seed: a green diamond (pulses once planted)
    if (boo) {
      const r = s * (boo.planted ? 2.4 + Math.sin(time * 8) * 0.5 : 1.8);
      ctx.fillStyle = boo.planted ? '#7fffd4' : '#5fbf4a';
      ctx.strokeStyle = '#10141a'; ctx.lineWidth = s * 0.5;
      ctx.beginPath();
      ctx.moveTo(boo.x * s, boo.z * s - r);
      ctx.lineTo(boo.x * s + r, boo.z * s);
      ctx.lineTo(boo.x * s, boo.z * s + r);
      ctx.lineTo(boo.x * s - r, boo.z * s);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    }
    if (!me.alive) return;

    // you: view cone + big white arrow
    const px = me.pos.x * s, pz = me.pos.z * s;
    const ang = Math.atan2(-Math.cos(me.mover.yaw), -Math.sin(me.mover.yaw));
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath();
    ctx.moveTo(px, pz);
    ctx.arc(px, pz, s * 14, ang - 0.6, ang + 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(ang);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#10141a'; ctx.lineWidth = s * 0.45;
    ctx.beginPath();
    ctx.moveTo(s * 3, 0);
    ctx.lineTo(-s * 2, s * 1.9);
    ctx.lineTo(-s * 1, 0);
    ctx.lineTo(-s * 2, -s * 1.9);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  },
};
