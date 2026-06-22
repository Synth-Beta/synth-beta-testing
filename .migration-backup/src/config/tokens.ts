/**
 * Synth Design Tokens - TypeScript Constants
 * 
 * TypeScript constants for design tokens that need to be used in code.
 * For CSS values, use the CSS variables defined in src/styles/tokens.css
 * 
 * These constants are useful for:
 * - Spacing calculations in JavaScript/TypeScript
 * - Icon sizes
 * - Component prop defaults
 * - Type-safe design values
 */

/**
 * Spacing Tokens (in pixels)
 * Use these for inline styles, calculations, or when CSS variables aren't available
 */
export const spacing = {
  inline: 6,
  small: 12,
  grouped: 24,
  bigSection: 60,
  screenMarginX: 20,
  menuItemRowHeight: 48,
  bottomNav: 112, // Total space reserved at bottom (nav height + breathing room)
  bottomNavGap: 32, // Gap between content and bottom navigation
} as const;

/**
 * Sizing Tokens (in pixels)
 */
export const sizing = {
  buttonHeight: 36,
  inputHeight: 44,
  popupWidth: 'calc(100vw - 40px)',
} as const;

/**
 * Radius Tokens (in pixels)
 */
export const radii = {
  corner: 10,
} as const;

/**
 * Typography Tokens
 */
export const typography = {
  h1: {
    size: 35,
    weight: 700, // bold
    lineHeight: 1.2,
  },
  h2: {
    size: 24,
    weight: 700, // bold
    lineHeight: 1.3,
  },
  body: {
    size: 20,
    weight: 500, // medium
    lineHeight: 1.5,
  },
  accent: {
    size: 20,
    weight: 700, // bold
    lineHeight: 1.5,
  },
  steps: {
    size: 16,
    weight: 500, // medium
    lineHeight: 1.5,
    letterSpacing: 0.2, // 0.2em = 20% of font size
  },
  meta: {
    size: 16,
    weight: 500, // medium
    lineHeight: 1.5,
  },
} as const;

/**
 * Color Tokens
 * Use CSS variables in styles, but these are available for TypeScript usage
 */
export const colors = {
  offWhite: 'var(--neutral-50)',
  offBlack: 'var(--neutral-900)',
  offBlack50: 'rgba(14, 14, 14, 0.5)',
  grey50: 'rgba(201, 201, 201, 0.5)',
  lightGrey: '#C9C9C9',
  darkGrey: 'var(--neutral-600)',
  synthPink: 'var(--brand-pink-500)',
  darkPink: 'var(--brand-pink-600)',
  mediumPink: '#B00056',
  lightPink: 'var(--brand-pink-050)',
  purple: '#8D1FF4',
  lilac: '#D9D3E1',
  darkBlue: '#1F66EA',
  lightBlue: '#F0F6FE',
  spotify: '#1DB954',
  successGreen: '#429A6E',
  lightGreen: '#DFF3E6',
  yellow: '#FCDC5F',
  red: '#E51010',
} as const;

/**
 * Gradient Tokens
 * CSS gradient strings for use in inline styles
 */
export const gradients = {
  pinkPurple: 'linear-gradient(135deg, var(--brand-pink-500) 0%, #8D1FF4 100%)',
  appleMusic: 'linear-gradient(135deg, #FF4E6B 0%, #FF0436 100%)',
} as const;

export const shadows = {
  color: 'rgba(0, 0, 0, 0.25)',
  default: '0 4px 4px 0 rgba(0, 0, 0, 0.25)',
  modal: '0 4px 12px 0 rgba(0, 0, 0, 0.25)',
} as const;

export const borders = {
  default: '1px solid var(--neutral-200)',
  brand: '2px solid var(--brand-pink-500)',
} as const;

export const zIndices = {
  nav: 80,
  overlay: 90,
  modal: 100,
} as const;

/**
 * Icon Size Tokens (common icon sizes in pixels)
 */
export const iconSizes = {
  small: 24,
  medium: 35,
  large: 60,
} as const;

/**
 * Type exports for type safety
 */
export type Spacing = typeof spacing;
export type Sizing = typeof sizing;
export type Radii = typeof radii;
export type Typography = typeof typography;
export type Colors = typeof colors;
export type Gradients = typeof gradients;
export type Shadows = typeof shadows;
export type Borders = typeof borders;
export type ZIndices = typeof zIndices;
export type IconSizes = typeof iconSizes;

