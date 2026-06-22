/**
 * Synth Mobile Design Tokens
 *
 * Derived from the Synth web design system (tokens.css).
 * All screens and components must reference these values.
 * Never use arbitrary hex strings or hardcoded sizes in StyleSheet objects.
 *
 * TYPOGRAPHY SCALE NOTE: Web body=20px is scaled to 16px for mobile density.
 * All other ratios are preserved proportionally.
 */

// ─── COLORS ──────────────────────────────────────────────────────────────────

export const colors = {
  // Neutrals — light surface system
  neutral0: "#FFFFFF",       // pure white (cards, inputs)
  neutral50: "#FCFCFC",      // base page background
  neutral100: "#F5F5F5",     // subtle surfaces
  neutral200: "#E6E6E6",     // dividers, borders
  neutral400: "#8A8F98",     // disabled text / icons
  neutral600: "#5D646F",     // secondary text, metadata
  neutral900: "#0E0E0E",     // primary text

  // Brand pinks
  brandPink050: "#FDF2F7",   // subtle pink surface / chip bg
  brandPink500: "#CC2486",   // primary action
  brandPink600: "#951A6D",   // pressed state
  brandPink700: "#7B1559",   // active/selected

  // Status
  successBg: "#E6F4ED",
  success:   "#2E8B63",
  warningBg: "#FFF6D6",
  warning:   "#B88900",
  errorBg:   "#FDECEA",
  error:     "#C62828",

  // Info
  infoBg:    "#F0F6FE",
  info:      "#1F66EA",

  // Overlay / scrim
  overlay50: "rgba(14, 14, 14, 0.5)",
  overlay20: "rgba(14, 14, 14, 0.2)",

  // Rating
  star: "#FCDC5F",

  // Avatar palette (unchanged — brand/product decision)
  avatarPalette: ["#CC2486", "#8D1FF4", "#0EA5E9", "#22C55E", "#F59E0B", "#EF4444"],
} as const;

// ─── SEMANTIC ALIASES (what the UI actually references) ──────────────────────

export const semantic = {
  background:         colors.neutral50,    // every screen root bg
  surface:            colors.neutral100,   // inputs, search bars
  card:               colors.neutral0,     // elevated cards
  border:             colors.neutral200,   // all dividers
  text:               colors.neutral900,   // heading / body copy
  textSecondary:      colors.neutral600,   // muted / metadata
  textDisabled:       colors.neutral400,   // disabled states
  primary:            colors.brandPink500, // CTAs, active icons, dots
  primaryPressed:     colors.brandPink600, // pressed CTA
  primarySurface:     colors.brandPink050, // chip / tag backgrounds
  tabBar:             colors.neutral0,     // tab bar bg (solid on Android/web)
  tabBarBorder:       colors.neutral200,   // tab bar top border
  tabActive:          colors.brandPink500, // active tab icon + label
  tabInactive:        colors.neutral600,   // inactive tab icon + label
} as const;

// ─── TYPOGRAPHY ──────────────────────────────────────────────────────────────
// Derived from web: H1=35, H2=24, body=20, meta=16
// Mobile scale: ÷1.25 ≈ H1→28, H2→19, body→16, meta→13

export const typography = {
  fontFamily: {
    regular:   "Inter_400Regular",
    medium:    "Inter_500Medium",
    semiBold:  "Inter_600SemiBold",
    bold:      "Inter_700Bold",
  },

  // Heading H1 — screen wordmarks, page heroes
  h1: {
    fontSize:   28,
    fontFamily: "Inter_700Bold",
    color:      colors.neutral900,
    letterSpacing: -0.5,
  },

  // Heading H2 — section titles, card event names
  h2: {
    fontSize:   19,
    fontFamily: "Inter_700Bold",
    color:      colors.neutral900,
  },

  // Body — primary readable text
  body: {
    fontSize:   16,
    fontFamily: "Inter_500Medium",
    color:      colors.neutral900,
  },

  // Body regular variant — supporting copy
  bodyRegular: {
    fontSize:   15,
    fontFamily: "Inter_400Regular",
    color:      colors.neutral900,
  },

  // Meta — captions, timestamps, genre labels
  meta: {
    fontSize:   13,
    fontFamily: "Inter_400Regular",
    color:      colors.neutral600,
  },

  // Steps / labels — uppercase small caps (section headers)
  steps: {
    fontSize:        13,
    fontFamily:      "Inter_500Medium",
    color:           colors.neutral600,
    letterSpacing:   0.5,
    textTransform:   "uppercase" as const,
  },
} as const;

// ─── SPACING ─────────────────────────────────────────────────────────────────
// Matches web tokens exactly (px = dp on mobile)

export const spacing = {
  inline:        6,    // --spacing-inline
  small:        12,    // --spacing-small
  grouped:      24,    // --spacing-grouped
  bigSection:   60,    // --spacing-big-section
  screenMarginX: 20,   // --spacing-screen-margin-x
  menuItemHeight: 48,  // --spacing-menu-item-row-height
  // Bottom nav: 80px tab bar + 32px breathing room = 112px list padding-bottom
  bottomNav:   112,    // --spacing-bottom-nav
  bottomNavGap: 32,    // --spacing-bottom-nav-gap
} as const;

// ─── BORDER RADIUS ───────────────────────────────────────────────────────────

export const radius = {
  corner: 10,    // --radius-corner — standard cards, inputs, modals
  pill:   999,   // chips, follow buttons, badges
  // Circular: use (size / 2) inline — e.g. avatar 50×50 → borderRadius: 25
} as const;

// ─── SHADOWS (React Native format) ───────────────────────────────────────────

export const shadows = {
  // --shadow-default: 0 4px 4px 0 rgba(0,0,0,0.25)
  default: {
    shadowColor:   "#000000",
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius:  4,
    elevation:     4,
  },
  // --shadow-modal: 0 4px 12px 0 rgba(0,0,0,0.25)
  modal: {
    shadowColor:   "#000000",
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius:  12,
    elevation:     8,
  },
} as const;

// ─── SIZING ──────────────────────────────────────────────────────────────────

export const sizing = {
  buttonHeight:    36,   // --size-button-height
  buttonHeightSm:  28,   // --size-button-height-sm
  inputHeight:     44,   // --size-input-height
  iconSmall:       22,   // small nav/inline icons
  iconMedium:      24,   // standard icons
  iconLarge:       40,   // empty-state icons
  avatarSmall:     36,
  avatarMedium:    50,
  avatarLarge:     88,
} as const;

// ─── CONVENIENCE EXPORT ───────────────────────────────────────────────────────

const theme = { colors, semantic, typography, spacing, radius, shadows, sizing };
export default theme;
