import assert from 'node:assert';
import { GEO } from '../data/geo.js';
import { SHAPES } from '../data/world.js';
import {
  MAX_GUESSES,
  eligible,
  targetFor,
  haversine,
  bearing,
  arrow,
  proximity,
  newRound,
  guess,
  shareText,
} from './logic.js';

// 1. eligible.length >= 150 and every eligible country has SHAPES and GEO
assert.ok(eligible.length >= 150, `eligible.length should be >= 150, got ${eligible.length}`);
for (const country of eligible) {
  assert.ok(SHAPES[country.id], `SHAPES missing for ${country.id}`);
  assert.ok(GEO[country.id], `GEO missing for ${country.id}`);
}

// 2. targetFor is deterministic and differs across a few seeds
const t1a = targetFor(20261106);
const t1b = targetFor(20261106);
assert.strictEqual(t1a, t1b, 'targetFor must be deterministic for the same seed');

const t2 = targetFor(20261107);
const t3 = targetFor(20261108);
assert.ok(t1a !== t2 || t2 !== t3, 'targetFor should differ across a few seeds');

// 3. haversine(GEO.de, GEO.fr) between 600 and 1100
const deFrDist = haversine(GEO.de, GEO.fr);
assert.ok(deFrDist >= 600 && deFrDist <= 1100, `Distance DE-FR should be between 600 and 1100, got ${deFrDist}`);

// 4. haversine(a, a) === 0
assert.strictEqual(haversine(GEO.de, GEO.de), 0, 'haversine(a, a) must be 0');

// 5. bearing({lat:0,lng:0},{lat:10,lng:0}) is about 0 and arrow of it is ↑, east →, southwest ↙
const bNorth = bearing({ lat: 0, lng: 0 }, { lat: 10, lng: 0 });
assert.ok(Math.abs(bNorth - 0) < 0.1 || Math.abs(bNorth - 360) < 0.1, `Bearing north should be about 0, got ${bNorth}`);
assert.strictEqual(arrow(bNorth), '↑', 'North arrow should be ↑');

const bEast = bearing({ lat: 0, lng: 0 }, { lat: 0, lng: 10 });
assert.ok(Math.abs(bEast - 90) < 0.1, `Bearing east should be about 90, got ${bEast}`);
assert.strictEqual(arrow(bEast), '→', 'East arrow should be →');

const bSouthwest = bearing({ lat: 10, lng: 10 }, { lat: 0, lng: 0 });
assert.strictEqual(arrow(bSouthwest), '↙', 'Southwest arrow should be ↙');

// 6. proximity(0) === 100, proximity(20015) === 0
assert.strictEqual(proximity(0), 100, 'proximity(0) should be 100');
assert.strictEqual(proximity(20015), 0, 'proximity(20015) should be 0');

// 7. Scripted round:
// Round A: wrong guesses fill up, repeat not counted, 6 wrong -> lost, guess after end is ignored
const roundA = newRound(20261106);
assert.strictEqual(roundA.state, 'playing');
assert.strictEqual(roundA.guesses.length, 0);

const targetA = roundA.target;
const poolA = eligible.filter(c => c.id !== targetA).slice(0, 10).map(c => c.id);

// First wrong guess
const resA1 = guess(roundA, poolA[0]);
assert.deepStrictEqual(resA1, { result: 'wrong' });
assert.strictEqual(roundA.guesses.length, 1);
assert.strictEqual(roundA.state, 'playing');

// Repeat guess is not counted
const resRepeat = guess(roundA, poolA[0]);
assert.deepStrictEqual(resRepeat, { result: 'repeat' });
assert.strictEqual(roundA.guesses.length, 1);
assert.strictEqual(roundA.state, 'playing');

// Guesses 2, 3, 4, 5
for (let i = 1; i <= 4; i++) {
  const res = guess(roundA, poolA[i]);
  assert.deepStrictEqual(res, { result: 'wrong' });
  assert.strictEqual(roundA.guesses.length, i + 1);
  assert.strictEqual(roundA.state, 'playing');
}
assert.strictEqual(roundA.guesses.length, 5);

// 6th wrong guess -> state is lost
const resA6 = guess(roundA, poolA[5]);
assert.deepStrictEqual(resA6, { result: 'wrong' });
assert.strictEqual(roundA.guesses.length, MAX_GUESSES);
assert.strictEqual(roundA.state, 'lost');

// Guess after end is ignored
const resAAfter = guess(roundA, poolA[6]);
assert.deepStrictEqual(resAAfter, { result: 'ignored' });
assert.strictEqual(roundA.guesses.length, MAX_GUESSES);
assert.strictEqual(roundA.state, 'lost');

// Round B: correct guess -> won with right count
const roundB = newRound(20261106);
guess(roundB, poolA[0]); // guess 1
guess(roundB, poolA[1]); // guess 2
const resBWin = guess(roundB, targetA); // guess 3: correct
assert.deepStrictEqual(resBWin, { result: 'correct' });
assert.strictEqual(roundB.state, 'won');
assert.strictEqual(roundB.guesses.length, 3);
assert.strictEqual(roundB.guesses[2].km, 0);
assert.strictEqual(roundB.guesses[2].prox, 100);
assert.strictEqual(roundB.guesses[2].dir, null);

// Guess after win is ignored
const resBAfter = guess(roundB, poolA[2]);
assert.deepStrictEqual(resBAfter, { result: 'ignored' });
assert.strictEqual(roundB.guesses.length, 3);

// 8. shareText first line and emoji row
const url = 'https://geo.spanani.de/umriss/';
const shareWon = shareText(roundB, '6. Nov.', url);
const linesWon = shareWon.split('\n');
assert.strictEqual(linesWon[0], 'Umriss 6. Nov.', 'First line must be "Umriss <label>"');
assert.strictEqual(linesWon[1], '3/6');
assert.strictEqual(Array.from(linesWon[2]).length, 3, 'Emoji row should have 3 emojis');
assert.ok(linesWon[2].endsWith('🟩'), 'Emoji row for win ends with 🟩');
assert.strictEqual(linesWon[3], url);

const shareLost = shareText(roundA, 'Übung', url);
const linesLost = shareLost.split('\n');
assert.strictEqual(linesLost[0], 'Umriss Übung', 'First line must be "Umriss <label>"');
assert.strictEqual(linesLost[1], 'X/6');
assert.strictEqual(Array.from(linesLost[2]).length, 6, 'Emoji row should have 6 emojis');
assert.strictEqual(linesLost[3], url);

// 9. Round survives JSON.parse(JSON.stringify(round))
const serialized = JSON.stringify(roundB);
const deserialized = JSON.parse(serialized);
assert.deepStrictEqual(deserialized, roundB, 'Round must survive JSON roundtrip');

console.log('alles ok');
