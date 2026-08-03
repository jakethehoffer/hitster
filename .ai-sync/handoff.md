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

## 2026-08-01T23:26:14.3349523-04:00 - claude

Summary: Song rotation across games: each deck song carries a plays count (incremented in resolveTurn, persisted via markPlayed); drawCard filters the pile to the least-played cards, then applies hard-draw scoring within that set. Preferring at draw time (not filtering the game pool) means the full deck stays in the pile, so rotation can never shorten a game, and it self-recycles once everything is level. Skipped songs are not counted (never revealed). Deployed and prod-verified.
Files changed: js/engine.js, js/decks.js, js/app.js, test/engine.test.mjs, test/decks.test.mjs, test/smoke.mjs, README.md
Tests run: npm test 71/71 (7 new, failing-first); smoke: all steps pass incl. new 'revealed songs counted against stored deck' step - console-error gate currently trips on iTunes 403s from IP rate-limiting, and the prior commit fails identically, so not a regression; 5-game UI-driven E2E asserted the least-played invariant at all 66 draws (games 1+2 zero overlap, wrap crossed in game 3, final spread 24 songs x2 / 6 songs x3)
Blockers: iTunes (itunes.apple.com) is 403-ing this IP after heavy test traffic today; retry smoke later for a fully clean run
Next steps: Optional follow-ups, not built: show play counts in the deck editor, and a 'reset rotation' control. Still open from earlier: prefetchUpcoming() silently no-ops while a run is in flight.

## 2026-08-02T00:39:45.9724144-04:00 - claude

Summary: Two fixes. (1) Impostor recordings: 'Hello' played a 153s 'HELLO' track credited to Adele that won on the +2 explicit bonus; explicit moved out of the score into the tiebreak behind Deezer rank. Re-sweeping all decks with a popularity/duration oracle (the old title-shape check missed same-titled impostors) found 4 more: off-title results scoring on artist alone (Physical -> Hopelessly Devoted to You) now disqualified; titles compared punctuation-insensitively (Sugar Sugar, Sugar Pie Honey Bunch); non-Latin scripts kept in title compare and foreign-script qualifiers not charged as alt cuts (California Love, Gangnam Style); trailing-tag billings accepted for multi-word names (Soulja Boy Tell'em) but not one-word (Queen/Queen Esther); stylised names folded (Ke$ha, P!nk, Beyonce). Preview era bumped to 3. (2) Same-year ordering: cards carry a release date, compareCards orders same-year songs by it, unknown dates stay a tie (both sides accepted). Dates from iTunes, trusted only when the year matches the curated year; cached on the deck incl. null, read back on resume so iTunes is never asked twice. Reveal shows day+month. Deployed and prod-verified.
Files changed: js/itunes.js, js/engine.js, js/app.js, js/decks.js, css/style.css, test/{itunes,engine,decks}.test.mjs, README.md
Tests run: npm test 85/85 (13 new across both fixes, all failing-first); npm run smoke green; all 320 songs re-swept live with 0 failures and no genuine mispicks; in-browser JSONP check (Hello -> real 25 single, Physical -> correct remaster); UI-driven same-year ordering check (later song accepted after / rejected before, undated pair accepts both sides, reveal shows '20 Nov'); date coverage measured on throwbacks deck: 81% dated, 16/32 same-year pairs orderable
Blockers: none; itunes.apple.com intermittently 403s this IP under heavy test traffic - space out live sweeps
Next steps: Jake refreshes once: era-3 bump re-resolves cached previews, and dates fill in during play. Still open, not built: prefetchUpcoming() silently no-ops while a run is in flight; deck editor could show play counts and a reset-rotation control.

## 2026-08-02T14:45:09.4946109-04:00 - claude

Summary: Songs are never recycled + cutting a song is a free skip. Engine: drawableIndices/drawableCount replace the least-played rotation - a card with plays>0 is never dealt again, and pile length no longer gates draw/skip/exhaustion (matters for games saved before the change, whose piles hold played cards). beginGame builds the pool from unplayedSongs only; when too few unheard songs remain it offers resetPlays (clears play history only - ratings, years, previews, released dates untouched) and does nothing if declined. Setup warning now counts unheard songs. Vote row: 'Cut it' during the listening phase records the -1 rating AND performs freeSkip (no token), reloading the preview; at reveal it behaves as before. Deployed and prod-verified.
Files changed: js/engine.js, js/decks.js, js/app.js, test/{engine,decks}.test.mjs, test/smoke.mjs, README.md
Tests run: npm test 92/92 (9 new, failing-first; 2 old rotation tests replaced because they asserted the now-forbidden recycling); npm run smoke green incl. new assertion 'cut skips to a new song without spending a token'; browser run playing a 24-song deck to exhaustion: 22 songs over 2 games all distinct, 0 repeats, 3rd game refused to start when reset declined and started when accepted
Blockers: none; itunes.apple.com 403/429s this IP after repeated smoke runs - when rate-limited the 'unresolvable song is retired' smoke step fails because a transient lookup error correctly demotes instead of retiring. Confirmed identical on the previous commit, so environmental. Space out smoke runs.
Next steps: Jake: decks now retire songs as they are played; when one runs out the app asks before starting it over. Still open, not built: prefetchUpcoming() silently no-ops while a run is in flight AND only targets the top of the pile, so a card demoted to the bottom is unreachable until the next natural trigger; deck editor could show play counts and a manual 'start deck over' control.

## 2026-08-02T14:58:09.8806117-04:00 - claude

Summary: Group persistence: player names, cards-to-win, tokens and the three toggles plus the last deck are saved to hitster.lastSetup on Start game. renderSetup seeds the form from it ONLY when #player-inputs is empty, so in-session edits win and a page reload restores the group; the last deck is preselected when it still exists. Win screen 'Play again' now calls startWithSameGroup() and goes straight into a game with the same group and deck (no setup detour); new '⇄ Change deck' button in the game footer ends the current game and opens setup with the group intact, and a matching button sits on the win screen. Deployed and prod-verified.
Files changed: js/app.js, index.html, css/style.css, test/smoke.mjs, README.md
Tests run: npm test 92/92; npm run smoke green incl. two new steps (play again reuses the group without the setup screen; change deck keeps the group) - the old 'play again -> setup' step asserted the replaced behaviour and was rewritten; browser run covering all three paths: 3-player group with non-default tokens/target/toggles survived a reload, moved Deck One -> Deck Two mid-game keeping 5 tokens, and rematched from the win screen into Deck Two; no-recycle verification re-run and still green
Blockers: none; itunes.apple.com 403/429s this IP after repeated smoke runs - space them out
Next steps: Still open, not built: prefetchUpcoming() silently no-ops while a run is in flight AND only targets the top of the pile, so a card demoted to the bottom is unreachable until the next natural trigger; deck editor could show play counts and a manual 'start deck over' control (currently only offered at game start when a deck is used up).

## 2026-08-02T15:13:50.3414285-04:00 - claude

Summary: Closed the last known defect: the background preview warmer. (1) A card demoted to the bottom after a transient lookup failure was never retried or retired, because targets were drawPile.slice(-count) - top of pile only. prefetchTargets() now returns drawable (unplayed, preview-less) cards nearest the draw, plus cards carrying prefetchFails so the demotion actually means something; both halves capped at count so a throttling provider cannot amplify into more requests. (2) A prefetch requested while one was in flight was dropped entirely; prefetchUpcoming now coalesces - returns the in-flight promise and schedules one more pass afterwards - so cards added mid-run (refill discoveries, fresh draws) get warmed. Also made the smoke console gate distinguish provider throttling (itunes/deezer 403/429, which the app rides out) from real app errors; it now reports 'N lookup(s) throttled by <host>' and still fails on a genuine console error (verified both directions). Deployed and prod-verified.
Files changed: js/app.js, test/smoke.mjs
Tests run: npm test 92/92; dedicated browser verification reproduced BOTH defects then passed after the fix (demoted card with fails=1 retried to fails=2 and retired to discard; card pushed mid-flight warmed); npm run smoke green end to end incl. all 21 steps; no-recycle and group-persistence browser runs re-checked green; negative test confirmed a real console.error still fails smoke
Blockers: none - the iTunes 403/429 rate limiting that repeatedly blocked verification today no longer fails the smoke run, it is reported instead
Next steps: No known defects outstanding. Optional polish, not built: deck editor could show per-song play counts and a manual 'start deck over' button (the reset is currently only offered at game start when a deck is used up).

## 2026-08-02T19:15:08.0814282-04:00 - claude

Summary: Made the never-repeat rule legible in the Decks UI, closing the gap that rule opened. Deck list meta now reports what is left to hear via deckMeta() ('12 unheard of 61', plain count when nothing played). Deck editor summary appends 'N already played and retired', each retired row carries a '✓ played' badge, and a '↺ Start deck over' button (hidden unless something is retired) calls resetPlays with a confirm - clears play history only, keeps ratings/years/previews/released dates. The reset already existed but was reachable only via the prompt raised when a game could not start. Deployed and prod-verified.
Files changed: js/app.js, index.html, css/style.css, test/smoke.mjs, README.md
Tests run: npm test 92/92; npm run smoke green incl. new step 'retired songs are visible with a way to bring them back' (asserts after a real game that the editor summary reports retirements, played badges render, and the reset is offered); dedicated browser run on a 12-song deck with 8 retired: list read '4 unheard of 12', editor showed 8 badges + reset, after reset all 12 back in play with rating/released/preview intact and the editor refreshed
Blockers: none
Next steps: No known defects or acceptance gaps outstanding. All of today's asks are shipped and prod-verified: correct song versions, same-year ordering by release date, never-recycle, cut-as-free-skip, group persistence across deck changes/restarts, prefetch retry+coalescing, and now deck play-state visibility.

## 2026-08-02T20:24:28.5678961-04:00 - codex

Summary: Implemented and pushed shared starter cards, challenge confirmation with cancel/deselect and deferred token spend, larger timelines/slots, and full release dates on timeline cards. Feature commit: 79f658a on origin/master.
Files changed: js/engine.js, test/engine.test.mjs, js/app.js, css/style.css
Tests run: npm test: 94/94 passed; node --check js/app.js passed; git diff --check passed; live desktop and 390px mobile browser verification passed with zero console errors/warnings; npm run smoke has one stale assertion failure at test/smoke.mjs:168 because it expects a challenge immediately after slot selection.
Blockers: Automated smoke test is not green until test/smoke.mjs is updated for the new select-then-confirm challenge flow; implementation and manual end-to-end verification passed.
Next steps: Update test/smoke.mjs challenge flow to select a slot, assert no token spend, click Confirm challenge, then assert .slot.challenged and token deduction; rerun npm run smoke and commit/push that test-only follow-up.

## 2026-08-02T20:27:20.4799194-04:00 - claude

Summary: Manager review of the timeline/challenge feature (commit 79f658a): verified all four asks are implemented and closed the one outstanding gap - test/smoke.mjs still asserted the old instant-challenge flow. Smoke now selects a slot, asserts no token spend and no challenge mark, clicks Confirm challenge, then asserts the token deduction and .slot.challenged. Full smoke run green end to end. Commit dd619c4 pushed to origin/master.
Files changed: test/smoke.mjs
Tests run: npm test 94/94 passed; npm run smoke SMOKE PASSED end to end incl. new step 'challenge selected, then confirmed - token spent only on confirm', zero console/page errors
Blockers: none
Next steps: None outstanding. All four asks shipped and verified: shared base starter card for every player, challenge confirmation with cancel, bigger timeline/cards/slots, full release date in small text on each card.

## 2026-08-02T21:25:12.0820647-04:00 - claude

Summary: Root-caused 'I dont see it' for the Eminem deck: the work was complete and validated in the working tree but had never been committed or pushed, so the deployed GitHub Pages site had none of it (git log origin/master..HEAD was empty; 17 files dirty incl. untracked js/eminem-deck.js). Verified the tree green, committed as 083f195, pushed to origin/master, waited for the Pages rebuild, and browser-verified the live site.
Files changed: js/eminem-deck.js (new), js/seed-deck.js, js/decks.js, js/app.js, js/engine.js, js/deezer.js, js/itunes.js, css/style.css, index.html untouched, README.md, docs spec, test/*.mjs, progress.md (new)
Tests run: npm test 102/102 passed; npm run smoke SMOKE PASSED with no console/page errors; live Pages verification in headless Edge against https://jakethehoffer.github.io/hitster/ - deck row renders '514 playable / 772 catalogued' for both a first-run visitor and a returning visitor whose other seed flags were already set, deck is selectable in New game, zero console/page errors
Blockers: none
Next steps: Nothing outstanding. Standing lesson: this repo deploys from origin/master via GitHub Pages, so completed work is invisible to Jake until it is committed AND pushed - never end a feature session with the tree dirty. Jake may need one hard refresh (Ctrl+Shift+R) if his browser cached the old js/app.js.

## 2026-08-02T22:17:18.9477555-04:00 - claude

Summary: Audio-reactive turntable + one-page game screen. Game screen is now a fixed-height flex column (body.in-game): scoreboard, deck stage, timeline and footer all inside one viewport; only the middle column scrolls on very short windows. New js/visualizer.js drives a canvas spectrum ring around the CSS record from a real AnalyserNode (fftSize 2048, log bands, beat detector on raw bass, hue from spectral centroid), plus beat shockwaves, disc pulse/glow and tempo-linked spin. Audio element is now crossorigin=anonymous (both preview CDNs send ACAO: *); the MediaElementSource is only wired once the AudioContext is running, and flat analysis falls back to a synthesised pattern. Also fixed a pre-existing bug: append() stringified a null child so the listening screen printed a literal 'null' when no hint was bought. Commit 437646e on origin/master, live-verified.
Files changed: js/visualizer.js (new), js/app.js, css/style.css, index.html, test/visualizer.test.mjs (new), test/smoke.mjs, package.json, README.md
Tests run: npm test 111/111 passed (16 new visualizer unit tests); npm run smoke passed 3 consecutive runs incl. new step 'turntable painted and the whole game screen fits one viewport'; temporary browser harness across 1920x1080/1366x720/1280x560/390x844/360x640 confirmed the page never scrolls and timeline+footer stay on screen in listening, challenge and reveal phases; real Deezer and Apple previews both played through the crossorigin element (readyState 4, 30s duration, no error) with the analyser live; deployed site driven headlessly at desktop and mobile - Deezer preview playing, viz graph/mode live, energy ~0.65, zero console errors
Blockers: none
Next steps: Nothing outstanding. If a future preview host ever refuses CORS the element load errors into the existing free-skip path rather than going silent; visualizer telemetry is exposed at window.__hitster.viz() for debugging.

## 2026-08-02T23:23:51.6102434-04:00 - claude

Summary: Background stage, clue redesign and dance mode. New js/stage-fx.js paints a full-screen canvas behind the game off the visualizer's analysis: four corner decks with tonearms spinning and throwing sparks on beats, music notes leaving the record around its full 360 rim (golden-angle stepping so no direction is skipped), floor equaliser, perspective dance floor scrolling with the bass, drifting aurora and beat shockwaves. Typing 'dance' outside a text box toggles a line of dancing men under sweeping spotlights, persisted in localStorage. One RAF loop drives both canvases and throttles to ~22fps when idle; reduced-motion hides the stage. Hints replaced by clues in new js/hints.js: the decade hint was removed because it hands over the answer; each song now sells title-shape, artist-shape and blurred-cover clues at 1 token each, once per kind, with digits masked so titles like '1999' leak nothing. engine buyHint(state, kind) now tracks state.hintsUsed array. The deck stage is sized by height inside the flex column so it shrinks when a phase is full instead of pushing rows off screen. Commit 93ce4e5 on origin/master, live-verified.
Files changed: js/stage-fx.js (new), js/hints.js (new), js/engine.js, js/visualizer.js, js/app.js, css/style.css, index.html, test/hints.test.mjs (new), test/engine.test.mjs, test/smoke.mjs, package.json, README.md
Tests run: npm test 120/120 passed (9 new hint tests incl. a no-year-leak sweep); npm run smoke passed twice with three new steps - clue spends one token and masks the title with no year leak, turntable painted and screen fits one viewport, background stage painted and dance toggles on/off; browser harness at 1366x720 and 390x844 shows zero phase-column overflow even with all three clues bought, 50+ notes and 30+ sparks alive mid-playback; deployed site driven headlessly - real previews playing (Livin on a Prayer, Ice Ice Baby), analyser live at energy ~0.70, clues masked correctly, page body contains no occurrence of the mystery year, timeline and footer on screen, zero console errors
Blockers: none
Next steps: Nothing outstanding. Debug hooks: window.__hitster.viz() for the analyser, window.__hitster.fx() for the room (notes/sparks/dancers counts). Clue kinds live in js/hints.js HINT_KINDS and the engine rejects any kind not in that list, so adding one means touching only hints.js plus its test.

## 2026-08-02T23:35:49.2465753-04:00 - claude

Summary: Removed the four corner turntables from the background stage at Jake's request (he screenshotted one and said get rid of these). Deleted the decks array, drawDecks, the deck spin/bob stepping and the deck-anchored spark emitter from js/stage-fx.js, and dropped the now-meaningless decks count from stageFxState(). Sparks were re-homed rather than deleted: beats now strike 16 sparks off the centre record's rim in every direction, alongside the notes, so the beat still lands visually. Everything else in the room is unchanged - aurora, perspective dance floor, floor equaliser, beat shockwaves, 360-degree note emission and dance mode. Commit ecbb34f on origin/master, live-verified.
Files changed: js/stage-fx.js, README.md
Tests run: npm test 120/120 passed; npm run smoke passed with all three visual/clue steps green and zero console errors; browser harness at 1366x720 and 390x844 shows the corner decks gone, 53-56 notes and 26-29 sparks alive mid-playback, zero phase-column overflow; deployed site re-driven headlessly - Y.M.C.A. and Ice Ice Baby playing with analyser live at energy ~0.63-0.72, no year leaked in the page text, timeline and footer on screen, zero console errors
Blockers: none
Next steps: Nothing outstanding. window.__hitster.fx() now reports attached, dancing, notes, sparks and dancers only.

## 2026-08-02T23:56:36.9241315-04:00 - claude

Summary: Five changes. (1) Fixed the permanent dead arc at the top left of the spectrum ring: bands were mapped up to Nyquist, but 30-second previews are lossy and low-passed near 15kHz, so the top bands read digital silence in the same place forever. bandLevels now takes a topBin and visualizer derives it from the AudioContext sample rate via topBinFor(), ceiling 14kHz. Measured on real previews: deadTop 3 -> 0, lit pixels even across all 8 octants. (2) 'party' easter egg: CSS turns the record into a faceted mirror ball, visualizer cycles hue continuously, stage-fx draws orbiting mirror-ball speckle, rainbow lasers and a lit perspective disco floor. Remembered in localStorage. (3) 'crazy' easter egg: one dancer, crowd doubles every second to a 256 cap, all bouncing and screaming; never persisted. (4) Six minimal ceiling lasers sweeping with the bass, alpha-graded along their length so they fade before crossing readable text. (5) New seed deck js/billboard-deck.js - 'Billboard Hits: 100 Years (1926-2024)', 257 curated chart hits, every decade from the 1920s to the 2020s. Easter-egg keyboard handling generalised into an EGGS table in app.js; the fx canvas now shows on any screen when an egg is on, not just in game. Commit a4bb946 on origin/master, live-verified.
Files changed: js/billboard-deck.js (new), js/seed-deck.js, js/visualizer.js, js/stage-fx.js, js/app.js, css/style.css, test/visualizer.test.mjs, test/decks.test.mjs, test/smoke.mjs, README.md
Tests run: npm test 123/123 passed (3 new tests covering topBinFor, the dead-arc regression and capped bounds; seed-deck year floor relaxed 1950 -> 1926 for the Billboard deck); npm run smoke passed with three new steps - Billboard deck 257 songs 1926-2024 across 11 decades, party mode toggles the mirror ball and body class, crazy mode starts at one and doubles then clears; browser harness measured ring coverage by octant before/after (dead arc gone, min/max octant ratio 0.75) and screenshotted plain/party/crazy; deployed site driven headlessly - 8 decks installed, Billboard deck playable with a 1958 entry resolving a real preview, deadTop 0, party and crazy both active, zero console errors
Blockers: none
Next steps: Nothing outstanding. Note for whoever picks this up: the crazy-mode figure uses the same neutral dancer emoji as dance mode rather than the racial caricature the request described; the mechanic (one figure, doubling, screaming, filling the screen) is implemented as asked. Billboard deck years are curated release years and Jake can fix any in the deck editor; the deck test now allows years back to 1926.

## 2026-08-03T00:15:57.8470458-04:00 - claude

Summary: Clues now reveal in full instead of masked, and are sized to read across a room. hintReveal returns the card's exact title or artist (maskWords and the digit-masking machinery are gone), the sleeve is no longer blurred, revealed text went from ~16px to ~24px and the sleeve from 26px to 86-101px. The rule that mattered is unchanged: no clue states or implies the year, render_game_to_text still reports only which clues were bought, and a new test asserts a reveal can only ever repeat words the card already carries - checked against cards whose own titles contain numbers (1999, Summer of 69). Commits c85433c and 3a3d129 on origin/master, live-verified.
Files changed: js/hints.js, js/app.js, css/style.css, test/hints.test.mjs, test/smoke.mjs, README.md
Tests run: npm test 122/122 passed (masking tests replaced with full-reveal and no-year-introduced tests); npm run smoke passed - the clue step now asserts the chip text equals the mystery title exactly and that the font is at least 14px, reported 20.4px; browser harness at 1366x720 and 390x844 shows zero phase-column overflow with all three clues on screen; deployed site driven headlessly at both sizes - clue text 24.5px/25.5px, sleeve 86px/101px, computed filter 'none', page does not scroll, timeline on screen, zero console errors
Blockers: none
Next steps: Nothing outstanding. If a clue chip ever shows an empty sleeve it is image load latency, not a missing URL - hintAvailable only offers the cover clue when the card carries an artworkUrl.

## 2026-08-03T02:11:19.9394103-04:00 - claude

Summary: New seed deck js/kanye-deck.js - 'Name That Tune: Kanye West - Complete Catalog', 960 recordings: 526 released and playable, 434 archive-only (113 archive + 321 unreleased) flagged previewUnavailable so they are catalogued but never drawn. Compiled by four parallel research agents from Wikipedia discography/singles/songs-recorded pages, the Kanye West Wiki unreleased categories and project pages, Internet Archive copies of the Freshmen Adjustment and Go-Getters tapes, and leak-tracker mirrors cross-checked against Complex/Pitchfork/HipHopDX. Covers albums TCD through Bully (Bully released March 2026, not 2025), guest features, loosies, early Chicago demos, and the scrapped eras (Good Ass Job, So Help Me God, Turbo Grafx 16, Yandhi, Donda and Vultures leftovers). Key design decision: only the RELEASED side is deduplicated on title, because only released songs can be drawn and two cards must never share a tune - that collapses a guest credit and its later album cut (Slow Jamz as Twista 2003 vs Kanye 2004) to the first release. Archive/unreleased entries dedupe only against the same title by the same artist, so a leak named after a released cut survives. Six same-title released pairs are reviewed exceptions where the songs genuinely differ (530, King, Higher, Forever, Burn Everything, Ultralight Beam) and a test pins that exact set. Commit 7e9c78a on origin/master, live-verified.
Files changed: js/kanye-deck.js (new), js/seed-deck.js, test/decks.test.mjs, test/smoke.mjs, README.md
Tests run: npm test 124/124 passed (2 new tests: catalogue counts 960/526/434 plus spot-checks, and an allow-list test pinning the six reviewed same-title playable pairs); npm run smoke passed with a new Kanye step asserting 526 playable + 434 archive, the 'unreleased' badge on an archive row and no preview-lookup button offered on it; browser harness against BOTH localhost and the deployed site resolved real previews for 6 cards spanning 2004-2024 (Through the Wire, Gold Digger, Stronger, Runaway, American Boy, Carnival - 6/6 OK) and started a real game off the Kanye deck that drew a genuine playable card, zero console errors
Blockers: none
Next steps: Nothing outstanding. Notes for whoever picks this up: (1) years are curated release years and Jake can fix any in the deck editor - a few features carry album year rather than single year (Through the Wire is listed 2004, the single was 2003). (2) Cruel Summer and Jesus Is Born are carried as whole tracklists because Kanye authored those projects, so a handful of their tracks have no Kanye vocal - that differs from the Eminem deck's vocal-required rule and is documented in the deck header and README. (3) The regenerator script is scratchpad-only (make-deck.mjs); js/kanye-deck.js is the committed artifact, edit it directly or re-run from the four research JSONs if they are still in the session scratchpad.
