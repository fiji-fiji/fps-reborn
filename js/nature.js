// A little nature, for the ears only: a very soft wind that comes in gusts and birds
// chirping from the trees (in 3D, like everything else). The swaying grass, petals and
// butterflies were taken out: they cluttered the screen and made enemies harder to see.

class Nature {
  constructor(game) {
    this.game = game;
    this.time = 0;
    this.gust = 0;                                  // 0 calm .. 1 gusty
    this.birdIn = 2 + Math.random() * 3;
  }

  update(dt, listener) {
    this.time += dt;
    const t = this.time;
    // gusts come and go (a few slow waves on top of each other)
    this.gust = Math.max(0, Math.sin(t * 0.21) * 0.5 + Math.sin(t * 0.53 + 1.3) * 0.35 + Math.sin(t * 1.7) * 0.1);
    Sound.wind(this.gust);

    // birds: a chirp from somewhere up in the trees every few seconds
    this.birdIn -= dt;
    if (this.birdIn <= 0) {
      this.birdIn = 3 + Math.random() * 7;
      const a = Math.random() * Math.PI * 2, r = 14 + Math.random() * 20;
      const at = new THREE.Vector3(listener.x + Math.cos(a) * r, listener.y + 5 + Math.random() * 5, listener.z + Math.sin(a) * r);
      Sound.at(at, 'bird', 0.55);
    }
  }
}
