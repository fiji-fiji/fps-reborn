// The shop window: big cards for each blaster and shield, plain-words descriptions,
// simple Power / Speed / Range bars, greyed out when you can't afford it.
// Open with B during the buy phase (or any time in the practice garden).

class ShopUI {
  constructor(game, me, hooks) {
    this.game = game;
    this.me = me;
    this.hooks = hooks;           // { onOpen(), onClose(auto) }
    this.isOpen = false;
    this.root = document.getElementById('shop');
    this.grid = document.getElementById('shopGrid');
    this.shields = document.getElementById('shopShields');
    this.moneyEl = document.getElementById('shopMoney');
    this.timerEl = document.getElementById('shopTimer');
    document.getElementById('shopDone').addEventListener('click', () => this.close(false));
    // keys while the shop is open (the game's own key handling is paused then)
    window.addEventListener('keydown', e => {
      if (!this.isOpen) return;
      if (e.code === 'KeyB' || e.code === 'Escape') { e.preventDefault(); this.close(false); }
    });
  }

  toggle() { if (this.isOpen) this.close(false); else this.open(); }

  open() {
    if (this.isOpen || !this.me.alive || !this.game.mode.canBuy(this.me)) return false;
    this.isOpen = true;
    this.root.classList.add('open');
    document.body.classList.add('shopping');     // hides the rest of the HUD behind the shop
    this.render();
    this.hooks.onOpen();
    Sound.click();
    return true;
  }

  // auto = closed by the game (round started), not by the player
  close(auto) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.root.classList.remove('open');
    document.body.classList.remove('shopping');
    this.hooks.onClose(auto);
  }

  _card(item, def, owned) {
    const g = this.game, me = this.me;
    const price = g.priceOf(item);
    const can = g.canAfford(me, item) || owned;
    const b = document.createElement('button');
    b.className = 'card' + (can ? '' : ' cant') + (owned ? ' owned' : '');
    const color = def.look ? `#${def.look.petal.toString(16).padStart(6, '0')}` : def.bow ? '#ff5d8f' : '#9fe3ff';
    const bars = def.bars ? `
      <div class="bars">
        Power <span><i style="right:${100 - def.bars.power * 100}%"></i></span>
        Speed <span><i style="right:${100 - def.bars.speed * 100}%"></i></span>
        Range <span><i style="right:${100 - def.bars.range * 100}%"></i></span>
      </div>` : '';
    b.innerHTML = `
      <div class="swatch" style="background:${color}"></div>
      <div class="top"><span class="name">${def.name}</span><span class="price">${price ? fmtMoney(price) : 'FREE'}</span></div>
      <div class="desc">${def.desc}</div>${bars}`;
    b.addEventListener('click', () => {
      if (g.buy(me, item)) Sound.buy();
      else if (owned && WEAPONS[item]) me.slot = WEAPONS[item].slot;
      else Sound.click();
      this.render();
    });
    return b;
  }

  render() {
    const me = this.me;
    this._renderedMoney = me.money;
    this.grid.innerHTML = '';
    for (const key of SHOP_ORDER) {
      const def = WEAPONS[key];
      this.grid.appendChild(this._card(key, def, me.guns.main && me.guns.main.def === def));
    }
    this.shields.innerHTML = '';
    for (const s of Object.values(SHIELDS)) {
      this.shields.appendChild(this._card(s.key, s, me.shield >= s.amount));
    }
    const util = document.getElementById('shopUtility');
    util.innerHTML = '';
    for (const k of NADE_ORDER) {
      const d = GRENADES[k];
      const shown = Object.assign({}, d, { name: `${d.icon} ${d.name}`, desc: `${d.desc} You have ${me.nades[k]} of ${d.max}.` });
      util.appendChild(this._card(k, shown, me.nades[k] >= d.max));
    }
    this._refreshTop();
  }

  _refreshTop() {
    const mode = this.game.mode;
    this.moneyEl.textContent = mode.freeShop ? 'Everything is free here!' : `🪙 ${fmtMoney(this.me.money)}`;
    this.timerEl.textContent = mode.phase === 'prep' ? `Round starts in ${Math.ceil(mode.timeLeft)}s` : '';
  }

  update() {
    if (!this.isOpen) return;
    if (!this.me.alive || !this.game.mode.canBuy(this.me)) { this.close(true); return; }
    if (this.me.money !== this._renderedMoney) this.render();   // money changed: refresh what you can afford
    this._refreshTop();
  }
}
