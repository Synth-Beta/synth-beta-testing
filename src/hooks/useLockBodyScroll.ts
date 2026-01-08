import { useEffect } from 'react';

/**
 * Hook to lock body scroll when menu is open
 * Prevents background scrolling while overlay is visible
 */
export const useLockBodyScroll = (locked: boolean) => {
  useEffect(() => {
    if (locked) {
      // Save current scroll position
      const scrollY = window.scrollY;
      
      // Lock body scroll
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      
      return () => {
        // Restore scroll position
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.body.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [locked]);
};

