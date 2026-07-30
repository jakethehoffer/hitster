# AI Sync State

Project: hitster
Root: C:\Users\14jak\GitHub\hitster
Created: 2026-07-28T21:24:34.3845104-04:00

## Current Goal
- Keep this section updated with the active project objective.

## Latest Decisions
- Record durable decisions that future agents should not rediscover.

## Active Tasks
- Track in-progress tasks, owners when useful, and status.

## Changed Files
- List files changed recently and why.

## Commands And Tests
- Record meaningful commands/tests run and their outcomes.

## Blockers
- Record blockers, missing credentials, failing services, or unanswered questions.

## Next Steps
- Keep this actionable for the next Codex or Claude session.

## Handoff Notes
- Short agent-to-agent notes belong here or in .ai-sync/handoff.md.

## Activity Log
<!-- ai-sync appends compact updates below this line. -->
### 2026-07-28T22:05:55.0042371-04:00 - claude - handoff
- summary: Built digital Hitster v1 from scratch: pass-and-play music timeline game with custom decks. Pure-JS rules engine (challenges/steals, tokens, ties, exhaustion), deck builder with live iTunes search (JSONP, no keys), 38-song starter deck, autosave/resume, dark party UI. Zero dependencies at runtime, no build step.
- files changed: index.html, css/style.css, js/{engine,app,itunes,decks,seed-deck}.js, test/{engine.test,decks.test,smoke}.mjs, package.json, README.md, docs/superpowers/{specs,plans}/*
- tests run: npm test: 26/26 pass (engine+decks). npm run smoke: headless Edge E2E full game to win screen incl. challenge UI, zero console errors. Live iTunes JSONP verified in-browser (Africa/Toto 1982 with preview+art).
- blockers: none
- next steps: Jake builds real decks via the deck builder; optional: create GitHub remote and push; optional: deploy to Cloudflare Pages for zero-setup access; possible v2: networked multiplayer via Durable Objects (engine is transport-agnostic)

### 2026-07-28T22:18:33.3583942-04:00 - claude - handoff
- summary: Published the game: created public GitHub repo jakethehoffer/hitster, pushed all commits, enabled GitHub Pages (master root, .nojekyll). Live at https://jakethehoffer.github.io/hitster/ - verified in production.
- files changed: .nojekyll, README.md (live URL)
- tests run: Prod verify via headless Edge against the live URL: HTTP 200, seed deck auto-installs, 2p game starts, LIVE iTunes preview resolution works from prod origin, placement+challenge phase reached, zero console errors; screenshot visually checked. npm test 26/26 still green.
- blockers: none
- next steps: Jake: open the live URL, build real decks, play. Optional: custom domain; Cloudflare Pages if repo should go private (needs interactive wrangler login); v2 networked multiplayer

### 2026-07-28T22:48:58.8337655-04:00 - claude - handoff
- summary: Fixed wrong-version previews (scored iTunes matcher; Espresso bug), added Rap & Hip-Hop (42 songs) and Pop Through the Decades (43 songs) built-in decks with legacy-flag migration, added like/dislike voting on reveal that persists ratings to the deck and excludes net-disliked songs from future games (restorable in deck editor), plus per-song preview re-fetch button. Deployed and verified in production.
- files changed: js/{itunes,seed-deck,decks,app}.js, css/style.css, test/{itunes.test,decks.test,smoke}.mjs, package.json, README.md
- tests run: npm test 35/35; npm run smoke full E2E green incl. dislike persistence + restore; live matcher check picks original Espresso from real iTunes results; prod verify: 3 decks on fresh browser, rap deck live preview resolved, vote row present, zero console errors
- blockers: none
- next steps: Jake: hit the ↻ button on Espresso in his browser's starter deck to purge the cached wrong preview; rap+pop decks auto-install on his next visit. Possible later: per-player vote weighting, genre deck for country/rock

### 2026-07-28T23:52:15.9533518-04:00 - claude - handoff
- summary: UX fix after Jake could not find the preview-refresh button: search results for songs already in the deck now show a 'Use this preview' button (points the deck copy at that exact version), the in-deck button is labeled 'Fix preview', and search results have a Clear button. Deployed to GitHub Pages.
- files changed: index.html, js/app.js, README.md
- tests run: npm test 35/35; npm run smoke green; live browser test: in-deck Espresso row shows Use-this-preview while alternates show +Add, click persists previewUrl+artwork, Clear empties results; prod build built and serving new app.js
- blockers: none
- next steps: Jake: search espresso in the starter deck editor and click 'Use this preview' on the plain Espresso row

### 2026-07-29T00:00:25.6340105-04:00 - claude - handoff
- summary: Explicit previews + custom token field: discovered Apple Search API now serves only clean/censored tracks (even WAP), so preview audio resolves Deezer-first (explicit originals preferred via scoreMatch bonus) with iTunes fallback; new js/deezer.js + shared js/jsonp.js; added songs auto-upgrade previews in background; E badges; starting tokens is a clamped 0-20 number input. Deployed and prod-verified.
- files changed: index.html, js/{jsonp,deezer,itunes,app,decks}.js, css/style.css, test/{deezer.test,itunes.test,decks.test,smoke}.mjs, package.json, README.md
- tests run: npm test 40/40; smoke green incl. typed token count -> scoreboard dots; live: HUMBLE./In da Club/Espresso resolve explicit=true with previews; prod: tokens number field + deezer module served, In da Club resolves explicit from deployed origin
- blockers: none
- next steps: Jake: use Fix preview on any already-cached songs to upgrade them to explicit; genre decks resolve explicit automatically on first play

### 2026-07-29T00:09:31.0527349-04:00 - claude - handoff
- summary: House rule: challenge tokens only lost on wrong guesses. resolveTurn judges all challenges against the pre-insertion timeline, refunds correct challengers (incl. tie-year case where active also correct), outcome.refunded lists them, reveal screen names them, challenge label updated. Skips still cost a token. Deployed.
- files changed: js/engine.js, js/app.js, test/engine.test.mjs, README.md, docs spec
- tests run: npm test 44/44 (4 new refund tests: steal+refund, wrong loses, tie refund, mixed challengers); smoke green; prod serving refund engine
- blockers: none
- next steps: none pending — play it

### 2026-07-29T00:18:11.9390343-04:00 - claude - handoff
- summary: Playback + rating UX: true pause/resume (position kept) with spacebar toggle during turns; vote row now in listening/challenge phases so songs can be rated before lock-in (votes reset per song incl. skips); deck editor rows have direct thumbs up/down for retroactive votes. Deployed.
- files changed: js/app.js, test/smoke.mjs, README.md
- tests run: npm test 44/44; smoke green with new steps: spacebar press, pre-lock dislike persists, both dislikes excluded then restored, editor thumbs-down excludes; prod serving spacebar handler + bumpRating
- blockers: none
- next steps: Jake: Decks -> Rap & Hip-Hop -> Edit -> thumbs-down Fight the Power

### 2026-07-29T10:16:08.2893281-04:00 - claude - handoff
- summary: Deck editor: live in-deck filter box (title/artist substring, original indices preserved so year-edit/delete stay correct, empty-state message, match count); iTunes add-box relabeled. Deployed.
- files changed: index.html, js/app.js, test/smoke.mjs, README.md
- tests run: npm test 44/44; smoke green incl. new step: filter narrows 24->1, year edit while filtered lands on the right song, clearing restores 24 rows; prod serving deck-filter input
- blockers: none
- next steps: none pending

### 2026-07-30T19:52:38.8067787-04:00 - claude - handoff
- summary: Steal-or-pay rule (only successful steals refund the token), free skip whenever preview audio fails (retry once with fresh lookup, purge stale cached URL, hide paid skip), 3 new decks (Rock Anthems 50, R&B & Soul 45, Throwbacks 42) + starter/rap/pop expanded to 61 each with versioned top-up that preserves user ratings/edits and respects deletions. Deployed and prod-verified.
- files changed: js/{engine,app,decks,seed-deck}.js, test/{engine.test,decks.test,smoke}.mjs, README.md, docs spec
- tests run: npm test 46/46; smoke green; live seed sample 8/8 resolve previews; prod: fresh install = 6 decks with correct sizes, simulated old install tops rap 1->61 keeping rating -1, deletions stay deleted, no dupes
- blockers: none
- next steps: Jake refreshes: gets 3 new decks + ~60 new songs across existing decks, ratings intact
