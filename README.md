# Hitster — Party Edition

A digital version of the music timeline party game Hitster, built for playing
with friends on one shared screen, with **your own song decks** instead of the
base game's cards. Song search, release years, 30-second previews, and album
art all come from the free iTunes Search API — no accounts, no API keys, no
Spotify Premium.

## How to run it

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
   choose cards-to-win (10 is classic), press **Start game**.
2. On your turn press **Draw a song**, then **Play song**. A mystery song
   plays — no title, no artist, no year.
3. Tap the slot in your timeline where you think the song belongs
   (before/between/after your cards), then press **Lock it in**.
4. Anyone else who thinks you're wrong can **challenge** for 1 token: tap
   their name, then the slot they think is right.
5. **Reveal!** Correct placement keeps the card (ties on the same year count
   as correct). If you were wrong and a challenger was right, they steal it.
6. If anyone named the artist **and** title out loud, tap their name under
   "Grab a token" (honor system). Tokens buy song skips and challenges.
7. First to the target number of cards wins. If the deck runs out first, most
   cards wins (tokens break ties).

The game autosaves after every move — if the browser closes, **Resume game**
on the home screen picks up where you left off.

## Building a deck of YOUR songs (the whole point)

1. From the home screen click **♫ Decks**.
2. Type a deck name in the "New deck name…" box and click **+ Create**.
3. In the search box type a song — e.g. `mr brightside` — and press Enter.
4. Each result shows the artwork, title, artist, and year, with a **▶** button
   to hear the preview. Click **+ Add** on the version you want.
5. **Check the year.** iTunes sometimes reports a remaster or compilation date
   (e.g. "Take On Me (MTV Unplugged)" says 2017). The year box next to each
   deck song is editable — fix it there. The game trusts your deck's year.
6. Aim for `players x cards-to-win + 10` songs or more (the setup screen warns
   you if a deck is thin). 40–60 songs is a great party deck.

**Sharing decks with friends:** click **Export** on a deck to download a
`.hitster.json` file, send it to a friend, and they click **⇪ Import JSON** on
their Decks screen. Decks live in each browser's localStorage.

A starter deck of well-known hits (1966–2024) is included as demo content —
delete it once you've built your own.

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
- Previews stream from Apple's CDN, so playing needs internet.
- To deploy for everyone (no local server), any static host works — e.g.
  Cloudflare Pages: point it at this folder, no build command.
