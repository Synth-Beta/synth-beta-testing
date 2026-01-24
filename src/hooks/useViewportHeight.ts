import { useState, useEffect } from 'react';

interface ViewportHeightOptions {
  headerHeight?: number; // Height of top header/nav (default: measured dynamically)
  bottomNavHeight?: number; // Height of bottom nav (default: 80px)
  topGap?: number; // Gap between header and content (default: 12px)
  bottomGap?: number; // Gap between content and bottom nav (default: 12px)
}

/**
 * Hook to calculate available viewport height for content
 * Accounts for header, bottom nav, safe areas, and gaps
 */
export function useViewportHeight(options: ViewportHeightOptions = {}) {
  const {
    headerHeight,
    bottomNavHeight = 80,
    topGap = 12,
    bottomGap = 12,
  } = options;

  const [availableHeight, setAvailableHeight] = useState<number>(0);
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState<number>(0);

  useEffect(() => {
    const calculateHeight = () => {
      const viewportHeight = window.innerHeight;
      const safeAreaTop = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-top)') || '0', 10);
      const safeAreaBottom = parseInt(getComputedStyle(document.documentElement).getPropertyValue('env(safe-area-inset-bottom)') || '0', 10);

      // Measure header height if not provided
      let actualHeaderHeight = headerHeight || 0;
      if (!headerHeight) {
        const headerElement = document.querySelector('header, [role="banner"], .mobile-header, .swift-ui-header');
        if (headerElement) {
          const rect = headerElement.getBoundingClientRect();
          actualHeaderHeight = rect.height;
        } else {
          // Fallback: estimate header height (typically 60-80px + safe area)
          actualHeaderHeight = 60 + safeAreaTop;
        }
        setMeasuredHeaderHeight(actualHeaderHeight);
      } else {
        setMeasuredHeaderHeight(headerHeight);
      }

      // Calculate available height
      const totalUsedHeight = 
        actualHeaderHeight + 
        safeAreaTop + 
        bottomNavHeight + 
        safeAreaBottom + 
        topGap + 
        bottomGap;

      const height = viewportHeight - totalUsedHeight;
      setAvailableHeight(Math.max(0, height));
    };

    // Calculate on mount
    calculateHeight();

    // Recalculate on resize
    window.addEventListener('resize', calculateHeight);
    window.addEventListener('orientationchange', calculateHeight);

    // Also recalculate after a short delay to account for dynamic header sizing
    const timeoutId = setTimeout(calculateHeight, 100);

    return () => {
      window.removeEventListener('resize', calculateHeight);
      window.removeEventListener('orientationchange', calculateHeight);
      clearTimeout(timeoutId);
    };
  }, [headerHeight, bottomNavHeight, topGap, bottomGap]);

  return {
    availableHeight,
    headerHeight: measuredHeaderHeight,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
  };
}
