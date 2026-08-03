import {
  createGame, startTurn, skipSong, freeSkip, placeCard, addChallenge,
  resolveTurn, awardBonus, nextTurn, drawableCount, buyHint,
} from './engine.js';
import { searchSongs, resolvePreview, resolveReleaseDate, looksLikeAltVersion } from './itunes.js';
import { artistTopTracks, albumYear, looksLikeCompilation } from './deezer.js';
import {
  attachVisualizer, detachVisualizer, ensureVisualizerLoop, primeAudioGraph,
  seedFrom, visualizerState,
} from './visualizer.js';
import {
  attachStageFx, detachStageFx, stageFxState,
  setDanceMode, danceMode, setPartyMode, partyMode, setCrazyMode, crazyMode,
} from './stage-fx.js';
import { HINT_KINDS, hintAvailable, hintLabel, hintReveal } from './hints.js';
import {
  listDecks, getDeck, saveDeck, deleteDeck, createDeck,
  exportDeck, parseDeckImport, ensureSeedDecks, refreshCachedPreviews,
  availableSongs, playableSongs, excludedCount, unavailableCount,
  rateSong, markPlayed, unplayedSongs, resetPlays,
} from './decks.js';

const SAVE_KEY = 'hitster.savedGame';
const SETUP_KEY = 'hitster.lastSetup';

// ---------- tiny DOM helpers ----------

const $ = (sel) => document.querySelector(sel);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c != null) node.append(c);
  return node;
}

function clear(node) { while (node.firstChild) node.firstChild.remove(); return node; }

let toastTimer = null;
function toast(msg, ms = 3000) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

// ---------- storage (graceful fallback) ----------

const storage = (() => {
  try {
    localStorage.setItem('__hitster_probe', '1');
    localStorage.removeItem('__hitster_probe');
    return localStorage;
  } catch {
    const m = new Map();
    document.addEventListener('DOMContentLoaded', () =>
      $('#storage-notice').classList.remove('hidden'));
    return {
      getItem: (k) => (m.has(k) ? m.get(k) : null),
      setItem: (k, v) => m.set(k, String(v)),
      removeItem: (k) => m.delete(k),
    };
  }
})();

// ---------- screens ----------

let currentScreen = 'home';

// The room paints during a game, and anywhere else an easter egg is running —
// typing "party" on the home screen should do something.
function syncStageFx() {
  const wanted = currentScreen === 'game' || danceMode() || partyMode() || crazyMode();
  document.body.classList.toggle('fx-on', wanted);
  if (wanted) {
    attachStageFx($('#stage-fx'));
    ensureVisualizerLoop();
  } else {
    detachStageFx();
    detachVisualizer();
  }
}

function showScreen(name) {
  document.querySelectorAll('[data-screen]').forEach((s) =>
    s.classList.toggle('hidden', s.dataset.screen !== name));
  // The game screen is laid out as one fixed-height page; every other screen
  // is a normal scrolling document.
  document.body.classList.toggle('in-game', name === 'game');
  currentScreen = name;
  syncStageFx();
  if (name === 'home') renderHome();
  if (name === 'decks') renderDeckList();
  if (name === 'setup') renderSetup();
  stopAudio();
}

// ---------- audio ----------

let playingUrl = null;

function stopAudio() {
  const p = document.getElementById('player');
  p.pause();
  playingUrl = null;
  document.querySelectorAll('.listen-btn.playing').forEach((b) => {
    b.classList.remove('playing');
    b.textContent = '▶';
  });
}

function toggleListen(url, btn) {
  const p = document.getElementById('player');
  // Always from a click or a keypress, which is the only moment the browser
  // lets us open the AudioContext the visualiser listens through.
  primeAudioGraph(p);
  if (playingUrl === url) {
    // Same track: true pause/resume — keep the position, don't restart.
    if (p.paused) {
      p.play().catch(() => onPlaybackFailure(url));
      if (btn) { btn.classList.add('playing'); btn.textContent = '⏸'; }
    } else {
      p.pause();
      if (btn) { btn.classList.remove('playing'); btn.textContent = '▶'; }
    }
    return;
  }
  stopAudio();
  p.src = url;
  p.currentTime = 0;
  p.play().catch(() => onPlaybackFailure(url));
  playingUrl = url;
  if (btn) { btn.classList.add('playing'); btn.textContent = '⏸'; }
}

// A preview that fails at PLAY time (stale CDN link, network hiccup) must
// never cost a token: retry with a fresh lookup once, then offer a free skip.
function onPlaybackFailure(url) {
  const inTurn = game && (game.phase === 'listening' || game.phase === 'challenge');
  if (inTurn && game.mystery && url === game.mystery.previewUrl) {
    handleMysteryAudioFailure();
  } else {
    toast('Could not play preview');
  }
}

let mysteryRetried = false;

function handleMysteryAudioFailure() {
  const failedUrl = game.mystery.previewUrl;
  stopAudio();
  // Purge the stale URL from the stored deck so the re-lookup replaces it.
  const deck = getDeck(storage, gameDeckId);
  if (deck) {
    const song = deck.songs.find((s) => sameSong(s, game.mystery));
    if (song && song.previewUrl === failedUrl) {
      song.previewUrl = undefined;
      saveDeck(storage, deck);
    }
  }
  if (!mysteryRetried) {
    mysteryRetried = true;
    game.mystery.previewUrl = undefined;
    loadMysteryPreview();
  } else {
    previewState = 'error';
    renderGame();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const p = document.getElementById('player');
  p.addEventListener('ended', () => {
    stopAudio();
    if (game && (game.phase === 'listening' || game.phase === 'challenge')) renderPhase();
  });
  // Keep the vinyl spin and Play/Pause labels in sync however playback was
  // triggered (button or spacebar).
  for (const evt of ['play', 'pause']) {
    p.addEventListener(evt, () => {
      if (game && (game.phase === 'listening' || game.phase === 'challenge')) renderPhase();
    });
  }
  // Media element errors (bad/stale src) route to the free-skip path in-game.
  p.addEventListener('error', () => {
    if (playingUrl) onPlaybackFailure(playingUrl);
  });
});

// Type one of these anywhere outside a text box to flip it on, type it again to
// flip it off. Dance and party are remembered for next time; the crowd is not —
// nobody wants to reopen the app into two hundred people.
const EGG_KEY = 'hitster.eggs';
const EGGS = [
  {
    word: 'dance',
    remember: true,
    is: danceMode,
    set: setDanceMode,
    on: '🕺 Dance mode on — type "dance" again to clear the floor',
    off: 'The dancers have gone home',
  },
  {
    word: 'party',
    remember: true,
    is: partyMode,
    set: setPartyMode,
    on: '🪩 Disco! The record is a mirror ball — type "party" to switch it back',
    off: 'Lights up, disco over',
  },
  {
    word: 'crazy',
    remember: false,
    is: crazyMode,
    set: setCrazyMode,
    on: '😱 One dancer. Doubling every second. Type "crazy" to make it stop',
    off: 'Crowd cleared',
  },
];
const EGG_BUFFER = Math.max(...EGGS.map((e) => e.word.length));
let eggBuffer = '';

function rememberEggs() {
  try {
    storage.setItem(EGG_KEY, JSON.stringify(
      EGGS.filter((e) => e.remember && e.is()).map((e) => e.word)));
  } catch { /* not worth a warning */ }
}

function restoreEggs() {
  let saved = [];
  try { saved = JSON.parse(storage.getItem(EGG_KEY)) || []; } catch { saved = []; }
  // the pre-eggs single flag, so anyone already dancing keeps dancing
  if (storage.getItem('hitster.danceMode') === '1') saved.push('dance');
  for (const egg of EGGS) if (egg.remember) egg.set(saved.includes(egg.word));
}

function toggleEgg(egg) {
  const on = !egg.is();
  egg.set(on);
  rememberEggs();
  syncStageFx();
  toast(on ? egg.on : egg.off, 4000);
}

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.length !== 1) return;
  if (e.target.closest('input, textarea, select')) return;
  eggBuffer = (eggBuffer + e.key.toLowerCase()).slice(-EGG_BUFFER);
  const hit = EGGS.find((egg) => eggBuffer.endsWith(egg.word));
  if (!hit) return;
  eggBuffer = '';
  toggleEgg(hit);
});

// Spacebar = pause/resume the mystery song during a turn. Ignored while
// typing; overrides button focus so space never "re-clicks" the last button.
document.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  if (e.target.closest('input, textarea, select')) return;
  if (!game || (game.phase !== 'listening' && game.phase !== 'challenge')) return;
  if (previewState !== 'ready' || !game.mystery || !game.mystery.previewUrl) return;
  if (document.querySelector('[data-screen="game"]').classList.contains('hidden')) return;
  e.preventDefault();
  toggleListen(game.mystery.previewUrl, null);
});

// ---------- home ----------

function renderHome() {
  const hasSave = storage.getItem(SAVE_KEY) != null;
  $('#btn-resume').classList.toggle('hidden', !hasSave);
}

// ---------- deck list ----------

// A played song is retired, so the raw song count stops describing what a
// deck can still deal — say how much of it is left to hear.
function deckMeta(deck) {
  const available = availableSongs(deck.songs);
  const unheard = unplayedSongs(available).length;
  const archived = unavailableCount(deck.songs);
  if (archived) return `${unheard} playable · ${deck.songs.length} catalogued`;
  return unheard === available.length
    ? `${available.length} songs`
    : `${unheard} unheard of ${available.length}`;
}

function renderDeckList() {
  const list = clear($('#deck-list'));
  const decks = listDecks(storage);
  if (decks.length === 0) {
    list.append(el('li', { class: 'notice', text: 'No decks yet — create one or import a JSON file.' }));
    return;
  }
  for (const deck of decks) {
    list.append(el('li', { class: 'deck-item' },
      el('span', { class: 'deck-title', text: deck.name }),
      el('span', { class: 'deck-meta', text: deckMeta(deck) }),
      el('button', { class: 'btn', text: 'Edit', onclick: () => openDeckEdit(deck.id) }),
      el('button', { class: 'btn', text: 'Export', onclick: () => downloadDeck(deck) }),
      el('button', {
        class: 'btn btn-small', text: '✕',
        onclick: () => {
          if (confirm(`Delete deck "${deck.name}"?`)) {
            deleteDeck(storage, deck.id);
            renderDeckList();
          }
        },
      })));
  }
}

function downloadDeck(deck) {
  const blob = new Blob([exportDeck(deck)], { type: 'application/json' });
  const a = el('a', {
    href: URL.createObjectURL(blob),
    download: `${deck.name.replace(/[^a-z0-9-_ ]/gi, '')}.hitster.json`,
  });
  document.body.append(a);
  a.click();
  a.remove();
}

// ---------- deck edit ----------

let editingDeckId = null;

const sameSong = (a, b) =>
  a.title.toLowerCase() === b.title.toLowerCase()
  && a.artist.toLowerCase() === b.artist.toLowerCase();

function openDeckEdit(id) {
  editingDeckId = id;
  const deck = getDeck(storage, id);
  $('#deck-name-input').value = deck.name;
  clear($('#search-results'));
  $('#song-search').value = '';
  $('#deck-filter').value = '';
  $('#search-status').classList.add('hidden');
  showScreen('deck-edit');
  renderDeckSongs();
}

function bumpRating(song, delta) {
  const r = rateSong(storage, editingDeckId, song, delta);
  if (r != null && r < 0) toast(`"${song.title}" will sit out future games`);
  renderDeckSongs();
}

function renderDeckSongs() {
  const deck = getDeck(storage, editingDeckId);
  const excluded = excludedCount(deck.songs);
  const archived = unavailableCount(deck.songs);
  // Keep original indices: year-edit and delete address songs by position.
  const term = $('#deck-filter').value.trim().toLowerCase();
  const entries = deck.songs
    .map((song, i) => ({ song, i }))
    .filter(({ song }) => !term
      || song.title.toLowerCase().includes(term)
      || song.artist.toLowerCase().includes(term));
  const played = deck.songs.length - unplayedSongs(deck.songs).length;
  $('#deck-song-count').textContent = (term
    ? `${entries.length} of ${deck.songs.length} songs match`
    : `${deck.songs.length} songs in this deck`)
    + (played ? ` — ${played} already played and retired` : '')
    + (excluded ? ` — ${excluded} excluded by 👎` : '')
    + (archived ? ` — ${archived} archive-only` : '');
  // Only offer the reset when there is something to bring back.
  $('#btn-reset-plays').classList.toggle('hidden', played === 0);
  const list = clear($('#deck-songs'));
  if (term && entries.length === 0) {
    list.append(el('li', { class: 'notice', text: 'No songs in this deck match — the box above searches iTunes to add new ones.' }));
  }
  entries.forEach(({ song, i }) => {
    const rating = song.rating ?? 0;
    const yearInput = el('input', {
      class: 'year-input', type: 'number', value: String(song.year),
      min: '1900', max: '2100',
      onchange: (e) => {
        const y = parseInt(e.target.value, 10);
        if (Number.isInteger(y)) {
          const d = getDeck(storage, editingDeckId);
          d.songs[i].year = y;
          saveDeck(storage, d);
          toast(`Year updated to ${y}`);
        }
      },
    });
    list.append(el('li', { class: 'song-item' },
      song.artworkUrl ? el('img', { src: song.artworkUrl, alt: '' }) : null,
      el('div', { class: 'song-text' },
        el('div', { class: 'song-title' },
          song.title, song.explicit ? el('span', { class: 'explicit-badge', text: '🅴' }) : null),
        el('div', { class: 'song-artist', text: song.artist })),
      song.previewUrl
        ? el('button', { class: 'btn btn-small listen-btn', text: '▶', onclick: (e) => toggleListen(song.previewUrl, e.target) })
        : null,
      !song.previewUnavailable ? el('button', {
        class: 'btn btn-small', text: '↻ Fix preview', title: 'Re-fetch the preview (fixes wrong versions)',
        onclick: async (e) => {
          e.target.disabled = true;
          try {
            const fresh = await resolvePreview({ ...song, previewUrl: undefined });
            const d = getDeck(storage, editingDeckId);
            const target = d.songs.find((s) => s.title === song.title && s.artist === song.artist);
            if (target) {
              target.previewUrl = fresh.previewUrl;
              target.artworkUrl = fresh.artworkUrl || target.artworkUrl;
              target.explicit = fresh.explicit;
              saveDeck(storage, d);
            }
            toast('Preview refreshed');
            renderDeckSongs();
          } catch (err) {
            toast(`Couldn't refresh: ${err.message}`);
            e.target.disabled = false;
          }
        },
      }) : null,
      el('button', {
        class: 'btn btn-small', text: '👍', title: 'Like this pick',
        onclick: () => bumpRating(song, 1),
      }),
      el('button', {
        class: 'btn btn-small', text: '👎', title: 'Dislike — net-disliked songs sit out of games',
        onclick: () => bumpRating(song, -1),
      }),
      rating > 0 ? el('span', { class: 'rating-badge', text: `👍${rating}` }) : null,
      rating < 0 ? el('span', { class: 'rating-badge negative', text: '👎 excluded' }) : null,
      song.previewUnavailable ? el('span', {
        class: 'catalog-badge',
        text: song.catalogStatus === 'unreleased' ? 'archive · unreleased' : 'archive only',
        title: 'Catalogued for completeness; no authorised Deezer/iTunes preview is known',
      }) : null,
      // why a song stopped coming up
      song.plays > 0 ? el('span', { class: 'played-badge', text: '✓ played' }) : null,
      rating < 0 ? el('button', {
        class: 'btn btn-small', text: 'Restore',
        onclick: () => {
          const d = getDeck(storage, editingDeckId);
          const target = d.songs.find((s) => s.title === song.title && s.artist === song.artist);
          if (target) { target.rating = 0; saveDeck(storage, d); }
          renderDeckSongs();
        },
      }) : null,
      yearInput,
      el('button', {
        class: 'btn btn-small', text: '✕',
        onclick: () => {
          const d = getDeck(storage, editingDeckId);
          d.songs.splice(i, 1);
          saveDeck(storage, d);
          renderDeckSongs();
        },
      })));
  });
}

async function runSearch() {
  const term = $('#song-search').value.trim();
  if (!term) return;
  const status = $('#search-status');
  status.textContent = 'Searching…';
  status.classList.remove('hidden');
  clear($('#search-results'));
  try {
    const results = await searchSongs(term);
    status.classList.add('hidden');
    if (results.length === 0) {
      status.textContent = 'No results — try a different spelling.';
      status.classList.remove('hidden');
      return;
    }
    renderSearchResults(results);
  } catch (err) {
    status.textContent = `Search failed (${err.message}) — check your connection and retry.`;
    status.classList.remove('hidden');
  }
}

// iTunes search only serves clean/censored previews, so after adding a song
// we quietly swap in the original (explicit where it exists) from Deezer.
function upgradeToOriginalPreview(card) {
  const deckId = editingDeckId;
  resolvePreview({ title: card.title, artist: card.artist, year: card.year })
    .then((fresh) => {
      const d = getDeck(storage, deckId);
      if (!d || !fresh.previewUrl) return;
      const target = d.songs.find((s) => sameSong(s, card));
      if (!target) return;
      target.previewUrl = fresh.previewUrl;
      target.explicit = fresh.explicit;
      target.artworkUrl = target.artworkUrl || fresh.artworkUrl;
      saveDeck(storage, d);
      if (editingDeckId === deckId) renderDeckSongs();
    })
    .catch(() => { /* keep the iTunes preview */ });
}

function renderSearchResults(results) {
  const list = clear($('#search-results'));
  const deckSongs = getDeck(storage, editingDeckId).songs;
  for (const card of results) {
    // A song already in the deck gets a "use this preview" action instead of
    // Add — searching is the natural way to fix a wrong-version preview.
    const inDeck = deckSongs.some((s) => sameSong(s, card));
    const action = inDeck
      ? el('button', {
        class: 'btn btn-small', text: '↻ Use this preview',
        title: 'Already in this deck — make its preview play this exact version',
        onclick: () => {
          const d = getDeck(storage, editingDeckId);
          const target = d.songs.find((s) => sameSong(s, card));
          if (!target) return;
          target.previewUrl = card.previewUrl;
          target.artworkUrl = card.artworkUrl || target.artworkUrl;
          target.explicit = card.explicit;
          delete target.previewUnavailable;
          saveDeck(storage, d);
          toast(`"${target.title}" will now play this version`);
          renderDeckSongs();
        },
      })
      : el('button', {
        class: 'btn btn-primary btn-small', text: '+ Add',
        onclick: () => {
          if (!Number.isInteger(card.year)) {
            toast('This result has no release year — pick another version');
            return;
          }
          const d = getDeck(storage, editingDeckId);
          if (d.songs.some((s) => sameSong(s, card))) {
            toast('Already in this deck');
            return;
          }
          d.songs.push({ ...card });
          saveDeck(storage, d);
          toast(`Added "${card.title}" (${card.year}) — edit the year if that's a re-release date`);
          renderDeckSongs();
          renderSearchResults(results); // the added song's row flips to "use this preview"
          upgradeToOriginalPreview(card);
        },
      });
    list.append(el('li', { class: 'song-item' },
      card.artworkUrl ? el('img', { src: card.artworkUrl, alt: '' }) : null,
      el('div', { class: 'song-text' },
        el('div', { class: 'song-title' },
          card.title, card.explicit ? el('span', { class: 'explicit-badge', text: '🅴' }) : null),
        el('div', { class: 'song-artist', text: card.artist })),
      el('span', { class: 'song-year', text: String(card.year ?? '?') }),
      el('button', { class: 'btn btn-small listen-btn', text: '▶', onclick: (e) => toggleListen(card.previewUrl, e.target) }),
      action));
  }
}

// ---------- setup ----------

let playerCount = 0;

function addPlayerRow(name = '') {
  if (playerCount >= 8) return;
  playerCount += 1;
  const row = el('div', { class: 'player-row' },
    el('input', { type: 'text', maxlength: '20', placeholder: `Player ${playerCount}`, value: name }),
    el('button', {
      class: 'btn btn-small', text: '✕',
      onclick: (e) => {
        if ($('#player-inputs').children.length <= 2) { toast('Need at least 2 players'); return; }
        e.target.closest('.player-row').remove();
        playerCount -= 1;
        updateDeckWarning();
      },
    }));
  $('#player-inputs').append(row);
  updateDeckWarning();
}

// The group outlives any one game. Names and settings are remembered so that
// switching decks, starting over, or coming back after a reload never means
// typing everyone in again.
function saveSetup(deckId, players, settings) {
  try {
    storage.setItem(SETUP_KEY, JSON.stringify({ deckId, players, ...settings }));
  } catch { /* storage full — the group just won't outlive this session */ }
}

function loadSetup() {
  try {
    const saved = JSON.parse(storage.getItem(SETUP_KEY));
    return saved && Array.isArray(saved.players) && saved.players.length >= 2 ? saved : null;
  } catch {
    return null;
  }
}

function renderSetup() {
  const select = clear($('#setup-deck'));
  const decks = listDecks(storage);
  for (const d of decks) {
    const available = availableSongs(d.songs).length;
    const count = available === d.songs.length
      ? `${d.songs.length} songs`
      : `${available} playable / ${d.songs.length} catalogued`;
    select.append(el('option', { value: d.id, text: `${d.name} (${count})` }));
  }
  $('#btn-start-game').disabled = decks.length === 0;
  if (decks.length === 0) toast('Create a deck first');
  // Only seed the form when it's empty — mid-session edits outrank what was
  // saved, and a page reload is what needs the group put back.
  if ($('#player-inputs').children.length === 0) {
    const last = loadSetup();
    playerCount = 0;
    if (last) {
      for (const name of last.players) addPlayerRow(name);
      $('#setup-target').value = String(last.target);
      $('#setup-tokens').value = String(last.tokens);
      $('#setup-challenges').checked = last.challenges !== false;
      $('#setup-endless').checked = last.endless !== false;
      $('#setup-hard').checked = last.hardDraws !== false;
    } else {
      addPlayerRow();
      addPlayerRow();
    }
  }
  // Land on the deck the group played last, when it's still around.
  const last = loadSetup();
  if (last && decks.some((d) => d.id === last.deckId)) select.value = last.deckId;
  updateDeckWarning();
}

// Everything Start game reads off the setup form.
function currentSetupSettings() {
  const rawTokens = parseInt($('#setup-tokens').value, 10);
  const tokens = Number.isInteger(rawTokens) ? Math.min(20, Math.max(0, rawTokens)) : 2;
  $('#setup-tokens').value = String(tokens);
  return {
    target: parseInt($('#setup-target').value, 10),
    tokens,
    challenges: $('#setup-challenges').checked,
    endless: $('#setup-endless').checked,
    hardDraws: $('#setup-hard').checked,
  };
}

// Straight into another game with the group and settings already agreed —
// used by "Play again" and by picking a different deck mid-game.
function startWithSameGroup(deckId) {
  const last = loadSetup();
  const deck = getDeck(storage, deckId ?? (last && last.deckId));
  if (!last || !deck) { showScreen('setup'); return; }
  const { players, deckId: _ignored, ...settings } = last;
  if (availableSongs(deck.songs).length < players.length + 1) {
    toast(`"${deck.name}" needs at least ${players.length + 1} songs for ${players.length} players.`);
    showScreen('setup');
    return;
  }
  saveSetup(deck.id, players, settings);
  beginGame(deck, players, settings);
}

function getSetupPlayers() {
  return [...$('#player-inputs').querySelectorAll('input')]
    .map((inp, i) => inp.value.trim() || `Player ${i + 1}`);
}

function updateDeckWarning() {
  const warning = $('#deck-warning');
  const deck = getDeck(storage, $('#setup-deck').value);
  if (!deck) { warning.classList.add('hidden'); return; }
  const players = $('#player-inputs').children.length;
  const target = parseInt($('#setup-target').value, 10);
  const comfy = players * target + 10;
  const playable = playableSongs(deck.songs);
  const available = availableSongs(deck.songs);
  const excluded = available.length - playable.length;
  const archived = unavailableCount(deck.songs);
  // Songs are never repeated, so what matters is how many are still unheard.
  const pool = unplayedSongs(playable);
  const heard = playable.length - pool.length;
  const endless = $('#setup-endless').checked;
  const excludedNote = excluded
    ? ` (${excluded} disliked song${excluded > 1 ? 's' : ''} excluded — restore in the deck editor)` : '';
  const archiveNote = archived
    ? ` ${archived} archive-only recording${archived > 1 ? 's are' : ' is'} catalogued but not dealt.` : '';
  const heardNote = heard ? ` ${heard} already played and retired.` : '';
  if (pool.length < players + 1) {
    warning.textContent = `Only ${pool.length} unheard songs left${excludedNote}.${heardNote}${archiveNote} Starting a game will offer to play the deck from the top again.`;
    warning.classList.remove('hidden');
  } else if (pool.length < comfy && endless) {
    warning.textContent = `${pool.length} unheard songs${excludedNote}.${heardNote}${archiveNote} Endless refill will top it up with new songs from its artists as you play.`;
    warning.classList.remove('hidden');
  } else if (pool.length < comfy) {
    warning.textContent = `${pool.length} unheard songs${excludedNote}.${heardNote}${archiveNote} Comfortable for these settings is ${comfy}+. You can still play; the game ends when the unheard songs run out (most cards wins).`;
    warning.classList.remove('hidden');
  } else if (excluded || heard || archived) {
    warning.textContent = `${pool.length} unheard songs${excludedNote}.${heardNote}${archiveNote}`;
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }
}

// ---------- game ----------

let game = null;
let gameDeckId = null;
let selectedSlot = null;          // tentative slot during listening
let selectedChallenger = null;    // player idx picking a challenge slot
let selectedChallengeSlot = null; // tentative slot awaiting challenge confirmation
let bonusAwarded = new Set();
let songVoted = { up: false, down: false }; // one 👍 and one 👎 per reveal
let previewState = 'idle';        // idle | loading | ready | error

function saveGame() {
  try {
    if (game && game.phase !== 'gameover') {
      storage.setItem(SAVE_KEY, JSON.stringify({ engine: game, deckId: gameDeckId }));
    } else {
      storage.removeItem(SAVE_KEY);
    }
  } catch { /* storage full — play on in memory */ }
}

function beginGame(deck, players, settings) {
  // Disliked songs sit out unless that would leave too few to play with.
  // Archive-only records never enter the draw pool: an automatic lookup can
  // neither license a leak nor safely distinguish one from a same-titled song.
  const available = availableSongs(deck.songs);
  const pool = playableSongs(deck.songs);
  const excluded = available.length - pool.length;
  const usable = pool.length >= players.length + 1 ? pool : available;
  if (usable.length < players.length + 1) {
    toast(`"${deck.name}" needs at least ${players.length + 1} playable songs for ${players.length} players.`);
    showScreen('setup');
    return;
  }
  if (excluded > 0) {
    toast(usable === pool
      ? `${excluded} disliked song${excluded > 1 ? 's are' : ' is'} sitting this game out`
      : 'Too few liked songs left — including disliked ones this game');
  }
  // Songs are never recycled: a game only deals what nobody has heard.
  const fresh = unplayedSongs(usable);
  if (fresh.length < players.length + 1) {
    const heard = usable.length - fresh.length;
    if (!confirm(`This deck is used up — ${heard} of its ${usable.length} songs have been played and songs are never repeated.\n\nStart the deck over? (play history clears; ratings, years and previews stay)`)) {
      toast('Pick another deck, or add songs in the deck editor');
      return;
    }
    resetPlays(storage, deck.id);
    beginGame(getDeck(storage, deck.id), players, settings);
    return;
  }
  if (new Set(fresh.map((song) => song.year)).size < 2) {
    toast('This deck needs unheard songs from at least 2 different years.');
    return;
  }
  game = createGame({
    players,
    deck: fresh.map((s) => ({ ...s })),
    cardsToWin: settings.target,
    startTokens: settings.tokens,
    challengesEnabled: settings.challenges,
    endless: settings.endless,
    hardDraws: settings.hardDraws,
    rngSeed: Math.floor(Math.random() * 2 ** 31),
  });
  gameDeckId = deck.id;
  showScreen('game');
  renderGame();
  saveGame();
  warmTimelineDates();
  refillDeck().then(() => prefetchUpcoming());
}

function renderGame() {
  if (!game) return;
  if (game.phase === 'gameover') { showWin(); return; }
  renderScoreboard();
  renderPhase();
  renderTimeline();
  $('#draw-count').textContent = `${drawableCount(game)} different-year songs available`;
}

function renderScoreboard() {
  const board = clear($('#scoreboard'));
  game.players.forEach((p, i) => {
    board.append(el('div', { class: `player-chip${i === game.current ? ' active' : ''}` },
      el('span', { class: 'chip-name', text: p.name }),
      el('span', { class: 'chip-cards', text: `${p.timeline.length}/${game.settings.cardsToWin}` }),
      el('span', { class: 'chip-tokens', text: '●'.repeat(p.tokens) || '—' })));
  });
}

function activeName() { return game.players[game.current].name; }

// The record, its spectrum ring and the light it throws. Rebuilt on every
// render; the visualiser keeps its own state and just re-targets the canvas.
function buildDeckStage() {
  const p = document.getElementById('player');
  const canvas = el('canvas', { class: 'viz' });
  // The challenge screen carries the most rows of any phase; the record gives
  // up its space there so the Reveal button never falls off the page.
  const stage = el('div', { class: `deck-stage${game.phase === 'challenge' ? ' compact' : ''}` },
    canvas,
    el('div', { class: 'deck-glow' }),
    el('div', { class: 'vinyl-hold' },
      el('div', { class: `vinyl${!p.paused && playingUrl ? ' spinning' : ''}` })));
  const song = game.mystery || {};
  attachVisualizer(canvas, p, { seed: seedFrom(`${song.title || ''}|${song.artist || ''}`) });
  return stage;
}

function renderPhase() {
  const area = clear($('#phase-area'));
  const phase = game.phase;
  if (phase !== 'listening' && phase !== 'challenge') detachVisualizer();

  if (phase === 'idle') {
    area.append(
      el('h2', { class: 'phase-title' }, el('span', { class: 'who', text: activeName() }), ', you’re up!'),
      el('p', { class: 'phase-sub', text: 'Press play, listen, and figure out where this song lands in your timeline.' }),
      el('div', { class: 'phase-controls' },
        el('button', { class: 'btn btn-primary btn-big', text: '▶ Draw a song', onclick: onStartTurn })));
    return;
  }

  if (phase === 'listening' || phase === 'challenge') {
    const p = document.getElementById('player');
    area.append(buildDeckStage());

    if (previewState === 'loading') {
      area.append(el('p', { class: 'phase-sub', text: 'Finding the song preview…' }));
      return;
    }
    if (previewState === 'error') {
      area.append(
        el('p', { class: 'notice', text: 'This song’s preview is unavailable.' }),
        el('div', { class: 'phase-controls' },
          drawableCount(game) > 0
            ? el('button', { class: 'btn btn-primary', text: 'Skip it (free)', onclick: onFreeSkip })
            : el('p', { class: 'phase-sub', text: 'Pile is empty — place it blind for the thrill!' })));
      // fall through: placement (blind) and challenges stay available
    }

    if (phase === 'listening') {
      const active = game.players[game.current];
      const controls = el('div', { class: 'phase-controls' });
      if (previewState === 'ready') {
        controls.append(el('button', {
          class: 'btn btn-primary', text: (!p.paused && playingUrl) ? '⏸ Pause' : '▶ Play song',
          onclick: (e) => { toggleListen(game.mystery.previewUrl, null); renderPhase(); },
        }));
        controls.append(el('button', {
          class: 'btn', text: '↻ Replay',
          onclick: () => { const pl = document.getElementById('player'); pl.currentTime = 0; pl.play(); renderPhase(); },
        }));
      }
      if (previewState !== 'error' && drawableCount(game) > 0) {
        controls.append(el('button', {
          class: 'btn', text: `⤳ Skip song (1 token)`,
          disabled: active.tokens < 1 ? 'true' : null,
          onclick: onSkip,
        }));
      }
      const bought = game.hintsUsed || [];
      const forSale = HINT_KINDS.filter((k) => !bought.includes(k) && hintAvailable(game.mystery, k));
      const clueRow = forSale.length === 0 ? null : el('div', { class: 'clue-row' },
        el('span', { class: 'label', text: 'Stuck? Buy a clue (1 token):' }),
        ...forSale.map((kind) => el('button', {
          class: 'btn btn-small',
          text: hintLabel(kind),
          title: CLUE_TITLES[kind],
          disabled: active.tokens < 1 ? 'true' : null,
          onclick: () => onHint(kind),
        })));
      const shown = bought.map((kind) => hintReveal(game.mystery, kind)).filter(Boolean);
      const clueStrip = shown.length === 0 ? null
        : el('div', { class: 'clue-strip' }, ...shown.map(clueNode));
      // append() stringifies a null child, so conditional rows are filtered out
      // rather than passed through.
      area.append(...[
        el('h2', { class: 'phase-title' }, el('span', { class: 'who', text: activeName() }), ' — where does it go?'),
        controls,
        clueRow,
        clueStrip,
        // Once a slot is picked the instruction is spent — drop it and give
        // the row back to the turntable.
        selectedSlot == null
          ? el('p', { class: 'phase-sub', text: 'Tap a slot in your timeline below, then lock it in. Spacebar pauses/plays.' })
          : null,
      ].filter(Boolean));
      if (selectedSlot != null) {
        area.append(el('div', { class: 'phase-controls' },
          el('button', { class: 'btn btn-primary btn-big', text: '🔒 Lock it in', onclick: onLockPlacement })));
      }
      area.append(buildVoteRow());
      return;
    }

    // challenge phase
    area.append(el('h2', { class: 'phase-title' },
      el('span', { class: 'who', text: activeName() }), ' locked a slot. Anyone dare to challenge?'));
    if (previewState === 'ready') {
      area.append(el('div', { class: 'phase-controls' },
        el('button', {
          class: 'btn', text: (!p.paused && playingUrl) ? '⏸ Pause' : '▶ Play again',
          onclick: () => { toggleListen(game.mystery.previewUrl, null); renderPhase(); },
        })));
    }
    const eligible = game.players
      .map((pl, i) => ({ pl, i }))
      .filter(({ pl, i }) => i !== game.current && pl.tokens > 0
        && !game.challenges.some((c) => c.player === i));
    if (game.settings.challengesEnabled && eligible.length > 0) {
      const picker = el('div', { class: 'challenge-picker' },
        el('span', { class: 'phase-sub', text: 'Challenge (1 token — back only if you steal it): ' }));
      for (const { pl, i } of eligible) {
        picker.append(el('button', {
          class: `btn${selectedChallenger === i ? ' picked' : ''}`,
          text: pl.name,
          onclick: () => {
            selectedChallenger = selectedChallenger === i ? null : i;
            selectedChallengeSlot = null;
            renderGame();
          },
        }));
      }
      area.append(picker);
      if (selectedChallenger != null) {
        // the instruction is spent once they have tapped one
        if (selectedChallengeSlot == null) {
          area.append(el('p', { class: 'phase-sub', text: `${game.players[selectedChallenger].name}: tap the slot you think is right.` }));
        }
        if (selectedChallengeSlot != null) {
          area.append(el('div', { class: 'phase-controls' },
            el('button', { class: 'btn btn-primary btn-big', text: 'Confirm challenge', onclick: onConfirmChallenge }),
            el('button', { class: 'btn', text: 'Cancel', onclick: onCancelChallenge })));
        }
      }
    }
    if (game.challenges.length > 0) {
      area.append(el('p', { class: 'phase-sub', text: 'Challenges: ' + game.challenges.map((c) => game.players[c.player].name).join(', ') }));
    }
    area.append(
      el('div', { class: 'phase-controls' },
        el('button', { class: 'btn btn-primary btn-big', text: '✨ Reveal!', onclick: onReveal })),
      buildVoteRow());
    return;
  }

  if (phase === 'reveal') {
    const revealed = lastRevealCard();
    area.append(revealCardNode(revealed));
    if (revealed.auto) {
      area.append(el('p', { class: 'phase-sub', text: '✨ New discovery — auto-added to this deck from its artists. Year comes from the song’s album; fix it in the deck editor if it looks off.' }));
    }
    const o = game.outcome;
    if (o.activeCorrect) {
      area.append(el('p', { class: 'outcome good', text: `✔ ${activeName()} nailed it — card claimed!` }));
    } else if (o.stolenBy != null) {
      area.append(el('p', { class: 'outcome steal', text: `⚡ Stolen by ${game.players[o.stolenBy].name} — token back!` }));
    } else {
      area.append(el('p', { class: 'outcome bad', text: '✘ Nobody got it — into the bin.' }));
    }
    const bonus = el('div', { class: 'bonus-row' },
      el('span', { class: 'label', text: 'Named artist + title? Grab a token:' }));
    game.players.forEach((pl, i) => {
      bonus.append(el('button', {
        class: 'btn btn-small', text: `+ ${pl.name}`,
        disabled: bonusAwarded.has(i) ? 'true' : null,
        onclick: () => { awardBonus(game, i); bonusAwarded.add(i); saveGame(); renderGame(); },
      }));
    });
    area.append(bonus, buildVoteRow(),
      el('div', { class: 'phase-controls' },
        el('button', { class: 'btn btn-primary btn-big', text: 'Next turn →', onclick: onNextTurn })));
  }
}

const CLUE_TITLES = {
  title: 'Reveals the shape of the title — first letters only, never the year',
  artist: 'Reveals the shape of the artist name — first letters only',
  cover: 'Shows the album sleeve, blurred',
};

function clueNode(clue) {
  if (clue.image) {
    return el('div', { class: 'clue clue-cover' },
      el('img', { src: clue.image, alt: 'Blurred album cover' }),
      el('span', { class: 'clue-note', text: 'cover' }));
  }
  return el('div', { class: 'clue' },
    el('span', { class: 'clue-masked', text: clue.text }),
    el('span', { class: 'clue-note', text: `${clue.kind}, ${clue.note}` }));
}

// 👍/👎 for the current song — available while it plays (before you know what
// it is) and at reveal. One vote each per song.
function buildVoteRow() {
  const card = game.phase === 'reveal' ? lastRevealCard() : game.mystery;
  return el('div', { class: 'bonus-row' },
    el('span', { class: 'label', text: 'Good pick for this deck?' }),
    el('button', {
      class: 'btn btn-small', text: '👍 Keep it',
      disabled: songVoted.up ? 'true' : null,
      onclick: () => {
        songVoted.up = true;
        const r = rateSong(storage, gameDeckId, card, 1);
        toast(r == null ? 'Deck no longer stored — vote not saved' : 'Noted 👍');
        renderGame();
      },
    }),
    el('button', {
      class: 'btn btn-small', text: '👎 Cut it',
      disabled: songVoted.down ? 'true' : null,
      onclick: () => {
        songVoted.down = true;
        const r = rateSong(storage, gameDeckId, card, -1);
        const note = r == null ? 'Deck no longer stored — vote not saved'
          : r < 0 ? 'Cut — it sits out future games (restore in the deck editor)' : 'Noted 👎';
        // Cutting a song mid-listen is a rejection, not a guess: move on to
        // another song without charging a token for it.
        if (game.phase === 'listening' && drawableCount(game) > 0) {
          stopAudio();
          freeSkip(game);
          selectedSlot = null;
          songVoted = { up: false, down: false }; // fresh song, fresh votes
          mysteryRetried = false;
          saveGame();
          toast(`${note} — skipped, no token spent`, 4000);
          loadMysteryPreview();
          return;
        }
        toast(note);
        renderGame();
      },
    }));
}

// The card that was just revealed: it moved into a timeline or the discard.
function lastRevealCard() {
  const o = game.outcome;
  if (o.activeCorrect) return game.players[game.current].timeline[game.placedSlot];
  if (o.stolenBy != null) {
    const tl = game.players[o.stolenBy].timeline;
    return game.mystery;
  }
  return game.discard[game.discard.length - 1];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "2015-10-23" -> "23 Oct". Split by hand: `new Date` would shift the day
// backwards for anyone west of UTC.
function dayAndMonth(released) {
  const [, m, d] = (released || '').split('-');
  const month = MONTHS[parseInt(m, 10) - 1];
  return month ? `${parseInt(d, 10)} ${month}` : null;
}

// "2015-10-23" -> "Oct 23, 2015" without applying a timezone offset.
function fullReleaseDate(released) {
  const [year, m, d] = (released || '').split('-');
  const month = MONTHS[parseInt(m, 10) - 1];
  const day = parseInt(d, 10);
  return year && month && Number.isInteger(day) ? `${month} ${day}, ${year}` : null;
}

function revealCardNode(card) {
  // The date is what decides a placement against a song from the same year,
  // so show it — otherwise losing one of those looks arbitrary.
  const day = card.released ? dayAndMonth(card.released) : null;
  return el('div', { class: 'reveal-card' },
    card.artworkUrl ? el('img', { src: card.artworkUrl, alt: '' }) : null,
    el('div', { class: 'reveal-year', text: String(card.year) }),
    day ? el('div', { class: 'reveal-date', text: day }) : null,
    el('div', { class: 'reveal-title', text: card.title }),
    el('div', { class: 'reveal-artist', text: card.artist }));
}

function renderTimeline() {
  const areaWrap = clear($('#timeline-area'));
  if (game.phase === 'idle') return;

  // whose timeline to show
  let ownerIdx = game.current;
  let ownerNote = '';
  if (game.phase === 'reveal' && game.outcome.stolenBy != null) {
    ownerIdx = game.outcome.stolenBy;
    ownerNote = ' (stole the card!)';
  }
  const owner = game.players[ownerIdx];
  areaWrap.append(el('p', { class: 'timeline-owner' },
    el('b', { text: owner.name }), `’s timeline${ownerNote}`));

  const row = el('div', { class: 'timeline' });
  const justWonYear = game.phase === 'reveal' && !game.outcome.discarded ? lastRevealCard() : null;
  const interactive = game.phase === 'listening'
    || (game.phase === 'challenge' && selectedChallenger != null);

  const slotNode = (slotIdx) => {
    const isPlaced = game.phase !== 'listening' && game.placedSlot === slotIdx;
    const challenge = game.challenges.find((c) => c.slot === slotIdx);
    const isSelected = (game.phase === 'listening' && selectedSlot === slotIdx)
      || (game.phase === 'challenge' && selectedChallengeSlot === slotIdx);
    const taken = isPlaced || challenge;
    const btn = el('button', {
      class: `slot${isSelected || isPlaced ? ' selected' : ''}${challenge ? ' challenged' : ''}`,
      text: isPlaced ? game.players[game.current].name[0] : challenge ? game.players[challenge.player].name[0] : '◆',
      onclick: () => {
        if (!interactive || taken) return;
        if (game.phase === 'listening') {
          selectedSlot = slotIdx;
          renderGame();
        } else {
          selectedChallengeSlot = selectedChallengeSlot === slotIdx ? null : slotIdx;
          renderGame();
        }
      },
    });
    if (!interactive && !taken) btn.setAttribute('disabled', 'true');
    return btn;
  };

  if (game.phase === 'reveal') {
    // no slots at reveal — just show the timeline with the new card highlighted
    owner.timeline.forEach((c) => row.append(timelineCardNode(c, c === justWonYear)));
  } else {
    const tl = game.players[game.current].timeline;
    row.append(slotNode(0));
    tl.forEach((c, i) => {
      row.append(timelineCardNode(c, false));
      row.append(slotNode(i + 1));
    });
  }
  areaWrap.append(row);
}

function timelineCardNode(card, highlight) {
  const released = fullReleaseDate(card.released);
  return el('div', { class: `timeline-card${highlight ? ' just-won' : ''}` },
    el('div', { class: 'tc-year', text: String(card.year) }),
    released ? el('div', { class: 'tc-date', text: released }) : null,
    el('div', { class: 'tc-title', text: card.title }),
    el('div', { class: 'tc-artist', text: card.artist }));
}

// ---------- game actions ----------

async function loadMysteryPreview() {
  previewState = 'loading';
  renderGame();
  try {
    if (!game.mystery.previewUrl) {
      const resolved = await resolvePreview(game.mystery);
      game.mystery.previewUrl = resolved.previewUrl;
      game.mystery.artworkUrl = game.mystery.artworkUrl || resolved.artworkUrl;
      cachePreviewToDeck(game.mystery);
    }
    previewState = 'ready';
  } catch {
    previewState = 'error';
  }
  saveGame();
  renderGame();
  // the mystery and the cards it will be judged against need dates to
  // separate same-year placements
  warmReleaseDate(game.mystery);
  warmTimelineDates();
  // warm the next songs while this one plays, topping the pile up first
  refillDeck().then(() => prefetchUpcoming());
}

// Resolve previews AHEAD of the draw so nobody ever faces an unavailable
// song: warm up the next few cards of the pile in the background. A card
// whose lookup definitively finds nothing is quietly retired to the discard;
// a transient failure demotes it to the bottom for another try later.
let prefetchInFlight = null;
let prefetchAgain = false;

// Warming a request that arrives mid-run used to be dropped on the floor, so
// cards added while a lookup was in progress stayed cold. Coalesce instead:
// the caller gets a promise, and one more pass runs afterwards.
function prefetchUpcoming(count = 3) {
  if (!game) return Promise.resolve();
  if (prefetchInFlight) {
    prefetchAgain = true;
    return prefetchInFlight;
  }
  prefetchInFlight = runPrefetch(count).finally(() => {
    prefetchInFlight = null;
    if (prefetchAgain) {
      prefetchAgain = false;
      prefetchUpcoming(count);
    }
  });
  return prefetchInFlight;
}

// The cards worth a lookup, nearest the draw first. A card demoted after a
// failed lookup goes to the BOTTOM of the pile, so a window over the top
// alone left it stranded — never retried and never retired, which is exactly
// the case the demotion exists to handle. Played cards are skipped: they can
// never be drawn again, so a lookup for one is a wasted request.
function prefetchTargets(count) {
  const needsWork = (c) => !c.previewUrl && !(c.plays > 0) && c !== game.mystery;
  const nearestFirst = game.drawPile.filter(needsWork).reverse();
  const retries = nearestFirst.filter((c) => c.prefetchFails > 0);
  const fresh = nearestFirst.filter((c) => !c.prefetchFails);
  // Both halves are capped: when a provider is rate-limiting, every card fails
  // transiently at once, and an unbounded retry list would answer that by
  // making even more requests.
  return [...fresh.slice(0, count), ...retries.slice(0, count)];
}

async function runPrefetch(count) {
  for (const card of prefetchTargets(count)) {
    if (!game || card.previewUrl || card === game.mystery) continue;
    try {
      const fresh = await resolvePreview(card);
      if (!game) return;
      card.previewUrl = fresh.previewUrl;
      card.artworkUrl = card.artworkUrl || fresh.artworkUrl;
      card.explicit = fresh.explicit;
      cachePreviewToDeck(card);
      warmReleaseDate(card);
    } catch (err) {
      if (!game) return;
      const at = game.drawPile.indexOf(card);
      if (at < 0) continue; // drawn while we were looking — in-turn handling owns it
      card.prefetchFails = (card.prefetchFails || 0) + 1;
      const definitiveMiss = /No preview found/.test(err.message);
      if (definitiveMiss || card.prefetchFails >= 2) {
        game.drawPile.splice(at, 1);
        game.discard.push(card); // retired: the players never see it
      } else {
        game.drawPile.splice(at, 1);
        game.drawPile.unshift(card); // bottom of the pile, retried by the next pass
      }
    }
    saveGame();
  }
  // refresh only the pile counter — a full re-render could yank buttons
  // out from under a mid-click player
  if (game && game.phase !== 'gameover') {
    $('#draw-count').textContent = `${drawableCount(game)} different-year songs available`;
  }
}

// Endless deck: when the pile runs low, discover new songs by artists already
// in the deck (Deezer artist radar), take the year from the song's album, and
// slide them into the bottom of the pile. Discoveries also join the stored
// deck so votes work on them and the deck grows with every game.
const REFILL_BELOW = 6;
const REFILL_BATCH = 5;
let refilling = false;

async function refillDeck() {
  if (!game || !game.settings.endless || refilling) return;
  if (game.phase === 'gameover' || drawableCount(game) >= REFILL_BELOW) return;
  refilling = true;
  try {
    const deck = getDeck(storage, gameDeckId);
    const knownSongs = [
      ...(deck ? deck.songs : []),
      ...game.drawPile,
      ...game.discard,
      ...(game.mystery ? [game.mystery] : []),
      ...game.players.flatMap((p) => p.timeline),
    ];
    const seen = new Set(knownSongs.map((s) => `${s.title.toLowerCase()}|${s.artist.toLowerCase()}`));
    const artists = [...new Set(knownSongs.map((s) => s.artist))];
    // Prefer discoveries inside the deck's era span, so hard draws keep
    // getting close-call candidates instead of outliers.
    const knownYears = knownSongs.map((s) => s.year).filter(Number.isInteger);
    const loYear = Math.min(...knownYears) - 10;
    const hiYear = Math.max(...knownYears) + 10;
    let spare = null; // first out-of-span find, used only if nothing fits
    let added = 0;
    // up to 6 distinct artists, in random order, until the batch is filled
    const tryArtists = artists.slice().sort(() => Math.random() - 0.5).slice(0, 6);
    for (const artist of tryArtists) {
      if (!game || added >= REFILL_BATCH) break;
      let candidates;
      try {
        candidates = await artistTopTracks(artist);
      } catch { continue; }
      for (const c of candidates) {
        if (!game || added >= REFILL_BATCH) break;
        const key = `${c.title.toLowerCase()}|${c.artist.toLowerCase()}`;
        if (seen.has(key)) continue;
        if (looksLikeAltVersion(c.title) || looksLikeCompilation(c.albumTitle)) continue;
        let year;
        try {
          year = await albumYear(c.albumId);
        } catch { continue; }
        if (!year || year < 1950) continue;
        const card = {
          title: c.title, artist: c.artist, year,
          previewUrl: c.previewUrl, artworkUrl: c.artworkUrl,
          explicit: c.explicit, auto: true,
        };
        if (year < loYear || year > hiYear) {
          if (!spare) spare = card;
          continue;
        }
        seen.add(key);
        game.drawPile.unshift(card); // bottom of the pile
        if (deck) {
          deck.songs.push({ ...card });
          saveDeck(storage, deck);
        }
        added += 1;
      }
    }
    if (added === 0 && spare && game) {
      game.drawPile.unshift(spare);
      if (deck) {
        deck.songs.push({ ...spare });
        saveDeck(storage, deck);
      }
      added = 1;
    }
    if (added && game) {
      saveGame();
      if (game.phase !== 'gameover') {
        $('#draw-count').textContent = `${drawableCount(game)} different-year songs available`;
      }
    }
  } finally {
    refilling = false;
  }
}

// Write a freshly resolved preview URL back into the stored deck so the next
// game doesn't have to look it up again.
function cachePreviewToDeck(card) {
  if (!gameDeckId) return;
  const deck = getDeck(storage, gameDeckId);
  if (!deck) return;
  const song = deck.songs.find((s) => s.title === card.title && s.artist === card.artist);
  if (song && !song.previewUrl) {
    song.previewUrl = card.previewUrl;
    song.artworkUrl = song.artworkUrl || card.artworkUrl;
    song.explicit = card.explicit;
    saveDeck(storage, deck);
  }
}

// Release dates separate songs that share a year. One lookup per song ever:
// the answer (including "no date worth trusting") is cached on the deck.
// Never awaited by the turn — a missing date just leaves the placement free.
const dateLookups = new Set();

function applyReleaseDate(card, released) {
  card.released = released;
  if (!game) return;
  for (const player of game.players) {
    for (const timelineCard of player.timeline) {
      if (timelineCard.title === card.title && timelineCard.artist === card.artist) {
        timelineCard.released = released;
      }
    }
  }
}

function warmReleaseDate(card) {
  if (!card || card.released !== undefined) return;
  const key = `${card.title}|${card.artist}`;
  if (dateLookups.has(key)) return;
  // The deck may already know: a resumed game carries its own copies of the
  // cards, and iTunes rate-limits, so never pay for an answer twice.
  const deck = gameDeckId ? getDeck(storage, gameDeckId) : null;
  const known = deck && deck.songs.find((s) => s.title === card.title && s.artist === card.artist);
  if (known && known.released !== undefined) {
    applyReleaseDate(card, known.released);
    saveGame();
    renderTimeline();
    return;
  }
  dateLookups.add(key);
  resolveReleaseDate(card)
    .then((released) => {
      // null is a real answer: store it so we don't ask again every game
      applyReleaseDate(card, released);
      saveGame();
      renderTimeline();
      const d = gameDeckId ? getDeck(storage, gameDeckId) : null;
      const song = d && d.songs.find((s) => s.title === card.title && s.artist === card.artist);
      if (!song) return;
      song.released = released;
      saveDeck(storage, d);
    })
    .catch(() => { dateLookups.delete(key); /* transient — try again later */ });
}

// The cards a placement will be judged against: the active player's timeline
// (dealt at game start, so never warmed by the draw) plus the mystery.
function warmTimelineDates() {
  if (!game) return;
  for (const p of game.players) p.timeline.forEach(warmReleaseDate);
}

function onStartTurn() {
  stopAudio();
  selectedSlot = null;
  selectedChallenger = null;
  selectedChallengeSlot = null;
  bonusAwarded = new Set();
  songVoted = { up: false, down: false };
  mysteryRetried = false;
  startTurn(game);
  saveGame();
  loadMysteryPreview();
}

function onSkip() {
  try {
    stopAudio();
    skipSong(game);
    selectedSlot = null;
    songVoted = { up: false, down: false }; // fresh song, fresh votes
    mysteryRetried = false;
    saveGame();
    loadMysteryPreview();
  } catch (err) { toast(err.message); }
}

function onFreeSkip() {
  try {
    stopAudio();
    freeSkip(game);
    selectedSlot = null;
    songVoted = { up: false, down: false };
    mysteryRetried = false;
    saveGame();
    loadMysteryPreview();
  } catch (err) { toast(err.message); }
}

function onLockPlacement() {
  if (selectedSlot == null) return;
  placeCard(game, selectedSlot);
  selectedSlot = null;
  selectedChallengeSlot = null;
  // If nobody can challenge, resolve straight away.
  const anyChallenger = game.settings.challengesEnabled
    && game.players.some((p, i) => i !== game.current && p.tokens > 0);
  if (!anyChallenger) {
    stopAudio();
    revealMystery();
  }
  saveGame();
  renderGame();
}

function onHint(kind) {
  try {
    buyHint(game, kind);
    saveGame();
    renderGame();
  } catch (err) { toast(err.message); }
}

function onConfirmChallenge() {
  if (selectedChallenger == null || selectedChallengeSlot == null) return;
  try {
    addChallenge(game, selectedChallenger, selectedChallengeSlot);
    selectedChallenger = null;
    selectedChallengeSlot = null;
    saveGame();
    renderGame();
  } catch (err) { toast(err.message); }
}

function onCancelChallenge() {
  selectedChallengeSlot = null;
  renderGame();
}

// The engine counts the reveal on the in-game card; the stored deck needs it
// too, or the rotation resets every time a game starts.
function revealMystery() {
  const card = game.mystery;
  resolveTurn(game);
  if (gameDeckId && card) markPlayed(storage, gameDeckId, card);
}

function onReveal() {
  stopAudio();
  selectedChallenger = null;
  selectedChallengeSlot = null;
  revealMystery();
  saveGame();
  renderGame();
}

function onNextTurn() {
  selectedChallenger = null;
  selectedChallengeSlot = null;
  nextTurn(game);
  saveGame();
  if (game.phase === 'gameover') showWin();
  else {
    renderGame();
    refillDeck().then(() => prefetchUpcoming());
  }
}

// ---------- win ----------

function showWin() {
  storage.removeItem(SAVE_KEY);
  const names = game.winners.map((i) => game.players[i].name);
  $('#win-title').textContent = names.length === 1
    ? `🏆 ${names[0]} wins!`
    : `🏆 It’s a tie: ${names.join(' & ')}!`;
  const wrap = clear($('#win-timelines'));
  for (const p of game.players) {
    wrap.append(el('h3', { text: `${p.name} — ${p.timeline.length} cards, ${p.tokens} tokens` }));
    const row = el('div', { class: 'timeline' });
    p.timeline.forEach((c) => row.append(timelineCardNode(c, false)));
    wrap.append(row);
  }
  showScreen('win');
  confetti();
}

function confetti() {
  const emoji = ['🎉', '🎊', '✨', '🎵', '🏆', '💃', '🕺'];
  for (let i = 0; i < 42; i++) {
    const span = el('span', {
      class: 'confetti',
      text: emoji[Math.floor(Math.random() * emoji.length)],
    });
    span.style.left = `${Math.random() * 100}vw`;
    span.style.animationDuration = `${2.2 + Math.random() * 2.5}s`;
    span.style.animationDelay = `${Math.random() * 1.2}s`;
    document.body.append(span);
    setTimeout(() => span.remove(), 6500);
  }
}

// ---------- resume ----------

function resumeGame() {
  try {
    const saved = JSON.parse(storage.getItem(SAVE_KEY));
    game = saved.engine;
    gameDeckId = saved.deckId;
    selectedSlot = null;
    selectedChallenger = null;
    selectedChallengeSlot = null;
    bonusAwarded = new Set();
    songVoted = { up: false, down: false };
    mysteryRetried = false;
    showScreen('game');
    if (game.phase === 'listening' || game.phase === 'challenge') {
      previewState = game.mystery && game.mystery.previewUrl ? 'ready' : 'idle';
      if (previewState === 'idle') loadMysteryPreview();
    }
    renderGame();
    refillDeck().then(() => prefetchUpcoming());
  } catch {
    toast('Saved game was unreadable — starting fresh.');
    storage.removeItem(SAVE_KEY);
    renderHome();
  }
}

// ---------- wiring ----------

// A saved game carries its own copies of the cards, so an era bump has to
// reach into it too or a resumed game keeps playing the versions it cached.
function clearSavedGamePreviews() {
  const raw = storage.getItem(SAVE_KEY);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw);
    const strip = (cards) => (cards || []).forEach((c) => { delete c.previewUrl; });
    const g = saved.engine || {};
    strip(g.drawPile);
    strip(g.discard);
    (g.players || []).forEach((p) => strip(p.timeline));
    if (g.mystery) delete g.mystery.previewUrl;
    storage.setItem(SAVE_KEY, JSON.stringify(saved));
  } catch { /* unreadable save — resumeGame discards it anyway */ }
}

document.addEventListener('DOMContentLoaded', () => {
  ensureSeedDecks(storage);
  if (refreshCachedPreviews(storage)) clearSavedGamePreviews();
  restoreEggs();

  document.querySelectorAll('[data-nav]').forEach((b) =>
    b.addEventListener('click', () => showScreen(b.dataset.nav)));

  $('#btn-new-game').addEventListener('click', () => showScreen('setup'));
  $('#btn-decks').addEventListener('click', () => showScreen('decks'));
  $('#btn-resume').addEventListener('click', resumeGame);

  $('#btn-create-deck').addEventListener('click', () => {
    const name = $('#new-deck-name').value.trim();
    if (!name) { toast('Give the deck a name'); return; }
    const deck = createDeck(storage, name);
    $('#new-deck-name').value = '';
    openDeckEdit(deck.id);
  });

  $('#btn-import-deck').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const deck = parseDeckImport(await file.text());
      saveDeck(storage, deck);
      toast(`Imported "${deck.name}" (${deck.songs.length} songs)`);
      renderDeckList();
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
    e.target.value = '';
  });

  $('#deck-name-input').addEventListener('change', (e) => {
    const deck = getDeck(storage, editingDeckId);
    deck.name = e.target.value.trim() || deck.name;
    saveDeck(storage, deck);
  });
  $('#btn-export-deck').addEventListener('click', () => downloadDeck(getDeck(storage, editingDeckId)));
  $('#btn-search').addEventListener('click', runSearch);
  $('#song-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
  $('#btn-clear-search').addEventListener('click', () => {
    clear($('#search-results'));
    $('#song-search').value = '';
    $('#search-status').classList.add('hidden');
    stopAudio();
  });
  $('#deck-filter').addEventListener('input', renderDeckSongs);

  // Songs are never repeated, so a well-played deck needs a deliberate way
  // back — not only the prompt that appears when a game can't start.
  $('#btn-reset-plays').addEventListener('click', () => {
    const deck = getDeck(storage, editingDeckId);
    const played = deck.songs.length - unplayedSongs(deck.songs).length;
    if (!confirm(`Bring back ${played} played song${played > 1 ? 's' : ''} in "${deck.name}"?\n\nOnly the play history clears — ratings, years and previews stay.`)) return;
    const restored = resetPlays(storage, editingDeckId);
    toast(`${restored} song${restored > 1 ? 's are' : ' is'} back in rotation`);
    renderDeckSongs();
  });

  $('#btn-add-player').addEventListener('click', () => addPlayerRow());
  $('#setup-deck').addEventListener('change', updateDeckWarning);
  $('#setup-target').addEventListener('change', updateDeckWarning);
  $('#setup-endless').addEventListener('change', updateDeckWarning);

  $('#btn-start-game').addEventListener('click', () => {
    const deck = getDeck(storage, $('#setup-deck').value);
    if (!deck) { toast('Pick a deck'); return; }
    const players = getSetupPlayers();
    if (availableSongs(deck.songs).length < players.length + 1) {
      toast(`"${deck.name}" needs at least ${players.length + 1} songs for ${players.length} players.`);
      return;
    }
    const settings = currentSetupSettings();
    saveSetup(deck.id, players, settings);
    beginGame(deck, players, settings);
  });

  $('#btn-quit').addEventListener('click', () => {
    if (confirm('End this game? The save will be deleted.')) {
      game = null;
      storage.removeItem(SAVE_KEY);
      stopAudio();
      showScreen('home');
    }
  });

  // Same group, same deck, straight back in — no setup detour.
  $('#btn-play-again').addEventListener('click', () => startWithSameGroup());
  $('#btn-win-change-deck').addEventListener('click', () => showScreen('setup'));

  // Leave the deck mid-game and pick another one, keeping the group.
  $('#btn-change-deck').addEventListener('click', () => {
    if (!confirm('Leave this deck and pick another? This game ends; your group and settings are kept.')) return;
    game = null;
    storage.removeItem(SAVE_KEY);
    stopAudio();
    showScreen('setup');
  });

  showScreen('home');
});

// Read-only-ish debug hook so the E2E smoke test can assert on real internals.
window.__hitster = {
  get game() { return game; },
  get previewState() { return previewState; },
  prefetch: (n) => prefetchUpcoming(n),
  refill: () => refillDeck(),
  viz: () => visualizerState(),
  fx: () => stageFxState(),
};

// Concise, answer-safe state for browser automation and accessibility checks.
// The mystery year stays hidden until a hint is bought or the card is revealed.
window.render_game_to_text = () => {
  const screen = [...document.querySelectorAll('[data-screen]')]
    .find((node) => !node.classList.contains('hidden'))?.dataset.screen || 'unknown';
  if (!game) return JSON.stringify({ screen, mode: 'menu' });
  const active = game.players[game.current];
  const revealed = game.phase === 'reveal' ? lastRevealCard() : null;
  return JSON.stringify({
    screen,
    mode: game.phase,
    activePlayer: active.name,
    tokens: active.tokens,
    timeline: active.timeline.map((c) => ({ year: c.year, title: c.title, artist: c.artist })),
    mystery: revealed
      ? { year: revealed.year, title: revealed.title, artist: revealed.artist }
      : {
          preview: previewState,
          // which clues were bought, never what they cost the answer
          clues: game.hintsUsed || [],
        },
    selectedSlot,
    challenges: game.challenges.map((c) => ({ player: game.players[c.player].name, slot: c.slot })),
    differentYearSongsAvailable: drawableCount(game),
  });
};
