import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listDecks, getDeck, saveDeck, deleteDeck, createDeck,
  exportDeck, parseDeckImport, ensureSeedDeck,
} from '../js/decks.js';
import { SEED_SONGS } from '../js/seed-deck.js';

// Minimal localStorage stand-in.
function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('createDeck + saveDeck + listDecks + getDeck roundtrip', () => {
  const storage = makeStorage();
  const deck = createDeck(storage, 'Our Jams');
  assert.ok(deck.id);
  assert.equal(deck.name, 'Our Jams');
  deck.songs.push({ title: 'T', artist: 'A', year: 1999 });
  saveDeck(storage, deck);
  const listed = listDecks(storage);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, deck.id);
  assert.equal(getDeck(storage, deck.id).songs[0].year, 1999);
});

test('deleteDeck removes deck and index entry', () => {
  const storage = makeStorage();
  const deck = createDeck(storage, 'Temp');
  deleteDeck(storage, deck.id);
  assert.equal(listDecks(storage).length, 0);
  assert.equal(getDeck(storage, deck.id), null);
});

test('exportDeck/parseDeckImport roundtrip preserves songs', () => {
  const deck = { id: 'x', name: 'Mix', songs: [{ title: 'T', artist: 'A', year: 2001, previewUrl: 'http://p', artworkUrl: 'http://a' }] };
  const parsed = parseDeckImport(exportDeck(deck));
  assert.equal(parsed.name, 'Mix');
  assert.equal(parsed.songs.length, 1);
  assert.equal(parsed.songs[0].year, 2001);
  assert.notEqual(parsed.id, 'x'); // import mints a fresh id to avoid collisions
});

test('parseDeckImport rejects malformed input with clear errors', () => {
  assert.throws(() => parseDeckImport('not json'), /JSON/i);
  assert.throws(() => parseDeckImport('{"name":"x"}'), /songs/i);
  assert.throws(() => parseDeckImport('{"name":"x","songs":[{"title":"t","artist":"a","year":"nope"}]}'), /year/i);
  assert.throws(() => parseDeckImport('{"name":"x","songs":[{"artist":"a","year":1999}]}'), /title/i);
});

test('ensureSeedDeck installs the starter deck exactly once', () => {
  const storage = makeStorage();
  ensureSeedDeck(storage);
  const first = listDecks(storage);
  assert.equal(first.length, 1);
  assert.equal(first[0].songs.length, SEED_SONGS.length);
  // user deletes it -> it must NOT come back
  deleteDeck(storage, first[0].id);
  ensureSeedDeck(storage);
  assert.equal(listDecks(storage).length, 0);
});

test('seed deck songs are well-formed and span decades', () => {
  assert.ok(SEED_SONGS.length >= 30);
  for (const s of SEED_SONGS) {
    assert.equal(typeof s.title, 'string');
    assert.equal(typeof s.artist, 'string');
    assert.ok(Number.isInteger(s.year) && s.year >= 1950 && s.year <= 2026, `${s.title} year ${s.year}`);
  }
  const years = SEED_SONGS.map((s) => s.year);
  assert.ok(Math.min(...years) < 1975);
  assert.ok(Math.max(...years) > 2015);
});
