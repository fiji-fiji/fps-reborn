// Tiny synthesized, cheerful sound effects (no audio files needed).
//
// Sounds in the world are 3D: Sound.at(pos, 'name', ...args) plays a sound from that spot.
// It's placed in your ears with HRTF (the browser's model of how real ears hear direction,
// including above/below and in front/behind), its loudness falls off with distance, and it's
// muffled when there's a wall between you and it. Sound is information: listen!

const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null, volume = 0.7, windNodes = null;
  let out = null;                 // where tone()/noise() send their sound right now (null = straight to your ears)
  let occluder = null;            // (pos) => true if a wall is between you and pos

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
    src.connect(f).connect(g).connect(out || master);
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
    o.connect(g).connect(out || master);
    o.start(t); o.stop(t + dur + 0.01);
  }

  const on = () => ctx !== null;

  // A 3D voice at `pos`: (muffle if behind a wall) -> HRTF panner -> your ears.
  // Loudness by distance is done by the callers (game._volumeAt), the panner only places it.
  function spatial(pos) {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'linear';
    p.rolloffFactor = 0;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else p.setPosition(pos.x, pos.y, pos.z);
    p.connect(master);
    let input = p;
    if (occluder && occluder(pos)) {                     // through a wall: dull and quieter
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 650;
      const g = ctx.createGain(); g.gain.value = 0.55;
      f.connect(g).connect(p);
      input = f;
    }
    setTimeout(() => { try { p.disconnect(); } catch (e) {} }, 2500);   // let it be cleaned up
    return { input, panner: p };
  }

  // which kind of ground a block is, for footsteps
  function surfaceOf(name) {
    if (!name) return 'stone';
    if (/water/.test(name)) return 'water';
    if (/grass|dirt|sand(?!stone)|clay/.test(name)) return 'soft';
    if (/plank|crate|log|wood/.test(name)) return 'wood';
    if (/zinc|metal/.test(name)) return 'metal';
    return 'stone';
  }

  return {
    init,
    setVolume(v) { volume = v; if (master) master.gain.value = v * 0.7; },
    context() { return ctx; },

    // ---- 3D ----
    // play Sound[name](...args) from world position `pos`
    at(pos, name, ...args) {
      if (!on() || !pos || !this[name]) return;
      out = spatial(pos).input;
      try { this[name](...args); } finally { out = null; }
    },
    // your ears: call every frame with the camera
    listen(camera) {
      if (!on()) return;
      const L = ctx.listener, p = camera.position;
      const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const u = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      if (L.positionX) {
        const t = ctx.currentTime;
        L.positionX.setValueAtTime(p.x, t); L.positionY.setValueAtTime(p.y, t); L.positionZ.setValueAtTime(p.z, t);
        L.forwardX.setValueAtTime(f.x, t); L.forwardY.setValueAtTime(f.y, t); L.forwardZ.setValueAtTime(f.z, t);
        L.upX.setValueAtTime(u.x, t); L.upY.setValueAtTime(u.y, t); L.upZ.setValueAtTime(u.z, t);
      } else {
        L.setPosition(p.x, p.y, p.z);
        L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z);
      }
    },
    setOccluder(fn) { occluder = fn; },

    // ---- nature ----
    // very subtle wind (+ a faint rustle in the gusts). gust 0..1. Almost a noise floor, so steps stay clear.
    wind(gust) {
      if (!on()) return;
      const t = ctx.currentTime;
      if (!windNodes) {
        const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
        const d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < d.length; i++) { last = last * 0.98 + (Math.random() * 2 - 1) * 0.2; d[i] = last; }   // soft (brownish) noise
        const mk = () => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; return s; };
        const src = mk(), src2 = mk();
        const low = ctx.createBiquadFilter(); low.type = 'bandpass'; low.frequency.value = 420; low.Q.value = 0.5;
        const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 2800;
        const g1 = ctx.createGain(), g2 = ctx.createGain();
        g1.gain.value = 0; g2.gain.value = 0;
        src.connect(low).connect(g1).connect(master);
        src2.connect(high).connect(g2).connect(master);
        src.start(); src2.start(t + 1.3);
        windNodes = { low, g1, g2 };
      }
      // barely there: a soft noise floor that breathes with the gusts
      windNodes.g1.gain.setTargetAtTime(0.007 + gust * 0.009, t, 0.8);
      windNodes.low.frequency.setTargetAtTime(260 + gust * 140, t, 0.8);
      windNodes.g2.gain.setTargetAtTime(gust * gust * 0.004, t, 0.6);    // a faint leaf rustle in the gusts
    },
    // a little bird: a few quick chirps
    bird(vol = 1) {
      if (!on()) return;
      const n = 2 + Math.floor(Math.random() * 4), base = 2600 + Math.random() * 1500, up = Math.random() < 0.5;
      for (let i = 0; i < n; i++) {
        const f = base * (1 + (Math.random() - 0.5) * 0.15);
        tone(f, 0.06 + Math.random() * 0.04, 0.05 * vol, 'sine', up ? f * 1.4 : f * 0.7, i * (0.09 + Math.random() * 0.05));
      }
    },
    surfaceOf,

    // ---- sassy refills ----
    snap() { if (!on()) return; noise(0.04, 3500, 0.5, 'highpass'); tone(2400, 0.03, 0.15, 'square', 1800); },
    file() { if (!on()) return; noise(0.07, 3000, 0.12, 'bandpass'); },
    brush() { if (!on()) return; noise(0.05, 5000, 0.06, 'highpass'); },
    // a paw on the glass: a little glassy clink
    clink(v = 1) { if (!on()) return; tone(1760, 0.09, 0.16 * v, 'triangle', 1700); tone(2637, 0.16, 0.08 * v, 'sine', 2637, 0.01); },
    tap() { if (!on()) return; tone(420 + Math.random() * 120, 0.04, 0.14, 'triangle', 300); },
    heart() { if (!on()) return; tone(1568, 0.12, 0.13, 'triangle'); tone(2093, 0.2, 0.13, 'triangle', 2093, 0.08); },
    // sunglasses flip: a bright "ting"
    ting() { if (!on()) return; tone(2637, 0.25, 0.1, 'triangle'); tone(3520, 0.3, 0.08, 'triangle', 3520, 0.05); },
    // ---- clumsy refills ----
    knock(v = 1) { if (!on()) return; tone(190, 0.07, 0.35 * v, 'triangle', 120); noise(0.03, 900, 0.25 * v, 'lowpass'); },
    boop(p = 1) { if (!on()) return; tone(500 * p, 0.12, 0.2, 'sine', 900 * p); },
    oops() { if (!on()) return; tone(900, 0.12, 0.12, 'triangle', 600); tone(700, 0.15, 0.1, 'triangle', 450, 0.1); },
    corkPop() { if (!on()) return; tone(900, 0.06, 0.3, 'sine', 300); noise(0.05, 2500, 0.25, 'highpass'); },
    spit() { if (!on()) return; noise(0.07, 900, 0.3, 'lowpass'); tone(260, 0.09, 0.15, 'sine', 110); },   // ptoo!
    plop() { if (!on()) return; tone(300, 0.1, 0.25, 'sine', 900); noise(0.08, 1200, 0.08, 'lowpass', 0.03); },
    // ---- planting shows ----
    stab(vol = 1) { if (!on() || vol < 0.05) return; tone(160, 0.08, 0.3 * vol, 'triangle', 90); noise(0.06, 800, 0.2 * vol, 'lowpass'); },
    chop(vol = 1) { if (!on() || vol < 0.05) return; tone(120, 0.25, 0.45 * vol, 'sine', 45); noise(0.25, 700, 0.35 * vol, 'lowpass'); },
    drill(vol = 1) { if (!on() || vol < 0.05) return; tone(180, 0.4, 0.07 * vol, 'sawtooth', 240); tone(360, 0.4, 0.04 * vol, 'square', 420); },
    pour(vol = 1) { if (!on() || vol < 0.05) return; noise(0.05, 1800 + Math.random() * 800, 0.05 * vol, 'bandpass'); },
    sip(vol = 1) { if (!on() || vol < 0.05) return; noise(0.35, 1200, 0.18 * vol, 'bandpass'); tone(500, 0.3, 0.05 * vol, 'sine', 900); },
    spritz(vol = 1) { if (!on() || vol < 0.05) return; noise(0.18, 6000, 0.25 * vol, 'highpass'); },
    // the chainsaw's (silly) voice: a little fart. 'long' = a squeaky one that wobbles up
    // and down in pitch; 'short' = a quick pfft. Small on purpose, next to that big saw.
    fart(vol = 1, kind = 'short') {
      if (!on() || vol < 0.02) return;
      const t = ctx.currentTime, long = kind === 'long';
      const dur = long ? 1.15 : 0.12 + Math.random() * 0.12;
      const o = ctx.createOscillator(), lfo = ctx.createOscillator(), lfoG = ctx.createGain();
      const f = ctx.createBiquadFilter(), g = ctx.createGain(), flutter = ctx.createGain();
      o.type = 'sawtooth';
      const base = long ? 300 : 210 + Math.random() * 90;
      o.frequency.setValueAtTime(base, t);
      if (long) {
        o.frequency.linearRampToValueAtTime(470, t + 0.28);
        o.frequency.linearRampToValueAtTime(230, t + 0.62);
        o.frequency.linearRampToValueAtTime(390, t + 0.85);
        o.frequency.exponentialRampToValueAtTime(140, t + dur);
      } else o.frequency.exponentialRampToValueAtTime(base * 0.65, t + dur);
      lfo.type = 'square'; lfo.frequency.value = long ? 26 : 32;       // the flappy flutter
      lfoG.gain.value = 0.5;
      flutter.gain.value = 0.5;
      lfo.connect(lfoG).connect(flutter.gain);
      f.type = 'lowpass'; f.frequency.value = long ? 1500 : 1100; f.Q.value = 4;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16 * vol, t + 0.02);
      g.gain.setValueAtTime(0.16 * vol, t + dur * 0.75);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(flutter).connect(f).connect(g).connect(out || master);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.02); lfo.stop(t + dur + 0.02);
      noise(dur * 0.8, 500, 0.04 * vol, 'bandpass');                   // a breath of air
    },
    timber(vol = 1) { if (!on()) return; tone(220, 0.6, 0.2 * vol, 'triangle', 90); noise(0.5, 400, 0.4 * vol, 'lowpass', 0.45); tone(60, 0.4, 0.45 * vol, 'sine', 30, 0.45); },
    sell() { if (!on()) return; tone(1400, 0.08, 0.15, 'triangle', 700); tone(900, 0.12, 0.12, 'triangle', 500, 0.07); },
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
    // a footstep (running only). Each ground sounds different: soft (grass/sand), stone, wood,
    // metal, water — so you can tell where someone is from their steps.
    step(vol = 1, surface = 'stone') {
      if (!on() || vol < 0.03) return;
      const r = Math.random();
      if (surface === 'soft') { noise(0.09, 380 + r * 160, 0.3 * vol, 'lowpass'); noise(0.05, 1800, 0.05 * vol, 'bandpass', 0.02); return; }
      if (surface === 'wood') { tone(170 + r * 40, 0.07, 0.3 * vol, 'triangle', 110); noise(0.04, 1200, 0.12 * vol, 'bandpass'); return; }
      if (surface === 'metal') { tone(620 + r * 80, 0.12, 0.12 * vol, 'square', 480); noise(0.05, 2600, 0.12 * vol, 'bandpass'); return; }
      if (surface === 'water') { noise(0.16, 900 + r * 400, 0.28 * vol, 'bandpass'); tone(420, 0.08, 0.06 * vol, 'sine', 900, 0.03); return; }
      noise(0.035, 2400 + r * 900, 0.2 * vol, 'bandpass');            // stone: heel click…
      noise(0.07, 650 + r * 250, 0.22 * vol, 'lowpass', 0.025);       // …and the scuff
    },
    // landing after a jump
    land(vol = 1, surface = 'stone') {
      if (!on() || vol < 0.03) return;
      tone(110, 0.12, 0.3 * vol, 'sine', 60);
      this.step(vol * 1.2, surface);
    },
    // someone else refilling their blaster (gurgle), quieter than yours: you hear it up close
    reloadFar(vol = 1) {
      if (!on() || vol < 0.05) return;
      for (let i = 0; i < 4; i++) { const f = 250 + Math.random() * 300; tone(f, 0.07, 0.1 * vol, 'sine', f * 1.8, i * 0.14); }
    },
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
      if (kind === 'hushdaisy' || kind === 'hushbloom') {           // silenced: just a soft "pff"
        noise(0.05, 1100, (kind === 'hushbloom' ? 0.14 : 0.11) * vol, 'lowpass'); tone(320 + r * 40, 0.04, 0.07 * vol, 'sine', 200);
        return;
      }
      if (kind === 'buzzy') { tone(760 + r * 120, 0.04, 0.16 * vol, 'square', 900); noise(0.02, 4000, 0.03 * vol); return; }
      if (kind === 'cactus') {                                       // a big pop with a little twang
        tone(150, 0.25, 0.5 * vol, 'triangle', 60); noise(0.18, 1500, 0.3 * vol, 'lowpass'); tone(1200, 0.15, 0.06 * vol, 'sine', 800);
        return;
      }
      if (kind === 'pansy') {
        noise(0.15, 2000, 0.25 * vol, 'lowpass');
        for (let i = 0; i < 3; i++) tone(350 + Math.random() * 300, 0.1, 0.1 * vol, 'sine', 1100, i * 0.02);
        return;
      }
      if (kind === 'bluebell') { tone(260, 0.22, 0.35 * vol, 'triangle', 90); tone(1600, 0.25, 0.08 * vol, 'sine', 1500); return; }
      const f = 380 + r * 80;
      tone(f, 0.09, 0.35 * vol, 'sine', f * 2.4);
      noise(0.05, 3000, 0.06 * vol);
    },
    bowDraw() { if (!on()) return; tone(140, 0.5, 0.06, 'sawtooth', 220); },
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
    // DOUBLE POP! and up: a little fanfare that climbs a note with every pop in the chain
    multiPop(n) {
      if (!on()) return;
      const notes = [659, 784, 988, 1175, 1319], k = Math.min(n, 5);
      for (let i = 0; i < k; i++) tone(notes[i], 0.14, 0.14, 'triangle', notes[i], i * 0.07);
      tone(notes[k - 1] * 2, k === 5 ? 0.6 : 0.3, 0.1, 'sine', notes[k - 1] * 2, k * 0.07);
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
