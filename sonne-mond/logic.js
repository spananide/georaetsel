import { mulberry32 } from '../georaetsel/game.js';

// Random 6x6 valid grid by randomised backtracking:
// 3 suns (0), 3 moons (1) per row and column, no 3 consecutive identical symbols.
function generateGrid(rng) {
  const grid = new Int8Array(36).fill(-1);
  const rowCount = Array.from({ length: 6 }, () => [0, 0]);
  const colCount = Array.from({ length: 6 }, () => [0, 0]);

  function solve(idx) {
    if (idx === 36) return true;
    const r = Math.floor(idx / 6);
    const c = idx % 6;

    const candidates = rng() < 0.5 ? [0, 1] : [1, 0];
    for (const val of candidates) {
      if (rowCount[r][val] >= 3) continue;
      if (colCount[c][val] >= 3) continue;
      if (c >= 2 && grid[r * 6 + c - 1] === val && grid[r * 6 + c - 2] === val) continue;
      if (r >= 2 && grid[(r - 1) * 6 + c] === val && grid[(r - 2) * 6 + c] === val) continue;

      grid[idx] = val;
      rowCount[r][val]++;
      colCount[c][val]++;

      if (solve(idx + 1)) return true;

      grid[idx] = -1;
      rowCount[r][val]--;
      colCount[c][val]--;
    }
    return false;
  }

  solve(0);
  return Array.from(grid);
}

// Backtracking solver taking givens + links into account, counting up to limit
export function countSolutions(puzzle, limit = 2) {
  const { given, solution, links } = puzzle;
  const fixed = new Int8Array(36).fill(-1);
  for (let i = 0; i < 36; i++) {
    if (given && given[i]) fixed[i] = solution[i];
  }

  const cellLinks = Array.from({ length: 36 }, () => []);
  if (links) {
    for (const l of links) {
      cellLinks[l.a].push(l);
      cellLinks[l.b].push(l);
    }
  }

  let count = 0;
  const grid = new Int8Array(36).fill(-1);
  const rowCount = Array.from({ length: 6 }, () => [0, 0]);
  const colCount = Array.from({ length: 6 }, () => [0, 0]);

  function backtrack(idx) {
    if (idx === 36) {
      count++;
      return;
    }
    const r = Math.floor(idx / 6);
    const c = idx % 6;

    const forced = fixed[idx];
    const vals = forced !== -1 ? [forced] : [0, 1];

    for (const val of vals) {
      if (rowCount[r][val] >= 3) continue;
      if (colCount[c][val] >= 3) continue;
      if (c >= 2 && grid[r * 6 + c - 1] === val && grid[r * 6 + c - 2] === val) continue;
      if (r >= 2 && grid[(r - 1) * 6 + c] === val && grid[(r - 2) * 6 + c] === val) continue;

      let linkOk = true;
      for (const l of cellLinks[idx]) {
        const other = l.a === idx ? l.b : l.a;
        if (other < idx && grid[other] !== -1) {
          if (l.same && grid[other] !== val) { linkOk = false; break; }
          if (!l.same && grid[other] === val) { linkOk = false; break; }
        }
      }
      if (!linkOk) continue;

      grid[idx] = val;
      rowCount[r][val]++;
      colCount[c][val]++;

      backtrack(idx + 1);

      grid[idx] = -1;
      rowCount[r][val]--;
      colCount[c][val]--;

      if (count >= limit) return;
    }
  }

  backtrack(0);
  return count;
}

const puzzleCache = new Map();

// Generate or retrieve puzzle for a seed and mode
export function puzzleFor(seed, mode) {
  const cacheKey = `${seed}|${mode}`;
  if (puzzleCache.has(cacheKey)) {
    return puzzleCache.get(cacheKey);
  }

  const rng = mulberry32(seed);
  const solution = generateGrid(rng);

  // 1. Candidate clues
  const candidateClues = [];
  for (let i = 0; i < 36; i++) {
    candidateClues.push({ type: 'given', index: i });
  }
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const idx = r * 6 + c;
      if (c < 5) {
        const next = r * 6 + c + 1;
        candidateClues.push({ type: 'link', a: idx, b: next, same: solution[idx] === solution[next] });
      }
      if (r < 5) {
        const next = (r + 1) * 6 + c;
        candidateClues.push({ type: 'link', a: idx, b: next, same: solution[idx] === solution[next] });
      }
    }
  }

  // Shuffle candidate clues with rng
  for (let i = candidateClues.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = candidateClues[i];
    candidateClues[i] = candidateClues[j];
    candidateClues[j] = tmp;
  }

  // Start with ALL clues present
  const given = new Array(36).fill(true);
  const linksSet = new Set(candidateClues.filter(c => c.type === 'link'));
  const tempPuzzle = {
    size: 6,
    solution,
    given,
    get links() { return Array.from(linksSet); }
  };

  const removedClues = [];
  for (const clue of candidateClues) {
    if (clue.type === 'given') {
      given[clue.index] = false;
      if (countSolutions(tempPuzzle, 2) === 1) {
        removedClues.push(clue);
      } else {
        given[clue.index] = true;
      }
    } else {
      linksSet.delete(clue);
      if (countSolutions(tempPuzzle, 2) === 1) {
        removedClues.push(clue);
      } else {
        linksSet.add(clue);
      }
    }
  }

  // Count given or linked cells
  function getGivenOrLinkedCount() {
    const cells = new Set();
    for (let i = 0; i < 36; i++) {
      if (given[i]) cells.add(i);
    }
    for (const l of linksSet) {
      cells.add(l.a);
      cells.add(l.b);
    }
    return cells.size;
  }

  // Add back random removed clues until at least 8 cells are given or linked
  for (let i = removedClues.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = removedClues[i];
    removedClues[i] = removedClues[j];
    removedClues[j] = tmp;
  }

  while (getGivenOrLinkedCount() < 8 && removedClues.length > 0) {
    const clue = removedClues.pop();
    if (clue.type === 'given') {
      given[clue.index] = true;
    } else {
      linksSet.add(clue);
    }
  }

  const result = {
    size: 6,
    solution,
    given,
    links: Array.from(linksSet),
  };
  puzzleCache.set(cacheKey, result);
  return result;
}

// Create a new round object
export function newRound(seed, mode) {
  const puzzle = puzzleFor(seed, mode);
  const cells = new Array(36);
  for (let i = 0; i < 36; i++) {
    cells[i] = puzzle.given[i] ? puzzle.solution[i] : -1;
  }
  return {
    seed,
    mode,
    size: 6,
    cells,
    placed: 0,
    state: 'playing',
    ms: 0,
  };
}

// Conflicts detection
export function conflicts(round) {
  const result = new Set();
  const { cells } = round;
  const puzzle = puzzleFor(round.seed, round.mode);

  // Check rows
  for (let r = 0; r < 6; r++) {
    // Consecutive 3
    for (let c = 0; c < 4; c++) {
      const idx = r * 6 + c;
      const v = cells[idx];
      if (v !== -1 && cells[idx + 1] === v && cells[idx + 2] === v) {
        result.add(idx);
        result.add(idx + 1);
        result.add(idx + 2);
      }
    }
    // More than 3 of one symbol
    let suns = 0, moons = 0;
    const sunIndices = [], moonIndices = [];
    for (let c = 0; c < 6; c++) {
      const idx = r * 6 + c;
      if (cells[idx] === 0) { suns++; sunIndices.push(idx); }
      else if (cells[idx] === 1) { moons++; moonIndices.push(idx); }
    }
    if (suns > 3) for (const idx of sunIndices) result.add(idx);
    if (moons > 3) for (const idx of moonIndices) result.add(idx);
  }

  // Check columns
  for (let c = 0; c < 6; c++) {
    // Consecutive 3
    for (let r = 0; r < 4; r++) {
      const idx = r * 6 + c;
      const v = cells[idx];
      if (v !== -1 && cells[(r + 1) * 6 + c] === v && cells[(r + 2) * 6 + c] === v) {
        result.add(idx);
        result.add((r + 1) * 6 + c);
        result.add((r + 2) * 6 + c);
      }
    }
    // More than 3 of one symbol
    let suns = 0, moons = 0;
    const sunIndices = [], moonIndices = [];
    for (let r = 0; r < 6; r++) {
      const idx = r * 6 + c;
      if (cells[idx] === 0) { suns++; sunIndices.push(idx); }
      else if (cells[idx] === 1) { moons++; moonIndices.push(idx); }
    }
    if (suns > 3) for (const idx of sunIndices) result.add(idx);
    if (moons > 3) for (const idx of moonIndices) result.add(idx);
  }

  // Check links
  for (const l of puzzle.links) {
    const va = cells[l.a];
    const vb = cells[l.b];
    if (va !== -1 && vb !== -1) {
      if (l.same && va !== vb) {
        result.add(l.a);
        result.add(l.b);
      } else if (!l.same && va === vb) {
        result.add(l.a);
        result.add(l.b);
      }
    }
  }

  return result;
}

// Toggle cell mark: -1 -> 0 -> 1 -> -1.
// Increments placed when transitioning to 0 or 1.
// Ignored on given cells or when round is not playing.
export function toggle(round, index) {
  if (round.state !== 'playing') return;
  if (index < 0 || index >= round.cells.length) return;

  const puzzle = puzzleFor(round.seed, round.mode);
  if (puzzle.given[index]) return;

  const current = round.cells[index];
  let next;
  if (current === -1) next = 0;
  else if (current === 0) next = 1;
  else next = -1;

  round.cells[index] = next;

  if (next === 0 || next === 1) {
    round.placed = (round.placed || 0) + 1;
  }

  // Win condition: grid is full (no -1) and conflicts is empty
  const isFull = round.cells.every(v => v === 0 || v === 1);
  if (isFull) {
    const conf = conflicts(round);
    if (conf.size === 0) {
      round.state = 'won';
    }
  }
}

// Share text formatting
export function shareText(round, label, url) {
  return `Sonne & Mond ${label}\n6×6 · ${round.placed} Züge\n${url}`;
}
