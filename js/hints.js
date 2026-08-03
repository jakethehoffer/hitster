// What a token buys when a song won't come to you.
//
// The game asks for a year, so no hint may state one — a decade clue is the
// answer wearing a hat. These help you name the record instead: the shape of
// the title, the shape of the artist, or a blurred look at the sleeve. Knowing
// the song is what tells you the year, and that part is still on you.

export const HINT_KINDS = ['title', 'artist', 'cover'];

const LETTER = /\p{L}/u;
const ALNUM = /[\p{L}\p{N}]/u;

function maskWord(word) {
  let opened = false;
  let out = '';
  for (const ch of word) {
    if (!ALNUM.test(ch)) { out += ch; continue; }
    if (!opened) {
      opened = true;
      // A leading digit would hand over the era for titles like "1999".
      out += LETTER.test(ch) ? ch : '#';
      continue;
    }
    out += '_';
  }
  return out;
}

// "Hips Don't Lie" -> "H___ D__'_ L__"
export function maskWords(text) {
  return String(text ?? '').trim().split(/\s+/).filter(Boolean).map(maskWord)
    .join(' ');
}

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

// { kind, label, text?, image? } — never the year, and never the plain title.
export function hintReveal(card, kind) {
  if (!hintAvailable(card, kind)) return null;
  if (kind === 'cover') {
    return { kind, label: hintLabel(kind), image: card.artworkUrl };
  }
  const source = kind === 'title' ? card.title : card.artist;
  const words = wordCount(source);
  return {
    kind,
    label: hintLabel(kind),
    text: maskWords(source),
    note: `${words} word${words === 1 ? '' : 's'}`,
  };
}
