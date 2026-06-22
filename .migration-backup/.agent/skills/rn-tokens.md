# Skill: Design Tokens in React Native

## SynthTokens.ts — Single source of truth for RN
All colors, typography, and spacing live here.
Generated from tokens.json via Style Dictionary.

## Usage — Colors
import { SynthTokens } from '@/tokens/SynthTokens'

// CORRECT
backgroundColor: SynthTokens.colors.brandPink500  // var(var(--brand-pink-500))
color: SynthTokens.colors.neutral900              // var(--neutral-900)

// WRONG — never do this
backgroundColor: 'var(var(--brand-pink-500))'
backgroundColor: 'pink'

## Usage — Typography
import { SynthText } from '@/components/SynthText'

// CORRECT
<SynthText variant="h1">Synth</SynthText>
<SynthText variant="meta" color="secondary">Venue name</SynthText>

// WRONG
<Text style={{ fontSize: 35, fontWeight: 'bold' }}>Synth</Text>

## SynthText component must handle
- All 6 type styles (h1, h2, body, accent, meta, steps)
- Color variants (primary, secondary, disabled, white, brand)
- Never let raw Text components exist in the codebase

## Gradients
Use expo-linear-gradient (not CSS gradients)
import { LinearGradient } from 'expo-linear-gradient'
<LinearGradient colors={['var(var(--brand-pink-500))', '#8D1FF4']} start={[0,0]} end={[1,1]}>