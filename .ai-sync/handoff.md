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
