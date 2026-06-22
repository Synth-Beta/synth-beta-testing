---
name: Synth Design System Compliance
description: Key rules and violations found/fixed during design system audit; what to watch for in future edits.
---

## Core rules

- All page backgrounds: `var(--neutral-50)`. Never hardcoded hex or Tailwind color classes.
- No animated gradient body background (`elegant-shift` keyframe was removed from index.css).
- Typography: use CSS variable classes (`type-h1`, `type-h2`, `type-body`, `type-meta`) or inline styles with tokens. Never Tailwind `text-xl`, `text-2xl`, etc.
- Spacing: only `--spacing-inline` (6px), `--spacing-small` (12px), `--spacing-grouped` (24px), `--spacing-big-section` (60px), `--spacing-screen-margin-x` (20px). No arbitrary px values.
- Border radius: `var(--radius-corner, 10px)` for all standard elements; `999px` for pills/chips; `50%` for circles.
- Shadows: `var(--shadow-default)` for buttons/modals only. No Tailwind shadow classes.
- `--spacing-bottom-nav` was wrong (32px) — corrected to 112px (80px nav + 32px gap). `--spacing-bottom-nav-gap` = 32px.

## Token additions in tokens.css

Added: `--shadow-default`, `--shadow-modal`, `--border-default`, `--border-brand`, `--z-index-nav/overlay/modal` (canonical names alongside legacy `--z-nav` aliases), `--spacing-bottom-nav-gap`.

## CSS class fixes in index.css

- `glass-card`, `glass-nav`, `glass-header` — replaced Tailwind glassmorphism with token-based styles.
- `synth-card`, `synth-input`, `synth-badge`, `synth-logo` — removed Tailwind classes, switched to tokens.
- `gradient-text`, `gradient-text-bold` — replaced Tailwind gradient classes with `var(--gradient-brand)`.
- Removed duplicate `glass-nav` definition (two conflicting blocks existed).
- Body animated gradient background (`elegant-shift`) removed — violated `--neutral-50` page background rule.
- Dead `elegant-shift` keyframe injection in `Auth.tsx` removed.

## Mobile theme (Phase 4)

The mobile app was converted from dark (`#0E0E0E`) to light (`#FCFCFC`) to match the web.
- `constants/theme.ts` is the authoritative mobile token file — all new screens must import from it.
- `constants/colors.ts` holds the light/dark palettes consumed by `useColors()` hook.
- Dark palette is preserved in `colors.dark` for system dark-mode compatibility.
- Typography scaled: web body 20px → mobile 16px (÷1.25 ratio across all sizes).
- `pink050` (#FDF2F7) added to colors palette — use instead of `primary + "33"` for avatar/icon bgs.
- Avatar overlay opacity changed from 33 → 22 (lighter on white background).
- BlurView tint changed from "dark" → "light" in `_layout.tsx` for iOS tab bar.
- `paddingBottom` for all list `contentContainerStyle`: 100/120 → 112 (matches `--spacing-bottom-nav`).
- `borderRadius` standardized: cards=10, pill buttons=999, avatars = size/2.

## Glass/glassmorphism pattern

`swift-ui-card` class (in index.css) uses `color-mix()` for glassmorphism — this is the approved pattern for SwiftUI-inspired cards only. Generic cards should use `var(--neutral-50)` background.

**Why:** The design system explicitly requires `--neutral-50` for all page backgrounds and most card surfaces. Glassmorphism is reserved for the SwiftUI-inspired event feed card only.
