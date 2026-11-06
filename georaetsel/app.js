import {
  byId,
  categoryById,
  dailySeed,
  newGame,
  guess,
  score,
  tier,
  cellAnswers,
  bestBoard,
  shareText,
  search,
} from './game.js';

let mode = 'daily';
let practiceId = null;
let game = null;
let showingBest = false;
let activeCell = null;
let statsViewMode = 'daily';
let confirmingStatsDelete = false;
let currentDateSeed = dailySeed(new Date());

function readStorage(key, fallback = null) {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeStorage(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {}
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (e) {}
}

function getStats() {
  const def = {
    daily: { played: 0, total: 0, best: 0, dist: Array(10).fill(0), streak: 0, maxStreak: 0, lastSeed: null },
    practice: { played: 0, total: 0, best: 0, dist: Array(10).fill(0) },
  };
  const s = readStorage('georaetsel.stats', def);
  return {
    daily: { ...def.daily, ...(s?.daily || {}) },
    practice: { ...def.practice, ...(s?.practice || {}) },
  };
}

function getSession() {
  return readStorage('georaetsel.session', { rounds: 0, total: 0 }) || { rounds: 0, total: 0 };
}

function saveCurrentGame() {
  if (mode === 'daily') {
    writeStorage('georaetsel.daily', game);
  } else {
    writeStorage('georaetsel.practice', { ...game, id: practiceId });
  }
}

function createPracticeGame(id) {
  let curId = id;
  for (let attempt = 0; attempt < 25; attempt++) {
    try {
      const s = parseInt(curId, 36);
      const g = newGame(s);
      return { id: curId, game: g };
    } catch (e) {
      curId = Math.floor(Math.random() * (36 ** 6)).toString(36);
    }
  }
}

function loadDailyGame() {
  currentDateSeed = dailySeed(new Date());
  const saved = readStorage('georaetsel.daily');
  if (saved && saved.seed === currentDateSeed) {
    game = saved;
  } else {
    game = newGame(currentDateSeed);
    writeStorage('georaetsel.daily', game);
  }
}

function loadPracticeGame(id) {
  const saved = readStorage('georaetsel.practice');
  if (saved && saved.id === id) {
    game = saved;
  } else {
    const created = createPracticeGame(id);
    practiceId = created.id;
    game = created.game;
    writeStorage('georaetsel.practice', { ...game, id: practiceId });
  }
}

function recordGameEnd() {
  if (game.recorded) return;
  game.recorded = true;
  saveCurrentGame();

  const totalScore = score(game);
  const stats = getStats();
  const bucket = Math.min(8, Math.floor(totalScore / 100));

  if (mode === 'daily') {
    const d = stats.daily;
    d.played = (d.played || 0) + 1;
    d.total = (d.total || 0) + totalScore;
    d.best = Math.max(d.best || 0, totalScore);
    d.dist = Array.isArray(d.dist) && d.dist.length === 10 ? d.dist : Array(10).fill(0);
    d.dist[bucket] = (d.dist[bucket] || 0) + 1;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const ySeed = dailySeed(yesterday);
    if (d.lastSeed === ySeed) {
      d.streak = (d.streak || 0) + 1;
    } else {
      d.streak = 1;
    }
    d.maxStreak = Math.max(d.maxStreak || 0, d.streak);
    d.lastSeed = game.seed;
  } else {
    const p = stats.practice;
    p.played = (p.played || 0) + 1;
    p.total = (p.total || 0) + totalScore;
    p.best = Math.max(p.best || 0, totalScore);
    p.dist = Array.isArray(p.dist) && p.dist.length === 10 ? p.dist : Array(10).fill(0);
    p.dist[bucket] = (p.dist[bucket] || 0) + 1;

    const sess = getSession();
    sess.rounds = (sess.rounds || 0) + 1;
    sess.total = (sess.total || 0) + totalScore;
    writeStorage('georaetsel.session', sess);
  }
  writeStorage('georaetsel.stats', stats);
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  if (el.matches(':popover-open')) el.hidePopover();
  el.showPopover();
  el.classList.add('toast-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('toast-visible');
    if (el.matches(':popover-open')) el.hidePopover();
  }, 3000);
}

function getCountdownText() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
  const diff = Math.max(0, Math.floor((midnight - now) / 1000));
  const h = String(Math.floor(diff / 3600)).padStart(2, '0');
  const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
  const s = String(diff % 60).padStart(2, '0');
  return `Nächstes Rätsel in ${h}:${m}:${s}`;
}

function getCellCoord(cellIdx) {
  const r = Math.floor(cellIdx / 3);
  const c = cellIdx % 3;
  return String.fromCharCode(65 + r) + (c + 1);
}

function renderFilledCell(cellEl, data, coord, extraClass = '') {
  const country = byId(data.id);
  const t = tier(data.pts);
  cellEl.className = `cell cell--filled tier-${t}${extraClass ? ' ' + extraClass : ''}`;
  cellEl.disabled = true;
  cellEl.setAttribute('aria-disabled', 'true');
  cellEl.setAttribute('aria-label', `Feld ${coord}: ${country ? country.name : data.id}, ${data.pts} Punkte`);

  const top = document.createElement('div');
  top.className = 'cell-top';
  const flag = document.createElement('img');
  flag.className = 'cell-flag';
  flag.src = `assets/flags/${data.id}.svg`;
  flag.width = 28;
  flag.height = 21;
  flag.loading = 'lazy';
  flag.alt = '';
  const pts = document.createElement('span');
  pts.className = 'cell-points';
  pts.textContent = data.pts;
  top.appendChild(flag);
  top.appendChild(pts);

  const name = document.createElement('div');
  name.className = 'cell-name';
  name.textContent = country ? country.name : data.id;

  cellEl.appendChild(top);
  cellEl.appendChild(name);
}

function renderBoard() {
  for (let c = 0; c < 3; c++) {
    const el = document.getElementById(`col-h-${c}`);
    if (el) {
      const cat = categoryById(game.cols[c]);
      el.textContent = cat ? cat.label : '';
    }
  }
  for (let r = 0; r < 3; r++) {
    const el = document.getElementById(`row-h-${r}`);
    if (el) {
      const cat = categoryById(game.rows[r]);
      el.textContent = cat ? cat.label : '';
    }
  }

  const bestCaption = document.getElementById('best-caption');
  let best = null;
  if (showingBest) {
    best = bestBoard(game);
    bestCaption.textContent = best ? `Beste Lösung: ${best.total} Punkte` : '';
  } else {
    bestCaption.textContent = '';
  }

  for (let i = 0; i < 9; i++) {
    const cellEl = document.querySelector(`.map-sheet .cell[data-cell="${i}"]`);
    if (!cellEl) continue;
    cellEl.innerHTML = '';
    const coord = getCellCoord(i);
    const rowCat = categoryById(game.rows[Math.floor(i / 3)]);
    const colCat = categoryById(game.cols[i % 3]);
    const rowLabel = rowCat ? rowCat.label : '';
    const colLabel = colCat ? colCat.label : '';

    if (showingBest && best && best.picks[i]) {
      renderFilledCell(cellEl, best.picks[i], coord, 'cell--best');
    } else if (game.cells[i]) {
      renderFilledCell(cellEl, game.cells[i], coord);
    } else {
      cellEl.className = 'cell cell-empty';
      if (game.over) {
        cellEl.disabled = true;
        cellEl.setAttribute('aria-disabled', 'true');
        const answers = cellAnswers(game, i);
        const span = document.createElement('span');
        span.className = 'cell-possible';
        span.textContent = `${answers.length} möglich`;
        cellEl.appendChild(span);
        cellEl.setAttribute('aria-label', `Feld ${coord}: ${rowLabel} und ${colLabel}, ${answers.length} möglich`);
      } else {
        cellEl.disabled = false;
        cellEl.removeAttribute('aria-disabled');
        const span = document.createElement('span');
        span.className = 'cell-coord';
        span.textContent = coord;
        cellEl.appendChild(span);
        cellEl.setAttribute('aria-label', `Feld ${coord}: ${rowLabel} und ${colLabel}`);
      }
    }
  }

  const curScore = score(game);
  document.getElementById('score-val').textContent = curScore;

  const overActions = document.getElementById('over-actions');
  if (game.over) {
    overActions.hidden = false;
    document.getElementById('btn-next-side').hidden = mode !== 'practice';
    document.getElementById('btn-toggle-best').textContent = showingBest ? 'Meine Lösung' : 'Beste Lösung';
  } else {
    overActions.hidden = true;
  }
}

function renderScaleBar() {
  const barEl = document.getElementById('scale-bar');
  const capEl = document.getElementById('scale-caption');
  if (!barEl || !capEl) return;

  barEl.innerHTML = '';
  const left = game.guessesLeft;
  const isWarn = left <= 3;
  const capText = left === 1 ? 'Noch 1 Versuch' : `Noch ${left} Versuche`;

  capEl.textContent = capText;
  if (isWarn) {
    capEl.classList.add('scale-warn');
  } else {
    capEl.classList.remove('scale-warn');
  }
  barEl.setAttribute('aria-label', capText);

  for (let i = 0; i < 12; i++) {
    const seg = document.createElement('div');
    seg.className = 'scale-segment';
    if (i < left) {
      const borderCol = isWarn ? 'var(--warn)' : 'var(--ink)';
      seg.style.border = `1px solid ${borderCol}`;
      seg.style.backgroundColor = i % 2 === 0 ? (isWarn ? 'var(--warn)' : 'var(--ink)') : 'var(--page)';
    } else {
      seg.style.border = '1px solid var(--line)';
      seg.style.backgroundColor = 'transparent';
    }
    barEl.appendChild(seg);
  }
}

function openSearchDialog(cellIdx) {
  activeCell = cellIdx;
  const coord = getCellCoord(cellIdx);
  const rowCat = categoryById(game.rows[Math.floor(cellIdx / 3)]);
  const colCat = categoryById(game.cols[cellIdx % 3]);
  const rowLabel = rowCat ? rowCat.label : '';
  const colLabel = colCat ? colCat.label : '';

  document.getElementById('search-heading').textContent = `Feld ${coord}`;
  document.getElementById('search-subheading').textContent = `${rowLabel} und ${colLabel}`;

  const searchInput = document.getElementById('search-input');
  searchInput.value = '';
  handleSearchInput('');

  const dlg = document.getElementById('search-dialog');
  dlg.showModal();
  searchInput.focus();
}

function handleSearchInput(q) {
  const resultsEl = document.getElementById('search-results');
  const hintEl = document.getElementById('search-hint');
  resultsEl.innerHTML = '';

  const query = q.trim();
  if (!query) {
    hintEl.textContent = 'Tippe den Namen eines Landes.';
    hintEl.hidden = false;
    return;
  }

  const hits = search(query);
  if (hits.length === 0) {
    hintEl.textContent = 'Kein Land gefunden. Versuch einen anderen Namen.';
    hintEl.hidden = false;
    return;
  }

  hintEl.hidden = true;
  hits.forEach(({ country, via }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'result-btn';

    const flag = document.createElement('img');
    flag.className = 'result-flag';
    flag.src = `assets/flags/${country.id}.svg`;
    flag.width = 28;
    flag.height = 21;
    flag.loading = 'lazy';
    flag.alt = '';

    const info = document.createElement('span');
    info.className = 'result-info';

    const name = document.createElement('span');
    name.className = 'result-name';
    name.textContent = country.name;
    info.appendChild(name);

    if (via) {
      const viaSpan = document.createElement('span');
      viaSpan.className = 'result-via';
      viaSpan.textContent = `auch: ${via}`;
      info.appendChild(viaSpan);
    }

    const isUsed = game.cells.some(c => c?.id === country.id);
    const isWrongHere = game.wrong[activeCell].includes(country.id);

    if (isUsed) {
      btn.disabled = true;
      const note = document.createElement('span');
      note.className = 'result-disabled-reason';
      note.textContent = 'schon verwendet';
      info.appendChild(note);
    } else if (isWrongHere) {
      btn.disabled = true;
      const note = document.createElement('span');
      note.className = 'result-disabled-reason';
      note.textContent = 'hier schon falsch';
      info.appendChild(note);
    }

    btn.appendChild(flag);
    btn.appendChild(info);

    btn.addEventListener('click', () => {
      chooseCountry(country);
    });

    resultsEl.appendChild(btn);
  });
}

function chooseCountry(country) {
  const cellIdx = activeCell;
  const wasOver = game.over;
  const res = guess(game, cellIdx, country.id);

  document.getElementById('search-dialog').close();
  saveCurrentGame();
  renderBoard();
  renderScaleBar();

  const cellBtn = document.querySelector(`.map-sheet .cell[data-cell="${cellIdx}"]`);

  if (res.result === 'right') {
    showToast(`${country.name} passt: ${res.pts} Punkte.`);
    if (cellBtn) {
      cellBtn.classList.remove('cell-reveal');
      void cellBtn.offsetWidth;
      cellBtn.classList.add('cell-reveal');
    }
  } else if (res.result === 'wrong') {
    const leftText = game.guessesLeft === 1 ? 'Noch 1 Versuch.' : `Noch ${game.guessesLeft} Versuche.`;
    showToast(`${country.name} passt hier nicht. ${leftText}`);
    if (cellBtn) {
      cellBtn.classList.remove('cell-shake');
      void cellBtn.offsetWidth;
      cellBtn.classList.add('cell-shake');
      setTimeout(() => {
        cellBtn.classList.remove('cell-shake');
      }, 900);
    }
  }

  if (game.over && !wasOver) {
    recordGameEnd();
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500;
    setTimeout(() => {
      openEndDialog();
    }, delay);
  }
}

const rounds = n => n === 1 ? '1 Runde' : `${n} Runden`;

function openEndDialog() {
  const isFilled = game.cells.every(Boolean);
  document.getElementById('end-heading').textContent = isFilled ? 'Alle Felder gefüllt' : 'Keine Versuche mehr';
  document.getElementById('end-score-num').textContent = score(game);

  const filledCount = game.cells.filter(Boolean).length;
  const miniMap = document.getElementById('end-mini-map');
  miniMap.innerHTML = '';
  miniMap.setAttribute('aria-label', `${filledCount} von 9 Feldern gefüllt`);

  for (let i = 0; i < 9; i++) {
    const c = game.cells[i];
    const miniCell = document.createElement('div');
    miniCell.className = `mini-cell ${c ? `tier-${tier(c.pts)}` : 'cell-sea'}`;
    miniMap.appendChild(miniCell);
  }

  const best = bestBoard(game);
  const bestPts = best ? best.total : 0;
  document.getElementById('end-line').textContent = `${filledCount} von 9 Feldern. Bestmöglich waren ${bestPts} Punkte.`;

  const countdownEl = document.getElementById('end-countdown');
  const sessionEl = document.getElementById('end-session');
  const practiceBtn = document.getElementById('end-btn-practice');
  const nextBtn = document.getElementById('end-btn-next');
  const sessionEndBtn = document.getElementById('end-btn-session-end');

  if (mode === 'daily') {
    countdownEl.hidden = false;
    countdownEl.textContent = getCountdownText();
    sessionEl.hidden = true;
    practiceBtn.hidden = false;
    nextBtn.hidden = true;
    sessionEndBtn.hidden = true;
  } else {
    countdownEl.hidden = true;
    sessionEl.hidden = false;
    const sess = getSession();
    sessionEl.textContent = `Diese Sitzung: ${rounds(sess.rounds)}, ${sess.total} Punkte`;
    practiceBtn.hidden = true;
    nextBtn.hidden = false;
    sessionEndBtn.hidden = false;
  }

  document.getElementById('end-dialog').showModal();
}

function doShare() {
  const label = mode === 'daily'
    ? new Date().toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
    : 'Übung';
  const url = mode === 'daily'
    ? `${window.location.origin}${window.location.pathname}`
    : `${window.location.origin}${window.location.pathname}?uebung=${practiceId}`;
  const text = shareText(game, label, url);

  if (navigator.share && window.matchMedia('(pointer:coarse)').matches) {
    navigator.share({ text }).catch(e => {
      if (e.name !== 'AbortError') showToast('Kopieren nicht möglich.');
    });
  } else if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text)
      .then(() => showToast('Ergebnis kopiert.'))
      .catch(() => showToast('Kopieren nicht möglich.'));
  } else {
    showToast('Kopieren nicht möglich.');
  }
}

const BUCKET_LABELS = [
  '0–99', '100–199', '200–299', '300–399', '400–499',
  '500–599', '600–699', '700–799', '800–900',
];

function renderStatsDialog() {
  const stats = getStats();
  const data = statsViewMode === 'daily' ? stats.daily : stats.practice;
  const numbersEl = document.getElementById('stats-numbers');
  const distEl = document.getElementById('stats-dist-list');
  numbersEl.innerHTML = '';
  distEl.innerHTML = '';

  const tabDaily = document.getElementById('stats-tab-daily');
  const tabPractice = document.getElementById('stats-tab-practice');
  tabDaily.setAttribute('aria-selected', statsViewMode === 'daily');
  tabPractice.setAttribute('aria-selected', statsViewMode === 'practice');
  if (statsViewMode === 'daily') {
    tabDaily.setAttribute('aria-current', 'page');
    tabPractice.removeAttribute('aria-current');
  } else {
    tabPractice.setAttribute('aria-current', 'page');
    tabDaily.removeAttribute('aria-current');
  }

  const clearBtn = document.getElementById('btn-clear-stats');
  clearBtn.textContent = confirmingStatsDelete ? 'Wirklich löschen?' : 'Statistik löschen';

  if (!data || data.played === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'stats-empty-msg';
    emptyMsg.textContent = 'Noch keine Runde gespielt.';
    distEl.appendChild(emptyMsg);
    return;
  }

  const items = [
    { val: data.played, caption: 'Gespielt' },
    { val: Math.round(data.total / data.played), caption: 'Schnitt' },
    { val: data.best, caption: 'Bestwert' },
  ];
  if (statsViewMode === 'daily') {
    items.push({ val: data.streak || 0, caption: 'Serie' });
    items.push({ val: data.maxStreak || 0, caption: 'Beste Serie' });
  }

  items.forEach(({ val, caption }) => {
    const col = document.createElement('div');
    col.className = 'stat-item';
    const num = document.createElement('div');
    num.className = 'stat-val';
    num.textContent = val;
    const cap = document.createElement('div');
    cap.className = 'stat-caption';
    cap.textContent = caption;
    col.appendChild(num);
    col.appendChild(cap);
    numbersEl.appendChild(col);
  });

  const counts = Array(9).fill(0);
  for (let i = 0; i < 8; i++) {
    counts[i] = data.dist[i] || 0;
  }
  counts[8] = (data.dist[8] || 0) + (data.dist[9] || 0);

  const maxCount = Math.max(...counts, 1);

  BUCKET_LABELS.forEach((lbl, i) => {
    const count = counts[i];
    const row = document.createElement('div');
    row.className = 'dist-row';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'dist-label';
    labelSpan.textContent = lbl;

    const track = document.createElement('div');
    track.className = 'dist-bar-track';

    const bar = document.createElement('div');
    bar.className = 'dist-bar';
    const pct = count > 0 ? Math.max(4, Math.round((count / maxCount) * 100)) : 0;
    bar.style.width = `${pct}%`;
    track.appendChild(bar);

    const countSpan = document.createElement('span');
    countSpan.className = 'dist-count';
    countSpan.textContent = count;

    row.appendChild(labelSpan);
    row.appendChild(track);
    row.appendChild(countSpan);
    distEl.appendChild(row);
  });
}

function setMode(newMode) {
  if (mode === newMode) return;
  mode = newMode;
  showingBest = false;

  const tabDaily = document.getElementById('tab-daily');
  const tabPractice = document.getElementById('tab-practice');

  if (mode === 'daily') {
    tabDaily.setAttribute('aria-selected', 'true');
    tabDaily.setAttribute('aria-current', 'page');
    tabPractice.setAttribute('aria-selected', 'false');
    tabPractice.removeAttribute('aria-current');

    history.replaceState(null, '', window.location.pathname);
    loadDailyGame();
  } else {
    tabPractice.setAttribute('aria-selected', 'true');
    tabPractice.setAttribute('aria-current', 'page');
    tabDaily.setAttribute('aria-selected', 'false');
    tabDaily.removeAttribute('aria-current');

    if (!practiceId) {
      practiceId = readStorage('georaetsel.practice')?.id || Math.floor(Math.random() * (36 ** 6)).toString(36);
    }
    history.replaceState(null, '', `?uebung=${practiceId}`);
    loadPracticeGame(practiceId);
  }

  renderBoard();
  renderScaleBar();
}

function startNextPracticeRound() {
  const newId = Math.floor(Math.random() * (36 ** 6)).toString(36);
  practiceId = newId;
  history.replaceState(null, '', `?uebung=${practiceId}`);
  const created = createPracticeGame(practiceId);
  practiceId = created.id;
  game = created.game;
  writeStorage('georaetsel.practice', { ...game, id: practiceId });
  showingBest = false;
  document.getElementById('end-dialog').close();
  renderBoard();
  renderScaleBar();
}

function endPracticeSession() {
  const sess = getSession();
  showToast(`Sitzung beendet: ${rounds(sess.rounds)}, ${sess.total} Punkte.`);
  writeStorage('georaetsel.session', { rounds: 0, total: 0 });
  startNextPracticeRound();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  if (next === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', '#CFE6F2');
  } else {
    document.documentElement.removeAttribute('data-theme');
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', '#0B2C45');
  }
  try {
    localStorage.setItem('georaetsel.theme', next);
  } catch (e) {}
}

function updateDate() {
  const el = document.getElementById('header-date');
  if (el) {
    el.textContent = new Date().toLocaleDateString('de-DE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}

function handleTick() {
  const now = new Date();
  const newSeed = dailySeed(now);

  if (newSeed !== currentDateSeed) {
    currentDateSeed = newSeed;
    updateDate();
    if (mode === 'daily') {
      game = newGame(newSeed);
      saveCurrentGame();
      showingBest = false;
      renderBoard();
      renderScaleBar();
    }
  }

  const cdEl = document.getElementById('end-countdown');
  if (cdEl && !cdEl.hidden) {
    cdEl.textContent = getCountdownText();
  }
}

function init() {
  updateDate();
  setInterval(handleTick, 1000);

  const params = new URLSearchParams(window.location.search);
  const uebungParam = params.get('uebung');

  if (uebungParam !== null) {
    mode = 'practice';
    if (/^[0-9a-z]{1,8}$/.test(uebungParam)) {
      practiceId = uebungParam;
    } else {
      practiceId = Math.floor(Math.random() * (36 ** 6)).toString(36);
    }
    history.replaceState(null, '', `?uebung=${practiceId}`);
    loadPracticeGame(practiceId);

    const tabDaily = document.getElementById('tab-daily');
    const tabPractice = document.getElementById('tab-practice');
    tabDaily.setAttribute('aria-selected', 'false');
    tabDaily.removeAttribute('aria-current');
    tabPractice.setAttribute('aria-selected', 'true');
    tabPractice.setAttribute('aria-current', 'page');
  } else {
    loadDailyGame();
  }

  renderBoard();
  renderScaleBar();

  // Dialog backdrop close handlers
  const dialogs = [
    document.getElementById('search-dialog'),
    document.getElementById('end-dialog'),
    document.getElementById('stats-dialog'),
    document.getElementById('help-dialog'),
    document.getElementById('sources-dialog'),
    document.getElementById('privacy-dialog'),
  ];
  dialogs.forEach(dlg => {
    if (!dlg) return;
    dlg.addEventListener('click', e => {
      if (e.target === dlg) {
        const rect = dlg.getBoundingClientRect();
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        ) {
          dlg.close();
        }
      }
    });
  });

  // Cell clicks
  const mapSheet = document.getElementById('map-sheet');
  mapSheet.addEventListener('click', e => {
    const cellBtn = e.target.closest('.cell');
    if (!cellBtn) return;
    const idx = parseInt(cellBtn.getAttribute('data-cell'), 10);
    if (isNaN(idx)) return;
    if (game.over || showingBest) return;
    if (game.cells[idx]) return;
    openSearchDialog(idx);
  });

  // Search input events
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => {
    handleSearchInput(searchInput.value);
  });

  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const firstEnabled = document.querySelector('#search-results .result-btn:not(:disabled)');
      if (firstEnabled) firstEnabled.click();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const first = document.querySelector('#search-results .result-btn');
      if (first) first.focus();
    }
  });

  const searchResults = document.getElementById('search-results');
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

  document.getElementById('search-close').addEventListener('click', () => {
    document.getElementById('search-dialog').close();
  });
  document.getElementById('search-cancel').addEventListener('click', () => {
    document.getElementById('search-dialog').close();
  });

  // End dialog buttons
  document.getElementById('end-close').addEventListener('click', () => {
    document.getElementById('end-dialog').close();
  });
  document.getElementById('end-btn-share').addEventListener('click', doShare);
  document.getElementById('end-btn-best').addEventListener('click', () => {
    document.getElementById('end-dialog').close();
    showingBest = true;
    renderBoard();
    renderScaleBar();
  });
  document.getElementById('end-btn-practice').addEventListener('click', () => {
    document.getElementById('end-dialog').close();
    setMode('practice');
    if (game.over) startNextPracticeRound();
  });
  document.getElementById('end-btn-next').addEventListener('click', startNextPracticeRound);
  document.getElementById('end-btn-session-end').addEventListener('click', endPracticeSession);

  // Side column action buttons
  document.getElementById('btn-show-result').addEventListener('click', openEndDialog);
  document.getElementById('btn-toggle-best').addEventListener('click', () => {
    showingBest = !showingBest;
    renderBoard();
    renderScaleBar();
  });
  document.getElementById('btn-share-side').addEventListener('click', doShare);
  document.getElementById('btn-next-side').addEventListener('click', startNextPracticeRound);

  // Header buttons
  document.getElementById('btn-stats').addEventListener('click', () => {
    confirmingStatsDelete = false;
    renderStatsDialog();
    document.getElementById('stats-dialog').showModal();
  });
  document.getElementById('btn-help').addEventListener('click', () => {
    document.getElementById('help-dialog').showModal();
  });
  document.getElementById('btn-theme').addEventListener('click', toggleTheme);

  // Stats dialog
  document.getElementById('stats-close').addEventListener('click', () => {
    confirmingStatsDelete = false;
    document.getElementById('stats-dialog').close();
  });
  document.getElementById('stats-tab-daily').addEventListener('click', () => {
    statsViewMode = 'daily';
    confirmingStatsDelete = false;
    renderStatsDialog();
  });
  document.getElementById('stats-tab-practice').addEventListener('click', () => {
    statsViewMode = 'practice';
    confirmingStatsDelete = false;
    renderStatsDialog();
  });
  document.getElementById('btn-clear-stats').addEventListener('click', () => {
    const clearBtn = document.getElementById('btn-clear-stats');
    if (!confirmingStatsDelete) {
      confirmingStatsDelete = true;
      clearBtn.textContent = 'Wirklich löschen?';
    } else {
      removeStorage('georaetsel.stats');
      confirmingStatsDelete = false;
      renderStatsDialog();
    }
  });

  // Help, sources, privacy close buttons
  document.getElementById('help-close').addEventListener('click', () => {
    document.getElementById('help-dialog').close();
  });
  document.getElementById('btn-sources').addEventListener('click', () => {
    document.getElementById('sources-dialog').showModal();
  });
  document.getElementById('sources-close').addEventListener('click', () => {
    document.getElementById('sources-dialog').close();
  });
  document.getElementById('btn-privacy').addEventListener('click', () => {
    document.getElementById('privacy-dialog').showModal();
  });
  document.getElementById('privacy-close').addEventListener('click', () => {
    document.getElementById('privacy-dialog').close();
  });

  // Tabs
  document.getElementById('tab-daily').addEventListener('click', () => setMode('daily'));
  document.getElementById('tab-practice').addEventListener('click', () => setMode('practice'));
}

window.addEventListener('DOMContentLoaded', init);
