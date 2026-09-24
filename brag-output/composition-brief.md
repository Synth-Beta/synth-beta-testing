# Hyperframes Composition Brief: Synth

## Objective
Create a short launch-style brag video for Synth, a live music social discovery app, framed on **"Live music for everyone."** Every product scene is a real screen from the shipping app — discover, connect, share — not a recreation.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080
- Duration: 20.02s

## Source Material
- Project root: `C:/Users/Owner/Desktop/synth-beta-testing-1`
- Brand tokens: `styleguide/src/components/Guide.tsx`, `styleguide/src/lib/bundleFiles.ts`, `src/index.css`
- Logo: `public/Logos/Main logo black background.png` — black ground keyed out, cropped tight to the glyph
- **Scene 3 UI (rebuilt, not screenshotted):** `mobile/src/components/Feed/EventCard.tsx` and `mobile/src/tokens/SynthTokens.ts` — the card is reproduced in HTML/CSS at 1.5x device points, every color, radius, spacing and font size taken from those two files. Event image: `public/Generic Images/12.jpeg`, one of the app's own fallback images.
- **Scenes 4-5 screens:** `apps/admin/public/demos/*.png` — Synth's own App Store marketing assets, 1242x2688, already published on getsynth.app, cropped to strip the baked-in marketing headings.
- Product name: **Synth**
- Framing: **"Live music for everyone."**
- Copy that must appear verbatim:
  - `You wanted to go.`
  - `Just not alone.`
  - `Live music for everyone.`
  - `Discover` / `Connect` / `Share`
  - `Shows near you, ranked by your taste.`
  - `Find the people already going.`
  - `Rate the night. Keep the record.`
  - `getsynth.app`

## Creative Direction
- Tone preset: **app-store**
- Creative direction: *the reason you didn't go, removed* — real screens, plainly shown
- Angle: plenty of people want to go to shows and don't, because going alone is the part nobody wants. Synth removes that. The hook states the problem in seven words; scene 4 answers it with the product's own in-app chat, which reads *"I was thinking of going Friday, but didn't want to go alone."* The claim and the proof are the same sentence.
- Hook: `You wanted to go.` then `Just not alone.` with a pink-to-purple gradient sweep.
- Outro: mark, wordmark, gradient rule, `getsynth.app`.
- Avoid:
  - Generic SaaS language
  - Invented UI. Scene 3 is rebuilt from the component's own source and tokens; scenes 4-5 are the real shipped screens. Nothing is designed from scratch.
  - Abstract filler visuals, waveform bars, particle systems
  - Competing typography: the demo screens' own marketing headings are cropped away

## Data exposure
Nothing is read from the database. The demo screens are already public on getsynth.app, and every handle on them (`@kenzie_ross`, `Alex Rivers`, `@megan_adams`) is a demo persona Synth already publishes. The video introduces no new data.

## Visual Identity
- Stage: `#0E0E0E` to `#1A1A1A` (the project's `--gradient-dark`; the primary logo ships on a black ground)
- Accent: `#CC2486` (`--brand-pink-500`), gradient to `#8D1FF4` (Purple Accent)
- Text on dark: `#FCFCFC`; secondary `#A8AEB8` (chosen to clear WCAG AA on the dark ground)
- Display + body font: Inter, shipped locally as a variable woff2 (`assets/fonts/inter-latin.woff2`)
- Product screens sit in rounded 22px panels with a pink-tinted shadow, so the demo assets' own pink ground reads as an intentional device backdrop

## Storyboard
`brag-output/brag-plan.md` is the creative contract. Scene summary:

1. **You wanted to go** — 3.52s — the two hook lines plus the gradient sweep, both held.
2. **Live music for everyone** — 3.00s — mark, wordmark, rule, promise.
3. **Discover** — 3.50s — copy left, a phone frame holding the rebuilt EventCard enters right.
4. **Connect** — 3.49s — mirrored: the real chat screen enters left, copy right. The thread carries the hook's own words.
5. **Share** — 4.51s — copy left; the passport timeline arrives at 13.6s, the reviews grid one beat later at 14.52s; both lift on 17.52s.
6. **Outro** — 2.00s — the lockup, landing on the 18.02s strong cue.

Scene boundaries: 0 / 3.52 / 6.52 / 10.02 / 13.51 / 18.02 / 20.02 — every one on a grid beat.

## Audio
- Audio role: warm bed plus a sparse, motion-matched accent layer
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (120.19 BPM), `data-start=0`, volume lane ramps to 0.33 by 0.3s and fades to 0 over the last 0.9s
- Strong-cue locks (2, both intensity 1.00): both Share screens lift **17.52s**; outro wordmark **18.02s**. The second Share screen sits on the 14.52s grid beat rather than the 16.02s cue — the cue left a 2.4s hole mid-scene.
- Audio-reactive: per-frame RMS/bass drives the stage glow behind the screens. No waveform bars, no equalizer, no text scaling.
- SFX: one shared family for screen arrivals (`card-slide-3` for the two full-screen scenes, `card-place-1` for the two Share screens), a soft `bong_001` on the mark, `impactSoft_medium_001` under the first hook line, `drop_001` on the lift, `impactBell_heavy_000` on the outro. 0.55-0.75 throughout.
- Restraint: nothing under the hook's second line; the 17.52 lift and 18.02 wordmark use different sounds so they don't muddy.

## Gate
`npx hyperframes check` must pass with zero errors — lint, runtime, layout, motion, and WCAG AA contrast.
