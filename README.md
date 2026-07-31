# Hitster — Party Edition

A digital version of the music timeline party game Hitster, built for playing
with friends on one shared screen, with **your own song decks** instead of the
base game's cards. Song search, release years, and album art come from the
free iTunes Search API; 30-second preview audio resolves from Deezer first so
you get the **original (explicit) versions** — Apple's search API only serves
censored tracks. No accounts, no API keys, no Spotify Premium.

**Play it now: https://jakethehoffer.github.io/hitster/** — no install, works
on any phone/laptop/TV browser. Decks are saved per browser, so build your
deck on the device you'll play from (or export/import it as JSON).

## How to run it locally

1. Open a terminal in this folder and run `npm start` (or any static server,
   e.g. `npx serve .`), then open the printed URL — usually
   `http://localhost:4173`.
2. Or skip the server entirely: double-click `index.html`. Everything works
   from `file://` too.

Best experience: open it on a laptop plugged into a TV, or share the tab (with
audio) over Discord for remote friends.

## How to play

Same as real Hitster:

1. **New game** → pick a deck, add 2–8 players (a "player" can be a team),
   choose cards-to-win (10 is classic) and type any starting-token count
   (0–20), press **Start game**.
2. On your turn press **Draw a song**, then **Play song**. A mystery song
   plays — no title, no artist, no year. Pause and resume anytime with the
   button or the **spacebar** (it picks up where it left off).
3. Tap the slot in your timeline where you think the song belongs
   (before/between/after your cards), then press **Lock it in**.
4. Anyone else who thinks you're wrong can **challenge** for 1 token: tap
   their name, then the slot they think is right. A successful steal gets
   the token back; any failed challenge loses it.
5. **Reveal!** Correct placement keeps the card (ties on the same year count
   as correct). If you were wrong and a challenger was right, they steal it.
6. If anyone named the artist **and** title out loud, tap their name under
   "Grab a token" (honor system). Tokens buy song skips and challenges.
7. Vote **👍 Keep it** or **👎 Cut it** on the song itself — available while
   it's still playing (before you lock in) and on the reveal screen. Votes
   save to the deck: a net-disliked song sits out all future games (the deck
   editor shows it as excluded, with a Restore button), so decks improve
   every time you play. You can also 👍/👎 any song directly in the deck
   editor — handy when you forgot to vote during the game.
8. First to the target number of cards wins. With **Endless deck** on (the
   default), the pile never runs dry — when it gets low, the game discovers
   new songs by the artists already in your deck (year taken from the song's
   album, tagged "✨ new discovery" at reveal, and added to your deck so you
   can vote on them). If endless is off or you're offline and the deck runs
   out, most cards wins (tokens break ties).

The game autosaves after every move — if the browser closes, **Resume game**
on the home screen picks up where you left off.

## Building a deck of YOUR songs (the whole point)

1. From the home screen click **♫ Decks**.
2. Type a deck name in the "New deck name…" box and click **+ Create**.
3. In the search box type a song — e.g. `mr brightside` — and press Enter.
4. Each result shows the artwork, title, artist, and year, with a **▶** button
   to hear the preview. Click **+ Add** on the version you want.
5. To find a song already in the deck (to re-rate it, fix its year, or cut
   it), type in the **"Find in this deck"** box below the song count. It
   filters the list live by title or artist.
6. **Check the year.** iTunes sometimes reports a remaster or compilation date
   (e.g. "Take On Me (MTV Unplugged)" says 2017). The year box next to each
   deck song is editable — fix it there. The game trusts your deck's year.
7. Aim for `players x cards-to-win + 10` songs or more (the setup screen warns
   you if a deck is thin). 40–60 songs is a great party deck.

**Sharing decks with friends:** click **Export** on a deck to download a
`.hitster.json` file, send it to a friend, and they click **⇪ Import JSON** on
their Decks screen. Decks live in each browser's localStorage.

Six built-in decks are included, each big enough for a game to 10 cards:
the **Starter deck** (61 hits, 1966–2024), **Rap & Hip-Hop** (61, 1979–2024),
**Pop Through the Decades** (61, 1963–2024), **Rock Anthems** (50, 1965–2020),
**R&B & Soul** (45, 1961–2023), and **2000s & 2010s Throwbacks** (42).
They're normal decks — edit, prune with 👎 votes, or delete them. When an
update adds songs to a built-in deck, your copy gets the new songs on next
load with all your ratings and edits kept.

If a preview plays the wrong version of a song (remix, acapella, live), fix it
either way: search the song in the deck editor and click **↻ Use this preview**
on the exact version you want, or hit **↻ Fix preview** on the song's row in
the deck list below (it re-fetches with a matcher that prefers the original
recording).

## Development

- `npm test` — engine + deck unit tests (`node --test`, no dependencies).
- `npm run smoke` — headless end-to-end test: drives a full game to the win
  screen in Edge/Chrome via puppeteer-core and fails on any console error
  (`npm install` once first; set `BROWSER_PATH` if your browser is elsewhere).
- No build step. `js/engine.js` is the pure rules engine (no DOM); `js/app.js`
  is the UI controller; `js/itunes.js` wraps the iTunes Search API via JSONP;
  `js/decks.js` + `js/seed-deck.js` handle deck storage.

## Known limits

- Song previews are 30-second clips (usually the hook — plenty to guess with).
- Artist/title bonus tokens are honor-system; the app doesn't verify.
- Previews stream from Deezer/Apple CDNs, so playing needs internet. The game
  resolves previews for upcoming cards ahead of the draw; a song no source can
  find is quietly set aside so nobody ever draws it. If audio still breaks
  mid-turn (rare), it re-finds the preview automatically and otherwise offers
  a **free** skip — broken audio never costs a token.
- To deploy for everyone (no local server), any static host works — e.g.
  Cloudflare Pages: point it at this folder, no build command.
