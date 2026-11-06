import { COUNTRIES } from '../georaetsel/data/countries.js';
import { GEO } from '../data/geo.js';
import { mulberry32 } from '../georaetsel/game.js';

export const ROUND_SIZE = 10;

export const AMBIGUOUS = new Set([
  'bo', 'za', 'ps', 'il', 'ci', 'nl', 'ye', 'lk', 'sz', 'tz', 'bj', 'tw', 'gq'
]);

export const POOL = COUNTRIES
  .filter(c => GEO[c.id] && GEO[c.id].c && !AMBIGUOUS.has(c.id))
  .sort((a, b) => a.id.localeCompare(b.id));

const COUNTRY_MAP = new Map(COUNTRIES.map(c => [c.id, c]));

export function pickCountries(seed, n = ROUND_SIZE) {
  const rand = mulberry32(seed);
  const ids = POOL.map(c => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, n);
}

export function optionsFor(seed, idx, id) {
  const rand = mulberry32(seed * 31 + idx + 1);
  const country = COUNTRY_MAP.get(id);
  const correct = GEO[id]?.c;
  if (!country || !correct) {
    throw new Error(`Country ${id} not found or missing capital`);
  }

  // Distractor candidate capitals from other countries of the same continent in POOL
  const sameContinent = [];
  const seen = new Set([correct]);

  for (const c of POOL) {
    if (c.continent === country.continent && c.id !== id) {
      const cap = GEO[c.id]?.c;
      if (cap && !seen.has(cap)) {
        seen.add(cap);
        sameContinent.push(cap);
      }
    }
  }

  // If too few distinct capitals, fill from other continents in POOL
  if (sameContinent.length < 3) {
    for (const c of POOL) {
      if (c.continent !== country.continent && c.id !== id) {
        const cap = GEO[c.id]?.c;
        if (cap && !seen.has(cap)) {
          seen.add(cap);
          sameContinent.push(cap);
        }
      }
    }
  }

  // Seeded Fisher-Yates shuffle of candidates
  for (let i = sameContinent.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [sameContinent[i], sameContinent[j]] = [sameContinent[j], sameContinent[i]];
  }

  const distractors = sameContinent.slice(0, 3);
  const options = [correct, ...distractors];

  // Shuffle the 4 options with the same PRNG
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  const answer = options.indexOf(correct);
  return { options, answer };
}

export function newRound(seed) {
  return {
    seed,
    ids: pickCountries(seed),
    idx: 0,
    results: [],
    state: 'asking',
  };
}

export function answer(round, pickIndex) {
  if (round.state !== 'asking') {
    return { result: 'ignored' };
  }
  const currentId = round.ids[round.idx];
  const { answer: correctIndex } = optionsFor(round.seed, round.idx, currentId);
  const ok = pickIndex === correctIndex;
  round.results.push({ id: currentId, pick: pickIndex, ok });
  round.state = 'revealed';
  return {
    result: ok ? 'correct' : 'wrong',
    correct: correctIndex,
  };
}

export function next(round) {
  if (round.state !== 'revealed') {
    return { result: 'ignored' };
  }
  round.idx++;
  if (round.idx >= round.ids.length) {
    round.state = 'done';
  } else {
    round.state = 'asking';
  }
  return round;
}

export const total = round => round.results.filter(r => r.ok).length;

export function shareText(round, label, url) {
  const marks = round.results.map(r => (r.ok ? '🟩' : '🟥'));
  const rows = [];
  for (let i = 0; i < marks.length; i += 5) {
    rows.push(marks.slice(i, i + 5).join(''));
  }
  const grid = rows.join('\n');
  return `Hauptstädte ${label}\n${total(round)}/10 Punkte\n${grid}\n${url}`;
}
