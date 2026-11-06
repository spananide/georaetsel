import { byId, dailySeed, search } from '../georaetsel/game.js';
import {
  readStorage,
  writeStorage,
  showToast,
  shareText as copyOrShare,
  initPrivacy,
} from '../common.js';
import { SHAPES } from '../data/world.js';
import {
  newRound,
  guess,
  giveUp,
  heat,
  sortedGuesses,
  shareText as formatShareText,
} from './logic.js';

let mode = 'daily';
let dailyRound = null;
let practiceRound = null;
let currentDateSeed = dailySeed(new Date());
let lastGuessedId = null;

// Zoom & Pan state
const ZOOM_LEVELS = [1, 2, 4, 8];
let zoomIndex = 0;
let currentX = 0;
let currentY = 0;
let currentW = 1000;
let currentH = 487;
let isDragging = false;
let pointerStartX = 0;
let pointerStartY = 0;
let dragStartX = 0;
let dragStartY = 0;

function getActiveRound() {
  return mode === 'daily' ? dailyRound : practiceRound;
}

function saveIfDaily() {
  if (mode === 'daily' && dailyRound) {
    writeStorage(`heisskalt.daily.${dailyRound.seed}`, dailyRound);
  }
}

function loadDaily() {
  currentDateSeed = dailySeed(new Date());
  const saved = readStorage(`heisskalt.daily.${currentDateSeed}`);
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
  lastGuessedId = null;
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

function applyViewBox() {
  const svg = document.getElementById('world-map');
  if (!svg) return;
  svg.setAttribute(
    'viewBox',
    `${currentX.toFixed(2)} ${currentY.toFixed(2)} ${currentW.toFixed(2)} ${currentH.toFixed(2)}`
  );
  if (ZOOM_LEVELS[zoomIndex] > 1) {
    svg.classList.add('is-draggable');
  } else {
    svg.classList.remove('is-draggable');
  }
}

function setZoom(nextIndex) {
  if (nextIndex < 0 || nextIndex >= ZOOM_LEVELS.length) return;
  const oldW = currentW;
  const oldH = currentH;
  const cx = currentX + oldW / 2;
  const cy = currentY + oldH / 2;

  zoomIndex = nextIndex;
  const zoom = ZOOM_LEVELS[zoomIndex];
  currentW = 1000 / zoom;
  currentH = 487 / zoom;

  let newX = cx - currentW / 2;
  let newY = cy - currentH / 2;

  newX = Math.max(0, Math.min(1000 - currentW, newX));
  newY = Math.max(0, Math.min(487 - currentH, newY));

  currentX = newX;
  currentY = newY;
  applyViewBox();
}

function resetZoom() {
  zoomIndex = 0;
  currentX = 0;
  currentY = 0;
  currentW = 1000;
  currentH = 487;
  applyViewBox();
}

function initZoomPan() {
  const svg = document.getElementById('world-map');
  const btnIn = document.getElementById('btn-zoom-in');
  const btnOut = document.getElementById('btn-zoom-out');
  const btnReset = document.getElementById('btn-zoom-reset');

  if (btnIn) btnIn.addEventListener('click', () => setZoom(zoomIndex + 1));
  if (btnOut) btnOut.addEventListener('click', () => setZoom(zoomIndex - 1));
  if (btnReset) btnReset.addEventListener('click', resetZoom);

  if (!svg) return;

  svg.addEventListener('pointerdown', e => {
    if (ZOOM_LEVELS[zoomIndex] <= 1) return;
    if (e.button !== 0) return;
    isDragging = true;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    dragStartX = currentX;
    dragStartY = currentY;
    svg.classList.add('is-dragging');
    try {
      svg.setPointerCapture(e.pointerId);
    } catch (_) {}
  });

  svg.addEventListener('pointermove', e => {
    if (!isDragging) return;
    const rect = svg.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dxPixels = e.clientX - pointerStartX;
    const dyPixels = e.clientY - pointerStartY;

    const dxSvg = dxPixels * (currentW / rect.width);
    const dySvg = dyPixels * (currentH / rect.height);

    let newX = dragStartX - dxSvg;
    let newY = dragStartY - dySvg;

    newX = Math.max(0, Math.min(1000 - currentW, newX));
    newY = Math.max(0, Math.min(487 - currentH, newY));

    currentX = newX;
    currentY = newY;
    applyViewBox();
  });

  const stopDrag = e => {
    if (!isDragging) return;
    isDragging = false;
    svg.classList.remove('is-dragging');
    try {
      if (e.pointerId != null) {
        svg.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}
  };

  svg.addEventListener('pointerup', stopDrag);
  svg.addEventListener('pointercancel', stopDrag);

  svg.addEventListener(
    'wheel',
    e => {
      e.preventDefault();
      if (e.deltaY < 0) {
        setZoom(zoomIndex + 1);
      } else if (e.deltaY > 0) {
        setZoom(zoomIndex - 1);
      }
    },
    { passive: false }
  );
}

function initMap() {
  const svg = document.getElementById('world-map');
  if (!svg) return;
  svg.innerHTML = '';
  const frag = document.createDocumentFragment();

  for (const [id, shape] of Object.entries(SHAPES)) {
    if (!shape.d) continue;

    const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p1.setAttribute('data-id', id);
    p1.setAttribute('d', shape.d);
    p1.setAttribute('class', 'map-country');
    frag.appendChild(p1);

    if (shape.wrap) {
      const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p2.setAttribute('data-id', id);
      p2.setAttribute('d', shape.d);
      p2.setAttribute('class', 'map-country');
      p2.setAttribute('transform', `translate(${-1000 * shape.wrap})`);
      frag.appendChild(p2);
    }
  }

  svg.appendChild(frag);
  applyViewBox();
}

function renderMap(round) {
  const svg = document.getElementById('world-map');
  if (!svg || !round) return;

  const paths = svg.querySelectorAll('.map-country');
  paths.forEach(p => {
    p.removeAttribute('style');
    p.classList.remove('is-guessed', 'is-target');
  });

  for (const g of round.guesses) {
    const isTarget = g.id === round.target;
    const countryPaths = svg.querySelectorAll(`path[data-id="${g.id}"]`);
    countryPaths.forEach(p => {
      p.classList.add('is-guessed');
      if (isTarget) {
        p.classList.add('is-target');
        p.style.fill = 'var(--huegel)';
      } else {
        p.style.fill = heat(g.km).color;
      }
    });
  }

  if (round.state === 'gave-up') {
    const targetPaths = svg.querySelectorAll(`path[data-id="${round.target}"]`);
    targetPaths.forEach(p => {
      p.classList.add('is-guessed', 'is-target');
      p.style.fill = 'var(--huegel)';
    });
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

  lastGuessedId = countryId;
  saveIfDaily();

  if (searchInput) searchInput.value = '';
  if (searchResults) searchResults.innerHTML = '';

  render();

  if (res.result === 'wrong' && searchInput) {
    searchInput.focus();
  }
}

function handleHint() {
  const round = getActiveRound();
  if (!round || round.state !== 'playing' || round.hint) return;
  round.hint = true;
  saveIfDaily();
  render();
}

function handleGiveUp() {
  const round = getActiveRound();
  if (!round || round.state !== 'playing') return;
  giveUp(round);
  render();
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
  copyOrShare(text);
}

function renderGuessList(round) {
  const listEl = document.getElementById('guesses-list');
  const countEl = document.getElementById('guesses-count');
  if (!listEl) return;

  listEl.innerHTML = '';
  if (countEl) {
    countEl.textContent =
      round.guesses.length > 0 ? `${round.guesses.length}` : '';
  }

  const sorted = sortedGuesses(round);
  const frag = document.createDocumentFragment();

  for (const g of sorted) {
    const country = byId(g.id);
    const h = heat(g.km);
    const isTargetWon = g.id === round.target && round.state === 'won';

    const row = document.createElement('div');
    row.className = 'guess-row';
    if (g.id === lastGuessedId) {
      row.classList.add('just-added');
    }

    const swatch = document.createElement('span');
    swatch.className = 'guess-swatch';
    swatch.style.backgroundColor = isTargetWon ? 'var(--huegel)' : h.color;
    row.appendChild(swatch);

    const flag = document.createElement('img');
    flag.className = 'guess-flag';
    flag.src = `../georaetsel/assets/flags/${g.id}.svg`;
    flag.alt = '';
    flag.width = 28;
    flag.height = 21;
    flag.loading = 'lazy';
    row.appendChild(flag);

    const name = document.createElement('span');
    name.className = 'guess-name';
    name.textContent = country ? country.name : g.id;
    row.appendChild(name);

    const metrics = document.createElement('div');
    metrics.className = 'guess-metrics';

    const dist = document.createElement('span');
    dist.className = 'guess-dist';
    dist.textContent = `${g.km.toLocaleString('de-DE')} km`;
    metrics.appendChild(dist);

    const label = document.createElement('span');
    label.className = 'guess-label';
    label.textContent = h.label;
    metrics.appendChild(label);

    row.appendChild(metrics);
    frag.appendChild(row);
  }

  listEl.appendChild(frag);

  if (lastGuessedId) {
    setTimeout(() => {
      const el = listEl.querySelector('.guess-row.just-added');
      if (el) el.classList.remove('just-added');
      lastGuessedId = null;
    }, 1200);
  }
}

function render() {
  const round = getActiveRound();
  if (!round) return;

  renderMap(round);

  const statusEl = document.getElementById('status-msg');
  const playControls = document.getElementById('play-controls');
  const btnGiveup = document.getElementById('btn-giveup');
  const btnHint = document.getElementById('btn-hint');
  const hintText = document.getElementById('hint-text');
  const targetReveal = document.getElementById('target-reveal');
  const targetFlag = document.getElementById('target-flag');
  const targetName = document.getElementById('target-name');
  const endView = document.getElementById('end-view');
  const endScoreVal = document.getElementById('end-score-val');
  const endEmojis = document.getElementById('end-emojis');
  const endNote = document.getElementById('end-note');
  const btnShare = document.getElementById('btn-share');
  const btnDailyPractice = document.getElementById('btn-daily-practice');
  const btnPracticeNew = document.getElementById('btn-practice-new');

  const targetCountry = byId(round.target);

  // Status line (aria-live="polite")
  if (round.state === 'won') {
    statusEl.textContent = `Gefunden in ${round.guesses.length} Versuchen!`;
    statusEl.className = 'status-msg correct';
  } else if (round.state === 'gave-up') {
    statusEl.textContent = `Es war: ${targetCountry ? targetCountry.name : round.target}`;
    statusEl.className = 'status-msg lost';
  } else {
    statusEl.className = 'status-msg';
    if (round.guesses.length > 0) {
      const last = round.guesses[round.guesses.length - 1];
      const c = byId(last.id);
      const h = heat(last.km);
      statusEl.textContent = `${c ? c.name : last.id}: ${last.km.toLocaleString('de-DE')} km, ${h.label}`;
    } else {
      statusEl.textContent = '';
    }
  }

  // Play controls & Hint
  if (round.state === 'playing') {
    playControls.hidden = false;
    btnGiveup.hidden = mode !== 'practice';

    if (round.hint) {
      btnHint.hidden = true;
      hintText.hidden = false;
      hintText.textContent = `Das gesuchte Land liegt in ${targetCountry ? targetCountry.continent : ''}.`;
    } else {
      btnHint.hidden = false;
      hintText.hidden = true;
      hintText.textContent = '';
    }
  } else {
    playControls.hidden = true;
  }

  // Target reveal (name & flag)
  if (round.state === 'won' || round.state === 'gave-up') {
    targetReveal.hidden = false;
    if (targetCountry) {
      targetFlag.src = `../georaetsel/assets/flags/${targetCountry.id}.svg`;
      targetFlag.alt = `Flagge von ${targetCountry.name}`;
      targetName.textContent = targetCountry.name;
    }
  } else {
    targetReveal.hidden = true;
  }

  // End panel
  if (round.state === 'won') {
    endView.hidden = false;
    const n = round.guesses.length;
    endScoreVal.textContent = `${n} Versuche${round.hint ? ', mit Tipp' : ''}`;

    const emojis = round.guesses.map(g => heat(g.km).emoji);
    const rows = [];
    for (let i = 0; i < emojis.length; i += 8) {
      rows.push(emojis.slice(i, i + 8).join(''));
    }
    endEmojis.textContent = rows.join('\n');
    endEmojis.hidden = false;

    btnShare.hidden = false;

    if (mode === 'daily') {
      endNote.textContent = 'Neues Land morgen.';
      endNote.hidden = false;
      btnDailyPractice.hidden = false;
      btnPracticeNew.hidden = true;
    } else {
      endNote.hidden = true;
      btnDailyPractice.hidden = true;
      btnPracticeNew.hidden = false;
    }
  } else if (round.state === 'gave-up') {
    endView.hidden = false;
    endScoreVal.textContent = '';
    endEmojis.hidden = true;
    endNote.hidden = true;
    btnShare.hidden = true;
    btnDailyPractice.hidden = true;
    btnPracticeNew.hidden = false;
  } else {
    endView.hidden = true;
  }

  renderGuessList(round);
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
  initZoomPan();
  initMap();

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
        if (first) first.click();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const first = searchResults ? searchResults.querySelector('.result-btn') : null;
        if (first) first.focus();
      }
    });
  }

  if (searchResults) {
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
          if (searchInput) searchInput.focus();
        } else {
          btns[idx - 1].focus();
        }
      }
    });
  }

  document.addEventListener('click', e => {
    if (
      searchResults &&
      !searchResults.contains(e.target) &&
      e.target !== searchInput
    ) {
      searchResults.innerHTML = '';
    }
  });

  const btnGiveup = document.getElementById('btn-giveup');
  if (btnGiveup) btnGiveup.addEventListener('click', handleGiveUp);

  const btnHint = document.getElementById('btn-hint');
  if (btnHint) btnHint.addEventListener('click', handleHint);

  const btnTheme = document.getElementById('btn-theme');
  if (btnTheme) btnTheme.addEventListener('click', toggleTheme);

  const btnShare = document.getElementById('btn-share');
  if (btnShare) btnShare.addEventListener('click', doShare);

  const tabDaily = document.getElementById('tab-daily');
  if (tabDaily) tabDaily.addEventListener('click', () => setMode('daily'));

  const tabPractice = document.getElementById('tab-practice');
  if (tabPractice) tabPractice.addEventListener('click', () => setMode('practice'));

  const btnDailyPractice = document.getElementById('btn-daily-practice');
  if (btnDailyPractice) {
    btnDailyPractice.addEventListener('click', () => {
      setMode('practice');
      startPractice();
      render();
      if (searchInput) searchInput.focus();
    });
  }

  const btnPracticeNew = document.getElementById('btn-practice-new');
  if (btnPracticeNew) {
    btnPracticeNew.addEventListener('click', () => {
      startPractice();
      render();
      if (searchInput) searchInput.focus();
    });
  }

  setInterval(checkMidnight, 30000);

  setMode('daily');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
