/**
 * Scroll the app content pane to the top.
 * Body/window scroll is locked in WebAppShell; the real scroller is `#web-content-scroll`.
 */
export function scrollAppToTop(behavior: ScrollBehavior = 'auto'): void {
  const sc = document.getElementById('web-content-scroll');
  if (sc) {
    sc.scrollTo({ top: 0, behavior });
  }
  window.scrollTo({ top: 0, behavior });
}
