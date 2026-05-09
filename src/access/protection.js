let blackoutEl = null;

function ensureBlackout() {
  if (blackoutEl) return blackoutEl;
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    background: '#000',
    zIndex: '2147483647',
    opacity: '0',
    transition: 'opacity 80ms linear',
    pointerEvents: 'none',
  });
  document.body.appendChild(el);
  blackoutEl = el;
  return el;
}

function showBlackout() {
  ensureBlackout().style.opacity = '1';
  ensureBlackout().style.pointerEvents = 'auto';
}

function hideBlackout() {
  if (!blackoutEl) return;
  blackoutEl.style.opacity = '0';
  blackoutEl.style.pointerEvents = 'none';
}

const swallow = (e) => {
  e.preventDefault();
  e.stopPropagation();
  return false;
};

export function installProtections() {
  const css = `
    html, body, #app, #app canvas, video, img {
      -webkit-user-select: none;
      -moz-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      -webkit-user-drag: none;
      user-drag: none;
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  document.addEventListener('contextmenu', swallow, { capture: true });
  document.addEventListener('dragstart', swallow, { capture: true });
  document.addEventListener('selectstart', swallow, { capture: true });
  document.addEventListener('copy', swallow, { capture: true });
  document.addEventListener('cut', swallow, { capture: true });

  document.addEventListener(
    'keydown',
    (e) => {
      const k = (e.key || '').toLowerCase();
      const isCmd = e.ctrlKey || e.metaKey;
      if (k === 'printscreen' || k === 'snapshot') {
        showBlackout();
        setTimeout(hideBlackout, 1200);
        return;
      }
      if (k === 'f12') return swallow(e);
      if (isCmd && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) return swallow(e);
      if (isCmd && (k === 'u' || k === 's' || k === 'p')) return swallow(e);
    },
    { capture: true }
  );

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') showBlackout();
    else hideBlackout();
  });
}
