import assert from 'node:assert/strict';
import {
  LEVELS,
  ROW_OF,
  COL_OF,
  BOX_OF,
  PEERS,
  countSolutions,
  puzzleFor,
  newRound,
  isGiven,
  valueAt,
  setValue,
  erase,
  toggleNote,
  conflicts,
  remaining,
  shareText,
} from './logic.js';

// Helper to validate a 9x9 Sudoku solution
function validateSolution(solution) {
  assert.equal(solution.length, 81);
  for (let i = 0; i < 81; i++) {
    assert.ok(solution[i] >= 1 && solution[i] <= 9, `Cell ${i} has valid digit`);
  }

  // Rows
  for (let r = 0; r < 9; r++) {
    const row = new Set();
    for (let c = 0; c < 9; c++) row.add(solution[r * 9 + c]);
    assert.equal(row.size, 9, `Row ${r} contains 1..9`);
  }

  // Columns
  for (let c = 0; c < 9; c++) {
    const col = new Set();
    for (let r = 0; r < 9; r++) col.add(solution[r * 9 + c]);
    assert.equal(col.size, 9, `Column ${c} contains 1..9`);
  }

  // Boxes
  for (let b = 0; b < 9; b++) {
    const box = new Set();
    const br = Math.floor(b / 3) * 3;
    const bc = (b % 3) * 3;
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        box.add(solution[(br + dr) * 9 + (bc + dc)]);
      }
    }
    assert.equal(box.size, 9, `Box ${b} contains 1..9`);
  }
}

// 1. Generation test across daily seeds 20261101..20261120 and 3 seeds per level
const t0 = Date.now();

// Daily seeds (20261101..20261120), level 'mittel'
for (let seed = 20261101; seed <= 20261120; seed++) {
  const p1 = puzzleFor(seed, 'mittel');
  const p2 = puzzleFor(seed, 'mittel');

  // Determinism
  assert.deepEqual(p1.puzzle, p2.puzzle, `Puzzle for ${seed} is deterministic`);
  assert.deepEqual(p1.solution, p2.solution, `Solution for ${seed} is deterministic`);

  // Solution validity
  validateSolution(p1.solution);

  // Puzzle consistency with solution
  let givens = 0;
  for (let i = 0; i < 81; i++) {
    if (p1.puzzle[i] !== 0) {
      givens++;
      assert.equal(p1.puzzle[i], p1.solution[i], `Puzzle cell ${i} matches solution`);
    }
  }

  // Exactly one solution
  assert.equal(countSolutions(p1.puzzle, 2), 1, `Puzzle for ${seed} has unique solution`);

  // Givens count in [target-2, target+6]
  const target = LEVELS.mittel;
  assert.ok(givens >= target - 2 && givens <= target + 6, `Givens ${givens} in [${target - 2}, ${target + 6}]`);

  // Check monotonic givens across difficulty levels for same seed
  const pLeicht = puzzleFor(seed, 'leicht');
  const pSchwer = puzzleFor(seed, 'schwer');
  const givensLeicht = pLeicht.puzzle.filter(x => x !== 0).length;
  const givensSchwer = pSchwer.puzzle.filter(x => x !== 0).length;
  assert.ok(givensSchwer <= givens, `Schwer givens (${givensSchwer}) <= Mittel givens (${givens}) for seed ${seed}`);
  assert.ok(givens <= givensLeicht, `Mittel givens (${givens}) <= Leicht givens (${givensLeicht}) for seed ${seed}`);
}

// 3 seeds for each level
const testSeeds = [12345, 67890, 54321];
for (const level of ['leicht', 'mittel', 'schwer']) {
  const target = LEVELS[level];
  for (const seed of testSeeds) {
    const p = puzzleFor(seed, level);
    validateSolution(p.solution);
    let givens = 0;
    for (let i = 0; i < 81; i++) {
      if (p.puzzle[i] !== 0) {
        givens++;
        assert.equal(p.puzzle[i], p.solution[i]);
      }
    }
    assert.equal(countSolutions(p.puzzle, 2), 1);
    assert.ok(givens >= target - 2 && givens <= target + 6);
  }
}

for (const seed of testSeeds) {
  const gL = puzzleFor(seed, 'leicht').puzzle.filter(x => x !== 0).length;
  const gM = puzzleFor(seed, 'mittel').puzzle.filter(x => x !== 0).length;
  const gS = puzzleFor(seed, 'schwer').puzzle.filter(x => x !== 0).length;
  assert.ok(gS <= gM, `Seed ${seed}: Schwer (${gS}) <= Mittel (${gM})`);
  assert.ok(gM <= gL, `Seed ${seed}: Mittel (${gM}) <= Leicht (${gL})`);
}

const totalGenTime = Date.now() - t0;
console.log(`Total puzzle generation time: ${totalGenTime} ms`);
assert.ok(totalGenTime < 15000, `Total generation time (${totalGenTime} ms) must be under 15 s`);

// 2. Round initialization
const round = newRound(20261110, 'daily', 'mittel');
assert.equal(round.seed, 20261110);
assert.equal(round.mode, 'daily');
assert.equal(round.level, 'mittel');
assert.equal(round.cells.length, 81);
assert.equal(round.notes.length, 81);
assert.equal(round.mistakes, 0);
assert.equal(round.state, 'playing');
assert.equal(round.ms, 0);

// 3. isGiven & valueAt
const puzzleData = puzzleFor(round.seed, round.level);
let givenIdx = -1;
let emptyIdx = -1;
for (let i = 0; i < 81; i++) {
  if (puzzleData.puzzle[i] !== 0 && givenIdx === -1) givenIdx = i;
  if (puzzleData.puzzle[i] === 0 && emptyIdx === -1) emptyIdx = i;
}
assert.ok(givenIdx !== -1);
assert.ok(emptyIdx !== -1);
assert.equal(isGiven(round, givenIdx), true);
assert.equal(isGiven(round, emptyIdx), false);
assert.equal(valueAt(round, givenIdx), puzzleData.puzzle[givenIdx]);
assert.equal(valueAt(round, emptyIdx), 0);

// 4. setValue results: 'given', 'same', 'wrong', 'ok', 'ignored'
// Given cell:
const givenRes = setValue(round, givenIdx, 1);
assert.equal(givenRes.result, 'given');
assert.equal(round.mistakes, 0);

// Wrong value in empty cell:
const solVal = puzzleData.solution[emptyIdx];
const wrongVal = solVal === 9 ? 1 : solVal + 1;
const wrongRes = setValue(round, emptyIdx, wrongVal);
assert.equal(wrongRes.result, 'wrong');
assert.equal(round.mistakes, 1);
assert.equal(valueAt(round, emptyIdx), wrongVal);

// Same value:
const sameRes = setValue(round, emptyIdx, wrongVal);
assert.equal(sameRes.result, 'same');
assert.equal(round.mistakes, 1);

// Replace with correct value:
// First set a note on emptyIdx and on its peer
let peerIdx = PEERS[emptyIdx].find(p => !isGiven(round, p));
toggleNote(round, peerIdx, solVal);
assert.ok((round.notes[peerIdx] & (1 << (solVal - 1))) !== 0);

const okRes = setValue(round, emptyIdx, solVal);
assert.equal(okRes.result, 'ok');
assert.equal(round.mistakes, 1); // Not incremented
assert.equal(valueAt(round, emptyIdx), solVal);
assert.equal(round.notes[emptyIdx], 0); // Cell notes cleared
assert.equal(round.notes[peerIdx] & (1 << (solVal - 1)), 0); // Sol digit cleared from peer notes

// 5. Erase
erase(round, givenIdx);
assert.equal(valueAt(round, givenIdx), puzzleData.puzzle[givenIdx], 'erase does not clear given');

erase(round, emptyIdx);
assert.equal(valueAt(round, emptyIdx), 0, 'erase clears entered non-given');
assert.equal(round.notes[emptyIdx], 0);

// 6. toggleNote
toggleNote(round, emptyIdx, 3);
assert.equal(round.notes[emptyIdx], 1 << (3 - 1));
toggleNote(round, emptyIdx, 7);
assert.equal(round.notes[emptyIdx], (1 << (3 - 1)) | (1 << (7 - 1)));
toggleNote(round, emptyIdx, 3);
assert.equal(round.notes[emptyIdx], 1 << (7 - 1));

// toggleNote ignored on given or non-empty cell
toggleNote(round, givenIdx, 4);
assert.equal(round.notes[givenIdx], 0);
round.cells[emptyIdx] = 5;
toggleNote(round, emptyIdx, 4);
assert.equal(round.notes[emptyIdx], 1 << (7 - 1)); // Unchanged
round.cells[emptyIdx] = 0;
round.notes[emptyIdx] = 0;

// 7. Conflicts
const freshRound = newRound(20261110, 'daily', 'mittel');
assert.equal(conflicts(freshRound).size, 0); // Initial puzzle has 0 conflicts

// Find two empty cells in the same row
const r0Empty = [];
for (let c = 0; c < 9; c++) {
  const idx = c;
  if (!isGiven(freshRound, idx)) r0Empty.push(idx);
}
assert.ok(r0Empty.length >= 2);
setValue(freshRound, r0Empty[0], 9);
setValue(freshRound, r0Empty[1], 9);
const confSet = conflicts(freshRound);
assert.ok(confSet.has(r0Empty[0]));
assert.ok(confSet.has(r0Empty[1]));

// 8. Remaining
const remRound = newRound(20261110, 'daily', 'mittel');
const rem = remaining(remRound);
assert.equal(rem.length, 10);
assert.equal(rem[0], 0);
for (let d = 1; d <= 9; d++) {
  assert.ok(rem[d] >= 0 && rem[d] <= 9);
}

// 9. Win detection by entering the entire solution
const winRound = newRound(20261110, 'daily', 'mittel');
for (let i = 0; i < 81; i++) {
  if (!isGiven(winRound, i)) {
    setValue(winRound, i, puzzleData.solution[i]);
  }
}
assert.equal(winRound.state, 'won');
const afterWin = setValue(winRound, emptyIdx, 1);
assert.equal(afterWin.result, 'ignored', 'setValue ignored when state is won');

// 10. shareText
const share1 = shareText(round, '10. Nov.', 'https://geo.spanani.de/sudoku/');
assert.equal(share1, 'Sudoku 10. Nov.\nMittel · 1 Fehler\nhttps://geo.spanani.de/sudoku/');

const roundZeroMistakes = newRound(123, 'daily', 'mittel');
const share2 = shareText(roundZeroMistakes, '10. Nov.', 'https://geo.spanani.de/sudoku/');
assert.equal(share2, 'Sudoku 10. Nov.\nMittel · 0 Fehler\nhttps://geo.spanani.de/sudoku/');

const roundLeicht = newRound(123, 'practice', 'leicht');
roundLeicht.mistakes = 4;
const share3 = shareText(roundLeicht, 'Übung', 'https://geo.spanani.de/sudoku/');
assert.equal(share3, 'Sudoku Übung\nLeicht · 4 Fehler\nhttps://geo.spanani.de/sudoku/');

const roundSchwer = newRound(123, 'practice', 'schwer');
const share4 = shareText(roundSchwer, 'Übung', 'https://geo.spanani.de/sudoku/');
assert.equal(share4, 'Sudoku Übung\nSchwer · 0 Fehler\nhttps://geo.spanani.de/sudoku/');

console.log('alles ok');
