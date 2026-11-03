// Practice buddies: friendly targets that face you, can strafe, and burst into
// pixels when popped. They don't shoot back.

const BUDDY_RESPAWN = 3.5;   // seconds
const BUDDY_SHIRTS = [0xff8fb1, 0x8fd3ff, 0xffd36b, 0xa8e6a1, 0xc9a7ff];
let buddyCount = 0;

class Dummy {
  constructor(scene, x, y, z, strafe = null) {
    const n = buddyCount++;
    this.team = 'buddy';
    this.name = 'Buddy';
    this.home = new THREE.Vector3(x, y, z);
    this.pos = this.home.clone();
    this.strafe = strafe;        // { axis: 'x'|'z', min, max, speed }
    this.dir = 1;
    this.maxHp = 100;
    this.hp = this.maxHp;
    this.alive = true;
    this.outTime = 0;
    this.model = new CharacterModel(scene, { shirt: BUDDY_SHIRTS[n % BUDDY_SHIRTS.length], bar: true, seed: n });
  }

  hitboxes() { return characterHitboxes(this.pos); }

  // Returns true if this hit popped the buddy.
  takeHit(amount) {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.model.hitFlash();
    if (this.hp === 0) {
      this.alive = false;
      this.outTime = 0;
      return true;
    }
    return false;
  }

  // Right after being popped: returns the pixels and hides the buddy.
  burst() {
    const px = this.model.pixelize();
    this.model.setVisible(false);
    return px;
  }

  update(dt, camera) {
    if (this.alive) {
      if (this.strafe) {
        const s = this.strafe;
        this.pos[s.axis] += this.dir * s.speed * dt;
        if (this.pos[s.axis] > s.max) { this.pos[s.axis] = s.max; this.dir = -1; }
        if (this.pos[s.axis] < s.min) { this.pos[s.axis] = s.min; this.dir = 1; }
      }
    } else {
      this.outTime += dt;
      if (this.outTime > BUDDY_RESPAWN) {
        this.alive = true;
        this.hp = this.maxHp;
        this.pos.copy(this.home);
        this.model.setVisible(true);
      }
    }
    // face the camera
    const yaw = Math.atan2(-(camera.position.x - this.pos.x), -(camera.position.z - this.pos.z));
    this.model.setPose(this.pos, yaw);
    this.model.setBar(this.hp / this.maxHp);
    this.model.update(dt, camera);
  }
}
