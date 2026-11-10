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
  valueAt,
  isGiven,
  setValue,
  erase,
  toggleNote,
  conflicts,
  remaining,
  shareText as formatShareText,
  ROW_OF,
  COL_OF,
  BOX_OF,
} from './logic.js';

let mode = 'daily';
let dailyRound = null;
let practiceRound = null;
let practiceLevel = 'mittel';
let currentDateSeed = dailySeed(new Date());
let selectedIndex = 0;
let notesMode = false;

function getActiveRound() {
  return mode === 'daily' ? dailyRound : practiceRound;
}

function saveIfDaily() {
  if (mode === 'daily' && dailyRound) {
    writeStorage(`sudoku.daily.${dailyRound.seed}`, dailyRound);
  }
}

function loadDaily() {
  currentDateSeed = dailySeed(new Date());
  const saved = readStorage(`sudoku.daily.${currentDateSeed}`);
  if (saved && saved.seed === currentDateSeed) {
    dailyRound = saved;
  } else {
    dailyRound = newRound(currentDateSeed, 'daily', 'mittel');
    saveIfDaily();
  }
}

function startPractice() {
  const randSeed = Math.floor(Math.random() * 2147483647);
  practiceRound = newRound(randSeed, 'practice', practiceLevel);
  selectedIndex = 0;
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const nextTheme = current === 'light' ? 'dark' : 'light';
  if (nextTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', '#CFE6F2');
  } else {
    document.documentElement.removeAttribute('data-theme');
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', '#0B2C45');
  }
  try {
    localStorage.setItem('georaetsel.theme', nextTheme);
  } catch (e) {}
}

function setMode(newMode) {
  mode = newMode;
  selectedIndex = 0;
  const tabDaily = document.getElementById('tab-daily');
  const tabPractice = document.getElementById('tab-practice');
  const dailyLevelEl = document.getElementById('daily-level');
  const practiceControlsEl = document.getElementById('practice-controls');

  tabDaily.setAttribute('aria-selected', mode === 'daily');
  tabPractice.setAttribute('aria-selected', mode === 'practice');

  if (mode === 'daily') {
    tabDaily.setAttribute('aria-current', 'page');
    tabPractice.removeAttribute('aria-current');
    dailyLevelEl.hidden = false;
    practiceControlsEl.hidden = true;
    loadDaily();
  } else {
    tabPractice.setAttribute('aria-current', 'page');
    tabDaily.removeAttribute('aria-current');
    dailyLevelEl.hidden = true;
    practiceControlsEl.hidden = false;
    if (!practiceRound || practiceRound.state === 'won') {
      startPractice();
    }
  }

  render();
}

function setPracticeLevel(level) {
  practiceLevel = level;
  startPractice();
  render();
}

function handleDigitInput(digit) {
  const round = getActiveRound();
  if (!round || round.state !== 'playing') return;

  if (notesMode) {
    toggleNote(round, selectedIndex, digit);
  } else {
    setValue(round, selectedIndex, digit);
  }

  saveIfDaily();
  render();
}

function handleErase() {
  const round = getActiveRound();
  if (!round || round.state !== 'playing') return;

  erase(round, selectedIndex);
  saveIfDaily();
  render();
}

function toggleNotesMode() {
  notesMode = !notesMode;
  const btnNotes = document.getElementById('btn-notes');
  if (btnNotes) {
    btnNotes.setAttribute('aria-pressed', String(notesMode));
  }
}

function handleRestart() {
  const round = getActiveRound();
  if (!round || round.state === 'won') return;

  round.cells.fill(0);
  round.notes.fill(0);
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

function handleKeyDown(e) {
  const target = e.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

  const round = getActiveRound();
  if (!round) return;

  if (e.key >= '1' && e.key <= '9') {
    e.preventDefault();
    handleDigitInput(parseInt(e.key, 10));
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    e.preventDefault();
    handleErase();
  } else if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    toggleNotesMode();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const r = ROW_OF[selectedIndex];
    const c = COL_OF[selectedIndex];
    if (r > 0) selectedIndex = (r - 1) * 9 + c;
    render();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    const r = ROW_OF[selectedIndex];
    const c = COL_OF[selectedIndex];
    if (r < 8) selectedIndex = (r + 1) * 9 + c;
    render();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    const r = ROW_OF[selectedIndex];
    const c = COL_OF[selectedIndex];
    if (c > 0) selectedIndex = r * 9 + (c - 1);
    render();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    const r = ROW_OF[selectedIndex];
    const c = COL_OF[selectedIndex];
    if (c < 8) selectedIndex = r * 9 + (c + 1);
    render();
  }
}

function render() {
  const round = getActiveRound();
  reportRound('sudoku', round, mode);
  if (!round) return;

  // Mistakes counter
  const mistakesEl = document.getElementById('mistakes');
  if (mistakesEl) {
    mistakesEl.textContent = `Fehler: ${round.mistakes}`;
  }

  // Level buttons in practice mode
  const btnLeicht = document.getElementById('btn-level-leicht');
  const btnMittel = document.getElementById('btn-level-mittel');
  const btnSchwer = document.getElementById('btn-level-schwer');
  if (btnLeicht) btnLeicht.setAttribute('aria-pressed', String(practiceLevel === 'leicht'));
  if (btnMittel) btnMittel.setAttribute('aria-pressed', String(practiceLevel === 'mittel'));
  if (btnSchwer) btnSchwer.setAttribute('aria-pressed', String(practiceLevel === 'schwer'));

  // Notes button
  const btnNotes = document.getElementById('btn-notes');
  if (btnNotes) {
    btnNotes.setAttribute('aria-pressed', String(notesMode));
  }

  // Number pad digits 1-9
  const rem = remaining(round);
  for (let d = 1; d <= 9; d++) {
    const numBtn = document.getElementById(`num-${d}`);
    if (numBtn) {
      const isDepleted = rem[d] === 0;
      numBtn.disabled = isDepleted;
      numBtn.classList.toggle('dimmed', isDepleted);
    }
  }

  // Puzzle data and board calculation
  const p = puzzleFor(round.seed, round.level);
  const confSet = conflicts(round);
  const selVal = valueAt(round, selectedIndex);
  const selRow = ROW_OF[selectedIndex];
  const selCol = COL_OF[selectedIndex];
  const selBox = BOX_OF[selectedIndex];

  const boardEl = document.getElementById('board');
  const hadFocus = document.activeElement && document.activeElement.classList.contains('cell');
  boardEl.innerHTML = '';

  for (let i = 0; i < 81; i++) {
    const r = ROW_OF[i];
    const c = COL_OF[i];
    const b = BOX_OF[i];
    const given = p.puzzle[i] !== 0;
    const enteredVal = round.cells[i];
    const val = given ? p.puzzle[i] : enteredVal;
    const wrong = !given && enteredVal !== 0 && enteredVal !== p.solution[i];
    const isConflict = confSet.has(i);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cell';
    btn.setAttribute('role', 'gridcell');
    btn.dataset.index = i;
    btn.dataset.row = r;
    btn.dataset.col = c;

    if (given) {
      btn.classList.add('given');
    } else if (enteredVal !== 0) {
      btn.classList.add('entered');
    }

    if (i === selectedIndex) {
      btn.classList.add('selected');
    } else if (r === selRow || c === selCol || b === selBox) {
      btn.classList.add('related');
    }

    if (val !== 0 && selVal !== 0 && val === selVal) {
      btn.classList.add('same-digit');
    }

    if (wrong || isConflict) {
      btn.classList.add('conflict');
      if (wrong) btn.classList.add('wrong');
    }

    // Accessibility label
    let label = `Zeile ${r + 1}, Spalte ${c + 1}`;
    if (val !== 0) {
      label += `, ${val}`;
      if (given) {
        label += ', vorgegeben';
      } else if (wrong || isConflict) {
        label += ', Fehler';
      }
    } else {
      label += ', leer';
    }
    btn.setAttribute('aria-label', label);

    if (val !== 0) {
      btn.textContent = String(val);
    } else if (round.notes[i] > 0) {
      const notesGrid = document.createElement('div');
      notesGrid.className = 'notes-grid';
      for (let d = 1; d <= 9; d++) {
        const span = document.createElement('span');
        span.className = 'note-digit';
        if ((round.notes[i] & (1 << (d - 1))) !== 0) {
          span.textContent = String(d);
        }
        notesGrid.appendChild(span);
      }
      btn.appendChild(notesGrid);
    }

    btn.addEventListener('click', () => {
      selectedIndex = i;
      render();
      const current = document.querySelector(`.cell[data-index="${i}"]`);
      if (current) current.focus();
    });

    boardEl.appendChild(btn);
  }

  if (hadFocus) {
    const nextFocused = document.querySelector(`.cell[data-index="${selectedIndex}"]`);
    if (nextFocused) nextFocused.focus();
  }

  // End view
  const endView = document.getElementById('end-view');
  const endTitle = document.getElementById('end-title');
  const endNote = document.getElementById('end-note');
  const btnPractice = document.getElementById('btn-end-practice');
  const btnNewRound = document.getElementById('btn-end-new-round');

  if (round.state === 'won') {
    endView.hidden = false;
    endTitle.textContent = round.mistakes === 0
      ? 'Gelöst! Fehlerfrei'
      : `Gelöst! ${round.mistakes} Fehler`;

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

function init() {
  initPrivacy();

  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  document.getElementById('btn-share').addEventListener('click', doShare);
  document.getElementById('btn-restart').addEventListener('click', handleRestart);

  document.getElementById('tab-daily').addEventListener('click', () => setMode('daily'));
  document.getElementById('tab-practice').addEventListener('click', () => setMode('practice'));

  document.getElementById('btn-level-leicht').addEventListener('click', () => setPracticeLevel('leicht'));
  document.getElementById('btn-level-mittel').addEventListener('click', () => setPracticeLevel('mittel'));
  document.getElementById('btn-level-schwer').addEventListener('click', () => setPracticeLevel('schwer'));

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

  // Numpad clicks
  for (let d = 1; d <= 9; d++) {
    const btn = document.getElementById(`num-${d}`);
    if (btn) {
      btn.addEventListener('click', () => handleDigitInput(d));
    }
  }

  document.getElementById('btn-notes').addEventListener('click', toggleNotesMode);
  document.getElementById('btn-erase').addEventListener('click', handleErase);

  window.addEventListener('keydown', handleKeyDown);
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
