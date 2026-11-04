// The blocky character model used by bots, practice buddies and (hidden) by you.
// Handles looks, walking/aiming pose, hit sparkle, name tag, and cutting the body
// into pixels when someone is popped.

// Teams are colours (blue = yours, the dogs; red = theirs, the cats). Which side
// attacks or defends is decided by the game mode and swaps at halftime.
const TEAM_SHIRTS = {
  blue: [0x4f8ff0, 0x5aa8ff, 0x3d7ad8, 0x6fb7ff, 0x4a6fe0],
  red: [0xf05a5a, 0xe04848, 0xff6f61, 0xd9485f, 0xf27045],
};
const TEAM_PANTS = { blue: 0x2f3e66, red: 0x4a3a40 };
const TEAM_SPECIES = { blue: 'dog', red: 'cat' };
const TEAM_CSS = { blue: '#5aa8ff', red: '#ff5a5a', buddy: '#ffd36b' };
const otherTeam = t => (t === 'blue' ? 'red' : 'blue');
const PIXEL = 0.1;   // size of the pixels characters burst into

// Hitboxes (axis-aligned, square so they work whichever way the character faces).
// `h` is the current body height (shorter when crouching).
function characterHitboxes(p, h = PLAYER.height) {
  const k = h / PLAYER.height;
  return [
    { part: 'head', min: [p.x - 0.22, p.y + 1.38 * k, p.z - 0.22], max: [p.x + 0.22, p.y + 1.82 * k, p.z + 0.22] },
    { part: 'body', min: [p.x - 0.42, p.y + 0.75 * k, p.z - 0.42], max: [p.x + 0.42, p.y + 1.38 * k, p.z + 0.42] },
    { part: 'legs', min: [p.x - 0.25, p.y, p.z - 0.25], max: [p.x + 0.25, p.y + 0.75 * k, p.z + 0.25] },
  ];
}

// A chunky seed pod with a little sprout and a glowing band (the Boo-Boo).
function makeSeedPod() {
  const g = new THREE.Group();
  const lam = (c, e = 0) => new THREE.MeshLambertMaterial({ color: c, emissive: e });
  const add = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); g.add(b); return b; };
  add(0.26, 0.3, 0.2, lam(0x8b5a2b), 0, 0, 0);
  add(0.2, 0.36, 0.14, lam(0x9c6a35), 0, 0, 0);
  add(0.28, 0.05, 0.22, lam(0x7fffd4, 0x2a8a70), 0, 0.02, 0);        // glowing band
  add(0.04, 0.12, 0.04, lam(0x5fbf4a), 0, 0.23, 0);                  // sprout
  add(0.1, 0.02, 0.05, lam(0x7bd66b), 0.05, 0.28, 0);
  add(0.1, 0.02, 0.05, lam(0x7bd66b), -0.05, 0.26, 0);
  return g;
}

// Cat coats: [fur, stripes/patches (or null), muzzle, eyes]
const CAT_COATS = [
  [0xf0a050, 0xc8702a, 0xfff1dc, 0x7bd66b],   // orange tabby
  [0x9aa0a8, 0x6d737b, 0xe8eaee, 0xffd23f],   // grey tabby
  [0x3a3a42, null, 0x55555f, 0xffd23f],       // black
  [0xf2dfc0, 0xd9bf95, 0xfff8ea, 0x6fc3ff],   // cream
  [0xf7f3ea, 0xe0893a, 0xffffff, 0x7bd66b],   // white calico
];
const BICHON = { fur: 0xffffff, ear: 0xfbf3e6, dark: 0x1e1e24, tongue: 0xff8fa6 };
const DOG_GLOW = 0x2a2a2a;   // keeps the white fur looking white even in the shade

class CharacterModel {
  // o: { species: 'human'|'dog'|'cat', shirt, pants, hair, seed, armed, name, nameColor, bar }
  constructor(scene, o = {}) {
    const seed = o.seed || 1;
    const species = o.species || 'human';
    const coat = CAT_COATS[seed % CAT_COATS.length];
    // dogs and cats have furry bodies: fur legs and arms, paws, and team clothes on top
    const fur = species === 'dog' ? BICHON.fur : species === 'cat' ? coat[0] : null;
    this.fur = fur;                                   // paws (planting, chainsaw) use the same fur
    const C = this.colors = {
      shirt: o.shirt || 0xff8fb1, pants: fur || o.pants || 0x5b6fa8,
      skin: fur || o.skin || 0xf0c8a0, hair: o.hair || 0x6b4a2b,
    };
    this.mats = [];
    const mat = (tex, glow) => {
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0 });
      if (glow) m.userData.base = new THREE.Color(glow);
      this.mats.push(m);
      return m;
    };
    const dogGlow = species === 'dog' ? DOG_GLOW : 0;
    const shirt = mat(Textures.noisyTexture(C.shirt, 24, 8, 3 + seed));
    const pants = mat(Textures.noisyTexture(C.pants, 18, 8, 5 + seed), dogGlow);
    const skin = mat(Textures.noisyTexture(C.skin, 10, 8, 9));
    const hair = mat(Textures.noisyTexture(C.hair, 14, 8, 10));
    const face = mat(Textures.faceTexture());

    this.parts = [];   // { mesh, w, h, d, color(localY) } for pixelizing
    const box = (parent, w, h, d, m, x, y, z, color) => {
      const mesh = new THREE.Mesh(roundedBoxGeometry(w, h, d, Math.min(w, h, d) * 0.3), m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      this.parts.push({ mesh, w, h, d, color });
      return mesh;
    };
    const pivot = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

    this.group = new THREE.Group();   // position + facing (model front is +z)

    // legs swing from the hips
    this.lLeg = pivot(this.group, -0.12, 0.75, 0);
    this.rLeg = pivot(this.group, 0.12, 0.75, 0);
    box(this.lLeg, 0.22, 0.75, 0.25, pants, 0, -0.375, 0, () => C.pants);
    box(this.rLeg, 0.22, 0.75, 0.25, pants, 0, -0.375, 0, () => C.pants);
    if (fur) {
      const furMat = pants;
      box(this.group, 0.52, 0.48, 0.3, shirt, 0, 1.16, 0, () => C.shirt);         // team vest
      box(this.group, 0.48, 0.2, 0.27, furMat, 0, 0.84, 0, () => fur);            // furry tummy
      box(this.group, 0.44, 0.08, 0.34, shirt, 0, 1.43, 0, () => C.shirt);        // team scarf
      box(this.group, 0.1, 0.14, 0.04, shirt, 0.09, 1.34, 0.18, () => C.shirt);   // scarf knot
      for (const leg of [this.lLeg, this.rLeg])
        box(leg, 0.25, 0.1, 0.32, furMat, 0, -0.71, 0.04, () => fur);              // paw feet
      if (species === 'dog') box(this.group, 0.3, 0.16, 0.08, furMat, 0, 1.3, 0.16, () => fur);   // fluffy chest
    } else {
      box(this.group, 0.5, 0.65, 0.28, shirt, 0, 1.075, 0, () => C.shirt);
    }

    // head tilts with aim
    this.head = pivot(this.group, 0, 1.4, 0);
    const solid = (hex, amt = 0) => {
      const glow = species === 'dog' && (hex === BICHON.fur || hex === BICHON.ear) ? DOG_GLOW : 0;
      const m = amt ? mat(Textures.noisyTexture(hex, amt, 8, 40 + seed), glow) : new THREE.MeshStandardMaterial({ color: hex, roughness: 0.6, metalness: 0 });
      if (!amt) this.mats.push(m);
      return m;
    };
    const part = (parent, w, h, d, hex, x, y, z, amt = 0) => box(parent, w, h, d, solid(hex, amt), x, y, z, () => hex);
    const H = this.head;

    if (species === 'dog') {
      // fluffy white Bichon: round curly head, top puff, cheek puffs, floppy ears, button nose
      const B = BICHON;
      part(H, 0.44, 0.4, 0.4, B.fur, 0, 0.2, 0, 22);
      part(H, 0.36, 0.13, 0.34, B.fur, 0, 0.44, -0.01, 22);          // top puff
      part(H, 0.26, 0.08, 0.26, B.fur, 0, 0.52, -0.02, 22);
      for (const sx of [-1, 1]) {
        part(H, 0.1, 0.22, 0.26, B.fur, sx * 0.25, 0.17, 0.03, 22);   // cheek puffs
        part(H, 0.1, 0.28, 0.17, B.ear, sx * 0.29, 0.12, -0.06, 18);  // floppy ears
        part(H, 0.065, 0.065, 0.02, B.dark, sx * 0.1, 0.25, 0.205);    // eyes
        part(H, 0.022, 0.022, 0.01, 0xffffff, sx * 0.09, 0.27, 0.217); // eye shine
      }
      part(H, 0.2, 0.14, 0.12, B.fur, 0, 0.1, 0.24, 18);               // muzzle
      part(H, 0.075, 0.055, 0.03, B.dark, 0, 0.15, 0.31);               // nose
      part(H, 0.06, 0.04, 0.02, B.tongue, 0, 0.04, 0.3);                // tongue
      part(this.group, 0.16, 0.16, 0.16, B.fur, 0, 0.9, -0.22, 22);    // fluffy tail
      part(this.group, 0.12, 0.12, 0.12, B.fur, 0, 1.0, -0.3, 22);
    } else if (species === 'cat') {
      const [fur, mark, muzzle, eye] = coat;
      part(H, 0.42, 0.36, 0.38, fur, 0, 0.18, 0, 14);
      for (const sx of [-1, 1]) {
        part(H, 0.13, 0.09, 0.07, fur, sx * 0.13, 0.4, -0.02, 14);     // pointy ears
        part(H, 0.07, 0.07, 0.05, fur, sx * 0.13, 0.48, -0.02, 14);
        part(H, 0.06, 0.06, 0.02, 0xff9eb5, sx * 0.13, 0.41, 0.02);    // pink inside
        part(H, 0.075, 0.065, 0.02, eye, sx * 0.1, 0.23, 0.195);       // eyes
        part(H, 0.02, 0.065, 0.01, 0x1e1e24, sx * 0.1, 0.23, 0.206);   // slit pupils
        for (const wy of [0.1, 0.135]) {                                // whiskers
          const w = part(H, 0.15, 0.01, 0.01, 0xffffff, sx * 0.17, wy, 0.22);
          w.rotation.z = sx * (wy - 0.12) * 3;
        }
      }
      if (mark) for (const mx of [-0.07, 0, 0.07]) part(H, 0.04, 0.11, 0.01, mark, mx, 0.31, 0.192);   // forehead stripes
      part(H, 0.18, 0.1, 0.08, muzzle, 0, 0.1, 0.21, 10);              // muzzle
      part(H, 0.05, 0.035, 0.02, 0xff8fa6, 0, 0.15, 0.25);              // nose
      part(this.group, 0.08, 0.08, 0.3, fur, 0, 0.82, -0.27, 14);       // tail, curling up
      part(this.group, 0.08, 0.3, 0.08, mark || fur, 0, 1.0, -0.42, 14);
    } else {
      // BoxGeometry material order is +x, -x, +y, -y, +z, -z; face is +z (front)
      const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), [skin, skin, hair, skin, face, hair]);
      headMesh.position.y = 0.2;
      this.head.add(headMesh);
      this.parts.push({ mesh: headMesh, w: 0.4, h: 0.4, d: 0.4, color: ly => (ly > 0.1 ? C.hair : C.skin) });
    }

    // arms (+ blaster) hang from the shoulders and tilt with aim
    this.aim = pivot(this.group, 0, 1.4, 0);
    const armColor = fur ? () => fur : ly => (ly < -0.25 ? C.skin : C.shirt);
    this.lArm = pivot(this.aim, -0.34, 0, 0);
    this.rArm = pivot(this.aim, 0.34, 0, 0);
    for (const arm of [this.lArm, this.rArm]) {
      box(arm, 0.18, 0.65, 0.22, fur ? pants : shirt, 0, -0.325, 0, armColor);
      if (fur) {
        box(arm, 0.2, 0.08, 0.24, shirt, 0, -0.12, 0, () => C.shirt);              // team armband
        if (species === 'cat' && coat[1])
          for (const sy of [-0.36, -0.46]) box(arm, 0.19, 0.035, 0.23, solid(coat[1]), 0, sy, 0, () => coat[1]);   // tabby stripes
      }
    }

    this.armed = !!o.armed;
    if (this.armed) {
      // arms forward holding a small flower blaster
      this.lArm.rotation.set(-1.35, 0, 0.45);    // reaches across to the blaster
      this.rArm.rotation.set(-1.4, 0, -0.12);
      const green = new THREE.MeshLambertMaterial({ color: 0x4caf50 });
      const petal = new THREE.MeshLambertMaterial({ color: 0xff8fb1 });
      const yellow = new THREE.MeshLambertMaterial({ color: 0xffd36b });
      const bl = pivot(this.aim, 0.14, -0.14, 0.42);
      box(bl, 0.07, 0.07, 0.45, green, 0, 0, 0, () => 0x4caf50);
      box(bl, 0.1, 0.1, 0.04, yellow, 0, 0, 0.25, () => 0xffd36b);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const p = box(bl, 0.06, 0.09, 0.03, petal, Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0.24, () => 0xff8fb1);
        p.rotation.z = a - Math.PI / 2;
      }
      this.muzzle = pivot(bl, 0, 0, 0.3);
    }

    // name tag (teammates) and bubble meter bar (practice buddies)
    if (o.name) {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 64;
      const g = c.getContext('2d');
      g.font = 'bold 36px "Arial Rounded MT Bold", "Avenir Next", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.6)';
      g.strokeText(o.name, 128, 32);
      g.fillStyle = o.nameColor || '#fff';
      g.fillText(o.name, 128, 32);
      const tex = new THREE.CanvasTexture(c);
      tex.encoding = THREE.sRGBEncoding;
      this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
      this.tag.scale.set(1.0, 0.25, 1);
      this.tag.position.y = 2.15;
      this.group.add(this.tag);
    }
    if (o.bar) {
      this.bar = new THREE.Group();
      const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.07), new THREE.MeshBasicMaterial({ color: 0x333344 }));
      this.barFill = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.05), new THREE.MeshBasicMaterial({ color: 0x7fdcff }));
      this.barFill.position.z = 0.001;
      this.bar.add(bg, this.barFill);
      this.bar.position.y = 2.05;
      this.group.add(this.bar);
    }

    // the Boo-Boo seed pod, worn on the back while carrying it
    this.pod = makeSeedPod();
    this.pod.position.set(0, 1.15, -0.25);
    this.pod.visible = false;
    this.group.add(this.pod);

    this.flashTime = 0;
    this.walkPhase = 0;
    for (const p of this.parts) p.mesh.castShadow = true;
    scene.add(this.group);
  }

  setCarrying(v) { this.pod.visible = v; }

  // yaw uses the same convention as Mover (yaw 0 = looking north / -z).
  setPose(pos, yaw, pitch = 0, speed = 0, dt = 0) {
    this.group.position.copy(pos);
    this.group.rotation.y = yaw + Math.PI;
    this.head.rotation.x = -pitch * 0.7;
    this.aim.rotation.x = -pitch;
    this.walkPhase += dt * speed * 2.2;
    const swing = Math.sin(this.walkPhase) * Math.min(1, speed / 4) * 0.6;
    this.lLeg.rotation.x = swing;
    this.rLeg.rotation.x = -swing;
    if (!this.armed) {
      this.lArm.rotation.x = -swing * 0.8;
      this.rArm.rotation.x = swing * 0.8;
    }
  }

  setBar(fraction) {
    if (!this.bar) return;
    this.barFill.scale.x = Math.max(0.001, fraction);
    this.barFill.position.x = -0.29 * (1 - fraction);
  }

  hitFlash() { this.flashTime = 0.1; }
  setVisible(v) { this.group.visible = v; }

  muzzlePosition(out) {
    if (!this.muzzle) return out.copy(this.group.position).setY(this.group.position.y + 1.3);
    this.group.updateMatrixWorld(true);
    return this.muzzle.getWorldPosition(out);
  }

  update(dt, camera) {
    this.flashTime = Math.max(0, this.flashTime - dt);
    const f = this.flashTime > 0 ? 0.45 : 0;
    for (const m of this.mats) {                            // soft white sparkle when hit
      const b = m.userData.base;
      if (b) m.emissive.setRGB(b.r + f, b.g + f, b.b + f); else m.emissive.setRGB(f, f, f);
    }
    if (this.bar) this.bar.quaternion.copy(camera.quaternion).premultiply(this.group.quaternion.clone().invert());
  }

  // Cut the body into small cubes in world space: [{ pos, color }].
  pixelize() {
    this.group.updateMatrixWorld(true);
    const out = [];
    for (const p of this.parts) {
      const nx = Math.max(1, Math.round(p.w / PIXEL));
      const ny = Math.max(1, Math.round(p.h / PIXEL));
      const nz = Math.max(1, Math.round(p.d / PIXEL));
      for (let iy = 0; iy < ny; iy++)
        for (let iz = 0; iz < nz; iz++)
          for (let ix = 0; ix < nx; ix++) {
            const lx = (ix + 0.5) / nx * p.w - p.w / 2;
            const ly = (iy + 0.5) / ny * p.h - p.h / 2;
            const lz = (iz + 0.5) / nz * p.d - p.d / 2;
            const pos = new THREE.Vector3(lx, ly, lz).applyMatrix4(p.mesh.matrixWorld);
            out.push({ pos, color: p.color(ly) });
          }
    }
    return out;
  }
}
