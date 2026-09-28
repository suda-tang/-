// Keep the first paint stable while the workspace groups its controls.
const root = document.documentElement;
root.classList.add('booting');
let finished = false;
const timeout = setTimeout(() => {
  if (finished) return;
  const label = document.querySelector('#boot-label');
  if (label) label.textContent = '工作区尚未准备好，请重新载入。';
  document.querySelector('#boot-retry')?.removeAttribute('hidden');
}, 15000);
window.addEventListener('workspace-ready', async () => {
  if (finished) return;
  await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))]);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    finished = true;
    clearTimeout(timeout);
    root.classList.remove('booting');
    root.classList.add('boot-ready');
    const loader = document.querySelector('#startup');
    if (loader) { loader.inert = true; setTimeout(() => loader.remove(), 500); }
  }));
}, {once:true});
document.addEventListener('DOMContentLoaded', () => {
  document.querySelector('#boot-retry')?.addEventListener('click', () => location.reload());
});
