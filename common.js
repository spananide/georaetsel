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

