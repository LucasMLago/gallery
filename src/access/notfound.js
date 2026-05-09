export function render404() {
  document.title = '404 — File not found';
  document.body.style.background = '#ffffff';
  document.body.style.color = '#1f2328';
  document.body.style.fontFamily =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
  document.body.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;line-height:1.5;">
      <h1 style="font-size:54px;font-weight:600;margin:0 0 12px;letter-spacing:-1px;">404</h1>
      <p style="font-size:18px;font-weight:600;margin:0 0 6px;">File not found</p>
      <p style="font-size:14px;color:#59636e;margin:0;max-width:560px;">
        The site configured at this address does not contain the requested file.
      </p>
    </div>
  `;
}
