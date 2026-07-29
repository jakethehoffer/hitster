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

// Preview URLs are CDN links that can go stale. Re-find the song and return a
// copy of the card with a fresh previewUrl (keeping the deck's curated year).
export async function resolvePreview(card) {
  const results = await searchSongs(`${card.title} ${card.artist}`, { limit: 5 });
  const match = results.find((r) =>
    r.title.toLowerCase().startsWith(card.title.toLowerCase().slice(0, 8))) || results[0];
  if (!match || !match.previewUrl) {
    throw new Error(`No preview found for "${card.title}"`);
  }
  return { ...card, previewUrl: match.previewUrl, artworkUrl: card.artworkUrl || match.artworkUrl };
}
