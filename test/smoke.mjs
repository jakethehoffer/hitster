// Headless E2E smoke test for digital Hitster.
// Serves the project dir, drives a full 2-player game to the win screen,
// and fails on any page/console error.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { SEED_DECKS } from '../js/seed-deck.js';

const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const EDGE = [
  process.env.BROWSER_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => p && existsSync(p));
if (!EDGE) {
  console.log('No Edge/Chrome found — set BROWSER_PATH. Skipping smoke test.');
  process.exit(0);
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

const server = createServer(async (req, res) => {
  try {
    const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(normalize(ROOT))) throw new Error('traversal');
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('nope');
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const errors = [];
const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new' });
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

// iTunes and Deezer throttle a busy IP (403/429), which the app is built to
// ride out — a failed lookup demotes or retires the card, it never breaks a
// turn. Those are conditions of the network, not defects, so they are counted
// and reported rather than failing the run. Anything else still fails it.
const throttled = [];
page.on('response', (r) => {
  if (r.status() === 403 || r.status() === 429) throttled.push(r.url());
});
const isThrottleNoise = (text) =>
  /Failed to load resource/.test(text) && /\b(403|429)\b/.test(text);
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  if (isThrottleNoise(m.text())) return;
  errors.push(`console: ${m.text()}`);
});

// Silence real audio and confirm dialogs before any page script runs.
await page.evaluateOnNewDocument(() => {
  HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function () {};
  window.confirm = () => true;
});

await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0' });

// The real first-run seed includes the complete Eminem catalogue. Verify the
// storage split and the archive-only editor treatment before replacing the
// built-ins with the small deterministic deck used by the long game smoke.
const eminemSeed = await page.evaluate(() => {
  const ids = JSON.parse(localStorage.getItem('hitster.deckIndex') || '[]');
  const decks = ids.map((id) => JSON.parse(localStorage.getItem(`hitster.deck.${id}`) || 'null'));
  const deck = decks.find((d) => d && d.seedKey === 'eminem-name-that-tune');
  if (!deck) return { error: 'missing built-in deck' };
  document.querySelector('#btn-decks').click();
  const row = [...document.querySelectorAll('#deck-list .deck-item')]
    .find((n) => n.textContent.includes('Name That Tune: Eminem'));
  if (!row) return { error: 'missing deck-list row' };
  const meta = row.querySelector('.deck-meta')?.textContent || '';
  [...row.querySelectorAll('button')].find((b) => b.textContent === 'Edit')?.click();
  const filter = document.querySelector('#deck-filter');
  filter.value = 'Marshall Powers';
  filter.dispatchEvent(new Event('input'));
  const archiveRow = document.querySelector('#deck-songs .song-item');
  return {
    total: deck.songs.length,
    playable: deck.songs.filter((s) => !s.previewUnavailable).length,
    archive: deck.songs.filter((s) => s.previewUnavailable).length,
    meta,
    archiveTitle: archiveRow?.querySelector('.song-title')?.textContent || '',
    archiveBadge: archiveRow?.querySelector('.catalog-badge')?.textContent || '',
    archiveHasAutoLookup: [...(archiveRow?.querySelectorAll('button') || [])]
      .some((b) => b.textContent.includes('Fix preview')),
  };
});
if (eminemSeed.total !== 772 || eminemSeed.playable !== 514 || eminemSeed.archive !== 258) {
  errors.push(`Eminem seed counts: ${JSON.stringify(eminemSeed)}`);
} else if (!eminemSeed.meta.includes('514 playable')
  || eminemSeed.archiveTitle !== 'Marshall Powers'
  || !eminemSeed.archiveBadge.includes('unreleased')
  || eminemSeed.archiveHasAutoLookup) {
  errors.push(`Eminem archive UI: ${JSON.stringify(eminemSeed)}`);
} else {
  console.log('  ✔ Eminem catalogue: 514 playable + 258 archive-only, correctly labelled');
}

// The Kanye catalogue is mostly leaks by count, so the split is what matters:
// a scrapped-album track must be visible in the editor and flagged, never
// offered a preview lookup that cannot succeed.
const kanyeSeed = await page.evaluate(() => {
  const ids = JSON.parse(localStorage.getItem('hitster.deckIndex') || '[]');
  const decks = ids.map((id) => JSON.parse(localStorage.getItem(`hitster.deck.${id}`) || 'null'));
  const deck = decks.find((d) => d && d.seedKey === 'kanye-name-that-tune');
  if (!deck) return { error: 'missing built-in deck' };
  document.querySelector('#btn-decks').click();
  const row = [...document.querySelectorAll('#deck-list .deck-item')]
    .find((n) => n.textContent.includes('Name That Tune: Kanye West'));
  if (!row) return { error: 'missing deck-list row' };
  const meta = row.querySelector('.deck-meta')?.textContent || '';
  [...row.querySelectorAll('button')].find((b) => b.textContent === 'Edit')?.click();
  const filter = document.querySelector('#deck-filter');
  filter.value = 'Chakras';
  filter.dispatchEvent(new Event('input'));
  const archiveRow = document.querySelector('#deck-songs .song-item');
  return {
    total: deck.songs.length,
    playable: deck.songs.filter((s) => !s.previewUnavailable).length,
    archive: deck.songs.filter((s) => s.previewUnavailable).length,
    meta,
    archiveTitle: archiveRow?.querySelector('.song-title')?.textContent || '',
    archiveBadge: archiveRow?.querySelector('.catalog-badge')?.textContent || '',
    archiveHasAutoLookup: [...(archiveRow?.querySelectorAll('button') || [])]
      .some((b) => b.textContent.includes('Fix preview')),
  };
});
if (kanyeSeed.total !== 960 || kanyeSeed.playable !== 526 || kanyeSeed.archive !== 434) {
  errors.push(`Kanye seed counts: ${JSON.stringify(kanyeSeed)}`);
} else if (!kanyeSeed.meta.includes('526 playable')
  || kanyeSeed.archiveTitle !== 'Chakras'
  || !kanyeSeed.archiveBadge.includes('unreleased')
  || kanyeSeed.archiveHasAutoLookup) {
  errors.push(`Kanye archive UI: ${JSON.stringify(kanyeSeed)}`);
} else {
  console.log('  ✔ Kanye catalogue: 526 playable + 434 archive-only, correctly labelled');
}

// The century deck has to actually span a century, or it is just another
// decades deck with an ambitious name.
const billboard = await page.evaluate(() => {
  const ids = JSON.parse(localStorage.getItem('hitster.deckIndex') || '[]');
  const deck = ids.map((id) => JSON.parse(localStorage.getItem(`hitster.deck.${id}`) || 'null'))
    .find((d) => d && d.seedKey === 'billboard-century');
  if (!deck) return { error: 'not installed' };
  const years = deck.songs.map((s) => s.year);
  const decades = new Set(years.map((y) => Math.floor(y / 10) * 10));
  return { songs: deck.songs.length, from: Math.min(...years), to: Math.max(...years), decades: decades.size };
});
if (billboard.error || billboard.from > 1930 || billboard.to < 2020 || billboard.decades < 10) {
  errors.push(`Billboard century deck: ${JSON.stringify(billboard)}`);
} else {
  console.log(`  ✔ Billboard century deck: ${billboard.songs} songs, ${billboard.from}-${billboard.to}, ${billboard.decades} decades`);
}

// Install a deterministic test deck (with fake previews so no iTunes calls),
// and mark the seed as installed so only the test deck exists.
await page.evaluate((seeds) => {
  localStorage.clear();
  const songs = Array.from({ length: 24 }, (_, i) => ({
    title: `Song ${1960 + i * 2}`, artist: 'Test Artist', year: 1960 + i * 2,
    previewUrl: 'data:audio/mp3;base64,AAAA',
  }));
  for (const s of seeds) {
    localStorage.setItem(`hitster.seedInstalled.${s.key}`, '1');
    localStorage.setItem(`hitster.seedVersion.${s.key}`, String(s.version));
  }
  localStorage.setItem('hitster.deckIndex', JSON.stringify(['t1']));
  localStorage.setItem('hitster.deck.t1', JSON.stringify({ id: 't1', name: 'Test Deck', songs }));
}, SEED_DECKS.map((s) => ({ key: s.key, version: s.version })));
await page.reload({ waitUntil: 'networkidle0' });

const visible = (sel) => page.$eval(sel, (n) => !n.closest('.hidden') && n.offsetParent !== null).catch(() => false);
const clickText = async (text) => {
  const found = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')]
      .find((b) => b.offsetParent !== null && !b.disabled && b.textContent.includes(t));
    if (btn) { btn.click(); return true; }
    return false;
  }, text);
  return found;
};

const step = async (name, fn) => {
  const ok = await fn();
  if (!ok) { errors.push(`step failed: ${name}`); console.log(`  ✖ ${name}`); }
  else console.log(`  ✔ ${name}`);
  return ok;
};

console.log('smoke: screens');
await step('home visible', () => visible('#btn-new-game'));
await step('open decks', async () => { await clickText('♫ Decks'); return visible('#deck-list'); });
await step('deck listed', () => page.$eval('#deck-list', (n) => n.textContent.includes('Test Deck')));
await step('back home', async () => clickText('← Back'));
await step('open setup', async () => { await clickText('▶ New game'); return visible('#setup-deck'); });
await step('deck in select', () => page.$eval('#setup-deck', (s) => s.options.length === 1 && s.textContent.includes('Test Deck')));

// quick game: 5 cards to win, custom token count via the type-in field
await page.select('#setup-target', '5');
await page.evaluate(() => { document.querySelector('#setup-tokens').value = '4'; });
// Endless refill grows the stored deck, and game length varies with the random
// seed — so a long game would break the fixed deck-size checks further down.
// Refill gets its own step later, on its own game.
await page.evaluate(() => { document.querySelector('#setup-endless').checked = false; });
await step('start game', async () => { await clickText('Start game'); return visible('#scoreboard'); });
await step('custom token count applied', () => page.evaluate(() =>
  [...document.querySelectorAll('.player-chip .chip-tokens')].every((n) => n.textContent === '●'.repeat(4))));

console.log('smoke: play to the end');
let turns = 0;
let won = false;
while (turns < 80 && !won) {
  turns += 1;
  if (!(await clickText('▶ Draw a song'))) { errors.push(`turn ${turns}: no draw button`); break; }
  await page.waitForFunction(() => document.querySelector('.slot:not([disabled])'), { timeout: 5000 });
  // The lock button is deliberately withheld while the preview is resolving,
  // so wait for that to settle instead of racing however many lookups it takes.
  await page.waitForFunction(() => window.__hitster.previewState !== 'loading', { timeout: 30000 });
  const repeatedYear = await page.evaluate(() => {
    const g = window.__hitster.game;
    return g.players[g.current].timeline.some((c) => c.year === g.mystery.year);
  });
  if (repeatedYear) errors.push(`turn ${turns}: mystery repeated a timeline year`);
  // A clue costs exactly one token, names the song outright, sells each angle
  // only once, and never puts the year into the automation state.
  if (turns === 1) {
    const before = await page.evaluate(() => {
      const g = window.__hitster.game;
      return { tokens: g.players[g.current].tokens, year: g.mystery.year, title: g.mystery.title };
    });
    if (!(await clickText('🔤 Title'))) {
      errors.push('no title clue offered in the listening phase');
    } else {
      const clued = await page.evaluate(() => {
        const g = window.__hitster.game;
        const buttons = [...document.querySelectorAll('button')]
          .filter((b) => b.offsetParent !== null).map((b) => b.textContent);
        const chip = document.querySelector('.clue');
        return {
          tokens: g.players[g.current].tokens,
          shown: [...document.querySelectorAll('.clue-text')].map((n) => n.textContent),
          chipHeight: chip ? Math.round(chip.getBoundingClientRect().height) : 0,
          fontPx: chip ? parseFloat(getComputedStyle(chip.querySelector('.clue-text')).fontSize) : 0,
          titleStillForSale: buttons.some((t) => t.includes('🔤 Title')),
          artistStillForSale: buttons.some((t) => t.includes('🎤 Artist')),
          publicMystery: JSON.parse(window.render_game_to_text()).mystery,
        };
      });
      if (clued.tokens !== before.tokens - 1) errors.push('a clue did not spend exactly one token');
      if (clued.shown.length !== 1) errors.push('the title clue did not appear');
      if (clued.shown[0] !== before.title) errors.push(`the clue showed "${clued.shown[0]}" instead of the title`);
      if (clued.fontPx < 14) errors.push(`the clue is too small to read across a room (${clued.fontPx}px)`);
      if (clued.titleStillForSale) errors.push('the same clue could be bought twice');
      if (!clued.artistStillForSale) errors.push('buying one clue withdrew the others');
      if (String(clued.publicMystery.year ?? '').length > 0
        || JSON.stringify(clued.publicMystery).includes(String(before.year))) {
        errors.push('text state leaked the mystery year');
      } else if (!clued.publicMystery.clues.includes('title')) {
        errors.push('text state did not record the bought clue');
      } else {
        console.log(`  ✔ a clue spent one token, named the song at ${clued.fontPx}px and leaked no year`);
      }
      if (process.env.HITSTER_HINT_SCREENSHOT) {
        await page.screenshot({ path: process.env.HITSTER_HINT_SCREENSHOT, fullPage: true });
      }
    }
  }
  // The turntable is the centrepiece of the listening screen, and the whole
  // screen has to sit inside one viewport — the timeline is what players tap,
  // so it can never be pushed below the fold.
  if (turns === 1) {
    // An untouched canvas still reports width 300, so the only honest test of
    // "it painted" is a pixel. Polling also rides out the render that swaps in
    // a fresh canvas a frame before the loop draws on it.
    const painted = await page.waitForFunction(() => {
      const c = document.querySelector('canvas.viz');
      if (!c) return false;
      const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 4) return true;
      return false;
    }, { timeout: 5000 }).then(() => true, () => false);
    const stage = await page.evaluate((drew) => {
      if (!drew) return 'the turntable canvas never painted';
      if (!document.querySelector('.deck-stage .vinyl')) return 'no record';
      if (!window.__hitster.viz().attached) return 'visualiser not attached';
      if (!document.body.classList.contains('in-game')) return 'game screen is not in one-page mode';
      const bottom = (sel) => document.querySelector(sel).getBoundingClientRect().bottom;
      const room = window.innerHeight + 1;
      if (document.documentElement.scrollHeight > room) return 'the page scrolls';
      if (bottom('#timeline-area') > room) return 'the timeline is below the fold';
      if (bottom('.game-footer') > room) return 'the footer is below the fold';
      return 'ok';
    }, painted);
    if (stage !== 'ok') errors.push(`turntable/one-page layout: ${stage}`);
    else console.log('  ✔ turntable painted and the whole game screen fits one viewport');

    // The room behind the game paints too, and typing "dance" fills the floor.
    const roomPainted = await page.waitForFunction(() => {
      const c = document.querySelector('#stage-fx');
      if (!c || !c.width || getComputedStyle(c).display === 'none') return false;
      const px = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      for (let i = 3; i < px.length; i += 4) if (px[i] > 3) return true;
      return false;
    }, { timeout: 5000 }).then(() => true, () => false);
    if (!roomPainted) errors.push('the background stage never painted');
    const before = await page.evaluate(() => window.__hitster.fx().dancing);
    await page.keyboard.type('dance');
    const on = await page.evaluate(() => window.__hitster.fx());
    await page.keyboard.type('dance');
    const off = await page.evaluate(() => window.__hitster.fx().dancing);
    if (before !== false) errors.push('dance mode was already on before anyone typed it');
    else if (on.dancing !== true || on.dancers < 1) errors.push('typing "dance" did not put dancers on the floor');
    else if (off !== false) errors.push('typing "dance" again did not clear the floor');
    else if (roomPainted) console.log('  ✔ background stage painted and the dance easter egg toggles');

    // "party": the record becomes a mirror ball and the room takes the theme
    await page.keyboard.type('party');
    const partyOn = await page.evaluate(() => ({
      fx: window.__hitster.fx().party,
      themed: document.body.classList.contains('party'),
    }));
    await page.keyboard.type('party');
    const partyOff = await page.evaluate(() => window.__hitster.fx().party
      || document.body.classList.contains('party'));
    if (!partyOn.fx || !partyOn.themed) errors.push('typing "party" did not start the disco');
    else if (partyOff) errors.push('typing "party" again did not end the disco');
    else console.log('  ✔ party mode turns the record into a mirror ball and back');

    // "crazy": one dancer, doubling every second
    await page.keyboard.type('crazy');
    const first = await page.evaluate(() => window.__hitster.fx().crowd);
    const grown = await page.waitForFunction(() => window.__hitster.fx().crowd >= 4, { timeout: 6000 })
      .then(() => true, () => false);
    const peak = await page.evaluate(() => window.__hitster.fx().crowd);
    await page.keyboard.type('crazy');
    const cleared = await page.evaluate(() => window.__hitster.fx());
    if (first !== 1) errors.push(`crazy mode started with ${first} instead of one`);
    else if (!grown) errors.push('the crowd never doubled');
    else if (cleared.crazy || cleared.crowd !== 0) errors.push('typing "crazy" again did not clear the crowd');
    else console.log(`  ✔ crazy mode starts at one and doubles (reached ${peak}), then clears`);
  }
  // spacebar toggles playback during a turn (must not crash or scroll away)
  if (turns === 1) await page.keyboard.press('Space');
  // Cutting a song mid-listen rejects it AND moves on, for free — so it must
  // swap the mystery without charging the active player a token.
  if (turns === 3) {
    const before = await page.evaluate(() => ({
      song: window.__hitster.game.mystery.title,
      tokens: window.__hitster.game.players[window.__hitster.game.current].tokens,
    }));
    if (!(await clickText('👎 Cut it'))) {
      errors.push('no pre-lock dislike button in listening phase');
    } else {
      await page.waitForFunction(() => window.__hitster.previewState !== 'loading', { timeout: 30000 });
      const after = await page.evaluate(() => ({
        song: window.__hitster.game.mystery.title,
        tokens: window.__hitster.game.players[window.__hitster.game.current].tokens,
      }));
      if (after.song === before.song) errors.push('cutting a song did not move on to another');
      if (after.tokens !== before.tokens) errors.push('cutting a song cost a token');
      else console.log('  ✔ cut skips to a new song without spending a token');
    }
  }
  // place into the first open slot (often wrong on purpose — exercises discard + steal paths)
  await page.evaluate(() => document.querySelector('.slot:not([disabled])').click());
  if (!(await clickText('Lock it in'))) { errors.push(`turn ${turns}: no lock button`); break; }
  // exercise the challenge/steal UI on turn 2: pick a challenger, select a slot
  // (no token spent yet), then confirm — only the confirm spends the token
  if (turns === 2) {
    const challenged = await page.evaluate(() => {
      const picker = document.querySelector('.challenge-picker .btn');
      if (!picker) return 'no picker';
      picker.click();
      const tokensBefore = window.__hitster.game.players.map((p) => p.tokens).join(',');
      const slot = document.querySelector('.slot:not([disabled]):not(.selected):not(.challenged)');
      if (!slot) return 'no slot';
      slot.click();
      if (document.querySelector('.slot.challenged')) return 'challenged before confirm';
      if (window.__hitster.game.players.map((p) => p.tokens).join(',') !== tokensBefore) return 'token spent before confirm';
      const confirmBtn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Confirm challenge');
      if (!confirmBtn) return 'no confirm button';
      confirmBtn.click();
      if (!document.querySelector('.slot.challenged')) return 'slot not marked';
      if (window.__hitster.game.players.map((p) => p.tokens).join(',') === tokensBefore) return 'confirm did not spend a token';
      return 'ok';
    });
    if (challenged !== 'ok') errors.push(`challenge UI: ${challenged}`);
    else console.log('  ✔ challenge selected, then confirmed — token spent only on confirm');
  }
  // challenge phase (skipped automatically when nobody has tokens)
  if (await clickText('✨ Reveal!')) { /* revealed */ }
  // exercise the like/dislike learning loop on turn 1
  if (turns === 1) {
    await clickText('👎 Cut it');
    const rated = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('hitster.deck.t1')).songs.some((s) => s.rating === -1));
    if (!rated) errors.push('dislike did not persist to stored deck');
    else console.log('  ✔ dislike persisted to deck');
    const downDisabled = await page.evaluate(() =>
      [...document.querySelectorAll('button')].some((b) => b.textContent.includes('👎 Cut it') && b.disabled));
    if (!downDisabled) errors.push('dislike button not disabled after vote');
  }
  // every few turns, hand out a bonus token to keep challenges alive
  if (turns % 3 === 0) await clickText('+ ');
  if (!(await clickText('Next turn'))) { errors.push(`turn ${turns}: no next button`); break; }
  won = await page.evaluate(() => !document.querySelector('[data-screen="win"]').classList.contains('hidden'));
}
console.log(`  game ended after ${turns} turns, win screen: ${won}`);
if (!won) errors.push('never reached win screen');
if (won) {
  await step('winner named', () => page.$eval('#win-title', (n) => n.textContent.includes('wins') || n.textContent.includes('tie')));
  // Play again keeps the group and the deck — straight back into a game, no
  // setup detour and nobody re-typed.
  await step('play again reuses the group without the setup screen', async () => {
    const before = await page.evaluate(() => window.__hitster.game.players.map((p) => p.name).join(','));
    await clickText('Play again');
    return page.evaluate((names) => {
      const inGame = !document.querySelector('[data-screen="game"]').classList.contains('hidden');
      const g = window.__hitster.game;
      return inGame && g && g.players.map((p) => p.name).join(',') === names;
    }, before);
  });
  // ...and the mid-game escape hatch lands on setup with the group intact
  await step('change deck keeps the group', async () => {
    await page.evaluate(() => { document.querySelector('#btn-change-deck').click(); });
    return page.evaluate(() =>
      !document.querySelector('[data-screen="setup"]').classList.contains('hidden')
      && [...document.querySelectorAll('#player-inputs input')].length >= 2);
  });
}

// Every song revealed in that game must be counted in the stored deck — that
// count is what keeps the next game off the songs we just heard.
await step('revealed songs are counted against the stored deck', () => page.evaluate((played) => {
  const songs = JSON.parse(localStorage.getItem('hitster.deck.t1')).songs;
  const counted = songs.filter((s) => (s.plays ?? 0) > 0).length;
  return counted >= played && songs.every((s) => (s.plays ?? 0) <= 1);
}, turns));

// deck editor round trip against the REAL app flow (no iTunes call: manual-ish)
console.log('smoke: deck editor');
await step('to decks', async () => {
  await page.evaluate(() => document.querySelector('[data-nav="home"]').click());
  await clickText('♫ Decks');
  return visible('#deck-list');
});
await step('edit deck', async () => { await clickText('Edit'); return visible('#song-search'); });
await step('songs listed', () => page.$eval('#deck-songs', (n) => n.children.length === 24));
// The game just retired a pile of songs; the editor has to say so and offer
// the way back, or a deck quietly stops dealing with no explanation.
await step('retired songs are visible with a way to bring them back', () => page.evaluate(() => {
  const summary = document.querySelector('#deck-song-count').textContent;
  const badges = document.querySelectorAll('.played-badge').length;
  const resetOffered = !document.querySelector('#btn-reset-plays').classList.contains('hidden');
  return /already played and retired/.test(summary) && badges > 0 && resetOffered;
}));
await step('year edit persists', async () => {
  await page.evaluate(() => {
    const input = document.querySelector('#deck-songs .year-input');
    input.value = '1999';
    input.dispatchEvent(new Event('change'));
  });
  return page.evaluate(() => JSON.parse(localStorage.getItem('hitster.deck.t1')).songs.some((s) => s.year === 1999));
});
await step('both dislikes persisted (reveal vote + pre-lock vote)', () =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem('hitster.deck.t1')).songs.filter((s) => (s.rating ?? 0) < 0).length === 2));
await step('excluded badges show and Restore clears them', async () => {
  const hasBadge = await page.evaluate(() =>
    document.querySelectorAll('.rating-badge.negative').length === 2);
  if (!hasBadge) return false;
  for (let i = 0; i < 5 && await clickText('Restore'); i++) { /* restore each */ }
  return page.evaluate(() =>
    !JSON.parse(localStorage.getItem('hitster.deck.t1')).songs.some((s) => (s.rating ?? 0) < 0));
});
await step('deck filter narrows the list and edits target the right song', async () => {
  await page.evaluate(() => {
    const f = document.querySelector('#deck-filter');
    f.value = '1970';
    f.dispatchEvent(new Event('input'));
  });
  const narrowed = await page.evaluate(() =>
    document.querySelectorAll('#deck-songs .song-item').length === 1
    && document.querySelector('#deck-song-count').textContent.includes('1 of 24'));
  if (!narrowed) return false;
  // edit the filtered row's year and confirm it lands on Song 1970, not row 0
  await page.evaluate(() => {
    const input = document.querySelector('#deck-songs .year-input');
    input.value = '1971';
    input.dispatchEvent(new Event('change'));
  });
  const edited = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('hitster.deck.t1')).songs
      .find((s) => s.title === 'Song 1970').year === 1971);
  await page.evaluate(() => {
    const f = document.querySelector('#deck-filter');
    f.value = '';
    f.dispatchEvent(new Event('input'));
  });
  const restored = await page.evaluate(() =>
    document.querySelectorAll('#deck-songs .song-item').length === 24);
  return edited && restored;
});
await step('deck editor thumbs-down excludes directly', async () => {
  await page.evaluate(() => {
    const row = document.querySelector('#deck-songs .song-item');
    [...row.querySelectorAll('button')].find((b) => b.textContent === '👎').click();
  });
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem('hitster.deck.t1')).songs.filter((s) => (s.rating ?? 0) < 0).length === 1);
});

// A song no source can resolve must be quietly retired from the pile —
// players should never see the "preview unavailable" screen for it.
await step('unresolvable song is retired before anyone draws it', async () => {
  await clickText('← Decks');
  await clickText('← Back');
  await clickText('▶ New game');
  await clickText('Start game');
  return page.evaluate(async () => {
    const g = window.__hitster.game;
    if (!g) return false;
    const bad = { title: 'zqxvbnq wertyzzq unfindable', artist: 'nonexistent band xyzzy', year: 1999 };
    g.drawPile.push(bad); // top of the pile = the very next draw
    // prefetch() coalesces rather than dropping a request, and retries cards
    // demoted after a failed lookup, so awaiting it is enough. A couple of
    // passes covers a transient failure being retried before it is retired.
    for (let i = 0; i < 3 && g.drawPile.includes(bad); i++) {
      await window.__hitster.prefetch(1);
    }
    return !g.drawPile.includes(bad) && g.discard.includes(bad);
  });
});

// Endless deck: a nearly-empty pile refills itself with real discoveries
// from the deck's artists, and the stored deck grows with them.
// (Runs inside the still-active second game.)
await step('endless refill discovers new songs when the pile runs low', async () => {
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('hitster.deck.t1')).songs.length);
  const grew = await page.evaluate(async () => {
    const g = window.__hitster.game;
    if (!g || g.phase === 'gameover') return false;
    g.settings.endless = true;
    g.drawPile.length = 0; // force "running low"
    g.drawPile.push({ title: 'Levitating', artist: 'Dua Lipa', year: 2020, previewUrl: 'data:audio/mp3;base64,AAAA' });
    g.discard.length = 0; // keep the artist pool tight for determinism
    // up to 3 attempts with a pause: earlier steps may have tripped
    // Deezer's per-IP rate limit
    for (let i = 0; i < 3 && g.drawPile.length <= 1; i++) {
      await window.__hitster.refill();
      if (g.drawPile.length <= 1) await new Promise((r) => setTimeout(r, 6000));
    }
    return g.drawPile.length > 1
      && g.drawPile.some((c) => c.auto === true && Number.isInteger(c.year) && !!c.previewUrl);
  });
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('hitster.deck.t1')).songs.length);
  if (!(after > before)) errors.push('refill did not grow the stored deck');
  return grew;
});

// A slot between two consecutive years can never be filled, because nobody is
// dealt a year already on their timeline. It must not be offered at all.
console.log('smoke: dead slots between consecutive years');
await step('consecutive years render no slot between them', async () => {
  const seen = await page.evaluate(() => {
    const g = window.__hitster.game;
    if (!g) return { error: 'no game' };
    g.phase = 'listening';
    g.placedSlot = null;
    g.challenges = [];
    g.players[g.current].timeline = [
      { title: 'a', artist: 'x', year: 1990 },
      { title: 'b', artist: 'x', year: 2005 },
      { title: 'c', artist: 'x', year: 2006 },
      { title: 'd', artist: 'x', year: 2011 },
      { title: 'e', artist: 'x', year: 2012 },
    ];
    window.__hitster.render();
    // Walk the row in order: cards and slots as actually laid out.
    const row = document.querySelector('.timeline');
    const shape = [...row.children].map((n) => (n.classList.contains('slot')
      ? 'slot'
      : n.querySelector('.tc-year')?.textContent));
    return { shape, slots: row.querySelectorAll('.slot').length };
  });
  if (seen.error) { errors.push(seen.error); return false; }
  // 5 cards, 6 slot positions, two of them (2005|2006 and 2011|2012) closed
  const want = ['slot', '1990', 'slot', '2005', '2006', 'slot', '2011', '2012', 'slot'];
  const ok = seen.slots === 4 && JSON.stringify(seen.shape) === JSON.stringify(want);
  if (!ok) errors.push(`dead slots: ${JSON.stringify(seen)}`);
  return ok;
});

// Reduced/off effects have to actually cut work, not just relabel a button.
console.log('smoke: visual effects setting');
await step('settings screen offers three effect levels', async () => {
  await page.evaluate(() => {
    const g = window.__hitster.game;
    if (g) g.phase = 'gameover';
  });
  await page.evaluate(() => { document.querySelector('[data-nav="home"]')?.click(); });
  await page.evaluate(() => { document.querySelector('#btn-settings').click(); });
  return page.evaluate(() => document.querySelectorAll('.fx-choice').length === 3);
});
await step('reduced thins the room and is remembered', async () => {
  const state = await page.evaluate(async () => {
    [...document.querySelectorAll('.fx-choice')]
      .find((b) => b.textContent.includes('Reduced')).click();
    await new Promise((r) => setTimeout(r, 300));
    return {
      stored: localStorage.getItem('hitster.fxLevel'),
      level: window.__hitster.fx().level,
      lean: document.body.classList.contains('fx-lean'),
      selected: document.querySelector('.fx-choice.selected')?.textContent.includes('Reduced'),
    };
  });
  const ok = state.stored === 'reduced' && state.level === 'reduced' && state.lean && state.selected;
  if (!ok) errors.push(`reduced fx: ${JSON.stringify(state)}`);
  return ok;
});
await step('off detaches the canvas entirely', async () => {
  const state = await page.evaluate(async () => {
    [...document.querySelectorAll('.fx-choice')]
      .find((b) => b.textContent.includes('Off')).click();
    await new Promise((r) => setTimeout(r, 300));
    return {
      stored: localStorage.getItem('hitster.fxLevel'),
      attached: window.__hitster.fx().attached,
      canvasShown: getComputedStyle(document.querySelector('#stage-fx')).display,
    };
  });
  const ok = state.stored === 'off' && state.attached === false && state.canvasShown === 'none';
  if (!ok) errors.push(`off fx: ${JSON.stringify(state)}`);
  return ok;
});
await step('the level survives a reload', async () => {
  await page.reload({ waitUntil: 'networkidle0' });
  return page.evaluate(() => window.__hitster.fx().level === 'off'
    && document.body.classList.contains('fx-lean'));
});

// The china easter egg: lanterns, and a room that turns red and gold.
console.log('smoke: china mode');
await step('typing "china" lights the lanterns', async () => {
  await page.evaluate(async () => {
    // effects back on, or the canvas never attaches and nothing can be counted
    document.querySelector('#btn-settings').click();
    [...document.querySelectorAll('.fx-choice')].find((b) => b.textContent.includes('Full')).click();
    await new Promise((r) => setTimeout(r, 200));
  });
  for (const ch of 'china') await page.keyboard.press(ch);
  await new Promise((r) => setTimeout(r, 500));
  const state = await page.evaluate(() => ({
    china: window.__hitster.fx().china,
    lanterns: window.__hitster.fx().lanterns,
    body: document.body.classList.contains('china'),
    attached: window.__hitster.fx().attached,
  }));
  const ok = state.china && state.body && state.lanterns > 0 && state.attached;
  if (!ok) errors.push(`china on: ${JSON.stringify(state)}`);
  return ok;
});
await step('typing "china" again packs them away, and it is remembered', async () => {
  const remembered = await page.evaluate(() => localStorage.getItem('hitster.eggs') || '');
  for (const ch of 'china') await page.keyboard.press(ch);
  await new Promise((r) => setTimeout(r, 300));
  const state = await page.evaluate(() => ({
    china: window.__hitster.fx().china,
    body: document.body.classList.contains('china'),
    stored: localStorage.getItem('hitster.eggs') || '',
  }));
  const ok = remembered.includes('china') && !state.china && !state.body && !state.stored.includes('china');
  if (!ok) errors.push(`china off: ${JSON.stringify({ remembered, ...state })}`);
  return ok;
});

await browser.close();
server.close();

if (throttled.length) {
  const hosts = [...new Set(throttled.map((u) => new URL(u).host))].join(', ');
  console.log(`\nnote: ${throttled.length} lookup(s) throttled by ${hosts} — the app rode them out`);
}
if (errors.length) {
  console.log('\nSMOKE FAILED:');
  for (const e of errors) console.log('  ' + e);
  process.exit(1);
}
console.log('\nSMOKE PASSED — no console or page errors.');
