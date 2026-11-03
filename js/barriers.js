// Spawn barriers: glowing see-through walls across every exit of each team's spawn
// area. They stand during the pre-round (when you can walk around your spawn but
// not leave it) and fade away at GO.

class SpawnBarriers {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    this.mats = [];
    this.opacity = 0;
    game.scene.add(this.group);

    // a soft diamond-grid pattern
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath();
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, 0, 64, 64);
    this.pattern = new THREE.CanvasTexture(c);
    this.pattern.wrapS = this.pattern.wrapT = THREE.RepeatWrapping;
    this.pattern.encoding = THREE.sRGBEncoding;

    for (const rect of Object.values(game.mapInfo.spawns)) this._wallsFor(rect);
    this.group.visible = false;
  }

  // Find where the spawn area opens onto walkable ground and put a wall across it.
  _wallsFor(r) {
    const nav = this.game.nav;
    const edges = [
      // [cells along the edge, inside cell, outside cell, wall position, along x?]
      { along: [r.x0, r.x1], inside: i => [i, r.z0], outside: i => [i, r.z0 - 1], line: r.z0, alongX: true },
      { along: [r.x0, r.x1], inside: i => [i, r.z1], outside: i => [i, r.z1 + 1], line: r.z1 + 1, alongX: true },
      { along: [r.z0, r.z1], inside: i => [r.x0, i], outside: i => [r.x0 - 1, i], line: r.x0, alongX: false },
      { along: [r.z0, r.z1], inside: i => [r.x1, i], outside: i => [r.x1 + 1, i], line: r.x1 + 1, alongX: false },
    ];
    for (const e of edges) {
      let start = null, floor = 0;
      for (let i = e.along[0]; i <= e.along[1] + 1; i++) {
        const open = i <= e.along[1] && nav.walkable(...e.inside(i)) && nav.walkable(...e.outside(i));
        if (open && start === null) { start = i; floor = nav.floorAt(...e.inside(i)); }
        if (!open && start !== null) { this._wall(start, i, e.line, e.alongX, floor); start = null; }
      }
    }
  }

  _wall(a, b, line, alongX, floor) {
    const len = b - a, h = 3.4;
    const tex = this.pattern.clone();
    tex.needsUpdate = true;
    tex.repeat.set(len / 1.2, h / 1.2);
    const mat = new THREE.MeshBasicMaterial({
      map: tex, color: 0x9ff7ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.mats.push(mat);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(len, h), mat);
    const mid = (a + b) / 2;
    if (alongX) wall.position.set(mid, floor + h / 2, line);
    else { wall.position.set(line, floor + h / 2, mid); wall.rotation.y = Math.PI / 2; }
    this.group.add(wall);
    // bright edges along the bottom and top
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xbffcff, transparent: true, opacity: 0, fog: false });
    this.mats.push(edgeMat);
    for (const y of [floor + 0.03, floor + h]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(alongX ? len : 0.06, 0.06, alongX ? 0.06 : len), edgeMat);
      bar.position.set(alongX ? mid : line, y, alongX ? line : mid);
      this.group.add(bar);
    }
  }

  // show = true during the pre-round
  update(dt, show) {
    const target = show ? 1 : 0;
    this.opacity += (target - this.opacity) * Math.min(1, dt * (show ? 8 : 5));
    if (this.opacity < 0.01 && !show) { this.group.visible = false; return; }
    this.group.visible = true;
    const t = performance.now() / 1000;
    for (const m of this.mats) {
      m.opacity = (m.map ? 0.45 + Math.sin(t * 2.5) * 0.08 : 0.9) * this.opacity;
      if (m.map) m.map.offset.y = (t * 0.15) % 1;
    }
  }
}
