import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HINT_KINDS, wordCount, hintLabel, hintAvailable, hintReveal,
} from '../js/hints.js';

const CARD = {
  title: "Hips Don't Lie", artist: 'Shakira', year: 2006,
  released: '2006-02-28', artworkUrl: 'https://example.test/cover.jpg',
};

test('the game sells identification clues, never the year', () => {
  assert.deepEqual(HINT_KINDS, ['title', 'artist', 'cover']);
  assert.ok(!HINT_KINDS.includes('year'));
  assert.ok(!HINT_KINDS.includes('decade'));
});

test('a clue names the record outright — that is what the token buys', () => {
  const title = hintReveal(CARD, 'title');
  assert.equal(title.text, "Hips Don't Lie");
  assert.equal(title.kind, 'title');

  const artist = hintReveal(CARD, 'artist');
  assert.equal(artist.text, 'Shakira');
  assert.equal(artist.kind, 'artist');

  const cover = hintReveal(CARD, 'cover');
  assert.equal(cover.image, CARD.artworkUrl);
  assert.equal(cover.text, undefined, 'the sleeve speaks for itself');
});

test('a clue only ever repeats the card’s own words — it never adds the year', () => {
  const cards = [
    CARD,
    { title: '1999', artist: 'Prince', year: 1982, artworkUrl: 'x' },
    { title: 'Summer of 69', artist: 'Bryan Adams', year: 1985 },
    { title: 'Africa', artist: 'Toto', year: 1982 },
  ];
  for (const card of cards) {
    for (const kind of HINT_KINDS) {
      const reveal = hintReveal(card, kind);
      if (!reveal) continue;
      const own = `${card.title}|${card.artist}|${card.artworkUrl ?? ''}`;
      assert.ok(!JSON.stringify(reveal).includes(String(card.year))
        || own.includes(String(card.year)),
      `${kind} introduced the year for ${card.title}`);
      if (reveal.text) {
        assert.ok(reveal.text === card.title || reveal.text === card.artist,
          `${kind} showed something the card does not say`);
      }
    }
  }
});

test('wordCount counts words, not spaces', () => {
  assert.equal(wordCount("Hips Don't Lie"), 3);
  assert.equal(wordCount('  Stan  '), 1);
  assert.equal(wordCount(''), 0);
});

test('hintAvailable only offers what the card can actually reveal', () => {
  assert.ok(hintAvailable(CARD, 'title'));
  assert.ok(hintAvailable(CARD, 'artist'));
  assert.ok(hintAvailable(CARD, 'cover'));
  assert.ok(!hintAvailable({ ...CARD, artworkUrl: undefined }, 'cover'));
  assert.ok(!hintAvailable({ title: '', artist: '' }, 'title'));
  assert.ok(!hintAvailable(null, 'title'));
  assert.ok(!hintAvailable(CARD, 'year'));
});

test('hintReveal refuses a clue the card cannot back up', () => {
  assert.equal(hintReveal({ ...CARD, artworkUrl: undefined }, 'cover'), null);
  assert.equal(hintReveal(CARD, 'year'), null);
  assert.equal(hintReveal(null, 'title'), null);
});
test('every kind has its own button label', () => {
  const labels = HINT_KINDS.map(hintLabel);
  assert.equal(new Set(labels).size, HINT_KINDS.length);
  for (const label of labels) assert.ok(label.length > 0);
});
