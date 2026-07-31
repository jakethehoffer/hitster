import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, startTurn, skipSong, freeSkip, placeCard, addChallenge,
  resolveTurn, awardBonus, nextTurn, isSlotCorrect,
} from '../js/engine.js';

const card = (year, title = `song-${year}`) => ({ title, artist: 'artist', year });

function makeDeck(n, startYear = 1960) {
  return Array.from({ length: n }, (_, i) => card(startYear + i));
}

function freshGame(overrides = {}) {
  return createGame({
    players: ['Ann', 'Ben'],
    deck: makeDeck(25),
    rngSeed: 42,
    ...overrides,
  });
}

// --- createGame ---

test('createGame deals one starting card per player and shuffles rest into drawPile', () => {
  const s = freshGame();
  assert.equal(s.players.length, 2);
  for (const p of s.players) {
    assert.equal(p.timeline.length, 1);
    assert.equal(p.tokens, 2);
  }
  assert.equal(s.drawPile.length, 23);
  assert.equal(s.phase, 'idle');
  assert.equal(s.mystery, null);
});

test('createGame is deterministic for the same seed', () => {
  const a = freshGame({ rngSeed: 7 });
  const b = freshGame({ rngSeed: 7 });
  assert.deepEqual(a.drawPile.map(c => c.year), b.drawPile.map(c => c.year));
});

test('createGame stores the endless setting (default on)', () => {
  assert.equal(freshGame().settings.endless, true);
  assert.equal(freshGame({ endless: false }).settings.endless, false);
});

test('createGame rejects bad player counts and undersized decks', () => {
  assert.throws(() => createGame({ players: ['solo'], deck: makeDeck(20) }));
  assert.throws(() => createGame({ players: Array.from({ length: 9 }, (_, i) => `p${i}`), deck: makeDeck(30) }));
  assert.throws(() => createGame({ players: ['a', 'b'], deck: makeDeck(2) }));
});

// --- isSlotCorrect ---

test('isSlotCorrect handles boundaries, middles, and wrong slots', () => {
  const tl = [card(1980), card(1990), card(2000)];
  assert.equal(isSlotCorrect(tl, card(1975), 0), true);
  assert.equal(isSlotCorrect(tl, card(1975), 1), false);
  assert.equal(isSlotCorrect(tl, card(2005), 3), true);
  assert.equal(isSlotCorrect(tl, card(2005), 0), false);
  assert.equal(isSlotCorrect(tl, card(1985), 1), true);
  assert.equal(isSlotCorrect(tl, card(1985), 2), false);
});

test('isSlotCorrect counts same-year ties as correct on either side', () => {
  const tl = [card(1980), card(1990), card(2000)];
  assert.equal(isSlotCorrect(tl, card(1990), 1), true);
  assert.equal(isSlotCorrect(tl, card(1990), 2), true);
  assert.equal(isSlotCorrect(tl, card(1990), 0), false);
  assert.equal(isSlotCorrect(tl, card(1990), 3), false);
});

// --- turn flow ---

test('startTurn draws a mystery card and enters listening', () => {
  const s = freshGame();
  startTurn(s);
  assert.equal(s.phase, 'listening');
  assert.ok(s.mystery);
  assert.equal(s.drawPile.length, 22);
  assert.throws(() => startTurn(s)); // wrong phase
});

test('skipSong costs a token, discards, and redraws; throws at zero tokens', () => {
  const s = freshGame();
  startTurn(s);
  const first = s.mystery;
  skipSong(s);
  assert.equal(s.players[0].tokens, 1);
  assert.notEqual(s.mystery, first);
  assert.ok(s.discard.includes(first));
  skipSong(s);
  assert.equal(s.players[0].tokens, 0);
  assert.throws(() => skipSong(s));
});

test('freeSkip redraws without spending a token', () => {
  const s = freshGame();
  startTurn(s);
  freeSkip(s);
  assert.equal(s.players[0].tokens, 2);
  assert.equal(s.phase, 'listening');
});

test('placeCard records the slot and opens the challenge phase', () => {
  const s = freshGame();
  startTurn(s);
  assert.throws(() => placeCard(s, 5)); // out of range: timeline has 1 card -> slots 0..1
  placeCard(s, 1);
  assert.equal(s.phase, 'challenge');
  assert.equal(s.placedSlot, 1);
});

// --- challenges ---

function challengeReady() {
  const s = freshGame();
  startTurn(s);
  placeCard(s, 0);
  return s;
}

test('addChallenge validates player, slot, and tokens', () => {
  const s = challengeReady();
  assert.throws(() => addChallenge(s, 0, 1)); // active player cannot challenge
  assert.throws(() => addChallenge(s, 1, 0)); // same slot as active
  addChallenge(s, 1, 1);
  assert.equal(s.players[1].tokens, 1);
  assert.throws(() => addChallenge(s, 1, 1)); // duplicate challenger slot
});

test('addChallenge throws when challenger has no tokens', () => {
  const s = challengeReady();
  s.players[1].tokens = 0;
  assert.throws(() => addChallenge(s, 1, 1));
});

test('addChallenge throws when challenges are disabled', () => {
  const s = freshGame({ challengesEnabled: false });
  startTurn(s);
  placeCard(s, 0);
  assert.throws(() => addChallenge(s, 1, 1));
});

// --- resolution (hand-built states for precise control) ---

function handState({ activeTimeline, challengerTimeline, mystery, placedSlot, challenges = [] }) {
  return {
    players: [
      { name: 'Ann', timeline: activeTimeline, tokens: 2 },
      { name: 'Ben', timeline: challengerTimeline, tokens: 2 },
      { name: 'Cal', timeline: [card(1970)], tokens: 2 },
    ],
    drawPile: makeDeck(5, 2100),
    discard: [],
    current: 0,
    phase: 'challenge',
    mystery,
    placedSlot,
    challenges,
    outcome: null,
    winners: null,
    settings: { cardsToWin: 10, startTokens: 2, challengesEnabled: true },
  };
}

test('resolveTurn keeps the card when the active player is correct', () => {
  const s = handState({
    activeTimeline: [card(1980), card(2000)],
    challengerTimeline: [card(1990)],
    mystery: card(1995),
    placedSlot: 1,
  });
  resolveTurn(s);
  assert.equal(s.phase, 'reveal');
  assert.equal(s.outcome.activeCorrect, true);
  assert.equal(s.outcome.stolenBy, null);
  assert.deepEqual(s.players[0].timeline.map(c => c.year), [1980, 1995, 2000]);
});

test('resolveTurn lets a correct challenger steal into their own timeline', () => {
  const s = handState({
    activeTimeline: [card(1980), card(2000)],
    challengerTimeline: [card(1990)],
    mystery: card(1995),
    placedSlot: 0, // wrong
    challenges: [{ player: 1, slot: 1 }], // correct
  });
  resolveTurn(s);
  assert.equal(s.outcome.activeCorrect, false);
  assert.equal(s.outcome.stolenBy, 1);
  assert.deepEqual(s.players[0].timeline.map(c => c.year), [1980, 2000]);
  assert.deepEqual(s.players[1].timeline.map(c => c.year), [1990, 1995]);
});

test('resolveTurn gives a contested card to the first correct challenger', () => {
  // mystery year 1990 tied with active timeline card -> two correct slots
  const s = handState({
    activeTimeline: [card(1980), card(1990), card(2000)],
    challengerTimeline: [card(1960)],
    mystery: card(1990),
    placedSlot: 0, // wrong
    challenges: [{ player: 2, slot: 1 }, { player: 1, slot: 2 }], // both correct
  });
  resolveTurn(s);
  assert.equal(s.outcome.stolenBy, 2);
  assert.equal(s.players[2].timeline.length, 2);
  assert.equal(s.players[1].timeline.length, 1);
});

test('resolveTurn discards when nobody is correct', () => {
  const s = handState({
    activeTimeline: [card(1980), card(2000)],
    challengerTimeline: [card(1990)],
    mystery: card(1995),
    placedSlot: 2, // wrong
    challenges: [{ player: 1, slot: 0 }], // also wrong
  });
  resolveTurn(s);
  assert.equal(s.outcome.discarded, true);
  assert.ok(s.discard.some(c => c.year === 1995));
  assert.equal(s.players[0].timeline.length, 2);
  assert.equal(s.players[1].timeline.length, 1);
});

// --- challenge token refunds (house rule: only lose tokens on a wrong guess) ---

test('a correct challenger gets their token back along with the steal', () => {
  const s = freshGame();
  s.players[0].timeline = [card(1980), card(2000)];
  s.players[1].timeline = [card(1990)];
  startTurn(s);
  s.mystery = card(1995);
  placeCard(s, 0); // active wrong
  addChallenge(s, 1, 2); // correct slot (1980 <= 1995 <= 2000 -> slot 1? timeline [1980,2000], 1995 fits slot 1)
  s.challenges = [{ player: 1, slot: 1 }]; // point at the correct middle slot
  assert.equal(s.players[1].tokens, 1); // token spent on the challenge
  resolveTurn(s);
  assert.equal(s.outcome.stolenBy, 1);
  assert.deepEqual(s.outcome.refunded, [1]);
  assert.equal(s.players[1].tokens, 2); // refunded — net zero for a right guess
});

test('a wrong challenger loses the token', () => {
  const s = freshGame();
  s.players[0].timeline = [card(1980), card(2000)];
  startTurn(s);
  s.mystery = card(1995);
  placeCard(s, 1); // active correct
  addChallenge(s, 1, 0); // wrong slot
  resolveTurn(s);
  assert.equal(s.outcome.activeCorrect, true);
  assert.deepEqual(s.outcome.refunded, []);
  assert.equal(s.players[1].tokens, 1); // spent, not returned
});

test('tie years: a failed steal loses the token even if the slot was technically valid', () => {
  const s = freshGame();
  s.players[0].timeline = [card(1980), card(1990), card(2000)];
  startTurn(s);
  s.mystery = card(1990); // slots 1 AND 2 both correct
  placeCard(s, 1);
  addChallenge(s, 1, 2);
  resolveTurn(s);
  assert.equal(s.outcome.activeCorrect, true);
  assert.equal(s.outcome.stolenBy, null);
  assert.deepEqual(s.outcome.refunded, []); // no steal happened -> no refund
  assert.equal(s.players[1].tokens, 1);
});

test('mixed challengers: only the successful stealer keeps their token', () => {
  const s = createGame({ players: ['A', 'B', 'C'], deck: makeDeck(25), rngSeed: 5 });
  s.players[0].timeline = [card(1980), card(2000)];
  startTurn(s);
  s.mystery = card(1995);
  placeCard(s, 0); // wrong
  addChallenge(s, 1, 2); // wrong (after 2000)
  addChallenge(s, 2, 1); // correct
  resolveTurn(s);
  assert.equal(s.outcome.stolenBy, 2);
  assert.deepEqual(s.outcome.refunded, [2]);
  assert.equal(s.players[1].tokens, 1); // lost
  assert.equal(s.players[2].tokens, 2); // refunded
});

test('two correct challengers: first steals and is refunded, second loses the token', () => {
  const s = createGame({ players: ['A', 'B', 'C'], deck: makeDeck(25), rngSeed: 5 });
  s.players[0].timeline = [card(1980), card(1990), card(2000)];
  startTurn(s);
  s.mystery = card(1990);
  placeCard(s, 0); // wrong
  addChallenge(s, 2, 1); // correct, first in order
  addChallenge(s, 1, 2); // also correct, second
  resolveTurn(s);
  assert.equal(s.outcome.stolenBy, 2);
  assert.deepEqual(s.outcome.refunded, [2]);
  assert.equal(s.players[2].tokens, 2); // stole -> token back
  assert.equal(s.players[1].tokens, 1); // right slot, no steal -> token gone
});

// --- bonus tokens ---

test('awardBonus adds a token only during reveal', () => {
  const s = freshGame();
  assert.throws(() => awardBonus(s, 1));
  startTurn(s);
  placeCard(s, 0);
  resolveTurn(s);
  awardBonus(s, 1);
  assert.equal(s.players[1].tokens, 3);
});

// --- nextTurn, wins, exhaustion ---

test('nextTurn advances and wraps the active player', () => {
  const s = freshGame();
  startTurn(s); placeCard(s, 0); resolveTurn(s); nextTurn(s);
  assert.equal(s.current, 1);
  assert.equal(s.phase, 'idle');
  startTurn(s); placeCard(s, 0); resolveTurn(s); nextTurn(s);
  assert.equal(s.current, 0);
});

test('nextTurn declares a winner at cardsToWin', () => {
  const s = freshGame({ cardsToWin: 2 });
  // force a guaranteed-correct placement
  s.players[0].timeline = [card(1970)];
  startTurn(s);
  s.mystery = card(1990);
  placeCard(s, 1);
  resolveTurn(s);
  nextTurn(s);
  assert.equal(s.phase, 'gameover');
  assert.deepEqual(s.winners, [0]);
});

test('deck exhaustion picks most cards, then most tokens, allowing co-winners', () => {
  const s = freshGame();
  startTurn(s); placeCard(s, 0); resolveTurn(s);
  s.drawPile = [];
  s.players[0].timeline = [card(1970), card(1980)];
  s.players[1].timeline = [card(1975), card(1985)];
  s.players[0].tokens = 1;
  s.players[1].tokens = 3;
  nextTurn(s);
  assert.equal(s.phase, 'gameover');
  assert.deepEqual(s.winners, [1]); // tied cards, Ben has more tokens

  const t = freshGame();
  startTurn(t); placeCard(t, 0); resolveTurn(t);
  t.drawPile = [];
  t.players[0].timeline = [card(1970)];
  t.players[1].timeline = [card(1975)];
  t.players[0].tokens = 2;
  t.players[1].tokens = 2;
  nextTurn(t);
  assert.deepEqual(t.winners, [0, 1]); // full tie -> co-winners
});
