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

const SUN_SVG = '<svg class="sun-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="5" fill="currentColor"/>' +
  '<line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
  '<line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
  '<line x1="2" y1="12" x2="5" y2="12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
  '<line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
  '<line x1="4.93" y1="4.93" x2="7.05" y2="7.05" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
  '<line x1="16.95" y1="16.95" x2="19.07" y2="19.07" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
  '<line x1="4.93" y1="19.07" x2="7.05" y2="16.95" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
  '<line x1="16.95" y1="7.05" x2="19.07" y2="4.93" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>' +
'</svg>';

const MOON_SVG = '<svg class="moon-icon" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="currentColor" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>' +
'</svg>';

function getActiveRound() {
  return mode === 'daily' ? dailyRound : practiceRound;
}

function saveIfDaily() {
  if (mode === 'daily' && dailyRound) {
    writeStorage(`sonne-mond.daily.${dailyRound.seed}`, dailyRound);
  }
}

function loadDaily() {
  currentDateSeed = dailySeed(new Date());
  const saved = readStorage(`sonne-mond.daily.${currentDateSeed}`);
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

  const puzzle = puzzleFor(round.seed, round.mode);
  if (puzzle.given[index]) return;

  toggle(round, index);
  saveIfDaily();
  render();

  const nextBtn = document.querySelector(`.cell[data-index="${index}"]`);
  if (nextBtn) nextBtn.focus();
}

function handleRestart() {
  const round = getActiveRound();
  if (!round) return;
  const puzzle = puzzleFor(round.seed, round.mode);
  for (let i = 0; i < 36; i++) {
    round.cells[i] = puzzle.given[i] ? puzzle.solution[i] : -1;
  }
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
  reportRound('sonne-mond', round, mode);
  if (!round) return;

  const puzzle = puzzleFor(round.seed, round.mode);
  const boardEl = document.getElementById('board');
  const confSet = conflicts(round);

  // Render board cells
  boardEl.innerHTML = '';
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c++) {
      const idx = r * 6 + c;
      const isGiven = puzzle.given[idx];
      const mark = round.cells[idx]; // -1 empty, 0 sun, 1 moon
      const isConflict = confSet.has(idx);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cell';
      btn.setAttribute('role', 'gridcell');
      btn.dataset.index = idx;
      btn.dataset.row = r;
      btn.dataset.col = c;

      if (isGiven) {
        btn.classList.add('given');
        btn.setAttribute('aria-disabled', 'true');
      } else if (round.state === 'won') {
        btn.setAttribute('aria-disabled', 'true');
      }

      if (isConflict) {
        btn.classList.add('conflict');
      }

      // Accessibility label
      const symbolDesc = mark === 0 ? 'Sonne' : mark === 1 ? 'Mond' : 'leer';
      let label = `Zeile ${r + 1}, Spalte ${c + 1}, ${symbolDesc}`;
      if (isGiven) label += ', vorgegeben';
      if (isConflict) label += ', Konflikt';
      btn.setAttribute('aria-label', label);

      if (mark === 0) {
        btn.innerHTML = SUN_SVG;
      } else if (mark === 1) {
        btn.innerHTML = MOON_SVG;
      }

      btn.addEventListener('click', () => {
        focusedIndex = idx;
        handleCellClick(idx);
      });
      btn.addEventListener('focus', () => {
        focusedIndex = idx;
      });

      boardEl.appendChild(btn);
    }
  }

  // Render links layer
  const linksLayer = document.getElementById('links-layer');
  linksLayer.innerHTML = '';
  for (const l of puzzle.links) {
    const badge = document.createElement('span');
    badge.className = 'link-badge';
    badge.textContent = l.same ? '=' : '×';
    const ra = Math.floor(l.a / 6);
    const ca = l.a % 6;
    const rb = Math.floor(l.b / 6);
    const cb = l.b % 6;
    badge.style.left = `${((ca + cb + 1) / 12) * 100}%`;
    badge.style.top = `${((ra + rb + 1) / 12) * 100}%`;

    const va = round.cells[l.a];
    const vb = round.cells[l.b];
    if (va !== -1 && vb !== -1 && ((l.same && va !== vb) || (!l.same && va === vb))) {
      badge.classList.add('conflict');
    }
    linksLayer.appendChild(badge);
  }

  // End view
  const endView = document.getElementById('end-view');
  const endTitle = document.getElementById('end-title');
  const endNote = document.getElementById('end-note');
  const btnEndPractice = document.getElementById('btn-end-practice');
  const btnEndNewRound = document.getElementById('btn-end-new-round');

  if (round.state === 'won') {
    endView.hidden = false;
    endTitle.textContent = 'Gelöst!';
    const movesText = `${round.placed} ${round.placed === 1 ? 'Zug' : 'Zügen'}`;
    if (mode === 'daily') {
      endNote.textContent = `6×6 in ${movesText}. Nächstes Rätsel um Mitternacht.`;
      btnEndPractice.hidden = false;
      btnEndNewRound.hidden = true;
    } else {
      endNote.textContent = `6×6 in ${movesText}.`;
      btnEndPractice.hidden = true;
      btnEndNewRound.hidden = false;
    }
  } else {
    endView.hidden = true;
  }
}

function handleKeyNavigation(e) {
  const round = getActiveRound();
  if (!round) return;
  const size = 6;
  const total = 36;

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
