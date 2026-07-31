// iTunes Search API — the deck builder's search/metadata source (release
// years, artwork). Note it only returns clean/censored tracks now, so
// preview AUDIO resolves Deezer-first in resolvePreview below.
import { jsonp } from './jsonp.js';
import { searchDeezer } from './deezer.js';

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

// Alternate-version markers. A result whose title/artist contains one of these
// when the requested song doesn't is almost never what you want to hear
// (learned the hard way: iTunes ranks "Espresso (On Vacation Version)" above
// the real "Espresso").
export const BAD_MARKERS = [
  'karaoke', 'instrumental', 'acapella', 'a cappella', 'tribute', 'cover',
  'remix', 'sped up', 'slowed', 'live', 'lullaby', '8-bit', 'version',
  'in the style of', 'originally performed', 'made famous',
];

// True when a track title reads as an alternate cut rather than the original.
export function looksLikeAltVersion(title) {
  const t = title.toLowerCase();
  return BAD_MARKERS.some((w) => t.includes(w));
}

export function scoreMatch(card, result) {
  const t = result.title.toLowerCase();
  const a = result.artist.toLowerCase();
  const wantT = card.title.toLowerCase();
  const wantA = card.artist.toLowerCase();
  let score = 0;
  if (t === wantT) score += 6;
  else if (t.startsWith(wantT)) score += 3;
  else if (t.includes(wantT)) score += 1;
  if (a === wantA) score += 6;
  else if (a.includes(wantA) || wantA.includes(a)) score += 4;
  for (const w of BAD_MARKERS) {
    if (t.includes(w) && !wantT.includes(w)) score -= 5;
    if (a.includes(w) && !wantA.includes(w)) score -= 5;
  }
  // Prefer the explicit original over radio/clean edits when otherwise equal.
  if (result.explicit) score += 2;
  return score;
}

export function pickBestMatch(card, results) {
  let best = null;
  let bestScore = 0; // require a positive score — a bad match is worse than none
  for (const r of results) {
    const s = scoreMatch(card, r);
    if (s > bestScore) { bestScore = s; best = r; }
  }
  return best;
}

// Preview URLs are CDN links that can go stale, and seed songs start without
// one. Re-find the song and return a copy with a fresh previewUrl, keeping the
// deck's curated year. Deezer first (it has the original/explicit versions;
// iTunes search is clean-only), iTunes as fallback.
export async function resolvePreview(card) {
  try {
    const dz = await searchDeezer(`${card.title} ${card.artist}`, { limit: 12 });
    const match = pickBestMatch(card, dz);
    if (match && match.previewUrl) {
      return {
        ...card,
        previewUrl: match.previewUrl,
        artworkUrl: card.artworkUrl || match.artworkUrl,
        explicit: match.explicit,
      };
    }
  } catch { /* Deezer down — fall through to iTunes */ }
  const results = await searchSongs(`${card.title} ${card.artist}`, { limit: 12 });
  const match = pickBestMatch(card, results);
  if (!match || !match.previewUrl) {
    throw new Error(`No preview found for "${card.title}"`);
  }
  return {
    ...card,
    previewUrl: match.previewUrl,
    artworkUrl: card.artworkUrl || match.artworkUrl,
    explicit: match.explicit,
  };
}
