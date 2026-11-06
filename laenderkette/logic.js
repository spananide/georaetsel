import { COUNTRIES } from '../georaetsel/data/countries.js';
import { GEO } from '../data/geo.js';
import { mulberry32 } from '../georaetsel/game.js';

export const EXTRA = 4;

const VALID_IDS = new Set(COUNTRIES.map(c => c.id));
const COUNTRY_MAP = new Map(COUNTRIES.map(c => [c.id, c]));

const getNeighbors = id => (GEO[id]?.b || []).filter(n => VALID_IDS.has(n));

export const NODES = COUNTRIES
  .map(c => c.id)
  .filter(id => getNeighbors(id).length > 0)
  .sort();

export function distancesFrom(id) {
  const dist = new Map();
  if (!VALID_IDS.has(id)) return dist;
  dist.set(id, 0);
  const queue = [id];
  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const d = dist.get(curr);
    for (const next of getNeighbors(curr)) {
      if (!dist.has(next)) {
        dist.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  return dist;
}

const routeCache = new Map();

export function routeInfo(start, target) {
  const key = `${start}|${target}`;
  if (routeCache.has(key)) return routeCache.get(key);

  const fromStart = distancesFrom(start);
  if (!fromStart.has(target)) {
    routeCache.set(key, null);
    return null;
  }

  const d = fromStart.get(target);
  const n = d - 1;
  const fromTarget = distancesFrom(target);

  const onPath = new Set();
  for (const [id, ds] of fromStart) {
    if (id === start || id === target) continue;
    if (fromTarget.has(id) && ds + fromTarget.get(id) === d) {
      onPath.add(id);
    }
  }

  const route = [start];
  let curr = start;
  for (let k = 1; k <= d; k++) {
    const candidates = getNeighbors(curr).filter(
      v => fromTarget.get(v) === d - k && fromStart.get(v) === k
    );
    candidates.sort();
    curr = candidates[0];
    route.push(curr);
  }

  const res = { d, n, onPath, route };
  routeCache.set(key, res);
  return res;
}

export function pairFor(seed) {
  const rand = mulberry32(seed);
  for (let attempt = 0; attempt < 5000; attempt++) {
    const start = NODES[Math.floor(rand() * NODES.length)];
    const target = NODES[Math.floor(rand() * NODES.length)];
    if (start === target) continue;
    const info = routeInfo(start, target);
    if (info && info.d >= 3 && info.d <= 6) {
      return { start, target };
    }
  }
  throw new Error(`Kein Paar für Seed ${seed}`);
}

export function newRound(seed) {
  const { start, target } = pairFor(seed);
  const info = routeInfo(start, target);
  return {
    seed,
    start,
    target,
    max: info.n + EXTRA,
    guesses: [],
    state: 'playing',
  };
}

function hasCompletedRoute(start, target, d, rightGuesses) {
  const allowed = new Set([start, target, ...rightGuesses]);
  const queue = [start];
  const dist = new Map([[start, 0]]);
  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const curDist = dist.get(curr);
    if (curDist >= d) continue;
    for (const next of getNeighbors(curr)) {
      if (!allowed.has(next)) continue;
      if (!dist.has(next)) {
        dist.set(next, curDist + 1);
        if (next === target && curDist + 1 === d) return true;
        queue.push(next);
      }
    }
  }
  return dist.get(target) === d;
}

export function guess(round, id) {
  if (round.state !== 'playing') {
    return { result: 'ignored' };
  }
  if (id === round.start || id === round.target) {
    return { result: 'fixed' };
  }
  if (round.guesses.some(g => g.id === id)) {
    return { result: 'repeat' };
  }

  const info = routeInfo(round.start, round.target);
  const ok = info.onPath.has(id);

  let away = null;
  if (ok) {
    away = 0;
  } else {
    const dist = distancesFrom(id);
    const targetSet = [round.start, round.target, ...info.onPath];
    let minAway = Infinity;
    for (const t of targetSet) {
      if (dist.has(t)) {
        const d = dist.get(t);
        if (d < minAway) minAway = d;
      }
    }
    away = minAway === Infinity ? null : minAway;
  }

  round.guesses.push({ id, ok, away });

  const rightGuesses = round.guesses.filter(g => g.ok).map(g => g.id);
  if (hasCompletedRoute(round.start, round.target, info.d, rightGuesses)) {
    round.state = 'won';
  } else if (round.guesses.length >= round.max) {
    round.state = 'lost';
  }

  return { result: ok ? 'right' : 'wrong' };
}

export function shareText(round, label, url) {
  const startName = COUNTRY_MAP.get(round.start)?.name || round.start;
  const targetName = COUNTRY_MAP.get(round.target)?.name || round.target;
  const score = round.state === 'won' ? round.guesses.length : 'X';
  const emojis = round.guesses.map(g => (g.ok ? '🟩' : '🟥')).join('');
  return `Länderkette ${label}\n${startName} → ${targetName}\n${score}/${round.max}\n${emojis}\n${url}`;
}
