import {
  createGame, startTurn, skipSong, freeSkip, placeCard, addChallenge,
  resolveTurn, awardBonus, nextTurn,
} from './engine.js';
import { searchSongs, resolvePreview, looksLikeAltVersion } from './itunes.js';
import { artistTopTracks, albumYear, looksLikeCompilation } from './deezer.js';
import {
  listDecks, getDeck, saveDeck, deleteDeck, createDeck,
  exportDeck, parseDeckImport, ensureSeedDecks,
  playableSongs, excludedCount, rateSong,
} from './decks.js';

const SAVE_KEY = 'hitster.savedGame';

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

function showScreen(name) {
  document.querySelectorAll('[data-screen]').forEach((s) =>
    s.classList.toggle('hidden', s.dataset.screen !== name));
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
      el('span', { class: 'deck-meta', text: `${deck.songs.length} songs` }),
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
  // Keep original indices: year-edit and delete address songs by position.
  const term = $('#deck-filter').value.trim().toLowerCase();
  const entries = deck.songs
    .map((song, i) => ({ song, i }))
    .filter(({ song }) => !term
      || song.title.toLowerCase().includes(term)
      || song.artist.toLowerCase().includes(term));
  $('#deck-song-count').textContent = (term
    ? `${entries.length} of ${deck.songs.length} songs match`
    : `${deck.songs.length} songs in this deck`)
    + (excluded ? ` — ${excluded} excluded by 👎` : '');
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
      el('button', {
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
      }),
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

function renderSetup() {
  const select = clear($('#setup-deck'));
  const decks = listDecks(storage);
  for (const d of decks) {
    select.append(el('option', { value: d.id, text: `${d.name} (${d.songs.length} songs)` }));
  }
  $('#btn-start-game').disabled = decks.length === 0;
  if (decks.length === 0) toast('Create a deck first');
  if ($('#player-inputs').children.length === 0) {
    playerCount = 0;
    addPlayerRow();
    addPlayerRow();
  }
  updateDeckWarning();
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
  const pool = playableSongs(deck.songs);
  const excluded = deck.songs.length - pool.length;
  const endless = $('#setup-endless').checked;
  const excludedNote = excluded
    ? ` (${excluded} disliked song${excluded > 1 ? 's' : ''} excluded — restore in the deck editor)` : '';
  if (pool.length < comfy && endless) {
    warning.textContent = `This deck starts with ${pool.length} playable songs${excludedNote} — endless refill will top it up with new songs from its artists as you play.`;
    warning.classList.remove('hidden');
  } else if (pool.length < comfy) {
    warning.textContent = `This deck has ${pool.length} playable songs${excludedNote} — comfortable for these settings is ${comfy}+. You can still play; the game ends early if songs run out (most cards wins).`;
    warning.classList.remove('hidden');
  } else if (excluded) {
    warning.textContent = `${pool.length} playable songs${excludedNote}.`;
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
  // Disliked songs sit out — unless that would leave too few to play with.
  const pool = playableSongs(deck.songs);
  const excluded = deck.songs.length - pool.length;
  const usable = pool.length >= players.length + 1 ? pool : deck.songs;
  if (excluded > 0) {
    toast(usable === pool
      ? `${excluded} disliked song${excluded > 1 ? 's are' : ' is'} sitting this game out`
      : 'Too few liked songs left — including disliked ones this game');
  }
  game = createGame({
    players,
    deck: usable.map((s) => ({ ...s })),
    cardsToWin: settings.target,
    startTokens: settings.tokens,
    challengesEnabled: settings.challenges,
    endless: settings.endless,
    rngSeed: Math.floor(Math.random() * 2 ** 31),
  });
  gameDeckId = deck.id;
  showScreen('game');
  renderGame();
  saveGame();
  refillDeck().then(() => prefetchUpcoming());
}

function renderGame() {
  if (!game) return;
  if (game.phase === 'gameover') { showWin(); return; }
  renderScoreboard();
  renderPhase();
  renderTimeline();
  $('#draw-count').textContent = `${game.drawPile.length} songs left in the pile`;
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

function renderPhase() {
  const area = clear($('#phase-area'));
  const phase = game.phase;

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
    const vinyl = el('div', { class: `vinyl${!p.paused && playingUrl ? ' spinning' : ''}` });
    area.append(vinyl);

    if (previewState === 'loading') {
      area.append(el('p', { class: 'phase-sub', text: 'Finding the song preview…' }));
      return;
    }
    if (previewState === 'error') {
      area.append(
        el('p', { class: 'notice', text: 'This song’s preview is unavailable.' }),
        el('div', { class: 'phase-controls' },
          game.drawPile.length > 0
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
      if (previewState !== 'error' && game.drawPile.length > 0) {
        controls.append(el('button', {
          class: 'btn', text: `⤳ Skip song (1 token)`,
          disabled: active.tokens < 1 ? 'true' : null,
          onclick: onSkip,
        }));
      }
      area.append(
        el('h2', { class: 'phase-title' }, el('span', { class: 'who', text: activeName() }), ' — where does it go?'),
        controls,
        el('p', { class: 'phase-sub', text: 'Tap a slot in your timeline below, then lock it in. Spacebar pauses/plays.' }));
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
          onclick: () => { selectedChallenger = selectedChallenger === i ? null : i; renderGame(); },
        }));
      }
      area.append(picker);
      if (selectedChallenger != null) {
        area.append(el('p', { class: 'phase-sub', text: `${game.players[selectedChallenger].name}: tap the slot you think is right.` }));
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
        toast(r == null ? 'Deck no longer stored — vote not saved'
          : r < 0 ? 'Cut — it sits out future games (restore in the deck editor)' : 'Noted 👎');
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

function revealCardNode(card) {
  return el('div', { class: 'reveal-card' },
    card.artworkUrl ? el('img', { src: card.artworkUrl, alt: '' }) : null,
    el('div', { class: 'reveal-year', text: String(card.year) }),
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
    const isSelected = game.phase === 'listening' && selectedSlot === slotIdx;
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
          try {
            addChallenge(game, selectedChallenger, slotIdx);
            selectedChallenger = null;
            saveGame();
            renderGame();
          } catch (err) { toast(err.message); }
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
  return el('div', { class: `timeline-card${highlight ? ' just-won' : ''}` },
    el('div', { class: 'tc-year', text: String(card.year) }),
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
  // warm the next songs while this one plays, topping the pile up first
  refillDeck().then(() => prefetchUpcoming());
}

// Resolve previews AHEAD of the draw so nobody ever faces an unavailable
// song: warm up the next few cards of the pile in the background. A card
// whose lookup definitively finds nothing is quietly retired to the discard;
// a transient failure demotes it to the bottom for another try later.
let prefetching = false;

async function prefetchUpcoming(count = 3) {
  if (!game || prefetching) return;
  prefetching = true;
  try {
    // cards are drawn from the END of drawPile
    const targets = game.drawPile.slice(-count).reverse();
    for (const card of targets) {
      if (!game || card.previewUrl || card === game.mystery) continue;
      try {
        const fresh = await resolvePreview(card);
        if (!game) return;
        card.previewUrl = fresh.previewUrl;
        card.artworkUrl = card.artworkUrl || fresh.artworkUrl;
        card.explicit = fresh.explicit;
        cachePreviewToDeck(card);
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
          game.drawPile.unshift(card); // bottom of the pile, retry later
        }
      }
      saveGame();
    }
    // refresh only the pile counter — a full re-render could yank buttons
    // out from under a mid-click player
    if (game && game.phase !== 'gameover') {
      $('#draw-count').textContent = `${game.drawPile.length} songs left in the pile`;
    }
  } finally {
    prefetching = false;
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
  if (game.phase === 'gameover' || game.drawPile.length >= REFILL_BELOW) return;
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
        seen.add(key);
        game.drawPile.unshift(card); // bottom of the pile
        if (deck) {
          deck.songs.push({ ...card });
          saveDeck(storage, deck);
        }
        added += 1;
      }
    }
    if (added && game) {
      saveGame();
      if (game.phase !== 'gameover') {
        $('#draw-count').textContent = `${game.drawPile.length} songs left in the pile`;
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

function onStartTurn() {
  stopAudio();
  selectedSlot = null;
  selectedChallenger = null;
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
  // If nobody can challenge, resolve straight away.
  const anyChallenger = game.settings.challengesEnabled
    && game.players.some((p, i) => i !== game.current && p.tokens > 0);
  if (!anyChallenger) {
    stopAudio();
    resolveTurn(game);
  }
  saveGame();
  renderGame();
}

function onReveal() {
  stopAudio();
  resolveTurn(game);
  saveGame();
  renderGame();
}

function onNextTurn() {
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

document.addEventListener('DOMContentLoaded', () => {
  ensureSeedDecks(storage);

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

  $('#btn-add-player').addEventListener('click', () => addPlayerRow());
  $('#setup-deck').addEventListener('change', updateDeckWarning);
  $('#setup-target').addEventListener('change', updateDeckWarning);
  $('#setup-endless').addEventListener('change', updateDeckWarning);

  $('#btn-start-game').addEventListener('click', () => {
    const deck = getDeck(storage, $('#setup-deck').value);
    if (!deck) { toast('Pick a deck'); return; }
    const players = getSetupPlayers();
    if (deck.songs.length < players.length + 1) {
      toast(`"${deck.name}" needs at least ${players.length + 1} songs for ${players.length} players.`);
      return;
    }
    const rawTokens = parseInt($('#setup-tokens').value, 10);
    const tokens = Number.isInteger(rawTokens) ? Math.min(20, Math.max(0, rawTokens)) : 2;
    $('#setup-tokens').value = String(tokens);
    beginGame(deck, players, {
      target: parseInt($('#setup-target').value, 10),
      tokens,
      challenges: $('#setup-challenges').checked,
      endless: $('#setup-endless').checked,
    });
  });

  $('#btn-quit').addEventListener('click', () => {
    if (confirm('End this game? The save will be deleted.')) {
      game = null;
      storage.removeItem(SAVE_KEY);
      stopAudio();
      showScreen('home');
    }
  });

  $('#btn-play-again').addEventListener('click', () => showScreen('setup'));

  showScreen('home');
});

// Read-only-ish debug hook so the E2E smoke test can assert on real internals.
window.__hitster = {
  get game() { return game; },
  prefetch: (n) => prefetchUpcoming(n),
  refill: () => refillDeck(),
};
