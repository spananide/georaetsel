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
  puzzleFor,
  newRound,
  toggleSelect,
  shuffle,
  deselect,
  submit,
  shareText as formatShareText,
} from './logic.js';

let mode = 'daily';
let dailyRound = null;
let practiceRound = null;
let currentDateSeed = dailySeed(new Date());

function getActiveRound() {
  return mode === 'daily' ? dailyRound : practiceRound;
}

function saveIfDaily() {
  if (mode === 'daily' && dailyRound) {
    writeStorage(`vierer.daily.${dailyRound.seed}`, dailyRound);
  }
}

function loadDaily() {
  currentDateSeed = dailySeed(new Date());
  const saved = readStorage(`vierer.daily.${currentDateSeed}`);
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

function triggerShake() {
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) return;
  const tiles = document.querySelectorAll('.word-tile[aria-pressed="true"]');
  tiles.forEach(tile => {
    tile.classList.remove('shake');
    void tile.offsetWidth;
    tile.classList.add('shake');
    tile.addEventListener('animationend', () => {
      tile.classList.remove('shake');
    }, { once: true });
  });
}

function render() {
  const round = getActiveRound();
  reportRound('vierer', round, mode);
  if (!round) return;

  const puzzle = puzzleFor(round.seed, round.mode);

  // Render solved groups
  const solvedContainer = document.getElementById('solved-groups');
  solvedContainer.innerHTML = '';
  for (const lvl of round.solved) {
    const group = puzzle.groups.find(g => g.level === lvl);
    if (!group) continue;
    const bar = document.createElement('div');
    bar.className = `solved-group lvl-${lvl}`;
    bar.setAttribute('role', 'status');
    bar.innerHTML = `
      <div class="solved-group-header">
        <span class="group-level-badge" aria-label="Stufe ${lvl + 1}">${lvl + 1}</span>
        <span class="group-name">${group.name}</span>
      </div>
      <div class="group-words">${group.words.join(', ')}</div>
    `;
    solvedContainer.appendChild(bar);
  }

  // Render remaining word tiles
  const gridContainer = document.getElementById('grid');
  gridContainer.innerHTML = '';
  const isPlaying = round.state === 'playing';

  if (isPlaying) {
    gridContainer.hidden = false;
    for (const word of round.order) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'word-tile';
      if (word.length >= 12) {
        tile.classList.add('tile-xlong');
      } else if (word.length >= 10) {
        tile.classList.add('tile-long');
      }
      const isSelected = round.selected.includes(word);
      tile.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
      tile.dataset.word = word;
      tile.textContent = word;
      gridContainer.appendChild(tile);
    }
  } else {
    gridContainer.hidden = true;
  }

  // Render mistakes indicator
  const mistakesContainer = document.getElementById('mistakes-container');
  const dotsContainer = document.getElementById('mistakes-dots');
  if (isPlaying) {
    mistakesContainer.hidden = false;
    mistakesContainer.setAttribute('aria-label', `${round.mistakes} von 4 Fehlern`);
    dotsContainer.innerHTML = '';
    for (let i = 0; i < 4; i++) {
      const dot = document.createElement('span');
      dot.className = i < round.mistakes ? 'dot filled' : 'dot';
      dotsContainer.appendChild(dot);
    }
  } else {
    mistakesContainer.hidden = true;
  }

  // Render action controls
  const controlsEl = document.getElementById('controls');
  const btnSubmit = document.getElementById('btn-submit');
  const btnDeselect = document.getElementById('btn-deselect');
  if (isPlaying) {
    controlsEl.hidden = false;
    btnSubmit.disabled = round.selected.length !== 4;
    btnDeselect.disabled = round.selected.length === 0;
  } else {
    controlsEl.hidden = true;
  }

  // Render end view
  const endView = document.getElementById('end-view');
  const endTitle = document.getElementById('end-title');
  const endNote = document.getElementById('end-note');
  const btnPractice = document.getElementById('btn-end-practice');
  const btnNewRound = document.getElementById('btn-end-new-round');

  if (round.state === 'won' || round.state === 'lost') {
    endView.hidden = false;
    if (round.state === 'won') {
      const mistText = round.mistakes === 0 ? 'Fehlerfrei' : `${round.mistakes} ${round.mistakes === 1 ? 'Fehler' : 'Fehler'}`;
      endTitle.textContent = `Geschafft! (${mistText})`;
    } else {
      endTitle.textContent = 'Leider verloren';
    }

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

function handleSubmit() {
  const round = getActiveRound();
  if (!round || round.state !== 'playing') return;
  const puzzle = puzzleFor(round.seed, round.mode);
  const res = submit(round, puzzle);

  if (res.result === 'incomplete') {
    return;
  }
  if (res.result === 'repeat') {
    showToast('Das hast du schon probiert');
    triggerShake();
    return;
  }
  if (res.result === 'oneaway') {
    showToast('Fast! Nur eins daneben');
    saveIfDaily();
    render();
    triggerShake();
    return;
  }
  if (res.result === 'wrong') {
    showToast('Leider falsch');
    saveIfDaily();
    render();
    triggerShake();
    return;
  }
  if (res.result === 'correct') {
    saveIfDaily();
    render();
    return;
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

  document.getElementById('btn-shuffle').addEventListener('click', () => {
    const round = getActiveRound();
    if (!round || round.state !== 'playing') return;
    shuffle(round);
    saveIfDaily();
    render();
  });

  document.getElementById('btn-deselect').addEventListener('click', () => {
    const round = getActiveRound();
    if (!round || round.state !== 'playing') return;
    deselect(round);
    saveIfDaily();
    render();
  });

  document.getElementById('btn-submit').addEventListener('click', handleSubmit);

  document.getElementById('grid').addEventListener('click', e => {
    const tile = e.target.closest('button.word-tile');
    if (!tile) return;
    const word = tile.dataset.word;
    const round = getActiveRound();
    if (!round || round.state !== 'playing') return;
    toggleSelect(round, word);
    saveIfDaily();
    render();
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
