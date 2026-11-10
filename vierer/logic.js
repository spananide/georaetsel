import { PUZZLES } from '../data/vierer.js';
import { mulberry32 } from '../georaetsel/game.js';
import { dayNumber } from '../woertel/logic.js';

export { PUZZLES, dayNumber };

// Fixed puzzle order: indices 0..23 shuffled once with mulberry32(20261110)
function buildOrder() {
  const rand = mulberry32(20261110);
  const order = Array.from({ length: PUZZLES.length }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export const ORDER = buildOrder();

let lastKey = null;
let lastPuzzle = null;

// Return puzzle structure for given seed and mode with memoisation
export function puzzleFor(seed, mode = 'daily') {
  const key = `${mode}:${seed}`;
  if (lastKey === key && lastPuzzle) {
    return lastPuzzle;
  }
  let raw;
  if (mode === 'practice') {
    const rand = mulberry32(seed);
    const idx = Math.floor(rand() * PUZZLES.length);
    raw = PUZZLES[idx];
  } else {
    const day = dayNumber(seed);
    const idx = ((day % ORDER.length) + ORDER.length) % ORDER.length;
    raw = PUZZLES[ORDER[idx]];
  }
  const result = {
    groups: raw.map(([name, words], level) => ({
      name,
      words: [...words],
      level,
    })),
  };
  lastKey = key;
  lastPuzzle = result;
  return result;
}

// Initialise a new round object
export function newRound(seed, mode = 'daily') {
  const puzzle = puzzleFor(seed, mode);
  const words = puzzle.groups.flatMap(g => g.words);
  const rand = mulberry32(seed + 1);
  const order = [...words];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    seed,
    mode,
    order,
    selected: [],
    solved: [],
    guesses: [],
    mistakes: 0,
    state: 'playing',
    ms: 0,
    history: [],
  };
}

// Toggle word selection (max 4, only if playing and word is in order)
export function toggleSelect(round, word) {
  if (round.state !== 'playing') return;
  if (!round.order.includes(word)) return;
  const idx = round.selected.indexOf(word);
  if (idx !== -1) {
    round.selected.splice(idx, 1);
  } else if (round.selected.length < 4) {
    round.selected.push(word);
  }
}

// Shuffle remaining words
export function shuffle(round) {
  if (round.state !== 'playing') return;
  for (let i = round.order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [round.order[i], round.order[j]] = [round.order[j], round.order[i]];
  }
}

// Deselect all selected words
export function deselect(round) {
  round.selected = [];
}

// Submit current selection against puzzle
export function submit(round, puzzle = puzzleFor(round.seed, round.mode)) {
  if (round.state !== 'playing') return { result: 'incomplete' };
  if (!round.selected || round.selected.length !== 4) {
    return { result: 'incomplete' };
  }

  // Lookup group level for each selected word
  const wordToLevel = new Map();
  for (const g of puzzle.groups) {
    for (const w of g.words) {
      wordToLevel.set(w, g.level);
    }
  }

  const levels = round.selected.map(w => wordToLevel.get(w));

  // Check repeat: same 4 words (in any order)
  if (!round.history) round.history = [];
  const guessKey = [...round.selected].sort().join('|');
  if (round.history.includes(guessKey)) {
    return { result: 'repeat' };
  }
  round.history.push(guessKey);

  // Check if all four belong to the same group
  const allSame = levels.every(lvl => lvl === levels[0]);
  if (allSame) {
    const level = levels[0];
    round.guesses.push(levels);
    round.solved.push(level);
    round.order = round.order.filter(w => !round.selected.includes(w));
    round.selected = [];
    if (round.solved.length === 4) {
      round.state = 'won';
    }
    return { result: 'correct', level };
  }

  // Mistake
  round.mistakes++;
  round.guesses.push(levels);

  const counts = {};
  for (const lvl of levels) {
    counts[lvl] = (counts[lvl] || 0) + 1;
  }
  const isOneAway = Object.values(counts).includes(3);

  if (round.mistakes >= 4) {
    round.state = 'lost';
    round.selected = [];
    const allLevels = [0, 1, 2, 3];
    round.missed = allLevels.filter(lvl => !round.solved.includes(lvl));
    round.solved.push(...round.missed);
    round.order = [];
  }

  return { result: isOneAway ? 'oneaway' : 'wrong' };
}

// Format result for clipboard / web share
export function shareText(round, label, url) {
  const emojis = ['🟨', '🟩', '🟦', '🟪'];
  const lines = [`Vierer ${label}`];
  for (const g of round.guesses) {
    lines.push(g.map(lvl => emojis[lvl]).join(''));
  }
  lines.push(round.mistakes === 0 ? 'Fehlerfrei' : `${round.mistakes} Fehler`);
  lines.push(url);
  return lines.join('\n');
}
