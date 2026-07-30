# Digital Hitster — Design Spec

**Date:** 2026-07-28
**Status:** Approved (auto-approved per autonomy defaults; user may revise)

## Goal

A digital version of Hitster, the music timeline party game, playable by Jake and
friends on one shared screen, with custom song decks matching their music taste
instead of the base game's cards.

## Core decisions

| Decision | Choice | Why |
|---|---|---|
| Play model | Pass-and-play, single shared screen | Hitster is an in-person party game; no backend needed; works over Discord screen share for remote friends |
| Music source | iTunes Search API (JSONP) + 30-sec preview clips | No API key, no login, no Spotify Premium; supplies title, artist, release date, preview audio, artwork in one call |
| Custom songs | Built-in deck builder + JSON import/export + localStorage | "Swap the songs" is the headline requirement, so decks are data, not code |
| Rules | Base Hitster (timeline placement, tokens, challenges) | Familiar; configurable win target |
| Tech | Vanilla HTML/CSS/JS ES modules, zero build step | Runs from `index.html` directly or any static host; engine is a pure module testable in Node |

Rejected alternatives: Spotify Web Playback SDK (full songs, but every host needs
Premium + OAuth app registration); YouTube embeds (titles/video spoil the answer,
ToS-awkward to hide); Jackbox-style networked multiplayer (real value, but 5-10x
scope — possible later on Cloudflare Durable Objects without changing the engine).

## Game rules (v1)

- 2–8 players (a "player" can be a team). Each starts with 1 card revealed in
  their timeline and 2 tokens (configurable).
- On your turn: a mystery song plays (title/artist/year hidden; artwork hidden).
  Place it into your own timeline — for a timeline of *n* cards there are *n+1*
  slots. Replay the 30-sec preview freely.
- **Skip:** the active player may spend 1 token to discard the mystery song and
  draw a new one.
- **Challenge (optional, default on):** after the active player locks a slot,
  any other player may spend 1 token to claim a *different* slot in the active
  player's timeline. Multiple challengers allowed; each must pick a distinct slot.
  House rule (2026-07-30, supersedes 07-29): only a SUCCESSFUL steal returns
  its token. Every failed challenge pays — wrong slot, a valid slot when the
  active player was also correct (tie years), or a correct slot beaten by an
  earlier challenger.
- **Reveal:** placement is correct if the song's year fits between its neighbors,
  inclusive on ties (equal years are correct on either side).
  - Active player correct → card joins their timeline at that spot.
  - Active player wrong → first challenger (in challenge order) whose slot is
    correct steals the card; it auto-inserts into *the challenger's* timeline.
  - Nobody correct → card is discarded.
- **Bonus tokens:** at reveal, award a token to any player(s) the group agrees
  named the artist *and* title (honor system — tap their name).
- **Win:** first player to reach the win target (default 10 cards, configurable
  5/10/15). If the deck runs out first, most cards wins; ties broken by tokens.
- Game state autosaves to localStorage; refresh resumes the game.

## Decks

- Deck = named list of `{ title, artist, year, previewUrl, artworkUrl }`.
- Deck builder: search box → iTunes results (title, artist, year, artwork, listen
  button) → tap to add. Year is editable after adding, because iTunes reports
  remaster/compilation dates for some results (verified: "Take On Me (MTV
  Unplugged)" reports 2017).
- Decks persist in localStorage; export/import as a JSON file so friends can
  share decks.
- If a stored `previewUrl` goes stale (previews are CDN links), the game
  re-resolves it at play time via a fresh iTunes search and re-caches.
- Ships with a ~36-song starter deck spanning the 1960s–2020s as demo content;
  the expectation is Jake's group builds their own decks.
- A game warns at setup if the selected deck is smaller than a comfortable
  minimum (players x win target + 10) but allows playing anyway.

## Architecture

```
index.html          single page, all screens as sections
css/style.css       dark party aesthetic, big type, TV-readable
js/engine.js        pure game rules (no DOM) — importable from Node for tests
js/itunes.js        JSONP search + preview re-resolution
js/decks.js         deck CRUD, localStorage, import/export, seed deck loading
js/seed-deck.js     starter deck data (title/artist/year only; previews resolved lazily)
js/app.js           UI controller: screens, rendering, audio, event wiring
test/engine.test.mjs  Node test suite for the engine
```

**Engine interface** (pure functions over a state object; `app.js` owns the only
instance and persists it):

- `createGame({players, deck, cardsToWin, startTokens, challengesEnabled, seed})`
  → state. Deck is shuffled with a seedable RNG; each player is dealt 1 starting
  card (auto-revealed).
- `startTurn(state)` → draws the mystery card, phase `listening`.
- `skipSong(state)` → active player pays 1 token, redraws. Errors if no tokens.
- `placeCard(state, slot)` → tentative placement, phase `challenge` (or straight
  to resolution if challenges disabled / nobody can challenge).
- `addChallenge(state, playerIdx, slot)` → validates distinct slot, spends token.
- `resolveTurn(state)` → reveal outcome `{activeCorrect, stolenBy, discarded}`,
  inserts card into the right timeline, phase `reveal`.
- `awardBonus(state, playerIdx)` → +1 token.
- `nextTurn(state)` → advance player, or phase `gameover` with `winner`.

All mutations validate phase and inputs and throw on illegal actions; the UI only
offers legal actions, so a throw is a bug signal, not a user-facing path.

**Audio:** one `<audio>` element; play/replay buttons (user gesture satisfies
autoplay policy). Mystery phase shows a spinning-record animation, never
artwork/title. Errors loading a preview surface a "song unavailable — skip for
free" path.

**iTunes access is JSONP** (script-tag injection with callback), because the API
does not send CORS headers reliably; JSONP also works from `file://`. Preview
audio and artwork load fine cross-origin in `<audio>`/`<img>`.

## Error handling

- iTunes search failure/timeout (10s): inline "search failed, retry" message.
- Preview 404/stale: auto re-resolve once via search; if still failing, free skip.
- localStorage full/unavailable: game still runs in memory; saving disabled with
  a visible notice.
- Malformed deck JSON on import: rejected with a clear message; storage untouched.

## Testing

- Engine: Node test suite (`node --test`) covering placement correctness incl.
  same-year ties, slot boundaries (ends of timeline), challenge validation and
  steal resolution order, token accounting, skip, deck exhaustion, win detection.
- Live API: shape of iTunes response verified at build time (done) and guarded
  defensively at runtime.
- UI: headless smoke test via puppeteer-core + system Edge if available (page
  loads, no console errors, a scripted game reaches reveal); otherwise manual
  checklist in README.

## Out of scope (v1)

Networked multiplayer, Spotify integration, full-length songs, verified
artist/title guessing (stays honor system), mobile-app packaging, deployment
(runs locally; Cloudflare Pages is a documented follow-up if wanted).
