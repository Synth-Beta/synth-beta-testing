import { useEffect } from 'react';

/**
 * Hook to lock document scrolling when a modal or overlay is open.
 *
 * Two things here are deliberate, and both were bugs before:
 *
 * 1. REFERENCE COUNTED. Several overlays can be open at once (an artist modal with an
 *    event modal on top). Each one previously saved the current overflow values and
 *    restored them on unmount, so whichever locked SECOND captured values that were
 *    already locked and wrote them back on close, re-locking the page for good.
 *    With a counter, only the first lock captures state and only the last release
 *    restores it, so teardown order stops mattering.
 *
 * 2. THE SCROLL CONTAINER IS LOCKED WITH A CLASS, NOT INLINE STYLES.
 *    `#web-content-scroll` gets its scrollability from a React inline style
 *    (WebAppShell: `style={{ overflowY: 'auto' }}`). Reading `el.style.overflow` returns
 *    '' when only `overflowY` is set, so the old save/restore captured '', wrote 'hidden'
 *    across both axes, and "restored" '' — permanently destroying the inline overflowY.
 *    React never re-applied it (its virtual DOM saw no change), so the feed silently
 *    stopped scrolling after closing an event, artist, or venue page. Toggling a class
 *    leaves React's inline style untouched.
 *
 * The body is still styled inline: its `top` offset is dynamic, and nothing in React
 * manages body styles, so there is no inline value to clobber.
 */

const SCROLL_LOCK_CLASS = 'synth-scroll-locked';

interface SavedScrollState {
  bodyPosition: string;
  bodyTop: string;
  bodyWidth: string;
  bodyOverflow: string;
  htmlOverflow: string;
  scrollY: number;
}

let lockCount = 0;
let saved: SavedScrollState | null = null;

const getScrollContainer = () => document.getElementById('web-content-scroll');

function acquireScrollLock() {
  lockCount += 1;
  // Only the outermost lock captures state and applies styles.
  if (lockCount > 1) return;

  saved = {
    bodyPosition: document.body.style.position,
    bodyTop: document.body.style.top,
    bodyWidth: document.body.style.width,
    bodyOverflow: document.body.style.overflow,
    htmlOverflow: document.documentElement.style.overflow,
    scrollY: window.scrollY,
  };

  document.body.style.position = 'fixed';
  document.body.style.top = `-${saved.scrollY}px`;
  document.body.style.width = '100%';
  document.body.style.overflow = 'hidden';
  document.documentElement.style.overflow = 'hidden';
  getScrollContainer()?.classList.add(SCROLL_LOCK_CLASS);
}

function releaseScrollLock() {
  lockCount -= 1;
  if (lockCount > 0) return;

  // Never let an unbalanced release drive the count negative — a stuck negative count
  // would stop the next real lock from ever applying.
  lockCount = 0;
  getScrollContainer()?.classList.remove(SCROLL_LOCK_CLASS);
  if (!saved) return;

  document.body.style.position = saved.bodyPosition;
  document.body.style.top = saved.bodyTop;
  document.body.style.width = saved.bodyWidth;
  document.body.style.overflow = saved.bodyOverflow;
  document.documentElement.style.overflow = saved.htmlOverflow;

  const { scrollY } = saved;
  saved = null;
  window.scrollTo(0, scrollY);
}

/**
 * Safety net for navigation. If nothing currently holds the lock, clear any residual lock
 * outright rather than trusting that every cleanup ran.
 *
 * Back-navigation (the in-app arrow or the browser's) tears down overlays through a path
 * that has historically leaked a lock, and a stuck lock makes the whole app look frozen.
 * When lockCount > 0 an overlay is genuinely open, so this does nothing.
 */
export function releaseScrollLockIfUnheld() {
  if (lockCount > 0) return;
  saved = null;
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
  getScrollContainer()?.classList.remove(SCROLL_LOCK_CLASS);
}

export const useLockBodyScroll = (locked: boolean) => {
  useEffect(() => {
    if (!locked) {
      return;
    }
    acquireScrollLock();
    return releaseScrollLock;
  }, [locked]);
};
