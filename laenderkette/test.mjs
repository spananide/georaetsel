import assert from 'node:assert';
import {
  EXTRA,
  distancesFrom,
  routeInfo,
  pairFor,
  newRound,
  guess,
  shareText,
} from './logic.js';

// 1. routeInfo('pt', 'it')
const ptIt = routeInfo('pt', 'it');
assert.strictEqual(ptIt.d, 3);
assert.strictEqual(ptIt.n, 2);
assert.deepStrictEqual(ptIt.onPath, new Set(['es', 'fr']));
assert.deepStrictEqual(ptIt.route, ['pt', 'es', 'fr', 'it']);

// 2. routeInfo('de', 'fr').d === 1
assert.strictEqual(routeInfo('de', 'fr').d, 1);

// 3. island pair is null
assert.strictEqual(routeInfo('jp', 'de'), null);

// 4. pairFor(seed) is deterministic, start != target and routeInfo distance between 3 and 6 for 100 different seeds
for (let s = 1; s <= 100; s++) {
  const p1 = pairFor(s);
  const p2 = pairFor(s);
  assert.strictEqual(p1.start, p2.start);
  assert.strictEqual(p1.target, p2.target);
  assert.notStrictEqual(p1.start, p1.target);
  const info = routeInfo(p1.start, p1.target);
  assert(info !== null);
  assert(info.d >= 3 && info.d <= 6);
}

// 5. Scripted round on pt -> it built by hand
const round = {
  seed: 0,
  start: 'pt',
  target: 'it',
  max: 6,
  guesses: [],
  state: 'playing',
};

// guess es right
const resEs = guess(round, 'es');
assert.strictEqual(resEs.result, 'right');
assert.strictEqual(round.guesses.length, 1);
assert.strictEqual(round.guesses[0].id, 'es');
assert.strictEqual(round.guesses[0].ok, true);

// guess de wrong with away === 1 (Germany borders France)
const resDe = guess(round, 'de');
assert.strictEqual(resDe.result, 'wrong');
assert.strictEqual(round.guesses.length, 2);
assert.strictEqual(round.guesses[1].id, 'de');
assert.strictEqual(round.guesses[1].ok, false);
assert.strictEqual(round.guesses[1].away, 1);

// guess jp wrong with away === null
const resJp = guess(round, 'jp');
assert.strictEqual(resJp.result, 'wrong');
assert.strictEqual(round.guesses.length, 3);
assert.strictEqual(round.guesses[2].id, 'jp');
assert.strictEqual(round.guesses[2].ok, false);
assert.strictEqual(round.guesses[2].away, null);

// repeat is ignored
const resRepeat = guess(round, 'de');
assert.strictEqual(resRepeat.result, 'repeat');
assert.strictEqual(round.guesses.length, 3);

// guessing pt gives fixed
const resPt = guess(round, 'pt');
assert.strictEqual(resPt.result, 'fixed');
assert.strictEqual(round.guesses.length, 3);

// then fr wins (state === 'won')
const resFr = guess(round, 'fr');
assert.strictEqual(resFr.result, 'right');
assert.strictEqual(round.guesses.length, 4);
assert.strictEqual(round.state, 'won');

// guess after the end is ignored
const resAfter = guess(round, 'ch');
assert.strictEqual(resAfter.result, 'ignored');
assert.strictEqual(round.guesses.length, 4);

// 6. A lost round when all guesses are wrong
const lostRound = {
  seed: 0,
  start: 'pt',
  target: 'it',
  max: 2,
  guesses: [],
  state: 'playing',
};
const l1 = guess(lostRound, 'de');
assert.strictEqual(l1.result, 'wrong');
assert.strictEqual(lostRound.state, 'playing');
const l2 = guess(lostRound, 'jp');
assert.strictEqual(l2.result, 'wrong');
assert.strictEqual(lostRound.state, 'lost');
assert.strictEqual(guess(lostRound, 'es').result, 'ignored');

// 7. shareText first lines
const stWon = shareText(round, '6. Nov.', 'https://geo.spanani.de/laenderkette/');
const wonLines = stWon.split('\n');
assert.strictEqual(wonLines[0], 'Länderkette 6. Nov.');
assert.strictEqual(wonLines[1], 'Portugal → Italien');
assert.strictEqual(wonLines[2], '4/6');
assert.strictEqual(wonLines[3], '🟩🟥🟥🟩');
assert.strictEqual(wonLines[4], 'https://geo.spanani.de/laenderkette/');

const stLost = shareText(lostRound, 'Übung', 'https://geo.spanani.de/laenderkette/');
const lostLines = stLost.split('\n');
assert.strictEqual(lostLines[0], 'Länderkette Übung');
assert.strictEqual(lostLines[1], 'Portugal → Italien');
assert.strictEqual(lostLines[2], 'X/2');
assert.strictEqual(lostLines[3], '🟥🟥');
assert.strictEqual(lostLines[4], 'https://geo.spanani.de/laenderkette/');

// 8. JSON round trip
const jsonStr = JSON.stringify(round);
const roundRestored = JSON.parse(jsonStr);
assert.deepStrictEqual(roundRestored, round);

const newR = newRound(42);
assert.strictEqual(newR.state, 'playing');
assert.strictEqual(typeof newR.max, 'number');
assert.deepStrictEqual(JSON.parse(JSON.stringify(newR)), newR);

console.log('alles ok');
