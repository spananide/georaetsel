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
