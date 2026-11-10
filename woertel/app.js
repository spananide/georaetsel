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
  WORD_LEN,
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
    writeStorage(`woertel.daily.${dailyRound.seed}`, dailyRound);
  }
}

function loadDaily() {
  currentDateSeed = dailySeed(new Date());
  const saved = readStorage(`woertel.daily.${currentDateSeed}`);
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

function render() {
  const round = getActiveRound();
  reportRound('woertel', round, mode);
  if (!round) return;

  // Board tiles rendering
  for (let r = 0; r < 6; r++) {
    const rowEl = document.querySelector(`.board-row[data-row="${r}"]`);
    if (!rowEl) continue;
    const tiles = rowEl.querySelectorAll('.tile');

    if (r < round.guesses.length) {
      const guess = round.guesses[r];
      const ev = evaluate(guess, round.answer);
      for (let c = 0; c < WORD_LEN; c++) {
        const tile = tiles[c];
        tile.textContent = guess[c];
        tile.dataset.state = ev[c];
        const desc = ev[c] === 'hit' ? 'richtig' : ev[c] === 'near' ? 'falsche Stelle' : 'nicht enthalten';
        tile.setAttribute('aria-label', `${guess[c]}, ${desc}`);
      }
    } else if (r === round.guesses.length && round.state === 'playing') {
      for (let c = 0; c < WORD_LEN; c++) {
        const tile = tiles[c];
        if (c < currentInput.length) {
          tile.textContent = currentInput[c];
          tile.dataset.state = 'tbd';
          tile.setAttribute('aria-label', currentInput[c]);
        } else {
          tile.textContent = '';
          tile.dataset.state = 'empty';
          tile.removeAttribute('aria-label');
        }
      }
    } else {
      for (let c = 0; c < WORD_LEN; c++) {
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
      endTitle.innerHTML = `Leider nicht. Das Wort war <strong>${round.answer}</strong>`;
    }

    if (mode === 'daily') {
      endNote.textContent = 'Nächstes Wort um Mitternacht.';
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
  for (let c = 0; c < WORD_LEN; c++) {
    const tile = tiles[c];
    if (c < currentInput.length) {
      tile.textContent = currentInput[c];
      tile.dataset.state = 'tbd';
      tile.setAttribute('aria-label', currentInput[c]);
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

function animateFlip(rowIndex, guessWord, round) {
  isAnimating = true;
  const rowEl = document.querySelector(`.board-row[data-row="${rowIndex}"]`);
  const tiles = rowEl ? Array.from(rowEl.querySelectorAll('.tile')) : [];
  const ev = evaluate(guessWord, round.answer);

  tiles.forEach((tile, c) => {
    tile.textContent = guessWord[c];
    setTimeout(() => {
      tile.classList.add('tile-flip');
      setTimeout(() => {
        tile.dataset.state = ev[c];
        const desc = ev[c] === 'hit' ? 'richtig' : ev[c] === 'near' ? 'falsche Stelle' : 'nicht enthalten';
        tile.setAttribute('aria-label', `${guessWord[c]}, ${desc}`);

        // Update corresponding key on keyboard
        const keyBtn = document.querySelector(`.key[data-key="${guessWord[c]}"]`);
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
    }, c * 100);
  });

  const totalDuration = (tiles.length - 1) * 100 + 360;
  setTimeout(() => {
    tiles.forEach(t => t.classList.remove('tile-flip'));
    isAnimating = false;
    render();
  }, totalDuration);
}

function handleLetter(letter) {
  const round = getActiveRound();
  if (!round || round.state !== 'playing' || isAnimating) return;
  if (currentInput.length < WORD_LEN) {
    currentInput += letter;
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

  if (currentInput.length < WORD_LEN) {
    showToast('Zu kurz');
    triggerShake(round.guesses.length);
    return;
  }

  const guessWord = currentInput;
  const res = submit(round, guessWord);
  if (res.result === 'short') {
    showToast('Zu kurz');
    triggerShake(round.guesses.length);
    return;
  }
  if (res.result === 'invalid') {
    showToast('Nicht in der Wortliste');
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
      animateFlip(rowIndex, guessWord, round);
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
      handleLetter(key);
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
    } else {
      const key = e.key.toUpperCase();
      if (/^[A-ZÄÖÜ]$/.test(key)) {
        e.preventDefault();
        handleLetter(key);
      }
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
