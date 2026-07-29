// iTunes Search API via JSONP. The API sends no CORS headers, so fetch/XHR
// fail from a browser — script-tag injection works everywhere, file:// included.

let jsonpCounter = 0;

function jsonp(url, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    jsonpCounter += 1;
    const cbName = `__hitsterJsonp${jsonpCounter}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Search timed out'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      delete window[cbName];
      script.remove();
    }

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error('Search request failed'));
    };
    script.src = `${url}&callback=${cbName}`;
    document.head.appendChild(script);
  });
}

function toCard(result) {
  return {
    title: result.trackName,
    artist: result.artistName,
    year: result.releaseDate ? parseInt(result.releaseDate.slice(0, 4), 10) : null,
    previewUrl: result.previewUrl,
    artworkUrl: result.artworkUrl100
      ? result.artworkUrl100.replace('100x100', '300x300')
      : undefined,
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
const BAD_MARKERS = [
  'karaoke', 'instrumental', 'acapella', 'a cappella', 'tribute', 'cover',
  'remix', 'sped up', 'slowed', 'live', 'lullaby', '8-bit', 'version',
  'in the style of', 'originally performed', 'made famous',
];

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
// deck's curated year.
export async function resolvePreview(card) {
  const results = await searchSongs(`${card.title} ${card.artist}`, { limit: 12 });
  const match = pickBestMatch(card, results);
  if (!match || !match.previewUrl) {
    throw new Error(`No preview found for "${card.title}"`);
  }
  return { ...card, previewUrl: match.previewUrl, artworkUrl: card.artworkUrl || match.artworkUrl };
}
