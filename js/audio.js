// Tiny synthesized, cheerful sound effects (no audio files needed).

const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null, volume = 0.7;

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = volume * 0.7;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function noise(dur, freq, vol, type = 'highpass', delay = 0) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t); src.stop(t + dur);
  }

  function tone(freq, dur, vol, type = 'sine', endFreq = freq, delay = 0) {
    const o = ctx.createOscillator();
    o.type = type;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + dur + 0.01);
  }

  const on = () => ctx !== null;

  return {
    init,
    setVolume(v) { volume = v; if (master) master.gain.value = v * 0.7; },
    context() { return ctx; },

    // ---- sassy refills ----
    snap() { if (!on()) return; noise(0.04, 3500, 0.5, 'highpass'); tone(2400, 0.03, 0.15, 'square', 1800); },
    file() { if (!on()) return; noise(0.07, 3000, 0.12, 'bandpass'); },
    blow() { if (!on()) return; noise(0.45, 600, 0.18, 'lowpass'); },
    brush() { if (!on()) return; noise(0.05, 5000, 0.06, 'highpass'); },
    pew() { if (!on()) return; tone(1200, 0.18, 0.2, 'square', 300); },
    tap() { if (!on()) return; tone(420 + Math.random() * 120, 0.04, 0.14, 'triangle', 300); },
    heart() { if (!on()) return; tone(1568, 0.12, 0.13, 'triangle'); tone(2093, 0.2, 0.13, 'triangle', 2093, 0.08); },
    sprout() { if (!on()) return; tone(300, 0.25, 0.25, 'sine', 1200); },
    swish() { if (!on()) return; noise(0.15, 2500, 0.25, 'bandpass'); },

    // ---- grenades ----
    toss(vol = 1) { if (!on() || vol < 0.04) return; noise(0.18, 1200, 0.12 * vol, 'bandpass'); },
    tick(vol = 1) { if (!on() || vol < 0.05) return; tone(1100, 0.03, 0.08 * vol, 'square', 800); },
    puff(vol = 1) { if (!on() || vol < 0.04) return; noise(0.9, 700, 0.35 * vol, 'lowpass'); },
    sparkle(vol = 1) {
      if (!on() || vol < 0.04) return;
      noise(0.15, 5000, 0.25 * vol, 'highpass');
      for (let i = 0; i < 8; i++) tone(1800 + Math.random() * 2200, 0.12, 0.08 * vol, 'triangle', 2600, i * 0.03);
    },
    boom(vol = 1) {
      if (!on() || vol < 0.04) return;
      tone(160, 0.45, 0.5 * vol, 'sine', 45);
      noise(0.5, 900, 0.35 * vol, 'lowpass');
      for (let i = 0; i < 6; i++) tone(400 + Math.random() * 600, 0.1, 0.1 * vol, 'sine', 1400, 0.05 + i * 0.04);
    },
    // a soft footstep (running only)
    step(vol = 1) { if (!on() || vol < 0.05) return; noise(0.06, 500 + Math.random() * 300, 0.18 * vol, 'lowpass'); },
    // "bloop" of a bubble being blown
    // each blaster has its own bubbly voice
    shoot(vol = 1, kind = 'bloom') {
      if (!on() || vol < 0.03) return;
      const r = Math.random();
      if (kind === 'dandelion') { tone(620 + r * 80, 0.07, 0.3 * vol, 'sine', 1500); return; }
      if (kind === 'tulip') { tone(520 + r * 90, 0.05, 0.22 * vol, 'sine', 1300); noise(0.03, 3500, 0.04 * vol); return; }
      if (kind === 'sunflower') {
        noise(0.25, 1800, 0.35 * vol, 'lowpass');
        for (let i = 0; i < 4; i++) tone(300 + Math.random() * 400, 0.12, 0.12 * vol, 'sine', 1200, i * 0.02);
        return;
      }
      if (kind === 'lily') { tone(180, 0.3, 0.45 * vol, 'triangle', 60); noise(0.2, 2500, 0.15 * vol); return; }
      const f = 380 + r * 80;
      tone(f, 0.09, 0.35 * vol, 'sine', f * 2.4);
      noise(0.05, 3000, 0.06 * vol);
    },
    bowDraw() { if (!on()) return; tone(140, 0.5, 0.06, 'sawtooth', 220); },
    bowRelease(vol = 1) { if (!on() || vol < 0.04) return; tone(900, 0.12, 0.25 * vol, 'triangle', 200); noise(0.08, 4000, 0.1 * vol); },
    thunk(vol = 1) { if (!on() || vol < 0.04) return; tone(220, 0.08, 0.3 * vol, 'square', 90); },
    buy() { if (!on()) return; tone(988, 0.08, 0.15, 'square'); tone(1319, 0.14, 0.15, 'square', 1319, 0.07); },
    swap() { if (!on()) return; tone(500, 0.04, 0.08, 'square', 700); },
    // you got hit: soft low "boop"
    ouch() { if (!on()) return; tone(260, 0.12, 0.25, 'sine', 140); },
    // soft pop on a hit
    hit() { if (!on()) return; tone(1100, 0.06, 0.2, 'sine', 300); },
    // bright two-note chime for a head hit
    headshot() { if (!on()) return; tone(1320, 0.12, 0.18, 'triangle'); tone(1760, 0.18, 0.16, 'triangle', 1760, 0.07); },
    // happy little arpeggio when someone is bubbled out
    kill() {
      if (!on()) return;
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 0.16, 'triangle', f, i * 0.06));
    },
    // sparkly crunch of bursting into pixels
    shatter(vol = 1) {
      if (!on() || vol < 0.03) return;
      noise(0.18, 1500, 0.22 * vol, 'bandpass');
      for (let i = 0; i < 5; i++) {
        const f = 900 + Math.random() * 1400;
        tone(f, 0.05, 0.08 * vol, 'square', f * 0.7, i * 0.025);
      }
    },
    // big bubble popping
    pop() { if (!on()) return; tone(700, 0.08, 0.3, 'sine', 120); noise(0.06, 2000, 0.12); },
    click() { if (!on()) return; tone(900, 0.03, 0.08, 'sine'); },

    // ---- rounds & the Boo-Boo ----
    go() { if (!on()) return; tone(660, 0.12, 0.2, 'triangle'); tone(990, 0.2, 0.2, 'triangle', 990, 0.1); },
    pickup() { if (!on()) return; tone(700, 0.08, 0.15, 'sine', 1100); },
    // digging into soil (plant / uproot start)
    dig(vol = 1) { if (!on() || vol < 0.05) return; noise(0.25, 600, 0.18 * vol, 'lowpass'); noise(0.2, 400, 0.12 * vol, 'lowpass', 0.3); },
    planted() { if (!on()) return; [523, 784, 1047].forEach((f, i) => tone(f, 0.25, 0.15, 'triangle', f, i * 0.08)); },
    // the water drip that speeds up as the tree grows
    drip(vol = 1) { if (!on() || vol < 0.04) return; tone(1500, 0.07, 0.22 * Math.max(vol, 0.25), 'sine', 600); },
    bloom() {
      if (!on()) return;
      noise(0.8, 900, 0.3, 'lowpass');
      [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.5, 0.14, 'triangle', f, i * 0.06));
    },
    uproot() { if (!on()) return; tone(300, 0.15, 0.25, 'sine', 900); noise(0.2, 2500, 0.1); },
    roundWin() { if (!on()) return; [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 0.16, 'triangle', f, i * 0.1)); },
    roundLose() { if (!on()) return; [523, 440, 349].forEach((f, i) => tone(f, 0.3, 0.14, 'triangle', f, i * 0.14)); },
    // gurgly refill
    reload() {
      if (!on()) return;
      for (let i = 0; i < 6; i++) {
        const f = 250 + Math.random() * 300;
        tone(f, 0.07, 0.12, 'sine', f * 1.8, i * 0.12 + Math.random() * 0.05);
      }
    },
  };
})();
