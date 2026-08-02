// Deck CRUD over an injected Storage (localStorage in the app, a stub in tests).
import { SEED_DECKS } from './seed-deck.js';

const INDEX_KEY = 'hitster.deckIndex';
const DECK_PREFIX = 'hitster.deck.';
const LEGACY_SEED_FLAG = 'hitster.seedInstalled';
const SEED_FLAG_PREFIX = 'hitster.seedInstalled.';
const SEED_VERSION_PREFIX = 'hitster.seedVersion.';
const PREVIEW_ERA_KEY = 'hitster.previewEra';

// Bumped whenever the resolver's choice of recording changes. A preview URL is
// derived data — whatever the picker settled on at the time — so a stale one
// keeps playing a wrong version forever unless it is cleared.
export const PREVIEW_ERA = 3;

let idCounter = 0;
function freshId() {
  idCounter += 1;
  return `d${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function readIndex(storage) {
  try {
    return JSON.parse(storage.getItem(INDEX_KEY)) || [];
  } catch {
    return [];
  }
}

function writeIndex(storage, ids) {
  storage.setItem(INDEX_KEY, JSON.stringify(ids));
}

export function listDecks(storage) {
  return readIndex(storage)
    .map((id) => getDeck(storage, id))
    .filter(Boolean);
}

export function getDeck(storage, id) {
  const raw = storage.getItem(DECK_PREFIX + id);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveDeck(storage, deck) {
  storage.setItem(DECK_PREFIX + deck.id, JSON.stringify(deck));
  const ids = readIndex(storage);
  if (!ids.includes(deck.id)) {
    ids.push(deck.id);
    writeIndex(storage, ids);
  }
}

export function deleteDeck(storage, id) {
  storage.removeItem(DECK_PREFIX + id);
  writeIndex(storage, readIndex(storage).filter((x) => x !== id));
}

export function createDeck(storage, name) {
  const deck = { id: freshId(), name, songs: [] };
  saveDeck(storage, deck);
  return deck;
}

export function exportDeck(deck) {
  return JSON.stringify({ name: deck.name, songs: deck.songs }, null, 2);
}

export function parseDeckImport(jsonString) {
  let data;
  try {
    data = JSON.parse(jsonString);
  } catch {
    throw new Error('Not valid JSON');
  }
  if (!data || !Array.isArray(data.songs)) {
    throw new Error('Deck file must have a "songs" array');
  }
  data.songs.forEach((s, i) => {
    if (!s || typeof s.title !== 'string' || !s.title) {
      throw new Error(`Song ${i + 1} is missing a title`);
    }
    if (typeof s.artist !== 'string' || !s.artist) {
      throw new Error(`Song ${i + 1} ("${s.title}") is missing an artist`);
    }
    if (!Number.isInteger(s.year)) {
      throw new Error(`Song ${i + 1} ("${s.title}") needs a numeric year`);
    }
  });
  return {
    id: freshId(),
    name: typeof data.name === 'string' && data.name ? data.name : 'Imported deck',
    songs: data.songs.map((s) => ({
      title: s.title,
      artist: s.artist,
      year: s.year,
      previewUrl: typeof s.previewUrl === 'string' ? s.previewUrl : undefined,
      artworkUrl: typeof s.artworkUrl === 'string' ? s.artworkUrl : undefined,
      rating: Number.isInteger(s.rating) ? s.rating : undefined,
      released: typeof s.released === 'string' ? s.released : undefined,
      explicit: s.explicit === true ? true : undefined,
    })),
  };
}

// ---------- ratings (the like/dislike learning loop) ----------

// Songs the group has net-disliked stay in the deck but sit out of new games.
export function playableSongs(songs) {
  return songs.filter((s) => (s.rating ?? 0) >= 0);
}

export function excludedCount(songs) {
  return songs.length - playableSongs(songs).length;
}

// Applies a thumbs up (+1) / down (-1) to the matching song in the stored
// deck. Returns the new rating, or null if the deck/song no longer exists
// (deleted mid-game, imported elsewhere — rating is best-effort).
export function rateSong(storage, deckId, card, delta) {
  const deck = getDeck(storage, deckId);
  if (!deck) return null;
  const song = deck.songs.find((s) => s.title === card.title && s.artist === card.artist);
  if (!song) return null;
  song.rating = (song.rating ?? 0) + delta;
  saveDeck(storage, deck);
  return song.rating;
}

// Drops cached preview URLs once per era bump so they re-resolve with the
// current picker. Ratings, curated years, edits and deletions are untouched —
// only the derived audio link goes. Returns how many were cleared.
export function refreshCachedPreviews(storage) {
  const era = parseInt(storage.getItem(PREVIEW_ERA_KEY) || '1', 10);
  if (era >= PREVIEW_ERA) return 0;
  let cleared = 0;
  for (const deck of listDecks(storage)) {
    let touched = false;
    for (const song of deck.songs) {
      if (song.previewUrl) {
        delete song.previewUrl;
        cleared += 1;
        touched = true;
      }
    }
    if (touched) saveDeck(storage, deck);
  }
  storage.setItem(PREVIEW_ERA_KEY, String(PREVIEW_ERA));
  return cleared;
}

// Records that a song was revealed in a game. The engine draws from the
// least-played cards, so this is what stops the next game replaying the songs
// you just heard. Best-effort like rateSong: null when the deck or song is
// gone (deleted mid-game, playing an imported copy).
export function markPlayed(storage, deckId, card) {
  const deck = getDeck(storage, deckId);
  if (!deck) return null;
  const song = deck.songs.find((s) => s.title === card.title && s.artist === card.artist);
  if (!song) return null;
  song.plays = (song.plays ?? 0) + 1;
  saveDeck(storage, deck);
  return song.plays;
}

// ---------- built-in decks ----------

// Installs each built-in deck on first ever run. Deleting one keeps it
// deleted — the flag records "installed once", not "should exist". When a
// seed's `version` is bumped, already-installed copies get the new songs
// appended (matched by title+artist, so user ratings/previews/edits stay).
export function ensureSeedDecks(storage) {
  // Migrate the pre-genre-decks flag so existing browsers don't get a
  // duplicate starter deck.
  if (storage.getItem(LEGACY_SEED_FLAG)) {
    storage.setItem(SEED_FLAG_PREFIX + 'starter', '1');
    storage.removeItem(LEGACY_SEED_FLAG);
  }
  for (const seed of SEED_DECKS) {
    const flag = SEED_FLAG_PREFIX + seed.key;
    const verKey = SEED_VERSION_PREFIX + seed.key;
    if (!storage.getItem(flag)) {
      const deck = createDeck(storage, seed.name);
      deck.seedKey = seed.key;
      deck.songs = seed.songs.map((s) => ({ ...s }));
      saveDeck(storage, deck);
      storage.setItem(flag, '1');
      storage.setItem(verKey, String(seed.version));
      continue;
    }
    const installedVersion = parseInt(storage.getItem(verKey) || '1', 10);
    if (installedVersion >= seed.version) continue;
    // Find the user's copy: seedKey when present, exact default name as the
    // fallback for pre-versioning installs. Deleted/renamed decks stay as
    // the user left them.
    const decks = listDecks(storage);
    const mine = decks.find((d) => d.seedKey === seed.key)
      || decks.find((d) => d.name === seed.name);
    if (mine) {
      const have = new Set(mine.songs.map((s) => `${s.title.toLowerCase()}|${s.artist.toLowerCase()}`));
      for (const s of seed.songs) {
        if (!have.has(`${s.title.toLowerCase()}|${s.artist.toLowerCase()}`)) {
          mine.songs.push({ ...s });
        }
      }
      mine.seedKey = seed.key;
      saveDeck(storage, mine);
    }
    storage.setItem(verKey, String(seed.version));
  }
}
