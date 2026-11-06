import { COUNTRIES } from '../georaetsel/data/countries.js';
import { GEO } from '../data/geo.js';
import { SHAPES } from '../data/world.js';
import { mulberry32 } from '../georaetsel/game.js';
import { haversine } from '../umriss/logic.js';

export const HEAT = [
  { max: 500, color: '#C0392B', emoji: '🟥', label: 'Glühend heiß' },
  { max: 1500, color: '#E8641B', emoji: '🟧', label: 'Heiß' },
  { max: 3000, color: '#F0B429', emoji: '🟨', label: 'Warm' },
  { max: 5500, color: '#9CCB6B', emoji: '🟩', label: 'Lauwarm' },
  { max: 9000, color: '#4FA3A5', emoji: '🟦', label: 'Kühl' },
  { max: Infinity, color: '#5C6BC0', emoji: '🟪', label: 'Kalt' },
];

export const eligible = COUNTRIES
  .filter(c => SHAPES[c.id] && c.area >= 2000)
  .sort((a, b) => a.id.localeCompare(b.id));

export function targetFor(seed) {
  const rand = mulberry32(seed);
  return eligible[Math.floor(rand() * eligible.length)].id;
}

export function heat(km) {
  return HEAT.find(step => step.max > km) ?? HEAT[HEAT.length - 1];
}

export function newRound(seed) {
  return {
    seed,
    target: targetFor(seed),
    guesses: [],
    state: 'playing',
    hint: false,
  };
}

export function guess(round, id) {
  if (round.state !== 'playing') {
    return { result: 'ignored' };
  }
  if (round.guesses.some(g => g.id === id)) {
    return { result: 'repeat' };
  }
  const isTarget = id === round.target;
  let km = 0;
  if (!isTarget) {
    const a = GEO[id] ?? { lat: 0, lng: 0 };
    const b = GEO[round.target] ?? { lat: 0, lng: 0 };
    km = Math.round(haversine(a, b));
  }
  round.guesses.push({ id, km });
  if (isTarget) {
    round.state = 'won';
    return { result: 'correct', km: 0 };
  }
  return { result: 'wrong', km };
}

export function giveUp(round) {
  if (round.state === 'playing') {
    round.state = 'gave-up';
  }
  return round;
}

export function sortedGuesses(round) {
  return [...round.guesses].sort((a, b) => a.km - b.km);
}

export function shareText(round, label, url) {
  const n = round.guesses.length;
  const tipText = round.hint ? ', mit Tipp' : '';
  const firstLine = `Heiß oder kalt ${label}`;
  const secondLine = `${n} Versuche${tipText}`;
  const emojis = round.guesses.map(g => heat(g.km).emoji);
  const rows = [];
  for (let i = 0; i < emojis.length; i += 8) {
    rows.push(emojis.slice(i, i + 8).join(''));
  }
  const grid = rows.join('\n');
  return grid.length > 0
    ? `${firstLine}\n${secondLine}\n${grid}\n${url}`
    : `${firstLine}\n${secondLine}\n${url}`;
}
