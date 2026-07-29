import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listDecks, getDeck, saveDeck, deleteDeck, createDeck,
  exportDeck, parseDeckImport, ensureSeedDecks,
  playableSongs, excludedCount, rateSong,
} from '../js/decks.js';
import { SEED_DECKS } from '../js/seed-deck.js';

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

test('exportDeck/parseDeckImport roundtrip preserves songs and ratings', () => {
  const deck = { id: 'x', name: 'Mix', songs: [{ title: 'T', artist: 'A', year: 2001, previewUrl: 'http://p', artworkUrl: 'http://a', rating: -1 }] };
  const parsed = parseDeckImport(exportDeck(deck));
  assert.equal(parsed.name, 'Mix');
  assert.equal(parsed.songs.length, 1);
  assert.equal(parsed.songs[0].year, 2001);
  assert.equal(parsed.songs[0].rating, -1);
  assert.notEqual(parsed.id, 'x'); // import mints a fresh id to avoid collisions
});

test('parseDeckImport rejects malformed input with clear errors', () => {
  assert.throws(() => parseDeckImport('not json'), /JSON/i);
  assert.throws(() => parseDeckImport('{"name":"x"}'), /songs/i);
  assert.throws(() => parseDeckImport('{"name":"x","songs":[{"title":"t","artist":"a","year":"nope"}]}'), /year/i);
  assert.throws(() => parseDeckImport('{"name":"x","songs":[{"artist":"a","year":1999}]}'), /title/i);
});

// ---------- built-in decks ----------

test('ensureSeedDecks installs all built-in decks exactly once', () => {
  const storage = makeStorage();
  ensureSeedDecks(storage);
  const first = listDecks(storage);
  assert.equal(first.length, SEED_DECKS.length);
  for (const seed of SEED_DECKS) {
    const installed = first.find((d) => d.name === seed.name);
    assert.ok(installed, `missing ${seed.name}`);
    assert.equal(installed.songs.length, seed.songs.length);
  }
  // user deletes one -> it must NOT come back
  deleteDeck(storage, first[0].id);
  ensureSeedDecks(storage);
  assert.equal(listDecks(storage).length, SEED_DECKS.length - 1);
});

test('legacy single-flag browsers get the new genre decks but no duplicate starter', () => {
  const storage = makeStorage();
  // simulate a pre-genre-decks install: starter deck exists, legacy flag set
  const old = createDeck(storage, 'Starter deck (replace with your taste!)');
  storage.setItem('hitster.seedInstalled', '1');
  ensureSeedDecks(storage);
  const decks = listDecks(storage);
  assert.equal(decks.length, SEED_DECKS.length); // old starter + rap + pop, no duplicate
  assert.equal(decks.filter((d) => d.name.startsWith('Starter deck')).length, 1);
  assert.ok(decks.some((d) => d.name === 'Rap & Hip-Hop'));
  assert.ok(decks.some((d) => d.name === 'Pop Through the Decades'));
});

test('seed decks are well-formed, unique within a deck, and span decades', () => {
  for (const seed of SEED_DECKS) {
    assert.ok(seed.songs.length >= 30, `${seed.name} too small`);
    const keys = new Set();
    for (const s of seed.songs) {
      assert.equal(typeof s.title, 'string');
      assert.equal(typeof s.artist, 'string');
      assert.ok(Number.isInteger(s.year) && s.year >= 1950 && s.year <= 2026, `${s.title} year ${s.year}`);
      const k = `${s.title}|${s.artist}`;
      assert.ok(!keys.has(k), `duplicate in ${seed.name}: ${k}`);
      keys.add(k);
    }
    const years = seed.songs.map((s) => s.year);
    assert.ok(Math.max(...years) - Math.min(...years) >= 40, `${seed.name} span too narrow`);
  }
});

// ---------- ratings ----------

test('playableSongs excludes net-disliked songs only', () => {
  const songs = [
    { title: 'A', artist: 'x', year: 2000 },
    { title: 'B', artist: 'x', year: 2001, rating: 2 },
    { title: 'C', artist: 'x', year: 2002, rating: 0 },
    { title: 'D', artist: 'x', year: 2003, rating: -1 },
  ];
  assert.deepEqual(playableSongs(songs).map((s) => s.title), ['A', 'B', 'C']);
  assert.equal(excludedCount(songs), 1);
});

test('rateSong persists thumbs up/down to the stored deck', () => {
  const storage = makeStorage();
  const deck = createDeck(storage, 'Rated');
  deck.songs.push({ title: 'Song', artist: 'Artist', year: 2010 });
  saveDeck(storage, deck);
  assert.equal(rateSong(storage, deck.id, { title: 'Song', artist: 'Artist' }, 1), 1);
  assert.equal(rateSong(storage, deck.id, { title: 'Song', artist: 'Artist' }, -1), 0);
  assert.equal(rateSong(storage, deck.id, { title: 'Song', artist: 'Artist' }, -1), -1);
  assert.equal(getDeck(storage, deck.id).songs[0].rating, -1);
  // unknown song / deck are graceful no-ops
  assert.equal(rateSong(storage, deck.id, { title: 'Nope', artist: 'Nobody' }, 1), null);
  assert.equal(rateSong(storage, 'missing', { title: 'Song', artist: 'Artist' }, 1), null);
});
