/**
 * Glassmorphism Design System
 * 
 * SwiftUI-inspired glassmorphism and liquid glass effects for iOS-native design.
 * All styles optimized for iOS phone dimensions (390x844px iPhone 14 baseline).
 */

import type { CSSProperties } from 'react';

// ============================================
// iOS DIMENSIONS & SAFE AREAS
// ============================================

export const iosDimensions = {
  /** iPhone 14 baseline width */
  screenWidth: 390,
  /** iPhone 14 baseline height */
  screenHeight: 844,
  /** Standard iOS status bar height */
  statusBarHeight: 47,
  /** Standard iOS home indicator height */
  homeIndicatorHeight: 34,
  /** Minimum touch target size per Apple HIG */
  minTouchTarget: 44,
};

// ============================================
// GLASSMORPHISM BASE STYLES
// ============================================

/** Base glassmorphism card style */
export const glassCard: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.7)',
  backdropFilter: 'blur(40px) saturate(180%)',
  WebkitBackdropFilter: 'blur(40px) saturate(180%)',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  boxShadow: `
    0 8px 32px 0 rgba(0, 0, 0, 0.1),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.5),
    inset 0 -1px 0 0 rgba(0, 0, 0, 0.05)
  `.trim(),
  borderRadius: 16,
};

/** Light glassmorphism for subtle elements */
export const glassCardLight: CSSProperties = {
  background: 'rgba(255, 255, 255, 0.5)',
  backdropFilter: 'blur(20px) saturate(150%)',
  WebkitBackdropFilter: 'blur(20px) saturate(150%)',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  boxShadow: `
    0 4px 16px 0 rgba(0, 0, 0, 0.08),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.4)
  `.trim(),
  borderRadius: 12,
};

/** Darker glassmorphism for contrast */
export const glassCardDark: CSSProperties = {
  background: 'rgba(0, 0, 0, 0.3)',
  backdropFilter: 'blur(40px) saturate(180%)',
  WebkitBackdropFilter: 'blur(40px) saturate(180%)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
  boxShadow: `
    0 8px 32px 0 rgba(0, 0, 0, 0.3),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.1)
  `.trim(),
  borderRadius: 16,
};

// ============================================
// LIQUID GLASS EFFECTS
// ============================================

/** Liquid glass gradient background */
export const liquidGlass: CSSProperties = {
  background: `linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.8) 0%,
    rgba(255, 255, 255, 0.6) 50%,
    rgba(255, 255, 255, 0.4) 100%
  )`,
  backdropFilter: 'blur(40px) saturate(180%)',
  WebkitBackdropFilter: 'blur(40px) saturate(180%)',
  border: '1px solid rgba(255, 255, 255, 0.4)',
  boxShadow: `
    0 8px 32px 0 rgba(0, 0, 0, 0.1),
    inset 0 2px 4px 0 rgba(255, 255, 255, 0.8),
    inset 0 -2px 4px 0 rgba(0, 0, 0, 0.05)
  `.trim(),
  borderRadius: 20,
};

/** Liquid glass button style */
export const liquidGlassButton: CSSProperties = {
  background: `linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.9) 0%,
    rgba(255, 255, 255, 0.7) 100%
  )`,
  backdropFilter: 'blur(20px) saturate(150%)',
  WebkitBackdropFilter: 'blur(20px) saturate(150%)',
  border: '1px solid rgba(255, 255, 255, 0.5)',
  boxShadow: `
    0 4px 12px 0 rgba(0, 0, 0, 0.1),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.8)
  `.trim(),
  borderRadius: 12,
};

// ============================================
// iOS MODAL STYLES
// ============================================

/** Full-screen iOS modal container */
export const iosModal: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: '100%',
  maxWidth: 390,
  height: '100vh',
  margin: '0 auto',
  background: 'var(--neutral-50, #FCFCFC)',
  paddingTop: 'env(safe-area-inset-top, 47px)',
  paddingBottom: 'env(safe-area-inset-bottom, 34px)',
  overflowY: 'auto',
  overflowX: 'hidden',
  WebkitOverflowScrolling: 'touch',
  // Base z-index for modals; can be overridden per-usage to allow app chrome above them.
  zIndex: 30,
};

/** iOS modal backdrop */
export const iosModalBackdrop: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.4)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  zIndex: 999,
};

/** iOS-style navigation header */
export const iosHeader: CSSProperties = {
  position: 'sticky',
  top: 0,
  left: 0,
  right: 0,
  height: 56,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '0 16px',
  background: 'rgba(255, 255, 255, 0.85)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  borderBottom: '0.5px solid rgba(0, 0, 0, 0.1)',
  zIndex: 10,
};

/** iOS-style bottom action bar */
export const iosBottomBar: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  maxWidth: 390,
  margin: '0 auto',
  padding: '12px 20px',
  paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 34px))',
  background: 'rgba(255, 255, 255, 0.9)',
  backdropFilter: 'blur(20px) saturate(180%)',
  WebkitBackdropFilter: 'blur(20px) saturate(180%)',
  borderTop: '0.5px solid rgba(0, 0, 0, 0.1)',
  zIndex: 10,
};

// ============================================
// iOS BUTTON STYLES
// ============================================

/** Primary action button (brand pink) */
export const iosPrimaryButton: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 50,
  minWidth: 44,
  padding: '0 24px',
  background: 'var(--brand-pink-500, #CC2486)',
  color: '#FFFFFF',
  fontSize: 17,
  fontWeight: 600,
  borderRadius: 12,
  border: 'none',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

/** Secondary action button */
export const iosSecondaryButton: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 50,
  minWidth: 44,
  padding: '0 24px',
  background: 'rgba(255, 255, 255, 0.8)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  color: 'var(--brand-pink-500, #CC2486)',
  fontSize: 17,
  fontWeight: 600,
  borderRadius: 12,
  border: '1px solid rgba(204, 36, 134, 0.3)',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

/** Icon button (circular) */
export const iosIconButton: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 44,
  height: 44,
  background: 'rgba(255, 255, 255, 0.6)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  borderRadius: '50%',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

// ============================================
// HERO IMAGE STYLES
// ============================================

/** Hero image container */
export const heroImageContainer: CSSProperties = {
  position: 'relative',
  width: '100%',
  aspectRatio: '16 / 9',
  overflow: 'hidden',
  borderRadius: 0,
};

/** Hero image gradient overlay */
export const heroGradientOverlay: CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  height: '60%',
  background: 'linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, transparent 100%)',
  pointerEvents: 'none',
};

/** Hero image content overlay (for text on image) */
export const heroContentOverlay: CSSProperties = {
  position: 'absolute',
  bottom: 0,
  left: 0,
  right: 0,
  padding: '20px',
  color: '#FFFFFF',
};

// ============================================
// INFO CARD STYLES
// ============================================

/** Info row container (icon + text) */
export const infoRow: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
  padding: '12px 0',
};

/** Info row icon container */
export const infoRowIcon: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  background: 'rgba(204, 36, 134, 0.1)',
  borderRadius: 10,
  flexShrink: 0,
};

/** Stat card for numbers */
export const statCard: CSSProperties = {
  ...glassCardLight,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px 12px',
  minWidth: 80,
  textAlign: 'center',
};

// ============================================
// SECTION STYLES
// ============================================

/** Content section container */
export const section: CSSProperties = {
  padding: '0 20px',
  marginBottom: 24,
};

/** Section header */
export const sectionHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 12,
};

/** Section title */
export const sectionTitle: CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: 'var(--neutral-900, #0E0E0E)',
  margin: 0,
};

/** Divider line */
export const divider: CSSProperties = {
  height: 0.5,
  background: 'rgba(0, 0, 0, 0.1)',
  margin: '0 20px',
};

// ============================================
// TEXT STYLES
// ============================================

export const textStyles = {
  /** Large title (hero, modal title) */
  largeTitle: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1.2,
    letterSpacing: -0.5,
  } as CSSProperties,
  
  /** Title 1 (section headers) */
  title1: {
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.3,
  } as CSSProperties,
  
  /** Title 2 (card titles) */
  title2: {
    fontSize: 18,
    fontWeight: 600,
    lineHeight: 1.3,
  } as CSSProperties,
  
  /** Title 3 (subsection) */
  title3: {
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.4,
  } as CSSProperties,
  
  /** Body text */
  body: {
    fontSize: 16,
    fontWeight: 400,
    lineHeight: 1.5,
  } as CSSProperties,
  
  /** Callout text */
  callout: {
    fontSize: 15,
    fontWeight: 500,
    lineHeight: 1.4,
  } as CSSProperties,
  
  /** Subhead text */
  subhead: {
    fontSize: 14,
    fontWeight: 500,
    lineHeight: 1.4,
  } as CSSProperties,
  
  /** Footnote text */
  footnote: {
    fontSize: 13,
    fontWeight: 400,
    lineHeight: 1.4,
    color: 'var(--neutral-600, #5D646F)',
  } as CSSProperties,
  
  /** Caption text */
  caption: {
    fontSize: 12,
    fontWeight: 400,
    lineHeight: 1.3,
    color: 'var(--neutral-600, #5D646F)',
  } as CSSProperties,
};

// ============================================
// BADGE STYLES
// ============================================

/** Genre/category badge */
export const badge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  background: 'rgba(204, 36, 134, 0.1)',
  color: 'var(--brand-pink-500, #CC2486)',
  fontSize: 13,
  fontWeight: 500,
  borderRadius: 8,
};

/** Status badge (upcoming, past, etc.) */
export const statusBadge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '4px 10px',
  background: 'rgba(46, 139, 99, 0.1)',
  color: 'var(--status-success-500, #2E8B63)',
  fontSize: 12,
  fontWeight: 600,
  borderRadius: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.5,
};

// ============================================
// ANIMATION CONSTANTS
// ============================================

export const animations = {
  /** Standard iOS spring timing */
  springTiming: 'cubic-bezier(0.4, 0, 0.2, 1)',
  /** Fast interaction feedback */
  fastDuration: '0.15s',
  /** Standard transition */
  standardDuration: '0.25s',
  /** Slow/emphasized transition */
  slowDuration: '0.4s',
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Creates hover state styles for glassmorphism elements
 */
export const createHoverStyles = (baseStyles: CSSProperties): {
  base: CSSProperties;
  hover: CSSProperties;
} => ({
  base: {
    ...baseStyles,
    transition: `all ${animations.standardDuration} ${animations.springTiming}`,
  },
  hover: {
    transform: 'translateY(-2px)',
    boxShadow: `
      0 12px 40px 0 rgba(0, 0, 0, 0.12),
      0 4px 12px 0 rgba(0, 0, 0, 0.08),
      inset 0 1px 0 0 rgba(255, 255, 255, 0.8)
    `.trim(),
  },
});

/**
 * Creates pressed state styles for buttons
 */
export const createPressedStyles = (): CSSProperties => ({
  transform: 'scale(0.97)',
  opacity: 0.9,
});

/**
 * Combines multiple style objects
 */
export const combineStyles = (...styles: (CSSProperties | undefined)[]): CSSProperties => {
  return styles.reduce<CSSProperties>((acc, style) => {
    if (style) {
      return { ...acc, ...style };
    }
    return acc;
  }, {});
};

// ============================================
// CARD COMPONENT PRESETS
// ============================================

/** Complete event card preset */
export const eventCardPreset = {
  container: {
    ...glassCard,
    padding: 0,
    overflow: 'hidden',
    cursor: 'pointer',
  } as CSSProperties,
  image: {
    width: '100%',
    aspectRatio: '16 / 10',
    objectFit: 'cover',
  } as CSSProperties,
  content: {
    padding: 16,
  } as CSSProperties,
  title: {
    ...textStyles.title2,
    color: 'var(--neutral-900, #0E0E0E)',
    marginBottom: 4,
  } as CSSProperties,
  subtitle: {
    ...textStyles.callout,
    color: 'var(--brand-pink-500, #CC2486)',
    marginBottom: 12,
  } as CSSProperties,
  meta: {
    ...textStyles.footnote,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  } as CSSProperties,
  actions: {
    display: 'flex',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTop: '0.5px solid rgba(0, 0, 0, 0.1)',
  } as CSSProperties,
};

/** Complete detail modal preset */
export const detailModalPreset = {
  backdrop: iosModalBackdrop,
  container: iosModal,
  header: iosHeader,
  heroContainer: heroImageContainer,
  heroGradient: heroGradientOverlay,
  heroContent: heroContentOverlay,
  content: {
    padding: '20px 0',
  } as CSSProperties,
  section,
  sectionHeader,
  sectionTitle,
  bottomBar: iosBottomBar,
  primaryButton: iosPrimaryButton,
  secondaryButton: iosSecondaryButton,
};
