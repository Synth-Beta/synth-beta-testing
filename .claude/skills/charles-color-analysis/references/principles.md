# Colour principles

Each principle gives the rule, why viewers feel it, the numbers, and how to measure and fix it. All values are OKLCH: L is lightness (0 black to 1 white, perceptually even), C is chroma (0 grey, up to about 0.32 at the sRGB limit), and H is the hue angle. "Vividness" is C as a share of the most chroma sRGB allows at that L and H, so a dark teal and a bright yellow can both be 100% vivid.

## Measured references

Two sets of real palettes anchor the numbers below.

**Sanzo Wada, *A Dictionary of Color Combinations*** (1930s; 348 combinations of 2–4 colours from 159 colours, measured here in OKLCH). These are harmony palettes:
- Lightness carries them. The median combination spans 0.36 in L, 60% span at least 0.3, and only 14% span less than 0.15.
- Far hues are common: 70% contain a pair at least 90° apart, and the median widest gap is 128°.
- Far hues are never left alone. Of 327 pairs at least 120° apart, only 8% are both vivid (C ≥0.12) and within 0.1 of each other in L. The median far pair differs by 0.24 in L, and the weaker colour has a median 64% of the stronger's chroma.
- Chroma stays in a band. The most chromatic colour is a median 1.26× the next; only 12% of combinations reach 1.8×.

**Award-style landing-page heroes** (21 measured). These are pop palettes:
- The two regular colours are one dark and one light, at least 0.4 apart in L (median 0.48). Usually one is a real colour and the other near-neutral (17 of 21).
- The accent is the most vivid colour on the page, at ≥80% of its hue's ceiling: about 0.2 for most hues, about 0.15 for greens and teals.
- The accent sits 120–180° from every regular colour that has real chroma (C ≥0.04); 75° is the minimum. It lives on the subject.

## 1. Value carries the design

**Rule.** Judge the greyscale version first. The subject, the headline and the CTA must survive it, and the focal element holds the biggest lightness step in its area. The designed colours span ≥0.3 in L, and a GRAPHIC's two regular colours are ≥0.4 apart.

**Why.** The eye reads lightness before hue. Edges, legibility and depth come from lightness steps. A difference in hue alone is weak, and it disappears for colour-blind viewers and in glare.

**Measure.** The value percentiles and the greyscale panel. The flag fires when 90% of the frame sits within 0.35 of L. It is skipped for APP screens, which are meant to be mostly one light value.

**Fix.** Move L, not hue: darken the dark end, lighten the light end, or set the focal element against its opposite. The common failure is value mush, where everything sits between L 0.45 and 0.7, typical of generated mid-tone gradients.

## 2. One loudest thing

**Rule.** Each view has one loudest element: the subject (GRAPHIC), the hero subject and then the CTA (LANDING), or the primary action or the thing that changed (APP).

**Why.** Attention is serial. The eye jumps first to the most colourful, highest-contrast spot, and two equal spots split it. Viewers call that "busy" or "confusing" without knowing why.

**Measure.** The three loud spots and their weights. A conflict is a second spot at ≥70% of the first's weight and ≥45° away in hue, or a loud spot on something unimportant (a decorative shape, a badge, the edge of the frame). A dark subject carried by value never ranks; then check that nothing unimportant outranks it.

**Fix.** Quiet the competitor: multiply its C by 0.6, or move its L toward its surround. Or strengthen the real focus. Keep the accent colour for what it marks: once the CTA colour also decorates headings and icons, it stops meaning "act here".

## 3. 60/30/10

**Rule.** 60% of the area is one dominant family, 30% a secondary family, and 10% the accent, within 50–70, 20–35 and 5–15.
- **GRAPHIC:** 60 field, 30 second colour (the type, a second field, the subject's body), 10 accent. An accent that is the subject's own colour (a yellow gondola, a magenta orchid) may reach about 30%, taken from the 30, never as background or decoration.
- **LANDING:** 60/30/10 in every viewport. The 10 is the CTA plus one highlight.
- **APP:** 60 background and 30 surfaces and text, both neutrals, so the brand colour lives in the 10.

**Why.** One dominant colour sets the mood and gives the eye a ground to rest on. The secondary keeps it from feeling empty, and the accent reads as an accent only because it is rare. Two families at near-equal area fight, and the design reads as two designs. Light, vivid accents look bigger: a yellow at 8% weighs what a violet needs about 25% to match. The old painters' ratios put yellow to violet at 1:3, orange to blue at 1:2 and red to green at 1:1.

**Measure.** The 60/30/10 split in `measure`, or in `palette` when shares are given. It groups colours into families:
- the accent, with every shade of its hue at half its chroma or more;
- other hues in 30° families, split into light and dark when a family spans more than 0.35 in L;
- neutrals (C <0.025), as light or dark.

Count content (the product photo) as its own family and judge the designed families among themselves. The accent's own light or haze (a glow on the paper around a flower) counts with the accent. With shares you assumed yourself, the split only repeats the assumption, so measure a stand-in screen instead.

**Fix.** Change areas before colours: crop, scale, change which elements carry a colour, or merge two near-equal families by moving one toward the other.

## 4. Far hues need a second difference

**Rule.** Two colours ≥90° apart that touch also differ by ΔL ≥0.2, or the weaker has ≤60% of the stronger's vividness. Compare vividness rather than raw chroma, because a green or teal at full strength has a much lower C than a magenta at full strength, and raw C would always excuse it.

**Why.** Two vivid opposite hues at the same lightness make their shared edge shimmer (vibration), and neither reads as the ground. Wada almost never pairs them that way (8% of far pairs). Far hues bring energy and close hues (≤45°) bring calm. The second difference is what keeps a far pair from fighting. Colours that never touch (status colours, separate tags) don't vibrate.

**Measure.** The pair table (`hue_gap`, `dL`, `chroma_ratio`) and the vibration flag.

**Fix.** Change the colour with more area (the field, unless the accent covers more): shift its L by 0.2 or more, or lower its C. Keep the accent as it is.

## 5. Pop or harmony

**Rule.** Decide which the palette is, then commit.
- **Harmony:** the strongest hue is ≤1.5× the chroma of the next hue family.
- **Pop:** one deliberate outlier at ≥1.8×, at ≥80% of its ceiling, against quieter regulars.
- **In between** (1.5–1.8×) reads undecided: the accent neither blends in nor stands out.

The band's level is separate from the ratio. A harmony of loud colours (every colour at C 0.12–0.2) reads playful or candy-like, while a harmony of quiet ones (C ≤0.08) reads calm.

**Why.** Both logics are proven. Mixing them produces the "out of place" feeling: a pop-strength colour dropped into a palette that otherwise speaks harmony (muted earth tones, soft pastels) looks pasted on.

**Route defaults.** GRAPHIC is pop, or harmony for a calm brief. LANDING is pop in the hero and harmony below it. APP is harmony with a small primary.

**A pop accent needs two things.**
- **A reason:** it is the subject, the subject's light, or the action.
- **An echo:** something nearby in its hue family (within 35°, C ≥0.03). That can be the light it throws on nearby surfaces, a deeper version in the shadows, or a low-chroma version in the type or the neutrals. An accent without an echo floats.

**Fix.** For harmony, pull the outlier's C down into the band, or raise the others. For pop, push the accent to ≥80% of its ceiling and quiet everything else. To add the echo, grade the design 5–10% toward the accent, or tint the light surfaces near it.

## 6. Material and light

**Rule.** A colour is no more vivid than the thing it claims to be, unless synthetic is the point.

**Why.** People know how vivid wood, coffee, skin and stone can be. Past that, a colour reads as plastic, neon or a screen. Comfortable colours resemble something that could exist; "impossible" colours feel wrong even when viewers can't say why.

Chroma ceilings for things photographed in ordinary light:

| Claims to be | C up to |
|---|---|
| wood, coffee, leather, stone, sand, skin | 0.11 |
| foliage, sky, sea | 0.15 |
| clay, brick, rust, terracotta, autumn leaves | 0.16 |
| fruit, flowers, feathers, minerals | 0.25 |
| light sources (sunset, fire, neon, LEDs), plastics, screens, spot inks | the sRGB ceiling |

A surface lit by a coloured light takes the light's chroma, so judge it as light.

**Glow** needs a source in the frame, a falloff (brightest at the source, fading with distance) and the light's colour on nearby surfaces. A uniform halo around type or around a centred product reads as a filter. A coloured shadow is a glow: it only works when the object casting it is that colour, more intensely. Real shadows are dark (black at low opacity, or a deep shade of the surface's hue), even in dark mode.

**Measure.** The material flag fires when the accent is ≥2.5× as vivid as its own hue family on the page. Compare the accent's C with the table for what it sits on.

**Fix.** Choose one of three:
- Lower C toward the material's ceiling, keeping L and H.
- Make the colour read as light: a gradient falloff, spill onto nearby surfaces and type, and the rest graded toward it.
- Commit to synthetic: then the rest of the palette goes graphic too (flat fields, ink-like neutrals, no photo-real materials).

## 7. Temperature and one light

**Rule.** The largest designed area sets the temperature, and it should match the promise. Everything should look lit by the same light, and every neutral leans the same way: all a little warm or all a little cool.

**Why.**
- **Warm** hues (reds, oranges, yellows and warm neutrals) read cosy, appetising and energetic.
- **Cool** hues (greens through blues) read calm, fresh and clinical.
- **In between:** purples, magentas and yellow-greens.

A scene under one light shares an undertone, so an element lit by another light (a cold stock photo on a warm page) looks pasted in. Mixed neutral temperatures (cream surfaces with blue-grey text, or a warm page with a cool-grey button) feel subtly wrong, and they are a common tell of generated UI. A grade, meaning a low-opacity colour layer over the finished design with the palette resampled through it, puts everything under one light.

A hot accent on a cold field is classic drama. A cold field under a warm promise (roasting, baking, hospitality) feels off unless the drama is the point.

**Measure.** The temperature split (it counts content too, so judge the field by the largest designed family), the neutral-temperature flag, and photo hues against designed hues.

**Fix.**
- Rotate the field 10–25° toward the promised temperature, or lower its C.
- Move every neutral to one temperature.
- Grade the whole design toward the light or accent colour (`--grade <colour>@0.05–0.10`), and grade photos toward the palette.

## 8. Neutrals

**Rule.** Greys, creams, off-blacks and off-whites:
- lean toward the palette (C 0.005–0.025, with the hue of the dominant colour, the accent or the light);
- come from one family;
- number three at most.

Muted brand colours above C 0.025 (a sage, a dusty green, an oat with real colour) are not neutrals. They belong to their hue family, so the one-temperature rule doesn't cover them.

Pure white is fine as an APP or LANDING surface. Pure black text, or pure black or white fields beside saturated colour, look harsh in a GRAPHIC unless the style is stark editorial.

**Why.** Untinted neutrals look dead next to colour, and a neutral leaning away from the palette looks dirty. Cool-leaning greys read fresh, warm-leaning ones soft or aged. Pure black text on a coloured field looks muddy, while a deep shade of the field's own hue (or the palette's own ink) reads as ink that belongs there.

**Fix.**
- Rotate the neutral to the palette's hue at C 0.01–0.02.
- For fills on tinted or coloured surfaces (a segmented control, a hover, a tag background), use the main ink at 10% opacity instead of declaring a new grey. It takes on the tint of whatever sits behind it.
- Put text on a coloured field in the field's hue at L ≤0.3 and C 0.03–0.06, or near-white when the field is dark enough (rule 10).

## 9. Families, peers and ramps

**Rule.**
- **Count hue families:** colours ≥30° apart with C ≥0.04. GRAPHIC takes ≤3, LANDING ≤4 plus status colours, and APP one primary plus status colours.
- **Peers share one L and one C.** Peers are colours that sit side by side as equals: tags, categories, chart series, metric tokens, and the titles of cards of equal rank.
- **A ramp** (the tints and shades of one colour) holds its hue, or moves it in one direction as it darkens, while gaining chroma:
  - warm hues turn toward red and cool hues toward violet;
  - up to 8° and +0.02 C per step.
- **Near-duplicates** (ΔE <0.035; in an APP <0.02) merge into one token.

**Why.**
- Every extra hue adds noise and weakens the accent.
- Peers at unequal brightness say "this one matters more" by accident; blues and greens look louder than reds at the same HSL lightness.
- Darkening by lightness alone makes muddy shades, while a directional hue shift plus more chroma gives rich darks. You can see it in a navy that leans a little more violet than its sky. Random drift, where one step is greener and the next more purple (typical of HSL ramps), reads as mistakes.
- Two colours a few points apart (two creams, seven greys) read as accidents. In apps, surface steps of 0.02–0.07 L are deliberate layering.

**Measure.** The family count, the peer flag (`palette` with peer roles), the near-duplicate flags and the DOM inventory (distinct greys, grey pairs within 0.03 L).

**Fix.** Merge to tokens. Give peers one L and one C and keep their hues. Rebuild a ramp on one hue, or on one directional hue path, with even L steps.

## 10. Contrast floors and the lightness-only repair

**Floors, as APCA |Lc|:**
- Body text: 75, with 60 at least.
- Large text (≥24 px, or ≥18.7 px bold): 60, with 45 at least.
- Text rendered under 12 px: make it bigger; when it can't grow, add 15 to its floor. APCA's size table climbs steeply below 14 px.
- Placeholder and disabled text may go lower but must still look deliberate.
- Informative icons, borders and focus rings: 30. The same 30 applies to the boundary of a control that only its shape identifies (a switch track, a checkbox, a field's edge, an icon-only button). A button with a text label is identified by the label.

**Where text can live, under APCA, on neutral surfaces:**

| Text | Reaches 75 | Reaches 60 | Reaches 45 |
|---|---|---|---|
| white | surface L ≤0.58 | ≤0.68 | ≤0.77 |
| near-black | surface L ≥0.84 | ≥0.75 | ≥0.66 |

Between L 0.68 and 0.75, no text reaches 60, so move the surface instead. These cut-offs sit higher than the old WCAG intuition ("dark text above L 0.6"), because APCA credits white text more.

**WCAG 2** applies when a contract names it: 4.5:1 for body text, 3:1 for large text and UI components, and 7:1 and 4.5:1 for AAA. The two can disagree on mid-tones, for example a pass at 5.2:1 that is only Lc 49. Report both, say which you judged by, and explain that APCA models how a pair actually reads.

**Why.** Contrast lives almost entirely in the lightness gap. Chroma and hue barely move it, so raising chroma to "make it pop" fixes nothing.

**Fix.** `contrast` prints the smallest L move of the text and of the surface for |Lc| 30, 45, 60, 75 and 90. C and H stay, so the colour keeps its hue, but not always its loudness:
- The ceiling shrinks toward black, so a darkened colour becomes more vivid.
- A full-chroma colour lifted toward white can read as neon.

`contrast` prints the vividness change. When it jumps, lower C along with L.

## 11. Colour-blind safety and meaning

**Rule.** Key distinctions survive deuteranopia and protanopia, which affect about 1 in 12 men. The accent keeps ΔE ≥0.07 from its field in simulation. In an APP, status colours always come with an icon or label. Peer status colours may share one L, so they're told apart by hue along the blue–yellow axis and by that icon.

**Why.** Red/green and orange/green differences collapse, while lightness and blue/yellow differences survive.

**Measure.** The deuteranopia panel, the colour-blind flags, and `dE_deutan` in the pair table.

**Fix.** Separate the colours by ≥0.15 in L, or move a hue along the blue–yellow axis, and add a shape cue.

## 12. Gradients, overlays and blending

- **Interpolate in OKLCH.** Write gradients as `in oklch`. A straight path through sRGB goes grey and muddy in the middle, worst between far-apart hues.
- **Ease every scrim.** A dark overlay behind text on a photo, faded with evenly spaced stops, shows a visible "horizon line" where the darkness stops. Generate the stops along an easing curve (smoothstep is enough).
- **No plain two-stop gradient as a background.** A diagonal two-colour gradient is the most default-looking background there is. Use solid fields, light falling off from a visible source, or gradients inside type and masks. Add 1–2% noise to large dark gradients so they don't band.
- **Light on colour: blend, don't fade.** Translucent white over a coloured surface looks chalky and flat. `mix-blend-mode: plus-lighter` makes the same element brighter and more saturated; `plus-darker` is the inverse, WebKit-only, so hard-code its result elsewhere. Put `isolation: isolate` on the component, so the blend mixes only inside it.

## 13. App specifics

- **The primary** is kept for actions, selection, focus and key data; never large surfaces.
- **Dark mode** remaps the ramp, so the step that was near-white becomes near-black; never invert or hand-pick a second palette. The base surface is L 0.15–0.22, not pure black. Raised surfaces are lighter, because they sit closer to the light. Large surfaces lose chroma, and body text is L 0.9–0.95.
- **Shadows** are black at low opacity, leaning to the ink's hue, never coloured.
- **Secondary text and borders** can be the ink at reduced opacity, so they tint themselves to whatever they sit on.
- **Emoji and colour icons** bring hue families of their own, and those families change by platform. On controls and labels, use monochrome icons in the label colour; keep emoji inside content (messages, posts) where they belong to the voice.

## Mood targets

These are defaults for when a brief gives mood words. A design may break them on purpose; then the critique says so instead of correcting it. The value span is measured across the designed colours (fields, accent, illustration), not between text and its surface.

| Mood words | Value | Chroma | Hue and temperature |
|---|---|---|---|
| calm, quiet, soft, minimal | span 0.3–0.5; a light (L ≥0.9) or dark (L ≤0.25) field | band ≤0.08, accent ≤0.15 | one hue family plus tinted neutrals, or analogous (≤45°) |
| bold, energetic, sporty | span ≥0.6 | accent ≥80% of its ceiling | far accent at 120–180°, hot against cold |
| playful, youthful | span ≥0.4 | 2–3 hues at similar C (0.12–0.2) and close L (±0.1) | wide hue spread, no muddy mid-tones |
| luxury, premium, nightlife, exclusive | dark field, L ≤0.25 (premium can also be a quiet light field with one deep colour) | field ≤0.05; one rich accent (gold: H 80–95, C 0.10–0.14, or one jewel tone) | warm metallics or jewel tones, few hues |
| natural, craft, heritage, organic | span 0.3–0.6 | band 0.03–0.12, nothing above 0.15 | warm earth (H 30–100), olive, muted green-blue, warm neutrals |
| clean, clinical, trustworthy, technical | light field, L ≥0.95 | low, one primary at 0.12–0.18 | cool (H 200–270) with cool-tinted greys |
| retro, editorial, print | cream or newsprint field (L 0.9–0.95, C 0.02–0.04) | spot inks 0.10–0.18 | 2–3 inks, no glows or gradients |
| dramatic, cinematic | span ≥0.7 with deep darks | one light colour at high chroma | hot light against cold shadow |

## Finding new palettes

When a direction needs new colours:

1. **Start from something real:** the product photo, a material, a film still, a painting, or a classic combination (Wada's dictionary; Werner's *Nomenclature of Colours*, where every colour is named after where it occurs in nature). One scene under one light gives its colours a shared undertone for free.
2. **Measure the reference** with `measure`, and take its families with their real proportions.
3. **Fit it to 60/30/10 and the route.** Assign roles, change only what the checks require, then run `palette` with roles and shares.
4. **Glue it.** Grade 5–10% toward the light colour or the accent (`--grade`).

## The colour-wheel caveat

- The painter's RYB wheel, taught in art class, pairs red with green, blue with orange and yellow with violet.
- The screen's RGB/HSL wheel pairs red with cyan, green with magenta and blue with yellow.
- OKLCH, which is perceptual, puts blue (about 265°) opposite yellow-amber (about 85–100°) and red (about 30°) opposite teal-cyan (about 195°).

"For sharper contrast use orange with blue, not yellow" is RYB talk. Report the OKLCH gap in degrees, plus the lightness and chroma gaps; those decide what the eye sees.
