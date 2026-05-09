let el = null;

export function showLoading() {
  if (el) return;
  document.body.style.background = '#ffffff';
  el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#ffffff',
    zIndex: '9999',
    opacity: '1',
    transition: 'opacity 300ms linear',
    pointerEvents: 'none',
  });
  el.innerHTML = `
    <div style="
      width: 32px;
      height: 32px;
      border: 3px solid rgba(0,0,0,0.08);
      border-top-color: rgba(0,0,0,0.45);
      border-radius: 50%;
      animation: __sp 0.8s linear infinite;
    "></div>
    <style>@keyframes __sp { to { transform: rotate(360deg); } }</style>
  `;
  document.body.appendChild(el);
}

export function hideLoading() {
  if (!el) return;
  const node = el;
  el = null;
  node.style.opacity = '0';
  setTimeout(() => node.remove(), 320);
}
