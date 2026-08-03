import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame, startTurn, skipSong, freeSkip, placeCard, addChallenge,
  resolveTurn, awardBonus, nextTurn, isSlotCorrect, pickHardIndex, insertIntoTimeline, drawableCount, buyHint,
  slotPossible, possibleSlots,
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

test('createGame gives every player the same shared starting song', () => {
  const s = freshGame();
  const baseCard = s.players[0].timeline[0];
  assert.equal(s.players.length, 2);
  for (const p of s.players) {
    assert.equal(p.timeline.length, 1);
    assert.deepEqual(p.timeline[0], baseCard);
    assert.equal(p.tokens, 2);
  }
  assert.equal(baseCard.plays, 1);
  assert.equal(s.drawPile.length, 24);
  assert.equal(s.phase, 'idle');
  assert.equal(s.mystery, null);
});

test('the shared starting song is never dealt as a mystery', () => {
  const s = freshGame({ hardDraws: false });
  const baseTitle = s.players[0].timeline[0].title;
  const mysteryTitles = [];

  while (drawableCount(s) > 0) {
    startTurn(s);
    mysteryTitles.push(s.mystery.title);
    // Isolate drawing behavior so every drawable card can be inspected without
    // ending the game through normal turn resolution.
    s.phase = 'idle';
    s.mystery = null;
  }

  assert.equal(mysteryTitles.length, 24);
  assert.ok(!mysteryTitles.includes(baseTitle));
});

test('each player receives an independent clone of the shared starting song', () => {
  const s = freshGame();
  const annBase = s.players[0].timeline[0];
  const benBase = s.players[1].timeline[0];

  assert.notStrictEqual(annBase, benBase);
  annBase.title = 'changed for Ann';
  assert.notEqual(benBase.title, annBase.title);
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
  assert.throws(() => createGame({
    players: ['a', 'b'],
    deck: [card(2000, 'a'), card(2000, 'b'), card(2000, 'c')],
  }), /different years/i);
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

// --- dead slots between consecutive years ---

test('slotPossible closes the gap between consecutive years and keeps the ends open', () => {
  const tl = [card(2005), card(2006), card(2010)];
  assert.equal(slotPossible(tl, 0), true, 'before the first card is always open');
  assert.equal(slotPossible(tl, 1), false, '2005-2006 has no year between them');
  assert.equal(slotPossible(tl, 2), true, '2006-2010 has room');
  assert.equal(slotPossible(tl, 3), true, 'after the last card is always open');
  assert.deepEqual(possibleSlots(tl), [0, 2, 3]);
  // two cards of the same year (a steal can do this) are just as closed
  assert.equal(slotPossible([card(1999), card(1999)], 1), false);
  // a single-card timeline has both ends and nothing to close
  assert.deepEqual(possibleSlots([card(1990)]), [0, 1]);
});

// The rule only holds if a real draw can never need one of those slots — a card
// that fits between consecutive years cannot exist, so this must never fire.
test('no drawable card is ever correct in a slot the game hides', () => {
  const tl = [card(1980), card(1981), card(1990), card(1991)];
  const onTimeline = new Set(tl.map((c) => c.year));
  for (let year = 1975; year <= 1996; year++) {
    if (onTimeline.has(year)) continue; // never dealt: the year is already down
    for (let slot = 0; slot <= tl.length; slot++) {
      if (slotPossible(tl, slot)) continue;
      assert.equal(isSlotCorrect(tl, card(year), slot), false,
        `${year} was correct in hidden slot ${slot}`);
    }
  }
});

test('placeCard and addChallenge refuse a slot between consecutive years', () => {
  const s = freshGame();
  s.players[0].timeline = [card(2005), card(2006)];
  startTurn(s);
  s.mystery = card(2001);
  assert.throws(() => placeCard(s, 1), /consecutive years/);
  placeCard(s, 0);
  assert.throws(() => addChallenge(s, 1, 1), /consecutive years/);
});

test('isSlotCorrect counts same-year ties as correct on either side', () => {
  const tl = [card(1980), card(1990), card(2000)];
  assert.equal(isSlotCorrect(tl, card(1990), 1), true);
  assert.equal(isSlotCorrect(tl, card(1990), 2), true);
  assert.equal(isSlotCorrect(tl, card(1990), 0), false);
  assert.equal(isSlotCorrect(tl, card(1990), 3), false);
});

// --- hard draws: nothing is ever an obvious pick ---

test('pickHardIndex only picks years close to the timeline when close ones exist', () => {
  const pile = [card(1950), card(1998), card(2003), card(1970)];
  const tl = [card(2000)];
  for (const r of [0, 0.3, 0.6, 0.99]) {
    const idx = pickHardIndex(pile, tl, r);
    assert.ok([1998, 2003].includes(pile[idx].year), `picked ${pile[idx].year}`);
  }
});

test('pickHardIndex falls back to the least-obvious cards when nothing is close', () => {
  const pile = [card(1925), card(1950), card(1960), card(1930)];
  const tl = [card(2000)];
  for (const r of [0, 0.5, 0.99]) {
    const y = pile[pickHardIndex(pile, tl, r)].year;
    assert.ok([1930, 1950, 1960].includes(y), `picked ${y}`); // 1925 is the most obvious
  }
});

test('startTurn draws a non-obvious card when hardDraws is on (default)', () => {
  const s = freshGame();
  s.players[0].timeline = [card(2000)];
  s.drawPile = [card(1950), card(1999), card(2004), card(1965)];
  startTurn(s);
  assert.ok([1999, 2004].includes(s.mystery.year), `drew ${s.mystery.year}`);
  assert.equal(s.drawPile.length, 3);
});

test('skip redraws also avoid obvious picks under hardDraws', () => {
  const s = freshGame();
  s.players[0].timeline = [card(2000)];
  s.drawPile = [card(1950), card(1999), card(2004), card(1965)];
  startTurn(s);
  skipSong(s);
  assert.ok([1999, 2004].includes(s.mystery.year), `redrew ${s.mystery.year}`);
});

test('hardDraws off restores plain top-of-pile draws', () => {
  const s = freshGame({ hardDraws: false });
  const top = s.drawPile[s.drawPile.length - 1];
  startTurn(s);
  assert.equal(s.mystery, top);
});

// --- turn flow ---

test('startTurn draws a mystery card and enters listening', () => {
  const s = freshGame();
  startTurn(s);
  assert.equal(s.phase, 'listening');
  assert.ok(s.mystery);
  assert.equal(s.drawPile.length, 23);
  assert.throws(() => startTurn(s)); // wrong phase
});

test('hard draws exclude an exact timeline-year match even though it is closest', () => {
  const s = freshGame({ hardDraws: true });
  s.players[0].timeline = [card(2000)];
  s.drawPile = [card(1980), card(1997), card(2000, 'blocked-exact-match')];
  startTurn(s);
  assert.equal(s.mystery.year, 1997);
  assert.ok(s.drawPile.some((c) => c.title === 'blocked-exact-match'));
});

test('draws and redraws never use a year already on the active timeline', () => {
  const s = freshGame({ hardDraws: false });
  s.players[0].timeline = [card(1990), card(2000)];
  s.drawPile = [card(1980), card(1990, 'same-1990'), card(2010), card(2000, 'same-2000')];
  startTurn(s);
  assert.equal(s.mystery.year, 2010, 'plain top-of-pile draw must pass the blocked 2000 card');
  freeSkip(s);
  assert.equal(s.mystery.year, 1980, 'redraw must pass the remaining blocked 1990 card');
  assert.deepEqual(s.drawPile.map((c) => c.year), [1990, 2000]);
  assert.equal(drawableCount(s), 0);
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

test('each clue costs one token, is sold once per song, and resets on redraw', () => {
  const s = freshGame();
  startTurn(s);
  buyHint(s, 'title');
  assert.equal(s.players[0].tokens, 1);
  assert.deepEqual(s.hintsUsed, ['title']);
  assert.throws(() => buyHint(s, 'title'), /already/i);
  // a different angle on the same song is a separate purchase
  buyHint(s, 'artist');
  assert.deepEqual(s.hintsUsed, ['title', 'artist']);
  assert.equal(s.players[0].tokens, 0);
  assert.throws(() => buyHint(s, 'cover'), /No tokens/i);
  freeSkip(s);
  assert.deepEqual(s.hintsUsed, []);
});

test('buyHint refuses a clue the game does not sell — including the year', () => {
  const s = freshGame();
  startTurn(s);
  assert.throws(() => buyHint(s, 'year'), /Unknown hint/i);
  assert.throws(() => buyHint(s, 'decade'), /Unknown hint/i);
  assert.equal(s.players[0].tokens, 2, 'a refused clue costs nothing');
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

test('nextTurn skips a player when every remaining song repeats their timeline years', () => {
  const s = createGame({ players: ['A', 'B', 'C'], deck: makeDeck(10), rngSeed: 3 });
  startTurn(s); placeCard(s, 0); resolveTurn(s);
  s.players[1].timeline = [card(1990)];
  s.players[2].timeline = [card(1980)];
  s.drawPile = [card(1990)];
  nextTurn(s);
  assert.equal(s.phase, 'idle');
  assert.equal(s.current, 2, 'B cannot use 1990, so play passes to C');
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

// --- song rotation across games ---

test('draws prefer songs nobody has heard yet', () => {
  const s = freshGame({ hardDraws: false });
  s.drawPile = [
    { ...card(1970), plays: 2 },
    { ...card(1980), plays: 0 },
    { ...card(1990), plays: 1 },
  ];
  startTurn(s);
  assert.equal(s.mystery.year, 1980, 'the unplayed song should come out first');
});

test('freshness outranks hard-draw closeness', () => {
  const s = freshGame({ hardDraws: true });
  s.players[s.current].timeline = [card(1985)];
  s.drawPile = [
    { ...card(1984), plays: 3 }, // closest, but everyone has heard it
    { ...card(1950), plays: 0 },
  ];
  startTurn(s);
  assert.equal(s.mystery.year, 1950);
});

test('hard draws still apply among the unheard songs', () => {
  const s = freshGame({ hardDraws: true });
  s.players[s.current].timeline = [card(1985)];
  s.drawPile = [card(1950), card(1984), card(2020)];
  startTurn(s);
  assert.equal(s.mystery.year, 1984, 'closest call among what is left to hear');
});

test('hard draws never reach for a played song to get a closer call', () => {
  const s = freshGame({ hardDraws: true });
  s.players[s.current].timeline = [card(1985)];
  s.drawPile = [{ ...card(1984), plays: 1 }, card(1950)];
  startTurn(s);
  assert.equal(s.mystery.year, 1950, 'the closer song is spent, so it stays out');
});

test('resolveTurn counts the revealed song as played', () => {
  const s = freshGame();
  startTurn(s);
  const revealed = s.mystery;
  assert.equal(revealed.plays ?? 0, 0);
  placeCard(s, 0);
  resolveTurn(s);
  assert.equal(revealed.plays, 1);
});

test('a skipped song is not counted as played', () => {
  const s = freshGame();
  startTurn(s);
  const skipped = s.mystery;
  skipSong(s);
  assert.equal(skipped.plays ?? 0, 0, 'never revealed, so it stays fresh');
});

// --- same-year ordering ---

const dated = (year, released, title = `song-${released}`) =>
  ({ title, artist: 'artist', year, released });

test('a same-year card must land on the correct side when both dates are known', () => {
  const timeline = [dated(2015, '2015-11-20', 'Hello')];
  const earlier = dated(2015, '2015-03-01', 'Uptown');
  const later = dated(2015, '2015-12-24', 'Sorry');
  assert.equal(isSlotCorrect(timeline, earlier, 0), true, 'March goes before November');
  assert.equal(isSlotCorrect(timeline, earlier, 1), false);
  assert.equal(isSlotCorrect(timeline, later, 1), true, 'December goes after November');
  assert.equal(isSlotCorrect(timeline, later, 0), false);
});

test('without a date on either card, any same-year slot still counts', () => {
  const timeline = [card(2015, 'known')];
  const undatedCard = card(2015, 'mystery');
  assert.equal(isSlotCorrect(timeline, undatedCard, 0), true);
  assert.equal(isSlotCorrect(timeline, undatedCard, 1), true);
  // one side dated and the other not is still a coin flip, so allow both
  const half = [dated(2015, '2015-06-01', 'dated')];
  assert.equal(isSlotCorrect(half, undatedCard, 0), true);
  assert.equal(isSlotCorrect(half, undatedCard, 1), true);
});

test('identical release dates accept either side', () => {
  const timeline = [dated(2015, '2015-06-01', 'a')];
  const same = dated(2015, '2015-06-01', 'b');
  assert.equal(isSlotCorrect(timeline, same, 0), true);
  assert.equal(isSlotCorrect(timeline, same, 1), true);
});

test('different years ignore dates entirely', () => {
  const timeline = [dated(2015, '2015-11-20'), dated(2017, '2017-01-05')];
  assert.equal(isSlotCorrect(timeline, dated(2016, '2016-07-07'), 1), true);
  assert.equal(isSlotCorrect(timeline, dated(2016, '2016-07-07'), 0), false);
});

test('a stolen card is inserted in date order within its year', () => {
  const timeline = [dated(2015, '2015-01-01', 'jan'), dated(2015, '2015-12-01', 'dec')];
  insertIntoTimeline(timeline, dated(2015, '2015-06-01', 'jun'));
  assert.deepEqual(timeline.map((c) => c.title), ['jan', 'jun', 'dec']);
});

// --- songs are never recycled ---

const played = (year, n = 1) => ({ ...card(year), plays: n });

test('drawableCount counts only songs nobody has heard', () => {
  const s = freshGame();
  s.drawPile = [played(1970), card(1980), played(1990, 3), card(2000)];
  assert.equal(drawableCount(s), 2);
  s.drawPile = [played(1970), played(1990)];
  assert.equal(drawableCount(s), 0);
});

test('a song that has been played is never drawn again', () => {
  const s = freshGame({ hardDraws: false });
  s.drawPile = [played(1970), card(1980), played(1990)];
  startTurn(s);
  assert.equal(s.mystery.year, 1980);
  // the two played songs remain in the pile but are not drawable
  assert.equal(s.drawPile.length, 2);
  assert.equal(drawableCount(s), 0);
});

test('a pile of only played songs counts as empty for drawing', () => {
  const s = freshGame();
  s.drawPile = [played(1970), played(1990)];
  assert.throws(() => startTurn(s), /empty/i);
});

test('the game ends by exhaustion when only played songs are left', () => {
  const s = freshGame({ cardsToWin: 99, hardDraws: false });
  s.drawPile = [played(1970), card(1980), played(1990)];
  startTurn(s);
  placeCard(s, 0);
  resolveTurn(s);
  nextTurn(s);
  assert.equal(s.phase, 'gameover', 'no unheard songs left, so the game is over');
  assert.ok(Array.isArray(s.winners));
});

test('skipping needs an unheard song to move to', () => {
  const s = freshGame({ hardDraws: false });
  s.drawPile = [played(1970), card(1980)];
  startTurn(s);
  assert.equal(s.mystery.year, 1980);
  assert.throws(() => freeSkip(s), /empty/i, 'nothing unheard to skip to');
});
