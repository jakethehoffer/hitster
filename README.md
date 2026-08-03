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
   plays — no title, no artist, no year. The record spins and the ring of
   lights around it dances to whatever is playing: the bars follow the
   spectrum, the disc pulses and throws light on every kick, and the colour
   shifts from hot pink for bass-led songs towards cyan for bright ones.
   Pause and resume anytime with the button or the **spacebar** (it picks up
   where it left off). With **Hard
   draws** on (the default), the game picks songs whose years land close to
   the cards already in your timeline — placements are always a genuine call,
   never a gimme decades outside your range. A mystery song never shares a
   year with a card already on the active player's timeline.
   Need help? **💡 Hint** costs 1 token and reveals the song's decade.
3. Tap the slot in your timeline where you think the song belongs
   (before/between/after your cards), then press **Lock it in**.
4. Anyone else who thinks you're wrong can **challenge** for 1 token: tap
   their name, then the slot they think is right. A successful steal gets
   the token back; any failed challenge loses it.
5. **Reveal!** Correct placement keeps the card. If you were wrong and a
   challenger was right, they steal it.
6. If anyone named the artist **and** title out loud, tap their name under
   "Grab a token" (honor system). Tokens buy song skips, decade hints, and challenges.
7. Vote **👍 Keep it** or **👎 Cut it** on the song itself — available while
   it's still playing (before you lock in) and on the reveal screen. Votes
   save to the deck: a net-disliked song sits out all future games (the deck
   editor shows it as excluded, with a Restore button), so decks improve
   every time you play. Cutting a song while it's still playing also moves
   you straight on to another one and costs no token — rejecting a song
   isn't a guess, so it shouldn't be paid for. You can also 👍/👎 any song
   directly in the deck editor — handy when you forgot to vote in the game.
8. First to the target number of cards wins. With **Endless deck** on (the
   default), the pile never runs dry — when it gets low, the game discovers
   new songs by the artists already in your deck (year taken from the song's
   album, tagged "✨ new discovery" at reveal, and added to your deck so you
   can vote on them). If endless is off or you're offline and the deck runs
   out, most cards wins (tokens break ties).

Songs are never repeated. Once a song has been revealed it is retired, and no
later game deals it again — a deck plays through its songs and then stops.
The deck list shows what's left ("12 unheard of 61"), the deck editor marks
each retired song **✓ played**, and **↺ Start deck over** there puts them all
back whenever you want. If a game can't start because too few unheard songs
remain, the app offers the same reset; declining leaves the deck alone.
Starting over clears only the play history, never your ratings, years,
previews or dates. With **Endless deck** on, discovery keeps adding genuinely
new songs, so a deck usually grows faster than you can use it up.

Normal draws exclude years already on the active timeline. Older saved games
and challenge steals can still produce same-year cards; those are ordered by
release date when both dates are known, with either side accepted when a date
is unavailable.

The group is set up once. Player names, cards-to-win, tokens and the toggles
are remembered, so **Play again** on the win screen drops you straight into
another game with the same people and deck, **⇄ Change deck** (in the game
footer, or on the win screen) leaves the current deck for another one without
losing anyone, and reopening the app after a reload finds everybody still
there.

The game screen is built to sit in one viewport on a phone, a laptop or a TV —
scoreboard, turntable, timeline and footer all on screen at once, with no
scrolling to reach the slots you tap.

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

Seven built-in decks are included, each big enough for a game to 10 cards:
the **Starter deck** (61 hits, 1966–2024), **Rap & Hip-Hop** (61, 1979–2024),
**Pop Through the Decades** (61, 1963–2024), **Rock Anthems** (50, 1965–2020),
**R&B & Soul** (45, 1961–2023), **2000s & 2010s Throwbacks** (42), and
**Name That Tune: Eminem — Complete Catalog** (772 song recordings, 1988–2025).
They're normal decks — edit, prune with 👎 votes, or delete them. When an
update adds songs to a built-in deck, your copy gets the new songs on next
load with all your ratings and edits kept.

The Eminem deck separates 514 commercially/publicly released recordings from
258 documented demos, leaks, freestyles, and other archive recordings. The
archive entries are included for catalog completeness and labelled in the deck
editor, but they are not dealt automatically because Deezer and iTunes do not
provide authorised previews for them. Selecting an exact legal preview through
the editor makes that entry playable. Spoken skits/interludes and project-title
placeholders are not counted as songs.

Previews resolve to the original recording: the lookup asks Deezer by artist
and track field (free-text search sometimes buries the real single under
remixes and karaoke), scores results against alternate-cut markers and any
qualifier the deck's title didn't ask for, and falls back to iTunes when the
best Deezer has is a remix. A featured-artist credit or an "(Album Version)"
label still counts as the original.

If one still plays the wrong version, fix it either way: search the song in
the deck editor and click **↻ Use this preview** on the exact version you
want, or hit **↻ Fix preview** on the song's row in the deck list below.

## Development

- `npm test` — engine + deck unit tests (`node --test`, no dependencies).
- `npm run smoke` — headless end-to-end test: drives a full game to the win
  screen in Edge/Chrome via puppeteer-core and fails on any console error
  (`npm install` once first; set `BROWSER_PATH` if your browser is elsewhere).
- No build step. `js/engine.js` is the pure rules engine (no DOM); `js/app.js`
  is the UI controller; `js/itunes.js` wraps the iTunes Search API via JSONP;
  `js/decks.js` + `js/seed-deck.js` handle deck storage; `js/visualizer.js`
  owns the turntable — an AnalyserNode over the `<audio>` element feeds the
  spectrum ring, the beat detector and the colour.
- The audio element is `crossorigin="anonymous"` on purpose: both preview
  hosts answer with `Access-Control-Allow-Origin: *`, and without it Web Audio
  only ever sees silence. If a host ever refused, the visuals fall back to a
  synthesised pattern rather than freezing.

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
