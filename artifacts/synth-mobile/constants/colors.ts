/**
 * Synth Mobile Color Palette
 *
 * Light theme — derived from the web design system (tokens.css).
 * Reference theme.ts for the full token system including typography,
 * spacing, radius, shadows, and sizing.
 */
const colors = {
  light: {
    // Surfaces
    background:       "#FCFCFC", // --neutral-50: base page background
    card:             "#FFFFFF", // --neutral-0: elevated cards
    surface:          "#F5F5F5", // --neutral-100: inputs, search bars
    surfaceElevated:  "#FFFFFF", // same as card on light

    // Text
    text:             "#0E0E0E", // --neutral-900: primary text
    foreground:       "#0E0E0E",
    cardForeground:   "#0E0E0E",
    mutedForeground:  "#5D646F", // --neutral-600: secondary / metadata text

    // Borders & dividers
    border:           "#E6E6E6", // --neutral-200
    input:            "#F5F5F5", // --neutral-100: input backgrounds

    // Brand
    primary:          "#CC2486", // --brand-pink-500
    primaryForeground:"#FFFFFF",
    tint:             "#CC2486",
    pink:             "#CC2486",
    pink050:          "#FDF2F7", // --brand-pink-050: subtle pink surface

    // Accent
    accent:           "#8D1FF4",
    accentForeground: "#FFFFFF",
    purple:           "#8D1FF4",

    // Semantic
    secondary:        "#F5F5F5", // --neutral-100
    secondaryForeground: "#0E0E0E",
    muted:            "#F5F5F5",

    // Status
    destructive:      "#C62828", // --status-error-500
    destructiveForeground: "#FFFFFF",

    // Tab bar
    tabBar:           "#FFFFFF", // white on light theme
  },
  dark: {
    // Keep dark palette for system dark-mode compatibility
    background:       "#0E0E0E",
    card:             "#1A1A1A",
    surface:          "#1A1A1A",
    surfaceElevated:  "#242424",
    text:             "#FFFFFF",
    foreground:       "#FFFFFF",
    cardForeground:   "#FFFFFF",
    mutedForeground:  "#A0A0A0",
    border:           "#2E2E2E",
    input:            "#1A1A1A",
    primary:          "#CC2486",
    primaryForeground:"#FFFFFF",
    tint:             "#CC2486",
    pink:             "#CC2486",
    pink050:          "#3D0B24",
    accent:           "#8D1FF4",
    accentForeground: "#FFFFFF",
    purple:           "#8D1FF4",
    secondary:        "#1A1A1A",
    secondaryForeground: "#FFFFFF",
    muted:            "#242424",
    destructive:      "#EF4444",
    destructiveForeground: "#FFFFFF",
    tabBar:           "#111111",
  },
  radius: 10, // --radius-corner
};

export default colors;
