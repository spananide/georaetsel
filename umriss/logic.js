import { COUNTRIES } from '../georaetsel/data/countries.js';
import { GEO } from '../data/geo.js';
import { SHAPES } from '../data/world.js';
import { mulberry32 } from '../georaetsel/game.js';

export const MAX_GUESSES = 6;

export const eligible = COUNTRIES
  .filter(c => SHAPES[c.id] && c.area >= 2000)
  .sort((a, b) => a.id.localeCompare(b.id));

export function targetFor(seed) {
  const rand = mulberry32(seed);
  return eligible[Math.floor(rand() * eligible.length)].id;
}

export function haversine(a, b) {
  const R = 6371;
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return Math.round(R * c);
}

export function bearing(a, b) {
  const toRad = deg => (deg * Math.PI) / 180;
  const toDeg = rad => (rad * 180) / Math.PI;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = toDeg(Math.atan2(y, x));
  return ((brng % 360) + 360) % 360;
}

const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];

export function arrow(deg) {
  const norm = ((deg % 360) + 360) % 360;
  const idx = Math.round(norm / 45) % 8;
  return ARROWS[idx];
}

export function proximity(km) {
  const p = Math.round(100 * (1 - km / 20015));
  return Math.max(0, Math.min(100, p));
}

export function newRound(seed) {
  return {
    seed,
    target: targetFor(seed),
    guesses: [],
    state: 'playing',
  };
}

export function guess(round, id) {
  if (round.state !== 'playing') {
    return { result: 'ignored' };
  }
  if (round.guesses.some(g => g.id === id)) {
    return { result: 'repeat' };
  }
  if (id === round.target) {
    round.guesses.push({ id, km: 0, prox: 100, dir: null });
    round.state = 'won';
    return { result: 'correct' };
  }
  const a = GEO[id] ?? { lat: 0, lng: 0 };
  const b = GEO[round.target] ?? { lat: 0, lng: 0 };
  const km = haversine(a, b);
  const prox = proximity(km);
  const dir = arrow(bearing(a, b));
  round.guesses.push({ id, km, prox, dir });
  if (round.guesses.length >= MAX_GUESSES) {
    round.state = 'lost';
  }
  return { result: 'wrong' };
}

export function shareText(round, label, url) {
  const score = round.state === 'won' ? `${round.guesses.length}/6` : 'X/6';
  const emojis = round.guesses.map(g => {
    if (g.km === 0 || g.prox === 100) return '🟩';
    if (g.prox >= 75) return '🟨';
    if (g.prox >= 50) return '🟧';
    return '🟥';
  }).join('');
  return `Umriss ${label}\n${score}\n${emojis}\n${url}`;
}
