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
// Deezer credits "Crank That" to "Soulja Boy Tell'em". Rejecting that left the
// song unresolvable, so the card was retired from the pile entirely.
test('a trailing tag on the billing is still the same act', () => {
  const card = { title: 'Crank That (Soulja Boy)', artist: 'Soulja Boy' };
  const best = pickBestMatch(card, [
    { title: 'Crank That (Soulja Boy)', artist: 'Jerome', previewUrl: 'cover', rank: 207526 },
    { title: 'Crank That (Soulja Boy)', artist: "Soulja Boy Tell'em", previewUrl: 'real', rank: 761037 },
  ]);
  assert.equal(best.previewUrl, 'real');
  assert.ok(scoreMatch(card, { title: 'Crank That (Soulja Boy)', artist: "Soulja Boy Tell'em" }) >= 8,
    'and it must score well enough to settle without a fallback search');
});

// A one-word name is the start of plenty of unrelated acts, so the trailing-tag
// allowance above must not reach "Queen" -> "Queen Esther".
test('a one-word artist does not match every act that starts with it', () => {
  const card = { title: 'Bohemian Rhapsody', artist: 'Queen' };
  assert.equal(pickBestMatch(card, [
    { title: 'Bohemian Rhapsody', artist: 'Queen Esther', previewUrl: 'other-act', rank: 101470 },
  ]), null);
  // ...while the real recording, even a lower-ranked master, still wins
  const best = pickBestMatch(card, [
    { title: 'Bohemian Rhapsody', artist: 'Queen Esther', previewUrl: 'other-act', rank: 101470 },
    { title: 'Bohemian Rhapsody', artist: 'Queen', previewUrl: 'real', rank: 36699 },
  ]);
  assert.equal(best.previewUrl, 'real');
});

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
    ['Kesha', 'Ke$ha'],
    ['Pink', 'P!nk'],
    ['Beyoncé', 'Beyonce'],
  ];
  for (const [want, got] of pairs) {
    const card = { title: 'Song', artist: want };
    assert.ok(
      scoreMatch(card, { title: 'Song', artist: got }) >= 10,
      `expected "${got}" to match "${want}"`,
    );
  }
});

// Deezer lists a 153-second "HELLO" on an album called "HELLO" credited to
// "Adele" alongside the real 25 single. It is flagged explicit, and the
// explicit bonus alone was enough to make it win.
test('popularity outranks the explicit flag between same-titled recordings', () => {
  const card = { title: 'Hello', artist: 'Adele' };
  const best = pickBestMatch(card, [
    { title: 'Hello', artist: 'Adele', previewUrl: 'real', rank: 832702 },
    { title: 'HELLO', artist: 'Adele', previewUrl: 'impostor', rank: 100000, explicit: true },
  ]);
  assert.equal(best.previewUrl, 'real');
});

// Deezer has no "Physical" by Olivia Newton-John, so the lookup fell to
// iTunes — where a title that matched nothing still scored on the artist
// alone and beat the real song, which was carrying a remaster label.
test('a different song by the right artist is never a match', () => {
  const card = { title: 'Physical', artist: 'Olivia Newton-John' };
  const best = pickBestMatch(card, [
    { title: 'Hopelessly Devoted to You', artist: 'Olivia Newton-John', previewUrl: 'wrong-song' },
    { title: 'Physical (Remastered 2021)', artist: 'Olivia Newton-John', previewUrl: 'right-song' },
  ]);
  assert.equal(best.previewUrl, 'right-song');
  assert.equal(pickBestMatch(card, [
    { title: 'Magic', artist: 'Olivia Newton-John', previewUrl: 'nope' },
  ]), null, 'with nothing on-title there is no match at all');
});

test('punctuation differences are the same title', () => {
  const card = { title: 'Sugar, Sugar', artist: 'The Archies' };
  const best = pickBestMatch(card, [
    { title: 'Sugar, Sugar', artist: 'The Archies', previewUrl: 'reissue', rank: 102108 },
    { title: 'Sugar Sugar', artist: 'The Archies', previewUrl: 'hit', rank: 700982 },
  ]);
  assert.equal(best.previewUrl, 'hit', 'a comma must not hide the popular master');
});

// A 104-second bootleg titled "California Love 加洲之愛" read as an exact
// title match once the non-Latin half was stripped away.
test('a foreign-script suffix does not make a different cut an exact match', () => {
  const card = { title: 'California Love', artist: '2Pac' };
  const best = pickBestMatch(card, [
    { title: 'California Love 加洲之愛', artist: '2Pac', previewUrl: 'bootleg', rank: 22419 },
    { title: 'California Love (Original Version)', artist: '2Pac', previewUrl: 'orig', rank: 863751 },
  ]);
  assert.equal(best.previewUrl, 'orig');
});

// "(강남스타일)" is the title in Korean, not a description of a different cut.
test('a foreign-script qualifier is the title, not an alternate cut', () => {
  const card = { title: 'Gangnam Style', artist: 'PSY' };
  const best = pickBestMatch(card, [
    { title: 'Gangnam Style / 2 Legit 2 Quit Mashup', artist: 'Psy', previewUrl: 'mashup', rank: 112953 },
    { title: 'Gangnam Style (강남스타일)', artist: 'Psy', previewUrl: 'orig', rank: 799011 },
  ]);
  assert.equal(best.previewUrl, 'orig');
});

// The deck writes the parenthetical without a comma; Deezer's copy has one.
test('punctuation inside a qualifier does not make it an alien cut', () => {
  const card = { title: "I Can't Help Myself (Sugar Pie Honey Bunch)", artist: 'Four Tops' };
  const best = pickBestMatch(card, [
    { title: "I Can't Help Myself (Sugar Pie Honey Bunch)", artist: 'Four Tops', previewUrl: 'concert-cut', rank: 187825 },
    { title: "I Can't Help Myself (Sugar Pie, Honey Bunch)", artist: 'Four Tops', previewUrl: 'the-single', rank: 603053 },
  ]);
  assert.equal(best.previewUrl, 'the-single');
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
