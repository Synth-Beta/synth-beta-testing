# Skill: Event/Concert Card Design

## The Standard Card Pattern
All event cards must follow this exact structure:

SwiftUI:
- ZStack layout
- AsyncImage fills entire card (aspect ratio 4:3 or 16:9, consistent)
- LinearGradient overlay: .clear at top → .black.opacity(0.75) at bottom
- Artist/Event name: SynthTypography.h2, white, bottom-left
- Venue + date: SynthTypography.meta, white.opacity(0.75), below name
- Corner radius: 16pt, .clipped()
- Tap: scaleEffect 0.97 on press, spring back on release
- Add .matchedGeometryEffect(id: event.id, in: namespace) for 
  hero transition to detail view

React/CSS:
- Use CSS token variables only — no raw hex or inline styles
- Image: object-fit: cover, fixed aspect ratio via padding-top trick
- Gradient: linear-gradient(to bottom, transparent, rgba(0,0,0,0.75))
- Text: var(--typography-h2-*) and var(--typography-meta-*)
- Card: border-radius: 16px, overflow: hidden

## What NOT to do
- No mixed aspect ratios in the same feed
- No inline style={{}} for colors or typography
- No box-shadow animations (causes GPU repaint)
- No hardcoded hex values