// Pure Hitster rules engine. No DOM, no storage, no timers.
// All mutators validate phase/inputs and throw on illegal actions;
// the UI only offers legal moves, so a throw signals a bug.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function createGame({
  players,
  deck,
  cardsToWin = 10,
  startTokens = 2,
  challengesEnabled = true,
  endless = true,
  hardDraws = true,
  rngSeed = 1,
}) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 8) {
    throw new Error('Need 2-8 players');
  }
  if (!Array.isArray(deck) || deck.length < players.length + 1) {
    throw new Error('Deck too small for this player count');
  }
  if (new Set(deck.map((card) => card.year)).size < 2) {
    throw new Error('Deck needs songs from at least 2 different years');
  }
  const rng = mulberry32(rngSeed);
  const drawPile = shuffled(deck, rng);
  const baseCard = drawPile.pop();
  baseCard.plays = (baseCard.plays || 0) + 1;
  const playerStates = players.map((name) => ({
    name,
    timeline: [{ ...baseCard }],
    tokens: startTokens,
  }));
  return {
    players: playerStates,
    drawPile,
    discard: [],
    current: 0,
    phase: 'idle',
    mystery: null,
    placedSlot: null,
    challenges: [],
    outcome: null,
    hintUsed: false,
    winners: null,
    settings: { cardsToWin, startTokens, challengesEnabled, endless, hardDraws },
    rngState: rngSeed + 1,
  };
}

// Serializable PRNG step (same mulberry32 core) so hard draws stay random
// but survive save/resume.
function nextRand(state) {
  let a = (state.rngState ?? 1) >>> 0;
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  state.rngState = a;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Hard draws: never hand the player an obvious placement. Cards are scored by
// distance from the nearest year in the player's timeline; the draw comes
// randomly from the close-call pool (within hardWindow years), or from the
// few least-obvious cards available when nothing is that close.
export function pickHardIndex(drawPile, timeline, rand, { hardWindow = 7, poolMin = 3, indices = null } = {}) {
  const years = timeline.map((c) => c.year);
  const from = indices || drawPile.map((_, i) => i);
  const scored = from
    .map((i) => ({ i, d: Math.min(...years.map((t) => Math.abs(drawPile[i].year - t))) }))
    .sort((a, b) => a.d - b.d);
  let pool = scored.filter((s) => s.d <= hardWindow);
  if (pool.length === 0) {
    // nothing close in the pile: settle for the least-obvious few
    pool = scored.slice(0, Math.min(poolMin, scored.length));
  }
  return pool[Math.floor(rand * pool.length)].i;
}

// A deck outlives the game it was shuffled for, so cards carry how many times
// they've been revealed. A song that has been heard is spent: it is never
// dealt again, in this game or any later one. Played cards may still sit in a
// pile (a game saved before this rule, or a deck loaded mid-rotation), so the
// pile's length is not the number of cards actually available. A second song
// from a year already on the active timeline is also ineligible for that turn.
function drawableIndices(drawPile, timeline = []) {
  const timelineYears = new Set(timeline.map((c) => c.year));
  return drawPile.reduce((acc, c, i) => (
    c.plays > 0 || timelineYears.has(c.year) ? acc : (acc.push(i), acc)
  ), []);
}

export function drawableCount(state, playerIdx = state.current) {
  return drawableIndices(state.drawPile, state.players[playerIdx].timeline).length;
}

function drawCard(state) {
  const drawable = drawableIndices(
    state.drawPile,
    state.players[state.current].timeline,
  );
  if (state.settings.hardDraws) {
    const idx = pickHardIndex(
      state.drawPile,
      state.players[state.current].timeline,
      nextRand(state),
      { indices: drawable },
    );
    return state.drawPile.splice(idx, 1)[0];
  }
  // Still a top-of-pile draw — the shuffle supplies the randomness — but
  // reaching past cards the group has already heard.
  return state.drawPile.splice(drawable[drawable.length - 1], 1)[0];
}

function requirePhase(state, phase) {
  if (state.phase !== phase) {
    throw new Error(`Expected phase ${phase}, got ${state.phase}`);
  }
}

// Ordering is by year, and within a year by release date when both cards
// carry one. A missing date can't be judged, so those pairs stay a tie and
// either side counts — the same rule the game had before dates existed.
// Returns -1, 0 or 1 for "a before b", "can't separate them", "a after b".
export function compareCards(a, b) {
  if (a.year !== b.year) return a.year < b.year ? -1 : 1;
  if (!a.released || !b.released) return 0;
  if (a.released === b.released) return 0;
  return a.released < b.released ? -1 : 1;
}

export function isSlotCorrect(timeline, card, slot) {
  const leftOk = slot === 0 || compareCards(timeline[slot - 1], card) <= 0;
  const rightOk = slot === timeline.length || compareCards(card, timeline[slot]) <= 0;
  return leftOk && rightOk;
}

export function insertIntoTimeline(timeline, card) {
  let i = 0;
  while (i < timeline.length && compareCards(timeline[i], card) <= 0) i++;
  timeline.splice(i, 0, card);
}

export function startTurn(state) {
  requirePhase(state, 'idle');
  if (drawableCount(state) === 0) throw new Error('Draw pile empty: no songs from a new year left');
  state.mystery = drawCard(state);
  state.hintUsed = false;
  state.placedSlot = null;
  state.challenges = [];
  state.outcome = null;
  state.phase = 'listening';
}

function redraw(state) {
  requirePhase(state, 'listening');
  if (drawableCount(state) === 0) throw new Error('Draw pile empty: no songs from a new year left');
  state.discard.push(state.mystery);
  state.mystery = drawCard(state);
  state.hintUsed = false;
}

export function skipSong(state) {
  requirePhase(state, 'listening');
  const active = state.players[state.current];
  if (active.tokens < 1) throw new Error('No tokens to skip');
  redraw(state);
  active.tokens -= 1;
}

export function freeSkip(state) {
  redraw(state);
}

export function buyHint(state) {
  requirePhase(state, 'listening');
  const active = state.players[state.current];
  if (active.tokens < 1) throw new Error('No tokens for a hint');
  if (state.hintUsed) throw new Error('Hint already used for this song');
  active.tokens -= 1;
  state.hintUsed = true;
}

export function placeCard(state, slot) {
  requirePhase(state, 'listening');
  const timeline = state.players[state.current].timeline;
  if (!Number.isInteger(slot) || slot < 0 || slot > timeline.length) {
    throw new Error(`Slot ${slot} out of range`);
  }
  state.placedSlot = slot;
  state.phase = 'challenge';
}

export function addChallenge(state, playerIdx, slot) {
  requirePhase(state, 'challenge');
  if (!state.settings.challengesEnabled) throw new Error('Challenges disabled');
  if (playerIdx === state.current) throw new Error('Active player cannot challenge');
  const challenger = state.players[playerIdx];
  if (!challenger) throw new Error(`No player ${playerIdx}`);
  if (challenger.tokens < 1) throw new Error('No tokens to challenge');
  const timeline = state.players[state.current].timeline;
  if (!Number.isInteger(slot) || slot < 0 || slot > timeline.length) {
    throw new Error(`Slot ${slot} out of range`);
  }
  if (slot === state.placedSlot || state.challenges.some((c) => c.slot === slot)) {
    throw new Error('Slot already claimed');
  }
  if (state.challenges.some((c) => c.player === playerIdx)) {
    throw new Error('Player already challenged');
  }
  challenger.tokens -= 1;
  state.challenges.push({ player: playerIdx, slot });
}

export function resolveTurn(state) {
  requirePhase(state, 'challenge');
  const active = state.players[state.current];
  const card = state.mystery;
  // Judge everything against the timeline BEFORE the card is inserted —
  // insertion shifts slot indices.
  card.plays = (card.plays || 0) + 1; // heard and answered: don't lead with it next game
  const activeCorrect = isSlotCorrect(active.timeline, card, state.placedSlot);
  const judged = state.challenges.map((c) => ({
    ...c,
    correct: isSlotCorrect(active.timeline, card, c.slot),
  }));
  let stolenBy = null;
  let discarded = false;

  if (activeCorrect) {
    active.timeline.splice(state.placedSlot, 0, card);
  } else {
    const winner = judged.find((c) => c.correct);
    if (winner) {
      stolenBy = winner.player;
      insertIntoTimeline(state.players[winner.player].timeline, card);
    } else {
      discarded = true;
      state.discard.push(card);
    }
  }
  // House rule: only a SUCCESSFUL steal keeps its token. Every failed
  // challenge (wrong slot, or right slot without winning the card) pays.
  const refunded = stolenBy != null ? [stolenBy] : [];
  if (stolenBy != null) state.players[stolenBy].tokens += 1;
  state.outcome = { activeCorrect, stolenBy, discarded, refunded };
  state.phase = 'reveal';
}

export function awardBonus(state, playerIdx) {
  requirePhase(state, 'reveal');
  const player = state.players[playerIdx];
  if (!player) throw new Error(`No player ${playerIdx}`);
  player.tokens += 1;
}

function exhaustionWinners(state) {
  const most = Math.max(...state.players.map((p) => p.timeline.length));
  const leaders = state.players
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.timeline.length === most);
  const mostTokens = Math.max(...leaders.map(({ p }) => p.tokens));
  return leaders.filter(({ p }) => p.tokens === mostTokens).map(({ i }) => i);
}

export function nextTurn(state) {
  requirePhase(state, 'reveal');
  const target = state.settings.cardsToWin;
  const winners = state.players
    .map((p, i) => (p.timeline.length >= target ? i : -1))
    .filter((i) => i >= 0);
  if (winners.length > 0) {
    state.winners = winners;
    state.phase = 'gameover';
    return;
  }
  // A late-game pile can be unusable for one timeline but valid for another.
  // Pass over players who have every remaining year instead of violating the
  // no-repeat-year rule or ending a game somebody can still play.
  let nextPlayer = null;
  for (let offset = 1; offset <= state.players.length; offset++) {
    const candidate = (state.current + offset) % state.players.length;
    if (drawableCount(state, candidate) > 0) {
      nextPlayer = candidate;
      break;
    }
  }
  if (nextPlayer == null) {
    state.winners = exhaustionWinners(state);
    state.phase = 'gameover';
    return;
  }
  state.mystery = null;
  state.placedSlot = null;
  state.challenges = [];
  state.outcome = null;
  state.hintUsed = false;
  state.current = nextPlayer;
  state.phase = 'idle';
}
