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
  LEN,
  newRound,
  evaluate,
  submit,
  keyStates,
  shareText as formatShareText,
} from './logic.js';

let mode = 'daily';
let dailyRound = null;
let practiceRound = null;
let currentDateSeed = dailySeed(new Date());
let currentInput = '';
let isAnimating = false;

function getActiveRound() {
  return mode === 'daily' ? dailyRound : practiceRound;
}

function saveIfDaily() {
  if (mode === 'daily' && dailyRound) {
    writeStorage(`rechnel.daily.${dailyRound.seed}`, dailyRound);
  }
}

function loadDaily() {
  currentDateSeed = dailySeed(new Date());
  const saved = readStorage(`rechnel.daily.${currentDateSeed}`);
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
  currentInput = '';
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
  currentInput = '';
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
    if (!practiceRound || practiceRound.state === 'won' || practiceRound.state === 'lost') {
      startPractice();
    }
  }

  render();
}

function displayGlyph(c) {
  if (c === '*') return '×';
  if (c === '/') return '÷';
  if (c === '-') return '−';
  return c;
}

function formatEquation(eq) {
  return String(eq || '').split('').map(displayGlyph).join('');
}

function getKeyBtn(ch) {
  const btns = document.querySelectorAll('#keyboard .key');
  for (const b of btns) {
    if (b.dataset.key === ch) return b;
  }
  return null;
}

function render() {
  const round = getActiveRound();
  reportRound('rechnel', round, mode);
  if (!round) return;

  // Board tiles rendering (6 rows x 8 tiles)
  for (let r = 0; r < 6; r++) {
    const rowEl = document.querySelector(`.board-row[data-row="${r}"]`);
    if (!rowEl) continue;
    const tiles = rowEl.querySelectorAll('.tile');

    if (r < round.guesses.length) {
      const guess = round.guesses[r];
      const ev = evaluate(guess, round.answer);
      for (let c = 0; c < LEN; c++) {
        const tile = tiles[c];
        const glyph = displayGlyph(guess[c]);
        tile.textContent = glyph;
        tile.dataset.state = ev[c];
        const desc = ev[c] === 'hit' ? 'richtig' : ev[c] === 'near' ? 'falsche Stelle' : 'nicht enthalten';
        tile.setAttribute('aria-label', `${glyph}, ${desc}`);
      }
    } else if (r === round.guesses.length && round.state === 'playing') {
      for (let c = 0; c < LEN; c++) {
        const tile = tiles[c];
        if (c < currentInput.length) {
          const glyph = displayGlyph(currentInput[c]);
          tile.textContent = glyph;
          tile.dataset.state = 'tbd';
          tile.setAttribute('aria-label', glyph);
        } else {
          tile.textContent = '';
          tile.dataset.state = 'empty';
          tile.removeAttribute('aria-label');
        }
      }
    } else {
      for (let c = 0; c < LEN; c++) {
        const tile = tiles[c];
        tile.textContent = '';
        tile.dataset.state = 'empty';
        tile.removeAttribute('aria-label');
      }
    }
  }

  // Keyboard keys colouring
  const ks = keyStates(round);
  const keyBtns = document.querySelectorAll('#keyboard .key');
  keyBtns.forEach(btn => {
    const key = btn.dataset.key;
    if (key && ks[key]) {
      btn.dataset.state = ks[key];
    } else if (key && key !== 'Enter' && key !== 'Backspace') {
      delete btn.dataset.state;
    }
  });

  // End view rendering
  const endView = document.getElementById('end-view');
  const endTitle = document.getElementById('end-title');
  const endNote = document.getElementById('end-note');
  const btnPractice = document.getElementById('btn-end-practice');
  const btnNewRound = document.getElementById('btn-end-new-round');

  if (round.state === 'won' || round.state === 'lost') {
    endView.hidden = false;
    if (round.state === 'won') {
      const tries = round.guesses.length;
      endTitle.textContent = `Geschafft in ${tries} ${tries === 1 ? 'Versuch' : 'Versuchen'}`;
    } else {
      endTitle.innerHTML = `Leider nicht. Die Gleichung war <strong>${formatEquation(round.answer)}</strong>`;
    }

    if (mode === 'daily') {
      endNote.textContent = 'Nächste Gleichung um Mitternacht.';
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

function updateCurrentRow() {
  const round = getActiveRound();
  if (!round || round.state !== 'playing') return;
  const rowIndex = round.guesses.length;
  const rowEl = document.querySelector(`.board-row[data-row="${rowIndex}"]`);
  if (!rowEl) return;
  const tiles = rowEl.querySelectorAll('.tile');
  for (let c = 0; c < LEN; c++) {
    const tile = tiles[c];
    if (c < currentInput.length) {
      const glyph = displayGlyph(currentInput[c]);
      tile.textContent = glyph;
      tile.dataset.state = 'tbd';
      tile.setAttribute('aria-label', glyph);
    } else {
      tile.textContent = '';
      tile.dataset.state = 'empty';
      tile.removeAttribute('aria-label');
    }
  }
}

function triggerShake(rowIndex) {
  const rowEl = document.querySelector(`.board-row[data-row="${rowIndex}"]`);
  if (!rowEl) return;
  rowEl.classList.remove('shake');
  void rowEl.offsetWidth;
  rowEl.classList.add('shake');
  rowEl.addEventListener('animationend', () => {
    rowEl.classList.remove('shake');
  }, { once: true });
}

function animateFlip(rowIndex, guess, round) {
  isAnimating = true;
  const rowEl = document.querySelector(`.board-row[data-row="${rowIndex}"]`);
  const tiles = rowEl ? Array.from(rowEl.querySelectorAll('.tile')) : [];
  const ev = evaluate(guess, round.answer);

  tiles.forEach((tile, c) => {
    const glyph = displayGlyph(guess[c]);
    tile.textContent = glyph;
    setTimeout(() => {
      tile.classList.add('tile-flip');
      setTimeout(() => {
        tile.dataset.state = ev[c];
        const desc = ev[c] === 'hit' ? 'richtig' : ev[c] === 'near' ? 'falsche Stelle' : 'nicht enthalten';
        tile.setAttribute('aria-label', `${glyph}, ${desc}`);

        // Update corresponding key on keyboard
        const keyBtn = getKeyBtn(guess[c]);
        if (keyBtn) {
          const current = keyBtn.dataset.state;
          if (ev[c] === 'hit') {
            keyBtn.dataset.state = 'hit';
          } else if (ev[c] === 'near' && current !== 'hit') {
            keyBtn.dataset.state = 'near';
          } else if (ev[c] === 'miss' && !current) {
            keyBtn.dataset.state = 'miss';
          }
        }
      }, 180);
    }, c * 80);
  });

  const totalDuration = (tiles.length - 1) * 80 + 360;
  setTimeout(() => {
    tiles.forEach(t => t.classList.remove('tile-flip'));
    isAnimating = false;
    render();
  }, totalDuration);
}

function handleInput(char) {
  const round = getActiveRound();
  if (!round || round.state !== 'playing' || isAnimating) return;
  if (currentInput.length < LEN) {
    currentInput += char;
    updateCurrentRow();
  }
}

function handleBackspace() {
  const round = getActiveRound();
  if (!round || round.state !== 'playing' || isAnimating) return;
  if (currentInput.length > 0) {
    currentInput = currentInput.slice(0, -1);
    updateCurrentRow();
  }
}

function handleEnter() {
  const round = getActiveRound();
  if (!round || round.state !== 'playing' || isAnimating) return;

  if (currentInput.length < LEN) {
    showToast('Zu kurz');
    triggerShake(round.guesses.length);
    return;
  }

  const guess = currentInput;
  const res = submit(round, guess);
  if (res.result === 'short') {
    showToast('Zu kurz');
    triggerShake(round.guesses.length);
    return;
  }
  if (res.result === 'invalid') {
    let msg = 'Keine gültige Rechnung';
    if (res.reason === 'equals') {
      msg = 'Genau ein Gleichheitszeichen nötig';
    } else if (res.reason === 'unequal') {
      msg = 'Die Rechnung geht nicht auf';
    } else if (res.reason === 'chars') {
      msg = 'Ungültiges Zeichen';
    } else if (res.reason === 'syntax' || res.reason === 'zero') {
      msg = 'Keine gültige Rechnung';
    }
    showToast(msg);
    triggerShake(round.guesses.length);
    return;
  }
  if (res.result === 'ok') {
    currentInput = '';
    saveIfDaily();

    const rowIndex = round.guesses.length - 1;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      render();
    } else {
      animateFlip(rowIndex, guess, round);
    }
  }
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

function init() {
  initPrivacy();

  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  document.getElementById('btn-share').addEventListener('click', doShare);

  document.getElementById('tab-daily').addEventListener('click', () => setMode('daily'));
  document.getElementById('tab-practice').addEventListener('click', () => setMode('practice'));

  document.getElementById('btn-end-practice').addEventListener('click', () => {
    setMode('practice');
    startPractice();
    render();
  });

  document.getElementById('btn-end-new-round').addEventListener('click', () => {
    startPractice();
    render();
  });

  // On-screen keyboard click listener
  document.getElementById('keyboard').addEventListener('click', e => {
    const btn = e.target.closest('button.key');
    if (!btn) return;
    const key = btn.dataset.key;
    if (key === 'Enter') {
      handleEnter();
    } else if (key === 'Backspace') {
      handleBackspace();
    } else if (key) {
      handleInput(key);
    }
  });

  // Physical keyboard listener
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const privacyDialog = document.getElementById('privacy-dialog');
    if (privacyDialog && privacyDialog.open) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      handleEnter();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
    } else if (/^[0-9+\-=]$/.test(e.key)) {
      e.preventDefault();
      handleInput(e.key);
    } else if (e.key === '*' || e.key.toLowerCase() === 'x') {
      e.preventDefault();
      handleInput('*');
    } else if (e.key === '/' || e.key === ':') {
      e.preventDefault();
      handleInput('/');
    }
  });

  setInterval(checkMidnight, 30000);

  setMode('daily');

  startClock({
    getRound: getActiveRound,
    isOver: r => r.state === 'won' || r.state === 'lost',
    save: saveIfDaily,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
