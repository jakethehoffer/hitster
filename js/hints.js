// What a token buys when a song won't come to you.
//
// The game asks for a year, so no clue may state one — a decade clue is the
// answer wearing a hat. Everything else about the record is fair game: a clue
// names the title outright, names the artist outright, or shows the sleeve.
// Knowing what the song is tells you nothing about when it came out unless you
// already knew the song, which is exactly the game.

export const HINT_KINDS = ['title', 'artist', 'cover'];

export function wordCount(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).length;
}

export function hintLabel(kind) {
  if (kind === 'title') return '🔤 Title';
  if (kind === 'artist') return '🎤 Artist';
  if (kind === 'cover') return '💿 Cover';
  return '💡 Clue';
}

// A hint is only offered when the card carries what it would reveal.
export function hintAvailable(card, kind) {
  if (!card) return false;
  if (kind === 'title') return wordCount(card.title) > 0;
  if (kind === 'artist') return wordCount(card.artist) > 0;
  if (kind === 'cover') return !!card.artworkUrl;
  return false;
}

// { kind, label, text?, image? } — the card's own words, never the year.
export function hintReveal(card, kind) {
  if (!hintAvailable(card, kind)) return null;
  if (kind === 'cover') {
    return { kind, label: hintLabel(kind), image: card.artworkUrl };
  }
  return {
    kind,
    label: hintLabel(kind),
    text: kind === 'title' ? card.title : card.artist,
  };
}
