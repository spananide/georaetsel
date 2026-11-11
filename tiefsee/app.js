import { QUESTIONS } from '../data/tiefsee.js';
import { dailySeed } from '../georaetsel/game.js';
import {
  API,
  readStorage,
  writeStorage,
  showToast,
  shareText as copyOrShare,
  initPrivacy,
  startClock,
  withTime,
  reportRound,
  getName,
  setName,
  dayOf,
} from '../common.js';
import {
  newRound,
  normalizeAnswer,
  checkAnswer,
  depthFor,
  record,
  current,
  totalDepth,
  rarityText,
  shareText as formatShareText,
} from './logic.js';

let mode = 'daily';
let dailyRound = null;
let practiceRound = null;
let currentDateSeed = dailySeed(new Date());
let isSubmitting = false;
let lastAnswerResult = null;

function cleanName(s) {
  if (typeof s !== 'string') return null;
  const cleaned = s.trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2 || cleaned.length > 16) return null;
  if (!/^[\p{L}\p{N} _.-]+$/u.test(cleaned)) return null;
  return cleaned;
}

function getActiveRound() {
  return mode === 'daily' ? dailyRound : practiceRound;
}

function saveIfDaily() {
  if (mode === 'daily' && dailyRound) {
    writeStorage(`tiefsee.daily.${dailyRound.seed}`, dailyRound);
  }
}

function loadDaily() {
  currentDateSeed = dailySeed(new Date());
  const saved = readStorage(`tiefsee.daily.${currentDateSeed}`);
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
  lastAnswerResult = null;
}

function toggleTheme() {
  const root = document.documentElement;
  const current = root.getAttribute('data-theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const nextTheme = current === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', nextTheme);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', nextTheme === 'dark' ? '#1d1b18' : '#f4efe3');
  try {
    localStorage.setItem('georaetsel.theme', nextTheme);
  } catch (e) {}
}

function setMode(newMode) {
  mode = newMode;
  lastAnswerResult = null;
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

function addToLog(entry) {
  let log = readStorage('tiefsee.log', []);
  if (!Array.isArray(log)) log = [];
  if (log.some(e => e.day === entry.day && e.question === entry.question)) {
    return;
  }
  log.push(entry);
  if (log.length > 100) {
    log = log.slice(-100);
  }
  writeStorage('tiefsee.log', log);
}

function renderLogbook() {
  let log = readStorage('tiefsee.log', []);
  if (!Array.isArray(log)) log = [];

  const maxDepth = log.reduce((max, e) => Math.max(max, e.depth || 0), 0);
  const count = log.length;

  const statsEl = document.getElementById('logbook-stats');
  if (statsEl) {
    statsEl.textContent = `Tiefster Tauchgang: ${maxDepth} m · Gesamt: ${count} ${count === 1 ? 'Antwort' : 'Antworten'}`;
  }

  const listEl = document.getElementById('logbook-list');
  if (listEl) {
    listEl.innerHTML = '';
    const reversed = [...log].reverse();
    for (const item of reversed) {
      const li = document.createElement('li');
      li.className = 'logbook-item';
      let dayFmt = item.day;
      if (typeof item.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.day)) {
        const parts = item.day.split('-');
        dayFmt = `${parts[2]}.${parts[1]}.`;
      }
      li.textContent = `${dayFmt} · ${item.question} → ${item.answer} · ${item.depth} m`;
      listEl.appendChild(li);
    }
  }
}

function renderScene(round) {
  const totalDepthEl = document.getElementById('total-depth');
  const markersContainer = document.getElementById('markers-container');
  const diverEl = document.getElementById('diver');

  const tot = totalDepth(round);
  if (totalDepthEl) {
    totalDepthEl.textContent = `Gesamttiefe: ${tot} m`;
  }

  if (markersContainer) {
    markersContainer.innerHTML = '';
    if (round && Array.isArray(round.answers)) {
      for (const a of round.answers) {
        if (!a) continue;
        const marker = document.createElement('div');
        marker.className = 'depth-marker';
        const pct = Math.min(100, Math.max(0, (a.depth / 33) * 100));
        marker.style.top = `${pct}%`;

        const line = document.createElement('span');
        line.className = 'marker-line';
        const badge = document.createElement('span');
        badge.className = 'marker-badge';
        badge.textContent = `${a.answer} · ${a.depth} m`;

        marker.appendChild(line);
        marker.appendChild(badge);
        markersContainer.appendChild(marker);
      }
    }
  }

  if (diverEl) {
    let latestDepth = 0;
    if (round && Array.isArray(round.answers)) {
      for (let i = round.answers.length - 1; i >= 0; i--) {
        if (round.answers[i]) {
          latestDepth = round.answers[i].depth;
          break;
        }
      }
    }
    const diverPct = Math.min(100, Math.max(0, (latestDepth / 33) * 100));
    diverEl.style.top = `${diverPct}%`;
  }
}

function renderTopList(listEl, topItems, playerAnswer) {
  listEl.innerHTML = '';
  const normPlayer = normalizeAnswer(playerAnswer);
  for (const item of topItems) {
    const li = document.createElement('li');
    li.className = 'top-answer-item';
    if (normalizeAnswer(item.answer) === normPlayer) {
      li.classList.add('is-me');
    }
    const ansSpan = document.createElement('span');
    ansSpan.textContent = item.answer;
    const countSpan = document.createElement('span');
    countSpan.className = 'top-answer-count';
    countSpan.textContent = `${item.n}×`;
    li.appendChild(ansSpan);
    li.appendChild(countSpan);
    listEl.appendChild(li);
  }
}

function render() {
  const round = getActiveRound();
  reportRound('tiefsee', round, mode);
  if (!round) return;

  renderScene(round);
  renderLogbook();

  const gateSection = document.getElementById('gate-section');
  const playSection = document.getElementById('play-section');
  const resultSection = document.getElementById('result-section');
  const endView = document.getElementById('end-view');

  // Daily mode name check
  if (mode === 'daily' && !getName()) {
    gateSection.hidden = false;
    playSection.hidden = true;
    resultSection.hidden = true;
    endView.hidden = true;
    const nameInput = document.getElementById('name-input');
    if (nameInput) nameInput.focus();
    return;
  }
  gateSection.hidden = true;

  // Question result screen
  if (lastAnswerResult !== null) {
    playSection.hidden = true;
    resultSection.hidden = false;
    endView.hidden = true;

    const resAnswerEl = document.getElementById('result-answer');
    const resRarityEl = document.getElementById('result-rarity');
    const topAnswersTitle = document.getElementById('top-answers-title');
    const topAnswersList = document.getElementById('top-answers-list');

    resAnswerEl.textContent = `${lastAnswerResult.entry.answer} · ${lastAnswerResult.entry.depth} m`;
    resRarityEl.textContent = rarityText(lastAnswerResult.entry, mode);

    if (mode === 'daily') {
      topAnswersTitle.textContent = 'So haben andere geantwortet:';
      if (lastAnswerResult.topAnswers) {
        renderTopList(topAnswersList, lastAnswerResult.topAnswers, lastAnswerResult.entry.answer);
      } else {
        topAnswersList.innerHTML = '<li class="top-answer-item">Lade …</li>';
      }
    } else {
      topAnswersTitle.textContent = 'Typische Antworten:';
      topAnswersList.innerHTML = '';
      const seeds = lastAnswerResult.typicalAnswers || [];
      const li = document.createElement('li');
      li.className = 'top-answer-item';
      li.textContent = seeds.join(', ');
      topAnswersList.appendChild(li);
    }
    const btnNext = document.getElementById('btn-next');
    if (btnNext) btnNext.focus();
    return;
  }

  // End view
  if (round.state === 'done') {
    playSection.hidden = true;
    resultSection.hidden = true;
    endView.hidden = false;

    const endTitle = document.getElementById('end-title');
    const endNote = document.getElementById('end-note');
    const btnEndPractice = document.getElementById('btn-end-practice');
    const btnEndNewRound = document.getElementById('btn-end-new-round');

    endTitle.textContent = `Tauchgang beendet! ${totalDepth(round)} m tief`;
    if (mode === 'daily') {
      endNote.textContent = 'Neue Fragen um Mitternacht.';
      btnEndPractice.hidden = false;
      btnEndNewRound.hidden = true;
    } else {
      endNote.textContent = '';
      btnEndPractice.hidden = true;
      btnEndNewRound.hidden = false;
    }
    return;
  }

  // Playing question view
  playSection.hidden = false;
  resultSection.hidden = true;
  endView.hidden = true;

  const k = current(round);
  const qIndex = round.qs[k];
  const q = QUESTIONS[qIndex];

  const qProgress = document.getElementById('q-progress');
  const qText = document.getElementById('q-text');
  const answerInput = document.getElementById('answer-input');
  const btnSubmit = document.getElementById('btn-submit');

  qProgress.textContent = `Frage ${k + 1} von 3`;
  qText.textContent = q ? q.q : '';
  btnSubmit.disabled = false;
  answerInput.focus();
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

  document.getElementById('btn-next').addEventListener('click', () => {
    lastAnswerResult = null;
    render();
  });

  document.getElementById('gate-form').addEventListener('submit', e => {
    e.preventDefault();
    const nameInput = document.getElementById('name-input');
    const nameError = document.getElementById('name-error');
    const cleaned = cleanName(nameInput.value);
    if (!cleaned) {
      nameError.hidden = false;
      return;
    }
    nameError.hidden = true;
    setName(cleaned);
    render();
  });

  document.getElementById('name-input').addEventListener('input', () => {
    const nameError = document.getElementById('name-error');
    if (nameError) nameError.hidden = true;
  });

  document.getElementById('answer-form').addEventListener('submit', async e => {
    e.preventDefault();
    const round = getActiveRound();
    if (!round || round.state !== 'playing' || isSubmitting) return;

    const k = current(round);
    if (k >= 3) return;
    const qIndex = round.qs[k];
    const answerInput = document.getElementById('answer-input');
    const rawAnswer = answerInput.value;

    const check = checkAnswer(qIndex, rawAnswer);
    if (!check.ok) {
      if (check.reason === 'short') {
        showToast('Zu kurz (mindestens 3 Buchstaben).');
      } else if (check.reason === 'starts') {
        const q = QUESTIONS[qIndex];
        const st = q.starts ? (q.starts.charAt(0).toUpperCase() + q.starts.slice(1)) : '';
        showToast(`Die Antwort muss mit „${st}“ beginnen.`);
      }
      return;
    }

    if (mode === 'daily') {
      const name = getName();
      if (!name) {
        render();
        return;
      }

      isSubmitting = true;
      const btnSubmit = document.getElementById('btn-submit');
      btnSubmit.disabled = true;

      const day = dayOf(round.seed);
      let resData;
      try {
        const res = await fetch(`${API}/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            day,
            q: k,
            answer: check.answer,
          }),
        });

        if (res.status === 400) {
          showToast('Antwort nicht möglich.');
          isSubmitting = false;
          btnSubmit.disabled = false;
          return;
        }

        if (!res.ok) {
          showToast('Keine Verbindung. Bitte nochmal versuchen.');
          isSubmitting = false;
          btnSubmit.disabled = false;
          return;
        }

        resData = await res.json();
      } catch (err) {
        showToast('Keine Verbindung. Bitte nochmal versuchen.');
        isSubmitting = false;
        btnSubmit.disabled = false;
        return;
      }

      isSubmitting = false;
      btnSubmit.disabled = false;
      answerInput.value = '';

      const storedAnswer = resData.answer;
      const n = resData.n;
      const total = resData.total;
      const depth = depthFor(qIndex, storedAnswer, n, total);
      const entry = { answer: storedAnswer, n, total, depth };

      record(round, k, entry);
      saveIfDaily();
      addToLog({ day, question: QUESTIONS[qIndex].q, answer: storedAnswer, depth, daily: true });

      lastAnswerResult = { qNum: k, qIndex, entry, topAnswers: null };
      render();

      try {
        const res = await fetch(`${API}/answers?day=${day}&q=${k}`);
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.top)) {
            if (lastAnswerResult && lastAnswerResult.qNum === k) {
              lastAnswerResult.topAnswers = data.top.slice(0, 5);
              const topAnswersList = document.getElementById('top-answers-list');
              if (topAnswersList) {
                renderTopList(topAnswersList, lastAnswerResult.topAnswers, storedAnswer);
              }
            }
          }
        }
      } catch (err) {
        // silently ignored
      }
    } else {
      // Practice mode
      answerInput.value = '';
      const norm = check.answer;
      const depth = depthFor(qIndex, norm, 0, 0);
      const entry = { answer: norm, n: 0, total: 0, depth };

      record(round, k, entry);
      const day = dayOf(new Date());
      addToLog({ day, question: QUESTIONS[qIndex].q, answer: norm, depth, daily: false });

      const typical = (QUESTIONS[qIndex].seeds || []).slice(0, 3);
      lastAnswerResult = { qNum: k, qIndex, entry, typicalAnswers: typical };
      render();
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
