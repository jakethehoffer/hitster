# Digital Hitster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A zero-build, single-page pass-and-play Hitster with custom song decks powered by iTunes previews.

**Architecture:** Pure game-rules engine (`engine.js`, no DOM, Node-testable) driven by a UI controller (`app.js`) over one `index.html`. Deck data lives in localStorage via `decks.js`; song search/preview resolution via JSONP in `itunes.js`.

**Tech Stack:** Vanilla ES modules, `node --test` for the engine suite, no dependencies, no bundler.

## Global Constraints

- No build step: the app must run from `file://index.html` and any static host.
- No API keys, no external JS dependencies, no frameworks.
- iTunes access via JSONP only (no fetch/XHR to itunes.apple.com — no CORS headers).
- Engine files must not touch DOM, localStorage, or timers.
- Mystery phase must never render title, artist, year, or artwork of the current card.
- Same-year ties count as correct placement on either side.

---

### Task 1: Rules engine (TDD)

**Files:**
- Create: `js/engine.js`
- Test: `test/engine.test.mjs`

**Interfaces (Produces):**
- `Card = {title, artist, year:number, previewUrl?, artworkUrl?}`
- `createGame({players: string[], deck: Card[], cardsToWin=10, startTokens=2, challengesEnabled=true, rngSeed?}) -> state`
  State: `{players:[{name, timeline:Card[], tokens}], drawPile:Card[], discard:Card[], current, phase:'idle'|'listening'|'challenge'|'reveal'|'gameover', mystery, placedSlot, challenges:[{player,slot}], outcome, winners:number[]|null, settings}`
  Each player is dealt 1 starting timeline card. Deck shuffled with seedable RNG (mulberry32).
- `startTurn(state)` idle→listening, draws `mystery`.
- `skipSong(state)` costs active player 1 token, mystery→discard, redraw. Throws if tokens=0.
- `freeSkip(state)` same but free (UI uses it for broken previews).
- `placeCard(state, slot)` listening→challenge, records `placedSlot` (slot ∈ 0..timeline.length).
- `addChallenge(state, playerIdx, slot)` validates: phase challenge, challenges enabled, not active player, has token, slot differs from placedSlot and other challenges. Spends token.
- `resolveTurn(state)` challenge→reveal. Sets `outcome = {activeCorrect, stolenBy:number|null, discarded}`. Correct active placement inserts mystery at placedSlot; else first correct challenger (challenge order) auto-inserts into their own timeline; else discard.
- `awardBonus(state, playerIdx)` +1 token, only in reveal phase.
- `nextTurn(state)` reveal→idle and advances `current`; sets phase gameover with `winners` when someone reaches cardsToWin, or when drawPile is empty at turn start time (most cards, tokens as tiebreak, co-winners possible).
- `isSlotCorrect(timeline, card, slot)` exported helper: correct iff `(slot===0 || timeline[slot-1].year <= card.year) && (slot===timeline.length || card.year <= timeline[slot].year)`.
- All illegal actions throw `Error` — UI must only offer legal moves.

**Steps:**
- [ ] Write failing tests covering: seeded shuffle determinism; deal (1 card each, correct pile size); `isSlotCorrect` boundaries (slot 0, end slot, middle, same-year tie both sides, wrong slots); skip token accounting + throw at 0 tokens; challenge validation (self, duplicate slot, placed slot, no tokens) ; resolve: active correct keeps, active wrong + correct challenger steals into challenger timeline sorted position, nobody correct discards, first-correct-challenger-wins order; awardBonus; win at cardsToWin; deck-exhaustion winner by cards then tokens.
- [ ] Run: `node --test test/` — expect all FAIL (module missing).
- [ ] Implement `js/engine.js` minimally to pass.
- [ ] Run: `node --test test/` — expect PASS.
- [ ] Commit: `feat: hitster rules engine with tests`

### Task 2: Deck + iTunes modules

**Files:**
- Create: `js/itunes.js`, `js/decks.js`, `js/seed-deck.js`
- Test: `test/decks.test.mjs`

**Interfaces:**
- Consumes: `Card` shape from Task 1.
- Produces:
  - `itunes.js`: `searchSongs(term, {limit=12}) -> Promise<Card[]>` via JSONP (`callback` param, 10s timeout, cleans up script tag + global). `resolvePreview(card) -> Promise<Card>` re-searches `"title artist"` and returns card with fresh previewUrl or throws.
  - `decks.js`: pure core (Node-testable, storage injected): `listDecks(storage)`, `getDeck(storage, id)`, `saveDeck(storage, deck)`, `deleteDeck(storage, id)`, `createDeck(storage, name)`, `exportDeck(deck) -> json string`, `parseDeckImport(jsonString) -> deck` (validates shape, throws with message on malformed), `ensureSeedDeck(storage)` installs seed deck once. Deck: `{id, name, songs: Card[]}`. Storage key prefix `hitster.deck.`, index at `hitster.deckIndex`.
  - `seed-deck.js`: `export const SEED_SONGS: Card[]` — ~36 well-known hits, 1960s–2020s, title/artist/year only (previews resolved lazily at play time via `resolvePreview`).
- [ ] Write failing tests for `parseDeckImport` (valid roundtrip via `exportDeck`; rejects: non-JSON, missing songs array, song without numeric year), `saveDeck`/`listDecks`/`deleteDeck` against a Map-backed storage stub, `ensureSeedDeck` idempotence.
- [ ] Run `node --test test/` — new tests FAIL.
- [ ] Implement modules; PASS.
- [ ] Commit: `feat: deck storage, iTunes search, starter deck`

### Task 3: UI — screens, styles, audio

**Files:**
- Create: `index.html`, `css/style.css`, `js/app.js`

**Interfaces:**
- Consumes: everything produced by Tasks 1–2.
- Produces: complete playable app. Screens as `<section data-screen=...>` toggled by `app.js`: `home` (New Game / Decks / Resume when `hitster.savedGame` exists), `decks` (list, create, import), `deck-edit` (search+add with inline preview listen, year edit, delete, export), `setup` (deck select with size warning below `players*cardsToWin+10`, 2–8 player names, cards-to-win 5/10/15, challenges toggle, start tokens), `game`, `win` (winner + confetti + final timelines + play again).
- Game screen: scoreboard strip (name, card count, token dots, active highlight); mystery panel (spinning vinyl CSS animation, play/replay button wired to a single `<audio>`, skip-with-token button, free-skip path shown only on preview load error after one `resolvePreview` retry); active player timeline with slot buttons between/around cards; challenge stage listing other players with tokens (pick player → pick distinct slot chips → lock); reveal stage (flip to artwork, title, artist, big year, outcome banner, per-player bonus-token buttons, next turn).
- Autosave: serialize engine state + deck id to `localStorage['hitster.savedGame']` after every action; Resume restores; cleared on gameover/new game. localStorage failures degrade to in-memory with a notice.
- [ ] Build the HTML/CSS/JS.
- [ ] Manual check via `npx -y serve` (or `file://`): all screens reachable, game playable end to end with starter deck.
- [ ] Commit: `feat: full pass-and-play UI`

### Task 4: Smoke test, README, sync

**Files:**
- Create: `README.md`, `test/smoke.mjs` (only if puppeteer-core + system Edge cooperate; otherwise README manual checklist)

- [ ] Headless smoke: load page via local server with puppeteer-core pointed at system Edge; fail on console errors; script a 2-player game with a stubbed `Audio`/preview to reach reveal + win screens.
- [ ] `node --test test/` full suite green.
- [ ] README: what it is, how to run, how to build your own deck (click-by-click), how to share decks, rules summary, known limits (30s previews, honor-system bonus), Cloudflare Pages deploy note.
- [ ] Commit; update `.ai-sync` handoff.

## Self-review

Spec coverage: rules→Task 1; decks/iTunes/seed→Task 2; screens/audio/autosave/error paths→Task 3; testing/docs→Task 4. Free-skip on broken preview appears in engine (`freeSkip`) and UI. Type names consistent (`Card`, `state.players[].timeline`). No placeholders; Task 3 steps are concrete element/behavior specs rather than inline code because the executor is this session with full spec context.
