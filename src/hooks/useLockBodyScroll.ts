import { useEffect } from 'react';

/**
 * Hook to lock document scrolling when a modal or overlay is open.
 */
export const useLockBodyScroll = (locked: boolean) => {
  useEffect(() => {
    if (!locked) {
      return;
    }

    const scrollY = window.scrollY;
    const documentElement = document.documentElement;

    // Lock scrolling and preserve layout
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      documentElement.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
};

