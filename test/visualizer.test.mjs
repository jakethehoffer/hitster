import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BANDS, CEILING_HZ, bandLevels, topBinFor, spectralCentroid, spectralHue, bassLevel,
  makeBeatDetector, simulatedLevels, seedFrom,
} from '../js/visualizer.js';

const bins = (n = 256) => new Uint8Array(n);

test('bandLevels normalises byte magnitudes to 0..1', () => {
  const freq = bins();
  freq.fill(255);
  const levels = bandLevels(freq, 16);
  assert.equal(levels.length, 16);
  for (const v of levels) assert.equal(v, 1);
  assert.deepEqual([...bandLevels(bins(), 16)], new Array(16).fill(0));
});

test('bandLevels is log-spaced, so bass and treble each get their own bands', () => {
  const low = bins();
  low[2] = 255;
  const lowBands = bandLevels(low, BANDS);
  const loudest = (arr) => arr.indexOf(Math.max(...arr));
  assert.ok(loudest([...lowBands]) < BANDS / 4, 'a 3rd-bin spike belongs near the start of the ring');

  const high = bins();
  high[200] = 255;
  assert.ok(loudest([...bandLevels(high, BANDS)]) > (BANDS * 3) / 4, 'a bin-200 spike belongs near the end');
});

test('bandLevels covers every bin — no energy falls between bands', () => {
  for (let bin = 1; bin < 256; bin++) {
    const freq = bins();
    freq[bin] = 255;
    const levels = bandLevels(freq, BANDS);
    assert.ok(Math.max(...levels) === 1, `bin ${bin} was dropped`);
  }
});

test('topBinFor maps the ceiling onto the bin the sample rate puts it at', () => {
  assert.equal(topBinFor(48000, 1024), Math.round((CEILING_HZ / 24000) * 1024));
  assert.equal(topBinFor(44100, 1024), Math.round((CEILING_HZ / 22050) * 1024));
  // never past the end, never so low there is nothing to spread over
  assert.ok(topBinFor(8000, 1024) <= 1023);
  assert.ok(topBinFor(192000, 64) >= 8);
  assert.equal(topBinFor(0, 512), 511);
});

test('bands stop below the codec low-pass, so no arc of the ring is permanently dead', () => {
  const top = topBinFor(48000, 1024);
  // what a lossy 30-second preview looks like: music up to the low-pass, then
  // digital silence for the rest of the spectrum
  const freq = new Uint8Array(1024);
  for (let i = 1; i <= top; i++) freq[i] = 120;

  const uncapped = [...bandLevels(freq, BANDS)];
  assert.ok(uncapped.some((v) => v === 0), 'the bug: mapping to Nyquist leaves top bands dark');
  assert.equal(uncapped[BANDS - 1], 0, 'the outermost band sat above the low-pass');

  const capped = [...bandLevels(freq, BANDS, new Float32Array(BANDS), top)];
  assert.ok(capped.every((v) => v > 0), 'every band must carry music once capped');
  assert.ok(capped[BANDS - 1] > 0);
});

test('a capped band map still refuses to read past the array', () => {
  const freq = new Uint8Array(64);
  freq[63] = 255;
  assert.equal(Math.max(...bandLevels(freq, 8, new Float32Array(8), 999)), 1);
  assert.ok(Number.isFinite(bandLevels(freq, 8, new Float32Array(8), 0)[0]));
});

test('spectralCentroid and spectralHue place bass on pink and treble on cyan', () => {
  const bassy = new Float32Array(BANDS);
  bassy[1] = 1;
  const bright = new Float32Array(BANDS);
  bright[BANDS - 1] = 1;
  assert.ok(spectralCentroid(bassy) < 0.1);
  assert.ok(spectralCentroid(bright) > 0.9);
  assert.ok(spectralHue(bassy) > 300, 'bass-led songs stay in the pink accent');
  assert.ok(spectralHue(bright) < 200, 'bright songs cool towards the cyan accent');
  assert.equal(spectralHue(new Float32Array(BANDS)), 330, 'silence rests on the house colour');
});

test('bassLevel averages the bottom six bands only', () => {
  const levels = new Float32Array(BANDS);
  levels.fill(1, 0, 6);
  assert.equal(bassLevel(levels), 1);
  levels.fill(0, 0, 6);
  levels.fill(1, 6);
  assert.equal(bassLevel(levels), 0);
});

test('a beat is a jump clear of the running average, not steady loudness', () => {
  const beat = makeBeatDetector();
  let t = 0;
  let hits = 0;
  for (let i = 0; i < 40; i++, t += 20) if (beat(0.5, t)) hits += 1;
  assert.equal(hits, 0, 'a level tone must never read as a beat');
  assert.equal(beat(0.9, t), true, 'a jump above the average is a beat');
});

test('beat detection ignores quiet passages and re-triggers no faster than the gap', () => {
  const beat = makeBeatDetector({ minGapMs: 170 });
  for (let t = 0; t < 400; t += 20) beat(0.02, t);
  assert.equal(beat(0.06, 400), false, 'noise in a quiet passage is not a beat');

  const fast = makeBeatDetector({ minGapMs: 170 });
  for (let t = 0; t < 400; t += 20) fast(0.4, t);
  assert.equal(fast(1, 400), true);
  assert.equal(fast(1, 500), false, 'a second hit inside the gap is the same beat');
  assert.equal(fast(1, 600), true);
});

test('simulatedLevels is deterministic, bounded, bass-tilted and moving', () => {
  const at = (t, seed = 7) => [...simulatedLevels(t, seed, BANDS)];
  assert.deepEqual(at(1.5), at(1.5), 'same time and seed must draw the same frame');
  for (const v of at(1.5)) assert.ok(v >= 0 && v <= 1);
  const frame = at(1.5);
  const low = frame.slice(0, 8).reduce((a, b) => a + b, 0);
  const high = frame.slice(-8).reduce((a, b) => a + b, 0);
  assert.ok(low > high, 'the fallback pattern leans on the bass like real music');
  assert.notDeepEqual(at(1.5), at(1.9), 'the ring has to move over time');
  assert.notDeepEqual(at(1.5, 7), at(1.5, 400), 'two songs must not animate identically');
});

test('seedFrom is stable per song and spread across the range', () => {
  assert.equal(seedFrom('Lose Yourself|Eminem'), seedFrom('Lose Yourself|Eminem'));
  assert.notEqual(seedFrom('Lose Yourself|Eminem'), seedFrom('Stan|Eminem'));
  for (const name of ['', 'a', 'Hips Don’t Lie|Shakira']) {
    const seed = seedFrom(name);
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed < 1000);
  }
});
