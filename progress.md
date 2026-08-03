Original prompt: a new song should never be in the same year as something already on the timeline. wrong hips dont lie (some type of remix). add hints for 1 token

## 2026-08-02

- Traced same-year draws to the engine's drawable pool: exact-year cards were eligible and favored by hard draws.
- Traced the Hips Don't Lie issue to a Deezer result with a plain track title on an album explicitly marked LIVE; album metadata was discarded before match scoring.
- Implemented active-timeline year exclusion for draws/redraws and turn exhaustion.
- Added a one-use decade hint costing the active player 1 token; it resets for a replacement song/new turn.
- Kept Deezer album metadata, penalized hidden alternate/live album cuts, and bumped preview era so cached wrong recordings re-resolve.
- Added regression tests for same-year draw exclusion, hints, and the live-album Hips Don't Lie result.
- First unit run: 96/98 passed; two legacy assertions expected the word "empty" in exhaustion errors. Preserved that contract in the clearer new error message.
- Second unit run: all 98 tests passed before the final guard coverage was added.
- Added an answer-safe `render_game_to_text` hook and expanded the browser smoke path to assert no repeated mystery year plus the one-token/decade-only hint behavior.
- Browser smoke passed end-to-end with no page/console errors; the hint spent exactly one token, exposed only the decade, and every mystery had a year absent from the active timeline.
- Ran the prescribed Playwright game client; setup rendered cleanly and text state reported the setup/menu screen with no error artifact.
- Inspected the full gameplay screenshot: the gold decade hint is clear, the timeline remains usable, and the layout has no visible overflow or overlap at 800x747.
- Live Deezer catalogue check selected `Hips Don't Lie (feat. Wyclef Jean)` by Shakira from `Filtr presents R&B Party`, not the plain-titled result from the album marked LIVE.
- Added a guard for decks with fewer than two distinct years and documented the new draw/hint rules.
- Final validation: all 100 unit tests passed; the full browser smoke passed again with no page/console errors (the expected provider throttling was handled).
- Removed scratch screenshots/action payload and stopped the local test server. No known TODOs remain for this request.

## 2026-08-02 — Name That Tune: Eminem

- New request: add a Name That Tune Eminem collection spanning released and documented unreleased songs.
- Chose a built-in catalogue deck so it works with the existing Hitster setup, rules, persistence, and editor.
- Added first-class archive-only song metadata: those records remain visible/exportable but never trigger automatic lookups for leaked or unavailable audio.
- Integrated 772 reviewed Eminem song recordings: 514 released/playable and 258 archive-only, with spoken skits/interludes and non-song placeholders excluded.
- Added unit coverage for the exact catalog split and representative released/unreleased titles.
- Unit validation: all 102 tests pass; the generated catalog has 772 unique title/artist identities spanning 1988–2025.
- Added browser-smoke coverage for first-run installation, playable/archive counts, editor labelling, and the no-auto-lookup guard.
- Desktop screenshots verified the full deck row, archive badge, setup selection, and live game start with no errors.
- Mobile verification found horizontal overflow from the long select label and archive control row; added responsive wrapping/width guards.
- Reran mobile checks at 390px: setup, deck list, and filtered archive editor all have `scrollWidth === innerWidth`; the fixed screenshots are clean.
- Final prescribed Playwright-client pass rendered without an error artifact; latest text state reported the decks menu correctly.
- Final validation: all 102 unit tests and the full browser smoke pass with no console/page errors.
- Removed browser screenshot/action scratch output and stopped the local server. No known TODOs remain for this request.
