# Design System + Style Guide

## Purpose

This document is the authoritative design system and style guide for the Synth app. It defines the intended UI rules, tokens, and patterns that all code should follow.

**How to use this guide:**
- Reference this document when building new features or modifying existing UI
- If code conflicts with this guide, follow the code until the design is updated, then update this document
- When unsure about a value, check this guide first, then check `src/styles/tokens.css` for the actual token definitions

**How to update this guide:**
- When design tokens change, update both `src/styles/tokens.css` and this document
- When new patterns emerge, document them here
- Marked anything not yet standardized as "Not standardized yet" or "TBD"

## Source of Truth

This document defines the intended UI rules. The actual implementation lives in:
- `src/styles/tokens.css` - CSS variable definitions
- `src/config/tokens.ts` - TypeScript token exports
- Component files - Actual implementations

If code conflicts with this guide, follow the code until the design is updated, then update this document.

## Not Standardized Yet

The following areas are not yet fully standardized and may have inconsistent implementations:

- **Animation/Motion**: No standardized animation system. Transitions exist but are not documented.
- **Form validation**: Error states and validation messages are not standardized.
- **Loading states**: Spinner and skeleton patterns are not standardized.
- **Toast notifications**: Toast/alert notification system is not standardized.
- **Tooltips**: Tooltip component and usage patterns are not standardized.

---

## Do/Don't Quick Rules

**Before opening a PR, check:**

- [ ] All typography uses design tokens (no Tailwind text classes)
- [ ] All spacing uses design tokens (no arbitrary values)
- [ ] All colors use design tokens (no hardcoded hex or Tailwind colors)
- [ ] All buttons follow button guidelines (height, padding, radius, shadow)
- [ ] All icons use standard sizes (16px, 24px, 35px, 60px)
- [ ] All corner radius values are 10px (except chips/pills which use 999px, and circular elements which use 50%)
- [ ] Everything that is supposed to be clickable should meet 44px × 44px minimum touch target
- [ ] All pages use 20px horizontal margins
- [ ] All content accounts for safe area insets on mobile, there should be no non-decoritive content overlapping with safe areas
- [ ] All page backgrounds use `--neutral-50` (unless explicitly told otherwise, and even then confirm before changing)

**MUST:**
- Use CSS variables from `src/styles/tokens.css`
- Use inline styles with CSS variables in React components
- Follow spacing, typography, and color tokens exactly
- **Page Backgrounds**: All page backgrounds MUST use `var(--neutral-50)`. Do NOT change page backgrounds to any other color unless explicitly requested by the user, and even then, confirm that the user wants a different background color before making the change.

**SHOULD:**
- Use design system components (SynthButton, Icon, EmptyState, etc) when available
- Follow existing patterns when adding new features
- Document new patterns if they become standard

**MAY:**
- Use Tailwind for layout utilities (flex, grid, positioning)
- Use Tailwind for responsive breakpoints
- Create custom components when design system components don't fit

**MUST NOT:**
- Use Tailwind typography classes (`text-4xl`, `text-2xl`, `text-xl`, `text-lg`, `text-base`, `text-sm`, `text-xs`)
- Use Tailwind color classes (`text-gray-600`, `bg-pink-500`, etc.)
- Use arbitrary spacing values (`8px`, `10px`, `16px`, `18px`, `32px`, etc.)
- Use arbitrary corner radius values (`4px`, `8px`, `12px`, `16px`, etc.)
- Use hardcoded hex colors (except in tokens.css)

---

## 1. Foundations

### Color Palette

All colors MUST use design tokens from `src/styles/tokens.css`. Never use hardcoded hex values or Tailwind color classes.

#### Neutrals

| Token | Value | Usage | Do Not Use For |
|-------|-------|-------|----------------|
| `--neutral-0` | `#FFFFFF` | Pure white | General backgrounds (use neutral-50) |
| `--neutral-50` | `#FCFCFC` | Base app background, surfaces, cards | Text |
| `--neutral-100` | `#F5F5F5` | Subtle surfaces, cards | Text, borders |
| `--neutral-200` | `#E6E6E6` | Dividers, borders | Text, backgrounds |
| `--neutral-400` | `#8A8F98` | Disabled text/icons | Active text, primary actions |
| `--neutral-600` | `#5D646F` | Secondary text, metadata, icons | Primary text, headings |
| `--neutral-900` | `#0E0E0E` | Primary text, headings | Backgrounds, borders |

**Semantic Usage:**
- **Background**: `--neutral-50` for page backgrounds, `--neutral-100` for card backgrounds
- **Surface**: `--neutral-50` for modals, `--neutral-100` for subtle surfaces
- **Text Primary**: `--neutral-900` for body text and headings
- **Text Secondary**: `--neutral-600` for metadata, captions, timestamps
- **Text Disabled**: `--neutral-400` for disabled state text
- **Borders/Dividers**: `--neutral-200` for borders and dividers

#### Brand Pinks

| Token | Value | Usage | Do Not Use For |
|-------|-------|-------|----------------| 
| `--brand-pink-050` | `#FDF2F7` | Subtle pink surface, hover states | Text, borders |
| `--brand-pink-500` | `#CC2486` | Primary brand color, buttons, links | Backgrounds (except buttons) |
| `--brand-pink-600` | `#951A6D` | Hover states | Default states |
| `--brand-pink-700` | `#7B1559` | Active/pressed states | Default or hover states |

**Semantic Usage:**
- **Primary Actions**: `--brand-pink-500` for primary buttons, links, active states
- **Hover**: `--brand-pink-600` for hover states on primary elements
- **Active**: `--brand-pink-700` for pressed/active states
- **Surface**: `--brand-pink-050` for subtle pink backgrounds

#### Status Colors

| Token | Value | Usage | Do Not Use For |
|-------|-------|-------|----------------|
| `--status-success-050` | `#E6F4ED` | Success surface | Text, borders |
| `--status-success-500` | `#2E8B63` | Success text, borders, icons | Backgrounds |
| `--status-warning-050` | `#FFF6D6` | Warning surface | Text, borders |
| `--status-warning-500` | `#B88900` | Warning text, borders, icons | Backgrounds |
| `--status-error-050` | `#FDECEA` | Error surface | Text, borders |
| `--status-error-500` | `#C62828` | Error text, borders, icons | Backgrounds |

**Semantic Usage:**
- **Success**: Use for positive actions, confirmations, completed states
- **Warning**: Use for cautionary messages, pending states
- **Error**: Use for errors, destructive actions, failures

#### Info Colors

| Token | Value | Usage | Do Not Use For |
|-------|-------|-------|----------------|
| `--info-blue-050` | `#F0F6FE` | Info surface | Text, borders |
| `--info-blue-500` | `#1F66EA` | Info text, borders, icons, links | Backgrounds |

**Semantic Usage:**
- **Info**: Use for informational messages, links, informational badges

#### States and Overlays

| Token | Value | Usage | Do Not Use For |
|-------|-------|-------|----------------|
| `--state-disabled-bg` | `#E6E6E6` | Disabled button background | Active elements |
| `--state-disabled-text` | `#5D646F` | Disabled text/icons | Active text |
| `--overlay-50` | `rgba(14, 14, 14, 0.5)` | Modal overlays, drawer overlays | Content backgrounds |
| `--overlay-20` | `rgba(14, 14, 14, 0.2)` | Light overlays | Content backgrounds |

**Semantic Usage:**
- **Disabled**: Use for disabled buttons, inputs, and interactive elements
- **Overlay**: Use for modal backdrops, drawer overlays

#### Special Colors

| Token | Value | Usage | Do Not Use For |
|-------|-------|-------|----------------|
| `--rating-star` | `#FCDC5F` | Star ratings | General UI elements |

#### Gradients

| Token | Value | Usage |
|-------|-------|-------|
| `--gradient-brand` | `linear-gradient(135deg, #CC2486 0%, #8D1FF4 100%)` | Brand gradient for avatars, special elements |
| `--gradient-soft` | `linear-gradient(180deg, #FFFFFF 0%, #FDF2F7 100%)` | Soft gradient for backgrounds |

**Usage Rules:**
- Gradients MUST have sufficient contrast with text overlays (WCAG 2.1 AA)
- Use gradients sparingly for special elements (avatars, hero sections)
- Do not use gradients for buttons (use solid colors)

### Typography

**Font Family:**
```
var(--font-family) = 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif
```

**Type Scale:**

| Style | Size | Weight | Line Height | Use Case | CSS Variables |
|-------|------|--------|-------------|----------|---------------|
| **H1** | 35px | 700 (bold) | 1.2 | Page titles, major headings | `var(--typography-h1-size)`, `var(--typography-h1-weight)`, `var(--typography-h1-line-height)` |
| **H2** | 24px | 700 (bold) | 1.3 | Section headings, card titles | `var(--typography-h2-size)`, `var(--typography-h2-weight)`, `var(--typography-h2-line-height)` |
| **Body** | 20px | 500 (medium) | 1.5 | Body text, paragraphs, main content | `var(--typography-body-size)`, `var(--typography-body-weight)`, `var(--typography-body-line-height)` |
| **Accent** | 20px | 700 (bold) | 1.5 | Emphasized body text | `var(--typography-accent-size)`, `var(--typography-accent-weight)`, `var(--typography-accent-line-height)` |
| **Meta** | 16px | 500 (medium) | 1.5 | Captions, labels, metadata, timestamps | `var(--typography-meta-size)`, `var(--typography-meta-weight)`, `var(--typography-meta-line-height)` |
| **Steps** | 16px | 500 (medium) | 1.5 | Onboarding/stepper text (with letter-spacing) | `var(--typography-steps-size)`, `var(--typography-steps-weight)`, `var(--typography-steps-line-height)`, `var(--typography-steps-letter-spacing)` |

**Typography Rules:**

1. **Font Family**: Always use `var(--font-family)` or the full font stack
2. **Never use Tailwind typography classes**: Replace `text-4xl` → H1, `text-2xl` → H2, `text-xl/text-lg/text-base` → Body, `text-sm/text-xs` → Meta
3. **Bold text**: Use `var(--typography-bold-weight, 700)` or `var(--typography-accent-weight, 700)` for bolded text
4. **Inline styles**: When using inline styles, always include all three properties: `fontSize`, `fontWeight`, `lineHeight`
5. **Typography vs Color are SEPARATE**: Typography refers ONLY to `fontSize`, `fontWeight`, and `lineHeight`. Text color (`color` property) is completely separate and independent. When asked to change typography, do NOT change text color. When asked to change text color, do NOT change typography properties.

**Text Color Usage:**

- **Primary Text**: `var(--neutral-900)` for body text, headings, important content
- **Secondary Text**: `var(--neutral-600)` for metadata, captions, timestamps, descriptions
- **Disabled Text**: `var(--neutral-400)` for disabled state text
- **Brand Text**: `var(--brand-pink-500)` for links, active states, brand elements

**Example:**
```tsx
// ✅ CORRECT - Using design tokens
<h1 style={{
  fontFamily: 'var(--font-family)',
  fontSize: 'var(--typography-h1-size, 35px)',
  fontWeight: 'var(--typography-h1-weight, 700)',
  lineHeight: 'var(--typography-h1-line-height, 1.2)',
  color: 'var(--neutral-900)'
}}>
  Page Title
</h1>

// ❌ WRONG - Using Tailwind classes
<h1 className="text-4xl font-bold text-black">Page Title</h1>
```

### Spacing and Layout

**Spacing Scale:**

| Token | Value | Use Case | CSS Variable | Inline Style Example |
|-------|-------|----------|-------------|---------------------|
| **Inline** | 6px | Gap between inline elements (icons and text, buttons in a row) | `var(--spacing-inline, 6px)` | `gap: 'var(--spacing-inline, 6px)'` |
| **Small** | 12px | Small gaps, padding, margins, vertical spacing between related elements | `var(--spacing-small, 12px)` | `padding: 'var(--spacing-small, 12px)'`, `marginBottom: 'var(--spacing-small, 12px)'` |
| **Grouped** | 24px | Spacing between grouped sections, larger gaps | `var(--spacing-grouped, 24px)` | `gap: 'var(--spacing-grouped, 24px)'` |
| **Big Section** | 60px | Major section breaks, large spacing between major UI sections | `var(--spacing-big-section, 60px)` | `marginBottom: 'var(--spacing-big-section, 60px)'` |
| **Screen Margin X** | 20px | Horizontal margins for all page content (left and right) | `var(--spacing-screen-margin-x, 20px)` | `paddingLeft: 'var(--spacing-screen-margin-x, 20px)'`, `paddingRight: 'var(--spacing-screen-margin-x, 20px)'` |
| **Bottom Nav** | 32px | Space between end of content and bottom of page | `var(--spacing-bottom-nav, 32px)` | `paddingBottom: 'var(--spacing-bottom-nav, 32px)'` |

**Spacing Rules:**

1. **Horizontal Margins**: All pages MUST use `20px` horizontal margins (`var(--spacing-screen-margin-x, 20px)`)
2. **Content Spacing**: All content starts `12px` below the header (accounting for safe area)
3. **Vertical Spacing Between Elements**:
   - Related elements (same component): `6px` (`var(--spacing-inline, 6px)`)
   - Different components in same section: `12px` (`var(--spacing-small, 12px)`)
   - Different sections: `24px` (`var(--spacing-grouped, 24px)`)
   - Major sections: `60px` (`var(--spacing-big-section, 60px)`)
4. **Bottom Navigation Spacing**: 
   - Bottom navigation visual height is `80px` (defined in Figma)
   - Spacing between end of content and bottom of page is `32px` (`var(--spacing-bottom-nav, 32px)`)
   - Content should end `32px` above the bottom of the page
   - This spacing is intentionally asymmetric with top spacing (12px below header) to maintain visual hierarchy
5. **Never use arbitrary spacing**: Avoid values like `8px`, `10px`, `16px`, `18px`, `32px`, etc. Use the predefined tokens.

**Example:**
```tsx
// ✅ CORRECT - Using design tokens
<div style={{
  paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
  paddingRight: 'var(--spacing-screen-margin-x, 20px)',
  paddingTop: 'calc(env(safe-area-inset-top, 0px) + 68px + 12px)',
  paddingBottom: 'var(--spacing-bottom-nav, 32px)'
}}>
  <div style={{ marginBottom: 'var(--spacing-small, 12px)' }}>
    Content
  </div>
</div>

// ❌ WRONG - Using arbitrary values
<div className="px-5 py-6 mb-4">
  Content
</div>
```

### Radius

**Corner Radius Rules:**

1. **Standard Radius**: Always use `10px` (`var(--radius-corner, 10px)`) for all rounded corners (buttons, cards, inputs, etc.)
2. **Chips/Pills**: Use fully rounded pill shape (`borderRadius: '999px'`) for tertiary buttons and pills/badges
3. **Circular Elements**: Use `50%` or `borderRadius: '50%'` for circular avatars, icons, etc.
4. **Never use**: `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, or arbitrary values like `4px`, `8px`, `12px`, `16px`, etc.

**Example:**
```tsx
// ✅ CORRECT - Using design token
<div style={{ borderRadius: 'var(--radius-corner, 10px)' }}>
  Content
</div>

// ✅ CORRECT - Circular element
<div style={{ borderRadius: '50%' }}>
  Avatar
</div>

// ❌ WRONG - Using Tailwind classes
<div className="rounded-lg">Content</div>
<div className="rounded-md">Content</div>
```

### Elevation (Shadows)

**Shadow Token:**

- **Box Shadow**: `0 4px 4px 0 rgba(0, 0, 0, 0.25)` or `0 4px 4px 0 var(--shadow-color)`

**Shadow Usage Rules:**

Shadows indicate elevation above the page surface, not default styling.

**Default Shadow Usage (Always Use):**
- **Buttons**: Primary, Secondary, and Icon-only buttons
- **Modals/Popups**: All modal and popup containers

**Conditional Shadow Usage (Only When Intentionally Elevated):**
- **Cards**: ONLY when intentionally elevated above the page surface (e.g., featured content, overlays)
- Most cards sit on the page surface and do not need shadows

**Restricted Shadow Usage (No Shadows By Default):**
- **List Items**: NO shadows by default. Only use shadows if a list item is intentionally elevated above surrounding content
- **Pills / Chips / Badges / Tertiary Buttons**: NO shadows by default. These should feel lightweight and label-like

**General Rules:**

1. Never use Tailwind shadow classes (`shadow-sm`, `shadow-md`, `shadow-lg`, etc.)
2. Use shadows to indicate elevation, not as default styling
3. When in doubt, omit the shadow unless the element is intentionally elevated

**Example:**
```tsx
// ✅ CORRECT - Button with shadow
<button style={{ boxShadow: '0 4px 4px 0 var(--shadow-color)' }}>
  Click me
</button>

// ✅ CORRECT - Card without shadow (default)
<div style={{ backgroundColor: 'var(--neutral-50)', borderRadius: '10px' }}>
  Card content
</div>

// ✅ CORRECT - Card with shadow (intentionally elevated)
<div style={{ 
  backgroundColor: 'var(--neutral-50)', 
  borderRadius: '10px',
  boxShadow: '0 4px 4px 0 var(--shadow-color)'
}}>
  Featured content
</div>

// ❌ WRONG - Using Tailwind shadow classes
<div className="shadow-lg">Elevated content</div>
```

### Motion

**Not standardized yet.** Transitions exist in components but are not documented. When motion is standardized, this section will be updated.

---

## 2. Components and Patterns

### Buttons

**Button Roles:**

| Variant | Height | Background | Text/Icon | Border | Use Case |
|---------|--------|------------|-----------|--------|----------|
| **Primary** | 36px | `--brand-pink-500` | `--neutral-50` | None | Primary actions, CTAs |
| **Secondary** | 36px | `--neutral-50` | `--brand-pink-500` | 2px `--brand-pink-500` | Secondary actions |
| **Tertiary** | 25px | `--brand-pink-050` | `--brand-pink-500` | 2px `--brand-pink-500` | Labels, chips, tags |
| **Disabled** | 36px | `--state-disabled-bg` | `--state-disabled-text` | None | Disabled state |

**Button Specifications:**

- **Height**: 
  - Primary and Secondary buttons: `36px` (`var(--size-button-height, 36px)`) - acceptable for touch, no wrapper required
  - Tertiary buttons: `25px` - chip style for labels, tags, and lightweight inline actions
- **Padding**: `12px` left/right (`var(--spacing-small, 12px)`)
- **Radius**: 
  - Primary and Secondary: `10px` (`var(--radius-corner, 10px)`)
  - Tertiary: Fully rounded pill shape (`borderRadius: '999px'`)
- **Typography**: 
  - Primary and Secondary: Meta (16px, medium) (`var(--typography-meta-size, 16px)`, `var(--typography-meta-weight, 500)`)
  - Tertiary: Meta (16px, medium) (`var(--typography-meta-size, 16px)`, `var(--typography-meta-weight, 500)`) - All text and icons in tertiary buttons/chips use this typography
- **Box Shadow**: 
  - Primary and Secondary: `0 4px 4px 0 var(--shadow-color)`
  - Tertiary: No shadow by default (chips should feel lightweight). Only add shadow if a chip is presented as an interactive control in a toolbar and needs elevation.
- **Vertical Margins**: `12px` top and bottom (`var(--spacing-small, 12px)`)
- **Text + Icon**: Same color

**Interaction Rules for Tertiary Buttons (Chips):**

- **Default**: Tertiary chips are labels and SHOULD NOT be clickable
- **Clickable chips (rare)**: Only for dismissable filters (chip + X icon) or lightweight toggles
- Tertiary chips MUST NOT be used for primary or destructive actions
- If a tertiary chip is the sole or critical action, it MUST be implemented as a Primary or Secondary button instead
- If a chip is clickable, it MUST still be easy to tap. Use sufficient padding and spacing. Icon-only targets still require 44x44 despite not taking up that much visible area

**Button States:**

- **Default**: As specified above
- **Hover**: 
  - Primary: `--brand-pink-600` background
  - Secondary: `--brand-pink-050` background, `--brand-pink-600` border
- **Active**: 
  - Primary: `--brand-pink-700` background, `scale(0.98)`
  - Secondary: `--brand-pink-600` border
- **Focus**: `2px solid var(--brand-pink-500)` outline with `2px` offset
- **Disabled**: `--state-disabled-bg` background, `--state-disabled-text` text, `cursor: not-allowed`, `pointer-events: none`

**Icon-Only Buttons:**

- **Size**: `44px × 44px` (`var(--size-input-height, 44px)`) - minimum touch target required
- **Margin**: `12px` on all sides (`var(--spacing-small, 12px)`)
- **Icon**: Centered, standard size (24px)
- **Variants**: Primary, Secondary, Disabled (no tertiary, no full-width)
- **Note**: Icon-only buttons are the ONLY elements that require a 44px × 44px minimum touch target. Standard buttons (Primary, Secondary, Tertiary) do not require a 44px wrapper.

**Full-Width Buttons:**

- **Width**: `calc(100vw - 40px)` (20px margins on each side)
- **Note**: Tertiary buttons cannot be full-width

**When to Use Which:**

- **Primary**: Main action on a page, primary CTA, submit buttons
- **Secondary**: Alternative actions, cancel buttons, less important actions
- **Tertiary**: Labels, chips, tags (non-clickable most of the time). Rare dismissable cases (e.g., location filter chip with X icon)
- **Disabled**: When action is not available

**Example:**
```tsx
// ✅ CORRECT - Using SynthButton component
<SynthButton variant="primary" icon="plus" iconPosition="right">
  New Chat
</SynthButton>

<SynthButton variant="secondary" size="iconOnly" icon="settings" aria-label="Settings" />

// ❌ WRONG - Using shadcn Button with Tailwind
<Button className="bg-pink-500 text-white">Click me</Button>
```

### Inputs and Forms

**Not standardized yet.** Input styles, labels, helper text, and error states exist but are not fully standardized. Current explicitly defined behavior:

- Input height: `44px` (`var(--size-input-height, 44px)`)
- Input padding: `12px` left/right (`var(--spacing-small, 12px)`)
- Input border: `1px solid var(--neutral-200)`
- Input border radius: `10px` (`var(--radius-corner, 10px)`)
- Input background: `var(--neutral-50)`
- Input text: `var(--neutral-900)`
- Input focus: `2px solid var(--brand-pink-500)` outline

**TBD**: Label styles, helper text, error text, validation states

### Cards

**Card Rules:**

- **Width**: Content-hugging or full-width minus margins
- **Padding**: `24px` (`var(--spacing-grouped, 24px)`) for card content
- **Background**: `var(--neutral-50)` or `var(--neutral-100)` for subtle surfaces
- **Border**: `1px solid var(--neutral-200)` (optional)
- **Border Radius**: `10px` (`var(--radius-corner, 10px)`)
- **Box Shadow**: Only use when card is intentionally elevated above the page surface (e.g., featured content, overlays). Most cards do not need shadows.

**Card Types:**

- **Event Cards**: Full-width minus margins, image at top, content below
- **Profile Cards**: Content-hugging or full-width, user info, stats
- **Message Cards**: Full-width list items, no card container (see Messages page rules)

**Card Spacing:**

- Between cards: `12px` (`var(--spacing-small, 12px)`)
- Card content padding: `24px` (`var(--spacing-grouped, 24px)`)

**Important**: Cards are for summaries and previews only. Full-page lists should NOT be wrapped in card containers. See Messages page rules.

### Navigation

**Header:**

- **Content Height**: `44px` (`var(--size-input-height, 44px)`)
- **Padding**: `12px` below header content before other content begins (`var(--spacing-small, 12px)`)
- **Safe Area**: Add `env(safe-area-inset-top, 0px)` ABOVE header (not baked into height)
- **Background**: `var(--neutral-50)`
- **Horizontal Margins**: `20px` (`var(--spacing-screen-margin-x, 20px)`)

**Bottom Navigation:**

- **Visual Height**: `80px` 
- **Background**: `var(--brand-pink-050)` (light pink)
- **Icons**: `var(--brand-pink-500)` for active and inactive
- **Border**: `2px solid var(--neutral-200)` on top edge
- **Top Corner Radius**: `10px` (top-left and top-right only)
- **Safe Area**: Add `env(safe-area-inset-bottom, 0px)` BELOW bottom nav
- **Content Spacing**: `112px` (`var(--spacing-bottom-nav, 112px)`) total space reserved at bottom
  - Includes: `80px` bottom nav height + `32px` breathing room between content and bottom nav
  - Content should end `32px` above the bottom nav
  - This spacing is intentionally asymmetric with top spacing (12px below header) to maintain visual hierarchy

**Back Button:**

- **Size**: `44px × 44px` (`var(--size-input-height, 44px)`)
- **Icon**: Standard size (24px)
- **Color**: `var(--neutral-600)` or `var(--brand-pink-500)`

### Overlays

**Modals/Popups:**

- **Width**: `calc(100vw - 40px)` (`var(--size-popup-width, calc(100vw - 40px))`)
- **Max Width**: `var(--size-popup-width, calc(100vw - 40px))`
- **Max Height**: `calc(100vh - 40px)`
- **Position**: Centered (50% left/top, translate -50%)
- **Background**: `var(--neutral-50)`
- **Border**: `1px solid var(--neutral-200)`
- **Border Radius**: `10px` (`var(--radius-corner, 10px)`)
- **Box Shadow**: `0 4px 12px 0 var(--shadow-color)`
- **Overlay**: `var(--overlay-50)` (50% opacity black)
- **Padding**: `0` (content handles its own padding)
- **Scroll**: Content area is scrollable, header fixed

**Modal Header:**

- **Height**: `44px` (`var(--size-input-height, 44px)`)
- **Padding**: `0 var(--spacing-screen-margin-x, 20px)`
- **Border Bottom**: `1px solid var(--neutral-200)`
- **Close Button**: `44px × 44px`, top-right, X icon

**Modal Content:**

- **Padding**: `24px` (`var(--spacing-grouped, 24px)`) or as needed
- **Scroll**: Content area scrolls, header stays fixed

**Example:**
```tsx
// ✅ CORRECT - Using Dialog component with proper styling
<Dialog>
  <DialogContent style={{
    width: 'calc(100vw - 40px)',
    maxWidth: 'var(--size-popup-width, calc(100vw - 40px))',
    maxHeight: 'calc(100vh - 40px)',
    backgroundColor: 'var(--neutral-50)',
    border: '1px solid var(--neutral-200)',
    borderRadius: 'var(--radius-corner, 10px)'
  }}>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
    <DialogBody>
      Content
    </DialogBody>
  </DialogContent>
</Dialog>
```

---

## 3. Icons and Imagery

### Icon System

**Icon Library:**
- Primary: `lucide-react` for most icons
- Exceptions: Bottom navigation icons (selected states only), `FullStar.svg`, `HalfStar.svg`, `SpotifyLogo.svg`, `AppleMusicLogo.svg`

**Icon Import:**
```tsx
import { Icon } from '@/components/Icon';
import { type IconName } from '@/config/icons';

<Icon name="house" size={24} color="var(--neutral-600)" />
```

**Icon Sizes:**

| Size | Value | Use Case |
|------|-------|----------|
| **Small** | 19px | Small icons (tertiary buttons, clear buttons, inline icons) |
| **Standard** | 24px | Default icon size (most icons) |
| **Medium** | 35px | Medium-sized icons |
| **Large** | 60px | Large icons (empty states, feature icons) |

**Icon Rules:**

1. Always use the `Icon` component from `@/components/Icon`
2. Specify size using the `size` prop: `<Icon name="search" size={24} />`
3. Never use arbitrary sizes like `17px`, `18px`, `20px`, `22px`, etc.
4. Icons inherit color from parent by default (use `currentColor`)
5. For custom colors, use `color` prop with design tokens: `color="var(--brand-pink-500)"`

**Icon Colors:**

- **Default**: Inherits from parent (`currentColor`)
- **Neutral**: `var(--neutral-600)` for default icons
- **Brand**: `var(--brand-pink-500)` for active/selected icons
- **Disabled**: `var(--neutral-400)` for disabled state icons

**Icon Accessibility:**

- Use `alt` prop for meaningful icons: `<Icon name="search" alt="Search" />`
- Icons are marked with `role="img"` and `aria-label` automatically

**Touch Targets:**

- Icon-only buttons MUST be `44px × 44px` minimum for accessibility
- Wrap small icons in a `44px × 44px` clickable area when used as buttons

**Example:**
```tsx
// ✅ CORRECT - Using Icon component
<Icon name="house" size={24} color="var(--neutral-600)" alt="Home" />

// ✅ CORRECT - Icon in button (44x44 touch target)
<button style={{ width: '44px', height: '44px' }}>
  <Icon name="settings" size={24} />
</button>

// ❌ WRONG - Using arbitrary size
<Icon name="house" size={18} />
```

### Imagery

**Not standardized yet.** Image sizing, aspect ratios, and loading states are not standardized. Current behavior:

- Avatar images: Circular (`borderRadius: '50%'`)
- Event images: Full-width, aspect ratio varies
- Profile images: Varies by context, but sizing is defined

**TBD**: Image aspect ratios, loading states, fallback images

---

## 4. Accessibility

### Minimum Tap Target Sizes

- **Icon-Only Buttons**: `44px × 44px` minimum (`var(--size-input-height, 44px)`) - required for accessibility
- **Standard Buttons**: Primary and Secondary buttons are `36px` tall and acceptable for touch. No 44px wrapper required.
- **Tertiary Buttons (Chips)**: `25px` tall, intended for labeling and tagging. Most chips are non-clickable labels. Clickable chips should be used sparingly and must be comfortably tappable through padding and spacing. Not for primary or destructive actions.
- **Inputs**: `44px` height minimum (`var(--size-input-height, 44px)`)

### Contrast Expectations

**WCAG 2.1 AA Requirements:**
- **Normal text (16px+)**: 4.5:1 contrast ratio minimum
- **Large text (18px+ or 14px+ bold)**: 3:1 contrast ratio minimum
- **UI components**: 3:1 contrast ratio minimum

**Current Contrast Status:**
- ✅ Primary button: `--brand-pink-500` on `--neutral-50` = 4.8:1 (Pass)
- ✅ Body text: `--neutral-900` on `--neutral-50` = 16.6:1 (Pass)
- ✅ Secondary text: `--neutral-600` on `--neutral-50` = 4.6:1 (Pass)
- ✅ Disabled button: `--state-disabled-text` on `--state-disabled-bg` = 3.4:1 (Pass)

**Maintain readable contrast**: All text MUST meet WCAG 2.1 AA requirements. Test color combinations before using.

### Text Scaling

**Not standardized yet.** Text scaling policy is not defined. Current behavior: Text scales with system font size settings.

**TBD**: Text scaling policy, minimum/maximum font sizes

---

## 5. Special Patterns

### Empty States

**Layout:**
- Centered vertically
- `6px` spacing between icon, heading, and description (`var(--spacing-inline, 6px)`)
- Large icon (60px) in `var(--neutral-600)`
- Heading: Body typography (20px, medium), `var(--neutral-900)` color
- Description: Meta typography (16px, medium) - Note: Meta typography refers to the size, weight, and line-height. Color can vary based on context (commonly `var(--neutral-600)` for secondary text, but can be any color as needed)

**Color Rules:**
- Empty state text MUST NOT use disabled colors (`--neutral-400` or `--state-disabled-text`)
- Empty states are informational, not inactive
- Use secondary text color (`--neutral-600`) for empty state descriptions

**Example:**
```tsx
// ✅ CORRECT - Using EmptyState component
<EmptyState 
  icon="music" 
  heading="No events yet" 
  description="Check back later for upcoming events" 
/>

// ✅ CORRECT - Manual empty state
<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--spacing-inline, 6px)' }}>
  <Icon name="music" size={60} color="var(--neutral-600)" />
  <h2 style={{
    fontFamily: 'var(--font-family)',
    fontSize: 'var(--typography-body-size, 20px)',
    fontWeight: 'var(--typography-body-weight, 500)',
    lineHeight: 'var(--typography-body-line-height, 1.5)',
    color: 'var(--neutral-900)'
  }}>
    No events yet
  </h2>
  <p style={{
    fontFamily: 'var(--font-family)',
    fontSize: 'var(--typography-meta-size, 16px)',
    fontWeight: 'var(--typography-meta-weight, 500)',
    lineHeight: 'var(--typography-meta-line-height, 1.5)',
    color: 'var(--neutral-600)'
  }}>
    Check back later for upcoming events
  </p>
</div>
```

### Messages Page Layout

**Rules:**
- Messages list sits directly on page surface (no card container)
- Each conversation is a list row (not a card)
- Use internal padding for rows: `var(--spacing-grouped, 24px)` with `var(--spacing-screen-margin-x, 20px)` left/right
- Optional: Subtle bottom divider (`1px solid var(--neutral-200)`) between rows
- Empty state text: `var(--neutral-600)` (informational, not disabled opacity)

**Cards are for summaries and previews only. Full-page lists should NOT be wrapped in card containers.**

### Pills/Badges

**Standard Pill Styling (Chip Style):**
- Pills/Badges use the same styling as Tertiary buttons (chip style)
- **Height**: `25px`
- **Padding**: `12px` left/right (`var(--spacing-small, 12px)`)
- **Background**: `var(--brand-pink-050)` (light pink)
- **Text/Icon**: `var(--brand-pink-500)` (Synth pink)
- **Border**: `2px solid var(--brand-pink-500)`
- **Border Radius**: Fully rounded pill shape (`borderRadius: '999px'`)
- **Typography**: Meta (16px, medium) (`var(--typography-meta-size, 16px)`, `var(--typography-meta-weight, 500)`)
- **Box Shadow**: No shadow by default (chips should feel lightweight). Only add shadow if a chip is presented as an interactive control in a toolbar and needs elevation.

**Interaction Rules:**

- **Default**: Pills/Badges are labels and SHOULD NOT be clickable
- **Clickable chips (rare)**: Only for dismissable filters (chip + X icon) or lightweight toggles
- If a pill is the sole or critical action, it MUST be implemented as a Primary or Secondary button instead
- If a chip is clickable, it MUST still be easy to tap. Use sufficient padding and spacing. Icon-only targets still require 44x44

---