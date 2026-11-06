import assert from 'node:assert';
import { GEO } from '../data/geo.js';
import { SHAPES } from '../data/world.js';
import { haversine } from '../umriss/logic.js';
import {
  HEAT,
  eligible,
  targetFor,
  heat,
  newRound,
  guess,
  giveUp,
  sortedGuesses,
  shareText,
} from './logic.js';

// 1. Check eligible.length >= 150, every eligible has a shape and a GEO entry
assert.ok(eligible.length >= 150, `eligible.length should be >= 150, got ${eligible.length}`);
for (const country of eligible) {
  assert.ok(SHAPES[country.id], `Shape missing for ${country.id}`);
  assert.ok(GEO[country.id], `GEO entry missing for ${country.id}`);
}

// 2. targetFor deterministic and different across seeds
const t1a = targetFor(20261106);
const t1b = targetFor(20261106);
assert.strictEqual(t1a, t1b, 'targetFor must be deterministic for the same seed');

const t2 = targetFor(20261107);
const t3 = targetFor(20261108);
assert.ok(t1a !== t2 || t2 !== t3, 'targetFor should differ across different seeds');

// 3. heat steps check: heat(0) is first, heat(499) first, heat(500) second, heat(20000) last
assert.strictEqual(heat(0), HEAT[0], 'heat(0) should be first step');
assert.strictEqual(heat(499), HEAT[0], 'heat(499) should be first step');
assert.strictEqual(heat(500), HEAT[1], 'heat(500) should be second step');
assert.strictEqual(heat(20000), HEAT[HEAT.length - 1], 'heat(20000) should be last step');

// Verify all HEAT entries have required fields
for (const h of HEAT) {
  assert.ok(typeof h.max === 'number');
  assert.ok(typeof h.color === 'string');
  assert.ok(typeof h.emoji === 'string');
  assert.ok(typeof h.label === 'string');
}

// 4. Scripted round:
// Round A: wrong guess has km > 0 and is recorded, target guess wins with km === 0,
// repeat is ignored, guess after end is ignored.
const seed = 20261106;
const round = newRound(seed);
assert.strictEqual(round.state, 'playing');
assert.strictEqual(round.guesses.length, 0);
assert.strictEqual(round.hint, false);

const target = round.target;
// Pick a country different from target
const wrongCountry = eligible.find(c => c.id !== target);
assert.ok(wrongCountry, 'Should find a wrong country');

// First guess: wrong
const resWrong = guess(round, wrongCountry.id);
assert.strictEqual(resWrong.result, 'wrong');
assert.ok(resWrong.km > 0, 'Wrong guess km must be > 0');
assert.strictEqual(round.guesses.length, 1);
assert.strictEqual(round.guesses[0].id, wrongCountry.id);
assert.strictEqual(round.guesses[0].km, resWrong.km);
assert.strictEqual(round.state, 'playing');

// Repeat guess: ignored/repeat
const resRepeat = guess(round, wrongCountry.id);
assert.strictEqual(resRepeat.result, 'repeat');
assert.strictEqual(round.guesses.length, 1);
assert.strictEqual(round.state, 'playing');

// Second guess: target -> wins with km === 0
const resCorrect = guess(round, target);
assert.strictEqual(resCorrect.result, 'correct');
assert.strictEqual(resCorrect.km, 0);
assert.strictEqual(round.guesses.length, 2);
assert.strictEqual(round.guesses[1].id, target);
assert.strictEqual(round.guesses[1].km, 0);
assert.strictEqual(round.state, 'won');

// Guess after end: ignored
const anotherCountry = eligible.find(c => c.id !== target && c.id !== wrongCountry.id);
const resAfter = guess(round, anotherCountry.id);
assert.strictEqual(resAfter.result, 'ignored');
assert.strictEqual(round.guesses.length, 2);
assert.strictEqual(round.state, 'won');

// 5. giveUp works and blocks further guesses
const roundGiveUp = newRound(99999);
assert.strictEqual(roundGiveUp.state, 'playing');
giveUp(roundGiveUp);
assert.strictEqual(roundGiveUp.state, 'gave-up');
const resAfterGiveUp = guess(roundGiveUp, roundGiveUp.target);
assert.strictEqual(resAfterGiveUp.result, 'ignored');
assert.strictEqual(roundGiveUp.guesses.length, 0);

// 6. sortedGuesses ascending
const roundMulti = newRound(12345);
const tMulti = roundMulti.target;
const pool = eligible.filter(c => c.id !== tMulti).slice(0, 5);
for (const c of pool) {
  guess(roundMulti, c.id);
}
guess(roundMulti, tMulti); // target has km = 0
const sorted = sortedGuesses(roundMulti);
assert.strictEqual(sorted.length, roundMulti.guesses.length);
assert.strictEqual(sorted[0].km, 0, 'First sorted guess should be 0 km');
for (let i = 1; i < sorted.length; i++) {
  assert.ok(sorted[i].km >= sorted[i - 1].km, 'sortedGuesses must be in ascending order by km');
}

// 7. shareText first two lines and emoji row (wrapped at 8 per row)
const shareLabel = '6. Nov.';
const shareUrl = 'https://geo.spanani.de/heiss-kalt/';
const textNoHint = shareText(round, shareLabel, shareUrl);
const linesNoHint = textNoHint.split('\n');
assert.strictEqual(linesNoHint[0], 'Heiß oder kalt 6. Nov.');
assert.strictEqual(linesNoHint[1], '2 Versuche');
// Emoji row for 2 guesses
const expectedEmojis = round.guesses.map(g => heat(g.km).emoji).join('');
assert.strictEqual(linesNoHint[2], expectedEmojis);
assert.strictEqual(linesNoHint[3], shareUrl);

// Test with hint: true
round.hint = true;
const textWithHint = shareText(round, shareLabel, shareUrl);
const linesWithHint = textWithHint.split('\n');
assert.strictEqual(linesWithHint[0], 'Heiß oder kalt 6. Nov.');
assert.strictEqual(linesWithHint[1], '2 Versuche, mit Tipp');

// Test wrapping at 8 per row
const roundWrap = newRound(54321);
const tWrap = roundWrap.target;
const poolWrap = eligible.filter(c => c.id !== tWrap).slice(0, 10);
for (const c of poolWrap) {
  guess(roundWrap, c.id);
}
const textWrap = shareText(roundWrap, 'Übung', shareUrl);
const linesWrap = textWrap.split('\n');
assert.strictEqual(linesWrap[0], 'Heiß oder kalt Übung');
assert.strictEqual(linesWrap[1], '10 Versuche');
// Line 2 has 8 emojis, line 3 has 2 emojis
assert.strictEqual(Array.from(linesWrap[2]).length, 8);
assert.strictEqual(Array.from(linesWrap[3]).length, 2);
assert.strictEqual(linesWrap[4], shareUrl);

// 8. JSON round trip
const serialized = JSON.stringify(round);
const deserialized = JSON.parse(serialized);
assert.deepStrictEqual(deserialized, round);

// 9. Check haversine from umriss/logic.js is usable
assert.strictEqual(typeof haversine, 'function');
assert.strictEqual(haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);

console.log('alles ok');
