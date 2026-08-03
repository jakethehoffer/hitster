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
    albumTitle: track.album && track.album.title ? track.album.title : undefined,
    explicit: track.explicit_lyrics ? true : undefined,
    rank: typeof track.rank === 'number' ? track.rank : undefined,
  };
}

// Deezer reports failures (e.g. rate-limit quota) as a 200 with an error
// payload. Those must THROW — swallowing them as "no results" made a quota
// blip look like a song that doesn't exist.
function checkDeezerError(data) {
  if (data && data.error) {
    throw new Error(data.error.message || 'Deezer error');
  }
}

export async function searchDeezer(term, { limit = 12 } = {}) {
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(term)}&limit=${limit}&output=jsonp`;
  const data = await jsonp(url);
  checkDeezerError(data);
  if (!data || !Array.isArray(data.data)) return [];
  return data.data
    .filter((t) => t.preview && t.title && t.artist)
    .map(deezerTrackToCard);
}

// Field-scoped lookup. Free-text search ranks by relevance across the whole
// catalogue and can drop the canonical recording entirely — "Hollaback Girl
// Gwen Stefani" returns two remixes and a wall of karaoke, with the actual
// single nowhere in the first 40 results. Scoping to the artist and track
// fields puts the original first (verified 2026-08-01).
export async function searchDeezerTrack(title, artist, { limit = 12 } = {}) {
  const q = `artist:"${artist.replace(/"/g, '')}" track:"${title.replace(/"/g, '')}"`;
  return searchDeezer(q, { limit });
}

// Popular tracks by an artist — the raw material for endless-deck refills.
// Cards carry albumId/albumTitle so the caller can fetch a release year.
export async function artistTopTracks(artistName, { limit = 25 } = {}) {
  const q = `artist:"${artistName}"`;
  const url = `https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=${limit}&output=jsonp`;
  const data = await jsonp(url);
  checkDeezerError(data);
  if (!data || !Array.isArray(data.data)) return [];
  return data.data
    .filter((t) => t.preview && t.title && t.artist)
    .map((t) => ({
      ...deezerTrackToCard(t),
      albumId: t.album ? t.album.id : null,
      albumTitle: t.album ? t.album.title : '',
    }));
}

export async function albumYear(albumId) {
  if (!albumId) return null;
  const data = await jsonp(`https://api.deezer.com/album/${albumId}?output=jsonp`);
  checkDeezerError(data);
  const date = data && data.release_date;
  const year = date ? parseInt(date.slice(0, 4), 10) : NaN;
  return Number.isInteger(year) && year >= 1900 ? year : null;
}

// Compilations and reissues carry the wrong year for the timeline game.
const COMPILATION_MARKERS = [
  'greatest', 'best of', 'hits', 'collection', 'anthology', 'essential',
  'live', 'karaoke', 'tribute', 'remaster', 'compilation',
];

export function looksLikeCompilation(albumTitle) {
  const t = (albumTitle || '').toLowerCase();
  return COMPILATION_MARKERS.some((w) => t.includes(w));
}
