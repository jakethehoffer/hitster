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

test('explicit original beats the clean edit when otherwise identical', () => {
  const card = { title: 'HUMBLE.', artist: 'Kendrick Lamar' };
  const best = pickBestMatch(card, [
    { title: 'HUMBLE.', artist: 'Kendrick Lamar', previewUrl: 'clean' },
    { title: 'HUMBLE.', artist: 'Kendrick Lamar', previewUrl: 'explicit', explicit: true },
  ]);
  assert.equal(best.previewUrl, 'explicit');
});

test('explicit bonus does not rescue a karaoke or wrong-version result', () => {
  const card = { title: 'HUMBLE.', artist: 'Kendrick Lamar' };
  const best = pickBestMatch(card, [
    { title: 'HUMBLE. (Karaoke Version)', artist: 'Party Crew', previewUrl: 'k', explicit: true },
    { title: 'HUMBLE.', artist: 'Kendrick Lamar', previewUrl: 'real' },
  ]);
  assert.equal(best.previewUrl, 'real');
});

// Live Deezer result sets for the pop-deck songs that played the wrong cut
// (captured 2026-08-01). Every one of these picked a remix before the fix.
test('an unrequested qualifier loses to the plain original by the same artist', () => {
  const card = { title: 'Hollaback Girl', artist: 'Gwen Stefani' };
  const best = pickBestMatch(card, [
    { title: 'Hollaback Girl (Dancehollaback Remix by Tony Kanal)', artist: 'Gwen Stefani', previewUrl: 'remix', explicit: true },
    { title: 'Hollaback Girl (Hollatronix Remix by Diplo)', artist: 'Gwen Stefani', previewUrl: 'diplo', explicit: true },
    { title: 'Hollaback Girl', artist: 'Gwen Stefani', previewUrl: 'orig', explicit: true },
    { title: 'Hollaback Girl', artist: 'Gwen Stefani Piano Tribute', previewUrl: 'piano' },
  ]);
  assert.equal(best.previewUrl, 'orig');
});

test('a featured credit is not an alternate cut, but a second qualifier is', () => {
  const card = { title: 'SexyBack', artist: 'Justin Timberlake' };
  const best = pickBestMatch(card, [
    { title: 'SexyBack (feat. Timbaland)', artist: 'Justin Timberlake', previewUrl: 'orig' },
    { title: 'SexyBack (feat. Timbaland) (Tom Novy Ibiza Dub)', artist: 'Justin Timberlake', previewUrl: 'dub', explicit: true },
    { title: 'SexyBack (feat. Timbaland) (Armand’s Mix)', artist: 'Justin Timberlake', previewUrl: 'mix' },
  ]);
  assert.equal(best.previewUrl, 'orig');
});

test('a remix by the real artist still beats a same-titled cover by someone else', () => {
  const card = { title: 'I Gotta Feeling', artist: 'The Black Eyed Peas' };
  const best = pickBestMatch(card, [
    { title: 'I Gotta Feeling', artist: 'Sitar Inspirations', previewUrl: 'sitar' },
    { title: 'I Gotta Feeling (Laidback Luke Remix)', artist: 'The Black Eyed Peas', previewUrl: 'remix' },
  ]);
  assert.equal(best.previewUrl, 'remix');
});

test('the album original outscores the radio edit of the same song', () => {
  const card = { title: 'I Gotta Feeling', artist: 'The Black Eyed Peas' };
  const best = pickBestMatch(card, [
    { title: 'I Gotta Feeling (Edit)', artist: 'The Black Eyed Peas', previewUrl: 'edit' },
    { title: 'I Gotta Feeling', artist: 'The Black Eyed Peas', previewUrl: 'orig' },
  ]);
  assert.equal(best.previewUrl, 'orig');
});

// "Stayin' Alive" and "Alive" contain the letters of the marker word "live".
// Substring matching read them as live recordings and silently disabled the
// alternate-cut penalty for every result of those cards.
test('marker words match whole words, not substrings', () => {
  const penaltyFor = (card, suffix) =>
    scoreMatch(card, { title: card.title, artist: card.artist })
    - scoreMatch(card, { title: `${card.title} ${suffix}`, artist: card.artist });
  const alive = penaltyFor({ title: "Stayin' Alive", artist: 'Bee Gees' }, '(Live at Wembley)');
  const control = penaltyFor({ title: 'Espresso', artist: 'Sabrina Carpenter' }, '(Live at Wembley)');
  assert.equal(alive, control, '"Alive" must not suppress the live-recording penalty');
  assert.ok(alive > 0);
});

test('an "(Album Version)" label is the original, not an alternate cut', () => {
  const card = { title: 'We Found Love', artist: 'Rihanna' };
  const best = pickBestMatch(card, [
    { title: 'We Found Love (Album Version)', artist: 'Rihanna', previewUrl: 'orig', rank: 953231 },
    { title: 'We Found Love (Chuckie Dub)', artist: 'Rihanna', previewUrl: 'dub', rank: 251082 },
    { title: 'We Found Love (Cahill Edit)', artist: 'Rihanna', previewUrl: 'edit', rank: 131376 },
  ]);
  assert.equal(best.previewUrl, 'orig');
});

// "Tonight i'm Taylor Swift" is a cover band, and substring containment gave
// it the same credit as a featured-artist billing.
test('an artist name that merely contains the real one is a different act', () => {
  const card = { title: 'Shake It Off', artist: 'Taylor Swift' };
  assert.equal(pickBestMatch(card, [
    { title: 'Shake It Off', artist: "Tonight i'm Taylor Swift", previewUrl: 'coverband' },
  ]), null);
});

test('billing variants of the same act still match', () => {
  const pairs = [
    ['The Jackson 5', 'Jackson 5'],
    ['The Black Eyed Peas', 'Black Eyed Peas'],
    ['Simon and Garfunkel', 'Simon & Garfunkel'],
    ['The Kid LAROI & Justin Bieber', 'The Kid LAROI'],
    ['Camila Cabello', 'Camila Cabello, Young Thug'],
    ['Ms. Lauryn Hill', 'Lauryn Hill'],
    ['Dr. Dre', 'Dr Dre'],
  ];
  for (const [want, got] of pairs) {
    const card = { title: 'Song', artist: want };
    assert.ok(
      scoreMatch(card, { title: 'Song', artist: got }) >= 10,
      `expected "${got}" to match "${want}"`,
    );
  }
});

test('equal scores break toward the more popular recording', () => {
  const card = { title: 'Dancing Queen', artist: 'ABBA' };
  const best = pickBestMatch(card, [
    { title: 'Dancing Queen', artist: 'ABBA', previewUrl: 'reissue', rank: 12000 },
    { title: 'Dancing Queen', artist: 'ABBA', previewUrl: 'hit', rank: 900000 },
  ]);
  assert.equal(best.previewUrl, 'hit');
});

test('pickBestMatch returns null when nothing plausible matches', () => {
  assert.equal(pickBestMatch(want, [
    { title: 'Completely Different Song', artist: 'Nobody' },
  ]), null);
  assert.equal(pickBestMatch(want, []), null);
});
