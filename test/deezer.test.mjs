import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deezerTrackToCard } from '../js/deezer.js';
import { pickBestMatch } from '../js/itunes.js';

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
  assert.equal(card.explicit, true);
});

test('deezerTrackToCard leaves explicit undefined for clean tracks', () => {
  const card = deezerTrackToCard({
    title: 'Espresso', artist: { name: 'Sabrina Carpenter' }, preview: 'p', explicit_lyrics: false,
  });
  assert.equal(card.explicit, undefined);
  assert.equal(card.artworkUrl, undefined);
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
