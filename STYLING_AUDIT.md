## Colors
| Raw Value | Replace With |
|-----------|-------------|
| #FFFFFF & #FFF | `var(--neutral-0)` |✅
| #FCFCFC | `var(--neutral-50)` |✅
| #F5F5F5 | `var(--neutral-100)` |✅
| #E6E6E6 | `var(--neutral-200)` |✅
| #8A8F98 | `var(--neutral-400)` |✅
| #5D646F | `var(--neutral-600)` |✅
| #0E0E0E | `var(--neutral-900)` |✅
| #CC2486 | `var(--brand-pink-500)` |✅
| #951A6D | `var(--brand-pink-600)` |✅
| #FDF2F7 | `var(--brand-pink-050)` |✅
| #B88900 | `var(--status-warning-500)` |✅
| #FDECEA | `var(--status-error-050)` |✅
| rgba(14, 14, 14, 0.5) | `var(--overlay-50)` |✅
| rgba(14, 14, 14, 0.2) | `var(--overlay-20)` |✅
| text-gray-600 | `var(--neutral-600)` |✅
| text-neutral-900 | `var(--neutral-900)` |✅
| text-white | `var(--neutral-0)` |✅
| text-black | `var(--neutral-900)` |✅
| text-synth-pink | `var(--brand-pink-500)` |✅
| text-pink-600 | `var(--brand-pink-600)` |✅
| text-yellow-500 | `var(--rating-star)` |✅
| text-blue-500 | `var(--info-blue-500)` |✅
| text-green-500 | `var(--status-success-500)` |✅
| text-red-500 | `var(--status-error-500)` |✅
| text-indigo-500 | `var(--info-blue-500)` |✅
| text-purple-500 | `var(--color-purple)` |✅
| #EC4899 | `var(--brand-pink-500)` |✅
| #F472B6 | define a brand/promotion token (e.g., `--color-f472b6`) |✅
| #FF3399 | define a brighter pink token (or reuse `var(--brand-pink-500)`) |✅
| #FCE7F3 | '(--brand-pink-050)' |✅
| #EF4444 | `var(--status-error-500)` (red alert text/button fallback) |✅

## Typography
| Raw Value | Replace With |
|-----------|-------------|
| `fontSize: '35px'` | `var(--typography-h1-size)` |✅
| `fontSize: '24px'` | `var(--typography-h2-size)` |
| `fontSize: '20px'` | `var(--typography-body-size)` |
| `fontSize: '16px'` | `var(--typography-meta-size)` |
| `fontSize: '18px'` | `var(--typography-accent-size)` |
| `text-4xl` | `var(--typography-h1-size)` |
| `text-3xl` | `var(--typography-h2-size)` or `var(--typography-body-size)` depending on context |
| `text-2xl` | `var(--typography-h2-size)` |
| `text-xl` | `var(--typography-body-size)` |
| `text-lg` / `text-base` | `var(--typography-body-size)` |
| `text-sm` / `text-xs` | `var(--typography-meta-size)` |

## Spacing
| Raw Value | Replace With |
|-----------|-------------|
| 6px | `var(--spacing-inline)` |
| 12px | `var(--spacing-small)` |
| 20px | `var(--spacing-screen-margin-x)` |
| 24px | `var(--spacing-grouped)` |
| 32px | `var(--spacing-bottom-nav)` |
| 60px | `var(--spacing-big-section)` |
| 36px | `var(--size-button-height)` |
| 44px | `var(--size-input-height)` |
| `p-5` | horizontal/vertical padding should reuse `var(--spacing-screen-margin-x)` or `var(--spacing-small)`, not Tailwind shorthand |
| `px-[20px]` | `var(--spacing-screen-margin-x)` |
| `py-6` | `var(--spacing-grouped)` |
| `gap-4` | define a `--spacing-medium` token (16px) or reuse `var(--spacing-small)` when appropriate |
| `space-y-[60px]` | `var(--spacing-big-section)` |

## Border Radius
| Raw Value | Replace With |
|-----------|-------------|
| 12px | `var(--radius-corner, 10px)` |
| 16px / 20px | `var(--radius-corner, 10px)` (standard radius is 10px) |
| 50% | keep for perfect circles; wrap in `borderRadius: '50%'` as per spec |
| 999px | use for pills/badges only (fully rounded pill shape) |
| `rounded-lg`, `rounded-md`, `rounded-xl` etc. | `var(--radius-corner, 10px)` |
| `rounded-full` | keep only for chips/pills (999px) or icons (50%) |
| `rounded-[10px]` | `var(--radius-corner, 10px)` |

## Shadows
| Raw Value | Replace With |
|-----------|-------------|
| `shadow-md`, `shadow-lg`, `shadow-xl` | `var(--shadow-default)` or `var(--shadow-modal)` (only when the surface is intentionally elevated) |
| `0 2px 4px 0 var(--shadow-color)` | `var(--shadow-default)` |
| `0px 4px 4px 0px var(--shadow-color)` | `var(--shadow-default)` |
| `0 4px 12px 0 var(--shadow-color)` | `var(--shadow-modal)` |
| `shadow-[0px_4px_4px_0px_rgba(...)]` | refactor to one of the canonical shadow tokens instead of custom RGBA strings |

## Icon Sizes
| Raw Value | Replace With |
|-----------|-------------|
| 12px / 14px / 16px / 17px / 18px / 19px / 20px / 22px / 28px / 32px / 36px / 40px / 45px / 48px / 75px | use the supported icon size props: `24`, `35`, or `60` px (and wrap in a 44x44 touch target if needed) |

## Other
- Linear gradients such as `linear-gradient(135deg, var(--brand-pink-500), #f472b6)` or `background: linear-gradient(90deg, #fdf2f7 0%, #fce7f3 40%)` should reference gradient tokens (e.g., `var(--gradient-brand)` or new gradient tokens whose stops use the color variables above) instead of spreading raw hex values and Tailwind gradient helpers.
