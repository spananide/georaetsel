import { byId } from '../georaetsel/game.js';
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
  TYPES,
  fmt,
  newGame,
  answer,
  advance,
} from './logic.js';

const STORAGE_KEY_BEST = 'mehrweniger.best';

let game = null;
let bestScore = 0;

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

function startNewGame() {
  bestScore = Number(readStorage(STORAGE_KEY_BEST, 0)) || 0;
  const seed = Math.floor(Math.random() * 2147483647);
  game = newGame(seed);
  render();
}

function handlePick(countryId) {
  if (!game || game.over || game.picked) return;
  const res = answer(game, countryId);
  if (res.ignored) return;
  render();
}

function handleNext() {
  if (!game || game.over || !game.picked) return;
  advance(game);
  render();
}

function handleShare() {
  if (!game) return;
  const url = `${window.location.origin}${window.location.pathname}`;
  const text = `Mehr oder weniger: Serie ${game.streak}\n${url}`;
  copyOrShare(withTime(text, game.ms));
}

function render() {
  reportRound('mehr-weniger', game, 'practice');
  if (!game) return;

  const countryA = byId(game.pair.a);
  const countryB = byId(game.pair.b);
  if (!countryA || !countryB) return;

  // Header score block
  const scoreStreakEl = document.getElementById('score-streak');
  const scoreRecordEl = document.getElementById('score-record');
  scoreStreakEl.textContent = game.streak;
  scoreRecordEl.textContent = bestScore;

  // Question
  const questionEl = document.getElementById('question');
  questionEl.textContent = TYPES[game.pair.type].q;

  // Cards
  const cardA = document.getElementById('card-a');
  const flagA = document.getElementById('flag-a');
  const nameA = document.getElementById('name-a');
  const valA = document.getElementById('val-a');

  cardA.setAttribute('aria-label', countryA.name);
  flagA.src = `../georaetsel/assets/flags/${countryA.id}.svg`;
  nameA.textContent = countryA.name;

  const cardB = document.getElementById('card-b');
  const flagB = document.getElementById('flag-b');
  const nameB = document.getElementById('name-b');
  const valB = document.getElementById('val-b');

  cardB.setAttribute('aria-label', countryB.name);
  flagB.src = `../georaetsel/assets/flags/${countryB.id}.svg`;
  nameB.textContent = countryB.name;

  const statusMsgEl = document.getElementById('status-msg');
  const revealedControls = document.getElementById('revealed-controls');
  const btnNext = document.getElementById('btn-next');
  const endPanel = document.getElementById('end-panel');

  if (game.picked === null) {
    // Asking state
    cardA.disabled = false;
    cardB.disabled = false;
    cardA.className = 'card-btn';
    cardB.className = 'card-btn';
    valA.hidden = true;
    valA.textContent = '';
    valB.hidden = true;
    valB.textContent = '';

    statusMsgEl.textContent = '';
    statusMsgEl.className = 'status-msg';

    revealedControls.hidden = true;
    endPanel.hidden = true;
  } else {
    // Revealed state (correct or wrong)
    cardA.disabled = true;
    cardB.disabled = true;

    const valAVal = countryA[game.pair.type];
    const valBVal = countryB[game.pair.type];
    valA.textContent = fmt(game.pair.type, valAVal);
    valA.hidden = false;
    valB.textContent = fmt(game.pair.type, valBVal);
    valB.hidden = false;

    // Highlight borders
    const isHigherA = valAVal > valBVal;
    const isPickedA = game.picked === countryA.id;
    const isPickedB = game.picked === countryB.id;

    cardA.className = 'card-btn';
    cardB.className = 'card-btn';

    if (isHigherA) {
      cardA.classList.add('is-correct');
      if (isPickedB) {
        cardB.classList.add('is-wrong');
      }
    } else {
      cardB.classList.add('is-correct');
      if (isPickedA) {
        cardA.classList.add('is-wrong');
      }
    }

    if (!game.over) {
      // Correct
      statusMsgEl.textContent = 'Richtig!';
      statusMsgEl.className = 'status-msg correct';
      revealedControls.hidden = false;
      endPanel.hidden = true;
      btnNext.focus();
    } else {
      // Game over (wrong)
      statusMsgEl.textContent = 'Leider falsch.';
      statusMsgEl.className = 'status-msg wrong';
      revealedControls.hidden = true;
      endPanel.hidden = false;

      // Update record if new streak is higher
      const isNewRecord = game.streak > bestScore;
      if (isNewRecord) {
        bestScore = game.streak;
        writeStorage(STORAGE_KEY_BEST, bestScore);
        scoreRecordEl.textContent = bestScore;
      }

      document.getElementById('end-streak-val').textContent = game.streak;
      document.getElementById('end-new-record').hidden = !isNewRecord;
      document.getElementById('end-record-line').textContent = `Rekord: ${bestScore}`;

      const btnRestart = document.getElementById('btn-restart');
      if (btnRestart) btnRestart.focus();
    }
  }
}

function init() {
  initPrivacy();

  document.getElementById('card-a').addEventListener('click', () => {
    if (game) handlePick(game.pair.a);
  });
  document.getElementById('card-b').addEventListener('click', () => {
    if (game) handlePick(game.pair.b);
  });
  document.getElementById('btn-next').addEventListener('click', handleNext);
  document.getElementById('btn-restart').addEventListener('click', startNewGame);
  document.getElementById('btn-share').addEventListener('click', handleShare);
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  startNewGame();

  startClock({
    getRound: () => game,
    isOver: g => g.over,
    save: () => {},
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
