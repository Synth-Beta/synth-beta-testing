# Skill: Animations and Haptics

## SwiftUI Spring Standard
.spring(response: 0.35, dampingFraction: 0.7)
Use for: screen transitions, modal presents, card expansions

## Button/Card Press
.scaleEffect(isPressed ? 0.96 : 1.0)
.animation(.easeOut(duration: 0.12), value: isPressed)

## Hero Transitions (feed → detail)
Use @Namespace and .matchedGeometryEffect
Match: card image → full-screen detail image
Match: event title → detail title

## Haptics — When to fire
UIImpactFeedbackGenerator(style: .medium):
  - Tab bar tap
  - Like / heart button
  - RSVP / Going button
  - Friend add button

UIImpactFeedbackGenerator(style: .light):
  - Scroll snap points
  - Toggle switches

UINotificationFeedbackGenerator:
  - .success → review submitted, friend accepted
  - .error → network error, failed action

## CSS Animation Rules
- ALWAYS wrap keyframe animations in:
  @media (prefers-reduced-motion: no-preference) { ... }
- Use will-change: transform (not will-change: all)
- Never animate box-shadow (use filter: drop-shadow instead)
- Never run animations longer than 4s on looping elements in 
  background screens