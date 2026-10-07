// Disable browser page magnification without blocking single-finger scrolling
// or the DAW's own two-finger track scaling.
(() => {
  const stopPageGesture = event => event.preventDefault();
  document.addEventListener('gesturestart', stopPageGesture, {passive:false});
  document.addEventListener('gesturechange', stopPageGesture, {passive:false});
  document.addEventListener('touchmove', event => {
    if (event.touches.length > 1 && !event.target.closest?.('#daw-view')) event.preventDefault();
  }, {passive:false});
})();
