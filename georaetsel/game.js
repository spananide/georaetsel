import { COUNTRIES } from './data/countries.js';
import { CATEGORIES } from './categories.js';

const COUNTRY = new Map(COUNTRIES.map(c => [c.id, c]));
const CATEGORY = new Map(CATEGORIES.map(c => [c.id, c]));

export const byId = id => COUNTRY.get(id);
export const categoryById = id => CATEGORY.get(id);
export const dailySeed = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();

export function mulberry32(a) {
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const answerCache = new Map();
export function answersFor(rowId, colId) {
  const key = `${rowId}|${colId}`;
  if (!answerCache.has(key)) {
    const r = CATEGORY.get(rowId), c = CATEGORY.get(colId);
    answerCache.set(key, COUNTRIES.filter(x => r.test(x) && c.test(x)));
  }
  return answerCache.get(key);
}

export function points(answers, id) {
  const sorted = [...answers].sort((a, b) => b.pop - a.pop);
  const i = sorted.findIndex(c => c.id === id);
  return Math.round(5 + i / Math.max(sorted.length - 1, 1) * 95);
}

export const tier = pts => pts < 30 ? 'tief' : pts < 80 ? 'huegel' : 'hoch';

// Exakt per Bitmaske: pro Land wird entschieden, welches Feld es füllt.
export function solve(cells) {
  const full = (1 << cells.length) - 1;
  const options = new Map();
  cells.forEach((cell, j) => cell.forEach(({ id, pts }) => {
    if (!options.has(id)) options.set(id, []);
    options.get(id).push([j, pts]);
  }));
  let dp = new Int32Array(full + 1).fill(-1);
  dp[0] = 0;
  const layers = [];
  for (const [id, opts] of options) {
    const next = dp.slice(), choice = new Int8Array(full + 1);
    for (let mask = 0; mask <= full; mask++) {
      if (dp[mask] < 0) continue;
      for (const [j, pts] of opts) {
        if (mask & (1 << j)) continue;
        const to = mask | (1 << j);
        if (dp[mask] + pts > next[to]) { next[to] = dp[mask] + pts; choice[to] = j + 1; }
      }
    }
    layers.push({ id, opts, choice });
    dp = next;
  }
  if (dp[full] < 0) return null;
  const picks = Array(cells.length);
  let mask = full;
  for (let l = layers.length - 1; l >= 0; l--) {
    const c = layers[l].choice[mask];
    if (!c) continue;
    picks[c - 1] = { id: layers[l].id, pts: layers[l].opts.find(([j]) => j === c - 1)[1] };
    mask ^= 1 << (c - 1);
  }
  return { total: dp[full], picks };
}

export function pickBoard(seed) {
  const rand = mulberry32(seed);
  const pool = [...CATEGORIES];
  for (let attempt = 0; attempt < 5000; attempt++) {
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const six = pool.slice(0, 6);
    if (new Set(six.map(c => c.group)).size < 6) continue;
    const rows = six.slice(0, 3).map(c => c.id), cols = six.slice(3).map(c => c.id);
    const cells = rows.flatMap(r => cols.map(c => answersFor(r, c)));
    if (cells.some(a => a.length < 3)) continue;
    if (solve(cells.map(a => a.map(c => ({ id: c.id, pts: 1 }))))) return { rows, cols };
  }
  throw new Error(`Kein Rätsel für Seed ${seed}`);
}

export function newGame(seed) {
  const { rows, cols } = pickBoard(seed);
  return { seed, rows, cols, cells: Array(9).fill(null), wrong: Array.from({ length: 9 }, () => []), guessesLeft: 12, over: false };
}

export const cellAnswers = (game, cell) => answersFor(game.rows[Math.floor(cell / 3)], game.cols[cell % 3]);

export function guess(game, cell, countryId) {
  if (game.over) return { result: 'over' };
  if (game.cells[cell]) return { result: 'filled' };
  if (game.cells.some(c => c?.id === countryId)) return { result: 'used' };
  if (game.wrong[cell].includes(countryId)) return { result: 'repeat' };
  game.guessesLeft--;
  const answers = cellAnswers(game, cell);
  let out;
  if (answers.some(c => c.id === countryId)) {
    const pts = points(answers, countryId);
    game.cells[cell] = { id: countryId, pts };
    out = { result: 'right', pts };
  } else {
    game.wrong[cell].push(countryId);
    out = { result: 'wrong' };
  }
  if (game.guessesLeft === 0 || game.cells.every(Boolean)) game.over = true;
  return out;
}

export const score = game => game.cells.reduce((sum, c) => sum + (c?.pts ?? 0), 0);

export function bestBoard(game) {
  return solve(game.cells.map((_, i) => {
    const answers = cellAnswers(game, i);
    return answers.map(c => ({ id: c.id, pts: points(answers, c.id) }));
  }));
}

const SHARE = { tief: '🟩', huegel: '🟨', hoch: '🟫' };
export function shareText(game, label, url) {
  const marks = game.cells.map(c => c ? SHARE[tier(c.pts)] : '🟦');
  const grid = [0, 3, 6].map(i => marks.slice(i, i + 3).join('')).join('\n');
  return `GeoRätsel ${label}\n${game.cells.filter(Boolean).length}/9 Felder, ${score(game)} Punkte\n\n${grid}\n\n${url}`;
}

const strip = s => s.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s\-.'’]/g, '');
const expand = s => strip(s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue'));
const forms = s => [strip(s), expand(s)];
const INDEX = COUNTRIES.map(country => ({
  country,
  name: forms(country.name),
  aliases: country.aliases.map(a => ({ alias: a, forms: forms(a) })),
}));

export function search(query) {
  const q = strip(query);
  if (!q) return [];
  const hits = [];
  for (const { country, name, aliases } of INDEX) {
    let rank = name.includes(q) ? 0 : name.some(f => f.startsWith(q)) ? 1 : name.some(f => f.includes(q)) ? 3 : 9;
    let via = null;
    for (const { alias, forms: f } of aliases) {
      const r = f.includes(q) ? 0 : f.some(x => x.startsWith(q)) ? 2 : f.some(x => x.includes(q)) ? 4 : 9;
      if (r < rank) { rank = r; via = alias; }
    }
    if (rank < 9) hits.push({ country, via, rank });
  }
  hits.sort((a, b) => a.rank - b.rank || a.country.name.localeCompare(b.country.name, 'de'));
  return hits.slice(0, 8).map(({ country, via }) => ({ country, via }));
}
