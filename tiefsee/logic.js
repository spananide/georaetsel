import { QUESTIONS } from '../data/tiefsee.js';
import { mulberry32 } from '../georaetsel/game.js';
import { dayNumber } from '../woertel/logic.js';

export { dayNumber };

export const SEED_WEIGHTS = [30, 22, 16, 12, 9, 7, 5, 4];

export function questionsFor(seed, mode = 'daily') {
  if (mode === 'practice') {
    const rand = mulberry32(seed);
    const picks = [];
    while (picks.length < 3) {
      const idx = Math.floor(rand() * QUESTIONS.length);
      if (!picks.includes(idx)) {
        picks.push(idx);
      }
    }
    return picks;
  }
  const d = dayNumber(seed);
  const picks = [];
  for (let k = 0; k < 3; k++) {
    const idx = ((d * 3 + k) % QUESTIONS.length + QUESTIONS.length) % QUESTIONS.length;
    picks.push(idx);
  }
  return picks;
}

export function normalizeAnswer(s) {
  if (typeof s !== 'string') return '';
  let str = s.trim().toLowerCase().replace(/\s+/g, ' ');
  str = str.replace(/^[\p{P}\s]+|[\p{P}\s]+$/gu, '');
  if (str.length < 1 || str.length > 40) return '';
  return str;
}

export function checkAnswer(qIndex, raw) {
  const answer = normalizeAnswer(raw);
  const alphanumericCount = (answer.match(/[\p{L}\p{N}]/gu) || []).length;
  if (alphanumericCount < 3) {
    return { ok: false, reason: 'short' };
  }
  const q = QUESTIONS[qIndex];
  if (q && q.starts && !answer.startsWith(q.starts.toLowerCase())) {
    return { ok: false, reason: 'starts' };
  }
  return { ok: true, answer };
}

export function seedWeight(qIndex, answer) {
  const q = QUESTIONS[qIndex];
  if (!q || !Array.isArray(q.seeds)) return 0;
  const norm = normalizeAnswer(answer);
  if (!norm) return 0;
  const idx = q.seeds.findIndex(s => normalizeAnswer(s) === norm);
  if (idx === -1) return 0;
  return idx < SEED_WEIGHTS.length ? SEED_WEIGHTS[idx] : 3;
}

export function depthFor(qIndex, answer, n = 0, total = 0) {
  const q = QUESTIONS[qIndex];
  if (!q) return 0;
  const seedTotal = (q.seeds || []).reduce((sum, _, i) => sum + (i < SEED_WEIGHTS.length ? SEED_WEIGHTS[i] : 3), 0);
  const sw = seedWeight(qIndex, answer);
  let count = sw + n;
  const denom = seedTotal + total;
  if (count <= 0) {
    count = 0.5;
  }
  const share = denom > 0 ? Math.min(1, count / denom) : 1;
  const depth = Math.round(-15 * Math.log10(share));
  return Math.min(33, Math.max(0, depth));
}

export function newRound(seed, mode = 'daily') {
  return {
    seed,
    mode,
    qs: questionsFor(seed, mode),
    answers: [null, null, null],
    state: 'playing',
    ms: 0,
  };
}

export function record(round, k, entry) {
  if (!round || round.state !== 'playing') return round;
  if (k < 0 || k > 2) return round;
  if (round.answers[k] !== null && round.answers[k] !== undefined) return round;
  round.answers[k] = entry;
  if (round.answers.every(a => a !== null && a !== undefined)) {
    round.state = 'done';
  }
  return round;
}

export function current(round) {
  if (!round || !Array.isArray(round.answers)) return 3;
  const idx = round.answers.findIndex(a => a === null || a === undefined);
  return idx === -1 ? 3 : idx;
}

export function totalDepth(round) {
  if (!round || !Array.isArray(round.answers)) return 0;
  return round.answers.reduce((sum, a) => sum + (a && typeof a.depth === 'number' ? a.depth : 0), 0);
}

export function rarityText(entry, mode = 'daily') {
  if (mode === 'practice') {
    return 'Gegen die Standardantworten gemessen.';
  }
  if (!entry) return '';
  if (entry.depth < 8) {
    return 'Eine beliebte Antwort.';
  }
  if (entry.n === 1) {
    return 'Nur du hast das geantwortet.';
  }
  if (entry.total > 1) {
    return `Nur ${entry.n} von ${entry.total} Spielern haben das geantwortet.`;
  }
  return '';
}

export function shareText(round, label, url) {
  const tot = totalDepth(round);
  const lines = [
    `Tiefsee ${label}`,
    `${tot} m tief`,
  ];
  for (const a of (round.answers || [])) {
    const d = a && typeof a.depth === 'number' ? a.depth : 0;
    const blocks = '🟦'.repeat(Math.max(1, Math.round(d / 6)));
    lines.push(`${blocks} ${d} m`);
  }
  lines.push(url);
  return lines.join('\n');
}
