import { byId, dailySeed } from '../georaetsel/game.js';
import { GEO } from '../data/geo.js';
import {
  readStorage,
  writeStorage,
  showToast,
  shareText as copyOrShare,
  initPrivacy,
  startClock,
  withTime,
} from '../common.js';
import {
  ROUND_SIZE,
  newRound,
  optionsFor,
  answer,
  next,
  total,
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
    writeStorage(`hauptstaedte.daily.${dailyRound.seed}`, dailyRound);
  }
}

function loadDaily() {
  currentDateSeed = dailySeed(new Date());
  const saved = readStorage(`hauptstaedte.daily.${currentDateSeed}`);
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
    if (!practiceRound || practiceRound.state === 'done') {
      startPractice();
    }
  }

  render();
}

function render() {
  const round = getActiveRound();
  if (!round) return;

  const gameView = document.getElementById('game-view');
  const endView = document.getElementById('end-view');

  if (round.state === 'done') {
    gameView.hidden = true;
    endView.hidden = false;
    renderEndView(round);
    return;
  }

  gameView.hidden = false;
  endView.hidden = true;
  renderGameView(round);
}

function renderEndView(round) {
  const scoreVal = document.getElementById('end-score-val');
  const gridEl = document.getElementById('end-grid-emojis');
  const noteEl = document.getElementById('end-note');
  const btnPractice = document.getElementById('btn-end-practice');
  const btnNewRound = document.getElementById('btn-end-new-round');

  scoreVal.textContent = total(round);

  const marks = round.results.map(r => (r.ok ? '🟩' : '🟥'));
  const rows = [];
  for (let i = 0; i < marks.length; i += 5) {
    rows.push(marks.slice(i, i + 5).join(''));
  }
  gridEl.textContent = rows.join('\n');

  if (mode === 'daily') {
    noteEl.textContent = 'Neue Runde morgen.';
    btnPractice.hidden = false;
    btnNewRound.hidden = true;
  } else {
    noteEl.textContent = '';
    btnPractice.hidden = true;
    btnNewRound.hidden = false;
  }
}

function renderGameView(round) {
  // Progress text
  const progressText = document.getElementById('progress-text');
  progressText.textContent = `Frage ${round.idx + 1} von ${round.ids.length}`;

  // Progress dots
  const dotsEl = document.getElementById('progress-dots');
  dotsEl.innerHTML = '';
  for (let i = 0; i < round.ids.length; i++) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    if (i < round.results.length) {
      dot.classList.add(round.results[i].ok ? 'correct' : 'wrong');
    } else if (i === round.idx) {
      dot.classList.add('current');
    }
    dotsEl.appendChild(dot);
  }

  // Current question data
  const currentId = round.ids[round.idx];
  const country = byId(currentId);
  const correctCapital = GEO[currentId]?.c;

  // Flag image
  const flagImg = document.getElementById('flag-img');
  flagImg.src = `../georaetsel/assets/flags/${currentId}.svg`;
  flagImg.alt = '';

  // Question text
  const questionEl = document.getElementById('question-text');
  questionEl.textContent = `Was ist die Hauptstadt von ${country ? country.name : currentId}?`;

  // Options
  const { options, answer: correctIndex } = optionsFor(round.seed, round.idx, currentId);
  const optionBtns = document.querySelectorAll('.option-btn');

  const statusEl = document.getElementById('status-msg');
  const revealedControls = document.getElementById('revealed-controls');
  const btnNext = document.getElementById('btn-next');

  if (round.state === 'asking') {
    optionBtns.forEach((btn, i) => {
      btn.textContent = options[i] || '';
      btn.disabled = false;
      btn.className = 'option-btn';
    });
    statusEl.textContent = '';
    statusEl.className = 'status-msg';
    revealedControls.hidden = true;
  } else if (round.state === 'revealed') {
    const res = round.results[round.idx];
    const pickedIndex = res ? res.pick : -1;

    optionBtns.forEach((btn, i) => {
      btn.textContent = options[i] || '';
      btn.disabled = true;
      if (i === correctIndex) {
        btn.className = 'option-btn correct';
      } else if (i === pickedIndex) {
        btn.className = 'option-btn wrong';
      } else {
        btn.className = 'option-btn';
      }
    });

    if (res && res.ok) {
      statusEl.textContent = 'Richtig!';
      statusEl.className = 'status-msg correct';
    } else {
      statusEl.textContent = `Leider falsch. Es ist ${correctCapital || options[correctIndex]}.`;
      statusEl.className = 'status-msg wrong';
    }

    revealedControls.hidden = false;
    btnNext.focus();
  }
}

function chooseOption(pickIndex) {
  const round = getActiveRound();
  if (!round || round.state !== 'asking') return;

  answer(round, pickIndex);
  saveIfDaily();
  render();
}

function handleNext() {
  const round = getActiveRound();
  if (!round || round.state !== 'revealed') return;

  next(round);
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

function init() {
  initPrivacy();

  document.getElementById('btn-next').addEventListener('click', handleNext);
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

  const optionBtns = document.querySelectorAll('.option-btn');
  optionBtns.forEach((btn, idx) => {
    btn.addEventListener('click', () => chooseOption(idx));
  });

  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const dlg = document.getElementById('privacy-dialog');
    if (dlg && dlg.open) return;

    const round = getActiveRound();
    if (!round) return;

    if (round.state === 'asking') {
      let pick = -1;
      if (e.key === '1') pick = 0;
      else if (e.key === '2') pick = 1;
      else if (e.key === '3') pick = 2;
      else if (e.key === '4') pick = 3;

      if (pick >= 0) {
        e.preventDefault();
        chooseOption(pick);
      }
    } else if (round.state === 'revealed') {
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handleNext();
      }
    }
  });

  setInterval(checkMidnight, 30000);

  setMode('daily');

  startClock({
    getRound: getActiveRound,
    isOver: r => r.state === 'done',
    save: saveIfDaily,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
