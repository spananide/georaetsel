import { byId, dailySeed, search } from '../georaetsel/game.js';
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
import { SHAPES } from '../data/world.js';
import {
  newRound,
  routeInfo,
  guess,
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
    writeStorage(`laenderkette.daily.${dailyRound.seed}`, dailyRound);
  }
}

function loadDaily() {
  currentDateSeed = dailySeed(new Date());
  const saved = readStorage(`laenderkette.daily.${currentDateSeed}`);
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
  const current =
    document.documentElement.getAttribute('data-theme') === 'light'
      ? 'light'
      : 'dark';
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

function initMap() {
  const svg = document.getElementById('map-svg');
  if (!svg) return;
  svg.innerHTML = '';
  const frag = document.createDocumentFragment();

  for (const [id, shape] of Object.entries(SHAPES)) {
    if (!shape.d) continue;

    const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p1.setAttribute('d', shape.d);
    p1.setAttribute('data-id', id);
    p1.setAttribute('class', 'map-country');
    frag.appendChild(p1);

    if (shape.wrap) {
      const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p2.setAttribute('d', shape.d);
      p2.setAttribute('data-id', id);
      p2.setAttribute('class', 'map-country');
      p2.setAttribute('transform', `translate(${-1000 * shape.wrap})`);
      frag.appendChild(p2);
    }
  }

  svg.appendChild(frag);
}

function renderMap(round) {
  const svg = document.getElementById('map-svg');
  if (!svg) return;

  const paths = svg.querySelectorAll('.map-country');
  paths.forEach(p => {
    p.className.baseVal = 'map-country';
  });

  const endpoints = [round.start, round.target];
  endpoints.forEach(id => {
    svg.querySelectorAll(`path[data-id="${id}"]`).forEach(p => {
      p.classList.add('map-endpoint');
    });
  });

  const rightGuesses = round.guesses.filter(g => g.ok);
  rightGuesses.forEach(g => {
    svg.querySelectorAll(`path[data-id="${g.id}"]`).forEach(p => {
      p.classList.add('map-right');
    });
  });

  const wrongGuesses = round.guesses.filter(g => !g.ok);
  wrongGuesses.forEach(g => {
    svg.querySelectorAll(`path[data-id="${g.id}"]`).forEach(p => {
      p.classList.add('map-wrong');
    });
  });

  if (round.state !== 'playing') {
    const info = routeInfo(round.start, round.target);
    if (info) {
      const rightSet = new Set(rightGuesses.map(g => g.id));
      const missed = info.route.filter(
        id => id !== round.start && id !== round.target && !rightSet.has(id)
      );
      missed.forEach(id => {
        svg.querySelectorAll(`path[data-id="${id}"]`).forEach(p => {
          p.classList.add('map-missed');
        });
      });
    }
  }

  const boxIds = [round.start, round.target, ...round.guesses.map(g => g.id)];
  if (round.state !== 'playing') {
    const info = routeInfo(round.start, round.target);
    if (info) boxIds.push(...info.route);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of boxIds) {
    const box = SHAPES[id]?.box;
    if (!box) continue;
    minX = Math.min(minX, box[0]);
    minY = Math.min(minY, box[1]);
    maxX = Math.max(maxX, box[2]);
    maxY = Math.max(maxY, box[3]);
  }

  if (isFinite(minX)) {
    const w = maxX - minX;
    const h = maxY - minY;
    const padX = w * 0.25;
    const padY = h * 0.25;
    const wPadded = Math.max(120, w + 2 * padX);
    const hPadded = Math.max(60, h + 2 * padY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const vx = cx - wPadded / 2;
    const vy = cy - hPadded / 2;
    svg.setAttribute(
      'viewBox',
      `${vx.toFixed(2)} ${vy.toFixed(2)} ${wPadded.toFixed(2)} ${hPadded.toFixed(2)}`
    );
  }
}

function handleSearch(q) {
  const searchResults = document.getElementById('search-results');
  if (!searchResults) return;
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

  if (res.result === 'fixed') {
    showToast('Das ist schon vorgegeben.');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    if (searchResults) searchResults.innerHTML = '';
    return;
  }

  if (res.result === 'repeat') {
    showToast('Schon probiert.');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    if (searchResults) searchResults.innerHTML = '';
    return;
  }

  if (res.result === 'ignored') {
    return;
  }

  saveIfDaily();
  if (searchInput) searchInput.value = '';
  if (searchResults) searchResults.innerHTML = '';
  render();

  if (round.state === 'playing' && searchInput) {
    searchInput.focus();
  }
}

function doShare() {
  const round = getActiveRound();
  if (!round) return;

  const label =
    mode === 'daily'
      ? new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
      : 'Übung';
  const url = `${window.location.origin}${window.location.pathname}`;
  const text = formatShareText(round, label, url);
  copyOrShare(withTime(text, round.ms));
}

function render() {
  const round = getActiveRound();
  reportRound('laenderkette', round, mode);
  if (!round) return;

  const startCountry = byId(round.start);
  const targetCountry = byId(round.target);

  const startFlag = document.getElementById('start-flag');
  const startName = document.getElementById('start-name');
  const targetFlag = document.getElementById('target-flag');
  const targetName = document.getElementById('target-name');

  if (startFlag) startFlag.src = `../georaetsel/assets/flags/${round.start}.svg`;
  if (startName) startName.textContent = startCountry ? startCountry.name : round.start;
  if (targetFlag) targetFlag.src = `../georaetsel/assets/flags/${round.target}.svg`;
  if (targetName) targetName.textContent = targetCountry ? targetCountry.name : round.target;

  const attemptsText = document.getElementById('attempts-text');
  const attemptsDots = document.getElementById('attempts-dots');
  const left = round.max - round.guesses.length;

  if (attemptsText) {
    if (round.state === 'playing') {
      attemptsText.textContent = left === 1 ? 'Noch 1 Versuch' : `Noch ${left} Versuche`;
    } else if (round.state === 'won') {
      attemptsText.textContent = `Geschafft in ${round.guesses.length} von ${round.max} Versuchen!`;
    } else {
      attemptsText.textContent = 'Keine Versuche mehr';
    }
  }

  if (attemptsDots) {
    attemptsDots.innerHTML = '';
    for (let i = 0; i < round.max; i++) {
      const dot = document.createElement('div');
      dot.className = 'dot';
      if (i < round.guesses.length) {
        dot.classList.add(round.guesses[i].ok ? 'dot-right' : 'dot-wrong');
      } else if (i === round.guesses.length && round.state === 'playing') {
        dot.classList.add('dot-current');
      }
      attemptsDots.appendChild(dot);
    }
  }

  renderMap(round);

  const guessesList = document.getElementById('guesses-list');
  if (guessesList) {
    guessesList.innerHTML = '';
    round.guesses.forEach(g => {
      const item = document.createElement('div');
      item.className = `guess-item ${g.ok ? 'guess-right' : 'guess-wrong'}`;

      const img = document.createElement('img');
      img.className = 'guess-flag';
      img.src = `../georaetsel/assets/flags/${g.id}.svg`;
      img.alt = '';
      img.width = 28;
      img.height = 21;
      img.loading = 'lazy';

      const info = document.createElement('div');
      info.className = 'guess-info';

      const name = document.createElement('span');
      name.className = 'guess-name';
      const c = byId(g.id);
      name.textContent = c ? c.name : g.id;

      const status = document.createElement('span');
      status.className = 'guess-status';
      if (g.ok) {
        status.textContent = '✓ auf dem Weg';
      } else {
        if (g.away === null) {
          status.textContent = '✗ ohne Landweg';
        } else if (g.away === 1) {
          status.textContent = '✗ 1 Grenze vom Weg entfernt';
        } else {
          status.textContent = `✗ ${g.away} Grenzen vom Weg entfernt`;
        }
      }

      info.appendChild(name);
      info.appendChild(status);

      item.appendChild(img);
      item.appendChild(info);
      guessesList.appendChild(item);
    });
  }

  const playControls = document.getElementById('play-controls');
  const endView = document.getElementById('end-view');

  if (round.state === 'playing') {
    if (playControls) playControls.hidden = false;
    if (endView) endView.hidden = true;
  } else {
    if (playControls) playControls.hidden = true;
    if (endView) endView.hidden = false;

    const endTitle = document.getElementById('end-title');
    if (endTitle) {
      if (round.state === 'won') {
        endTitle.textContent = `Geschafft in ${round.guesses.length} von ${round.max} Versuchen!`;
        endTitle.className = 'end-title end-title-won';
      } else {
        endTitle.textContent = 'Leider nicht geschafft.';
        endTitle.className = 'end-title end-title-lost';
      }
    }

    const endRoute = document.getElementById('end-route');
    if (endRoute) {
      const info = routeInfo(round.start, round.target);
      const routeNames = info ? info.route.map(id => byId(id)?.name || id) : [];
      endRoute.textContent = `Ein möglicher Weg: ${routeNames.join(' → ')}`;
    }

    const endEmojis = document.getElementById('end-emojis');
    if (endEmojis) {
      endEmojis.textContent = round.guesses.map(g => (g.ok ? '🟩' : '🟥')).join('');
    }

    const endNote = document.getElementById('end-note');
    const btnEndPractice = document.getElementById('btn-end-practice');
    const btnEndNewRound = document.getElementById('btn-end-new-round');

    if (mode === 'daily') {
      if (endNote) endNote.textContent = 'Neue Runde morgen.';
      if (btnEndPractice) btnEndPractice.hidden = false;
      if (btnEndNewRound) btnEndNewRound.hidden = true;
    } else {
      if (endNote) endNote.textContent = '';
      if (btnEndPractice) btnEndPractice.hidden = true;
      if (btnEndNewRound) btnEndNewRound.hidden = false;
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
  initMap();

  const btnTheme = document.getElementById('btn-theme');
  if (btnTheme) btnTheme.addEventListener('click', toggleTheme);

  const tabDaily = document.getElementById('tab-daily');
  const tabPractice = document.getElementById('tab-practice');
  if (tabDaily) tabDaily.addEventListener('click', () => setMode('daily'));
  if (tabPractice) tabPractice.addEventListener('click', () => setMode('practice'));

  const searchInput = document.getElementById('search-input');
  const searchResults = document.getElementById('search-results');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      handleSearch(searchInput.value);
    });

    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = searchResults ? searchResults.querySelector('.result-btn') : null;
        if (first) {
          const id = first.getAttribute('data-id');
          chooseCountry(id);
        }
      }
    });
  }

  document.addEventListener('click', e => {
    if (!e.target.closest('#play-controls')) {
      if (searchResults) searchResults.innerHTML = '';
    }
  });

  const btnShare = document.getElementById('btn-share');
  if (btnShare) btnShare.addEventListener('click', doShare);

  const btnEndPractice = document.getElementById('btn-end-practice');
  if (btnEndPractice) {
    btnEndPractice.addEventListener('click', () => setMode('practice'));
  }

  const btnEndNewRound = document.getElementById('btn-end-new-round');
  if (btnEndNewRound) {
    btnEndNewRound.addEventListener('click', () => {
      startPractice();
      render();
      if (searchInput) searchInput.focus();
    });
  }

  window.addEventListener('focus', checkMidnight);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkMidnight();
  });
  setInterval(checkMidnight, 60000);

  loadDaily();
  render();

  if (dailyRound && dailyRound.state === 'playing' && searchInput) {
    searchInput.focus();
  }

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
