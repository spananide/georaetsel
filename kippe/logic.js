import { mulberry32 } from '../georaetsel/game.js';

export const COLS = 9;
export const MAX_H = 6;
export const COLORS = 4;
export const MAX_W = 5;

// Deterministic, stateless block generator for given seed and step k
export function blockAt(seed, k) {
  const rand = mulberry32((seed * 1000003 + k * 7919) >>> 0);
  const r1 = rand(), r2 = rand();
  const wmax = Math.min(MAX_W, 2 + Math.floor(k / 10));
  return { w: 1 + Math.floor(r1 * wmax), c: Math.floor(r2 * COLORS) };
}

// Allowed torque limit decreases as placed block count increases
export function limit(round) {
  const placed = typeof round === 'number' ? round : round?.placed ?? 0;
  return Math.max(6, 14 - Math.floor(placed / 12));
}

// Signed torque of current board (columns 0..8 have arms -4..+4)
export function torque(round) {
  let t = 0;
  for (let i = 0; i < COLS; i++) {
    const arm = i - 4;
    const col = round.cols[i];
    for (let j = 0; j < col.length; j++) {
      t += col[j].w * arm;
    }
  }
  return t;
}

// Initialize a new round
export function newRound(seed) {
  return {
    seed,
    cols: Array.from({ length: COLS }, () => []),
    placed: 0,
    score: 0,
    bestCombo: 0,
    history: [],
    state: 'playing',
  };
}

// Preview next n blocks
export function peek(round, n = 3) {
  const blocks = [];
  for (let i = 0; i < n; i++) {
    blocks.push(blockAt(round.seed, round.placed + i));
  }
  return blocks;
}

// Whether a block can be dropped into the given column
export function canDrop(round, col) {
  if (round.state !== 'playing') return false;
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return false;
  return round.cols[col].length < MAX_H;
}

// Find 4-connected groups of size >= 3 with equal colour
function findClearGroups(cols) {
  const visited = new Set();
  const groups = [];

  for (let x = 0; x < COLS; x++) {
    for (let y = 0; y < cols[x].length; y++) {
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      visited.add(key);

      const color = cols[x][y].c;
      const group = [{ x, y }];
      const queue = [{ x, y }];

      while (queue.length > 0) {
        const curr = queue.shift();
        const neighbors = [
          { x: curr.x + 1, y: curr.y },
          { x: curr.x - 1, y: curr.y },
          { x: curr.x, y: curr.y + 1 },
          { x: curr.x, y: curr.y - 1 },
        ];

        for (const n of neighbors) {
          if (n.x >= 0 && n.x < COLS && n.y >= 0 && n.y < cols[n.x].length) {
            const nKey = `${n.x},${n.y}`;
            if (!visited.has(nKey) && cols[n.x][n.y].c === color) {
              visited.add(nKey);
              group.push(n);
              queue.push(n);
            }
          }
        }
      }

      if (group.length >= 3) {
        groups.push(group);
      }
    }
  }

  return groups;
}

// Drop next block into col and resolve clears, gravity, and game over
export function drop(round, col) {
  if (!canDrop(round, col)) {
    return round;
  }

  const next = {
    seed: round.seed,
    cols: round.cols.map(c => c.map(b => ({ ...b }))),
    placed: round.placed,
    score: round.score,
    bestCombo: round.bestCombo,
    history: [...round.history],
    state: round.state,
  };

  const block = blockAt(next.seed, next.placed);
  next.cols[col].push(block);
  next.placed += 1;
  next.score += 1;
  next.history.push(col);

  let step = 1;
  while (true) {
    const groups = findClearGroups(next.cols);
    if (groups.length === 0) break;

    const toRemove = new Set();
    let stepWeight = 0;

    for (const group of groups) {
      for (const cell of group) {
        const key = `${cell.x},${cell.y}`;
        if (!toRemove.has(key)) {
          toRemove.add(key);
          stepWeight += next.cols[cell.x][cell.y].w;
        }
      }
    }

    next.score += step * stepWeight;
    next.bestCombo = Math.max(next.bestCombo, step);

    for (let x = 0; x < COLS; x++) {
      next.cols[x] = next.cols[x].filter((_, y) => !toRemove.has(`${x},${y}`));
    }

    step++;
  }

  if (Math.abs(torque(next)) > limit(next)) {
    next.state = 'lost';
  } else if (next.cols.every(c => c.length >= MAX_H)) {
    next.state = 'lost';
  } else {
    next.state = 'playing';
  }

  return next;
}

// Whether the round is over
export function isOver(round) {
  return round.state === 'lost';
}

// Torque / limit ratio clamped to [-1.2, 1.2]
export function tilt(round) {
  const ratio = torque(round) / limit(round);
  return Math.max(-1.2, Math.min(1.2, ratio));
}

// Generate shareable result text
export function shareText(round, label, url) {
  return [
    `Kippe ${label}`,
    `${round.placed} Blöcke · ${round.score} Punkte`,
    `Beste Kette: ${round.bestCombo}x`,
    '',
    url,
  ].join('\n');
}
