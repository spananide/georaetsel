import assert from 'node:assert';
import { GEO } from '../data/geo.js';
import {
  ROUND_SIZE,
  AMBIGUOUS,
  POOL,
  pickCountries,
  optionsFor,
  newRound,
  answer,
  next,
  total,
  shareText,
} from './logic.js';

// 1. POOL checks: POOL.length >= 150, no ambiguous id in POOL, every pool country has a non-empty capital
assert(POOL.length >= 150, `POOL.length must be >= 150 (got ${POOL.length})`);

for (const country of POOL) {
  assert(!AMBIGUOUS.has(country.id), `Ambiguous id ${country.id} must not be in POOL`);
  const geo = GEO[country.id];
  assert(geo && typeof geo.c === 'string' && geo.c.trim().length > 0, `Country ${country.id} must have a non-empty capital`);
}

for (const ambId of AMBIGUOUS) {
  assert(!POOL.some(c => c.id === ambId), `Ambiguous country ${ambId} should not be in POOL`);
}

// 2. pickCountries deterministic for equal seeds, unique ids, length 10, different for different seeds
const seed1 = 20261106;
const seed2 = 20261107;
const ids1a = pickCountries(seed1);
const ids1b = pickCountries(seed1);
const ids2 = pickCountries(seed2);

assert.strictEqual(ids1a.length, ROUND_SIZE, `Picked countries must have length ${ROUND_SIZE}`);
assert.deepStrictEqual(ids1a, ids1b, 'pickCountries must be deterministic for equal seeds');
assert.notDeepStrictEqual(ids1a, ids2, 'Different seeds should produce different countries');
assert.strictEqual(new Set(ids1a).size, ROUND_SIZE, 'Country ids in a round must be unique');

for (const id of ids1a) {
  assert(POOL.some(c => c.id === id), `Id ${id} must belong to POOL`);
}

// 3. optionsFor: 200 (seed, idx) combinations return 4 distinct strings, answer index points to the real capital,
// and the 3 distractors are capitals of countries of the same continent (for a big continent like Europa)
const europeCountries = POOL.filter(c => c.continent === 'Europa');
assert(europeCountries.length >= 4, 'Europe must have at least 4 countries');
const europeCapitals = new Set(europeCountries.map(c => GEO[c.id].c));

for (let s = 1; s <= 20; s++) {
  for (let idx = 0; idx < 10; idx++) {
    const country = europeCountries[(s * 7 + idx) % europeCountries.length];
    const testSeed = s * 1000 + 42;
    const res = optionsFor(testSeed, idx, country.id);

    assert.strictEqual(res.options.length, 4, 'Must return 4 options');
    assert.strictEqual(new Set(res.options).size, 4, 'All 4 options must be distinct strings');
    assert(res.answer >= 0 && res.answer <= 3, 'Answer index must be 0..3');
    assert.strictEqual(res.options[res.answer], GEO[country.id].c, 'Answer index must point to real capital');

    // 3 distractors are capitals of countries of the same continent (Europa)
    for (const opt of res.options) {
      assert(europeCapitals.has(opt), `Option "${opt}" must be a capital from Europa`);
    }
  }
}

// Determinism of optionsFor
const optA = optionsFor(8888, 3, 'de');
const optB = optionsFor(8888, 3, 'de');
assert.deepStrictEqual(optA, optB, 'optionsFor must be deterministic');

// 4. Scripted round: right answer sets state 'revealed' and counts, wrong answer doesn't,
// answer twice is ignored, next x10 ends in 'done', total is right
const round = newRound(seed1);
assert.strictEqual(round.state, 'asking');
assert.strictEqual(round.idx, 0);
assert.strictEqual(round.results.length, 0);

// Question 0: right answer
const q0Id = round.ids[0];
const q0Opts = optionsFor(round.seed, 0, q0Id);
const ans0 = answer(round, q0Opts.answer);
assert.deepStrictEqual(ans0, { result: 'correct', correct: q0Opts.answer });
assert.strictEqual(round.state, 'revealed');
assert.strictEqual(round.results.length, 1);
assert.deepStrictEqual(round.results[0], { id: q0Id, pick: q0Opts.answer, ok: true });

// Answer twice is ignored
const dupAns = answer(round, q0Opts.answer);
assert.deepStrictEqual(dupAns, { result: 'ignored' });
assert.strictEqual(round.results.length, 1);

next(round);
assert.strictEqual(round.state, 'asking');
assert.strictEqual(round.idx, 1);

// Question 1: wrong answer
const q1Id = round.ids[1];
const q1Opts = optionsFor(round.seed, 1, q1Id);
const wrongPick = (q1Opts.answer + 1) % 4;
const ans1 = answer(round, wrongPick);
assert.deepStrictEqual(ans1, { result: 'wrong', correct: q1Opts.answer });
assert.strictEqual(round.state, 'revealed');
assert.strictEqual(round.results.length, 2);
assert.deepStrictEqual(round.results[1], { id: q1Id, pick: wrongPick, ok: false });

// Answer twice is ignored
assert.deepStrictEqual(answer(round, wrongPick), { result: 'ignored' });

next(round);

// Remaining 8 questions: script 6 right, 2 wrong -> total 7 right, 3 wrong
// Index 2: right, 3: wrong, 4..9: right
const pickPattern = [true, false, true, false, true, true, true, true, true, true];
for (let i = 2; i < 10; i++) {
  assert.strictEqual(round.idx, i);
  assert.strictEqual(round.state, 'asking');
  const qId = round.ids[i];
  const opts = optionsFor(round.seed, i, qId);
  const pick = pickPattern[i] ? opts.answer : (opts.answer + 1) % 4;
  const res = answer(round, pick);
  assert.strictEqual(res.result, pickPattern[i] ? 'correct' : 'wrong');
  assert.strictEqual(res.correct, opts.answer);
  next(round);
}

// After 10th question, state is 'done'
assert.strictEqual(round.state, 'done');
assert.strictEqual(round.idx, 10);

// In 'done' state, answer and next are ignored
assert.deepStrictEqual(answer(round, 0), { result: 'ignored' });
assert.deepStrictEqual(next(round), { result: 'ignored' });

// total is right: 8 ok out of 10
assert.strictEqual(total(round), 8);

// 5. shareText first line and the two emoji rows
const share = shareText(round, '6. Nov.', 'https://geo.spanani.de/hauptstaedte/');
const lines = share.split('\n');
assert.strictEqual(lines[0], 'Hauptstädte 6. Nov.', 'First line must be "Hauptstädte <label>"');
assert.strictEqual(lines[1], '8/10 Punkte', 'Second line must be "<N>/10 Punkte"');
assert.strictEqual(lines[2], '🟩🟥🟩🟥🟩', 'First emoji row must have 5 emojis');
assert.strictEqual(lines[3], '🟩🟩🟩🟩🟩', 'Second emoji row must have 5 emojis');
assert.strictEqual(lines[4], 'https://geo.spanani.de/hauptstaedte/', 'Fifth line must be url');

// 6. JSON round trip
const serialized = JSON.stringify(round);
const deserialized = JSON.parse(serialized);
assert.deepStrictEqual(deserialized, round, 'Round must survive JSON roundtrip');
assert.strictEqual(total(deserialized), 8);

console.log('alles ok');
