import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMatch, pickBestMatch } from '../js/itunes.js';

const want = { title: 'Espresso', artist: 'Sabrina Carpenter', year: 2024 };

// The actual result ordering iTunes returned in production (2026-07-28),
// which caused the a cappella-style version to play.
const ESPRESSO_RESULTS = [
  { title: 'Espresso (On Vacation Version)', artist: 'Sabrina Carpenter', previewUrl: 'u1' },
  { title: 'Espresso', artist: 'Sabrina Carpenter', previewUrl: 'u2' },
  { title: 'Espresso (Piano Version)', artist: 'Linneo', previewUrl: 'u3' },
  { title: 'Espresso - Sabrina Carpenter for Babies (Lullapop)', artist: 'Thomas The Beat Engine & Lullapop Dreams', previewUrl: 'u4' },
];

test('pickBestMatch chooses the original over alternate versions ranked higher', () => {
  const best = pickBestMatch(want, ESPRESSO_RESULTS);
  assert.equal(best.title, 'Espresso');
  assert.equal(best.previewUrl, 'u2');
});

test('exact title + exact artist outscores everything else', () => {
  const exact = scoreMatch(want, ESPRESSO_RESULTS[1]);
  for (const r of [ESPRESSO_RESULTS[0], ESPRESSO_RESULTS[2], ESPRESSO_RESULTS[3]]) {
    assert.ok(exact > scoreMatch(want, r), `expected exact > ${r.title}`);
  }
});

test('karaoke and tribute results are penalized', () => {
  const karaoke = scoreMatch(want, { title: 'Espresso (Karaoke Version)', artist: 'Karaoke All-Stars' });
  const real = scoreMatch(want, { title: 'Espresso', artist: 'Sabrina Carpenter' });
  assert.ok(real > karaoke);
  assert.ok(karaoke < 6, 'karaoke should not look like a confident match');
});

test('featured-artist variants still match well', () => {
  const card = { title: 'Umbrella', artist: 'Rihanna' };
  const best = pickBestMatch(card, [
    { title: 'Umbrella (Karaoke)', artist: 'Hit Crew', previewUrl: 'k' },
    { title: 'Umbrella (feat. JAY-Z)', artist: 'Rihanna', previewUrl: 'r' },
  ]);
  assert.equal(best.previewUrl, 'r');
});

test('a requested special version is not penalized for its own marker', () => {
  const card = { title: 'Love Story (Taylor’s Version)', artist: 'Taylor Swift' };
  const s = scoreMatch(card, { title: 'Love Story (Taylor’s Version)', artist: 'Taylor Swift' });
  assert.ok(s >= 12);
});

test('pickBestMatch returns null when nothing plausible matches', () => {
  assert.equal(pickBestMatch(want, [
    { title: 'Completely Different Song', artist: 'Nobody' },
  ]), null);
  assert.equal(pickBestMatch(want, []), null);
});
