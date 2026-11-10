import assert from 'node:assert/strict';
import {
  puzzleFor,
  countSolutions,
  newRound,
  toggle,
  conflicts,
  shareText,
} from './logic.js';

// Flood-fill helper to verify region contiguity
function verifyContiguous(size, regions, regId) {
  const cells = [];
  for (let i = 0; i < size * size; i++) {
    if (regions[i] === regId) cells.push(i);
  }
  if (cells.length === 0) return false;
  const visited = new Set();
  const queue = [cells[0]];
  visited.add(cells[0]);
  while (queue.length > 0) {
    const curr = queue.shift();
    const r = Math.floor(curr / size);
    const c = curr % size;
    const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of deltas) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
        const nidx = nr * size + nc;
        if (regions[nidx] === regId && !visited.has(nidx)) {
          visited.add(nidx);
          queue.push(nidx);
        }
      }
    }
  }
  return visited.size === cells.length;
}

// 1. Verify 30 daily puzzles (20261101..20261130) and practice seeds
const t0 = Date.now();
for (let seed = 20261101; seed <= 20261130; seed++) {
  const p1 = puzzleFor(seed, 'daily');
  const p2 = puzzleFor(seed, 'daily');

  // Determinism check
  assert.equal(p1.size, 8);
  assert.deepEqual(p1.solution, p2.solution);
  assert.deepEqual(p1.regions, p2.regions);

  // Region count and contiguity
  const regionsFound = new Set(p1.regions);
  assert.equal(regionsFound.size, 8);
  for (let reg = 0; reg < 8; reg++) {
    assert.ok(regionsFound.has(reg), `Region ${reg} exists`);
    assert.ok(verifyContiguous(8, p1.regions, reg), `Region ${reg} is contiguous`);
  }

  // Solution satisfies rules
  assert.equal(p1.solution.length, 8);
  const usedCols = new Set(p1.solution);
  assert.equal(usedCols.size, 8, 'Distinct columns');
  const solutionRegions = new Set();
  for (let r = 0; r < 8; r++) {
    const c = p1.solution[r];
    assert.ok(c >= 0 && c < 8);
    if (r > 0) {
      assert.ok(Math.abs(c - p1.solution[r - 1]) > 1, 'Crowns do not touch diagonally or vertically');
    }
    const reg = p1.regions[r * 8 + c];
    solutionRegions.add(reg);
  }
  assert.equal(solutionRegions.size, 8, 'One crown per region');

  // countSolutions === 1
  assert.equal(countSolutions(8, p1.regions, 2), 1, `Puzzle for ${seed} has unique solution`);
}

const dailyDuration = Date.now() - t0;
console.log(`Generated 30 daily puzzles in ${dailyDuration} ms`);
assert.ok(dailyDuration < 20000, 'Generation time of 30 daily puzzles must be under 20 s');

// Practice seeds
for (const pSeed of [123, 456, 789, 9999]) {
  const p = puzzleFor(pSeed, 'practice');
  const expectedSize = 6 + (Math.abs(pSeed) % 4);
  assert.equal(p.size, expectedSize);
  assert.equal(countSolutions(p.size, p.regions, 2), 1, `Practice seed ${pSeed} has unique solution`);
  for (let reg = 0; reg < p.size; reg++) {
    assert.ok(verifyContiguous(p.size, p.regions, reg));
  }
}

// 2. Toggle cycling and placed counting
const round = newRound(20261101, 'daily');
assert.equal(round.placed, 0);
assert.equal(round.state, 'playing');
assert.equal(round.cells[0], 0);

toggle(round, 0); // 0 -> 1 (cross)
assert.equal(round.cells[0], 1);
assert.equal(round.placed, 0);

toggle(round, 0); // 1 -> 2 (crown)
assert.equal(round.cells[0], 2);
assert.equal(round.placed, 1);

toggle(round, 0); // 2 -> 0 (empty)
assert.equal(round.cells[0], 0);
assert.equal(round.placed, 1); // placed stays 1

// 3. Conflicts detection
const p = puzzleFor(round.seed, round.mode);
// Same row conflict
const rRow = newRound(round.seed, round.mode);
rRow.cells[0] = 2; // (0, 0)
rRow.cells[3] = 2; // (0, 3)
const confRow = conflicts(rRow);
assert.ok(confRow.has(0));
assert.ok(confRow.has(3));

// Same column conflict
const rCol = newRound(round.seed, round.mode);
rCol.cells[0] = 2; // (0, 0)
rCol.cells[16] = 2; // (2, 0)
const confCol = conflicts(rCol);
assert.ok(confCol.has(0));
assert.ok(confCol.has(16));

// Diagonal touching conflict
const rDiag = newRound(round.seed, round.mode);
rDiag.cells[0] = 2; // (0, 0)
rDiag.cells[9] = 2; // (1, 1)
const confDiag = conflicts(rDiag);
assert.ok(confDiag.has(0));
assert.ok(confDiag.has(9));

// Same region conflict
const rReg = newRound(round.seed, round.mode);
// find two cells in the same region that are not in same row or col and not touching
let regPair = null;
for (let i = 0; i < 64 && !regPair; i++) {
  for (let j = i + 1; j < 64; j++) {
    if (p.regions[i] === p.regions[j]) {
      const r1 = Math.floor(i / 8), c1 = i % 8;
      const r2 = Math.floor(j / 8), c2 = j % 8;
      if (r1 !== r2 && c1 !== c2 && (Math.abs(r1 - r2) > 1 || Math.abs(c1 - c2) > 1)) {
        regPair = [i, j];
        break;
      }
    }
  }
}
assert.ok(regPair !== null);
rReg.cells[regPair[0]] = 2;
rReg.cells[regPair[1]] = 2;
const confReg = conflicts(rReg);
assert.ok(confReg.has(regPair[0]));
assert.ok(confReg.has(regPair[1]));

// 4. Winning detection
const rWin = newRound(20261101, 'daily');
for (let row = 0; row < 8; row++) {
  const col = p.solution[row];
  toggle(rWin, row * 8 + col); // 0 -> 1
  toggle(rWin, row * 8 + col); // 1 -> 2
}
assert.equal(rWin.state, 'won');
assert.equal(rWin.placed, 8);

// Fully wrong board does not win
const rWrong = newRound(20261101, 'daily');
for (let row = 0; row < 8; row++) {
  rWrong.cells[row * 8] = 2; // all crowns in column 0
}
assert.notEqual(rWrong.state, 'won');

// 5. Share text format
const st = shareText(rWin, '10. Nov.', 'https://geo.spanani.de/kronen/');
assert.equal(st, 'Kronen 10. Nov.\n8×8 · 8 Züge\nhttps://geo.spanani.de/kronen/');

console.log('alles ok');
