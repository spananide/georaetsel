import assert from 'node:assert';
import fs from 'node:fs';
import { byId } from '../georaetsel/game.js';
import {
  TYPES,
  fmt,
  pickPair,
  newGame,
  answer,
  advance,
} from './logic.js';

// 1. fmt examples
assert.strictEqual(fmt('pop', 43.8), '43,8 Mio.');
assert.strictEqual(fmt('pop', 8), '8 Mio.');
assert.strictEqual(fmt('pop', 0.0829), '82.900');
assert.strictEqual(fmt('area', 652230), '652.230 km²');
assert.strictEqual(fmt('gdp', 417), '417 US-$');
assert.strictEqual(fmt('density', 67), '67 pro km²');
assert.strictEqual(fmt('neighbours', 0), 'keine');
assert.strictEqual(fmt('neighbours', 6), '6');

// 2. pickPair is deterministic and gives different pairs for different n
const pairA = pickPair(1234, 0);
const pairB = pickPair(1234, 0);
assert.deepStrictEqual(pairA, pairB, 'pickPair should be deterministic');

const pairDiffN = pickPair(1234, 1);
assert.notDeepStrictEqual(pairA, pairDiffN, 'pickPair should give different pairs for different n');

// 3. 300 different (seed, n): distinct valid ids and obeys the 10 % rule (or >=1 for neighbours)
for (let s = 1; s <= 30; s++) {
  for (let n = 0; n < 10; n++) {
    const pair = pickPair(s * 1000 + 42, n);
    assert.ok(pair.type && TYPES[pair.type], 'Valid type required');
    assert.ok(pair.a && pair.b, 'Both country ids required');
    assert.notStrictEqual(pair.a, pair.b, 'Countries must be distinct');

    const countryA = byId(pair.a);
    const countryB = byId(pair.b);
    assert.ok(countryA, `Country A (${pair.a}) must exist`);
    assert.ok(countryB, `Country B (${pair.b}) must exist`);

    const valA = countryA[pair.type];
    const valB = countryB[pair.type];
    assert.ok(valA != null && !isNaN(valA), `Value A must be valid`);
    assert.ok(valB != null && !isNaN(valB), `Value B must be valid`);

    if (pair.type === 'neighbours') {
      assert.ok(Math.abs(valA - valB) >= 1, `Neighbours must differ by >= 1 (${valA} vs ${valB})`);
    } else {
      const max = Math.max(valA, valB);
      assert.ok(max > 0, 'Max must be positive');
      assert.ok((Math.abs(valA - valB) / max) >= 0.10, `Pair must differ by at least 10% (${valA} vs ${valB})`);
    }
  }
}

// 4. answer with higher-valued country is correct and increases streak;
//    with lower-valued ends the game; second answer ignored; advance moves to new pair and clears picked
const game = newGame(55555);
assert.strictEqual(game.seed, 55555);
assert.strictEqual(game.n, 0);
assert.strictEqual(game.streak, 0);
assert.strictEqual(game.over, false);
assert.strictEqual(game.picked, null);

const cA = byId(game.pair.a);
const cB = byId(game.pair.b);
const vA = cA[game.pair.type];
const vB = cB[game.pair.type];
const higherId = vA > vB ? game.pair.a : game.pair.b;
const lowerId = vA > vB ? game.pair.b : game.pair.a;

// Correct answer
const res1 = answer(game, higherId);
assert.strictEqual(res1.correct, true);
assert.strictEqual(res1.aVal, vA);
assert.strictEqual(res1.bVal, vB);
assert.strictEqual(game.streak, 1);
assert.strictEqual(game.picked, higherId);
assert.strictEqual(game.over, false);

// Second answer ignored
const resIgnored = answer(game, lowerId);
assert.deepStrictEqual(resIgnored, { ignored: true });
assert.strictEqual(game.streak, 1);

// Advance moves to new pair and clears picked
advance(game);
assert.strictEqual(game.n, 1);
assert.strictEqual(game.picked, null);
assert.deepStrictEqual(game.pair, pickPair(55555, 1));

// Wrong answer on new pair ends the game
const cA2 = byId(game.pair.a);
const cB2 = byId(game.pair.b);
const vA2 = cA2[game.pair.type];
const vB2 = cB2[game.pair.type];
const lowerId2 = vA2 > vB2 ? game.pair.b : game.pair.a;

const resWrong = answer(game, lowerId2);
assert.strictEqual(resWrong.correct, false);
assert.strictEqual(resWrong.aVal, vA2);
assert.strictEqual(resWrong.bVal, vB2);
assert.strictEqual(game.over, true);
assert.strictEqual(game.picked, lowerId2);

// Answer after game over is ignored
const resAfterOver = answer(game, game.pair.a);
assert.deepStrictEqual(resAfterOver, { ignored: true });

// 5. Every flag file for 200 random pairs exists on disk
for (let i = 0; i < 200; i++) {
  const pair = pickPair(98765 + i, i);
  const flagA = new URL(`../georaetsel/assets/flags/${pair.a}.svg`, import.meta.url);
  const flagB = new URL(`../georaetsel/assets/flags/${pair.b}.svg`, import.meta.url);
  assert.ok(fs.existsSync(flagA), `Flag for ${pair.a} must exist on disk`);
  assert.ok(fs.existsSync(flagB), `Flag for ${pair.b} must exist on disk`);
}

console.log('alles ok');
