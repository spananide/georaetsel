import { byId, dailySeed, search } from '../georaetsel/game.js';
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
  newRound,
  hintsFor,
  submit,
  giveUp,
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
    writeStorage(`flaggen.daily.${dailyRound.seed}`, dailyRound);
  }
}

function loadDaily() {
  currentDateSeed = dailySeed(new Date());
  const saved = readStorage(`flaggen.daily.${currentDateSeed}`);
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

  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  const searchResults = document.getElementById('search-results');
  if (searchResults) searchResults.innerHTML = '';

  render();

  const round = getActiveRound();
  if (round && round.state === 'asking' && searchInput) {
    searchInput.focus();
  }
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

  const EMOJIS = { 3: '🟩', 2: '🟨', 1: '🟧', 0: '🟥' };
  const marks = round.results.map(r => EMOJIS[r.pts] ?? '🟥');
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
  // Progress
  const progressText = document.getElementById('progress-text');
  progressText.textContent = `Flagge ${round.idx + 1} von ${round.ids.length}`;

  const dotsEl = document.getElementById('progress-dots');
  dotsEl.innerHTML = '';
  for (let i = 0; i < round.ids.length; i++) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    if (i < round.results.length) {
      dot.classList.add(`pts-${round.results[i].pts}`);
    } else if (i === round.idx) {
      dot.classList.add('current');
    }
    dotsEl.appendChild(dot);
  }

  // Flag image
  const currentId = round.ids[round.idx];
  const flagImg = document.getElementById('flag-img');
  flagImg.src = `../georaetsel/assets/flags/${currentId}.svg`;

  // Hints
  const hintsEl = document.getElementById('hints-list');
  hintsEl.innerHTML = '';
  const hints = hintsFor(round);
  hints.forEach(h => {
    const item = document.createElement('div');
    item.className = 'hint-item';
    item.textContent = h;
    hintsEl.appendChild(item);
  });

  // Wrong guesses
  const wrongEl = document.getElementById('wrong-guesses');
  wrongEl.innerHTML = '';
  round.wrong.forEach(wId => {
    const c = byId(wId);
    const item = document.createElement('span');
    item.className = 'wrong-item';
    item.textContent = c ? c.name : wId;
    wrongEl.appendChild(item);
  });

  // Controls & Status
  const statusEl = document.getElementById('status-msg');
  const playControls = document.getElementById('play-controls');
  const revealedControls = document.getElementById('revealed-controls');
  const btnNext = document.getElementById('btn-next');
  const searchResults = document.getElementById('search-results');

  if (round.state === 'asking') {
    statusEl.textContent = '';
    statusEl.className = 'status-msg';
    playControls.hidden = false;
    revealedControls.hidden = true;
  } else if (round.state === 'revealed') {
    playControls.hidden = true;
    revealedControls.hidden = false;
    searchResults.innerHTML = '';

    const lastRes = round.results[round.results.length - 1];
    const country = byId(currentId);
    if (lastRes && lastRes.solved) {
      statusEl.textContent = `Richtig! +${lastRes.pts}`;
      statusEl.className = 'status-msg correct';
    } else {
      statusEl.textContent = `Es war: ${country ? country.name : currentId}`;
      statusEl.className = 'status-msg lost';
    }
    btnNext.focus();
  }
}

function handleSearch(q) {
  const searchResults = document.getElementById('search-results');
  searchResults.innerHTML = '';
  const trimmed = q.trim();
  if (!trimmed) return;

  const hits = search(trimmed);
  hits.forEach(hit => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'result-btn';
    btn.setAttribute('data-id', hit.country.id);
    btn.setAttribute('role', 'option');

    const img = document.createElement('img');
    img.className = 'result-flag';
    img.src = `../georaetsel/assets/flags/${hit.country.id}.svg`;
    img.alt = '';
    img.width = 28;
    img.height = 21;
    img.loading = 'lazy';

    const info = document.createElement('div');
    info.className = 'result-info';

    const name = document.createElement('span');
    name.className = 'result-name';
    name.textContent = hit.country.name;
    info.appendChild(name);

    if (hit.via) {
      const via = document.createElement('span');
      via.className = 'result-via';
      via.textContent = `(${hit.via})`;
      info.appendChild(via);
    }

    btn.appendChild(img);
    btn.appendChild(info);

    btn.addEventListener('click', () => chooseCountry(hit.country.id));
    searchResults.appendChild(btn);
  });
}

function chooseCountry(countryId) {
  const round = getActiveRound();
  if (!round || round.state !== 'asking') return;

  const res = submit(round, countryId);
  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');

  if (res.result === 'repeat') {
    showToast('Schon probiert.');
    searchInput.value = '';
    searchResults.innerHTML = '';
    searchInput.focus();
    return;
  }

  saveIfDaily();
  searchInput.value = '';
  searchResults.innerHTML = '';
  render();

  if (res.result === 'wrong') {
    searchInput.focus();
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

function handleGiveUp() {
  const round = getActiveRound();
  if (!round || round.state !== 'asking') return;

  giveUp(round);
  saveIfDaily();

  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');
  searchInput.value = '';
  searchResults.innerHTML = '';
  render();
}

function handleNext() {
  const round = getActiveRound();
  if (!round || round.state !== 'revealed') return;

  next(round);
  saveIfDaily();
  render();

  if (round.state === 'asking') {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
  }
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

  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');

  searchInput.addEventListener('input', () => {
    handleSearch(searchInput.value);
  });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const first = searchResults.querySelector('.result-btn');
      if (first) first.click();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const first = searchResults.querySelector('.result-btn');
      if (first) first.focus();
    }
  });

  searchResults.addEventListener('keydown', e => {
    const btns = Array.from(searchResults.querySelectorAll('.result-btn'));
    const idx = btns.indexOf(document.activeElement);
    if (idx < 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (idx + 1 < btns.length) btns[idx + 1].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx === 0) {
        searchInput.focus();
      } else {
        btns[idx - 1].focus();
      }
    }
  });

  document.getElementById('btn-giveup').addEventListener('click', handleGiveUp);
  document.getElementById('btn-next').addEventListener('click', handleNext);
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  document.getElementById('btn-share').addEventListener('click', doShare);

  document.getElementById('tab-daily').addEventListener('click', () => setMode('daily'));
  document.getElementById('tab-practice').addEventListener('click', () => setMode('practice'));

  document.getElementById('btn-end-practice').addEventListener('click', () => {
    setMode('practice');
    startPractice();
    render();
    const input = document.getElementById('search-input');
    if (input) input.focus();
  });

  document.getElementById('btn-end-new-round').addEventListener('click', () => {
    startPractice();
    render();
    const input = document.getElementById('search-input');
    if (input) input.focus();
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
