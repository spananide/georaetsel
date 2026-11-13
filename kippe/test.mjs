import assert from 'node:assert/strict';
import {
  COLS,
  MAX_H,
  COLORS,
  MAX_W,
  blockAt,
  limit,
  torque,
  newRound,
  peek,
  canDrop,
  drop,
  isOver,
  tilt,
  shareText,
} from './logic.js';

// 1. Constants
assert.equal(COLS, 9);
assert.equal(MAX_H, 6);
assert.equal(COLORS, 4);
assert.equal(MAX_W, 5);

// 2. blockAt determinism and weight range
const b1 = blockAt(42, 0);
const b2 = blockAt(42, 0);
assert.deepEqual(b1, b2);

const b3 = blockAt(20261114, 55);
const b4 = blockAt(20261114, 55);
assert.deepEqual(b3, b4);

// Weight range for small k (k < 10 -> w <= 2)
for (const seed of [0, 1, 42, 100003, 98765432]) {
  for (let k = 0; k < 10; k++) {
    const b = blockAt(seed, k);
    assert.ok(b.w >= 1 && b.w <= 2, `k=${k} weight should be 1..2, got ${b.w}`);
    assert.ok(b.c >= 0 && b.c < COLORS, `color should be 0..${COLORS - 1}, got ${b.c}`);
  }
}

// Weight range for all k: w in 1..5
const weightsSeen = new Set();
for (let k = 0; k < 150; k++) {
  const b = blockAt(777, k);
  assert.ok(b.w >= 1 && b.w <= MAX_W);
  assert.ok(b.c >= 0 && b.c < COLORS);
  weightsSeen.add(b.w);
}
assert.equal(weightsSeen.size, 5, 'All weights 1..5 should be generated eventually');

// 3. limit decreasing (placed 0 -> 14, 12 -> 13, 96 -> 6, 200 -> 6)
assert.equal(limit({ placed: 0 }), 14);
assert.equal(limit({ placed: 12 }), 13);
assert.equal(limit({ placed: 96 }), 6);
assert.equal(limit({ placed: 200 }), 6);
assert.equal(limit(0), 14);
assert.equal(limit(12), 13);
assert.equal(limit(96), 6);
assert.equal(limit(200), 6);

// 4. torque sign and calculations
const rTorque = newRound(1);
assert.equal(torque(rTorque), 0);

// Column 0 has arm -4 (negative)
rTorque.cols[0].push({ w: 3, c: 0 });
assert.equal(torque(rTorque), -12);

// Column 4 has arm 0 (center)
rTorque.cols[4].push({ w: 5, c: 1 });
assert.equal(torque(rTorque), -12);

// Column 8 has arm +4 (positive)
rTorque.cols[8].push({ w: 3, c: 2 });
assert.equal(torque(rTorque), 0);

// Add to column 7 (arm +3)
rTorque.cols[7].push({ w: 2, c: 3 });
assert.equal(torque(rTorque), 6);

// 5. newRound shape
const rNew = newRound(101);
assert.equal(rNew.seed, 101);
assert.equal(Array.isArray(rNew.cols), true);
assert.equal(rNew.cols.length, COLS);
for (let i = 0; i < COLS; i++) {
  assert.deepEqual(rNew.cols[i], []);
}
assert.equal(rNew.placed, 0);
assert.equal(rNew.score, 0);
assert.equal(rNew.bestCombo, 0);
assert.deepEqual(rNew.history, []);
assert.equal(rNew.state, 'playing');

// 6. JSON round-trip
const rJson = newRound(202);
rJson.cols[1].push({ w: 2, c: 1 });
rJson.placed = 1;
rJson.score = 5;
rJson.bestCombo = 1;
rJson.history = [1];
const jsonStr = JSON.stringify(rJson);
const rRestored = JSON.parse(jsonStr);
assert.deepEqual(rRestored, rJson);

// 7. peek
const rPeek = newRound(303);
const next3 = peek(rPeek);
assert.equal(next3.length, 3);
assert.deepEqual(next3[0], blockAt(303, 0));
assert.deepEqual(next3[1], blockAt(303, 1));
assert.deepEqual(next3[2], blockAt(303, 2));

const next5 = peek(rPeek, 5);
assert.equal(next5.length, 5);
assert.deepEqual(next5[4], blockAt(303, 4));

// 8. canDrop checks
const rCan = newRound(404);
for (let c = 0; c < COLS; c++) {
  assert.equal(canDrop(rCan, c), true);
}
assert.equal(canDrop(rCan, -1), false);
assert.equal(canDrop(rCan, 9), false);
assert.equal(canDrop(rCan, 3.5), false);
assert.equal(canDrop(rCan, '2'), false);
assert.equal(canDrop(rCan, null), false);
assert.equal(canDrop(rCan, undefined), false);

// Column full (MAX_H = 6)
rCan.cols[3] = Array.from({ length: MAX_H }, () => ({ w: 1, c: 0 }));
assert.equal(canDrop(rCan, 3), false);
assert.equal(canDrop(rCan, 4), true);

// Lost state
rCan.state = 'lost';
assert.equal(canDrop(rCan, 4), false);

// 9. drop does not mutate its input and returns same reference on invalid move
const rClean = newRound(505);
const rCleanSnap = JSON.parse(JSON.stringify(rClean));

// Invalid drops return the identical reference
assert.equal(drop(rClean, -1), rClean);
assert.equal(drop(rClean, 9), rClean);
assert.equal(drop(rCan, 3), rCan); // full col
assert.equal(drop(rCan, 0), rCan); // lost round

// Valid drop returns a new object, leaves original untouched
const rNext = drop(rClean, 4);
assert.notEqual(rNext, rClean);
assert.notEqual(rNext.cols, rClean.cols);
assert.notEqual(rNext.cols[4], rClean.cols[4]);
assert.notEqual(rNext.history, rClean.history);
assert.deepEqual(rClean, rCleanSnap);

// 10. Hand-built round where 3 same-colour blocks in a row clear
// Search for a seed where blockAt(seed, 0) has color 2
let seedColor2 = 0;
while (blockAt(seedColor2, 0).c !== 2) {
  seedColor2++;
}
const bDropped = blockAt(seedColor2, 0);
assert.equal(bDropped.c, 2);

const rClear = newRound(seedColor2);
// Horizontal row of 3 in columns 2, 3, 4 at height 0
rClear.cols[2] = [{ w: 2, c: 2 }];
rClear.cols[3] = [{ w: 3, c: 2 }];
// Drop into column 4
const rCleared = drop(rClear, 4);
assert.equal(rCleared.cols[2].length, 0);
assert.equal(rCleared.cols[3].length, 0);
assert.equal(rCleared.cols[4].length, 0);
assert.equal(rCleared.bestCombo, 1);
assert.equal(rCleared.placed, 1);
assert.deepEqual(rCleared.history, [4]);

// 11. Score formula
// Drop score: 1 point for placement + step * sum(weights)
const expectedClearScore = 1 + 1 * (2 + 3 + bDropped.w);
assert.equal(rCleared.score, expectedClearScore);

// Move without clears adds exactly 1 point
const rNoClear0 = newRound(888);
const rNoClear1 = drop(rNoClear0, 4);
assert.equal(rNoClear1.score, 1);
assert.equal(rNoClear1.bestCombo, 0);

// 12. Chain reaction giving bestCombo >= 2 (hand-built grid)
// We prepare:
// Col 3: y=0 -> c=1
// Col 4: y=0 -> c=1
// Col 5: y=0 -> c=0, y=1 -> c=1
// Col 6: y=0 -> c=0
// Drop into Col 7 with c=0
// Step 1: cols 5, 6, 7 at y=0 clear (color 0). Block at (5, 1) drops to (5, 0).
// Step 2: cols 3, 4, 5 at y=0 all have color 1 and clear!
let comboSeed = 0;
while (blockAt(comboSeed, 0).c !== 0) {
  comboSeed++;
}
const bComboDrop = blockAt(comboSeed, 0);
assert.equal(bComboDrop.c, 0);

const rCombo = newRound(comboSeed);
rCombo.cols[3] = [{ w: 1, c: 1 }];
rCombo.cols[4] = [{ w: 1, c: 1 }];
rCombo.cols[5] = [{ w: 1, c: 0 }, { w: 1, c: 1 }];
rCombo.cols[6] = [{ w: 1, c: 0 }];

const rComboDone = drop(rCombo, 7);
assert.equal(rComboDone.bestCombo, 2);
assert.equal(rComboDone.cols[3].length, 0);
assert.equal(rComboDone.cols[4].length, 0);
assert.equal(rComboDone.cols[5].length, 0);
assert.equal(rComboDone.cols[6].length, 0);
assert.equal(rComboDone.cols[7].length, 0);

const expectedComboScore = 1 + 1 * (1 + 1 + bComboDrop.w) + 2 * (1 + 1 + 1);
assert.equal(rComboDone.score, expectedComboScore);

// 13. Tipping: heavy blocks on one side causes 'lost'
const rTip = newRound(123);
// Arm for col 8 is +4. Total weight 5 -> torque 20 > limit 14
rTip.cols[8] = [{ w: 2, c: 0 }, { w: 3, c: 1 }];
const rTipped = drop(rTip, 8);
assert.equal(rTipped.state, 'lost');
assert.equal(isOver(rTipped), true);
assert.equal(tilt(rTipped), 1.2);

// 14. A clear that brings torque back under the limit keeps 'playing'
let clearTipSeed = 0;
while (blockAt(clearTipSeed, 0).c !== 3) {
  clearTipSeed++;
}
const bTipDrop = blockAt(clearTipSeed, 0);
assert.equal(bTipDrop.c, 3);

const rSave = newRound(clearTipSeed);
// Arm for col 8 is +4. Putting 2 blocks of weight 3 gives 24 torque before clear.
rSave.cols[8] = [{ w: 3, c: 3 }, { w: 3, c: 3 }];
// Dropping 3rd block into col 8 creates group of 3 with color 3, which clears
const rSaved = drop(rSave, 8);
assert.equal(rSaved.cols[8].length, 0);
assert.equal(torque(rSaved), 0);
assert.equal(rSaved.state, 'playing');
assert.equal(isOver(rSaved), false);

// 15. Losing when all columns are full
const rBoardFull = newRound(1);
// Fill columns 0..7 to MAX_H with non-matching alternating colors
for (let c = 0; c < 8; c++) {
  rBoardFull.cols[c] = Array.from({ length: MAX_H }, (_, h) => ({ w: 1, c: (c + h) % 2 }));
}
// Fill column 8 to MAX_H - 1
rBoardFull.cols[8] = Array.from({ length: MAX_H - 1 }, (_, h) => ({ w: 1, c: (8 + h) % 2 }));
// If dropping into column 8 doesn't clear (let's use a seed where it doesn't match neighbor or column 8 top)
let noMatchSeed = 0;
while (true) {
  const b = blockAt(noMatchSeed, 0);
  const topCol8 = rBoardFull.cols[8][MAX_H - 2].c; // height 4
  const neighborH5 = rBoardFull.cols[7][MAX_H - 1].c; // height 5
  if (b.c !== topCol8 && b.c !== neighborH5) break;
  noMatchSeed++;
}
rBoardFull.seed = noMatchSeed;
const rFullLost = drop(rBoardFull, 8);
assert.equal(rFullLost.cols.every(col => col.length === MAX_H), true);
assert.equal(rFullLost.state, 'lost');

// 16. tilt calculation and clamping
const rTiltTest = newRound(0);
assert.equal(tilt(rTiltTest), 0);
// Limit at placed=0 is 14
rTiltTest.cols[7] = [{ w: 2, c: 0 }]; // col 7 arm = 3, torque = 6
assert.equal(tilt(rTiltTest), 6 / 14);

rTiltTest.cols[0] = [{ w: 5, c: 0 }]; // col 0 arm = -4, torque = 6 - 20 = -14
assert.equal(tilt(rTiltTest), -14 / 14);

// Clamping
rTiltTest.cols[0].push({ w: 5, c: 1 }); // torque = -34
assert.equal(tilt(rTiltTest), -1.2);

// 17. shareText content
const rShare = {
  placed: 48,
  score: 320,
  bestCombo: 4,
};
const text = shareText(rShare, '14. Nov.', 'https://example.com/kippe');
const expectedLines = [
  'Kippe 14. Nov.',
  '48 Blöcke · 320 Punkte',
  'Beste Kette: 4x',
  '',
  'https://example.com/kippe',
];
assert.equal(text, expectedLines.join('\n'));

// 18. Simulated full run: minimises |torque| until isOver, terminates within 2000 drops
const simSeeds = [12345, 999, 20261114];
for (const seed of simSeeds) {
  let rSim = newRound(seed);
  let drops = 0;
  while (!isOver(rSim) && drops < 2000) {
    let bestCol = -1;
    let minAbsTorque = Infinity;
    for (let c = 0; c < COLS; c++) {
      if (canDrop(rSim, c)) {
        const candidate = drop(rSim, c);
        const absT = Math.abs(torque(candidate));
        if (absT < minAbsTorque) {
          minAbsTorque = absT;
          bestCol = c;
        }
      }
    }
    if (bestCol === -1) break;
    rSim = drop(rSim, bestCol);
    drops++;
  }
  assert.equal(isOver(rSim), true, `Simulation with seed ${seed} should end in lost state`);
  assert.ok(drops > 0 && drops <= 2000, `Simulation with seed ${seed} terminated in ${drops} drops`);
}

console.log('alles ok');
