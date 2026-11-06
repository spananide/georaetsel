import { COUNTRIES } from '../georaetsel/data/countries.js';
import { mulberry32 } from '../georaetsel/game.js';

const COUNTRY_MAP = new Map(COUNTRIES.map(c => [c.id, c]));

export const TYPES = {
  pop: { q: 'Welches Land hat mehr Einwohner?', key: 'pop' },
  area: { q: 'Welches Land ist größer?', key: 'area' },
  gdp: { q: 'Welches Land hat das höhere BIP pro Kopf?', key: 'gdp' },
  density: { q: 'Welches Land ist dichter besiedelt?', key: 'density' },
  neighbours: { q: 'Welches Land hat mehr Nachbarländer?', key: 'neighbours' },
};

const TYPE_KEYS = ['pop', 'area', 'gdp', 'density', 'neighbours'];

export function fmt(type, value) {
  if (value == null) return '';
  if (type === 'pop') {
    if (value >= 1) {
      const num = Number(value.toFixed(1));
      return num.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 1 }) + ' Mio.';
    }
    return Math.round(value * 1000000).toLocaleString('de-DE');
  }
  if (type === 'area') {
    return Math.round(value).toLocaleString('de-DE') + ' km²';
  }
  if (type === 'gdp') {
    return Math.round(value).toLocaleString('de-DE') + ' US-$';
  }
  if (type === 'density') {
    return Math.round(value).toLocaleString('de-DE') + ' pro km²';
  }
  if (type === 'neighbours') {
    if (value === 0) return 'keine';
    return Math.round(value).toLocaleString('de-DE');
  }
  return String(value);
}

function qualifies(type, a, b) {
  if (!a || !b || a.id === b.id) return false;
  const vA = a[type];
  const vB = b[type];
  if (vA == null || vB == null || isNaN(vA) || isNaN(vB)) return false;
  if (type === 'neighbours') {
    return Math.abs(vA - vB) >= 1;
  }
  const max = Math.max(vA, vB);
  if (max <= 0) return false;
  return (Math.abs(vA - vB) / max) >= 0.10;
}

export function pickPair(seed, n) {
  const rand = mulberry32(seed + n * 7919);
  const type = TYPE_KEYS[Math.floor(rand() * TYPE_KEYS.length)];
  const len = COUNTRIES.length;

  for (let attempt = 0; attempt < 200; attempt++) {
    const idxA = Math.floor(rand() * len);
    const idxB = Math.floor(rand() * len);
    if (idxA === idxB) continue;
    const a = COUNTRIES[idxA];
    const b = COUNTRIES[idxB];
    if (qualifies(type, a, b)) {
      return { type, a: a.id, b: b.id };
    }
  }

  for (let i = 0; i < len; i++) {
    for (let j = 0; j < len; j++) {
      if (i !== j && qualifies(type, COUNTRIES[i], COUNTRIES[j])) {
        return { type, a: COUNTRIES[i].id, b: COUNTRIES[j].id };
      }
    }
  }

  throw new Error(`Kein gültiges Paar für Typ ${type}`);
}

export function newGame(seed) {
  return {
    seed,
    n: 0,
    streak: 0,
    over: false,
    pair: pickPair(seed, 0),
    picked: null,
  };
}

export function answer(game, pickedId) {
  if (!game || game.over || game.picked) {
    return { ignored: true };
  }
  if (!game.pair || (pickedId !== game.pair.a && pickedId !== game.pair.b)) {
    return { ignored: true };
  }

  const countryA = COUNTRY_MAP.get(game.pair.a);
  const countryB = COUNTRY_MAP.get(game.pair.b);
  if (!countryA || !countryB) {
    return { ignored: true };
  }

  const aVal = countryA[game.pair.type];
  const bVal = countryB[game.pair.type];

  const pickedVal = pickedId === game.pair.a ? aVal : bVal;
  const otherVal = pickedId === game.pair.a ? bVal : aVal;

  const correct = pickedVal > otherVal;
  game.picked = pickedId;

  if (correct) {
    game.streak++;
    return { correct: true, aVal, bVal };
  } else {
    game.over = true;
    return { correct: false, aVal, bVal };
  }
}

export function advance(game) {
  if (!game || game.over || !game.picked) {
    return game;
  }
  game.n++;
  game.picked = null;
  game.pair = pickPair(game.seed, game.n);
  return game;
}
