import { COUNTRIES } from '../georaetsel/data/countries.js';
import { mulberry32 } from '../georaetsel/game.js';

export const ROUND_SIZE = 10;

const COUNTRY_MAP = new Map(COUNTRIES.map(c => [c.id, c]));

export function pickFlags(seed, n = ROUND_SIZE) {
  const rand = mulberry32(seed);
  const ids = COUNTRIES.map(c => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, n);
}

export function newRound(seed, n = ROUND_SIZE) {
  return {
    seed,
    ids: pickFlags(seed, n),
    idx: 0,
    misses: 0,
    wrong: [],
    results: [],
    state: 'asking',
  };
}

export function hintsFor(round) {
  if (round.misses === 0 || round.idx >= round.ids.length) return [];
  const country = COUNTRY_MAP.get(round.ids[round.idx]);
  if (!country) return [];
  const hints = [`Kontinent: ${country.continent}`];
  if (round.misses >= 2) {
    hints.push(`Beginnt mit „${country.name[0]}“`);
  }
  return hints;
}

export function submit(round, countryId) {
  if (round.state !== 'asking') {
    return { result: 'ignored' };
  }
  const currentId = round.ids[round.idx];
  if (round.wrong.includes(countryId)) {
    return { result: 'repeat' };
  }
  if (countryId === currentId) {
    const pts = 3 - round.misses;
    round.results.push({ id: currentId, pts, solved: true });
    round.state = 'revealed';
    return { result: 'correct', pts };
  }
  round.misses++;
  round.wrong.push(countryId);
  if (round.misses === 3) {
    round.results.push({ id: currentId, pts: 0, solved: false });
    round.state = 'revealed';
    return { result: 'lost' };
  }
  return { result: 'wrong', hints: hintsFor(round) };
}

export function giveUp(round) {
  if (round.state !== 'asking') {
    return { result: 'ignored' };
  }
  const currentId = round.ids[round.idx];
  round.results.push({ id: currentId, pts: 0, solved: false });
  round.state = 'revealed';
  return { result: 'lost' };
}

export function next(round) {
  if (round.state !== 'revealed') {
    return { result: 'ignored' };
  }
  round.idx++;
  round.misses = 0;
  round.wrong = [];
  if (round.idx >= round.ids.length) {
    round.state = 'done';
  } else {
    round.state = 'asking';
  }
  return round;
}

export const total = round => round.results.reduce((sum, r) => sum + (r.pts || 0), 0);

const EMOJIS = { 3: '🟩', 2: '🟨', 1: '🟧', 0: '🟥' };

export function shareText(round, label, url) {
  const marks = round.results.map(r => EMOJIS[r.pts] ?? '🟥');
  const rows = [];
  for (let i = 0; i < marks.length; i += 5) {
    rows.push(marks.slice(i, i + 5).join(''));
  }
  const grid = rows.join('\n');
  return `Flaggenjagd ${label}\n${total(round)}/30 Punkte\n\n${grid}\n\n${url}`;
}
