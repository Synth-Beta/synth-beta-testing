import { useWebLayoutMode } from './useWebLayoutMode';

/**
 * Width of the persistent left navigation rail shown on desktop web (WebDesktopRail).
 * Full-bleed detail modals (Artist/Venue/Event) must offset by this on web-desktop so
 * they don't render on top of the rail.
 */
export const DESKTOP_RAIL_WIDTH = 220;

/**
 * Stacking order for the Artist/Venue detail overlays and their internal header.
 * These intentionally sit far above the documented --z-index-nav/-overlay/-modal tokens
 * (80/90/100, see src/styles/tokens.css) because on mobile they must render above the
 * bottom nav and MobileHeader chrome; the 6000+ tier preserves that guarantee. Values are
 * unchanged from the previous per-file literals — this only gives them one shared name.
 */
export const DETAIL_MODAL_Z = {
  /** Backdrop when the modal supplies its own header (no outer MobileHeader present). */
  backdropOwnHeader: 6000,
  /** Backdrop when an outer MobileHeader/app chrome should stay visible above it. */
  backdropNested: 25,
  /** Modal content when it supplies its own header. */
  contentOwnHeader: 6001,
  /** Modal content when nested under an outer header. */
  contentNested: 26,
  /** The modal's own internal sticky header bar. */
  internalHeader: 7000,
} as const;

/** Stacking order for EventDetailsModal's own (lower) chrome — see EventDetailsModal.tsx. */
export const EVENT_MODAL_Z = {
  backdrop: 55,
  container: 60,
  header: 5000,
} as const;

/**
 * Resolves whether the app is in the web-desktop layout (persistent left rail, no bottom
 * nav/mobile header) and the rail width full-bleed modals must offset by. Centralizes what
 * was previously duplicated across ArtistDetailModal/VenueDetailModal/EventDetailsModal.
 */
export function useDetailModalLayout() {
  const layoutMode = useWebLayoutMode();
  const isWebDesktop = layoutMode === 'web-desktop';
  return { isWebDesktop, railWidth: DESKTOP_RAIL_WIDTH };
}
