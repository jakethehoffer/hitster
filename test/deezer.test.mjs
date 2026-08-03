import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deezerTrackToCard, looksLikeCompilation } from '../js/deezer.js';
import { pickBestMatch, looksLikeAltVersion } from '../js/itunes.js';

test('deezerTrackToCard maps Deezer fields to the Card shape', () => {
  const card = deezerTrackToCard({
    title: 'HUMBLE.',
    artist: { name: 'Kendrick Lamar' },
    preview: 'https://cdn-preview.dzcdn.net/x.mp3',
    album: { cover_medium: 'https://cdn-images.dzcdn.net/cover.jpg' },
    explicit_lyrics: true,
  });
  assert.equal(card.title, 'HUMBLE.');
  assert.equal(card.artist, 'Kendrick Lamar');
  assert.equal(card.previewUrl, 'https://cdn-preview.dzcdn.net/x.mp3');
  assert.equal(card.artworkUrl, 'https://cdn-images.dzcdn.net/cover.jpg');
  assert.equal(card.albumTitle, undefined);
  assert.equal(card.explicit, true);
});

test('deezerTrackToCard keeps album metadata used to reject hidden live cuts', () => {
  const card = deezerTrackToCard({
    title: "Hips Don't Lie", artist: { name: 'Shakira' }, preview: 'p',
    album: { title: 'Anniversary | Oral Fixation LIVE' },
  });
  assert.equal(card.albumTitle, 'Anniversary | Oral Fixation LIVE');
});

test('deezerTrackToCard leaves explicit undefined for clean tracks', () => {
  const card = deezerTrackToCard({
    title: 'Espresso', artist: { name: 'Sabrina Carpenter' }, preview: 'p', explicit_lyrics: false,
  });
  assert.equal(card.explicit, undefined);
  assert.equal(card.artworkUrl, undefined);
});

test('deezerTrackToCard carries the popularity rank for tiebreaks', () => {
  const card = deezerTrackToCard({
    title: 'Hollaback Girl', artist: { name: 'Gwen Stefani' }, preview: 'p', rank: 529256,
  });
  assert.equal(card.rank, 529256);
});

test('refill filters reject alternate cuts and compilation albums', () => {
  assert.equal(looksLikeAltVersion('HUMBLE. (Live at Coachella)'), true);
  assert.equal(looksLikeAltVersion('Espresso (Sped Up)'), true);
  assert.equal(looksLikeAltVersion('Espresso'), false);
  assert.equal(looksLikeAltVersion('Alive'), false, '"Alive" is not a live recording');
  assert.equal(looksLikeAltVersion("Stayin' Alive"), false);
  assert.equal(looksLikeCompilation('Greatest Hits II'), true);
  assert.equal(looksLikeCompilation('The Essential Michael Jackson'), true);
  assert.equal(looksLikeCompilation('A Night at the Opera (2011 Remaster)'), true);
  assert.equal(looksLikeCompilation('Future Nostalgia'), false);
  assert.equal(looksLikeCompilation(''), false);
});

test('scored matching picks the explicit original from a realistic Deezer result set', () => {
  const want = { title: 'HUMBLE.', artist: 'Kendrick Lamar' };
  const results = [
    { title: 'HUMBLE. (SKRILLEX REMIX)', artist: 'Skrillex', previewUrl: 'r', explicit: true },
    { title: 'HUMBLE. (String Orchestra)', artist: 'Steve Hackman', previewUrl: 's' },
    { title: 'HUMBLE.', artist: 'Kendrick Lamar', previewUrl: 'orig', explicit: true },
  ];
  assert.equal(pickBestMatch(want, results).previewUrl, 'orig');
});
