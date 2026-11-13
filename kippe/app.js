import { dailySeed } from '../georaetsel/game.js';
import {
  readStorage,
  writeStorage,
  showToast,
  shareText as copyOrShare,
  initPrivacy,
  startClock,
  withTime,
  reportRound,
} from '../common.js';
import {
  COLS,
  MAX_H,
  blockAt,
  limit,
  torque,
  newRound,
  peek,
  canDrop,
  drop,
  isOver,
  tilt,
  shareText as formatShareText,
} from './logic.js';

let mode = 'daily';
let dailyRound = null;
let practiceRound = null;
let currentDateSeed = dailySeed(new Date());
let isAnimating = false;
let focusedCol = 4;

function getActiveRound() {
  return mode === 'daily' ? dailyRound : practiceRound;
}

function saveIfDaily() {
  if (mode === 'daily' && dailyRound) {
    writeStorage(`kippe.daily.${dailyRound.seed}`, dailyRound);
  }
}

function loadDaily() {
  currentDateSeed = dailySeed(new Date());
  const saved = readStorage(`kippe.daily.${currentDateSeed}`);
  if (saved && saved.seed === currentDateSeed) {
    dailyRound = saved;
  } else {
    dailyRound = newRound(currentDateSeed);
    saveIfDaily();
  }
}

function startPractice() {
  const randSeed = Math.floor(Math.random() * 2147483647);
  practiceRound = newRound(randSeed);
}

function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const nextTheme = current === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', nextTheme);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', nextTheme === 'dark' ? '#1d1b18' : '#f4efe3');
  try {
    localStorage.setItem('georaetsel.theme', nextTheme);
  } catch (e) {}
}

function setMode(newMode) {
  mode = newMode;
  const tabDaily = document.getElementById('tab-daily');
  const tabPractice = document.getElementById('tab-practice');

  tabDaily.setAttribute('aria-selected', mode === 'daily');
  tabPractice.setAttribute('aria-selected', mode === 'practice');

  if (mode === 'daily') {
    tabDaily.setAttribute('aria-current', 'page');
    tabPractice.removeAttribute('aria-current');
    loadDaily();
  } else {
    tabPractice.setAttribute('aria-current', 'page');
    tabDaily.removeAttribute('aria-current');
    if (!practiceRound || isOver(practiceRound)) {
      startPractice();
    }
  }

  render();
}

function createTileEl(block, isSmall = false) {
  const el = document.createElement('div');
  el.className = `tile-block color-${block.c}${isSmall ? ' small' : ''}`;

  const marker = document.createElement('span');
  marker.className = 'marker';
  marker.setAttribute('aria-hidden', 'true');

  const weight = document.createElement('span');
  weight.className = 'weight';
  weight.textContent = block.w;

  el.appendChild(marker);
  el.appendChild(weight);
  return el;
}

function findClearedCells(prevRound, col, nextRound) {
  const newBlock = blockAt(prevRound.seed, prevRound.placed);
  const cleared = [];

  for (let x = 0; x < COLS; x++) {
    const before = prevRound.cols[x].map(b => ({ ...b }));
    if (x === col) {
      before.push(newBlock);
    }
    const after = nextRound.cols[x];

    let afterIdx = 0;
    for (let y = 0; y < before.length; y++) {
      if (afterIdx < after.length && after[afterIdx].w === before[y].w && after[afterIdx].c === before[y].c) {
        afterIdx++;
      } else {
        cleared.push({ x, y, block: before[y] });
      }
    }
  }
  return cleared;
}

function showFloatingFeedback(text) {
  const container = document.getElementById('floating-feedback');
  if (!container) return;
  const badge = document.createElement('div');
  badge.className = 'float-badge';
  badge.textContent = text;
  container.innerHTML = '';
  container.appendChild(badge);
  setTimeout(() => {
    if (container.contains(badge)) badge.remove();
  }, 900);
}

function handleDrop(col) {
  if (isAnimating) return;
  const round = getActiveRound();
  if (!round || !canDrop(round, col)) return;

  const prevRound = round;
  const nextRound = drop(round, col);
  const scoreDelta = nextRound.score - prevRound.score;
  const hasClear = scoreDelta > 1;

  if (mode === 'daily') {
    dailyRound = nextRound;
    saveIfDaily();
  } else {
    practiceRound = nextRound;
  }

  if (mode === 'practice' && isOver(nextRound)) {
    const prevBest = readStorage('kippe.best', 0);
    if (nextRound.score > prevBest) {
      writeStorage('kippe.best', nextRound.score);
    }
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (hasClear && !reducedMotion) {
    isAnimating = true;
    renderClearAnimation(prevRound, col, nextRound, scoreDelta, () => {
      isAnimating = false;
      render();
    });
  } else {
    render(col);
  }
}

function renderClearAnimation(prevRound, droppedCol, nextRound, scoreDelta, onComplete) {
  const grid = document.getElementById('board-grid');
  const newBlock = blockAt(prevRound.seed, prevRound.placed);
  const cleared = findClearedCells(prevRound, droppedCol, nextRound);

  for (let x = 0; x < COLS; x++) {
    const btn = grid.children[x];
    if (!btn) continue;

    const before = prevRound.cols[x].map(b => ({ ...b }));
    if (x === droppedCol) {
      before.push(newBlock);
    }

    const cellsContainer = btn.querySelector('.col-cells');
    if (cellsContainer) {
      const cellEls = cellsContainer.children;
      for (let y = 0; y < MAX_H; y++) {
        const cellEl = cellEls[y];
        if (!cellEl) continue;
        cellEl.innerHTML = '';

        if (y < before.length) {
          const block = before[y];
          const tile = createTileEl(block);
          if (x === droppedCol && y === before.length - 1) {
            tile.classList.add('block-drop');
          }
          const isCleared = cleared.some(c => c.x === x && c.y === y);
          if (isCleared) {
            tile.classList.add('block-clearing');
          }
          cellEl.appendChild(tile);
        }
      }
    }
  }

  let feedbackText = `+${scoreDelta}`;
  if (nextRound.bestCombo > prevRound.bestCombo && nextRound.bestCombo >= 2) {
    feedbackText = `Kette ×${nextRound.bestCombo} (+${scoreDelta})`;
  }
  showFloatingFeedback(feedbackText);

  setTimeout(onComplete, 200);
}

function renderStats(round) {
  const statPlaced = document.getElementById('stat-placed');
  const statScore = document.getElementById('stat-score');
  const statRecordItem = document.getElementById('stat-record-item');
  const statRecord = document.getElementById('stat-record');

  statPlaced.textContent = round.placed;
  statScore.textContent = round.score;

  if (mode === 'practice') {
    statRecordItem.hidden = false;
    statRecord.textContent = readStorage('kippe.best', 0);
  } else {
    statRecordItem.hidden = true;
  }
}

function renderGauge(round) {
  const t = torque(round);
  const lim = limit(round);
  const absT = Math.abs(t);
  const ratio = lim > 0 ? absT / lim : 0;
  const percent = Math.min(100, Math.round(ratio * 100));

  const gaugeText = document.getElementById('gauge-text');
  const gaugeFill = document.getElementById('gauge-fill');
  const gaugeTrack = document.getElementById('gauge-track');
  const gaugeSr = document.getElementById('gauge-sr');

  gaugeText.textContent = `${absT} / ${lim}`;
  gaugeFill.style.width = `${percent}%`;
  gaugeTrack.setAttribute('aria-valuenow', absT);
  gaugeTrack.setAttribute('aria-valuemax', lim);
  gaugeSr.textContent = `Neigung ${absT} von ${lim}`;

  if (ratio > 0.75) {
    gaugeFill.classList.add('is-warn');
  } else {
    gaugeFill.classList.remove('is-warn');
  }
}

function renderQueue(round) {
  const tileCurrent = document.getElementById('tile-current');
  const tileNext1 = document.getElementById('tile-next-1');
  const tileNext2 = document.getElementById('tile-next-2');

  tileCurrent.innerHTML = '';
  tileNext1.innerHTML = '';
  tileNext2.innerHTML = '';

  const next3 = peek(round, 3);
  tileCurrent.appendChild(createTileEl(next3[0]));
  tileNext1.appendChild(createTileEl(next3[1], true));
  tileNext2.appendChild(createTileEl(next3[2], true));
}

function renderTilt(round) {
  const assembly = document.getElementById('board-assembly');
  const over = isOver(round);
  const t = tilt(round);
  const deg = t * 4;

  assembly.style.transform = `rotate(${deg}deg) scale(0.93)`;
  assembly.style.setProperty('--tilt-angle', deg);

  if (over) {
    assembly.classList.add('is-lost');
  } else {
    assembly.classList.remove('is-lost');
  }
}

function renderBoard(round, droppedCol = -1) {
  const grid = document.getElementById('board-grid');
  const currentBlock = peek(round, 1)[0];
  const over = isOver(round);

  for (let x = 0; x < COLS; x++) {
    const btn = grid.children[x];
    if (!btn) continue;

    const count = round.cols[x].length;
    const isFull = count >= MAX_H;
    const valid = canDrop(round, x);

    btn.disabled = over || !valid;
    btn.setAttribute('aria-label', `Spalte ${x + 1}, ${count} ${count === 1 ? 'Block' : 'Blöcke'}${isFull ? ' (voll)' : ''}`);

    const ghost = btn.querySelector('.col-ghost');
    if (ghost) {
      ghost.innerHTML = '';
      if (!over && valid) {
        ghost.appendChild(createTileEl(currentBlock));
      }
    }

    const cellsContainer = btn.querySelector('.col-cells');
    if (cellsContainer) {
      const cellEls = cellsContainer.children;
      for (let y = 0; y < MAX_H; y++) {
        const cellEl = cellEls[y];
        if (!cellEl) continue;
        cellEl.innerHTML = '';

        if (y < count) {
          const block = round.cols[x][y];
          const tile = createTileEl(block);
          if (x === droppedCol && y === count - 1) {
            tile.classList.add('block-drop');
          }
          cellEl.appendChild(tile);
        }
      }
    }
  }
}

function renderEndView(round) {
  const endView = document.getElementById('end-view');
  const statsLine = document.getElementById('end-stats-line');
  const comboLine = document.getElementById('end-combo-line');
  const recordLine = document.getElementById('end-record-line');
  const btnRestart = document.getElementById('btn-restart');
  const btnEndPractice = document.getElementById('btn-end-practice');

  statsLine.textContent = `${round.placed} Blöcke · ${round.score} Punkte`;
  comboLine.textContent = `Beste Kette: ${round.bestCombo}x`;

  if (mode === 'practice') {
    const best = readStorage('kippe.best', 0);
    if (round.score >= best && round.score > 0) {
      recordLine.textContent = 'Neuer Rekord!';
      recordLine.className = 'end-record-line is-new-record';
    } else {
      recordLine.textContent = `Rekord: ${best}`;
      recordLine.className = 'end-record-line';
    }
    btnRestart.hidden = false;
    btnEndPractice.hidden = true;
  } else {
    recordLine.textContent = '';
    recordLine.className = 'end-record-line';
    btnRestart.hidden = true;
    btnEndPractice.hidden = false;
  }

  endView.hidden = false;
}

function render(droppedCol = -1) {
  const round = getActiveRound();
  reportRound('kippe', round, mode);
  if (!round) return;

  const endView = document.getElementById('end-view');
  const over = isOver(round);

  renderStats(round);
  renderGauge(round);
  renderQueue(round);
  renderBoard(round, droppedCol);
  renderTilt(round);

  if (over) {
    renderEndView(round);
  } else {
    endView.hidden = true;
  }
}

function focusColumn(colIndex) {
  const btn = document.querySelector(`.col-btn[data-col="${colIndex}"]`);
  if (btn && !btn.disabled) {
    btn.focus();
  } else {
    const first = document.querySelector('.col-btn:not(:disabled)');
    if (first) first.focus();
  }
}

function doShare() {
  const round = getActiveRound();
  if (!round) return;

  let label;
  if (mode === 'daily') {
    const s = String(round.seed);
    if (s.length === 8) {
      label = `${s.slice(6, 8)}.${s.slice(4, 6)}.${s.slice(0, 4)}`;
    } else {
      const d = new Date();
      label = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
    }
  } else {
    label = 'Unbegrenzt';
  }

  const url = 'https://geo.spanani.de/kippe/';
  const text = formatShareText(round, label, url);
  copyOrShare(withTime(text, round.ms));
}

function checkMidnight() {
  const newSeed = dailySeed(new Date());
  if (newSeed !== currentDateSeed) {
    currentDateSeed = newSeed;
    if (mode === 'daily') {
      loadDaily();
      render();
    }
  }
}

function initBoardGrid() {
  const grid = document.getElementById('board-grid');
  grid.innerHTML = '';

  for (let x = 0; x < COLS; x++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'col-btn';
    btn.setAttribute('data-col', x);

    const ghost = document.createElement('div');
    ghost.className = 'col-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    btn.appendChild(ghost);

    const cellsContainer = document.createElement('div');
    cellsContainer.className = 'col-cells';

    for (let y = 0; y < MAX_H; y++) {
      const cell = document.createElement('div');
      cell.className = 'board-cell';
      cellsContainer.appendChild(cell);
    }

    btn.appendChild(cellsContainer);

    btn.addEventListener('click', () => {
      focusedCol = x;
      handleDrop(x);
    });

    btn.addEventListener('focus', () => {
      focusedCol = x;
    });

    grid.appendChild(btn);
  }
}

function init() {
  initPrivacy();
  initBoardGrid();

  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  document.getElementById('btn-share').addEventListener('click', doShare);
  document.getElementById('tab-daily').addEventListener('click', () => setMode('daily'));
  document.getElementById('tab-practice').addEventListener('click', () => setMode('practice'));

  document.getElementById('btn-restart').addEventListener('click', () => {
    startPractice();
    render();
    focusColumn(focusedCol);
  });

  document.getElementById('btn-end-practice').addEventListener('click', () => {
    setMode('practice');
    focusColumn(focusedCol);
  });

  document.addEventListener('keydown', e => {
    const round = getActiveRound();
    if (!round || isOver(round)) return;

    if (e.key >= '1' && e.key <= '9') {
      const col = parseInt(e.key, 10) - 1;
      if (col >= 0 && col < COLS) {
        e.preventDefault();
        focusedCol = col;
        focusColumn(col);
        handleDrop(col);
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusedCol = Math.max(0, focusedCol - 1);
      focusColumn(focusedCol);
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusedCol = Math.min(COLS - 1, focusedCol + 1);
      focusColumn(focusedCol);
      return;
    }
  });

  setInterval(checkMidnight, 30000);

  setMode('daily');

  startClock({
    getRound: getActiveRound,
    isOver: r => !r || isOver(r),
    save: saveIfDaily,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
