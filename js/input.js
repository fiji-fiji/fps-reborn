// Keyboard + mouse state. Uses physical key positions (e.code), so WASD also
// works as ZQSD on an AZERTY keyboard.

const Input = {
  keys: new Set(),       // keys currently held
  pressed: new Set(),    // keys pressed this frame
  mouseDX: 0, mouseDY: 0,
  mouseDown: false,
  locked: false,

  init(canvas) {
    window.addEventListener('keydown', e => {
      if (!this.locked) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'Tab' || e.code.startsWith('Control')) e.preventDefault();
    });
    window.addEventListener('keyup', e => this.keys.delete(e.code));

    document.addEventListener('mousemove', e => {
      if (!this.locked) return;
      // ignore the occasional giant jump some browsers report
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('mousedown', e => {
      if (!this.locked) return;
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.rightDown = true;
    });
    document.addEventListener('mouseup', e => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    document.addEventListener('contextmenu', e => e.preventDefault()); // Ctrl+click on Mac

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) { this.keys.clear(); this.mouseDown = false; this.rightDown = false; }
    });
  },

  held(code) { return this.keys.has(code); },
  justPressed(code) { return this.pressed.has(code); },

  endFrame() {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  },
};
