# Brag Plan: Synth

## What is this app?
Synth is live music social discovery — you find the show, find people with overlapping taste who are actually going, go together, review the night while it's fresh, and keep a passport of every show you've been to.

## The angle
**Live music for everyone.** Not a category claim, a barrier claim: plenty of people want to go to shows and don't, because going alone is the part nobody wants. Synth removes that.

The spine is still the product's own night loop — find the show → find people → go → keep the record — but it's framed around access rather than archiving. Each middle scene is one turn of that loop, shown as a **real screen from the shipping app**, not a recreation.

What makes this specific to Synth: the hook is answered by the product's own words. Scene 1 says "Just not alone." Scene 4 shows the real in-app chat where someone types *"I was thinking of going Friday, but didn't want to go alone."* The claim and the proof are the same sentence.

## Hook (first 2-3 seconds)
Black. **"You wanted to go."** slams in. A beat later, underneath, with a pink-to-purple gradient sweep: **"Just not alone."**

Seven words, and it names the actual reason people skip shows. It earns the next 17 seconds because it's a diagnosis, not a greeting — and because scene 4 proves it with the product's own chat copy.

## Key moments (the middle)
Two sources, both accurate to the shipping app: scene 3 is the real `EventCard` component **rebuilt from its own source and tokens**, and scenes 4-5 are real app screens from `apps/admin/public/demos`, cropped free of their App Store marketing headings.

- **Discover** — the feed screen **rebuilt 1:1 from the shipping component** (`mobile/src/components/Feed/EventCard.tsx` + `mobile/src/tokens/SynthTokens.ts`), scaled 1.5x from device points: TRENDING corner label, the 16:10 event image, the headline, the four pink-iconed meta rows, "281 people interested", and the real outlined Interested / ticket / share action row.
- **Connect** — the real chat thread, which contains the line the whole video is built on: *"I was thinking of going Friday, but didn't want to go alone."*
- **Share** — two screens together: the passport timeline (Taylor Swift Eras Tour, Pitbull, Zac Brown Band, each rated) and the reviews grid grouped by star rating (Goose, El Monstero, Tedeschi Trucks Band, Joe Russo's Almost Dead, Mt. Joy).

## Outro / punchline
Mark, wordmark, gradient rule, getsynth.app. Nothing else on screen.

## User flow worth showing
Three beats, each shown as the actual shipped screen rather than a rebuild:
1. **Entry** — the events feed surfaces shows near you, plus the artist tour tracker.
2. **Key action** — the chat with someone going to the same show.
3. **Result** — the passport timeline and the reviews grid.

Scenes 3, 4 and 5 are this flow. Scenes 1, 2 and 6 frame it.

## Tone
- Preset: **app-store**
- Creative direction: *the reason you didn't go, removed* — real screens, plainly shown
- Interpretation: Synth is a real product, so the video plays it straight. Clean reveals, title-case feature labels, present tense, no jokes and no hype adjectives. Energy comes from motion and the gradient, never from shouting. The restraint is the point: the product is interesting enough that describing it plainly is the strongest move.

## Format: landscape — 1920x1080
## Duration: 20.02s

## Visual identity (from the project)
Sourced from `styleguide/src/components/Guide.tsx` (the authoritative brand token list) and `src/index.css`.

- Background: `#0E0E0E` to `#1A1A1A` stage (the project's `--gradient-dark`; the primary logo ships on a black ground)
- Surface (product cards): `#FCFCFC` (`--neutral-50`, the real app page background) — light cards on a dark stage, which is how the product actually renders
- Accent: `#CC2486` (`--brand-pink-500`), gradient to `#8D1FF4` (Purple Accent)
- Accent soft surface: `#FDF2F7` (`--brand-pink-050`)
- Text on light: `#0E0E0E` (`--neutral-900`); secondary `#5D646F` (`--neutral-600`)
- Success: `#2E8B63` (`--status-success-500`)
- Display font: Inter (700/800) — the project's only font
- Body font: Inter (400/500)
- Radius: 10px (the project's `--radius`)
- Strongest visual element: the EventCard — gradient category pill, gradient-masked icons, and the Pass / Interested split-button footer

## Source of the product screens
All five product screens are Synth's own App Store marketing assets, already published on getsynth.app:
`apps/admin/public/demos/{Discover,Connect,Memories,Share,Personalization} copy.png` (1242x2688).

Each is cropped to remove the baked-in marketing heading so the video supplies its own typography, then staged as a rounded panel on the dark ground. **No new data is exposed** — nothing is pulled from the database, and every handle on screen (`@kenzie_ross`, `Alex Rivers`, `@megan_adams`) is a demo persona Synth already publishes publicly.

## Share copy (draft)
You wanted to go — you just didn't want to go alone. Synth finds the shows near you, the people already going, and keeps the record after. Live music for everyone. Now in beta at getsynth.app

## Audio direction
- Role: warm bed with a light, motion-matched accent layer — the app-store posture
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (120.19 BPM; the app-store pick, and a music app deserves a track with a pulse)
- Music treatment: `data-start=0`, ramps to 0.33 by 0.3s, holds, fades to 0 across the last 0.9s under the final lockup.
- Music cue guidance: preset read from `<skill-dir>/assets/music/cues/happy-beats-business-moves-vol-1-by-ende-dot-app.music-cues.json`.
  - **Strong-cue locks (2, both intensity 1.00 `strong_beat`):** both Share screens lift together **17.52s**; the outro wordmark slams **18.02s**. The second Share screen was originally locked to the 16.02s cue, but that left a 2.4s hole mid-scene and the arrival read as abrupt — it now lands on the 14.52s grid beat instead. Cues bias timing; pacing overrules them.
  - **Beat-grid:** every scene boundary sits on a grid beat — 3.52 / 6.52 / 10.02 / 13.51 / 18.02.
- Audio-reactive treatment: subtle. Per-frame RMS/bass makes the pink-to-purple stage glow behind the screens breathe. No waveform bars, no equalizer, no particles, no text scaling.
- SFX posture: sparse and motion-matched, 0.55-0.75. One sound family for screen arrivals so the three feature scenes share a rhythm rather than a grab bag.
- Restraint rule: no SFX under the hook's second line — the gradient sweep carries it silently. The 17.52 lift and the 18.02 wordmark use different sounds so the two don't muddy. Nothing comedic or glitchy.

## Storyboard

### Scene 1 — You wanted to go — 3.52s
Near-black `#0E0E0E` stage, pink glow breathing behind it. **"You wanted to go."** slams in at 0.22 (fast-in, then hold). At 1.35, beneath it, **"Just not alone."** with a `#CC2486` to `#8D1FF4` gradient sweep wiping left-to-right underneath. Both lines hold fully settled until 3.3.
Sequential/interaction: two lines in sequence, both held together, neither replaced.
Audio intent: one soft dry weight under line one; line two is silent by design.
Music: sparse intro, pre-beat-grid.
Transition mood: clean → Scene 2

### Scene 2 — Live music for everyone — 3.00s
The real Synth S mark scales in from 0.94, then the **Synth** wordmark, a gradient rule, and the promise: **"Live music for everyone."** Settles by 4.72 and holds 1.5s+.
Sequential/interaction: one lockup assembling in four quick beats.
Audio intent: soft bell on the mark; the music carries the rest.
Music: full bed, on the grid.
Transition mood: clean → Scene 3

### Scene 3 — Discover — 3.50s
Copy left (**DISCOVER** / "Shows near you, ranked by your taste."), a phone frame enters from the right holding the **EventCard rebuilt from its own component source**: the Events header and Radius control, TRENDING label, event image, headline, the four meta rows (artist, city, venue, date) with their pink lucide icons, "281 people interested", and the outlined Interested button beside the ticket and share buttons.
Sequential/interaction: screen first, then chapter, headline, rule — so the eye lands on the product and reads second.
Audio intent: a card-slide as the screen arrives. Nothing on the copy.
Transition mood: slide → Scene 4

### Scene 4 — Connect — 3.49s
Mirrored: the **real chat screen** enters from the left, copy right (**CONNECT** / "Find the people already going."). The thread on screen reads *"I was thinking of going Friday, but didn't want to go alone"* — the opening hook, in the product's own words. That callback is why this screen gets this slot.
Sequential/interaction: same screen-then-copy order, opposite side.
Audio intent: the same card-slide, same volume — a rhythm, not a new toy.
Transition mood: slide → Scene 5

### Scene 5 — Share — 4.51s
Copy left (**SHARE** / "Rate the night. Keep the record."). The **passport timeline** screen arrives at 13.6 — Taylor Swift Eras Tour, Pitbull, Zac Brown Band, each rated and written up. The **reviews grid** joins it one beat later at 14.52 — grouped by star rating: Goose, El Monstero, Tedeschi Trucks Band, Joe Russo's Almost Dead, Mt. Joy — so the two read as one-two rather than two separate arrivals. At 17.52 both lift together.
Sequential/interaction: two real screens arriving 0.92s apart, close enough to read as a pair.
Audio intent: a placement sound per screen, then a soft lift.
Music: two of the three strong cues live here.
Transition mood: hard cut → Scene 6

### Scene 6 — Outro — 2.00s
Back to black. Mark, **Synth**, gradient rule, **getsynth.app**. Hold.
Audio intent: one bell on the strong cue, then the bed rings out.
Transition mood: end.

**Music mood for this video:** upbeat
**Audio summary:** A quiet, weighted hook gives way to the full bed as the promise lands; one shared sound family scores each real screen arriving; and the last two seconds put the final strong cues back to back so the lift and the wordmark close it.
