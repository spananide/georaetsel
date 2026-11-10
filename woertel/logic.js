import { VALID, ANSWERS } from '../data/woerter.js';
import { mulberry32 } from '../georaetsel/game.js';

export const WORD_LEN = 5;
export const MAX_GUESSES = 6;

// Fixed answer order: ANSWERS shuffled once with Fisher-Yates using mulberry32(20261110)
function buildOrder() {
  const rand = mulberry32(20261110);
  const order = [...ANSWERS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export const ORDER = buildOrder();

const VALID_SET = new Set([...VALID, ...ANSWERS]);

// Convert a seed number like 20261110 into day count since UTC epoch
export function dayNumber(seed) {
  const s = String(seed);
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

// Secret word for daily or practice mode
export function answerFor(seed, mode = 'daily') {
  if (mode === 'practice') {
    const rand = mulberry32(seed);
    return ANSWERS[Math.floor(rand() * ANSWERS.length)];
  }
  const idx = ((dayNumber(seed) % ORDER.length) + ORDER.length) % ORDER.length;
  return ORDER[idx];
}

// Initialise a new round object
export function newRound(seed, mode = 'daily') {
  return {
    seed,
    answer: answerFor(seed, mode),
    guesses: [],
    state: 'playing',
    ms: 0,
  };
}

// Wordle two-pass evaluation of a 5-letter guess against answer
export function evaluate(guess, answer) {
  const res = new Array(WORD_LEN).fill('miss');
  const remaining = {};

  // Pass 1: mark exact hits and record remaining answer letters
  for (let i = 0; i < WORD_LEN; i++) {
    if (guess[i] === answer[i]) {
      res[i] = 'hit';
    } else {
      const c = answer[i];
      remaining[c] = (remaining[c] || 0) + 1;
    }
  }

  // Pass 2: mark near matches while count of that letter > 0
  for (let i = 0; i < WORD_LEN; i++) {
    if (res[i] === 'hit') continue;
    const c = guess[i];
    if ((remaining[c] || 0) > 0) {
      res[i] = 'near';
      remaining[c]--;
    }
  }

  return res;
}

// Submit a word to the round
export function submit(round, word) {
  if (!round || round.state !== 'playing') {
    return { result: 'ignored' };
  }
  const w = String(word || '').trim().toUpperCase();
  if (w.length !== WORD_LEN) {
    return { result: 'short' };
  }
  if (!VALID_SET.has(w)) {
    return { result: 'invalid' };
  }
  round.guesses.push(w);
  if (w === round.answer) {
    round.state = 'won';
  } else if (round.guesses.length >= MAX_GUESSES) {
    round.state = 'lost';
  }
  return { result: 'ok' };
}

// Aggregate letter states across all guesses (hit > near > miss)
export function keyStates(round) {
  const states = {};
  if (!round || !round.guesses) return states;
  for (const guess of round.guesses) {
    const ev = evaluate(guess, round.answer);
    for (let i = 0; i < WORD_LEN; i++) {
      const letter = guess[i];
      const state = ev[i];
      const current = states[letter];
      if (current === 'hit') continue;
      if (state === 'hit') {
        states[letter] = 'hit';
      } else if (state === 'near') {
        states[letter] = 'near';
      } else if (state === 'miss' && !current) {
        states[letter] = 'miss';
      }
    }
  }
  return states;
}

// Generate shareable text for the round
export function shareText(round, label, url) {
  const score = round.state === 'won' ? `${round.guesses.length}/6` : 'X/6';
  const rows = round.guesses.map(g => {
    const ev = evaluate(g, round.answer);
    return ev.map(s => s === 'hit' ? '🟩' : s === 'near' ? '🟨' : '⬛').join('');
  });
  return [`Wörtel ${label}`, score, ...rows, url].join('\n');
}
