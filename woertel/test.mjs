import assert from 'node:assert/strict';
import { VALID, ANSWERS } from '../data/woerter.js';
import {
  WORD_LEN,
  MAX_GUESSES,
  ORDER,
  dayNumber,
  answerFor,
  newRound,
  evaluate,
  submit,
  keyStates,
  shareText,
} from './logic.js';

// 1. Every ANSWERS word has 5 letters and is in VALID
assert.equal(WORD_LEN, 5);
assert.equal(MAX_GUESSES, 6);
const validSet = new Set(VALID);
for (const word of ANSWERS) {
  assert.equal(word.length, 5, `Answer word "${word}" must have 5 letters`);
  assert.equal(validSet.has(word), true, `Answer word "${word}" must exist in VALID`);
}

// 2. ORDER is a permutation (same length and set as ANSWERS)
assert.equal(ORDER.length, ANSWERS.length, 'ORDER must have same length as ANSWERS');
const orderSet = new Set(ORDER);
assert.equal(orderSet.size, ANSWERS.length, 'ORDER must contain unique words');
for (const word of ANSWERS) {
  assert.equal(orderSet.has(word), true, `ORDER must contain "${word}"`);
}

// 3. answerFor is deterministic per seed and differs between consecutive days
const seedToday = 20261110;
const seedTomorrow = 20261111;
assert.equal(answerFor(seedToday, 'daily'), answerFor(seedToday, 'daily'), 'Daily answer must be deterministic');
assert.notEqual(answerFor(seedToday, 'daily'), answerFor(seedTomorrow, 'daily'), 'Daily answer must differ between consecutive days');

// dayNumber increases by 1 each day
assert.equal(dayNumber(seedTomorrow) - dayNumber(seedToday), 1);

// Practice mode determinism per seed
assert.equal(answerFor(42, 'practice'), answerFor(42, 'practice'), 'Practice answer must be deterministic for same seed');

// 4. evaluate including repeated letters (at least 3 hand-computed cases with duplicates)
// Case A: Answer 'APFEL', Guess 'LEGAL'
// First L is miss because second L matches the only L in APFEL
assert.deepEqual(
  evaluate('LEGAL', 'APFEL'),
  ['miss', 'near', 'miss', 'near', 'hit'],
  'Case A failed: LEGAL vs APFEL'
);

// Case B: Answer 'BLASS' (two S), Guess 'SALAT' (one S, two A)
// First S: near. First A: near. L: near. Second A: miss (only one A in BLASS). T: miss.
assert.deepEqual(
  evaluate('SALAT', 'BLASS'),
  ['near', 'near', 'near', 'miss', 'miss'],
  'Case B failed: SALAT vs BLASS'
);

// Case C: Answer 'KANNE' (two N), Guess 'NONNE' (three N)
// Positions 2, 3, 4 are hits (N, N, E). Position 0 N is miss (all N in KANNE already accounted for).
assert.deepEqual(
  evaluate('NONNE', 'KANNE'),
  ['miss', 'miss', 'hit', 'hit', 'hit'],
  'Case C failed: NONNE vs KANNE'
);

// Case D: Answer 'BOMBE' (two B), Guess 'BABAS' (two B, two A)
// Pos 0: B hit. Pos 1: A miss. Pos 2: B near (second B in BOMBE at pos 3). Pos 3: A miss. Pos 4: S miss.
assert.deepEqual(
  evaluate('BABAS', 'BOMBE'),
  ['hit', 'miss', 'near', 'miss', 'miss'],
  'Case D failed: BABAS vs BOMBE'
);

// 5. submit results: 'short', 'invalid', 'ok', win on right word, loss after 6 wrong words, 'ignored'
{
  const r = newRound(20261110, 'daily');
  r.answer = 'APFEL';

  // Short word
  assert.deepEqual(submit(r, 'APF'), { result: 'short' });
  assert.deepEqual(submit(r, 'APFELN'), { result: 'short' });
  assert.equal(r.guesses.length, 0);

  // Invalid word (not in list)
  assert.deepEqual(submit(r, 'ZZZZZ'), { result: 'invalid' });
  assert.equal(r.guesses.length, 0);

  // OK guess
  assert.deepEqual(submit(r, 'BIRNE'), { result: 'ok' });
  assert.equal(r.guesses.length, 1);
  assert.equal(r.state, 'playing');

  // Win on right word
  assert.deepEqual(submit(r, 'APFEL'), { result: 'ok' });
  assert.equal(r.guesses.length, 2);
  assert.equal(r.state, 'won');

  // Ignored after round ended
  assert.deepEqual(submit(r, 'BLUME'), { result: 'ignored' });
  assert.equal(r.guesses.length, 2);
}

// Loss after 6 wrong valid words
{
  const r = newRound(20261110, 'daily');
  r.answer = 'APFEL';

  const wrong = ['BIRNE', 'BLUME', 'BUCHE', 'BRAUN', 'BRIEF', 'BOGEN'];
  for (let i = 0; i < 5; i++) {
    const res = submit(r, wrong[i]);
    assert.deepEqual(res, { result: 'ok' });
    assert.equal(r.state, 'playing');
  }
  const lastRes = submit(r, wrong[5]);
  assert.deepEqual(lastRes, { result: 'ok' });
  assert.equal(r.guesses.length, 6);
  assert.equal(r.state, 'lost');

  // Ignored after loss
  assert.deepEqual(submit(r, 'APFEL'), { result: 'ignored' });
}

// 6. keyStates priority (hit > near > miss)
{
  const r = newRound(20261110, 'daily');
  r.answer = 'APFEL';

  // Guess 'LEGAL': L at pos 0 is miss, L at pos 4 is hit.
  // Letter L should have best state 'hit'.
  submit(r, 'LEGAL');
  const ks1 = keyStates(r);
  assert.equal(ks1['L'], 'hit', 'Hit should beat miss');
  assert.equal(ks1['E'], 'near');
  assert.equal(ks1['G'], 'miss');
  assert.equal(ks1['A'], 'near');

  // Now guess 'ANGST': A at pos 0 is hit! Previous state for A was near.
  submit(r, 'ANGST');
  const ks2 = keyStates(r);
  assert.equal(ks2['A'], 'hit', 'Hit should beat near');
}

// 7. shareText for win and loss
{
  const rWon = newRound(20261110, 'daily');
  rWon.answer = 'APFEL';
  submit(rWon, 'BIRNE');
  submit(rWon, 'APFEL');
  const textWon = shareText(rWon, '10. Nov.', 'https://geo.spanani.de/woertel/');
  const linesWon = textWon.split('\n');
  assert.equal(linesWon[0], 'Wörtel 10. Nov.');
  assert.equal(linesWon[1], '2/6');
  assert.equal(linesWon.length, 5); // title, score, row1, row2, url
  assert.equal(linesWon[4], 'https://geo.spanani.de/woertel/');
  // Guess 2 was APFEL -> row 2 is 5 green squares
  assert.equal(linesWon[3], '🟩🟩🟩🟩🟩');

  const rLost = newRound(20261110, 'daily');
  rLost.answer = 'APFEL';
  const wrong = ['BIRNE', 'BLUME', 'BUCHE', 'BRAUN', 'BRIEF', 'BOGEN'];
  wrong.forEach(w => submit(rLost, w));
  const textLost = shareText(rLost, '10. Nov.', 'https://geo.spanani.de/woertel/');
  const linesLost = textLost.split('\n');
  assert.equal(linesLost[0], 'Wörtel 10. Nov.');
  assert.equal(linesLost[1], 'X/6');
  assert.equal(linesLost.length, 9); // title, score, 6 rows, url
  assert.equal(linesLost[8], 'https://geo.spanani.de/woertel/');
}

console.log('alles ok');
