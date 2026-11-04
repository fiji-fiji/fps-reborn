// Movement physics shared by you and the bots: running, walking, jumping,
// crouching and colliding with blocks. It doesn't read the keyboard itself —
// it's driven by a small command object, so a bot can drive it the same way:
//   { fwd: -1..1, right: -1..1, jump: bool, crouch: bool, walk: bool }

const PLAYER = {
  radius: 0.3,         // half-width of the collision box
  height: 1.8,
  crouchHeight: 1.35,
  eye: 1.62,
  crouchEye: 1.15,
  runSpeed: 6.75,      // m/s
  walkSpeed: 3.8,
  crouchSpeed: 2.9,
  groundAccel: 55,
  airAccel: 10,
  gravity: 22,
  jumpSpeed: 7.2,      // ~1.2 m jump: enough to get on a crate
  stepHeight: 0.55,    // walks up slabs (half blocks) automatically
};

const NO_INPUT = { fwd: 0, right: 0, jump: false, crouch: false, walk: false };

class Mover {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.crouch = 0;          // 0 = standing, 1 = fully crouched (smoothed)
    this.walking = false;
    this.stepOffset = 0;      // smooths the camera when stepping up
  }

  spawn(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.crouch = 0;
    this.onGround = true;
  }

  get bodyHeight() { return PLAYER.height + (PLAYER.crouchHeight - PLAYER.height) * this.crouch; }
  get eyeHeight() { return PLAYER.eye + (PLAYER.crouchEye - PLAYER.eye) * this.crouch; }
  get horizontalSpeed() { return Math.hypot(this.vel.x, this.vel.z); }

  eyePosition(out) {
    return out.set(this.pos.x, this.pos.y + this.eyeHeight + this.stepOffset, this.pos.z);
  }

  look(dx, dy, sensitivity) {
    const k = 0.0022 * sensitivity;
    this.yaw -= dx * k;
    this.pitch -= dy * k;
    const lim = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  _boxes(x, y, z, h) {
    const r = PLAYER.radius;
    return this.world.boxesIn(x - r, y, z - r, x + r, y + h, z + r);
  }

  update(dt, cmd = NO_INPUT) {
    // --- crouch ---
    let target = cmd.crouch ? 1 : 0;
    if (!cmd.crouch && this.crouch > 0 &&
        this._boxes(this.pos.x, this.pos.y, this.pos.z, PLAYER.height).length) {
      target = this.crouch; // no room to stand up
    }
    this.crouch += Math.sign(target - this.crouch) * Math.min(Math.abs(target - this.crouch), dt * 8);

    // --- wished direction ---
    let fx = cmd.right, fz = cmd.fwd;
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const wx = -sin * fz + cos * fx;
    const wz = -cos * fz - sin * fx;

    this.walking = cmd.walk;
    let speed = PLAYER.runSpeed;
    if (this.walking) speed = PLAYER.walkSpeed;
    if (this.crouch > 0.5) speed = PLAYER.crouchSpeed;
    speed *= this.speedMul || 1;                      // e.g. knife out: 1.5x faster

    // --- accelerate toward wished velocity ---
    const tx = wx * speed, tz = wz * speed;
    const moving = fx !== 0 || fz !== 0;
    if (this.onGround || moving) {
      const accel = this.onGround ? PLAYER.groundAccel : PLAYER.airAccel;
      let dx = tx - this.vel.x, dz = tz - this.vel.z;
      const dl = Math.hypot(dx, dz);
      const maxChange = accel * dt;
      if (dl > maxChange) { dx *= maxChange / dl; dz *= maxChange / dl; }
      this.vel.x += dx; this.vel.z += dz;
    }

    // --- jump + gravity ---
    if (cmd.jump && this.onGround) {
      this.vel.y = PLAYER.jumpSpeed;
      this.onGround = false;
    }
    this.vel.y -= PLAYER.gravity * dt;

    // --- move with collision, in small sub-steps ---
    const maxMove = Math.max(Math.abs(this.vel.x), Math.abs(this.vel.y), Math.abs(this.vel.z)) * dt;
    const steps = Math.max(1, Math.ceil(maxMove / 0.25));
    const sdt = dt / steps;
    const wasOnGround = this.onGround;
    for (let i = 0; i < steps; i++) {
      this._moveHorizontal('x', this.vel.x * sdt, wasOnGround);
      this._moveHorizontal('z', this.vel.z * sdt, wasOnGround);
      this._moveVertical(this.vel.y * sdt);
    }

    this.stepOffset *= Math.exp(-dt * 18);
    if (Math.abs(this.stepOffset) < 0.001) this.stepOffset = 0;
  }

  _moveHorizontal(axis, d, grounded) {
    if (d === 0) return;
    const p = this.pos, h = this.bodyHeight, r = PLAYER.radius;
    p[axis] += d;
    const boxes = this._boxes(p.x, p.y, p.z, h);
    if (!boxes.length) return;

    // step up onto slabs / small ledges
    if (grounded) {
      let top = 0;
      for (const b of boxes) top = Math.max(top, b.max[1]);
      const rise = top - p.y;
      if (rise > 0 && rise <= PLAYER.stepHeight && !this._boxes(p.x, top, p.z, h).length) {
        p.y = top;
        this.stepOffset -= rise;
        return;
      }
    }

    const ai = axis === 'x' ? 0 : 2;
    if (d > 0) {
      let m = Infinity;
      for (const b of boxes) m = Math.min(m, b.min[ai]);
      p[axis] = m - r - 1e-4;
    } else {
      let m = -Infinity;
      for (const b of boxes) m = Math.max(m, b.max[ai]);
      p[axis] = m + r + 1e-4;
    }
    this.vel[axis] = 0;
  }

  _moveVertical(d) {
    const p = this.pos, h = this.bodyHeight;
    p.y += d;
    this.onGround = false;
    const boxes = this._boxes(p.x, p.y, p.z, h);
    if (!boxes.length) return;
    if (d <= 0) {
      let m = -Infinity;
      for (const b of boxes) m = Math.max(m, b.max[1]);
      p.y = m;
      this.onGround = true;
    } else {
      let m = Infinity;
      for (const b of boxes) m = Math.min(m, b.min[1]);
      p.y = m - h - 1e-4;
    }
    this.vel.y = 0;
  }
}
