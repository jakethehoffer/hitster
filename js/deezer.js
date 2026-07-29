// Deezer search — the preview source for original (explicit) versions.
// Apple's Search API stopped returning explicit tracks entirely (verified
// 2026-07-28: even WAP comes back "cleaned"), so previews resolve here first.
import { jsonp } from './jsonp.js';

export function deezerTrackToCard(track) {
  return {
    title: track.title,
    artist: track.artist ? track.artist.name : '',
    previewUrl: track.preview || undefined,
    artworkUrl: track.album && track.album.cover_medium ? track.album.cover_medium : undefined,
    explicit: track.explicit_lyrics ? true : undefined,
  };
}

export async function searchDeezer(term, { limit = 12 } = {}) {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=${limit}&output=jsonp`;
  const data = await jsonp(url);
  if (!data || !Array.isArray(data.data)) return [];
  return data.data
    .filter((t) => t.preview && t.title && t.artist)
    .map(deezerTrackToCard);
}
