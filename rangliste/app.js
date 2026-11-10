import {
  API,
  GAME_INFO,
  dayOf,
  getName,
  setName,
  reportRound,
  flushQueue,
  readStorage,
  fmtTime,
  initPrivacy,
} from '../common.js';

function cleanName(s) {
  if (typeof s !== 'string') return null;
  const cleaned = s.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2 || cleaned.length > 16) return null;
  if (!/^[\p{L}\p{N} _.-]+$/u.test(cleaned)) return null;
  return cleaned;
}

const gateSection = document.getElementById('gate-section');
const gateForm = document.getElementById('gate-form');
const nameInput = document.getElementById('name-input');
const nameError = document.getElementById('name-error');

const boardSection = document.getElementById('board-section');
const loggedNameEl = document.getElementById('logged-name');
const btnChangeName = document.getElementById('btn-change-name');
const statTotalEl = document.getElementById('stat-total');

const btnPrevDay = document.getElementById('btn-prev-day');
const btnNextDay = document.getElementById('btn-next-day');
const dayTextEl = document.getElementById('day-text');
const dayTodayEl = document.getElementById('day-today');

const statusEl = document.getElementById('board-status');
const playersListEl = document.getElementById('players-list');

let dayOffset = 0;
let reqCounter = 0;

function getDateForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d;
}

function showGate() {
  gateSection.hidden = false;
  boardSection.hidden = true;
  nameInput.value = '';
  nameError.hidden = true;
  statusEl.textContent = '';
  statusEl.hidden = true;
  playersListEl.innerHTML = '';
}

function showBoard(name) {
  gateSection.hidden = true;
  boardSection.hidden = false;
  loggedNameEl.textContent = name;
}

function renderChip(gameId, gameData) {
  const info = GAME_INFO[gameId] || { name: gameId, unit: 'Versuche' };
  const chip = document.createElement('span');
  const won = Boolean(gameData.won);
  chip.className = 'game-chip ' + (won ? 'chip-won' : 'chip-lost');

  let val = '';
  if (!won) {
    val = '✗';
  } else if (info.unit === 'Punkte') {
    val = `${gameData.tries} P.`;
  } else {
    val = `${gameData.tries}`;
  }

  const label = document.createElement('span');
  label.textContent = `${info.name} · ${val}`;
  chip.appendChild(label);

  if (gameData.ms && gameData.ms >= 1000) {
    const timeSpan = document.createElement('span');
    timeSpan.className = 'chip-time';
    timeSpan.textContent = fmtTime(gameData.ms);
    chip.appendChild(timeSpan);
  }

  return chip;
}

function renderPlayers(players, currentName) {
  playersListEl.innerHTML = '';
  const myClean = currentName.trim().toLowerCase();

  for (const player of players) {
    const card = document.createElement('div');
    card.className = 'card player-card';
    if (player.name && player.name.trim().toLowerCase() === myClean) {
      card.classList.add('is-me');
    }

    const header = document.createElement('div');
    header.className = 'player-header';

    const nameEl = document.createElement('strong');
    nameEl.className = 'player-name';
    nameEl.textContent = player.name;

    const totalEl = document.createElement('span');
    totalEl.className = 'player-total';
    totalEl.textContent = `${player.total} ${player.total === 1 ? 'Quiz' : 'Quizze'}`;

    header.appendChild(nameEl);
    header.appendChild(totalEl);
    card.appendChild(header);

    const chipsEl = document.createElement('div');
    chipsEl.className = 'player-chips';

    const playerGames = player.games || {};
    for (const gameId of Object.keys(GAME_INFO)) {
      if (playerGames[gameId]) {
        chipsEl.appendChild(renderChip(gameId, playerGames[gameId]));
      }
    }

    card.appendChild(chipsEl);
    playersListEl.appendChild(card);
  }
}

function showError() {
  statusEl.innerHTML = '';
  const text = document.createElement('span');
  text.textContent = 'Die Rangliste ist gerade nicht erreichbar.';
  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'btn';
  retryBtn.textContent = 'Nochmal';
  retryBtn.addEventListener('click', () => {
    loadBoard();
  });
  statusEl.appendChild(text);
  statusEl.appendChild(retryBtn);
  statusEl.hidden = false;
}

async function loadBoard() {
  const name = getName();
  if (!name) {
    showGate();
    return;
  }

  const reqId = ++reqCounter;
  const d = getDateForOffset(dayOffset);
  const day = dayOf(d);

  const formatter = new Intl.DateTimeFormat('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  dayTextEl.textContent = formatter.format(d);
  dayTodayEl.hidden = dayOffset !== 0;
  btnNextDay.disabled = dayOffset === 0;

  statusEl.textContent = 'Lade …';
  statusEl.hidden = false;
  playersListEl.innerHTML = '';

  try {
    const res = await fetch(`${API}/board?name=${encodeURIComponent(name)}&day=${day}`);
    if (reqId !== reqCounter) return;
    if (!res.ok) {
      showError();
      return;
    }
    const data = await res.json();
    if (reqId !== reqCounter) return;

    if (data.me && typeof data.me.total === 'number') {
      statTotalEl.textContent = data.me.total;
    } else {
      statTotalEl.textContent = '0';
    }

    if (!data.players || data.players.length === 0) {
      statusEl.textContent = 'An diesem Tag hat noch niemand gespielt.';
      statusEl.hidden = false;
    } else {
      statusEl.textContent = '';
      statusEl.hidden = true;
      renderPlayers(data.players, name);
    }
  } catch (err) {
    if (reqId !== reqCounter) return;
    showError();
  }
}

async function runBackfill() {
  await flushQueue();
  const now = new Date();
  const todaySeed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

  const geoRound = readStorage('georaetsel.daily');
  if (geoRound && geoRound.seed === todaySeed) {
    await reportRound('georaetsel', geoRound, 'daily');
  }

  const datedGames = ['flaggen', 'hauptstaedte', 'umriss', 'laenderkette', 'heisskalt'];
  for (const g of datedGames) {
    const round = readStorage(`${g}.daily.${todaySeed}`);
    if (round) {
      await reportRound(g, round, 'daily');
    }
  }

  await loadBoard();
}

gateForm.addEventListener('submit', async e => {
  e.preventDefault();
  const cleaned = cleanName(nameInput.value);
  if (!cleaned) {
    nameError.hidden = false;
    return;
  }
  nameError.hidden = true;
  setName(cleaned);
  showBoard(cleaned);
  await runBackfill();
});

nameInput.addEventListener('input', () => {
  nameError.hidden = true;
});

btnChangeName.addEventListener('click', () => {
  setName('');
  showGate();
  nameInput.focus();
});

btnPrevDay.addEventListener('click', () => {
  dayOffset++;
  loadBoard();
});

btnNextDay.addEventListener('click', () => {
  if (dayOffset > 0) {
    dayOffset--;
    loadBoard();
  }
});

initPrivacy();

const btnTheme = document.getElementById('btn-theme');
if (btnTheme) {
  btnTheme.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      if (meta) meta.setAttribute('content', '#0B2C45');
      try {
        localStorage.setItem('georaetsel.theme', 'dark');
      } catch (e) {}
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      if (meta) meta.setAttribute('content', '#CFE6F2');
      try {
        localStorage.setItem('georaetsel.theme', 'light');
      } catch (e) {}
    }
  });
}

const initialName = getName();
if (initialName) {
  showBoard(initialName);
  runBackfill();
} else {
  showGate();
}
