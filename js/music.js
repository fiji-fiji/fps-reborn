// An original 8-bit theme, played live with the Web Audio API (no music files).
// Four channels like an old console: pulse-wave lead, triangle bass,
// a quiet square arpeggio and noise drums. 16 bars in C major, ~132 BPM, looping.

const Music = (() => {
  const BPM = 132;
  const BEAT = 60 / BPM;

  // Melody: [note, beats] per bar ('-' = rest). Bars 1–8 = theme, 9–16 = second part.
  const MELODY = [
    [['E5', .5], ['G5', .5], ['C6', 1], ['B5', .5], ['G5', .5], ['E5', 1]],
    [['D5', .5], ['E5', .5], ['G5', 1], ['E5', 1], ['-', 1]],
    [['C5', .5], ['E5', .5], ['A5', 1], ['G5', .5], ['E5', .5], ['C5', 1]],
    [['D5', .5], ['C5', .5], ['A4', 1], ['C5', 1], ['-', 1]],
    [['F5', .5], ['A5', .5], ['C6', 1], ['A5', .5], ['F5', .5], ['A5', 1]],
    [['G5', .5], ['B5', .5], ['D6', 1], ['B5', 1], ['G5', 1]],
    [['A5', .5], ['G5', .5], ['F5', .5], ['E5', .5], ['D5', 1], ['G5', 1]],
    [['C6', 1.5], ['G5', .5], ['E5', 1], ['-', 1]],
    [['A5', 1], ['A5', .5], ['G5', .5], ['F5', 1], ['C5', 1]],
    [['B5', 1], ['B5', .5], ['A5', .5], ['G5', 1], ['D5', 1]],
    [['E5', .5], ['G5', .5], ['B5', 1], ['G5', .5], ['E5', .5], ['B4', 1]],
    [['C5', .5], ['E5', .5], ['A5', 1.5], ['G5', .5], ['E5', 1]],
    [['F5', .5], ['G5', .5], ['A5', .5], ['C6', .5], ['A5', 1], ['F5', 1]],
    [['G5', .5], ['A5', .5], ['B5', .5], ['D6', .5], ['B5', 1], ['G5', 1]],
    [['E6', 1], ['D6', .5], ['C6', .5], ['B5', .5], ['A5', .5], ['G5', 1]],
    [['C6', 2], ['-', 2]],
  ];
  // one chord per bar: [root, third, fifth] as note names
  const CHORDS = {
    C: ['C', 'E', 'G'], Am: ['A', 'C', 'E'], F: ['F', 'A', 'C'], G: ['G', 'B', 'D'], Em: ['E', 'G', 'B'],
  };
  const PROGRESSION = ['C', 'C', 'Am', 'Am', 'F', 'G', 'G', 'C', 'F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'];

  const SEMI = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const freq = (name, octave) => 440 * Math.pow(2, (SEMI[name] + (octave - 4) * 12 - 9) / 12);
  const noteFreq = n => { const m = n.match(/^([A-G]#?)(\d)$/); return freq(m[1], +m[2]); };

  let ctx = null, out = null, pulse = null, noiseBuf = null;
  let volume = 0.5, enabled = true, playing = false;
  let nextBar = 0, barTime = 0, timer = null;

  function setup() {
    ctx = Sound.context();
    if (!ctx || out) return !!ctx;
    out = ctx.createGain();
    out.gain.value = enabled ? volume * 0.35 : 0;
    out.connect(ctx.destination);
    // 25% pulse wave, the classic chiptune lead sound
    const N = 32, real = new Float32Array(N), imag = new Float32Array(N);
    for (let n = 1; n < N; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * 0.25);
    pulse = ctx.createPeriodicWave(real, imag);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function note(type, f, t, dur, vol) {
    const o = ctx.createOscillator();
    if (type === 'pulse') o.setPeriodicWave(pulse); else o.type = type;
    o.frequency.setValueAtTime(f, t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol * 0.75, t + Math.min(dur * 0.4, 0.08));
    g.gain.linearRampToValueAtTime(0, t + dur * 0.95);
    o.connect(g).connect(out);
    o.start(t); o.stop(t + dur);
  }

  function drum(kind, t) {
    if (kind === 'kick') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(0.7, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      o.connect(g).connect(out);
      o.start(t); o.stop(t + 0.16);
      return;
    }
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = kind === 'hat' ? 'highpass' : 'bandpass';
    f.frequency.value = kind === 'hat' ? 7000 : 1800;
    const g = ctx.createGain(), len = kind === 'hat' ? 0.04 : 0.12;
    g.gain.setValueAtTime(kind === 'hat' ? 0.18 : 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(f).connect(g).connect(out);
    src.start(t); src.stop(t + len);
  }

  function scheduleBar(bar, t0) {
    // lead
    let t = t0;
    for (const [n, beats] of MELODY[bar]) {
      if (n !== '-') note('pulse', noteFreq(n), t, beats * BEAT * 0.92, 0.16);
      t += beats * BEAT;
    }
    const chord = CHORDS[PROGRESSION[bar]];
    // bass: bouncing root / octave in eighth notes
    for (let i = 0; i < 8; i++) {
      const oct = i % 2 ? 3 : 2;
      note('triangle', freq(chord[0], oct), t0 + i * BEAT / 2, BEAT / 2 * 0.9, 0.32);
    }
    // arpeggio: chord tones in sixteenths, quietly
    for (let i = 0; i < 16; i++) {
      const name = chord[[0, 1, 2, 1][i % 4]];
      note('square', freq(name, 4), t0 + i * BEAT / 4, BEAT / 4 * 0.7, 0.025);
    }
    // drums: kick on 1 & 3, snare on 2 & 4, hats on eighths (a little fill on the last bar)
    for (let b = 0; b < 4; b++) {
      drum(b % 2 ? 'snare' : 'kick', t0 + b * BEAT);
      drum('hat', t0 + b * BEAT + BEAT / 2);
    }
    if (bar === 15) for (let i = 0; i < 4; i++) drum('snare', t0 + 3 * BEAT + i * BEAT / 4);
  }

  // look a little ahead and schedule whole bars just before they're due
  function pump() {
    if (!playing) return;
    while (barTime < ctx.currentTime + 0.4) {
      scheduleBar(nextBar, barTime);
      barTime += 4 * BEAT;
      nextBar = (nextBar + 1) % MELODY.length;
    }
  }

  return {
    start() {
      if (playing || !setup()) return;
      playing = true;
      nextBar = 0;
      barTime = ctx.currentTime + 0.1;
      pump();
      timer = setInterval(pump, 100);
    },
    setVolume(v) { volume = v; if (out) out.gain.value = enabled ? v * 0.35 : 0; },
    toggle() { enabled = !enabled; this.setVolume(volume); return enabled; },
    get enabled() { return enabled; },
  };
})();
