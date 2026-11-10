import assert from 'node:assert/strict';
import {
  LEN,
  MAX_GUESSES,
  parseEquation,
  generate,
  answerFor,
  newRound,
  evaluate,
  submit,
  keyStates,
  shareText,
} from './logic.js';

// Constants
assert.equal(LEN, 8);
assert.equal(MAX_GUESSES, 6);

// 1. parseEquation: valid cases
assert.deepEqual(parseEquation('12+35=47'), { ok: true });
assert.deepEqual(parseEquation('2+3*4=14'), { ok: true });
assert.deepEqual(parseEquation('10-2*3=4'), { ok: true });
assert.deepEqual(parseEquation('8/3*9=24'), { ok: true });
assert.deepEqual(parseEquation('2*3=12/2'), { ok: true });
assert.deepEqual(parseEquation('10-0-2=8'), { ok: true });

// Valid arithmetic when length check is disabled
assert.deepEqual(parseEquation('9=3*3', null), { ok: true });
assert.deepEqual(parseEquation('8/3*3=8', null), { ok: true });
assert.deepEqual(parseEquation('99-9*9=18', null), { ok: true });

// 2. parseEquation: failure reasons
// length
assert.deepEqual(parseEquation('1+2=3'), { ok: false, reason: 'length' });
assert.deepEqual(parseEquation('9=3*3'), { ok: false, reason: 'length' });
assert.deepEqual(parseEquation('8/3*3=8'), { ok: false, reason: 'length' });
assert.deepEqual(parseEquation('0+1+1=2'), { ok: false, reason: 'length' });
assert.deepEqual(parseEquation('99-9*9=18'), { ok: false, reason: 'length' });
assert.deepEqual(parseEquation('2+3*4=20!!'), { ok: false, reason: 'length' });
assert.deepEqual(parseEquation('123456789=0'), { ok: false, reason: 'length' });

// chars
assert.deepEqual(parseEquation('12+35=4?'), { ok: false, reason: 'chars' });
assert.deepEqual(parseEquation('12+35=4A'), { ok: false, reason: 'chars' });
assert.deepEqual(parseEquation('12+35=4 '), { ok: false, reason: 'chars' });

// equals (not exactly one '=')
assert.deepEqual(parseEquation('12+34+56'), { ok: false, reason: 'equals' });
assert.deepEqual(parseEquation('1=2=3+45'), { ok: false, reason: 'equals' });
assert.deepEqual(parseEquation('12345678'), { ok: false, reason: 'equals' });

// syntax
assert.deepEqual(parseEquation('=1234567'), { ok: false, reason: 'syntax' });
assert.deepEqual(parseEquation('1234567='), { ok: false, reason: 'syntax' });
assert.deepEqual(parseEquation('01+23=24'), { ok: false, reason: 'syntax' });
assert.deepEqual(parseEquation('1+23=024'), { ok: false, reason: 'syntax' });
assert.deepEqual(parseEquation('+1+2=3+4'), { ok: false, reason: 'syntax' });
assert.deepEqual(parseEquation('-1+2=3+4'), { ok: false, reason: 'syntax' });
assert.deepEqual(parseEquation('1+2+=3+4'), { ok: false, reason: 'syntax' });
assert.deepEqual(parseEquation('1+2=3+4+'), { ok: false, reason: 'syntax' });
assert.deepEqual(parseEquation('1++2=3+4'), { ok: false, reason: 'syntax' });
assert.deepEqual(parseEquation('10+-2=80'), { ok: false, reason: 'syntax' });
assert.deepEqual(parseEquation('10/*2=80'), { ok: false, reason: 'syntax' });

// zero (division by zero)
assert.deepEqual(parseEquation('100/0=10'), { ok: false, reason: 'zero' });
assert.deepEqual(parseEquation('10=100/0'), { ok: false, reason: 'zero' });
assert.deepEqual(parseEquation('1+2/0=12'), { ok: false, reason: 'zero' });

// unequal
assert.deepEqual(parseEquation('10+20=40'), { ok: false, reason: 'unequal' });
assert.deepEqual(parseEquation('7/2*4=15'), { ok: false, reason: 'unequal' });
assert.deepEqual(parseEquation('2+3*4=20'), { ok: false, reason: 'unequal' });

// 3. generate: determinism, consecutive days, 2000 seeds valid, all 4 operators
const seedToday = 20261110;
const seedTomorrow = 20261111;
assert.equal(generate(seedToday), generate(seedToday), 'generate must be deterministic per seed');
assert.notEqual(generate(seedToday), generate(seedTomorrow), 'generate must differ between consecutive days');

for (let s = 1; s <= 2000; s++) {
  const eq = generate(s);
  assert.equal(eq.length, 8, `Seed ${s} equation length must be 8`);
  const parsed = parseEquation(eq);
  assert.equal(parsed.ok, true, `Seed ${s} equation "${eq}" must be valid: ${parsed.reason}`);
}

const opFound = { '+': false, '-': false, '*': false, '/': false };
for (let s = 1; s <= 300; s++) {
  const eq = generate(s);
  for (const op of ['+', '-', '*', '/']) {
    if (eq.includes(op)) opFound[op] = true;
  }
}
assert.equal(opFound['+'], true, 'operator + must appear across 300 seeds');
assert.equal(opFound['-'], true, 'operator - must appear across 300 seeds');
assert.equal(opFound['*'], true, 'operator * must appear across 300 seeds');
assert.equal(opFound['/'], true, 'operator / must appear across 300 seeds');

// answerFor & newRound
assert.equal(answerFor(42, 'daily'), generate(42));
assert.equal(answerFor(42, 'practice'), generate(42));
const round = newRound(seedToday, 'daily');
assert.equal(round.seed, seedToday);
assert.equal(round.answer, generate(seedToday));
assert.deepEqual(round.guesses, []);
assert.equal(round.state, 'playing');
assert.equal(round.ms, 0);

// 4. evaluate & keyStates
assert.deepEqual(
  evaluate('12+35=47', '12+35=47'),
  ['hit', 'hit', 'hit', 'hit', 'hit', 'hit', 'hit', 'hit']
);
// Repeated characters in guess vs answer
// Answer: 10+20=30 (one '1', one '2', one '3', three '0', one '+', one '=')
// Guess:  25-15=10 (two '1', two '5', one '2', one '0', one '-', one '=')
// Pos 0: '2' vs '1' -> near (matches '2' in answer)
// Pos 1: '5' vs '0' -> miss
// Pos 2: '-' vs '+' -> miss
// Pos 3: '1' vs '2' -> near (matches '1' in answer)
// Pos 4: '5' vs '0' -> miss
// Pos 5: '=' vs '=' -> hit
// Pos 6: '1' vs '3' -> miss ('1' was already matched at pos 3)
// Pos 7: '0' vs '0' -> hit
assert.deepEqual(
  evaluate('25-15=10', '10+20=30'),
  ['near', 'miss', 'miss', 'near', 'miss', 'hit', 'miss', 'hit']
);

// Another case: exact hit prevents extra near
// Answer: 10+10=20 (two '1', three '0')
// Guess:  11+11=22 (four '1': pos 0 and 3 are hits, so pos 1 and 4 are misses)
assert.deepEqual(
  evaluate('11+11=22', '10+10=20'),
  ['hit', 'miss', 'hit', 'hit', 'miss', 'hit', 'hit', 'miss']
);

// keyStates
{
  const r = newRound(seedToday, 'daily');
  r.answer = '10+10=20';
  r.guesses = ['11+11=22'];
  const ks = keyStates(r);
  assert.equal(ks['1'], 'hit');
  assert.equal(ks['+'], 'hit');
  assert.equal(ks['='], 'hit');
  assert.equal(ks['2'], 'hit');
}

// 5. submit transitions: short, invalid, ok, win, loss after 6, ignored after end
{
  const r = newRound(seedToday, 'daily');
  r.answer = '12+35=47';

  // short
  assert.deepEqual(submit(r, '1+2=3'), { result: 'short' });
  assert.equal(r.guesses.length, 0);

  // invalid
  assert.deepEqual(submit(r, '10+20=40'), { result: 'invalid', reason: 'unequal' });
  assert.equal(r.guesses.length, 0);

  // ok (valid guess, but not winning)
  assert.deepEqual(submit(r, '10-2*3=4'), { result: 'ok' });
  assert.equal(r.guesses.length, 1);
  assert.equal(r.state, 'playing');

  // win
  assert.deepEqual(submit(r, '12+35=47'), { result: 'ok' });
  assert.equal(r.guesses.length, 2);
  assert.equal(r.state, 'won');

  // ignored after won
  assert.deepEqual(submit(r, '12+35=47'), { result: 'ignored' });
  assert.equal(r.guesses.length, 2);
}

// Loss after 6 wrong guesses
{
  const r = newRound(seedToday, 'daily');
  r.answer = '12+35=47';

  const guesses = [
    '10-2*3=4',
    '8/3*9=24',
    '2*3=12/2',
    '10-0-2=8',
    '11+22=33',
    '14+25=39',
  ];

  for (let i = 0; i < 5; i++) {
    assert.deepEqual(submit(r, guesses[i]), { result: 'ok' });
    assert.equal(r.state, 'playing');
  }

  // 6th guess causes loss
  assert.deepEqual(submit(r, guesses[5]), { result: 'ok' });
  assert.equal(r.guesses.length, 6);
  assert.equal(r.state, 'lost');

  // ignored after lost
  assert.deepEqual(submit(r, '12+35=47'), { result: 'ignored' });
  assert.equal(r.guesses.length, 6);
}

// 6. shareText
{
  const rWon = newRound(seedToday, 'daily');
  rWon.answer = '12+35=47';
  rWon.guesses = ['10-2*3=4', '12+35=47'];
  rWon.state = 'won';

  const textWon = shareText(rWon, '10. Nov.', 'https://geo.spanani.de/rechnel/');
  const linesWon = textWon.split('\n');
  assert.equal(linesWon[0], 'Rechnel 10. Nov.');
  assert.equal(linesWon[1], '2/6');
  assert.equal(linesWon[linesWon.length - 1], 'https://geo.spanani.de/rechnel/');
  assert.equal(linesWon.some(l => l.includes('🟩')), true);

  const rLost = newRound(seedToday, 'practice');
  rLost.answer = '12+35=47';
  rLost.guesses = [
    '10-2*3=4',
    '8/3*9=24',
    '2*3=12/2',
    '10-0-2=8',
    '11+22=33',
    '14+25=39',
  ];
  rLost.state = 'lost';

  const textLost = shareText(rLost, 'Übung', 'https://geo.spanani.de/rechnel/');
  const linesLost = textLost.split('\n');
  assert.equal(linesLost[0], 'Rechnel Übung');
  assert.equal(linesLost[1], 'X/6');
  assert.equal(linesLost.length, 9); // header + score + 6 rows + url
  assert.equal(linesLost[linesLost.length - 1], 'https://geo.spanani.de/rechnel/');
}

console.log('alles ok');
