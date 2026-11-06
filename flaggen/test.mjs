import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTRIES } from '../georaetsel/data/countries.js';
import { byId } from '../georaetsel/game.js';
import {
  ROUND_SIZE,
  pickFlags,
  newRound,
  hintsFor,
  submit,
  giveUp,
  next,
  total,
  shareText,
} from './logic.js';

// 1. Same seed gives identical ids, different seeds differ, ids unique and valid, length 10
const seed1 = 20261106;
const seed2 = 20261107;
const ids1a = pickFlags(seed1);
const ids1b = pickFlags(seed1);
const ids2 = pickFlags(seed2);

assert.strictEqual(ids1a.length, ROUND_SIZE, 'Round size must be 10');
assert.deepStrictEqual(ids1a, ids1b, 'Same seed must give identical ids');
assert.notDeepStrictEqual(ids1a, ids2, 'Different seeds must differ');

const validIds = new Set(COUNTRIES.map(c => c.id));
assert.strictEqual(new Set(ids1a).size, ROUND_SIZE, 'Ids must be unique');
for (const id of ids1a) {
  assert(validIds.has(id), `Id ${id} must be a valid country id`);
}

// 2. Every picked flag file exists on disk (../georaetsel/assets/flags/<id>.svg)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const id of ids1a) {
  const flagPath = path.resolve(__dirname, `../georaetsel/assets/flags/${id}.svg`);
  assert(fs.existsSync(flagPath), `Flag file must exist: ${flagPath}`);
}

// 3. Full scripted round
const round = newRound(seed1);
assert.strictEqual(round.state, 'asking');
assert.strictEqual(round.idx, 0);

// Flag 0: correct first try = 3 pts
const flag0Id = round.ids[0];
const res0 = submit(round, flag0Id);
assert.deepStrictEqual(res0, { result: 'correct', pts: 3 });
assert.strictEqual(round.state, 'revealed');
assert.strictEqual(round.results.length, 1);
assert.deepStrictEqual(round.results[0], { id: flag0Id, pts: 3, solved: true });

// submit in non-asking state is ignored
const ignoredRes = submit(round, flag0Id);
assert.deepStrictEqual(ignoredRes, { result: 'ignored' });

next(round);
assert.strictEqual(round.state, 'asking');
assert.strictEqual(round.idx, 1);
assert.strictEqual(round.misses, 0);
assert.deepStrictEqual(round.wrong, []);

// Flag 1: correct on try 3 = 1 pt; hints after 1 and 2 misses (Kontinent, then Beginnt mit); repeat of a wrong id costs nothing
const flag1Id = round.ids[1];
const country1 = byId(flag1Id);
const wrongId1 = COUNTRIES.find(c => c.id !== flag1Id).id;
const wrongId2 = COUNTRIES.find(c => c.id !== flag1Id && c.id !== wrongId1).id;

// Miss 1
const miss1Res = submit(round, wrongId1);
assert.strictEqual(round.misses, 1);
assert.deepStrictEqual(round.wrong, [wrongId1]);
assert.deepStrictEqual(miss1Res, {
  result: 'wrong',
  hints: [`Kontinent: ${country1.continent}`],
});
assert.deepStrictEqual(hintsFor(round), [`Kontinent: ${country1.continent}`]);

// Repeat of a wrong id costs nothing
const repeatRes = submit(round, wrongId1);
assert.deepStrictEqual(repeatRes, { result: 'repeat' });
assert.strictEqual(round.misses, 1);
assert.deepStrictEqual(round.wrong, [wrongId1]);

// Miss 2
const miss2Res = submit(round, wrongId2);
assert.strictEqual(round.misses, 2);
assert.deepStrictEqual(round.wrong, [wrongId1, wrongId2]);
assert.deepStrictEqual(miss2Res, {
  result: 'wrong',
  hints: [`Kontinent: ${country1.continent}`, `Beginnt mit „${country1.name[0]}“`],
});
assert.deepStrictEqual(hintsFor(round), [
  `Kontinent: ${country1.continent}`,
  `Beginnt mit „${country1.name[0]}“`,
]);

// Try 3: correct -> 1 pt
const try3Res = submit(round, flag1Id);
assert.deepStrictEqual(try3Res, { result: 'correct', pts: 1 });
assert.strictEqual(round.state, 'revealed');
assert.strictEqual(round.results.length, 2);
assert.deepStrictEqual(round.results[1], { id: flag1Id, pts: 1, solved: true });

next(round);
assert.strictEqual(round.idx, 2);
assert.strictEqual(round.state, 'asking');

// Flag 2: 3 misses = 0 and state 'revealed'
const flag2Id = round.ids[2];
const w1 = COUNTRIES.find(c => c.id !== flag2Id).id;
const w2 = COUNTRIES.find(c => c.id !== flag2Id && c.id !== w1).id;
const w3 = COUNTRIES.find(c => c.id !== flag2Id && c.id !== w1 && c.id !== w2).id;

submit(round, w1);
submit(round, w2);
const lostRes = submit(round, w3);
assert.deepStrictEqual(lostRes, { result: 'lost' });
assert.strictEqual(round.state, 'revealed');
assert.strictEqual(round.results.length, 3);
assert.deepStrictEqual(round.results[2], { id: flag2Id, pts: 0, solved: false });

next(round);
assert.strictEqual(round.idx, 3);
assert.strictEqual(round.state, 'asking');

// Flag 3: giveUp = 0
const flag3Id = round.ids[3];
const giveUpRes = giveUp(round);
assert.deepStrictEqual(giveUpRes, { result: 'lost' });
assert.strictEqual(round.state, 'revealed');
assert.strictEqual(round.results.length, 4);
assert.deepStrictEqual(round.results[3], { id: flag3Id, pts: 0, solved: false });

next(round);
assert.strictEqual(round.idx, 4);

// Flags 4 through 9: complete them
// Flag 4: correct try 2 = 2 pts
const flag4Id = round.ids[4];
const w4 = COUNTRIES.find(c => c.id !== flag4Id).id;
submit(round, w4);
const res4 = submit(round, flag4Id);
assert.deepStrictEqual(res4, { result: 'correct', pts: 2 });
next(round);

// Flag 5: correct try 1 = 3 pts
submit(round, round.ids[5]);
next(round);

// Flag 6: correct try 1 = 3 pts
submit(round, round.ids[6]);
next(round);

// Flag 7: correct try 1 = 3 pts
submit(round, round.ids[7]);
next(round);

// Flag 8: correct try 1 = 3 pts
submit(round, round.ids[8]);
next(round);

// Flag 9 (10th flag): correct try 1 = 3 pts
assert.strictEqual(round.idx, 9);
submit(round, round.ids[9]);
assert.strictEqual(round.state, 'revealed');

// next after 10th flag gives state 'done'
next(round);
assert.strictEqual(round.state, 'done');
assert.strictEqual(round.idx, 10);

// submit in state 'done' is ignored
assert.deepStrictEqual(submit(round, 'de'), { result: 'ignored' });

// total sums right
// Points: 3 + 1 + 0 + 0 + 2 + 3 + 3 + 3 + 3 + 3 = 21
assert.strictEqual(total(round), 21);

// round survives JSON.parse(JSON.stringify(round))
const serialized = JSON.stringify(round);
const restored = JSON.parse(serialized);
assert.deepStrictEqual(restored, round);
assert.strictEqual(total(restored), 21);

// shareText has the right emoji rows and the first line
// Results: 3, 1, 0, 0, 2, 3, 3, 3, 3, 3
// Row 1 (first 5): 3=🟩, 1=🟧, 0=🟥, 0=🟥, 2=🟨 -> 🟩🟧🟥🟥🟨
// Row 2 (next 5): 3=🟩, 3=🟩, 3=🟩, 3=🟩, 3=🟩 -> 🟩🟩🟩🟩🟩
const testLabel = '6. Nov.';
const testUrl = 'https://geo.spanani.de/flaggen/';
const share = shareText(round, testLabel, testUrl);

const lines = share.split('\n');
assert.strictEqual(lines[0], `Flaggenjagd ${testLabel}`);
assert.strictEqual(lines[1], `21/30 Punkte`);
assert.strictEqual(lines[2], '');
assert.strictEqual(lines[3], '🟩🟧🟥🟥🟨');
assert.strictEqual(lines[4], '🟩🟩🟩🟩🟩');
assert.strictEqual(lines[5], '');
assert.strictEqual(lines[6], testUrl);

console.log('alles ok');
