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
  submit,
  finish,
  scoreOf,
  rankOf,
  shuffleOuter,
  shareText as formatShareText,
} from './logic.js';

let mode = 'daily';
let dailyRound = null;
let practiceRound = null;
let currentDateSeed = dailySeed(new Date());
let currentInput = '';
let confirmFinishTimer = null;
let confirmingFinish = false;

function getActiveRound() {
  return mode === 'daily' ? dailyRound : practiceRound;
}

function saveIfDaily() {
  if (mode === 'daily' && dailyRound) {
    writeStorage(`wabe.daily.${dailyRound.seed}`, dailyRound);
  }
}

function loadDaily() {
  currentDateSeed = dailySeed(new Date());
  const saved = readStorage(`wabe.daily.${currentDateSeed}`);
  if (saved && saved.seed === currentDateSeed) {
    dailyRound = saved;
  } else {
    dailyRound = newRound(currentDateSeed, 'daily');
    saveIfDaily();
  }
}

function resetFinishConfirm() {
  if (confirmFinishTimer) {
    clearTimeout(confirmFinishTimer);
    confirmFinishTimer = null;
  }
  confirmingFinish = false;
  const btn = document.getElementById('btn-finish');
  if (btn) btn.textContent = 'Beenden';
}

function startPractice() {
  const randSeed = Math.floor(Math.random() * 2147483647);
  practiceRound = newRound(randSeed, 'practice');
  currentInput = '';
  resetFinishConfirm();
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
  currentInput = '';
  resetFinishConfirm();
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

function updateWordDisplay() {
  const round = getActiveRound();
  if (!round) return;
  const puzzle = puzzleFor(round.seed, round.mode);
  const wordText = document.getElementById('word-text');
  if (!wordText) return;
  wordText.innerHTML = '';
  for (const ch of currentInput) {
    const span = document.createElement('span');
    if (ch === puzzle.center) {
      span.className = 'letter-center';
    }
    span.textContent = ch;
    wordText.appendChild(span);
  }
}

function triggerShake() {
  const wordDisplay = document.getElementById('word-display');
  if (!wordDisplay) return;
  wordDisplay.classList.remove('shake');
  void wordDisplay.offsetWidth;
  wordDisplay.classList.add('shake');
  wordDisplay.addEventListener('animationend', () => {
    wordDisplay.classList.remove('shake');
  }, { once: true });
}

function handleLetter(letter) {
  const round = getActiveRound();
  if (!round || round.state !== 'playing') return;
  currentInput += letter.toUpperCase();
  updateWordDisplay();
}

function handleBackspace() {
  const round = getActiveRound();
  if (!round || round.state !== 'playing') return;
  if (currentInput.length > 0) {
    currentInput = currentInput.slice(0, -1);
    updateWordDisplay();
  }
}

function handleShuffle() {
  const round = getActiveRound();
  if (!round || round.state !== 'playing') return;
  shuffleOuter(round);
  saveIfDaily();
  render();
}

function handleSubmit() {
  const round = getActiveRound();
  if (!round || round.state !== 'playing') return;

  const res = submit(round, currentInput);
  switch (res.result) {
    case 'short':
      showToast('Zu kurz');
      triggerShake();
      break;
    case 'badletter':
      showToast('Falscher Buchstabe');
      triggerShake();
      break;
    case 'nocenter':
      showToast('Mittelbuchstabe fehlt');
      triggerShake();
      break;
    case 'known':
      showToast('Schon gefunden');
      currentInput = '';
      updateWordDisplay();
      break;
    case 'notword':
      showToast('Nicht in der Wortliste');
      triggerShake();
      break;
    case 'ok':
      showToast(`Gut! +${res.points}`);
      currentInput = '';
      saveIfDaily();
      render();
      break;
    case 'pangram':
      showToast(`Pangramm! +${res.points}`);
      currentInput = '';
      saveIfDaily();
      render();
      break;
    default:
      break;
  }
}

function handleFinishClick() {
  const round = getActiveRound();
  if (!round || round.state !== 'playing') return;

  const btn = document.getElementById('btn-finish');
  if (!confirmingFinish) {
    confirmingFinish = true;
    btn.textContent = 'Wirklich beenden?';
    confirmFinishTimer = setTimeout(() => {
      resetFinishConfirm();
    }, 3000);
  } else {
    resetFinishConfirm();
    finish(round);
    saveIfDaily();
    render();
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

function render() {
  const round = getActiveRound();
  reportRound('wabe', round, mode);
  if (!round) return;

  const puzzle = puzzleFor(round.seed, round.mode);
  const score = scoreOf(round);
  const rank = rankOf(round);

  // Progress info
  const rankNameEl = document.getElementById('rank-name');
  if (rankNameEl) rankNameEl.textContent = rank.name;

  const rankScoreEl = document.getElementById('rank-score');
  if (rankScoreEl) {
    rankScoreEl.textContent = `${score} ${score === 1 ? 'Punkt' : 'Punkte'}`;
  }

  const wordsCountEl = document.getElementById('words-count');
  if (wordsCountEl) {
    wordsCountEl.textContent = `${round.found.length} von ${puzzle.words.length} Wörtern`;
  }

  // 9 Rank dots
  const dotsContainer = document.getElementById('rank-dots');
  if (dotsContainer) {
    dotsContainer.setAttribute('aria-valuenow', String(rank.index));
    dotsContainer.innerHTML = '';
    for (let i = 0; i < 9; i++) {
      const dot = document.createElement('span');
      dot.className = 'rank-dot' + (i <= rank.index ? ' active' : '') + (i === rank.index ? ' current' : '');
      dotsContainer.appendChild(dot);
    }
  }

  // Last 3 found words
  const recentEl = document.getElementById('recent-words');
  if (recentEl) {
    if (round.found.length > 0) {
      const recent = round.found.slice(-3).map(w => {
        return puzzle.pangrams.includes(w) ? `${w} ★` : w;
      });
      recentEl.textContent = recent.join(', ');
    } else {
      recentEl.textContent = '';
    }
  }

  // Found words collapsible details
  const summaryEl = document.getElementById('found-summary');
  if (summaryEl) {
    summaryEl.textContent = `Gefundene Wörter (${round.found.length})`;
  }

  const foundListEl = document.getElementById('found-list');
  if (foundListEl) {
    foundListEl.innerHTML = '';
    const sortedFound = [...round.found].sort();
    sortedFound.forEach(w => {
      const isPangram = puzzle.pangrams.includes(w);
      const span = document.createElement('span');
      span.className = 'found-item' + (isPangram ? ' is-pangram' : '');
      span.textContent = isPangram ? `${w} ★` : w;
      foundListEl.appendChild(span);
    });
  }

  // Word display
  updateWordDisplay();

  // Honeycomb letter buttons
  const centerBtn = document.getElementById('hex-center');
  if (centerBtn) {
    centerBtn.textContent = puzzle.center;
    centerBtn.dataset.letter = puzzle.center;
    centerBtn.setAttribute('aria-label', `Mittelbuchstabe ${puzzle.center}`);
  }

  for (let i = 0; i < 6; i++) {
    const btn = document.getElementById(`hex-${i}`);
    if (btn && round.order[i]) {
      btn.textContent = round.order[i];
      btn.dataset.letter = round.order[i];
      btn.setAttribute('aria-label', `Buchstabe ${round.order[i]}`);
    }
  }

  // Play view vs End view
  const playView = document.getElementById('play-view');
  const endView = document.getElementById('end-view');
  const endTitle = document.getElementById('end-title');
  const endScore = document.getElementById('end-score');
  const endNote = document.getElementById('end-note');
  const btnPractice = document.getElementById('btn-end-practice');
  const btnNewRound = document.getElementById('btn-end-new-round');
  const endWordsSummary = document.getElementById('end-words-summary');
  const endWordsList = document.getElementById('end-words-list');

  if (round.state === 'done') {
    if (playView) playView.hidden = true;
    if (endView) endView.hidden = false;

    if (endTitle) endTitle.textContent = `Geschafft! Rang: ${rank.name}`;
    if (endScore) {
      endScore.textContent = `${score} ${score === 1 ? 'Punkt' : 'Punkte'} · ${round.found.length} von ${puzzle.words.length} Wörtern`;
    }

    if (mode === 'daily') {
      if (endNote) endNote.textContent = 'Nächste Wabe um Mitternacht.';
      if (btnPractice) btnPractice.hidden = false;
      if (btnNewRound) btnNewRound.hidden = true;
    } else {
      if (endNote) endNote.textContent = '';
      if (btnPractice) btnPractice.hidden = true;
      if (btnNewRound) btnNewRound.hidden = false;
    }

    if (endWordsSummary) {
      endWordsSummary.textContent = `Alle Wörter (${puzzle.words.length})`;
    }

    if (endWordsList) {
      endWordsList.innerHTML = '';
      const foundSet = new Set(round.found);
      puzzle.words.forEach(w => {
        const isFound = foundSet.has(w);
        const isPangram = puzzle.pangrams.includes(w);
        const span = document.createElement('span');
        let cls = 'word-entry';
        if (isFound) cls += ' found';
        if (isPangram) cls += ' pangram';
        span.className = cls;
        span.textContent = isPangram ? `${w} ★` : w;
        endWordsList.appendChild(span);
      });
    }
  } else {
    if (playView) playView.hidden = false;
    if (endView) endView.hidden = true;
  }
}

function init() {
  initPrivacy();

  document.getElementById('btn-theme').addEventListener('click', toggleTheme);
  document.getElementById('btn-share').addEventListener('click', doShare);

  document.getElementById('tab-daily').addEventListener('click', () => setMode('daily'));
  document.getElementById('tab-practice').addEventListener('click', () => setMode('practice'));

  document.getElementById('btn-delete').addEventListener('click', handleBackspace);
  document.getElementById('btn-shuffle').addEventListener('click', handleShuffle);
  document.getElementById('btn-submit').addEventListener('click', handleSubmit);
  document.getElementById('btn-finish').addEventListener('click', handleFinishClick);

  document.getElementById('btn-end-practice').addEventListener('click', () => {
    setMode('practice');
    startPractice();
    render();
  });

  document.getElementById('btn-end-new-round').addEventListener('click', () => {
    startPractice();
    render();
  });

  // Honeycomb clicks
  document.getElementById('honeycomb').addEventListener('click', e => {
    const btn = e.target.closest('button.hex-btn');
    if (!btn) return;
    const letter = btn.dataset.letter;
    if (letter) {
      handleLetter(letter);
    }
  });

  // Physical keyboard listener
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const privacyDialog = document.getElementById('privacy-dialog');
    if (privacyDialog && privacyDialog.open) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      handleBackspace();
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      handleShuffle();
    } else {
      const key = e.key.toUpperCase();
      if (/^[A-ZÄÖÜ]$/.test(key)) {
        e.preventDefault();
        handleLetter(key);
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
