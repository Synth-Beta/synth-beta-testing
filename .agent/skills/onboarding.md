# Skill: Onboarding Flow Redesign

## Goal
Spotify-quality native SwiftUI onboarding. This is the #1 priority 
screen and the first thing new users see.

## Structure (5 steps)
1. Welcome — brand gradient bg, Synth logo, tagline
2. What's your scene? — genre selection (multi-select pill grid)
3. Follow artists — search + suggested artists with images
4. Follow venues — location-aware venue suggestions
5. Connect Spotify/Apple Music — streaming integration CTA

## Design Rules
- Fully native SwiftUI — NO WebView for any onboarding screen
- Background: brand gradient (135deg, var(var(--brand-pink-500)) → #8D1FF4) on step 1
  Subsequent steps: var(--neutral-50) with brand pink accents
- Progress: subtle dot indicator, NOT a progress bar
- Transitions: .spring(response: 0.4, dampingFraction: 0.8) slide
- Selection states: brand pink border + checkmark, scale 1.03 on select
- CTA buttons: full-width, brand gradient fill, SynthButton.swift
- Skip option: always available, .text-meta style, top-right

## What NOT to do
- No web forms — all inputs must be native SwiftUI
- No static screenshots — every step must have motion
- No more than 5 steps total