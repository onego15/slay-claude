// Procedural audio: a small WebAudio synth for music, SFX and ambience. No sample files.
let ctx = null;
let master, musicBus, sfxBus, ambBus, reverb, reverbSend, musicFilter;
let muted = false;
const state = { track: null, nextTime: 0, step: 0, timer: null, ambience: null, volume: 0.8 };

function noiseBuffer(sec = 1) {
  const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
let NOISE = null;

function impulse(sec = 2.8, decay = 2.6) {
  const len = ctx.sampleRate * sec;
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  NOISE = noiseBuffer(2);
  master = ctx.createGain();
  master.gain.value = muted ? 0 : state.volume;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  reverb = ctx.createConvolver();
  reverb.buffer = impulse();
  const revOut = ctx.createGain(); revOut.gain.value = 0.55;
  reverb.connect(revOut).connect(master);
  reverbSend = ctx.createGain(); reverbSend.gain.value = 1;
  reverbSend.connect(reverb);
  musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 18000;
  musicBus = ctx.createGain(); musicBus.gain.value = 0.42;
  musicBus.connect(musicFilter).connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
  ambBus = ctx.createGain(); ambBus.gain.value = 0.35; ambBus.connect(master);
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.setTargetAtTime(m ? 0 : state.volume, ctx.currentTime, 0.05);
}
export const isMuted = () => muted;
export function muffleMusic(on) {
  if (!ctx) return;
  musicFilter.frequency.setTargetAtTime(on ? 900 : 18000, ctx.currentTime, 0.2);
}

// ---------------------------------------------------------------- voices
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function env(g, t, a, d, s, r, peak = 1, len = 0) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * s), t + a + d);
  if (len) {
    g.gain.setValueAtTime(Math.max(0.0001, peak * s), t + len);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len + r);
  }
}

function voice(type, freq, t, dur, { gain = 0.2, a = 0.005, d = 0.2, s = 0.3, r = 0.3, cutoff = 4000, q = 1, detune = 0, bus = musicBus, rev = 0.25, pan = 0, fenv = 0 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.Q.value = q;
  f.frequency.setValueAtTime(cutoff * (fenv ? 2.5 : 1), t);
  if (fenv) f.frequency.exponentialRampToValueAtTime(cutoff, t + fenv);
  const g = ctx.createGain();
  env(g, t, a, d, s, r, gain, dur);
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  o.connect(f).connect(g);
  if (p) { p.pan.value = pan; g.connect(p).connect(bus); } else g.connect(bus);
  if (rev) { const sg = ctx.createGain(); sg.gain.value = rev; g.connect(sg).connect(reverbSend); }
  o.start(t);
  o.stop(t + dur + r + 0.05);
  return o;
}

function noise(t, dur, { gain = 0.2, type = 'bandpass', freq = 1000, q = 1, a = 0.002, r = 0.1, bus = sfxBus, rev = 0.1, sweep = 0, pan = 0 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = NOISE;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * sweep), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + r);
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  src.connect(f).connect(g);
  if (p) { p.pan.value = pan; g.connect(p).connect(bus); } else g.connect(bus);
  if (rev) { const sg = ctx.createGain(); sg.gain.value = rev; g.connect(sg).connect(reverbSend); }
  src.start(t, Math.random());
  src.stop(t + dur + r + 0.05);
}

function pluck(m, t, dur, opts = {}) {
  const f = mtof(m);
  voice('triangle', f, t, dur, { gain: 0.16, a: 0.003, d: 0.25, s: 0.15, r: 0.4, cutoff: 3200, fenv: 0.15, ...opts });
  voice('sawtooth', f * 2, t, dur * 0.5, { gain: 0.03, a: 0.002, d: 0.1, s: 0.05, r: 0.2, cutoff: 2400, ...opts });
}
function pad(m, t, dur, opts = {}) {
  const f = mtof(m);
  for (const det of [-9, 0, 9]) voice('sawtooth', f, t, dur, { gain: 0.035, a: 0.6, d: 0.5, s: 0.8, r: 1.2, cutoff: 1100, detune: det, rev: 0.6, pan: det / 20, ...opts });
}
function bass(m, t, dur, opts = {}) {
  voice('square', mtof(m), t, dur, { gain: 0.09, a: 0.005, d: 0.15, s: 0.6, r: 0.08, cutoff: 500, fenv: 0.08, rev: 0.05, ...opts });
  voice('sine', mtof(m - 12), t, dur, { gain: 0.12, a: 0.005, d: 0.2, s: 0.7, r: 0.08, cutoff: 400, rev: 0, ...opts });
}
function bell(m, t, opts = {}) {
  const f = mtof(m);
  voice('sine', f, t, 0.05, { gain: 0.09, a: 0.002, d: 1.2, s: 0.01, r: 1.2, cutoff: 8000, rev: 0.6, ...opts });
  voice('sine', f * 2.76, t, 0.05, { gain: 0.03, a: 0.002, d: 0.5, s: 0.01, r: 0.5, cutoff: 8000, rev: 0.6, ...opts });
}
function lead(m, t, dur, opts = {}) {
  const f = mtof(m);
  voice('square', f, t, dur, { gain: 0.045, a: 0.02, d: 0.2, s: 0.6, r: 0.25, cutoff: 2200, rev: 0.35, ...opts });
  voice('triangle', f * 1.003, t, dur, { gain: 0.05, a: 0.02, d: 0.2, s: 0.7, r: 0.3, cutoff: 3000, rev: 0.35, ...opts });
}
function choir(m, t, dur, opts = {}) {
  const f = mtof(m);
  for (const det of [-6, 6]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
    const g = ctx.createGain(); env(g, t, 0.4, 0.4, 0.8, 0.9, 0.03, dur);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 800; f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1150; f2.Q.value = 6;
    o.connect(f1).connect(g); o.connect(f2).connect(g);
    g.connect(musicBus);
    const sg = ctx.createGain(); sg.gain.value = 0.8; g.connect(sg).connect(reverbSend);
    o.start(t); o.stop(t + dur + 1);
  }
}
function kick(t, g = 0.5) {
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  const gn = ctx.createGain(); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(gn).connect(musicBus); o.start(t); o.stop(t + 0.35);
}
function snare(t, g = 0.18) { noise(t, 0.12, { gain: g, freq: 1800, q: 0.7, bus: musicBus, rev: 0.2 }); voice('triangle', 190, t, 0.02, { gain: 0.08, d: 0.08, s: 0.01, r: 0.05, bus: musicBus, rev: 0 }); }
function hat(t, g = 0.05, open = false) { noise(t, open ? 0.15 : 0.03, { gain: g, type: 'highpass', freq: 7000, bus: musicBus, rev: 0.05 }); }
function taiko(t, g = 0.5) {
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.25);
  const gn = ctx.createGain(); gn.gain.setValueAtTime(g, t); gn.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  o.connect(gn).connect(musicBus); o.start(t); o.stop(t + 0.7);
  noise(t, 0.05, { gain: g * 0.3, freq: 400, q: 1, bus: musicBus, rev: 0.4 });
}

// ---------------------------------------------------------------- music
// Each track: bpm, steps per bar (16ths), bars, and a function that schedules one 16th step.
const D_MINOR = { root: 50 };
const prog = (chords) => chords; // [rootMidi, quality]
const CH = { m: [0, 3, 7, 10], M: [0, 4, 7, 11], s4: [0, 5, 7, 10], d: [0, 3, 6, 9] };

const TRACKS = {
  title: {
    bpm: 72, bars: 8,
    chords: [[50, 'm'], [46, 'M'], [41, 'M'], [48, 'M'], [50, 'm'], [46, 'M'], [43, 'm'], [45, 'M']],
    step(s, t, b, ch, dur16) {
      const notes = CH[ch[1]].map((x) => x + ch[0]);
      if (s === 0) { pad(notes[0] + 12, t, dur16 * 16); pad(notes[1] + 12, t, dur16 * 16); pad(notes[2] + 12, t, dur16 * 16); bass(notes[0] - 12, t, dur16 * 14, { gain: 0.05 }); }
      const arp = [0, 1, 2, 3, 2, 1, 2, 3];
      if (s % 2 === 0) pluck(notes[arp[(s / 2) % 8]] + 24, t, dur16 * 2, { gain: 0.09, pan: Math.sin(s) * 0.4 });
      if (s === 8 && b % 2 === 1) bell(notes[2] + 36, t);
    },
  },
  map: {
    bpm: 84, bars: 8,
    chords: [[45, 'm'], [41, 'M'], [43, 'M'], [40, 'm'], [45, 'm'], [38, 'm'], [40, 'M'], [40, 'M']],
    step(s, t, b, ch, dur16) {
      const notes = CH[ch[1]].map((x) => x + ch[0]);
      if (s === 0) { pad(notes[0] + 24, t, dur16 * 16, { gain: 0.025 }); pad(notes[2] + 12, t, dur16 * 16, { gain: 0.025 }); bass(notes[0] - 12, t, dur16 * 6, { gain: 0.06 }); }
      if (s === 8) bass(notes[0] - 12, t, dur16 * 6, { gain: 0.05 });
      if ([0, 3, 6, 8, 11, 14].includes(s)) pluck(notes[[0, 1, 2, 3, 2, 1][[0, 3, 6, 8, 11, 14].indexOf(s)]] + 24, t, dur16 * 3, { gain: 0.1 });
      const mel = [76, 0, 74, 0, 72, 0, 74, 76, 0, 0, 79, 0, 76, 0, 0, 0];
      if (b % 4 === 1 && mel[s]) lead(mel[s] - (ch[0] === 41 ? 1 : 0), t, dur16 * 1.8, { gain: 0.03 });
    },
  },
  battle: {
    bpm: 132, bars: 8,
    chords: [[50, 'm'], [50, 'm'], [46, 'M'], [48, 'M'], [50, 'm'], [50, 'm'], [45, 'M'], [45, 'M']],
    step(s, t, b, ch, dur16) {
      const n = CH[ch[1]].map((x) => x + ch[0]);
      const bl = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 10, 0, 7, 0];
      bass(n[0] - 12 + bl[s], t, dur16 * 0.9, { gain: 0.07 });
      if (s % 4 === 0) kick(t, 0.42);
      if (s === 4 || s === 12) snare(t);
      if (s % 2 === 1) hat(t, 0.035);
      if (s === 14 && b % 2) hat(t, 0.05, true);
      if (s === 0) { pad(n[1] + 12, t, dur16 * 16, { gain: 0.02 }); pad(n[2] + 12, t, dur16 * 16, { gain: 0.02 }); }
      const arp = [n[0], n[1], n[2], n[1] + 12, n[2], n[1], n[0] + 12, n[2]];
      if (s % 2 === 0) pluck(arp[(s / 2) % 8] + 12, t, dur16, { gain: 0.06, pan: (s % 4 ? -0.3 : 0.3) });
      const mel = b < 4 ? [74, 0, 0, 77, 0, 0, 76, 0, 74, 0, 72, 0, 74, 0, 0, 0] : [77, 0, 0, 79, 0, 0, 81, 0, 79, 0, 77, 0, 76, 0, 0, 0];
      if ((b % 2 === 0) && mel[s]) lead(mel[s] + (ch[0] === 46 ? -1 : ch[0] === 48 ? 0 : 0), t, dur16 * 2.5, { gain: 0.035 });
    },
  },
  elite: {
    bpm: 140, bars: 4,
    chords: [[47, 'm'], [47, 'm'], [43, 'M'], [42, 'M']],
    step(s, t, b, ch, dur16) {
      const n = CH[ch[1]].map((x) => x + ch[0]);
      bass(n[0] - 12 + (s % 4 === 3 ? 12 : 0), t, dur16 * 0.8, { gain: 0.08 });
      if (s % 4 === 0 || s === 10) kick(t, 0.5);
      if (s === 4 || s === 12) snare(t, 0.22);
      if (s % 2 === 1) hat(t, 0.04);
      if (s === 0) { choir(n[0] + 12, t, dur16 * 16); choir(n[2] + 12, t, dur16 * 16); }
      if (s % 2 === 0) pluck(n[(s / 2) % 3] + 24, t, dur16, { gain: 0.05 });
      if (s === 0 && b % 2 === 0) taiko(t, 0.45);
    },
  },
  boss: {
    bpm: 146, bars: 8,
    chords: [[50, 'm'], [50, 'm'], [53, 'M'], [51, 'M'], [50, 'm'], [48, 'M'], [46, 'M'], [45, 'M']],
    step(s, t, b, ch, dur16) {
      const n = CH[ch[1]].map((x) => x + ch[0]);
      const bl = [0, 0, 0, 12, 0, 0, 10, 0, 0, 0, 12, 0, 7, 0, 10, 0];
      bass(n[0] - 12 + bl[s], t, dur16 * 0.9, { gain: 0.085 });
      if (s % 4 === 0) kick(t, 0.5);
      if (s === 4 || s === 12) snare(t, 0.24);
      if (s === 14) snare(t, 0.12);
      hat(t, s % 2 ? 0.04 : 0.025);
      if (s === 0) { choir(n[0] + 12, t, dur16 * 16); choir(n[1] + 12, t, dur16 * 16); choir(n[2] + 12, t, dur16 * 16); }
      if (s === 0 || s === 6 || s === 10) taiko(t, 0.5);
      const mel = [74, 0, 73, 74, 0, 0, 77, 0, 76, 0, 74, 0, 72, 0, 70, 0];
      if (b >= 4 && mel[s]) lead(mel[s] + (b >= 6 ? -2 : 0), t, dur16 * 1.8, { gain: 0.04 });
      if (b < 4 && s % 2 === 0) pluck(n[(s / 2) % 4] + 24, t, dur16, { gain: 0.05 });
    },
  },
  boss2: {
    bpm: 156, bars: 4,
    chords: [[49, 'd'], [50, 'm'], [46, 'M'], [45, 'M']],
    step(s, t, b, ch, dur16) {
      const n = CH[ch[1]].map((x) => x + ch[0]);
      bass(n[0] - 12 + (s % 2 ? 12 : 0), t, dur16 * 0.7, { gain: 0.09 });
      if (s % 2 === 0) kick(t, 0.45);
      if (s === 4 || s === 12) snare(t, 0.26);
      hat(t, 0.04);
      if (s === 0) { choir(n[0] + 12, t, dur16 * 16); choir(n[2] + 12, t, dur16 * 16); choir(n[3] + 12, t, dur16 * 16); taiko(t, 0.6); }
      if (s === 8) taiko(t, 0.5);
      const mel = [86, 0, 84, 0, 82, 0, 81, 0, 82, 0, 81, 0, 79, 0, 77, 0];
      if (mel[s]) lead(mel[s] - 12, t, dur16 * 1.6, { gain: 0.04 });
    },
  },
  rest: {
    bpm: 64, bars: 4,
    chords: [[43, 'M'], [40, 'm'], [36, 'M'], [38, 'M']],
    step(s, t, b, ch, dur16) {
      const n = CH[ch[1]].map((x) => x + ch[0]);
      if (s === 0) { pad(n[0] + 24, t, dur16 * 16, { gain: 0.02 }); pad(n[2] + 24, t, dur16 * 16, { gain: 0.02 }); }
      const arp = [0, 2, 1, 3, 2, 1];
      if (s % 3 === 0 && s < 16) pluck(n[arp[(s / 3) % 6]] + 24, t, dur16 * 4, { gain: 0.08, cutoff: 1800 });
    },
  },
  shop: {
    bpm: 100, bars: 4,
    chords: [[48, 'M'], [45, 'm'], [41, 'M'], [43, 'M']],
    step(s, t, b, ch, dur16) {
      const n = CH[ch[1]].map((x) => x + ch[0]);
      if (s % 4 === 0) bass(n[0] - 12 + (s === 8 ? 7 : 0), t, dur16 * 2, { gain: 0.06 });
      if (s % 4 === 2) { pluck(n[1] + 24, t, dur16, { gain: 0.06 }); pluck(n[2] + 24, t, dur16, { gain: 0.06 }); }
      const mel = [72, 0, 76, 0, 79, 0, 76, 77, 0, 76, 74, 0, 72, 0, 0, 0];
      if (b % 2 === 0 && mel[s]) bell(mel[s] + 12, t, { gain: 0.06 });
      if (s % 2 === 1) hat(t, 0.02);
    },
  },
};

function schedule() {
  const tr = state.track && TRACKS[state.track];
  if (!tr) return;
  const dur16 = 60 / tr.bpm / 4;
  while (state.nextTime < ctx.currentTime + 0.25) {
    const bar = Math.floor(state.step / 16) % tr.bars;
    const s = state.step % 16;
    try { tr.step(s, state.nextTime, bar, tr.chords[bar], dur16); } catch (e) { /* ignore */ }
    state.nextTime += dur16;
    state.step++;
  }
}

export function playMusic(name) {
  if (!ctx) return;
  if (state.track === name) return;
  // fade out current
  const old = musicBus;
  if (old) {
    old.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
    setTimeout(() => old.disconnect(), 2500);
  }
  musicBus = ctx.createGain();
  musicBus.gain.value = 0;
  musicBus.gain.setTargetAtTime(0.42, ctx.currentTime + 0.3, 0.6);
  musicBus.connect(musicFilter);
  state.track = name;
  state.step = 0;
  state.nextTime = ctx.currentTime + 0.35;
  if (!state.timer) state.timer = setInterval(schedule, 40);
}
export function stopMusic() {
  if (!ctx) return;
  musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  state.track = null;
}

// ---------------------------------------------------------------- ambience
export function setAmbience(kind) {
  if (!ctx) return;
  if (state.ambience) { for (const n of state.ambience) { try { n.stop(); } catch (e) { /* noop */ } } }
  state.ambience = [];
  if (!kind) return;
  const mk = (freq, q, gain, type = 'lowpass', lfoRate = 0.1) => {
    const src = ctx.createBufferSource(); src.buffer = NOISE; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    const lfo = ctx.createOscillator(); lfo.frequency.value = lfoRate;
    const lg = ctx.createGain(); lg.gain.value = freq * 0.4;
    lfo.connect(lg).connect(f.frequency);
    src.connect(f).connect(g).connect(ambBus);
    src.start(); lfo.start();
    state.ambience.push(src, lfo);
  };
  if (kind === 'forest') { mk(500, 0.6, 0.35, 'lowpass', 0.07); mk(3200, 4, 0.02, 'bandpass', 0.3); }
  if (kind === 'chapel') { mk(260, 0.8, 0.4, 'lowpass', 0.05); mk(120, 2, 0.2, 'bandpass', 0.03); }
  if (kind === 'summit') { mk(700, 0.7, 0.45, 'lowpass', 0.11); mk(1600, 3, 0.05, 'bandpass', 0.2); }
  if (kind === 'fire') { mk(900, 0.5, 0.18, 'lowpass', 0.5); }
  // crackles / birds scheduled
  const iv = setInterval(() => {
    if (!ctx || state.ambience.length === 0) return;
    const t = ctx.currentTime;
    if (kind === 'forest' && Math.random() < 0.25) { const f = 2400 + Math.random() * 1600; for (let i = 0; i < 3; i++) voice('sine', f * (1 + i * 0.08), t + i * 0.09, 0.04, { gain: 0.012, a: 0.005, d: 0.05, s: 0.1, r: 0.05, bus: ambBus, rev: 0.5, cutoff: 9000 }); }
    if ((kind === 'chapel' || kind === 'fire') && Math.random() < 0.6) noise(t + Math.random() * 0.2, 0.01, { gain: 0.05, freq: 3000, q: 2, bus: ambBus, rev: 0.2 });
  }, 400);
  state.ambience.push({ stop: () => clearInterval(iv) });
}

// ---------------------------------------------------------------- SFX
export function sfx(name, opts = {}) {
  if (!ctx || muted) return;
  const t = ctx.currentTime + 0.005;
  const p = opts.pan || 0;
  switch (name) {
    case 'hover': voice('triangle', 1200, t, 0.01, { gain: 0.02, d: 0.04, s: 0.01, r: 0.03, bus: sfxBus, rev: 0, cutoff: 5000 }); break;
    case 'click': voice('square', 660, t, 0.02, { gain: 0.04, d: 0.05, s: 0.01, r: 0.04, bus: sfxBus, rev: 0.05, cutoff: 3000 }); voice('square', 990, t + 0.03, 0.02, { gain: 0.03, d: 0.05, s: 0.01, r: 0.04, bus: sfxBus, rev: 0.05, cutoff: 3000 }); break;
    case 'draw': noise(t, 0.05, { gain: 0.06, freq: 3500, q: 0.8, sweep: 1.6, rev: 0.05, pan: -0.4 }); break;
    case 'card': noise(t, 0.08, { gain: 0.1, freq: 2000, q: 0.6, sweep: 2, rev: 0.1 }); break;
    case 'shuffle': for (let i = 0; i < 6; i++) noise(t + i * 0.035, 0.03, { gain: 0.05, freq: 3000 + i * 200, q: 1, rev: 0.05 }); break;
    case 'slash':
      noise(t, 0.16, { gain: 0.3, freq: 6000, q: 1.2, sweep: 0.2, rev: 0.25, pan: p });
      voice('sawtooth', 900, t, 0.05, { gain: 0.05, d: 0.08, s: 0.01, r: 0.05, bus: sfxBus, cutoff: 4000, rev: 0.2 });
      break;
    case 'hit':
      noise(t, 0.09, { gain: 0.38, freq: 900, q: 0.8, sweep: 0.4, rev: 0.2, pan: p });
      { const o = ctx.createOscillator(); o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.15); const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g).connect(sfxBus); o.start(t); o.stop(t + 0.25); }
      break;
    case 'heavy':
      noise(t, 0.3, { gain: 0.45, freq: 500, q: 0.6, sweep: 0.3, rev: 0.5, pan: p });
      { const o = ctx.createOscillator(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.4); const g = ctx.createGain(); g.gain.setValueAtTime(0.8, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5); o.connect(g).connect(sfxBus); o.start(t); o.stop(t + 0.55); }
      break;
    case 'block': voice('square', 1400, t, 0.02, { gain: 0.05, d: 0.2, s: 0.05, r: 0.2, bus: sfxBus, cutoff: 6000, rev: 0.4 }); voice('sine', 2100, t, 0.02, { gain: 0.05, d: 0.3, s: 0.05, r: 0.3, bus: sfxBus, rev: 0.4 }); noise(t, 0.05, { gain: 0.1, freq: 5000, q: 2 }); break;
    case 'blocked': voice('square', 900, t, 0.02, { gain: 0.06, d: 0.12, s: 0.05, r: 0.1, bus: sfxBus, cutoff: 5000, rev: 0.3 }); noise(t, 0.06, { gain: 0.15, freq: 3500, q: 3 }); break;
    case 'fire': noise(t, 0.35, { gain: 0.25, type: 'lowpass', freq: 2500, q: 0.5, sweep: 0.3, rev: 0.3, pan: p }); for (let i = 0; i < 5; i++) noise(t + Math.random() * 0.3, 0.01, { gain: 0.08, freq: 4000, q: 3 }); break;
    case 'burn': noise(t, 0.25, { gain: 0.15, type: 'lowpass', freq: 1800, q: 0.5, sweep: 0.5, rev: 0.2 }); for (let i = 0; i < 4; i++) noise(t + Math.random() * 0.25, 0.01, { gain: 0.06, freq: 3500, q: 3 }); break;
    case 'light': [84, 88, 91, 96].forEach((m, i) => bell(m, t + i * 0.04, { bus: sfxBus, gain: 0.05 })); break;
    case 'radiance': bell(91 + (opts.n || 0), t, { bus: sfxBus, gain: 0.05 }); break;
    case 'bigflash': [72, 79, 84, 88, 91].forEach((m, i) => bell(m, t + i * 0.025, { bus: sfxBus, gain: 0.07 })); noise(t, 0.6, { gain: 0.2, type: 'highpass', freq: 3000, sweep: 0.5, rev: 0.6 }); break;
    case 'buff': [60, 64, 67, 72].forEach((m, i) => voice('triangle', mtof(m + 12), t + i * 0.05, 0.05, { gain: 0.06, d: 0.2, s: 0.1, r: 0.2, bus: sfxBus, rev: 0.4 })); break;
    case 'debuff': [64, 61, 58].forEach((m, i) => voice('sawtooth', mtof(m), t + i * 0.06, 0.05, { gain: 0.04, d: 0.2, s: 0.1, r: 0.2, bus: sfxBus, rev: 0.4, cutoff: 1500 })); break;
    case 'heal': [72, 76, 79, 84].forEach((m, i) => bell(m, t + i * 0.06, { bus: sfxBus, gain: 0.05 })); break;
    case 'energy': voice('sine', 660, t, 0.05, { gain: 0.07, d: 0.15, s: 0.2, r: 0.2, bus: sfxBus, rev: 0.3 }); voice('sine', 990, t + 0.06, 0.05, { gain: 0.06, d: 0.15, s: 0.2, r: 0.2, bus: sfxBus, rev: 0.3 }); break;
    case 'death': noise(t, 0.8, { gain: 0.25, type: 'lowpass', freq: 1200, sweep: 0.2, rev: 0.6 }); voice('sawtooth', 220, t, 0.5, { gain: 0.06, d: 0.6, s: 0.2, r: 0.5, bus: sfxBus, cutoff: 800, rev: 0.6, fenv: 0.5 }); break;
    case 'enemyturn': voice('sawtooth', mtof(45), t, 0.3, { gain: 0.05, a: 0.02, d: 0.3, s: 0.3, r: 0.4, bus: sfxBus, cutoff: 700, rev: 0.4 }); voice('sawtooth', mtof(46), t, 0.3, { gain: 0.04, a: 0.02, d: 0.3, s: 0.3, r: 0.4, bus: sfxBus, cutoff: 700, rev: 0.4 }); break;
    case 'yourturn': [69, 74, 78].forEach((m, i) => voice('triangle', mtof(m), t + i * 0.07, 0.08, { gain: 0.06, d: 0.2, s: 0.2, r: 0.3, bus: sfxBus, rev: 0.4 })); break;
    case 'coin': voice('square', 1318, t, 0.04, { gain: 0.04, d: 0.05, s: 0.3, r: 0.1, bus: sfxBus, cutoff: 6000, rev: 0.2 }); voice('square', 1760, t + 0.06, 0.08, { gain: 0.04, d: 0.1, s: 0.3, r: 0.2, bus: sfxBus, cutoff: 6000, rev: 0.3 }); break;
    case 'relic': [67, 71, 74, 79, 83].forEach((m, i) => bell(m + 12, t + i * 0.07, { bus: sfxBus, gain: 0.06 })); break;
    case 'potion': noise(t, 0.2, { gain: 0.1, freq: 800, q: 4, sweep: 3, rev: 0.2 }); [0, 0.08, 0.16].forEach((d) => voice('sine', 400 + Math.random() * 600, t + d, 0.03, { gain: 0.05, d: 0.05, s: 0.1, r: 0.05, bus: sfxBus, rev: 0.2 })); break;
    case 'exhaust': noise(t, 0.4, { gain: 0.15, type: 'lowpass', freq: 3000, sweep: 0.2, rev: 0.4 }); break;
    case 'summon': [57, 61, 64].forEach((m, i) => voice('sawtooth', mtof(m), t + i * 0.08, 0.2, { gain: 0.035, a: 0.05, d: 0.3, s: 0.2, r: 0.4, bus: sfxBus, cutoff: 1400, rev: 0.6 })); break;
    case 'roar': noise(t, 1.4, { gain: 0.4, type: 'lowpass', freq: 600, q: 2, sweep: 0.4, rev: 0.6 }); voice('sawtooth', 70, t, 1.2, { gain: 0.12, a: 0.1, d: 1.0, s: 0.4, r: 0.5, bus: sfxBus, cutoff: 500, rev: 0.6 }); voice('sawtooth', 73, t, 1.2, { gain: 0.1, a: 0.1, d: 1.0, s: 0.4, r: 0.5, bus: sfxBus, cutoff: 500, rev: 0.6 }); break;
    case 'charge': voice('sawtooth', 110, t, 0.8, { gain: 0.06, a: 0.4, d: 0.4, s: 0.6, r: 0.3, bus: sfxBus, cutoff: 900, rev: 0.5 }); noise(t, 0.9, { gain: 0.12, freq: 300, q: 3, sweep: 6, rev: 0.4 }); break;
    case 'step': noise(t, 0.03, { gain: 0.08, freq: 600, q: 1, rev: 0.05 }); break;
    case 'whoosh': noise(t, 0.25, { gain: 0.12, freq: 900, q: 1, sweep: 3, rev: 0.2, pan: p }); break;
    case 'victory': [[67, 0], [71, 0.12], [74, 0.24], [79, 0.36], [78, 0.62], [79, 0.74], [83, 0.86]].forEach(([m, d]) => { lead(m, t + d, 0.2, { gain: 0.05, bus: sfxBus }); }); [55, 59, 62].forEach((m) => pad(m, t + 0.86, 1.2, { bus: sfxBus, gain: 0.04 })); break;
    case 'defeat': [[62, 0], [61, 0.4], [58, 0.8], [57, 1.3]].forEach(([m, d]) => lead(m, t + d, 0.4, { gain: 0.05, bus: sfxBus })); break;
    case 'map': noise(t, 0.12, { gain: 0.07, freq: 1500, q: 0.5, sweep: 1.5, rev: 0.1 }); break;
    case 'upgrade': [72, 76, 79, 84, 88].forEach((m, i) => voice('triangle', mtof(m), t + i * 0.05, 0.05, { gain: 0.06, d: 0.2, s: 0.1, r: 0.3, bus: sfxBus, rev: 0.5 })); noise(t, 0.05, { gain: 0.2, freq: 4000, q: 3 }); break;
    case 'error': voice('square', 180, t, 0.08, { gain: 0.05, d: 0.08, s: 0.3, r: 0.05, bus: sfxBus, cutoff: 1200, rev: 0 }); break;
    case 'zap': voice('sawtooth', 1800, t, 0.03, { gain: 0.05, d: 0.1, s: 0.05, r: 0.08, bus: sfxBus, cutoff: 6000, rev: 0.3 }); noise(t, 0.08, { gain: 0.12, freq: 5000, q: 1 }); break;
    default: break;
  }
}
