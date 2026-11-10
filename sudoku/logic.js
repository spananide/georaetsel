import { mulberry32 } from '../georaetsel/game.js';

export const LEVELS = {
  leicht: 40,
  mittel: 32,
  schwer: 27,
};

// Precompute rows, cols, boxes, and peers for all 81 cells
export const ROW_OF = new Uint8Array(81);
export const COL_OF = new Uint8Array(81);
export const BOX_OF = new Uint8Array(81);
export const PEERS = new Array(81);

for (let i = 0; i < 81; i++) {
  const r = Math.floor(i / 9);
  const c = i % 9;
  const b = Math.floor(r / 3) * 3 + Math.floor(c / 3);
  ROW_OF[i] = r;
  COL_OF[i] = c;
  BOX_OF[i] = b;
}

for (let i = 0; i < 81; i++) {
  const p = new Set();
  const r = ROW_OF[i];
  const c = COL_OF[i];
  const b = BOX_OF[i];
  for (let j = 0; j < 81; j++) {
    if (j !== i && (ROW_OF[j] === r || COL_OF[j] === c || BOX_OF[j] === b)) {
      p.add(j);
    }
  }
  PEERS[i] = Array.from(p);
}

const POPCOUNT = new Uint8Array(512);
for (let i = 0; i < 512; i++) {
  let cnt = 0;
  let x = i;
  while (x > 0) {
    cnt += x & 1;
    x >>= 1;
  }
  POPCOUNT[i] = cnt;
}

// Backtracking solver with bitmask candidates and MRV to count solutions up to limit
export function countSolutions(grid, limit = 2) {
  const rowMask = new Uint16Array(9);
  const colMask = new Uint16Array(9);
  const boxMask = new Uint16Array(9);
  const empty = [];

  for (let i = 0; i < 81; i++) {
    const val = grid[i];
    if (val !== 0) {
      const bit = 1 << (val - 1);
      rowMask[ROW_OF[i]] |= bit;
      colMask[COL_OF[i]] |= bit;
      boxMask[BOX_OF[i]] |= bit;
    } else {
      empty.push(i);
    }
  }

  let solutions = 0;

  function search() {
    if (empty.length === 0) {
      solutions++;
      return;
    }

    let bestIdx = -1;
    let minCandidates = 10;
    let bestMask = 0;

    for (let k = 0; k < empty.length; k++) {
      const cell = empty[k];
      const used = rowMask[ROW_OF[cell]] | colMask[COL_OF[cell]] | boxMask[BOX_OF[cell]];
      const candMask = (~used) & 0x1ff;
      const count = POPCOUNT[candMask];

      if (count === 0) return;
      if (count < minCandidates) {
        minCandidates = count;
        bestIdx = k;
        bestMask = candMask;
        if (count === 1) break;
      }
    }

    const cell = empty[bestIdx];
    empty[bestIdx] = empty[empty.length - 1];
    empty.pop();

    const r = ROW_OF[cell];
    const c = COL_OF[cell];
    const b = BOX_OF[cell];

    let mask = bestMask;
    while (mask > 0) {
      const bit = mask & -mask;
      mask ^= bit;

      rowMask[r] |= bit;
      colMask[c] |= bit;
      boxMask[b] |= bit;

      search();

      rowMask[r] ^= bit;
      colMask[c] ^= bit;
      boxMask[b] ^= bit;

      if (solutions >= limit) break;
    }

    empty.push(cell);
    empty[empty.length - 1] = empty[bestIdx];
    empty[bestIdx] = cell;
  }

  search();
  return solutions;
}

// Generate a full valid 9x9 grid deterministically from rng
function generateFullGrid(rng) {
  const grid = new Uint8Array(81);
  const rowMask = new Uint16Array(9);
  const colMask = new Uint16Array(9);
  const boxMask = new Uint16Array(9);
  const empty = [];
  for (let i = 0; i < 81; i++) empty.push(i);

  function search() {
    if (empty.length === 0) return true;

    let bestIdx = -1;
    let minCandidates = 10;
    let bestMask = 0;

    for (let k = 0; k < empty.length; k++) {
      const cell = empty[k];
      const used = rowMask[ROW_OF[cell]] | colMask[COL_OF[cell]] | boxMask[BOX_OF[cell]];
      const candMask = (~used) & 0x1ff;
      const count = POPCOUNT[candMask];

      if (count === 0) return false;
      if (count < minCandidates) {
        minCandidates = count;
        bestIdx = k;
        bestMask = candMask;
        if (count === 1) break;
      }
    }

    const cell = empty[bestIdx];
    empty[bestIdx] = empty[empty.length - 1];
    empty.pop();

    const r = ROW_OF[cell];
    const c = COL_OF[cell];
    const b = BOX_OF[cell];

    const candList = [];
    let mask = bestMask;
    while (mask > 0) {
      const bit = mask & -mask;
      mask ^= bit;
      const digit = 31 - Math.clz32(bit) + 1;
      candList.push({ digit, bit });
    }

    // Shuffle candidate digits using seeded rng
    for (let i = candList.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = candList[i];
      candList[i] = candList[j];
      candList[j] = tmp;
    }

    for (const cand of candList) {
      grid[cell] = cand.digit;
      rowMask[r] |= cand.bit;
      colMask[c] |= cand.bit;
      boxMask[b] |= cand.bit;

      if (search()) return true;

      grid[cell] = 0;
      rowMask[r] ^= cand.bit;
      colMask[c] ^= cand.bit;
      boxMask[b] ^= cand.bit;
    }

    empty.push(cell);
    empty[empty.length - 1] = empty[bestIdx];
    empty[bestIdx] = cell;
    return false;
  }

  search();
  return grid;
}

let memoLast = null;

// Generate or return memoised puzzle for seed and level
export function puzzleFor(seed, level = 'mittel') {
  const normLevel = LEVELS[level] !== undefined ? level : 'mittel';
  if (memoLast && memoLast.seed === seed && memoLast.level === normLevel) {
    return memoLast.result;
  }

  const target = LEVELS[normLevel];
  const rng = mulberry32(seed);
  const solution = generateFullGrid(rng);

  const order = [];
  for (let i = 0; i < 81; i++) order.push(i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }

  const puzzle = new Uint8Array(solution);
  let givens = 81;

  for (const pos of order) {
    if (givens <= target) break;
    const val = puzzle[pos];
    puzzle[pos] = 0;
    if (countSolutions(puzzle, 2) === 1) {
      givens--;
    } else {
      puzzle[pos] = val;
    }
  }

  const result = {
    puzzle: Array.from(puzzle),
    solution: Array.from(solution),
  };

  memoLast = { seed, level: normLevel, result };
  return result;
}

// Create a new round object
export function newRound(seed, mode = 'daily', level = 'mittel') {
  const normLevel = mode === 'daily' ? 'mittel' : (LEVELS[level] !== undefined ? level : 'mittel');
  return {
    seed,
    mode,
    level: normLevel,
    cells: new Array(81).fill(0),
    notes: new Array(81).fill(0),
    mistakes: 0,
    state: 'playing',
    ms: 0,
  };
}

export function isGiven(round, i) {
  const p = puzzleFor(round.seed, round.level);
  return p.puzzle[i] !== 0;
}

export function valueAt(round, i) {
  const p = puzzleFor(round.seed, round.level);
  if (p.puzzle[i] !== 0) return p.puzzle[i];
  return round.cells[i] || 0;
}

export function setValue(round, i, v) {
  if (round.state !== 'playing') {
    return { result: 'ignored' };
  }
  if (v < 1 || v > 9) {
    return { result: 'ignored' };
  }
  const p = puzzleFor(round.seed, round.level);
  if (p.puzzle[i] !== 0) {
    return { result: 'given' };
  }
  if (valueAt(round, i) === v) {
    return { result: 'same' };
  }

  round.cells[i] = v;
  round.notes[i] = 0;
  const bitClear = ~(1 << (v - 1));
  for (const peer of PEERS[i]) {
    round.notes[peer] &= bitClear;
  }

  if (v === p.solution[i]) {
    let complete = true;
    for (let j = 0; j < 81; j++) {
      if (valueAt(round, j) !== p.solution[j]) {
        complete = false;
        break;
      }
    }
    if (complete) {
      round.state = 'won';
    }
    return { result: 'ok' };
  } else {
    round.mistakes++;
    return { result: 'wrong' };
  }
}

export function erase(round, i) {
  if (round.state !== 'playing') return;
  if (isGiven(round, i)) return;
  round.cells[i] = 0;
  round.notes[i] = 0;
}

export function toggleNote(round, i, v) {
  if (round.state !== 'playing') return;
  if (isGiven(round, i)) return;
  if (round.cells[i] !== 0) return;
  if (v < 1 || v > 9) return;
  round.notes[i] ^= (1 << (v - 1));
}

export function conflicts(round) {
  const conf = new Set();

  // Rows
  for (let r = 0; r < 9; r++) {
    const seen = new Map();
    for (let c = 0; c < 9; c++) {
      const idx = r * 9 + c;
      const val = valueAt(round, idx);
      if (val !== 0) {
        if (!seen.has(val)) seen.set(val, []);
        seen.get(val).push(idx);
      }
    }
    for (const indices of seen.values()) {
      if (indices.length > 1) {
        for (const idx of indices) conf.add(idx);
      }
    }
  }

  // Columns
  for (let c = 0; c < 9; c++) {
    const seen = new Map();
    for (let r = 0; r < 9; r++) {
      const idx = r * 9 + c;
      const val = valueAt(round, idx);
      if (val !== 0) {
        if (!seen.has(val)) seen.set(val, []);
        seen.get(val).push(idx);
      }
    }
    for (const indices of seen.values()) {
      if (indices.length > 1) {
        for (const idx of indices) conf.add(idx);
      }
    }
  }

  // 3x3 Boxes
  for (let b = 0; b < 9; b++) {
    const br = Math.floor(b / 3) * 3;
    const bc = (b % 3) * 3;
    const seen = new Map();
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        const idx = (br + dr) * 9 + (bc + dc);
        const val = valueAt(round, idx);
        if (val !== 0) {
          if (!seen.has(val)) seen.set(val, []);
          seen.get(val).push(idx);
        }
      }
    }
    for (const indices of seen.values()) {
      if (indices.length > 1) {
        for (const idx of indices) conf.add(idx);
      }
    }
  }

  return conf;
}

export function remaining(round) {
  const counts = new Array(10).fill(0);
  for (let i = 0; i < 81; i++) {
    const val = valueAt(round, i);
    if (val >= 1 && val <= 9) {
      counts[val]++;
    }
  }
  const rem = new Array(10).fill(0);
  for (let d = 1; d <= 9; d++) {
    rem[d] = Math.max(0, 9 - counts[d]);
  }
  return rem;
}

export function shareText(round, label, url) {
  const levelName = round.level === 'leicht' ? 'Leicht'
    : round.level === 'schwer' ? 'Schwer'
    : 'Mittel';
  return `Sudoku ${label}\n${levelName} · ${round.mistakes} Fehler\n${url}`;
}
