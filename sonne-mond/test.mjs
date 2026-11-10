import assert from 'node:assert/strict';
import {
  puzzleFor,
  countSolutions,
  newRound,
  toggle,
  conflicts,
  shareText,
} from './logic.js';

// 1. Verify 30 daily puzzles (20261101..20261130)
const t0 = Date.now();
for (let seed = 20261101; seed <= 20261130; seed++) {
  const p1 = puzzleFor(seed, 'daily');
  const p2 = puzzleFor(seed, 'daily');

  // Determinism
  assert.equal(p1.size, 6);
  assert.deepEqual(p1.solution, p2.solution);
  assert.deepEqual(p1.given, p2.given);
  assert.deepEqual(p1.links, p2.links);

  // Solution validity: 3 suns (0), 3 moons (1) per row and col, no 3 consecutive
  for (let r = 0; r < 6; r++) {
    let suns = 0, moons = 0;
    for (let c = 0; c < 6; c++) {
      const v = p1.solution[r * 6 + c];
      assert.ok(v === 0 || v === 1);
      if (v === 0) suns++;
      else moons++;
      if (c >= 2) {
        assert.ok(
          !(p1.solution[r * 6 + c] === p1.solution[r * 6 + c - 1] && p1.solution[r * 6 + c] === p1.solution[r * 6 + c - 2]),
          'No 3 consecutive in row'
        );
      }
    }
    assert.equal(suns, 3, `Row ${r} has 3 suns`);
    assert.equal(moons, 3, `Row ${r} has 3 moons`);
  }

  for (let c = 0; c < 6; c++) {
    let suns = 0, moons = 0;
    for (let r = 0; r < 6; r++) {
      const v = p1.solution[r * 6 + c];
      if (v === 0) suns++;
      else moons++;
      if (r >= 2) {
        assert.ok(
          !(p1.solution[r * 6 + c] === p1.solution[(r - 1) * 6 + c] && p1.solution[r * 6 + c] === p1.solution[(r - 2) * 6 + c]),
          'No 3 consecutive in col'
        );
      }
    }
    assert.equal(suns, 3, `Col ${c} has 3 suns`);
    assert.equal(moons, 3, `Col ${c} has 3 moons`);
  }

  // Links consistent with solution
  for (const l of p1.links) {
    const va = p1.solution[l.a];
    const vb = p1.solution[l.b];
    assert.equal(l.same, va === vb, 'Link matches solution');
  }

  // Givens consistent with solution
  assert.equal(p1.given.length, 36);

  // countSolutions === 1
  assert.equal(countSolutions(p1, 2), 1, `Puzzle for seed ${seed} has unique solution`);
}

const duration = Date.now() - t0;
console.log(`Generated and verified 30 daily puzzles in ${duration} ms`);

// Practice seeds
for (const pSeed of [111, 222, 333]) {
  const p = puzzleFor(pSeed, 'practice');
  assert.equal(p.size, 6);
  assert.equal(countSolutions(p, 2), 1);
}

// 2. Toggle cycling and locked givens
const p = puzzleFor(20261101, 'daily');
const r1 = newRound(20261101, 'daily');

// Find a given cell and a non-given cell
let givenIdx = -1;
let nonGivenIdx = -1;
for (let i = 0; i < 36; i++) {
  if (p.given[i] && givenIdx === -1) givenIdx = i;
  if (!p.given[i] && nonGivenIdx === -1) nonGivenIdx = i;
}
assert.ok(givenIdx !== -1, 'Has at least one given cell');
assert.ok(nonGivenIdx !== -1, 'Has at least one non-given cell');

// Given cell is locked
const originalGivenVal = r1.cells[givenIdx];
assert.equal(originalGivenVal, p.solution[givenIdx]);
toggle(r1, givenIdx);
assert.equal(r1.cells[givenIdx], originalGivenVal, 'Given cell cannot be toggled');
assert.equal(r1.placed, 0);

// Non-given cell cycles: -1 -> 0 -> 1 -> -1
assert.equal(r1.cells[nonGivenIdx], -1);
toggle(r1, nonGivenIdx); // -1 -> 0 (sun)
assert.equal(r1.cells[nonGivenIdx], 0);
assert.equal(r1.placed, 1);

toggle(r1, nonGivenIdx); // 0 -> 1 (moon)
assert.equal(r1.cells[nonGivenIdx], 1);
assert.equal(r1.placed, 2);

toggle(r1, nonGivenIdx); // 1 -> -1 (empty)
assert.equal(r1.cells[nonGivenIdx], -1);
assert.equal(r1.placed, 2); // clearing doesn't increment placed

// 3. Conflicts cases
// Case A: 3 equal consecutive in a row
const rConflict = newRound(20261101, 'daily');
rConflict.cells[0] = 0;
rConflict.cells[1] = 0;
rConflict.cells[2] = 0;
const confA = conflicts(rConflict);
assert.ok(confA.has(0));
assert.ok(confA.has(1));
assert.ok(confA.has(2));

// Case B: More than 3 of one symbol in a row
const rConflictRow = newRound(20261101, 'daily');
for (let c = 0; c < 4; c++) {
  rConflictRow.cells[c] = 1; // 4 moons in row 0
}
const confB = conflicts(rConflictRow);
for (let c = 0; c < 4; c++) {
  assert.ok(confB.has(c));
}

// Case C: Violated link
const rConflictLink = newRound(20261101, 'daily');
if (p.links.length > 0) {
  const l = p.links[0];
  // Break the link
  if (l.same) {
    rConflictLink.cells[l.a] = 0;
    rConflictLink.cells[l.b] = 1;
  } else {
    rConflictLink.cells[l.a] = 0;
    rConflictLink.cells[l.b] = 0;
  }
  const confC = conflicts(rConflictLink);
  assert.ok(confC.has(l.a));
  assert.ok(confC.has(l.b));
}

// 4. Win detection
const rWin = newRound(20261101, 'daily');
for (let i = 0; i < 36; i++) {
  if (!p.given[i]) {
    // Set to solution
    const target = p.solution[i];
    if (target === 0) {
      toggle(rWin, i); // -1 -> 0
    } else {
      toggle(rWin, i); // -1 -> 0
      toggle(rWin, i); // 0 -> 1
    }
  }
}
assert.equal(rWin.state, 'won');

// Fully wrong board does not win
const rWrong = newRound(20261101, 'daily');
for (let i = 0; i < 36; i++) {
  if (!p.given[i]) {
    // Invert solution
    rWrong.cells[i] = 1 - p.solution[i];
  }
}
assert.notEqual(rWrong.state, 'won');

// 5. Share text
const st = shareText(rWin, '10. Nov.', 'https://geo.spanani.de/sonne-mond/');
assert.equal(st, `Sonne & Mond 10. Nov.\n6×6 · ${rWin.placed} Züge\nhttps://geo.spanani.de/sonne-mond/`);

console.log('alles ok');
