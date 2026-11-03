// Decorations: details that make a map feel alive but don't need to block anyone —
// street lamps, leafy tree crowns, cafe tables, flowers and a far-away iron tower.
// Maps list them in mapInfo.decor; buildDecor() turns them into meshes.

function buildDecor(scene, list) {
  const root = new THREE.Group();
  const lam = (color, o = {}) => new THREE.MeshLambertMaterial(Object.assign({ color }, o));
  const M = {
    iron: lam(0x2f3038),
    lantern: lam(0xfff2c4, { emissive: 0xffd27a }),
    leaves: [0x5fae4e, 0x6dbd57, 0x4e9a45].map(c => lam(c, { flatShading: true })),
    marble: lam(0xf4f1ea),
    rattan: lam(0xb88a52),
    stem: lam(0x4caf50),
    petals: [0xff6f91, 0xffd23f, 0xc77dff, 0xff9e5e, 0xffffff, 0xff4f6d].map(c => lam(c)),
    tower: lam(0x8c7258, { fog: false, emissive: 0x2a2a30 }),
  };
  const add = (geo, mat, x, y, z, parent = root, shadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    parent.add(m);
    return m;
  };
  // a box stretched between two points (for tower beams)
  const beam = (a, b, thick, mat, parent) => {
    const len = a.distanceTo(b);
    const m = new THREE.Mesh(new THREE.BoxGeometry(thick, len, thick), mat);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    parent.add(m);
    return m;
  };
  const rng = makeRng(321);

  for (const d of list) {
    switch (d.type) {
      case 'lamp': {
        add(new THREE.CylinderGeometry(0.15, 0.2, 0.3, 8), M.iron, d.x, d.y + 0.15, d.z);
        add(new THREE.CylinderGeometry(0.05, 0.07, 3.3, 8), M.iron, d.x, d.y + 1.8, d.z);
        add(new THREE.BoxGeometry(0.28, 0.36, 0.28), M.lantern, d.x, d.y + 3.55, d.z, root, false);
        add(new THREE.ConeGeometry(0.26, 0.22, 4), M.iron, d.x, d.y + 3.85, d.z).rotation.y = Math.PI / 4;
        break;
      }
      case 'pole': {
        add(new THREE.CylinderGeometry(0.05, 0.05, d.h, 8), M.iron, d.x, d.y + d.h / 2, d.z);
        break;
      }
      case 'tree': {
        // a round leafy crown made of a few chunky balls
        const n = 4 + Math.floor(rng() * 2);
        for (let i = 0; i < n; i++) {
          const r = 1.3 + rng() * 0.8;
          const a = rng() * Math.PI * 2, off = i === 0 ? 0 : 1.1;
          add(new THREE.IcosahedronGeometry(r, 1), M.leaves[i % 3],
            d.x + Math.cos(a) * off, d.y + 1.2 + rng() * 1.2, d.z + Math.sin(a) * off);
        }
        break;
      }
      case 'table': {
        add(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 16), M.marble, d.x, d.y + 0.75, d.z);
        add(new THREE.CylinderGeometry(0.04, 0.04, 0.72, 8), M.iron, d.x, d.y + 0.38, d.z);
        add(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 12), M.iron, d.x, d.y + 0.02, d.z);
        for (const s of [-1, 1]) {
          const chair = new THREE.Group();
          chair.position.set(d.x + s * 0.65, d.y, d.z);
          chair.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
          add(new THREE.BoxGeometry(0.42, 0.06, 0.42), M.rattan, 0, 0.45, 0, chair);
          add(new THREE.BoxGeometry(0.42, 0.45, 0.06), M.rattan, 0, 0.7, -0.2, chair);
          for (const [lx, lz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]])
            add(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 6), M.iron, lx, 0.22, lz, chair);
          root.add(chair);
        }
        break;
      }
      case 'flowers': {
        for (let x = d.x0; x <= d.x1; x++)
          for (let z = d.z0; z <= d.z1; z++)
            for (let k = 0; k < 4; k++) {
              const fx = x + 0.2 + rng() * 0.6, fz = z + 0.2 + rng() * 0.6, h = 0.15 + rng() * 0.2;
              add(new THREE.BoxGeometry(0.03, h, 0.03), M.stem, fx, d.y + h / 2, fz, root, false);
              add(new THREE.IcosahedronGeometry(0.08 + rng() * 0.04, 0), M.petals[Math.floor(rng() * M.petals.length)], fx, d.y + h, fz, root, false);
            }
        break;
      }
      case 'tower': {
        // an iron lattice tower on the horizon (never fogged out)
        const t = new THREE.Group();
        t.position.set(d.x, d.y, d.z);
        const levels = [[20, 0], [8.5, 38], [4.2, 78], [1.2, 140]];
        for (let l = 0; l < levels.length - 1; l++) {
          const [w0, y0] = levels[l], [w1, y1] = levels[l + 1];
          for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
            beam(new THREE.Vector3(sx * w0, y0, sz * w0), new THREE.Vector3(sx * w1, y1, sz * w1), l === 0 ? 2.6 : 1.8 - l * 0.4, M.tower, t);
          }
          // cross bracing on each side
          for (let k = 1; k < 4; k++) {
            const f = k / 4, wy = w0 + (w1 - w0) * f, yy = y0 + (y1 - y0) * f;
            for (const [ax, az, bx, bz] of [[1, 1, 1, -1], [1, -1, -1, -1], [-1, -1, -1, 1], [-1, 1, 1, 1]])
              beam(new THREE.Vector3(ax * wy, yy, az * wy), new THREE.Vector3(bx * wy, yy, bz * wy), 0.6, M.tower, t);
          }
        }
        add(new THREE.BoxGeometry(22, 2.2, 22), M.tower, 0, 38, 0, t, false);     // first deck
        add(new THREE.BoxGeometry(11, 1.8, 11), M.tower, 0, 78, 0, t, false);     // second deck
        add(new THREE.BoxGeometry(3.4, 3, 3.4), M.tower, 0, 141, 0, t, false);    // top
        add(new THREE.CylinderGeometry(0.2, 0.3, 14, 6), M.tower, 0, 150, 0, t, false);
        // a big arch under the first deck on each side
        for (const rot of [0, Math.PI / 2]) {
          const arch = new THREE.Mesh(new THREE.TorusGeometry(13, 0.9, 6, 24, Math.PI), M.tower);
          arch.position.set(0, 22, 0);
          arch.rotation.y = rot;
          t.add(arch);
        }
        root.add(t);
        break;
      }
    }
  }
  scene.add(root);
  return root;
}
