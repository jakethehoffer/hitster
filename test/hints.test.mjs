import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HINT_KINDS, maskWords, wordCount, hintLabel, hintAvailable, hintReveal,
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

test('maskWords keeps the first letter of each word and hides the rest', () => {
  assert.equal(maskWords("Hips Don't Lie"), "H___ D__'_ L__");
  assert.equal(maskWords('Stan'), 'S___');
  assert.equal(maskWords('  Lose   Yourself '), 'L___ Y_______');
  assert.equal(maskWords(''), '');
  assert.equal(maskWords(undefined), '');
});

test('a title that is a year gives nothing away', () => {
  // "1999" must not leak its first digit, or the clue hands over the era
  assert.equal(maskWords('1999'), '#___');
  assert.equal(maskWords('99 Problems'), '#_ P_______');
  assert.ok(!/\d/.test(maskWords('1999')));
  assert.ok(!/\d/.test(maskWords('Summer of 69')));
});

test('no clue text ever contains the release year', () => {
  const cards = [
    CARD,
    { title: '1999', artist: 'Prince', year: 1982, artworkUrl: 'x' },
    { title: 'Summer of 69', artist: 'Bryan Adams', year: 1985 },
  ];
  for (const card of cards) {
    for (const kind of HINT_KINDS) {
      const reveal = hintReveal(card, kind);
      if (!reveal || !reveal.text) continue;
      assert.ok(!reveal.text.includes(String(card.year)), `${kind} leaked the year`);
      assert.ok(!/\d{4}/.test(reveal.text), `${kind} exposed a four-digit number`);
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

test('hintReveal describes the clue without naming the song', () => {
  const title = hintReveal(CARD, 'title');
  assert.equal(title.text, "H___ D__'_ L__");
  assert.equal(title.note, '3 words');
  assert.ok(!title.text.includes('Hips '), 'the plain title must stay hidden');

  const artist = hintReveal(CARD, 'artist');
  assert.equal(artist.text, 'S______');
  assert.equal(artist.note, '1 word');

  const cover = hintReveal(CARD, 'cover');
  assert.equal(cover.image, CARD.artworkUrl);
  assert.equal(cover.text, undefined);

  assert.equal(hintReveal({ ...CARD, artworkUrl: undefined }, 'cover'), null);
  assert.equal(hintReveal(CARD, 'year'), null);
});

test('every kind has its own button label', () => {
  const labels = HINT_KINDS.map(hintLabel);
  assert.equal(new Set(labels).size, HINT_KINDS.length);
  for (const label of labels) assert.ok(label.length > 0);
});
