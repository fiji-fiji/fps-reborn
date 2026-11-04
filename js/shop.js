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
    this.nextEl = document.getElementById('shopNext');
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

  // a card is just the item's picture and its price (the name shows when you hover it)
  _card(item, def, owned, extra = '') {
    const g = this.game, me = this.me;
    const price = g.priceOf(item);
    const can = g.canAfford(me, item) || owned;
    const b = document.createElement('button');
    b.className = 'card' + (can ? '' : ' cant') + (owned ? ' owned' : '');
    b.title = def.name;
    b.innerHTML = `
      <div class="icon">${WeaponIcons.big(item, 0.3)}</div>
      <div class="price">${price ? fmtMoney(price) : 'FREE'}</div>${extra}`;
    b.addEventListener('click', () => {
      if (g.buy(me, item)) Sound.buy();
      else if (owned && WEAPONS[item]) me.slot = WEAPONS[item].slot;
      else Sound.click();
      this.render();
    });
    b.addEventListener('contextmenu', ev => {           // right-click: sell it back
      ev.preventDefault();
      if (g.sell(me, item)) Sound.sell(); else Sound.click();
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
      const pips = `<div class="pips">${'●'.repeat(me.nades[k])}${'○'.repeat(d.max - me.nades[k])}</div>`;
      util.appendChild(this._card(k, d, me.nades[k] >= d.max, pips));
    }
    this._refreshTop();
  }

  _refreshTop() {
    const mode = this.game.mode;
    const money = mode.freeShop ? 'Everything is free here!' : `${WeaponIcons.money(0.9)} ${fmtMoney(this.me.money)}`;
    if (money !== this._lastMoneyHtml) { this.moneyEl.innerHTML = money; this._lastMoneyHtml = money; }
    const next = !mode.freeShop && mode.minNextMoney ? mode.minNextMoney(this.me) : null;
    const nextHtml = next == null ? '' : `next round, at least ${WeaponIcons.money(0.8)} ${fmtMoney(next)}`;
    if (nextHtml !== this._lastNextHtml) { this.nextEl.innerHTML = nextHtml; this._lastNextHtml = nextHtml; }
    this.timerEl.textContent = mode.phase === 'prep' ? `Round starts in ${Math.ceil(mode.timeLeft)}s` : '';
  }

  update() {
    if (!this.isOpen) return;
    if (!this.me.alive || !this.game.mode.canBuy(this.me)) { this.close(true); return; }
    if (this.me.money !== this._renderedMoney) this.render();   // money changed: refresh what you can afford
    this._refreshTop();
  }
}
