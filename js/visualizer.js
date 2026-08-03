// Audio-reactive turntable visuals.
//
// The record itself stays CSS — it spins, it glows, it pulses off custom
// properties this module writes. What lives here is the canvas ring around it:
// an arcade-style segmented spectrum, shockwaves on every beat, and a hue that
// follows how bright the song sounds.
//
// Analysis runs off a real AnalyserNode. Both preview hosts (Deezer's
// cdn*-preview.dzcdn.net and Apple's audio-ssl.itunes.apple.com) answer with
// Access-Control-Allow-Origin: *, so the crossorigin="anonymous" audio element
// reaches the graph unmuted. If a future host ever refuses, the analyser goes
// flat while audio still plays — that case falls back to a synthesised pattern
// instead of leaving a dead ring on screen.

const TAU = Math.PI * 2;
export const BANDS = 64;
const SEGMENTS = 7;
// 2048 bins put ~23Hz between samples, which is the difference between seeing
// a kick drum and seeing one undifferentiated lump of bass.
const FFT_SIZE = 2048;

// ---------- analysis (pure, unit-tested) ----------

// Log-spaced band peaks, 0..1. Linear FFT bins spend most of their resolution
// on treble, where music has the least going on; log spacing is what makes the
// ring move the way the song actually sounds.
export function bandLevels(freq, bands = BANDS, out = new Float32Array(bands)) {
  const maxBin = freq.length - 1;
  let lo = 1;
  for (let b = 0; b < bands; b++) {
    // exclusive edge, so the last band still reads the top bin
    const hi = Math.min(freq.length, Math.max(lo + 1, Math.round(maxBin ** ((b + 1) / bands)) + 1));
    let peak = 0;
    for (let i = lo; i < hi; i++) if (freq[i] > peak) peak = freq[i];
    out[b] = peak / 255;
    lo = hi;
  }
  return out;
}

// Where the energy sits: 0 = all bass, 1 = all treble.
export function spectralCentroid(levels) {
  let sum = 0;
  let weighted = 0;
  for (let i = 0; i < levels.length; i++) { sum += levels[i]; weighted += levels[i] * i; }
  return sum > 0 ? weighted / sum / (levels.length - 1) : 0;
}

// Bass-led songs burn hot pink, bright ones cool to cyan — the two accents the
// rest of the app already uses, so the disc never leaves the palette.
export function spectralHue(levels) {
  return 330 - Math.min(1, spectralCentroid(levels) * 1.6) * 150;
}

export function bassLevel(levels) {
  const n = Math.min(6, levels.length);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += levels[i];
  return n ? sum / n : 0;
}

// A beat is bass that jumps clear of its own running average. The average
// adapts slowly, so a loud chorus reads as beats rather than one long hit.
export function makeBeatDetector({ threshold = 1.28, minGapMs = 170, adapt = 0.06, floor = 0.1 } = {}) {
  let avg = 0;
  let last = -Infinity;
  return function push(level, now) {
    const hit = avg > 0 && level > avg * threshold && level > floor && now - last >= minGapMs;
    avg = avg > 0 ? avg + (level - avg) * adapt : level;
    if (hit) last = now;
    return hit;
  };
}

// Fallback pattern: bass-tilted, with a kick on the beat, deterministic in
// (time, seed) so it is testable and so two songs never animate identically.
export function simulatedLevels(t, seed = 0, bands = BANDS, out = new Float32Array(bands)) {
  const bpm = 92 + (seed % 44);
  const phase = ((t * bpm) / 60) % 1;
  const kick = (1 - phase) ** 3;
  for (let b = 0; b < bands; b++) {
    const f = b / (bands - 1);
    const wobble = 0.5 + 0.5 * Math.sin(t * (1.7 + f * 4.2) + seed * 0.37 + f * 9);
    const tilt = (1 - f) ** 1.3;
    out[b] = Math.min(1, tilt * (0.3 + 0.45 * wobble) + kick * tilt * 0.6);
  }
  return out;
}

export function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 1000;
}

// ---------- audio graph ----------

let audioCtx = null;
let analyser = null;
let freqBytes = null;
let graph = 'idle'; // idle | starting | live | unavailable

// Must be called from a user gesture. A media element routed into a suspended
// AudioContext plays silence, so the source is only wired once the context is
// actually running — otherwise we leave it for the next gesture and the game
// keeps its sound.
export function primeAudioGraph(media) {
  if (graph === 'live') {
    if (audioCtx && audioCtx.state !== 'running') audioCtx.resume().catch(() => {});
    return;
  }
  if (graph !== 'idle' || !media) return;
  graph = 'starting';
  (async () => {
    let ctx = null;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) { graph = 'unavailable'; return; }
      ctx = new Ctx();
      if (ctx.state !== 'running') await ctx.resume().catch(() => {});
      if (ctx.state !== 'running') {
        await ctx.close().catch(() => {});
        graph = 'idle';
        return;
      }
      const source = ctx.createMediaElementSource(media);
      analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.62;
      source.connect(analyser);
      analyser.connect(ctx.destination);
      freqBytes = new Uint8Array(analyser.frequencyBinCount);
      audioCtx = ctx;
      graph = 'live';
    } catch {
      if (ctx) await ctx.close().catch(() => {});
      analyser = null;
      graph = 'unavailable';
    }
  })();
}

// ---------- the loop ----------

const view = {
  canvas: null,
  media: null,
  seed: 0,
  raw: new Float32Array(BANDS),
  smooth: new Float32Array(BANDS),
  rings: [],
  hue: 330,
  energy: 0,
  bass: 0,
  flash: 0,
  spin: 1.8,
  beats: 0,
  mode: 'idle', // idle | live | simulated
  forceSim: false,
  lastSound: 0,
  lastBeatAt: 0,
};

let raf = 0;
let lastFrame = 0;
let restMs = 0;
let detectBeat = makeBeatDetector();

export function attachVisualizer(canvas, media, { seed = 0 } = {}) {
  if (seed !== view.seed) {
    view.seed = seed;
    view.forceSim = false; // a new song deserves a fresh look at the analyser
    detectBeat = makeBeatDetector();
  }
  view.canvas = canvas;
  view.media = media;
  view.lastSound = now();
  if (!raf) {
    lastFrame = 0;
    restMs = 0;
    raf = requestAnimationFrame(frame);
  }
}

export function detachVisualizer() {
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  view.canvas = null;
  view.rings.length = 0;
  view.smooth.fill(0);
  view.flash = 0;
  view.energy = 0;
  view.bass = 0;
}

// State the smoke test and the browser check assert on.
export function visualizerState() {
  return {
    graph,
    mode: view.mode,
    attached: view.canvas != null,
    running: raf !== 0,
    beats: view.beats,
    energy: Number(view.energy.toFixed(4)),
    bass: Number(view.bass.toFixed(4)),
    hue: Math.round(view.hue),
  };
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function frame(t) {
  raf = requestAnimationFrame(frame);
  const dt = lastFrame ? Math.min(0.06, (t - lastFrame) / 1000) : 0.016;
  lastFrame = t;
  const media = view.media;
  const playing = !!media && !media.paused && !media.ended;

  readLevels(t, playing);
  const s = view.smooth;
  let total = 0;
  for (let i = 0; i < BANDS; i++) {
    const target = playing ? view.raw[i] : 0;
    // snap up, fall away — the rise is the beat, the fall is the room
    s[i] = target > s[i] ? target : s[i] + (target - s[i]) * Math.min(1, dt * 8);
    total += s[i];
  }
  view.energy = total / BANDS;
  view.bass = bassLevel(s);

  const targetHue = playing ? spectralHue(s) : 330;
  view.hue += (targetHue - view.hue) * Math.min(1, dt * 2.5);

  // Beats come off the raw bass: the smoothed copy exists to look good, and
  // its slow fall fills in exactly the dips a beat is measured against.
  if (playing && detectBeat(bassLevel(view.raw), t)) {
    view.beats += 1;
    view.flash = 1;
    view.rings.push({ age: 0, hue: view.hue });
    const gap = t - view.lastBeatAt;
    // Spin the record roughly in time: one turn every four beats.
    if (view.lastBeatAt && gap > 200 && gap < 1200) {
      const spin = Math.min(3, Math.max(0.9, (gap / 1000) * 4));
      if (Math.abs(spin - view.spin) / view.spin > 0.15) view.spin = spin;
    }
    view.lastBeatAt = t;
  }
  view.flash = Math.max(0, view.flash - dt * 3.4);
  for (const ring of view.rings) ring.age += dt * 1.35;
  if (view.rings.length) view.rings = view.rings.filter((r) => r.age < 1);

  paint();

  // Nothing playing and everything settled: fold the loop up. Any re-render of
  // the phase re-attaches and starts it again.
  if (!playing && view.energy < 0.005 && view.rings.length === 0 && view.flash < 0.02) {
    restMs += dt * 1000;
    if (restMs > 900) { cancelAnimationFrame(raf); raf = 0; }
  } else {
    restMs = 0;
  }
}

function readLevels(t, playing) {
  if (analyser && freqBytes && !view.forceSim) {
    analyser.getByteFrequencyData(freqBytes);
    bandLevels(freqBytes, BANDS, view.raw);
    let peak = 0;
    for (let i = 0; i < BANDS; i++) if (view.raw[i] > peak) peak = view.raw[i];
    if (peak > 0.004) view.lastSound = t;
    if (!playing || t - view.lastSound < 2500) { view.mode = 'live'; return; }
    // Audio is running but the graph is flat — analysis isn't reaching us.
    view.forceSim = true;
  }
  view.mode = 'simulated';
  simulatedLevels(view.media ? view.media.currentTime : t / 1000, view.seed, BANDS, view.raw);
}

function paint() {
  const canvas = view.canvas;
  if (!canvas) return;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
  const g = canvas.getContext('2d');
  if (!g) return;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2;
  const hue = view.hue;

  // bloom under everything
  const bloom = g.createRadialGradient(cx, cy, R * 0.16, cx, cy, R);
  bloom.addColorStop(0, `hsla(${hue}, 100%, 62%, ${(0.12 + view.energy * 0.36).toFixed(3)})`);
  bloom.addColorStop(0.6, `hsla(${hue + 45}, 100%, 58%, ${(0.04 + view.energy * 0.16).toFixed(3)})`);
  bloom.addColorStop(1, 'hsla(0, 0%, 0%, 0)');
  g.fillStyle = bloom;
  g.beginPath();
  g.arc(cx, cy, R, 0, TAU);
  g.fill();

  g.globalCompositeOperation = 'lighter';

  // beat shockwaves
  for (const ring of view.rings) {
    const rr = R * (0.56 + ring.age * 0.44);
    g.strokeStyle = `hsla(${ring.hue}, 100%, 72%, ${((1 - ring.age) * 0.5).toFixed(3)})`;
    g.lineWidth = Math.max(1, R * 0.028 * (1 - ring.age));
    g.beginPath();
    g.arc(cx, cy, rr, 0, TAU);
    g.stroke();
  }

  // Segmented spectrum ring, starting just outside the record so every lit
  // segment is visible rather than hidden behind it.
  const inner = R * 0.58;
  const outer = R * 0.99;
  const step = (outer - inner) / SEGMENTS;
  const segLen = step * 0.7;
  const barW = Math.max(1.5, ((TAU * inner) / BANDS) * 0.68);
  const round = typeof g.roundRect === 'function';
  g.save();
  g.translate(cx, cy);
  for (let b = 0; b < BANDS; b++) {
    const level = view.smooth[b];
    const lit = level * SEGMENTS;
    g.save();
    g.rotate((b / BANDS) * TAU - Math.PI / 2);
    for (let sIdx = 0; sIdx < SEGMENTS; sIdx++) {
      const on = lit > sIdx;
      const reach = sIdx / (SEGMENTS - 1);
      const alpha = on ? 0.34 + 0.6 * Math.min(1, lit - sIdx) : 0.09;
      g.fillStyle = `hsla(${hue + reach * 68}, 100%, ${on ? 56 + reach * 14 : 42}%, ${alpha.toFixed(3)})`;
      const x = inner + sIdx * step;
      g.beginPath();
      if (round) g.roundRect(x, -barW / 2, segLen, barW, barW / 2);
      else g.rect(x, -barW / 2, segLen, barW);
      g.fill();
    }
    g.restore();
  }
  g.restore();
  g.globalCompositeOperation = 'source-over';

  const stage = canvas.parentElement;
  if (stage) {
    stage.style.setProperty('--hue', String(Math.round(hue)));
    stage.style.setProperty('--glow', (view.energy * 0.7 + view.flash * 0.35).toFixed(3));
    stage.style.setProperty('--pulse', (1 + view.bass * 0.05 + view.flash * 0.045).toFixed(4));
    stage.style.setProperty('--spin', `${view.spin.toFixed(2)}s`);
  }
}
