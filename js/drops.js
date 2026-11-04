// Dropped blasters. When someone is popped, their main blaster falls on the ground
// (with whatever bubbles were left in it). Anyone, on either team, can take it:
//   - walk over it when you have no main blaster and it's yours automatically
//   - stand next to it and press [F] to swap it for the one you're holding
// Bots without a main blaster go and grab one if it's close. Everything on the
// ground is cleared when a new round starts.

const DROP = {
  reach: 1.2,        // walk this close to pick it up
  swapReach: 2.2,    // [F] works from this far
  life: 45,          // seconds before an untouched blaster disappears (Skirmish)
  botRange: 14,      // bots without a main blaster fetch drops this close
};

class Drops {
  constructor(game) {
    this.game = game;
    this.items = [];
  }

  // A world-sized copy of the first-person blaster model.
  _model(gun) {
    const def = gun.def;
    const ctx = { _box: Viewmodel.prototype._box, _buildHand() {} };
    const vm = def.bow ? Viewmodel.prototype._buildBow.call(ctx) : Viewmodel.prototype._buildFlower.call(ctx, def.look);
    if (def.bow) Viewmodel.prototype._updateBow.call(ctx, vm, { charge: 0, reloading: 0, ammo: 1 }, 0, 0);
    else {
      setJarLevel(vm, gun.ammo / def.magSize);
      vm.flash.visible = false;
    }
    const g = vm.group;
    g.visible = true;
    g.position.set(0, 0, 0);
    g.rotation.set(0, 0, def.bow ? Math.PI / 2 : 0);   // bows lie flat
    g.scale.setScalar(1.5);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    const holder = new THREE.Group();
    holder.add(g);
    this.game.scene.add(holder);
    return holder;
  }

  // `e` was popped: their main blaster falls out of their paws.
  drop(e) {
    const gun = e.guns && e.guns.main;
    if (!gun) return;
    e.guns.main = null;
    if (e.slot === 'main') e.slot = 'side';
    this._spawn(gun, e.pos, e.mover ? e.mover.yaw : 0, e);
  }

  _spawn(gun, at, yaw, owner) {
    gun.reloading = 0;
    gun.drawTime = 0;
    gun.recoilPitch = gun.recoilYaw = 0;
    gun.sprayIndex = 0;
    const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const item = {
      gun,
      group: this._model(gun),
      pos: at.clone().add(new THREE.Vector3(0, 1.1, 0)),
      vel: fwd.multiplyScalar(1.6).add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 2.2, (Math.random() - 0.5) * 0.6)),
      spin: (Math.random() - 0.5) * 6,
      landed: false,
      age: 0,
      owner, ownerWait: 1,          // the one who dropped it can't grab it back straight away
    };
    item.group.rotation.y = yaw;
    this.items.push(item);
    this._changed();
  }

  _changed() { if (this.game.mode) this.game.mode.version++; }   // bots rethink their plans

  _remove(item) {
    this.game.scene.remove(item.group);
    this.items.splice(this.items.indexOf(item), 1);
  }

  clear() { for (const it of [...this.items]) this._remove(it); }

  // `e` takes `item` (and leaves their own main blaster behind if they had one).
  take(e, item) {
    const old = e.guns.main;
    this._remove(item);
    e.guns.main = item.gun;
    e.slot = 'main';
    if (old) this._spawn(old, e.pos, e.mover.yaw, e);
    else this._changed();
    if (e.isPlayer) { Sound.pickup(); HUD.flashHint(`You picked up the ${item.gun.def.name}!`); }
  }

  // The closest drop to `e` (flat distance) within `range`.
  nearest(e, range) {
    let best = null, bestD = range;
    for (const it of this.items) {
      if (it.owner === e && it.ownerWait > 0) continue;
      if (Math.abs(it.pos.y - e.pos.y) > 1.6) continue;
      const d = Math.hypot(it.pos.x - e.pos.x, it.pos.z - e.pos.z);
      if (d < bestD) { bestD = d; best = it; }
    }
    return best;
  }

  // What a bot wants to do about drops: a spot to walk to, or null.
  goalFor(bot) {
    if (bot.guns.main) return null;
    const it = this.nearest(bot, DROP.botRange);
    return it ? { x: it.pos.x, z: it.pos.z, hold: 0 } : null;
  }

  // Hint for you when you're next to one.
  hintFor(me) {
    if (!me.alive || !me.guns) return '';
    const it = this.nearest(me, DROP.swapReach);
    if (!it) return '';
    return me.guns.main ? `Press [F] to swap for the ${it.gun.def.name}` : '';
  }

  markersFor(me) {
    if (!me.alive) return [];
    const out = [];
    for (const it of this.items) {
      if (!it.landed || Math.hypot(it.pos.x - me.pos.x, it.pos.z - me.pos.z) > 12) continue;
      out.push({ x: it.pos.x, y: it.pos.y + 0.8, z: it.pos.z, label: it.gun.def.name, color: '#ffe680' });
    }
    return out;
  }

  // [F] pressed: swap with the closest drop in reach.
  trySwap(me) {
    const it = this.nearest(me, DROP.swapReach);
    if (it) this.take(me, it);
    return !!it;
  }

  update(dt) {
    const g = this.game, world = g.world;
    for (const it of [...this.items]) {
      it.age += dt;
      it.ownerWait -= dt;
      if (!it.landed) {
        // fall and tumble until it lands
        it.vel.y -= 14 * dt;
        const next = it.pos.clone().addScaledVector(it.vel, dt);
        const down = world.raycast(new THREE.Vector3(it.pos.x, it.pos.y + 0.05, it.pos.z), new THREE.Vector3(0, -1, 0), 50);
        const floor = down ? down.point.y : -5;
        if (world.isSolid(world.get(Math.floor(next.x), Math.floor(it.pos.y), Math.floor(next.z)))) { it.vel.x = it.vel.z = 0; next.x = it.pos.x; next.z = it.pos.z; }
        it.pos.copy(next);
        it.group.rotation.y += it.spin * dt;
        if (it.pos.y <= floor + 0.18 && it.vel.y < 0) {
          it.pos.y = floor + 0.18;
          it.landed = true;
          it.floor = floor;
        }
      } else {
        // resting: a little hover and turn so it's easy to spot
        it.pos.y = it.floor + 0.22 + Math.sin(g.time * 2.4 + it.age) * 0.05;
        it.group.rotation.y += dt * 0.8;
      }
      it.group.position.copy(it.pos);
      if (g.mode.kind !== 'standard' && it.age > DROP.life) { this._remove(it); continue; }

      // anyone with no main blaster who walks over it takes it; bots also trade up for a pricier one
      if (!it.landed) continue;
      for (const e of g.entities) {
        if (!e.alive || !e.guns || !e.mover || e.team === 'buddy') continue;
        if (it.owner === e && it.ownerWait > 0) continue;
        if (Math.hypot(it.pos.x - e.pos.x, it.pos.z - e.pos.z) > DROP.reach || Math.abs(it.floor - e.pos.y) > 1.2) continue;
        const main = e.guns.main;
        const wants = !main || (!e.isPlayer && it.gun.def.price > main.def.price);
        if (wants) { this.take(e, it); break; }
      }
    }
  }
}
