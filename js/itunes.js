// iTunes Search API — the deck builder's search/metadata source (release
// years, artwork). Note it only returns clean/censored tracks now, so
// preview AUDIO resolves Deezer-first in resolvePreview below.
import { jsonp } from './jsonp.js';
import { searchDeezer, searchDeezerTrack } from './deezer.js';

function toCard(result) {
  return {
    title: result.trackName,
    artist: result.artistName,
    year: result.releaseDate ? parseInt(result.releaseDate.slice(0, 4), 10) : null,
    previewUrl: result.previewUrl,
    artworkUrl: result.artworkUrl100
      ? result.artworkUrl100.replace('100x100', '300x300')
      : undefined,
    explicit: result.trackExplicitness === 'explicit' ? true : undefined,
    released: result.releaseDate ? result.releaseDate.slice(0, 10) : undefined,
  };
}

export async function searchSongs(term, { limit = 12 } = {}) {
  const url = 'https://itunes.apple.com/search?media=music&entity=song'
    + `&limit=${limit}&term=${encodeURIComponent(term)}`;
  const data = await jsonp(url);
  if (!data || !Array.isArray(data.results)) return [];
  return data.results
    .filter((r) => r.previewUrl && r.trackName && r.artistName)
    .map(toCard);
}

// Alternate-version markers. A result whose title/artist carries one of these
// when the requested song doesn't is almost never what you want to hear
// (learned the hard way: iTunes ranks "Espresso (On Vacation Version)" above
// the real "Espresso"). They're split by how wrong the result is.
//
// Markers meaning the audio isn't the recording at all — a karaoke backing
// track or a spoken "(Commentary)" cut can never be the right answer.
const NOT_THE_SONG = [
  'karaoke', 'instrumental', 'acapella', 'a cappella', 'tribute', 'cover',
  'lullaby', '8-bit', 'in the style of', 'originally performed', 'made famous',
  'commentary', 'interview',
];
// Markers meaning a different cut of the real recording — worse than the
// original, but still the song.
const ALT_CUT = ['remix', 'sped up', 'slowed', 'live', 'version'];

export const BAD_MARKERS = [...NOT_THE_SONG, ...ALT_CUT];

// Markers must match whole words. Substring matching read "Stayin' Alive" and
// "Alive" as live recordings, which silently disabled the penalty below for
// every result of those cards.
const MARKER_RES = BAD_MARKERS.map((w) => ({
  re: new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i'),
  cost: NOT_THE_SONG.includes(w) ? 12 : 5,
}));

function hasMarker(text, marker) {
  return marker.re.test(text);
}

// True when a track title reads as an alternate cut rather than the original.
export function looksLikeAltVersion(title) {
  return MARKER_RES.some((m) => hasMarker(title, m));
}

const PAREN_RE = /[([{]([^)\]}]*)[)\]}]/g;
const CREDIT_WORDS = ['feat', 'ft', 'featuring', 'with', 'and', 'x', '&'];

// Asides that label the original recording rather than an alternate cut.
// Deezer's only copy of "We Found Love" is titled "(Album Version)", and
// penalizing that let a dub mix outrank it.
const CANONICAL_QUALIFIERS = [
  'album version', 'album mix', 'original version', 'original mix',
  'single version', 'main version', 'original',
];

// The parenthesised/bracketed/dash-suffixed asides in a track title.
function qualifiers(title) {
  const segs = [];
  for (const m of title.matchAll(PAREN_RE)) segs.push(m[1].trim());
  const rest = title.replace(PAREN_RE, ' ').split(/\s+-\s+/).slice(1);
  for (const seg of rest) segs.push(seg.trim());
  return segs.filter(Boolean);
}

function isCredit(seg) {
  const first = seg.toLowerCase().replace(/^[\s.]+/, '').split(/[\s.]+/)[0];
  return CREDIT_WORDS.includes(first);
}

// Qualifiers the requested title never asked for. The fixed marker list only
// catches the ones it knows ("remix", "karaoke"); the real signal is that the
// result carries an aside the request doesn't — "(Tom Novy Ibiza Dub)",
// "(Printz Board vs zuper blahq)", "(Edit)" are all different recordings.
// A featured-artist credit is part of the original title, not an alternate cut.
export function alienQualifiers(resultTitle, wantTitle) {
  const want = bareTitle(wantTitle);
  return qualifiers(resultTitle).filter((s) => {
    if (isCredit(s) || CANONICAL_QUALIFIERS.includes(s.toLowerCase())) return false;
    // No Latin letters means it's the title written in another script
    // ("강남스타일"), not a description of a different recording.
    if (!/[a-z]/i.test(s)) return false;
    // Compared bare, or the deck's "(Sugar Pie Honey Bunch)" reads as alien
    // against Deezer's "(Sugar Pie, Honey Bunch)" over one comma.
    return !want.includes(bareTitle(s));
  });
}

// The title with its asides stripped, so a marker inside an aside is charged
// once by alienQualifiers rather than twice.
function baseTitle(title) {
  return title.replace(PAREN_RE, ' ').split(/\s+-\s+/)[0];
}

const BILLING_SPLIT = /\s*(?:,|&|\/|\bfeat\.?|\bft\.?|\bfeaturing\b|\bwith\b|\band\b|\bvs\.?|\bx\b)\s*/i;

// The individual acts in a billing, normalized. Comparing whole acts rather
// than substrings is what separates "The Kid LAROI & Justin Bieber" (the same
// record, differently billed) from "Tonight i'm Taylor Swift" (a cover band
// whose name happens to contain hers).
function billedActs(name) {
  return name.toLowerCase().split(BILLING_SPLIT)
    // Articles and honorifics are billing noise: Deezer files the deck's
    // "Ms. Lauryn Hill" under "Lauryn Hill".
    .map((s) => s.trim().replace(/^(?:the|ms|mrs|mr|dr)\.?\s+/, ''))
    // Stylised spellings are the same act: Ke$ha, P!nk, Beyoncé. Accents are
    // dropped rather than spaced out, or "Sinéad" would split in two.
    .map((s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\$/g, 's').replace(/!/g, 'i')
      .replace(/[^a-z0-9]+/g, ' ').trim())
    .filter(Boolean);
}

function artistScore(artist, wantArtist) {
  if (artist === wantArtist) return 6;
  const acts = billedActs(artist);
  const want = billedActs(wantArtist);
  if (acts.some((x) => want.includes(x))) return 4;
  // A trailing tag is the same act ("Soulja Boy Tell'em"), but a name that
  // merely ends with the artist is a different one ("Tonight i'm Taylor
  // Swift") — so only a leading match counts, and it counts for less. The
  // shorter name must be at least two words: one word is the start of far too
  // many unrelated acts ("Queen" / "Queen Esther").
  const extends_ = (long, short) => short.includes(' ') && long.startsWith(`${short} `);
  if (acts.some((a) => want.some((w) => extends_(a, w) || extends_(w, a)))) return 2;
  return -6; // a different performer entirely: a cover, not the record we want
}

// Punctuation is not part of a song's identity: Deezer files The Archies'
// "Sugar, Sugar" as "Sugar Sugar", and a comma should not hide it. Letters of
// every script survive — dropping them made "California Love 加洲之愛", a
// 104-second bootleg, look like an exact match for "California Love".
function bareTitle(title) {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// Scoring a title that matches nothing at zero let a search miss fall through
// to any other song by the same artist — "Physical" resolved to "Hopelessly
// Devoted to You". Off-title results are disqualified, not merely outscored.
const NOT_THIS_SONG = -1;

export function scoreMatch(card, result) {
  const t = result.title.toLowerCase();
  const a = result.artist.toLowerCase();
  const wantT = card.title.toLowerCase();
  const wantA = card.artist.toLowerCase();
  const bare = bareTitle(result.title);
  const wantBare = bareTitle(card.title);
  let score = 0;
  if (bare === wantBare) score += 6;
  else if (bare.startsWith(`${wantBare} `)) score += 3;
  else if (bare.includes(wantBare)) score += 1;
  else return NOT_THIS_SONG;
  score += artistScore(a, wantA);
  const base = baseTitle(t);
  for (const m of MARKER_RES) {
    if (hasMarker(base, m) && !hasMarker(wantT, m)) score -= m.cost;
    if (hasMarker(a, m) && !hasMarker(wantA, m)) score -= m.cost;
  }
  // An unwanted aside is an alternate cut, and costs whatever its strongest
  // marker costs. Charged once, not on top of the loop above — a remix by the
  // right artist is still a better answer than a cover by the wrong one.
  for (const seg of alienQualifiers(result.title, card.title)) {
    score -= Math.max(4, ...MARKER_RES.filter((m) => hasMarker(seg, m)).map((m) => m.cost));
  }
  // Some Deezer rows hide the alternate cut in the album only. In particular,
  // its current plain-titled "Hips Don't Lie" result comes from an album whose
  // name ends in LIVE. Without carrying and scoring that metadata, the live
  // recording looks more exact than the original single.
  const album = result.albumTitle || '';
  for (const m of MARKER_RES) {
    if (hasMarker(album, m) && !hasMarker(wantT, m) && !hasMarker(wantA, m)) {
      score -= m.cost;
    }
  }
  return score;
}

// Title and artist decide it; ties go to the more popular recording, and only
// then to the explicit cut. Popularity has to outrank explicitness: Deezer
// carries a 153-second "HELLO" credited to Adele that is flagged explicit, and
// an explicit bonus inside the score was enough to beat the real single.
function betterThan(card, r, best) {
  const s = scoreMatch(card, r);
  const bs = scoreMatch(card, best);
  if (s !== bs) return s > bs;
  const rank = r.rank || 0;
  const bestRank = best.rank || 0;
  if (rank !== bestRank) return rank > bestRank;
  return !!r.explicit && !best.explicit;
}

export function pickBestMatch(card, results) {
  let best = null;
  for (const r of results) {
    // require a positive score — a bad match is worse than none
    if (scoreMatch(card, r) <= 0) continue;
    if (!best || betterThan(card, r, best)) best = r;
  }
  return best;
}

// The release date that orders songs sharing a year. Taken only when the
// matched result agrees with the deck's curated year — iTunes hands back
// compilation and remaster dates, and the curated year is the authority.
export function pickReleaseDate(card, results) {
  const match = pickBestMatch(card, results);
  if (!match || !match.released) return null;
  if (match.year !== card.year) return null;
  return match.released;
}

// One lookup per song, cached on the deck afterwards. Null means "no date
// worth trusting", which leaves same-year placements a free choice.
export async function resolveReleaseDate(card) {
  const results = await searchSongs(`${card.title} ${card.artist}`, { limit: 12 });
  return pickReleaseDate(card, results);
}

function withPreview(card, match) {
  return {
    ...card,
    previewUrl: match.previewUrl,
    artworkUrl: card.artworkUrl || match.artworkUrl,
    explicit: match.explicit,
  };
}

// Exact title by the exact artist. Anything this good ends the search.
const CONFIDENT_SCORE = 12;
// Below this, the best Deezer had was an alternate cut or a shaky artist
// match, so iTunes gets a say — Deezer has dropped some originals entirely
// (it no longer carries the 2014 "Shake It Off").
const ACCEPTABLE_SCORE = 8;

// Deezer indexes "Black Eyed Peas", not "The Black Eyed Peas", and a scoped
// query is literal — so the article has to come off for the retry.
function artistVariants(artist) {
  const bare = artist.replace(/^the\s+/i, '');
  return bare === artist ? [artist] : [artist, bare];
}

// Preview URLs are CDN links that can go stale, and seed songs start without
// one. Re-find the song and return a copy with a fresh previewUrl, keeping the
// deck's curated year. Deezer first (it has the original/explicit versions;
// iTunes search is clean-only), iTunes as fallback.
//
// Deezer is asked in narrowing order: the field-scoped query surfaces the
// canonical recording that free text misses, and free text is the backstop for
// songs whose deck spelling doesn't match Deezer's fields. Candidates
// accumulate so the winner is the best across everything asked, and a
// confident hit stops early to keep the common case at one request.
export async function resolvePreview(card) {
  const candidates = [];
  const seen = new Set();
  const collect = (rows) => {
    for (const r of rows) {
      if (r.previewUrl && !seen.has(r.previewUrl)) {
        seen.add(r.previewUrl);
        candidates.push(r);
      }
    }
  };
  const goodEnough = (min) => {
    const best = pickBestMatch(card, candidates);
    return best && scoreMatch(card, best) >= min ? best : null;
  };
  try {
    for (const artist of artistVariants(card.artist)) {
      collect(await searchDeezerTrack(card.title, artist, { limit: 12 }));
      const confident = goodEnough(CONFIDENT_SCORE);
      if (confident) return withPreview(card, confident);
    }
    collect(await searchDeezer(`${card.title} ${card.artist}`, { limit: 12 }));
    const acceptable = goodEnough(ACCEPTABLE_SCORE);
    if (acceptable) return withPreview(card, acceptable);
  } catch { /* Deezer down — iTunes decides alone */ }
  try {
    collect(await searchSongs(`${card.title} ${card.artist}`, { limit: 12 }));
  } catch (err) {
    // A timed-out search is transient; the caller retries it. Only report a
    // definitive miss when we genuinely have nothing.
    if (!candidates.length) throw err;
  }
  const match = pickBestMatch(card, candidates);
  if (!match) throw new Error(`No preview found for "${card.title}"`);
  return withPreview(card, match);
}
