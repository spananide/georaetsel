import { PUZZLES } from '../data/wabe.js';
import { mulberry32 } from '../georaetsel/game.js';
import { dayNumber } from '../woertel/logic.js';

export const RANKS = [
  { pct: 0, name: 'Anfänger' },
  { pct: 5, name: 'Guter Start' },
  { pct: 10, name: 'Wird besser' },
  { pct: 20, name: 'Solide' },
  { pct: 30, name: 'Gut' },
  { pct: 45, name: 'Toll' },
  { pct: 60, name: 'Fabelhaft' },
  { pct: 75, name: 'Genie' },
  { pct: 100, name: 'Alle Wörter' },
];

let lastCache = null;

// Returns puzzle definition for given seed and mode (memoised)
export function puzzleFor(seed, mode = 'daily') {
  const cacheKey = `${mode}:${seed}`;
  if (lastCache && lastCache.key === cacheKey) {
    return lastCache.puzzle;
  }

  const idx = mode === 'practice'
    ? Math.floor(mulberry32(seed)() * PUZZLES.length)
    : ((dayNumber(seed) % PUZZLES.length) + PUZZLES.length) % PUZZLES.length;

  const [lettersStr, wordsStr] = PUZZLES[idx];
  const center = lettersStr[0];
  const outer = [...lettersStr.slice(1)];
  const letters = [...lettersStr];
  const words = wordsStr.split(' ');
  const wordSet = new Set(words);
  const pangrams = words.filter(w => new Set(w).size === 7);

  const puzzle = {
    center,
    outer,
    letters,
    words,
    wordSet,
    pangrams,
    total: 0,
  };

  puzzle.total = words.reduce((acc, w) => acc + pointsOf(w, puzzle), 0);
  lastCache = { key: cacheKey, puzzle };
  return puzzle;
}

// Points for a word: 4 letters = 1, longer = length, pangram gets +7
export function pointsOf(word, puzzle) {
  if (!word) return 0;
  const len = word.length;
  if (len < 4) return 0;
  const base = len === 4 ? 1 : len;
  const isPangram = puzzle?.pangrams
    ? puzzle.pangrams.includes(word)
    : (new Set(word).size === 7);
  return base + (isPangram ? 7 : 0);
}

// Create a new round object
export function newRound(seed, mode = 'daily') {
  const puzzle = puzzleFor(seed, mode);
  const rand = mulberry32(seed);
  const order = [...puzzle.outer];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    seed,
    mode,
    found: [],
    order,
    pangram: false,
    state: 'playing',
    ms: 0,
  };
}

// Submit a word to the round
export function submit(round, rawWord) {
  if (!round || round.state !== 'playing') {
    return { result: 'ignored', points: 0 };
  }

  const word = String(rawWord || '').trim().toUpperCase();
  if (word.length < 4) {
    return { result: 'short', points: 0 };
  }

  const puzzle = puzzleFor(round.seed, round.mode);
  const letterSet = new Set(puzzle.letters);
  for (const ch of word) {
    if (!letterSet.has(ch)) {
      return { result: 'badletter', points: 0 };
    }
  }

  if (!word.includes(puzzle.center)) {
    return { result: 'nocenter', points: 0 };
  }

  if (round.found.includes(word)) {
    return { result: 'known', points: 0 };
  }

  if (!puzzle.wordSet.has(word)) {
    return { result: 'notword', points: 0 };
  }

  const pts = pointsOf(word, puzzle);
  const isPangram = puzzle.pangrams.includes(word);
  round.found.push(word);
  if (isPangram) {
    round.pangram = true;
  }
  if (round.found.length >= puzzle.words.length) {
    round.state = 'done';
  }

  return {
    result: isPangram ? 'pangram' : 'ok',
    points: pts,
  };
}

// End the round (player gives up)
export function finish(round) {
  if (round) {
    round.state = 'done';
  }
}

// Calculate points found so far
export function scoreOf(round) {
  if (!round || !round.found || round.found.length === 0) return 0;
  const puzzle = puzzleFor(round.seed, round.mode);
  return round.found.reduce((sum, w) => sum + pointsOf(w, puzzle), 0);
}

// Determine current rank object { name, index, next }
export function rankOf(round) {
  const score = scoreOf(round);
  const puzzle = puzzleFor(round.seed, round.mode);
  const total = puzzle.total;

  let index = 0;
  for (let i = RANKS.length - 1; i >= 0; i--) {
    const req = Math.ceil(total * RANKS[i].pct / 100);
    if (score >= req) {
      index = i;
      break;
    }
  }

  const name = RANKS[index].name;
  const next = index < RANKS.length - 1 ? Math.ceil(total * RANKS[index + 1].pct / 100) : null;
  return { name, index, next };
}

// Shuffle the 6 outer letters randomly (in-place and returns order)
export function shuffleOuter(round) {
  if (!round || !round.order) return;
  const arr = [...round.order];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  round.order = arr;
  return round.order;
}

// Share text generation
export function shareText(round, label, url) {
  const puzzle = puzzleFor(round.seed, round.mode);
  const rank = rankOf(round);
  const found = (round.found || []).length;
  const words = puzzle.words.length;
  const score = scoreOf(round);
  return [
    `Wabe ${label}`,
    `${rank.name} · ${found} von ${words} Wörtern · ${score} Punkte`,
    url,
  ].join('\n');
}
