import {
  createGame, startTurn, skipSong, freeSkip, placeCard, addChallenge,
  resolveTurn, awardBonus, nextTurn,
} from './engine.js';
import { searchSongs, resolvePreview } from './itunes.js';
import {
  listDecks, getDeck, saveDeck, deleteDeck, createDeck,
  exportDeck, parseDeckImport, ensureSeedDeck,
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
  if (playingUrl === url && !p.paused) {
    stopAudio();
    return;
  }
  stopAudio();
  p.src = url;
  p.play().catch(() => toast('Could not play preview'));
  playingUrl = url;
  if (btn) { btn.classList.add('playing'); btn.textContent = '⏸'; }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('player').addEventListener('ended', () => {
    stopAudio();
    if (game && (game.phase === 'listening' || game.phase === 'challenge')) renderPhase();
  });
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

function openDeckEdit(id) {
  editingDeckId = id;
  const deck = getDeck(storage, id);
  $('#deck-name-input').value = deck.name;
  clear($('#search-results'));
  $('#song-search').value = '';
  $('#search-status').classList.add('hidden');
  showScreen('deck-edit');
  renderDeckSongs();
}

function renderDeckSongs() {
  const deck = getDeck(storage, editingDeckId);
  $('#deck-song-count').textContent = `${deck.songs.length} songs in this deck`;
  const list = clear($('#deck-songs'));
  deck.songs.forEach((song, i) => {
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
        el('div', { class: 'song-title', text: song.title }),
        el('div', { class: 'song-artist', text: song.artist })),
      song.previewUrl
        ? el('button', { class: 'btn btn-small listen-btn', text: '▶', onclick: (e) => toggleListen(song.previewUrl, e.target) })
        : null,
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
    const list = $('#search-results');
    for (const card of results) {
      list.append(el('li', { class: 'song-item' },
        card.artworkUrl ? el('img', { src: card.artworkUrl, alt: '' }) : null,
        el('div', { class: 'song-text' },
          el('div', { class: 'song-title', text: card.title }),
          el('div', { class: 'song-artist', text: card.artist })),
        el('span', { class: 'song-year', text: String(card.year ?? '?') }),
        el('button', { class: 'btn btn-small listen-btn', text: '▶', onclick: (e) => toggleListen(card.previewUrl, e.target) }),
        el('button', {
          class: 'btn btn-primary btn-small', text: '+ Add',
          onclick: () => {
            if (!Number.isInteger(card.year)) {
              toast('This result has no release year — pick another version');
              return;
            }
            const d = getDeck(storage, editingDeckId);
            if (d.songs.some((s) => s.title === card.title && s.artist === card.artist)) {
              toast('Already in this deck');
              return;
            }
            d.songs.push({ ...card });
            saveDeck(storage, d);
            toast(`Added "${card.title}" (${card.year}) — edit the year if that's a re-release date`);
            renderDeckSongs();
          },
        })));
    }
  } catch (err) {
    status.textContent = `Search failed (${err.message}) — check your connection and retry.`;
    status.classList.remove('hidden');
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
  if (deck.songs.length < comfy) {
    warning.textContent = `This deck has ${deck.songs.length} songs — comfortable for these settings is ${comfy}+. You can still play; the game ends early if songs run out (most cards wins).`;
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
  game = createGame({
    players,
    deck: deck.songs.map((s) => ({ ...s })),
    cardsToWin: settings.target,
    startTokens: settings.tokens,
    challengesEnabled: settings.challenges,
    rngSeed: Math.floor(Math.random() * 2 ** 31),
  });
  gameDeckId = deck.id;
  showScreen('game');
  renderGame();
  saveGame();
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
      if (game.drawPile.length > 0) {
        controls.append(el('button', {
          class: 'btn', text: `⤳ Skip song (1 token)`,
          disabled: active.tokens < 1 ? 'true' : null,
          onclick: onSkip,
        }));
      }
      area.append(
        el('h2', { class: 'phase-title' }, el('span', { class: 'who', text: activeName() }), ' — where does it go?'),
        controls,
        el('p', { class: 'phase-sub', text: 'Tap a slot in your timeline below, then lock it in.' }));
      if (selectedSlot != null) {
        area.append(el('div', { class: 'phase-controls' },
          el('button', { class: 'btn btn-primary btn-big', text: '🔒 Lock it in', onclick: onLockPlacement })));
      }
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
        el('span', { class: 'phase-sub', text: 'Challenge (1 token): ' }));
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
    area.append(el('div', { class: 'phase-controls' },
      el('button', { class: 'btn btn-primary btn-big', text: '✨ Reveal!', onclick: onReveal })));
    return;
  }

  if (phase === 'reveal') {
    const card = revealCardNode(lastRevealCard());
    area.append(card);
    const o = game.outcome;
    if (o.activeCorrect) {
      area.append(el('p', { class: 'outcome good', text: `✔ ${activeName()} nailed it — card claimed!` }));
    } else if (o.stolenBy != null) {
      area.append(el('p', { class: 'outcome steal', text: `⚡ Stolen by ${game.players[o.stolenBy].name}!` }));
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
    area.append(bonus,
      el('div', { class: 'phase-controls' },
        el('button', { class: 'btn btn-primary btn-big', text: 'Next turn →', onclick: onNextTurn })));
  }
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
    saveDeck(storage, deck);
  }
}

function onStartTurn() {
  stopAudio();
  selectedSlot = null;
  selectedChallenger = null;
  bonusAwarded = new Set();
  startTurn(game);
  saveGame();
  loadMysteryPreview();
}

function onSkip() {
  try {
    stopAudio();
    skipSong(game);
    selectedSlot = null;
    saveGame();
    loadMysteryPreview();
  } catch (err) { toast(err.message); }
}

function onFreeSkip() {
  try {
    stopAudio();
    freeSkip(game);
    selectedSlot = null;
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
  else renderGame();
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
    showScreen('game');
    if (game.phase === 'listening' || game.phase === 'challenge') {
      previewState = game.mystery && game.mystery.previewUrl ? 'ready' : 'idle';
      if (previewState === 'idle') loadMysteryPreview();
    }
    renderGame();
  } catch {
    toast('Saved game was unreadable — starting fresh.');
    storage.removeItem(SAVE_KEY);
    renderHome();
  }
}

// ---------- wiring ----------

document.addEventListener('DOMContentLoaded', () => {
  ensureSeedDeck(storage);

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

  $('#btn-add-player').addEventListener('click', () => addPlayerRow());
  $('#setup-deck').addEventListener('change', updateDeckWarning);
  $('#setup-target').addEventListener('change', updateDeckWarning);

  $('#btn-start-game').addEventListener('click', () => {
    const deck = getDeck(storage, $('#setup-deck').value);
    if (!deck) { toast('Pick a deck'); return; }
    const players = getSetupPlayers();
    if (deck.songs.length < players.length + 1) {
      toast(`"${deck.name}" needs at least ${players.length + 1} songs for ${players.length} players.`);
      return;
    }
    beginGame(deck, players, {
      target: parseInt($('#setup-target').value, 10),
      tokens: parseInt($('#setup-tokens').value, 10),
      challenges: $('#setup-challenges').checked,
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
