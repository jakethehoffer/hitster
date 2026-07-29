// Headless E2E smoke test for digital Hitster.
// Serves the project dir, drives a full 2-player game to the win screen,
// and fails on any page/console error.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

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
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

// Silence real audio and confirm dialogs before any page script runs.
await page.evaluateOnNewDocument(() => {
  HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
  HTMLMediaElement.prototype.pause = function () {};
  window.confirm = () => true;
});

await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0' });

// Install a deterministic test deck (with fake previews so no iTunes calls),
// and mark the seed as installed so only the test deck exists.
await page.evaluate(() => {
  localStorage.clear();
  const songs = Array.from({ length: 24 }, (_, i) => ({
    title: `Song ${1960 + i * 2}`, artist: 'Test Artist', year: 1960 + i * 2,
    previewUrl: 'data:audio/mp3;base64,AAAA',
  }));
  for (const key of ['starter', 'rap', 'pop']) {
    localStorage.setItem(`hitster.seedInstalled.${key}`, '1');
  }
  localStorage.setItem('hitster.deckIndex', JSON.stringify(['t1']));
  localStorage.setItem('hitster.deck.t1', JSON.stringify({ id: 't1', name: 'Test Deck', songs }));
});
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
  // spacebar toggles playback during a turn (must not crash or scroll away)
  if (turns === 1) await page.keyboard.press('Space');
  // rate the song BEFORE locking in (listening-phase vote row)
  if (turns === 3) {
    if (!(await clickText('👎 Cut it'))) errors.push('no pre-lock dislike button in listening phase');
  }
  // place into the first open slot (often wrong on purpose — exercises discard + steal paths)
  await page.evaluate(() => document.querySelector('.slot:not([disabled])').click());
  if (!(await clickText('Lock it in'))) { errors.push(`turn ${turns}: no lock button`); break; }
  // exercise the challenge/steal UI on turn 2: pick a challenger, then a free slot
  if (turns === 2) {
    const challenged = await page.evaluate(() => {
      const picker = document.querySelector('.challenge-picker .btn');
      if (!picker) return 'no picker';
      picker.click();
      const slot = document.querySelector('.slot:not([disabled]):not(.selected):not(.challenged)');
      if (!slot) return 'no slot';
      slot.click();
      return document.querySelector('.slot.challenged') ? 'ok' : 'slot not marked';
    });
    if (challenged !== 'ok') errors.push(`challenge UI: ${challenged}`);
    else console.log('  ✔ challenge placed via UI');
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
  await step('play again -> setup', async () => { await clickText('Play again'); return visible('#btn-start-game'); });
}

// deck editor round trip against the REAL app flow (no iTunes call: manual-ish)
console.log('smoke: deck editor');
await step('to decks', async () => {
  await page.evaluate(() => document.querySelector('[data-nav="home"]').click());
  await clickText('♫ Decks');
  return visible('#deck-list');
});
await step('edit deck', async () => { await clickText('Edit'); return visible('#song-search'); });
await step('songs listed', () => page.$eval('#deck-songs', (n) => n.children.length === 24));
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

await browser.close();
server.close();

if (errors.length) {
  console.log('\nSMOKE FAILED:');
  for (const e of errors) console.log('  ' + e);
  process.exit(1);
}
console.log('\nSMOKE PASSED — no console or page errors.');
