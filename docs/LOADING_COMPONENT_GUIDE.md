# Synth Loading Component Guide

## Overview

The `SynthLoader` component provides a consistent, interactive, and on-brand loading experience across all pages and services in the Synth app. It uses the brand colors (synth-pink #FF3399) and provides multiple variants and sizes.

## Components

### 1. `SynthLoader` (Base Component)

The main loading component with multiple variants and customization options.

```tsx
import { SynthLoader } from '@/components/ui/SynthLoader';

<SynthLoader 
  size="md"              // 'sm' | 'md' | 'lg' | 'xl'
  variant="spinner"      // 'spinner' | 'pulse' | 'dots' | 'logo'
  text="Loading..."     // Optional text below loader
  fullPage={false}      // Full page overlay
  inline={false}        // Inline loader
  background="blur"     // 'transparent' | 'blur' | 'solid'
/>
```

### 2. `SynthLoadingScreen` (Full Page)

For full-page loading screens (e.g., initial app load, auth checks).

```tsx
import { SynthLoadingScreen } from '@/components/ui/SynthLoader';

<SynthLoadingScreen 
  text="Loading Synth..." 
  showLogo={true} 
/>
```

### 3. `SynthLoadingInline` (Section Loading)

For loading states within sections or components.

```tsx
import { SynthLoadingInline } from '@/components/ui/SynthLoader';

<SynthLoadingInline 
  text="Loading events..." 
  size="md" 
  variant="spinner" 
/>
```

### 4. `SynthLoadingOverlay` (Overlay Loading)

For overlay loading states that cover content.

```tsx
import { SynthLoadingOverlay } from '@/components/ui/SynthLoader';

<SynthLoadingOverlay 
  text="Processing..." 
  background="blur" 
/>
```

## Variants

### Spinner
Classic spinning loader with brand colors.

```tsx
<SynthLoader variant="spinner" size="md" />
```

### Pulse
Pulsing circle with glow effect.

```tsx
<SynthLoader variant="pulse" size="lg" />
```

### Dots
Three bouncing dots.

```tsx
<SynthLoader variant="dots" size="md" />
```

### Logo
Music icon with pulsing border (great for full-page loads).

```tsx
<SynthLoader variant="logo" size="xl" />
```

## Migration Guide

### Replace Loader2 from lucide-react

**Before:**
```tsx
import { Loader2 } from 'lucide-react';

{loading && (
  <div className="flex items-center justify-center">
    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
  </div>
)}
```

**After:**
```tsx
import { SynthLoadingInline } from '@/components/ui/SynthLoader';

{loading && (
  <SynthLoadingInline text="Loading..." size="md" />
)}
```

### Replace Custom Spinners

**Before:**
```tsx
<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
```

**After:**
```tsx
<SynthLoader variant="spinner" size="md" />
```

### Replace Full Page Loading

**Before:**
```tsx
<div className="min-h-screen flex items-center justify-center">
  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
  <p>Loading...</p>
</div>
```

**After:**
```tsx
<SynthLoadingScreen text="Loading..." showLogo={true} />
```

## Usage Examples

### Inline Loading in Feed
```tsx
{loading && events.length === 0 ? (
  <SynthLoadingInline text="Loading recommendations..." size="md" />
) : (
  <EventGrid events={events} />
)}
```

### Button Loading State
```tsx
<Button disabled={loading}>
  {loading ? (
    <>
      <SynthLoader variant="spinner" size="sm" />
      Loading...
    </>
  ) : (
    'Submit'
  )}
</Button>
```

### Full Page Initial Load
```tsx
if (loading) {
  return <SynthLoadingScreen text="Loading Synth..." showLogo={true} />;
}
```

### Overlay Loading
```tsx
{processing && (
  <SynthLoadingOverlay text="Processing your request..." background="blur" />
)}
```

## Brand Colors

The loader uses Synth brand colors:
- **Primary**: `#FF3399` (synth-pink)
- **Light**: `#FF66B3` (synth-pink-light)
- **Background**: Gradient from white to beige (`#F5F5DC`)

## Best Practices

1. **Use appropriate size**: `sm` for buttons, `md` for sections, `lg` for full sections, `xl` for full page
2. **Add helpful text**: Always provide context with the `text` prop
3. **Choose the right variant**: 
   - `spinner` for most cases
   - `pulse` for emphasis
   - `dots` for minimal UI
   - `logo` for brand moments
4. **Use fullPage sparingly**: Only for critical loading states
5. **Consistent messaging**: Use similar text patterns across the app

## Files Updated

The following files have been updated to use the new loading component:
- `src/components/MainApp.tsx` - Full page loading
- `src/components/discover/MapCalendarTourSection.tsx` - Calendar and tour loading
- `src/components/home/PreferencesV4FeedSection.tsx` - Feed loading
- `src/components/photos/EventPhotoGallery.tsx` - Photo loading
- `src/components/home/HomeFeed.tsx` - Multiple loading states

## Remaining Files to Update

The following files still use old loading patterns and should be migrated:
- `src/components/matching/*.tsx` - Matching components
- `src/components/ui/photo-upload.tsx` - Photo upload
- `src/components/SpotifyStats.tsx` - Spotify stats
- Other components with `Loader2` or custom spinners



