# AI Sync Handoff

Use this for concise handoff notes between Codex and Claude Code.

## 2026-07-28T22:05:55.0042371-04:00 - claude

Summary: Built digital Hitster v1 from scratch: pass-and-play music timeline game with custom decks. Pure-JS rules engine (challenges/steals, tokens, ties, exhaustion), deck builder with live iTunes search (JSONP, no keys), 38-song starter deck, autosave/resume, dark party UI. Zero dependencies at runtime, no build step.
Files changed: index.html, css/style.css, js/{engine,app,itunes,decks,seed-deck}.js, test/{engine.test,decks.test,smoke}.mjs, package.json, README.md, docs/superpowers/{specs,plans}/*
Tests run: npm test: 26/26 pass (engine+decks). npm run smoke: headless Edge E2E full game to win screen incl. challenge UI, zero console errors. Live iTunes JSONP verified in-browser (Africa/Toto 1982 with preview+art).
Blockers: none
Next steps: Jake builds real decks via the deck builder; optional: create GitHub remote and push; optional: deploy to Cloudflare Pages for zero-setup access; possible v2: networked multiplayer via Durable Objects (engine is transport-agnostic)

## 2026-07-28T22:18:33.3583942-04:00 - claude

Summary: Published the game: created public GitHub repo jakethehoffer/hitster, pushed all commits, enabled GitHub Pages (master root, .nojekyll). Live at https://jakethehoffer.github.io/hitster/ - verified in production.
Files changed: .nojekyll, README.md (live URL)
Tests run: Prod verify via headless Edge against the live URL: HTTP 200, seed deck auto-installs, 2p game starts, LIVE iTunes preview resolution works from prod origin, placement+challenge phase reached, zero console errors; screenshot visually checked. npm test 26/26 still green.
Blockers: none
Next steps: Jake: open the live URL, build real decks, play. Optional: custom domain; Cloudflare Pages if repo should go private (needs interactive wrangler login); v2 networked multiplayer

## 2026-07-28T22:48:58.8337655-04:00 - claude

Summary: Fixed wrong-version previews (scored iTunes matcher; Espresso bug), added Rap & Hip-Hop (42 songs) and Pop Through the Decades (43 songs) built-in decks with legacy-flag migration, added like/dislike voting on reveal that persists ratings to the deck and excludes net-disliked songs from future games (restorable in deck editor), plus per-song preview re-fetch button. Deployed and verified in production.
Files changed: js/{itunes,seed-deck,decks,app}.js, css/style.css, test/{itunes.test,decks.test,smoke}.mjs, package.json, README.md
Tests run: npm test 35/35; npm run smoke full E2E green incl. dislike persistence + restore; live matcher check picks original Espresso from real iTunes results; prod verify: 3 decks on fresh browser, rap deck live preview resolved, vote row present, zero console errors
Blockers: none
Next steps: Jake: hit the ↻ button on Espresso in his browser's starter deck to purge the cached wrong preview; rap+pop decks auto-install on his next visit. Possible later: per-player vote weighting, genre deck for country/rock

## 2026-07-28T23:52:15.9533518-04:00 - claude

Summary: UX fix after Jake could not find the preview-refresh button: search results for songs already in the deck now show a 'Use this preview' button (points the deck copy at that exact version), the in-deck button is labeled 'Fix preview', and search results have a Clear button. Deployed to GitHub Pages.
Files changed: index.html, js/app.js, README.md
Tests run: npm test 35/35; npm run smoke green; live browser test: in-deck Espresso row shows Use-this-preview while alternates show +Add, click persists previewUrl+artwork, Clear empties results; prod build built and serving new app.js
Blockers: none
Next steps: Jake: search espresso in the starter deck editor and click 'Use this preview' on the plain Espresso row

## 2026-07-29T00:00:25.6340105-04:00 - claude

Summary: Explicit previews + custom token field: discovered Apple Search API now serves only clean/censored tracks (even WAP), so preview audio resolves Deezer-first (explicit originals preferred via scoreMatch bonus) with iTunes fallback; new js/deezer.js + shared js/jsonp.js; added songs auto-upgrade previews in background; E badges; starting tokens is a clamped 0-20 number input. Deployed and prod-verified.
Files changed: index.html, js/{jsonp,deezer,itunes,app,decks}.js, css/style.css, test/{deezer.test,itunes.test,decks.test,smoke}.mjs, package.json, README.md
Tests run: npm test 40/40; smoke green incl. typed token count -> scoreboard dots; live: HUMBLE./In da Club/Espresso resolve explicit=true with previews; prod: tokens number field + deezer module served, In da Club resolves explicit from deployed origin
Blockers: none
Next steps: Jake: use Fix preview on any already-cached songs to upgrade them to explicit; genre decks resolve explicit automatically on first play

## 2026-07-29T00:09:31.0527349-04:00 - claude

Summary: House rule: challenge tokens only lost on wrong guesses. resolveTurn judges all challenges against the pre-insertion timeline, refunds correct challengers (incl. tie-year case where active also correct), outcome.refunded lists them, reveal screen names them, challenge label updated. Skips still cost a token. Deployed.
Files changed: js/engine.js, js/app.js, test/engine.test.mjs, README.md, docs spec
Tests run: npm test 44/44 (4 new refund tests: steal+refund, wrong loses, tie refund, mixed challengers); smoke green; prod serving refund engine
Blockers: none
Next steps: none pending — play it

## 2026-07-29T00:18:11.9390343-04:00 - claude

Summary: Playback + rating UX: true pause/resume (position kept) with spacebar toggle during turns; vote row now in listening/challenge phases so songs can be rated before lock-in (votes reset per song incl. skips); deck editor rows have direct thumbs up/down for retroactive votes. Deployed.
Files changed: js/app.js, test/smoke.mjs, README.md
Tests run: npm test 44/44; smoke green with new steps: spacebar press, pre-lock dislike persists, both dislikes excluded then restored, editor thumbs-down excludes; prod serving spacebar handler + bumpRating
Blockers: none
Next steps: Jake: Decks -> Rap & Hip-Hop -> Edit -> thumbs-down Fight the Power

## 2026-07-29T10:16:08.2893281-04:00 - claude

Summary: Deck editor: live in-deck filter box (title/artist substring, original indices preserved so year-edit/delete stay correct, empty-state message, match count); iTunes add-box relabeled. Deployed.
Files changed: index.html, js/app.js, test/smoke.mjs, README.md
Tests run: npm test 44/44; smoke green incl. new step: filter narrows 24->1, year edit while filtered lands on the right song, clearing restores 24 rows; prod serving deck-filter input
Blockers: none
Next steps: none pending

## 2026-07-30T19:52:38.8067787-04:00 - claude

Summary: Steal-or-pay rule (only successful steals refund the token), free skip whenever preview audio fails (retry once with fresh lookup, purge stale cached URL, hide paid skip), 3 new decks (Rock Anthems 50, R&B & Soul 45, Throwbacks 42) + starter/rap/pop expanded to 61 each with versioned top-up that preserves user ratings/edits and respects deletions. Deployed and prod-verified.
Files changed: js/{engine,app,decks,seed-deck}.js, test/{engine.test,decks.test,smoke}.mjs, README.md, docs spec
Tests run: npm test 46/46; smoke green; live seed sample 8/8 resolve previews; prod: fresh install = 6 decks with correct sizes, simulated old install tops rap 1->61 keeping rating -1, deletions stay deleted, no dupes
Blockers: none
Next steps: Jake refreshes: gets 3 new decks + ~60 new songs across existing decks, ratings intact

## 2026-07-31T02:12:04.0913631-04:00 - claude

Summary: Preview reliability overhaul: previews for upcoming pile cards resolve in background (prefetchUpcoming, called on game start/resume/next-turn/mystery-load); definitive lookup misses retire the card to discard unseen, transient failures demote to pile bottom for retry; counter-only UI refresh to avoid yanking mid-click renders; window.__hitster debug hook for E2E. Root cause was draw-time lazy resolution. Deployed.
Files changed: js/app.js, test/smoke.mjs, README.md
Tests run: npm test 46/46; smoke green incl. live assertion that a gibberish song is retired from the pile before draw; prod serving prefetch code
Blockers: none
Next steps: none pending

## 2026-07-31T02:27:49.9978434-04:00 - claude

Summary: Endless decks: when the pile drops below 6, refillDeck discovers up to 5 songs by artists already in the deck (Deezer artist search + album-year lookup, alt-cut/compilation filters), adds them to pile bottom AND the stored deck (votes work, decks grow each game), tagged as new discovery at reveal. Setup toggle default on; exhaustion rules remain offline fallback. Also fixed: Deezer error payloads (rate-limit quota) now throw instead of reading as empty - a quota blip could previously retire a real song via prefetch. Deployed.
Files changed: js/{engine,app,deezer,itunes}.js, index.html, test/{engine.test,deezer.test,smoke}.mjs, README.md, docs spec
Tests run: npm test 48/48; smoke green incl. live refill assertion (Dua Lipa artist radar grows pile+stored deck with real years, quota-retry hardened); prod serving endless toggle + refill code
Blockers: none
Next steps: none pending

## 2026-07-31T08:58:24.6759281-04:00 - claude

Summary: Hard draws: engine scores pile cards by distance from the active player's timeline years and draws among close calls (<=7yr; closest 3 fallback) using a serializable PRNG (rngState in game state, survives save/resume). Setup toggle default on; off = plain pop. Endless refill now prefers in-era discoveries (span +/-10yr, one out-of-span spare as fallback) so hard candidates keep flowing. Deployed.
Files changed: js/engine.js, js/app.js, index.html, test/engine.test.mjs, README.md, docs spec
Tests run: npm test 53/53 (5 new hard-draw tests written failing-first incl. pool-widening bug caught red); smoke green end-to-end with hard draws on by default; prod serving setup-hard toggle + pickHardIndex
Blockers: none
Next steps: none pending

## 2026-08-01T22:20:58.7313048-04:00 - claude

Summary: Wrong-version previews fixed: Deezer field-scoped lookup (free text buried the canonical single), alien-qualifier penalty for asides the deck title didn't ask for, weighted markers (karaoke/commentary 12 vs alt-cut 5, whole-word matched so Alive is not live), whole-act artist comparison (cover band 'Tonight i'm Taylor Swift' rejected, 'Ms. Lauryn Hill' still matches 'Lauryn Hill'), rank tiebreak, iTunes consulted when Deezer's best is only an alt cut. Preview era bump clears cached wrong URLs from decks + saved game. Deployed and prod-verified.
Files changed: js/{itunes,deezer,decks,app}.js, test/{itunes,deezer,decks}.test.mjs, test/smoke.mjs, README.md
Tests run: npm test 64/64 (13 new, written failing-first); npm run smoke green; live resolve of all 320 songs across 6 decks - 0 failures, remaining flags all correct recordings; in-browser puppeteer check of era bump + JSONP resolution; prod serving new code
Blockers: none
Next steps: Jake refreshes the page once: cached remixes are dropped and re-resolve to the originals on next play. Two findings not acted on: prefetchUpcoming() silently no-ops while a run is in flight (awaiting callers get nothing done); smoke game length is randomly seeded so deck-size assertions were flaky - main game now runs with endless off.
