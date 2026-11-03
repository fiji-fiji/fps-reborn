// Rose Bow arrows: real projectiles that fly, drop with gravity, stick into walls,
// and burst into bubbles when they hit someone.

class Arrows {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.pool = [];
    const lam = c => new THREE.MeshLambertMaterial({ color: c });
    this.mats = { shaft: lam(0x7bd66b), bud: lam(0xff5d8f), leaf: lam(0x5fbf4a) };
    this._o = [0, 0, 0]; this._d = [0, 0, 0];
  }

  _mesh() {
    let m = this.pool.pop();
    if (m) { m.visible = true; return m; }
    // built pointing along +z so lookAt() aims it along its flight
    m = new THREE.Group();
    const add = (w, h, d, mat, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.z = z; m.add(b); };
    add(0.03, 0.03, 0.75, this.mats.shaft, 0);
    add(0.08, 0.08, 0.1, this.mats.bud, 0.4);
    add(0.09, 0.008, 0.1, this.mats.leaf, -0.32);
    add(0.008, 0.09, 0.1, this.mats.leaf, -0.32);
    this.game.scene.add(m);
    return m;
  }

  fire(owner, pos, dir, def, charge) {
    const d = def.draw;
    const speed = d.minSpeed + (d.maxSpeed - d.minSpeed) * charge;
    const a = {
      owner, def, charge,
      pos: pos.clone(), vel: dir.clone().multiplyScalar(speed),
      life: 6, stuck: false, mesh: this._mesh(),
    };
    a.mesh.position.copy(a.pos);
    this.list.push(a);
    Sound.bowRelease(this.game._volumeAt(pos));
  }

  update(dt) {
    const g = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.life -= dt;
      if (a.life <= 0) { this._remove(i); continue; }
      if (a.stuck) continue;

      a.vel.y -= a.def.draw.gravity * dt;
      const step = a.vel.clone().multiplyScalar(dt);
      const len = step.length();
      const dir = step.clone().divideScalar(len);

      // did it hit someone before a wall?
      const wall = g.world.raycast(a.pos, dir, len);
      let best = wall ? wall.t : len, target = null, part = null;
      const o = this._o, d = this._d;
      o[0] = a.pos.x; o[1] = a.pos.y; o[2] = a.pos.z; d[0] = dir.x; d[1] = dir.y; d[2] = dir.z;
      for (const e of g.entities) {
        if (!e.alive || e === a.owner || e.team === a.owner.team) continue;
        for (const hb of e.hitboxes()) {
          const r = rayAABB(o, d, hb.min, hb.max);
          if (r && r.t < best) { best = r.t; target = e; part = hb.part; }
        }
      }
      const hitPoint = a.pos.clone().addScaledVector(dir, best);

      if (target) {
        const dmg = Math.round(a.def.damage[part] * (0.35 + 0.65 * a.charge));
        g.applyHit(a.owner, target, part, dmg, hitPoint, dir, a.def.key);
        g.effects.bubbleBurst(hitPoint, dir.clone().negate(), 10, 2);
        this._remove(i);
        continue;
      }
      if (wall) {
        a.pos.copy(wall.point).addScaledVector(dir, 0.15);   // a little bit stuck into the wall
        a.stuck = true;
        a.life = 5;
        g.effects.bubbleBurst(wall.point, wall.normal, 8, 1.5);
        Sound.thunk(g._volumeAt(a.pos));
      } else {
        a.pos.add(step);
      }
      a.mesh.position.copy(a.pos);
      a.mesh.lookAt(a.pos.clone().add(dir));
    }
  }

  _remove(i) {
    const a = this.list[i];
    a.mesh.visible = false;
    this.pool.push(a.mesh);
    this.list.splice(i, 1);
  }

  clear() { while (this.list.length) this._remove(this.list.length - 1); }
}
