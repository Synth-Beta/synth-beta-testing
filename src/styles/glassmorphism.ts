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

/** Base card style — token-compliant */
export const glassCard: CSSProperties = {
  background: 'var(--neutral-50)',
  border: 'var(--border-default)',
  boxShadow: 'var(--shadow-default)',
  borderRadius: 'var(--radius-corner, 10px)' as unknown as number,
};

/** Light card style — token-compliant */
export const glassCardLight: CSSProperties = {
  background: 'var(--neutral-100)',
  border: 'var(--border-default)',
  boxShadow: 'var(--shadow-default)',
  borderRadius: 'var(--radius-corner, 10px)' as unknown as number,
};

/** Dark card style — token-compliant */
export const glassCardDark: CSSProperties = {
  background: 'var(--neutral-900)',
  border: '1px solid var(--neutral-700)',
  boxShadow: 'var(--shadow-default)',
  borderRadius: 'var(--radius-corner, 10px)' as unknown as number,
};

// ============================================
// LIQUID GLASS EFFECTS
// ============================================

/** Card with subtle brand tint — token-compliant */
export const liquidGlass: CSSProperties = {
  background: 'var(--neutral-50)',
  border: 'var(--border-default)',
  boxShadow: 'var(--shadow-default)',
  borderRadius: 'var(--radius-corner, 10px)' as unknown as number,
};

/** Button base style — token-compliant */
export const liquidGlassButton: CSSProperties = {
  background: 'var(--neutral-50)',
  border: 'var(--border-default)',
  boxShadow: 'var(--shadow-default)',
  borderRadius: 'var(--radius-corner, 10px)' as unknown as number,
  cursor: 'pointer',
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
  background: 'var(--neutral-50, var(--neutral-50))',
  paddingTop: 'env(safe-area-inset-top, 47px)',
  paddingBottom: 'env(safe-area-inset-bottom, 34px)',
  overflowY: 'auto',
  overflowX: 'hidden',
  WebkitOverflowScrolling: 'touch',
  // Base z-index for modals; can be overridden per-usage to allow app chrome above them.
  zIndex: 30,
};

/** Modal backdrop */
export const iosModalBackdrop: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  zIndex: 999,
};

/** Sticky navigation header — token-compliant */
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
  background: 'var(--neutral-50)',
  borderBottom: 'var(--border-default)',
  zIndex: 200,
};

/** Bottom action bar — token-compliant */
export const iosBottomBar: CSSProperties = {
  position: 'fixed',
  bottom: 0,
  left: 0,
  right: 0,
  maxWidth: 390,
  margin: '0 auto',
  padding: '12px 20px',
  paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 34px))',
  background: 'var(--neutral-50)',
  borderTop: 'var(--border-default)',
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
  background: 'var(--brand-pink-500)',
  color: 'var(--neutral-0)',
  fontSize: 17,
  fontWeight: 600,
  borderRadius: 12,
  border: 'none',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

/** Secondary action button — token-compliant */
export const iosSecondaryButton: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 50,
  minWidth: 44,
  padding: '0 24px',
  background: 'var(--neutral-50)',
  color: 'var(--brand-pink-500)',
  fontSize: 17,
  fontWeight: 600,
  borderRadius: 'var(--radius-corner, 10px)' as unknown as number,
  border: 'var(--border-brand)',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
};

/** Icon button (circular) — token-compliant */
export const iosIconButton: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 44,
  height: 44,
  background: 'var(--neutral-100)',
  borderRadius: '50%',
  border: 'var(--border-default)',
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
  color: 'var(--neutral-0)',
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
  color: 'var(--neutral-900, var(--neutral-900))',
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
    color: 'var(--neutral-600, var(--neutral-600))',
  } as CSSProperties,
  
  /** Caption text */
  caption: {
    fontSize: 12,
    fontWeight: 400,
    lineHeight: 1.3,
    color: 'var(--neutral-600, var(--neutral-600))',
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
  color: 'var(--brand-pink-500)',
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
    color: 'var(--neutral-900, var(--neutral-900))',
    marginBottom: 4,
  } as CSSProperties,
  subtitle: {
    ...textStyles.callout,
    color: 'var(--brand-pink-500)',
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
