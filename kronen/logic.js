import { mulberry32 } from '../georaetsel/game.js';

// Random valid crown placement: one per row, one per column,
// no two crowns in adjacent rows with |col[r] - col[r-1]| <= 1.
function generateCrowns(size, rng) {
  const solution = new Array(size).fill(-1);
  const usedCols = new Array(size).fill(false);

  function backtrack(r) {
    if (r === size) return true;
    const cols = [];
    for (let c = 0; c < size; c++) {
      if (!usedCols[c]) {
        if (r === 0 || Math.abs(c - solution[r - 1]) > 1) {
          cols.push(c);
        }
      }
    }
    // Shuffle columns
    for (let i = cols.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = cols[i];
      cols[i] = cols[j];
      cols[j] = tmp;
    }
    for (const c of cols) {
      solution[r] = c;
      usedCols[c] = true;
      if (backtrack(r + 1)) return true;
      usedCols[c] = false;
      solution[r] = -1;
    }
    return false;
  }

  backtrack(0);
  return solution;
}

// Grow N contiguous regions from the crown cells:
// start with crown cells as region seeds, repeatedly pick an unassigned
// boundary cell and assign it to an adjacent region.
function growRegions(size, solution, rng) {
  const total = size * size;
  const regions = new Array(total).fill(-1);
  for (let r = 0; r < size; r++) {
    regions[r * size + solution[r]] = r;
  }
  let unassigned = total - size;

  while (unassigned > 0) {
    const borderCells = [];
    for (let idx = 0; idx < total; idx++) {
      if (regions[idx] !== -1) continue;
      const r = Math.floor(idx / size);
      const c = idx % size;
      const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      const adjRegs = [];
      for (const [dr, dc] of deltas) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          const reg = regions[nr * size + nc];
          if (reg !== -1 && !adjRegs.includes(reg)) {
            adjRegs.push(reg);
          }
        }
      }
      if (adjRegs.length > 0) {
        borderCells.push({ idx, adjRegs });
      }
    }
    if (borderCells.length === 0) break;
    const chosen = borderCells[Math.floor(rng() * borderCells.length)];
    const chosenReg = chosen.adjRegs[Math.floor(rng() * chosen.adjRegs.length)];
    regions[chosen.idx] = chosenReg;
    unassigned--;
  }
  return regions;
}

// Backtracking solver to count solutions up to limit:
// row by row, tracking used columns, used regions, and prev row column.
export function countSolutions(size, regions, limit = 2) {
  let count = 0;
  function solveRow(r, usedCols, usedRegions, prevCol) {
    if (r === size) {
      count++;
      return;
    }
    const rowOffset = r * size;
    for (let c = 0; c < size; c++) {
      if ((usedCols & (1 << c)) !== 0) continue;
      if (r > 0 && Math.abs(c - prevCol) <= 1) continue;
      const reg = regions[rowOffset + c];
      if ((usedRegions & (1 << reg)) !== 0) continue;

      solveRow(r + 1, usedCols | (1 << c), usedRegions | (1 << reg), c);
      if (count >= limit) return;
    }
  }
  solveRow(0, 0, 0, -2);
  return count;
}

// Flood fill check for region contiguity
function isContiguous(size, regions, regId) {
  let start = -1;
  let count = 0;
  const total = size * size;
  for (let i = 0; i < total; i++) {
    if (regions[i] === regId) {
      if (start === -1) start = i;
      count++;
    }
  }
  if (count === 0) return false;
  let visitedCount = 0;
  const visited = new Uint8Array(total);
  const queue = [start];
  visited[start] = 1;
  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    visitedCount++;
    const r = Math.floor(curr / size);
    const c = curr % size;
    if (r > 0) {
      const idx = curr - size;
      if (regions[idx] === regId && !visited[idx]) { visited[idx] = 1; queue.push(idx); }
    }
    if (r < size - 1) {
      const idx = curr + size;
      if (regions[idx] === regId && !visited[idx]) { visited[idx] = 1; queue.push(idx); }
    }
    if (c > 0) {
      const idx = curr - 1;
      if (regions[idx] === regId && !visited[idx]) { visited[idx] = 1; queue.push(idx); }
    }
    if (c < size - 1) {
      const idx = curr + 1;
      if (regions[idx] === regId && !visited[idx]) { visited[idx] = 1; queue.push(idx); }
    }
  }
  return visitedCount === count;
}

// Find an alternate solution differing from sol1
function findAlternateSolution(size, regions, sol1) {
  let alt = null;
  function solveRow(r, usedCols, usedRegions, prevCol, current) {
    if (r === size) {
      if (!current.every((v, i) => v === sol1[i])) {
        alt = [...current];
      }
      return;
    }
    const rowOffset = r * size;
    for (let c = 0; c < size; c++) {
      if ((usedCols & (1 << c)) !== 0) continue;
      if (r > 0 && Math.abs(c - prevCol) <= 1) continue;
      const reg = regions[rowOffset + c];
      if ((usedRegions & (1 << reg)) !== 0) continue;

      current.push(c);
      solveRow(r + 1, usedCols | (1 << c), usedRegions | (1 << reg), c, current);
      current.pop();
      if (alt !== null) return;
    }
  }
  solveRow(0, 0, 0, -2, []);
  return alt;
}

// Iterative pruning of alternate solutions to guarantee a unique puzzle fast
function pruneToUnique(size, regions, sol1, maxSteps = 20) {
  for (let step = 0; step < maxSteps; step++) {
    const cnt = countSolutions(size, regions, 2);
    if (cnt === 1) return true;
    const sol2 = findAlternateSolution(size, regions, sol1);
    if (!sol2) return cnt === 1;

    const candidates = [];
    for (let r = 0; r < size; r++) {
      if (sol2[r] !== sol1[r]) {
        candidates.push({ r, c: sol2[r] });
      }
    }
    let improved = false;
    for (const { r, c } of candidates) {
      const idx = r * size + c;
      const oldReg = regions[idx];
      const deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of deltas) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          const newReg = regions[nr * size + nc];
          if (newReg !== oldReg && sol1[r] !== c) {
            regions[idx] = newReg;
            if (isContiguous(size, regions, oldReg) && isContiguous(size, regions, newReg)) {
              // Ensure sol1 still has exactly 1 crown per region
              const regCrowns = new Array(size).fill(0);
              for (let row = 0; row < size; row++) {
                regCrowns[regions[row * size + sol1[row]]]++;
              }
              if (regCrowns.every(x => x === 1)) {
                improved = true;
                break;
              }
            }
            regions[idx] = oldReg;
          }
        }
      }
      if (improved) break;
    }
    if (!improved) break;
  }
  return countSolutions(size, regions, 2) === 1;
}

// Cache for memoising puzzleFor
const puzzleCache = new Map();

export function puzzleFor(seed, mode) {
  const cacheKey = `${seed}|${mode}`;
  if (puzzleCache.has(cacheKey)) {
    return puzzleCache.get(cacheKey);
  }

  const rng = mulberry32(seed);
  const size = mode === 'daily' ? 8 : 6 + (Math.abs(seed) % 4);

  let bestRegions = null;
  let bestSolution = null;
  let attempts = 0;
  const maxAttempts = 150;

  while (attempts < maxAttempts) {
    attempts++;
    const solution = generateCrowns(size, rng);
    for (let g = 0; g < 4; g++) {
      const regions = growRegions(size, solution, rng);
      if (regions.includes(-1)) continue;

      if (!bestRegions) {
        bestRegions = regions;
        bestSolution = solution;
      }

      if (countSolutions(size, regions, 2) === 1 || pruneToUnique(size, regions, solution)) {
        const result = { size, regions, solution };
        puzzleCache.set(cacheKey, result);
        return result;
      }
    }
  }

  // Fallback to best valid regions
  const result = { size, regions: bestRegions, solution: bestSolution };
  puzzleCache.set(cacheKey, result);
  return result;
}

// Create a new round object
export function newRound(seed, mode) {
  const puzzle = puzzleFor(seed, mode);
  return {
    seed,
    mode,
    size: puzzle.size,
    cells: new Array(puzzle.size * puzzle.size).fill(0),
    placed: 0,
    state: 'playing',
    ms: 0,
  };
}

// Conflicts: returns Set of all cell indices breaking any rule
export function conflicts(round) {
  const result = new Set();
  const { size, cells } = round;
  const puzzle = puzzleFor(round.seed, round.mode);
  const regions = puzzle.regions;

  const crownIndices = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === 2) crownIndices.push(i);
  }

  // Check row conflicts
  for (let r = 0; r < size; r++) {
    const rowCrowns = crownIndices.filter(i => Math.floor(i / size) === r);
    if (rowCrowns.length > 1) {
      for (const i of rowCrowns) result.add(i);
    }
  }

  // Check column conflicts
  for (let c = 0; c < size; c++) {
    const colCrowns = crownIndices.filter(i => (i % size) === c);
    if (colCrowns.length > 1) {
      for (const i of colCrowns) result.add(i);
    }
  }

  // Check region conflicts
  for (let reg = 0; reg < size; reg++) {
    const regCrowns = crownIndices.filter(i => regions[i] === reg);
    if (regCrowns.length > 1) {
      for (const i of regCrowns) result.add(i);
    }
  }

  // Check touching crowns (adjacent horizontally, vertically, or diagonally)
  for (let i = 0; i < crownIndices.length; i++) {
    const idx1 = crownIndices[i];
    const r1 = Math.floor(idx1 / size);
    const c1 = idx1 % size;
    for (let j = i + 1; j < crownIndices.length; j++) {
      const idx2 = crownIndices[j];
      const r2 = Math.floor(idx2 / size);
      const c2 = idx2 % size;
      if (Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1) {
        result.add(idx1);
        result.add(idx2);
      }
    }
  }

  return result;
}

// Toggle cell mark: 0 -> 1 -> 2 -> 0.
// Increments placed when set to 2.
export function toggle(round, index) {
  if (round.state !== 'playing') return;
  if (index < 0 || index >= round.cells.length) return;

  const current = round.cells[index];
  const next = (current + 1) % 3;
  round.cells[index] = next;

  if (next === 2) {
    round.placed = (round.placed || 0) + 1;
  }

  // Check win condition: exactly size crowns and no conflicts
  const crownCount = round.cells.filter(c => c === 2).length;
  if (crownCount === round.size) {
    const conf = conflicts(round);
    if (conf.size === 0) {
      round.state = 'won';
    }
  }
}

// Share text formatting
export function shareText(round, label, url) {
  return `Kronen ${label}\n${round.size}×${round.size} · ${round.placed} Züge\n${url}`;
}
