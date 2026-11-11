import { dailySeed } from '../georaetsel/game.js';
import {
  readStorage,
  writeStorage,
  shareText as copyOrShare,
  initPrivacy,
  startClock,
  withTime,
  reportRound,
} from '../common.js';
import {
  newRound,
  puzzleFor,
  toggle,
  conflicts,
  shareText as formatShareText,
} from './logic.js';

let mode = 'daily';
let dailyRound = null;
let practiceRound = null;
let currentDateSeed = dailySeed(new Date());
let focusedIndex = 0;

const CROWN_SVG = '<svg class="crown-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h14v2H5v-2zm14-13l-3.5 6-3.5-6-3.5 6L5 6l2 11h10l2-11z"/></svg>';
const CROSS_SVG = '<svg class="cross-icon" viewBox="0 0 24 24" aria-hidden="true"><line x1="7" y1="7" x2="17" y2="17"/><line x1="17" y1="7" x2="7" y2="17"/></svg>';

function getActiveRound() {
  return mode === 'daily' ? dailyRound : practiceRound;
}

function saveIfDaily() {
  if (mode === 'daily' && dailyRound) {
    writeStorage(`kronen.daily.${dailyRound.seed}`, dailyRound);
  }
}

function loadDaily() {
  currentDateSeed = dailySeed(new Date());
  const saved = readStorage(`kronen.daily.${currentDateSeed}`);
  if (saved && saved.seed === currentDateSeed) {
    dailyRound = saved;
  } else {
    dailyRound = newRound(currentDateSeed, 'daily');
    saveIfDaily();
  }
}

function startPractice() {
  const randSeed = Math.floor(Math.random() * 2147483647);
  practiceRound = newRound(randSeed, 'practice');
  focusedIndex = 0;
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
  focusedIndex = 0;
  const tabDaily = document.getElementById('tab-daily');
  const tabPractice = document.getElementById('tab-practice');
  const btnPracticeNew = document.getElementById('btn-practice-new');

  tabDaily.setAttribute('aria-selected', mode === 'daily');
  tabPractice.setAttribute('aria-selected', mode === 'practice');

  if (mode === 'daily') {
    tabDaily.setAttribute('aria-current', 'page');
    tabPractice.removeAttribute('aria-current');
    btnPracticeNew.hidden = true;
    loadDaily();
  } else {
    tabPractice.setAttribute('aria-current', 'page');
    tabDaily.removeAttribute('aria-current');
    btnPracticeNew.hidden = false;
    if (!practiceRound || practiceRound.state === 'won') {
      startPractice();
    }
  }

  render();
}

function handleCellClick(index) {
  const round = getActiveRound();
  if (!round || round.state !== 'playing') return;

  toggle(round, index);
  saveIfDaily();
  render();

  const nextBtn = document.querySelector(`.cell[data-index="${index}"]`);
  if (nextBtn) nextBtn.focus();
}

function handleRestart() {
  const round = getActiveRound();
  if (!round) return;
  round.cells.fill(0);
  round.state = 'playing';
  saveIfDaily();
  render();
}

function doShare() {
  const round = getActiveRound();
  if (!round) return;

  const label = mode === 'daily'
    ? new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
    : 'Übung';
  const url = `${window.location.origin}${window.location.pathname}`;
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

function render() {
  const round = getActiveRound();
  reportRound('kronen', round, mode);
  if (!round) return;

  const puzzle = puzzleFor(round.seed, round.mode);
  const size = puzzle.size;
  const boardEl = document.getElementById('board');
  boardEl.style.setProperty('--grid-size', size);

  const confSet = conflicts(round);

  // Render board cells
  boardEl.innerHTML = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      const reg = puzzle.regions[idx];
      const mark = round.cells[idx]; // 0 empty, 1 cross, 2 crown

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cell';
      btn.setAttribute('role', 'gridcell');
      btn.dataset.index = idx;
      btn.dataset.row = r;
      btn.dataset.col = c;
      btn.dataset.region = reg;
      btn.dataset.mark = mark;

      // Boundary classes
      if (r === 0 || puzzle.regions[(r - 1) * size + c] !== reg) btn.classList.add('b-top');
      if (r === size - 1 || puzzle.regions[(r + 1) * size + c] !== reg) btn.classList.add('b-bottom');
      if (c === 0 || puzzle.regions[r * size + (c - 1)] !== reg) btn.classList.add('b-left');
      if (c === size - 1 || puzzle.regions[r * size + (c + 1)] !== reg) btn.classList.add('b-right');

      if (confSet.has(idx)) {
        btn.classList.add('conflict');
      }

      // Accessibility label
      const markDesc = mark === 2 ? 'Krone' : mark === 1 ? 'Kreuz' : 'leer';
      const confDesc = confSet.has(idx) ? ', Konflikt' : '';
      btn.setAttribute('aria-label', `Zeile ${r + 1}, Spalte ${c + 1}, Gebiet ${reg + 1}, ${markDesc}${confDesc}`);

      if (mark === 2) {
        btn.innerHTML = CROWN_SVG;
      } else if (mark === 1) {
        btn.innerHTML = CROSS_SVG;
      }

      btn.addEventListener('click', () => {
        focusedIndex = idx;
        handleCellClick(idx);
      });

      boardEl.appendChild(btn);
    }
  }

  // End view
  const endView = document.getElementById('end-view');
  const endTitle = document.getElementById('end-title');
  const endNote = document.getElementById('end-note');
  const btnPractice = document.getElementById('btn-end-practice');
  const btnNewRound = document.getElementById('btn-end-new-round');

  if (round.state === 'won') {
    endView.hidden = false;
    const movesText = `${round.placed} ${round.placed === 1 ? 'Zug' : 'Zügen'}`;
    endTitle.textContent = `Gelöst! ${size}×${size} in ${movesText}`;

    if (mode === 'daily') {
      endNote.textContent = 'Nächstes Rätsel um Mitternacht.';
      btnPractice.hidden = false;
      btnNewRound.hidden = true;
    } else {
      endNote.textContent = '';
      btnPractice.hidden = true;
      btnNewRound.hidden = false;
    }
  } else {
    endView.hidden = true;
  }
}

function handleKeyNavigation(e) {
  const round = getActiveRound();
  if (!round) return;
  const size = round.size;
  const total = size * size;

  const target = document.activeElement;
  if (!target || !target.classList.contains('cell')) return;

  let idx = parseInt(target.dataset.index, 10);
  if (isNaN(idx)) idx = focusedIndex;

  let nextIdx = idx;
  const r = Math.floor(idx / size);
  const c = idx % size;

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    nextIdx = r > 0 ? (r - 1) * size + c : idx;
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    nextIdx = r < size - 1 ? (r + 1) * size + c : idx;
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    nextIdx = c > 0 ? r * size + (c - 1) : idx;
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    nextIdx = c < size - 1 ? r * size + (c + 1) : idx;
  } else if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    handleCellClick(idx);
    return;
  } else {
    return;
  }

  if (nextIdx !== idx && nextIdx >= 0 && nextIdx < total) {
    focusedIndex = nextIdx;
    const nextBtn = document.querySelector(`.cell[data-index="${nextIdx}"]`);
    if (nextBtn) nextBtn.focus();
  }
}

function init() {
  initPrivacy();

  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  document.getElementById('btn-share').addEventListener('click', doShare);
  document.getElementById('btn-restart').addEventListener('click', handleRestart);

  document.getElementById('tab-daily').addEventListener('click', () => setMode('daily'));
  document.getElementById('tab-practice').addEventListener('click', () => setMode('practice'));

  document.getElementById('btn-practice-new').addEventListener('click', () => {
    startPractice();
    render();
  });

  document.getElementById('btn-end-practice').addEventListener('click', () => {
    setMode('practice');
    startPractice();
    render();
  });

  document.getElementById('btn-end-new-round').addEventListener('click', () => {
    startPractice();
    render();
  });

  window.addEventListener('keydown', handleKeyNavigation);
  setInterval(checkMidnight, 30000);

  setMode('daily');

  startClock({
    getRound: getActiveRound,
    isOver: r => r.state === 'won',
    save: saveIfDaily,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
