// Visual effects: floating bubbles, confetti sparkles and soap-foam spots.

const CONFETTI = [0xff8fb1, 0xffd36b, 0x8fd3ff, 0xa8e6a1, 0xc9a7ff, 0xffffff];

class Effects {
  constructor(scene) {
    this.scene = scene;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();

    // --- confetti: tiny cubes, one instanced mesh ---
    this.maxConfetti = 400;
    this.confetti = [];
    this.cMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshBasicMaterial(), this.maxConfetti);
    this.cMesh.frustumCulled = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.maxConfetti; i++) {
      this.cMesh.setMatrixAt(i, zero);
      this.cMesh.setColorAt(i, new THREE.Color(1, 1, 1));
      this.confetti.push({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: new THREE.Euler() });
    }
    scene.add(this.cMesh);
    this.cNext = 0;

    // --- bubbles: see-through spheres, one instanced mesh ---
    this.maxBubbles = 500;
    this.bubbles = [];
    this.bMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 8, 6),
      new THREE.MeshLambertMaterial({
        color: 0xd8f6ff, emissive: 0x3a6a88, transparent: true, opacity: 0.55, depthWrite: false,
      }),
      this.maxBubbles);
    this.bMesh.frustumCulled = false;
    for (let i = 0; i < this.maxBubbles; i++) {
      this.bMesh.setMatrixAt(i, zero);
      this.bubbles.push({ life: 0, max: 1, size: 0.05, pos: new THREE.Vector3(), vel: new THREE.Vector3() });
    }
    scene.add(this.bMesh);
    this.bNext = 0;

    // --- pixels: little lit cubes that buddies burst into; they bounce and roll ---
    this.maxPixels = 2400;
    this.pixels = [];
    this.pxMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), this.maxPixels);
    this.pxMesh.frustumCulled = false;
    for (let i = 0; i < this.maxPixels; i++) {
      this.pxMesh.setMatrixAt(i, zero);
      this.pxMesh.setColorAt(i, new THREE.Color(1, 1, 1));
      this.pixels.push({
        life: 0, max: 1, size: 0.1, grounded: false,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(),
        quat: new THREE.Quaternion(), spin: new THREE.Vector3(),
      });
    }
    scene.add(this.pxMesh);
    this.pxNext = 0;
    this.pxActive = false;

    // --- foam spots where bubbles splash on walls (fade away) ---
    this.foam = [];
    this.foamNext = 0;
    const fGeo = new THREE.PlaneGeometry(0.14, 0.14);
    for (let i = 0; i < 60; i++) {
      const m = new THREE.Mesh(fGeo, new THREE.MeshBasicMaterial({
        color: 0xf2fbff, transparent: true, opacity: 0, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }));
      m.visible = false;
      scene.add(m);
      this.foam.push({ mesh: m, life: 0 });
    }
  }

  bubble(pos, vel, size, life) {
    const b = this.bubbles[this.bNext];
    this.bNext = (this.bNext + 1) % this.maxBubbles;
    b.pos.copy(pos);
    b.vel.copy(vel);
    b.size = size;
    b.life = b.max = life;
  }

  // A stream of bubbles from the flower to where the shot landed.
  bubbleTrail(from, to) {
    const dist = from.distanceTo(to);
    const n = Math.min(22, Math.max(3, Math.floor(dist / 0.9)));
    const p = new THREE.Vector3(), v = new THREE.Vector3();
    const dir = to.clone().sub(from).normalize();
    for (let i = 0; i < n; i++) {
      const t = (i + Math.random() * 0.5) / n;
      p.lerpVectors(from, to, t);
      p.x += (Math.random() - 0.5) * 0.08;
      p.y += (Math.random() - 0.5) * 0.08;
      p.z += (Math.random() - 0.5) * 0.08;
      v.copy(dir).multiplyScalar(1.2).add(this._rand(0.3));
      this.bubble(p, v, 0.025 + Math.random() * 0.045, 0.35 + Math.random() * 0.5);
    }
  }

  // Burst of bubbles (e.g. when they splash against something).
  bubbleBurst(point, normal, count = 8, speed = 1.6, size = 0.06) {
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.copy(this._rand(speed)).addScaledVector(normal, speed * 0.7);
      this.bubble(point.clone().addScaledVector(normal, 0.05), v,
        size * (0.5 + Math.random()), 0.4 + Math.random() * 0.6);
    }
  }

  confettiBurst(point, count = 10, speed = 2.5) {
    for (let i = 0; i < count; i++) {
      const idx = this.cNext; this.cNext = (this.cNext + 1) % this.maxConfetti;
      const c = this.confetti[idx];
      c.life = 0.7 + Math.random() * 0.5;
      c.pos.copy(point);
      c.vel.copy(this._rand(speed)); c.vel.y += speed * 0.6;
      c.spin.set(Math.random() * 6, Math.random() * 6, 0);
      this._c.set(CONFETTI[(Math.random() * CONFETTI.length) | 0]);
      this.cMesh.setColorAt(idx, this._c);
    }
    this.cMesh.instanceColor.needsUpdate = true;
  }

  // Burst a list of { pos, color } cubes outward from `center`, nudged along `push`.
  pixelBurst(list, center, push, size) {
    const out = new THREE.Vector3();
    for (const item of list) {
      const idx = this.pxNext; this.pxNext = (this.pxNext + 1) % this.maxPixels;
      const p = this.pixels[idx];
      p.pos.copy(item.pos);
      out.subVectors(item.pos, center);
      out.y *= 0.5;
      const len = out.length() || 1;
      p.vel.copy(out).multiplyScalar((2.2 + Math.random() * 2.2) / len)
        .addScaledVector(push, 2.5 + Math.random() * 1.5)
        .add(this._rand(0.8));
      p.vel.y += 2 + Math.random() * 2.5;
      p.size = size;
      p.grounded = false;
      p.quat.identity();
      p.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(18);
      p.life = p.max = 2.6 + Math.random() * 0.8;
      this._c.set(item.color).multiplyScalar(0.85 + Math.random() * 0.3);
      this.pxMesh.setColorAt(idx, this._c);
    }
    this.pxMesh.instanceColor.needsUpdate = true;
    this.pxActive = true;
  }

  // Gravity, bouncing off blocks, and rolling along the floor.
  _updatePixels(dt, world) {
    if (!this.pxActive) return;
    let any = false;
    const axis = new THREE.Vector3(), dq = new THREE.Quaternion();
    for (let i = 0; i < this.maxPixels; i++) {
      const p = this.pixels[i];
      if (p.life <= 0) continue;
      any = true;
      p.life -= dt;
      const r = p.size / 2;
      p.vel.y -= 18 * dt;

      // move one axis at a time so they slide and bounce off walls/floor
      const nx = p.pos.x + p.vel.x * dt;
      if (world.solidTopAt(nx + Math.sign(p.vel.x) * r, p.pos.y, p.pos.z) !== null) p.vel.x *= -0.35;
      else p.pos.x = nx;
      const nz = p.pos.z + p.vel.z * dt;
      if (world.solidTopAt(p.pos.x, p.pos.y, nz + Math.sign(p.vel.z) * r) !== null) p.vel.z *= -0.35;
      else p.pos.z = nz;
      const ny = p.pos.y + p.vel.y * dt;
      const floor = p.vel.y <= 0 ? world.solidTopAt(p.pos.x, ny - r, p.pos.z) : null;
      if (floor !== null) {
        p.pos.y = floor + r;
        p.vel.y = Math.abs(p.vel.y) > 1.2 ? -p.vel.y * 0.35 : 0;   // bounce, then settle
        p.grounded = p.vel.y === 0;
      } else if (p.vel.y > 0 && world.solidTopAt(p.pos.x, ny + r, p.pos.z) !== null) {
        p.vel.y = 0;
      } else {
        p.pos.y = ny;
        p.grounded = false;
      }

      if (p.grounded) {
        // roll: turn around the axis perpendicular to the motion, slow down gently
        const speed = Math.hypot(p.vel.x, p.vel.z);
        if (speed > 0.02) {
          axis.set(p.vel.z, 0, -p.vel.x).normalize();
          dq.setFromAxisAngle(axis, (speed * dt) / r);
          p.quat.premultiply(dq);
        }
        const k = Math.exp(-dt * 1.6);
        p.vel.x *= k; p.vel.z *= k;
      } else {
        dq.setFromEuler(new THREE.Euler(p.spin.x * dt, p.spin.y * dt, p.spin.z * dt));
        p.quat.multiply(dq);
      }

      const s = p.life > 0 ? p.size * Math.min(1, p.life / 0.5) : 0;   // shrink away at the end
      this._m.compose(p.pos, p.quat, this._s.set(s, s, s));
      this.pxMesh.setMatrixAt(i, this._m);
    }
    this.pxMesh.instanceMatrix.needsUpdate = true;
    this.pxActive = any;
  }

  foamSpot(point, normal) {
    const f = this.foam[this.foamNext];
    this.foamNext = (this.foamNext + 1) % this.foam.length;
    f.mesh.position.copy(point).addScaledVector(normal, 0.003);
    f.mesh.lookAt(point.clone().add(normal));
    f.mesh.rotation.z = Math.random() * Math.PI;
    f.mesh.scale.setScalar(0.6 + Math.random() * 0.6);
    f.mesh.visible = true;
    f.life = 3;
  }

  // random vector in a cube of +/- amt (shared object: copy it before keeping it)
  _rand(amt) {
    if (!this._tmpV) this._tmpV = new THREE.Vector3();
    const r = () => (Math.random() - 0.5) * 2 * amt;
    return this._tmpV.set(r(), r(), r());
  }

  update(dt, world) {
    const time = performance.now() / 1000;
    this._updatePixels(dt, world);

    for (let i = 0; i < this.maxBubbles; i++) {
      const b = this.bubbles[i];
      if (b.life <= 0) continue;
      b.life -= dt;
      b.vel.multiplyScalar(Math.exp(-dt * 2.5));
      b.vel.y += 0.8 * dt;                                  // bubbles drift upward
      b.pos.addScaledVector(b.vel, dt);
      b.pos.x += Math.sin(time * 7 + i) * 0.003;            // little wobble
      const age = 1 - b.life / b.max;
      const s = b.life > 0 ? b.size * (0.6 + age * 0.6) : 0;
      this._m.makeScale(s, s, s).setPosition(b.pos);
      this.bMesh.setMatrixAt(i, this._m);
    }
    this.bMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.maxConfetti; i++) {
      const c = this.confetti[i];
      if (c.life <= 0) continue;
      c.life -= dt;
      c.vel.y -= 6 * dt;
      c.vel.multiplyScalar(Math.exp(-dt * 1.5));
      c.pos.addScaledVector(c.vel, dt);
      c.spin.x += dt * 8; c.spin.y += dt * 6;
      const s = c.life > 0 ? Math.min(1, c.life * 3) : 0;
      this._q.setFromEuler(c.spin);
      this._m.compose(c.pos, this._q, this._s.set(s, s, s));
      this.cMesh.setMatrixAt(i, this._m);
    }
    this.cMesh.instanceMatrix.needsUpdate = true;

    for (const f of this.foam) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.mesh.material.opacity = Math.max(0, Math.min(0.85, f.life));
      if (f.life <= 0) f.mesh.visible = false;
    }
  }
}
