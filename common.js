export function readStorage(key, fallback = null) {
  try {
    const val = localStorage.getItem(key);
    return val ? JSON.parse(val) : fallback;
  } catch (e) {
    return fallback;
  }
}

export function writeStorage(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {}
}

let toastTimer = null;
export function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  try {
    if (el.matches && el.matches(':popover-open') && el.hidePopover) {
      el.hidePopover();
    }
    if (el.showPopover) {
      el.showPopover();
    }
  } catch (e) {}
  el.classList.add('toast-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('toast-visible');
    try {
      if (el.matches && el.matches(':popover-open') && el.hidePopover) {
        el.hidePopover();
      }
    } catch (e) {}
  }, 3000);
}

export function shareText(text) {
  if (navigator.share && window.matchMedia && window.matchMedia('(pointer:coarse)').matches) {
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

export function initPrivacy() {
  const btn = document.getElementById('btn-privacy');
  const dlg = document.getElementById('privacy-dialog');
  const closeBtn = document.getElementById('privacy-close');

  if (btn && dlg) {
    btn.addEventListener('click', () => dlg.showModal());
  }
  if (closeBtn && dlg) {
    closeBtn.addEventListener('click', () => dlg.close());
  }
  if (dlg) {
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
  }
}

export function fmtTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

// Puts a "⏱ 1:23" line before the last line (the url) of a share text. Under 1 s: text unchanged.
export function withTime(text, ms) {
  if (!ms || ms < 1000) return text;
  const lines = text.split('\n');
  lines.splice(lines.length - 1, 0, `⏱ ${fmtTime(ms)}`);
  return lines.join('\n');
}

// getRound() returns the current round object (or null), isOver(round) says if it is finished,
// save() persists the round. Counts only while the tab is visible and the round is not over.
export function startClock({ getRound, isOver, save }) {
  const el = document.getElementById('clock');
  let last = Date.now();
  let sinceSave = 0;
  const paint = () => {
    const r = getRound();
    if (el) el.textContent = fmtTime((r && r.ms) || 0);
  };
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min(now - last, 2000); // a long gap (standby, throttled tab) counts at most 2 s
    last = now;
    const r = getRound();
    if (r && !isOver(r) && document.visibilityState === 'visible') {
      r.ms = (r.ms || 0) + dt;
      sinceSave += dt;
      if (sinceSave >= 5000) { sinceSave = 0; save(); }
    }
    paint();
  }, 1000);
  document.addEventListener('visibilitychange', () => {
    last = Date.now();
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);
  paint();
}

export const API = 'https://geo-api.spanani.de';

export const GAME_INFO = {
  georaetsel:   { name: 'GeoRätsel',       unit: 'Versuche' },
  flaggen:      { name: 'Flaggenjagd',     unit: 'Punkte' },
  hauptstaedte: { name: 'Hauptstädte',     unit: 'Punkte' },
  umriss:       { name: 'Umriss',          unit: 'Versuche' },
  laenderkette: { name: 'Länderkette',     unit: 'Versuche' },
  heisskalt:    { name: 'Heiß oder kalt',  unit: 'Versuche' },
  'mehr-weniger': { name: 'Mehr oder weniger', unit: 'Serie' },
  woertel:      { name: 'Wörtel',          unit: 'Versuche' },
  rechnel:      { name: 'Rechnel',         unit: 'Versuche' },
};

export const dayOf = x => {
  if (x instanceof Date) {
    const y = x.getFullYear();
    const m = String(x.getMonth() + 1).padStart(2, '0');
    const d = String(x.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(x ?? '');
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }
  return '';
};

export function getName() {
  const v = readStorage('spanani.name', '');
  return typeof v === 'string' ? v : '';
}

export function setName(n) {
  writeStorage('spanani.name', n);
}

export function summarize(game, round) {
  if (!round || typeof round !== 'object') return null;

  switch (game) {
    case 'georaetsel': {
      const over = round.over === true;
      const tries = 12 - (round.guessesLeft ?? 12);
      const won = Boolean(round.cells && round.cells.every(Boolean));
      return { over, tries, won };
    }
    case 'flaggen': {
      const over = round.state === 'done';
      const tries = (round.results || []).reduce((sum, r) => sum + (r && r.pts ? r.pts : 0), 0);
      return { over, tries, won: true };
    }
    case 'hauptstaedte': {
      const over = round.state === 'done';
      const tries = (round.results || []).filter(r => r && r.ok).length;
      return { over, tries, won: true };
    }
    case 'umriss':
    case 'laenderkette': {
      const over = round.state === 'won' || round.state === 'lost';
      const tries = (round.guesses || []).length;
      const won = round.state === 'won';
      return { over, tries, won };
    }
    case 'heisskalt': {
      const over = round.state === 'won' || round.state === 'gave-up';
      const tries = (round.guesses || []).length;
      const won = round.state === 'won';
      return { over, tries, won };
    }
    case 'mehr-weniger': {
      const over = round.over === true;
      const tries = round.streak ?? 0;
      return { over, tries, won: true };
    }
    case 'woertel': {
      const over = round.state === 'won' || round.state === 'lost';
      const tries = (round.guesses || []).length;
      const won = round.state === 'won';
      return { over, tries, won };
    }
    case 'rechnel': {
      const over = round.state === 'won' || round.state === 'lost';
      const tries = (round.guesses || []).length;
      const won = round.state === 'won';
      return { over, tries, won };
    }
    default:
      return null;
  }
}

function enqueue(payload) {
  let q = readStorage('spanani.queue', []);
  if (!Array.isArray(q)) q = [];
  q.push(payload);
  if (q.length > 50) q = q.slice(-50);
  writeStorage('spanani.queue', q);
}

let isFlushing = false;
export async function flushQueue() {
  if (isFlushing) return;
  isFlushing = true;
  try {
    let q = readStorage('spanani.queue', []);
    if (!Array.isArray(q) || q.length === 0) return;

    const remaining = [];
    for (const payload of q) {
      try {
        const res = await fetch(`${API}/result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        });
        if (res.status >= 500) {
          remaining.push(payload);
        }
      } catch (e) {
        remaining.push(payload);
      }
    }

    let currentQ = readStorage('spanani.queue', []);
    if (!Array.isArray(currentQ)) currentQ = [];
    const addedDuringFlush = currentQ.filter(item => !q.includes(item));
    writeStorage('spanani.queue', [...remaining, ...addedDuringFlush].slice(-50));
  } catch (e) {
  } finally {
    isFlushing = false;
  }
}

export async function reportRound(game, round, mode) {
  try {
    const name = getName();
    if (!name) return;
    const summary = summarize(game, round);
    if (!summary || !summary.over) return;

    const seed = round ? round.seed : undefined;
    const id = `${game}|${mode}|${seed}`;
    let sent = readStorage('spanani.sent', []);
    if (!Array.isArray(sent)) sent = [];
    if (sent.includes(id)) return;

    sent.push(id);
    if (sent.length > 300) sent = sent.slice(-300);
    writeStorage('spanani.sent', sent);

    await flushQueue();

    const day = mode === 'daily' ? dayOf(seed) : dayOf(new Date());
    const payload = {
      name,
      day,
      game,
      mode,
      tries: summary.tries,
      won: summary.won,
      ms: (round && round.ms) || 0,
    };

    try {
      const res = await fetch(`${API}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      if (res.status >= 500) {
        enqueue(payload);
      }
    } catch (e) {
      enqueue(payload);
    }
  } catch (e) {}
}


