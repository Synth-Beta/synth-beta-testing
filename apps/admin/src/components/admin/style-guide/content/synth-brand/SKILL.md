---
name: synth-brand
description: Synth brand guidelines for building consistent product and marketing surfaces. Enforces official colors, typography (Inter), voice/tone, logo usage, and design tokens. Use whenever building, modifying, or reviewing any Synth web, Expo, or marketing property.
---

Version: 26.07.26


# Synth Brand Guidelines

This skill ensures every Synth surface follows the official style guide. Apply these standards to new builds and when modifying existing Synth properties.

**Live reference:** The authoritative style guide app is at [styleguide.getsynth.app](https://styleguide.getsynth.app) (admin Supabase accounts only). When in doubt, check the live guide or this skill.

## Quick Setup for New Projects

### 1. Add Inter to HTML / Expo

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

On Expo, load Inter Regular / Medium / Bold via `expo-font` (see `mobile/src/tokens/SynthTokens.ts`).

### 2. Add CSS Variables

Copy `reference/brand-tokens.css` into the project root CSS. Tokens are prefixed with `--synth-` and also alias the production names (`--brand-pink-500`, `--neutral-50`, etc.).

### 3. Tailwind (if used)

See `reference/tailwind-brand.js`. Prefer CSS variables for colors in the main Synth app; do not use Tailwind color utility classes for brand colors in production UI.

## Brand Colors

### Primary
| Name | Hex | CSS Variable | Role |
|------|-----|--------------|------|
| Brand Pink 500 | `#CC2486` | `--brand-pink-500` / `--synth-brand-pink-500` | Primary brand, CTAs, key accents |
| Brand Pink 600 | `#951A6D` | `--brand-pink-600` | Hover |
| Brand Pink 700 | `#7B1559` | `--brand-pink-700` | Active / pressed |
| Brand Pink 050 | `#FDF2F7` | `--brand-pink-050` | Soft pink surfaces |

### Accent / Gradient
| Name | Hex | Role |
|------|-----|------|
| Purple Accent | `#8D1FF4` | End stop of brand gradient only; not a dominant fill |
| Brand Gradient | `#CC2486` → `#8D1FF4` at 135deg | Hero moments, download banners, sparse celebration |

### Neutrals
| Name | Hex | Role |
|------|-----|------|
| Neutral 0 | `#FFFFFF` | Pure white |
| Neutral 50 | `#FCFCFC` | Default page background |
| Neutral 100 | `#F5F5F5` | Subtle surfaces |
| Neutral 200 | `#E6E6E6` | Borders, dividers |
| Neutral 400 | `#8A8F98` | Disabled |
| Neutral 600 | `#5D646F` | Secondary text |
| Neutral 900 | `#0E0E0E` | Primary text |

### Status
| Name | Hex | Role |
|------|-----|------|
| Success | `#2E8B63` | Success |
| Warning | `#B88900` | Warning |
| Error | `#C62828` | Error |
| Info | `#1F66EA` | Info |
| Star | `#FCDC5F` | Ratings |

### Color Rules
- Page backgrounds MUST use `--neutral-50` unless explicitly directed otherwise.
- Do not invent alternate pinks or purples. No `#00FF66`-style neon accents.
- Avoid generic purple-on-white SaaS looks as the primary theme. Pink is the protagonist; purple is gradient-only.
- Never hardcode hex in components when a token exists (except SVG files and native Theme files that cannot read CSS vars).

## Typography

- **Family:** Inter (400, 500, 600, 700)
- **H1:** 35px / 700 / line-height 1.2
- **H2:** 24px / 700 / line-height 1.3
- **Body:** 20px / 500 / line-height 1.5
- **Accent:** 20px / 700 / line-height 1.5
- **Meta / Steps:** 16px / 500 / line-height 1.5 (steps letter-spacing 0.2em)

### Typography Rules
- In the main Synth web app, do not use Tailwind typography size classes for product UI; use tokens.
- Keep body readable; do not shrink meta below 16px in primary product flows without design approval.

## Layout Tokens

| Token | Value |
|-------|-------|
| Screen margin X | 20px |
| Corner radius | 10px (pills 999px, circles 50%) |
| Button height | 36px (sm 28px) |
| Input / min touch | 44px |
| Grouped spacing | 24px |
| Big section | 60px |

## Logo

Files live in `reference/logo/`:

- `Main logo black background.png`: primary mark on dark
- `Main Lolo White background.png`: mark on light (filename preserved from asset library)
- Backup crowd variants for marketing-only contexts

### Logo Rules
- Prefer official PNGs; do not redraw the wordmark in a different typeface.
- Do not recolor the logo fill arbitrarily.
- Keep clear space; do not place busy photography through the glyph.
- Favicon / app icon should stay recognizably Synth (pink / black family).

## Brand Voice & Tone (authoritative)

**Use `reference/writing-style-guide.md` exactly.** That file is the voice, tone, grammar, and style standard for every Synth draft, prompt, product string, and marketing line. Do not invent a parallel voice. Do not soften or summarize away its rules.

Tagline framing for product marketing: **Discover, Connect, Share.** Going to shows just got easier.

Synth-specific application of the writing guide:
- Lead with the point. Active voice. Short sentences.
- Name concrete product moments (passport stamps, reviews, finding people for a show).
- Fan-native and inclusive. No gatekeeping language.
- Pink-led Synth product UI; Inter type. Avoid generic purple SaaS aesthetics in design copy.

Full rules (punctuation, vague pronouns, adverb intensifiers, banned phrases, platitudes, dropped subjects, hedged asks, hollow closings, vague time qualifiers, editing checklist) live in `reference/writing-style-guide.md`. Copy that file into agent context whenever writing copy.

## Common Mistakes
- Using Inter alternatives (Roboto, system UI) as the primary product font.
- Hardcoding `#CC2486` outside tokens / SVG / Theme.swift.
- Changing page background away from `--neutral-50` without confirmation.
- Treating purple accent as a primary fill instead of gradient end-stop.
- Writing with em dashes, en dashes, contrastive pairings, or AI filler banned in the writing style guide.
