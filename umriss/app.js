import { byId, dailySeed, search } from '../georaetsel/game.js';
import { SHAPES } from '../data/world.js';
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
  MAX_GUESSES,
  newRound,
  guess,
  targetFor,
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
    writeStorage(`umriss.daily.${dailyRound.seed}`, dailyRound);
  }
}

function loadDaily() {
  currentDateSeed = dailySeed(new Date());
  const saved = readStorage(`umriss.daily.${currentDateSeed}`);
  if (saved && saved.seed === currentDateSeed) {
    dailyRound = saved;
  } else {
    dailyRound = newRound(currentDateSeed);
    saveIfDaily();
  }
}

function startPractice() {
  let randSeed = Math.floor(Math.random() * 2147483647);
  if (practiceRound && practiceRound.target) {
    for (let i = 0; i < 10 && targetFor(randSeed) === practiceRound.target; i++) {
      randSeed = Math.floor(Math.random() * 2147483647);
    }
  }
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
    if (!practiceRound || practiceRound.state !== 'playing') {
      startPractice();
    }
  }

  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  const searchResults = document.getElementById('search-results');
  if (searchResults) searchResults.innerHTML = '';

  render();

  const round = getActiveRound();
  if (round && round.state === 'playing' && searchInput) {
    searchInput.focus();
  }
}

function render() {
  const round = getActiveRound();
  reportRound('umriss', round, mode);
  if (!round) return;

  renderProgress(round);
  renderSilhouette(round.target);
  renderStatusAndReveal(round);
  renderControlsAndEnd(round);
  renderGuesses(round);
}

function renderProgress(round) {
  const progressText = document.getElementById('progress-text');
  const dotsEl = document.getElementById('progress-dots');

  if (round.state === 'playing') {
    progressText.textContent = `Versuch ${round.guesses.length + 1} von ${MAX_GUESSES}`;
  } else {
    progressText.textContent = `Versuch ${Math.min(round.guesses.length, MAX_GUESSES)} von ${MAX_GUESSES}`;
  }

  dotsEl.innerHTML = '';
  for (let i = 0; i < MAX_GUESSES; i++) {
    const dot = document.createElement('span');
    dot.className = 'dot';
    if (i < round.guesses.length) {
      const g = round.guesses[i];
      if (g.km === 0 || g.prox === 100) dot.classList.add('dot-correct');
      else if (g.prox >= 75) dot.classList.add('dot-high');
      else if (g.prox >= 50) dot.classList.add('dot-mid');
      else dot.classList.add('dot-low');
    } else if (i === round.guesses.length && round.state === 'playing') {
      dot.classList.add('current');
    }
    dotsEl.appendChild(dot);
  }
}

function renderSilhouette(countryId) {
  const stage = document.getElementById('silhouette-stage');
  const shape = SHAPES[countryId];
  if (!shape) {
    stage.innerHTML = '';
    return;
  }

  const [x0, y0, x1, y1] = shape.box;
  const w = x1 - x0;
  const h = y1 - y0;
  const maxDim = Math.max(w, h);
  const pad = Math.max(maxDim * 0.08, 3);
  const vx = x0 - pad;
  const vy = y0 - pad;
  const vw = w + 2 * pad;
  const vh = h + 2 * pad;

  let paths = `<path d="${shape.d}" fill="var(--huegel)"></path>`;
  if (shape.wrap) {
    paths += `<path d="${shape.d}" fill="var(--huegel)" transform="translate(${-1000 * shape.wrap})"></path>`;
  }

  stage.innerHTML = `<svg role="img" aria-label="Umriss eines Landes" width="100%" height="300px" viewBox="${vx} ${vy} ${vw} ${vh}" preserveAspectRatio="xMidYMid meet">${paths}</svg>`;
}

function renderStatusAndReveal(round) {
  const statusEl = document.getElementById('status-msg');
  const revealedCountry = document.getElementById('revealed-country');
  const revealedFlag = document.getElementById('revealed-flag');
  const revealedName = document.getElementById('revealed-name');
  const targetCountry = byId(round.target);

  if (round.state === 'playing') {
    statusEl.textContent = '';
    statusEl.className = 'status-msg';
    revealedCountry.hidden = true;
  } else if (round.state === 'won') {
    const n = round.guesses.length;
    statusEl.textContent = n === 1 ? 'Richtig in 1 Versuch!' : `Richtig in ${n} Versuchen!`;
    statusEl.className = 'status-msg correct';
    if (targetCountry) {
      revealedFlag.src = `../georaetsel/assets/flags/${targetCountry.id}.svg`;
      revealedFlag.alt = '';
      revealedName.textContent = targetCountry.name;
      revealedCountry.hidden = false;
    }
  } else if (round.state === 'lost') {
    statusEl.textContent = `Es war: ${targetCountry ? targetCountry.name : round.target}`;
    statusEl.className = 'status-msg lost';
    if (targetCountry) {
      revealedFlag.src = `../georaetsel/assets/flags/${targetCountry.id}.svg`;
      revealedFlag.alt = '';
      revealedName.textContent = targetCountry.name;
      revealedCountry.hidden = false;
    }
  }
}

function renderControlsAndEnd(round) {
  const playControls = document.getElementById('play-controls');
  const endView = document.getElementById('end-view');
  const searchResults = document.getElementById('search-results');

  if (round.state === 'playing') {
    playControls.hidden = false;
    endView.hidden = true;
  } else {
    playControls.hidden = true;
    endView.hidden = false;
    if (searchResults) searchResults.innerHTML = '';
    renderEndView(round);
  }
}

function renderEndView(round) {
  const scoreVal = document.getElementById('end-score-val');
  const gridEl = document.getElementById('end-grid-emojis');
  const noteEl = document.getElementById('end-note');
  const btnPractice = document.getElementById('btn-end-practice');
  const btnNewRound = document.getElementById('btn-end-new-round');

  scoreVal.textContent = round.state === 'won' ? round.guesses.length : 'X';

  const emojis = round.guesses.map(g => {
    if (g.km === 0 || g.prox === 100) return '🟩';
    if (g.prox >= 75) return '🟨';
    if (g.prox >= 50) return '🟧';
    return '🟥';
  }).join('');
  gridEl.textContent = emojis;

  if (mode === 'daily') {
    noteEl.textContent = 'Neues Land morgen.';
    btnPractice.hidden = false;
    btnNewRound.hidden = true;
  } else {
    noteEl.textContent = '';
    btnPractice.hidden = true;
    btnNewRound.hidden = false;
  }
}

function renderGuesses(round) {
  const guessesList = document.getElementById('guesses-list');
  guessesList.innerHTML = '';

  for (const g of round.guesses) {
    const country = byId(g.id);
    const row = document.createElement('div');
    row.className = 'guess-row';

    if (g.km === 0 || g.prox === 100) row.classList.add('row-correct');
    else if (g.prox >= 75) row.classList.add('row-high');
    else if (g.prox >= 50) row.classList.add('row-mid');
    else row.classList.add('row-low');

    const img = document.createElement('img');
    img.className = 'guess-flag';
    img.src = `../georaetsel/assets/flags/${g.id}.svg`;
    img.alt = '';
    img.width = 28;
    img.height = 21;

    const name = document.createElement('span');
    name.className = 'guess-name';
    name.textContent = country ? country.name : g.id;

    const dist = document.createElement('span');
    dist.className = 'guess-distance';
    dist.textContent = `${g.km.toLocaleString('de-DE')} km`;

    const dir = document.createElement('span');
    dir.className = 'guess-dir';
    dir.textContent = g.dir ?? '';

    const prox = document.createElement('span');
    prox.className = 'guess-prox';
    prox.textContent = `${g.prox} %`;

    row.appendChild(img);
    row.appendChild(name);
    row.appendChild(dist);
    row.appendChild(dir);
    row.appendChild(prox);
    guessesList.appendChild(row);
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
  if (!round || round.state !== 'playing') return;

  const res = guess(round, countryId);
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

  if (round.state === 'playing') {
    searchInput.focus();
  } else {
    const btnShare = document.getElementById('btn-share');
    if (btnShare) btnShare.focus();
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

  document.addEventListener('click', e => {
    if (!e.target.closest('#play-controls')) {
      const results = document.getElementById('search-results');
      if (results) results.innerHTML = '';
    }
  });

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
    isOver: r => r.state !== 'playing',
    save: saveIfDaily,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
