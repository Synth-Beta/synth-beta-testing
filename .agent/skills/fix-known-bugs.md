# Skill: Known Bugs — Fix On Sight

When you encounter any of these, fix them immediately even if not 
the primary task:

1. tailwind.config.ts synth.pink value
   WRONG:   #FF3399
   CORRECT: #CC2486
   
2. SceneCard.tsx inline styles
   Pattern to find: style={{ fontSize: 'var(--...)', ... }}
   Fix: replace with equivalent CSS utility class
   Never add new inline styles to this component

3. pulse-glow animation
   Find: animation: pulse-glow in any CSS
   Fix: remove box-shadow from @keyframes, replace glow with 
        filter: drop-shadow(0 0 8px rgba(204,36,134,0.4)) on ::after

4. Missing prefers-reduced-motion
   Every @keyframes block must be wrapped in:
   @media (prefers-reduced-motion: no-preference) { }

5. Z-index hardcoding
   Find: zIndex: 9999, zIndex: 10000, z-index: 40 !important
   Fix: define --z-nav: 100, --z-overlay: 200, --z-modal: 300 
        in tokens.css and use those variables

6. Missing ErrorBoundary
   Every top-level page component needs:
   <ErrorBoundary fallback={<ErrorScreen />}>...</ErrorBoundary>
```
