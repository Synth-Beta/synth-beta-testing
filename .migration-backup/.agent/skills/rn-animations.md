# Skill: Reanimated 3 Animations (replaces all CSS animations)

## Setup
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withSpring,
  withTiming,
  interpolate
} from 'react-native-reanimated'

## Standard Spring (replaces CSS cubic-bezier transitions)
withSpring(targetValue, {
  damping: 14,
  stiffness: 120,
  mass: 1
})

## Button Press (replaces CSS :active scale)
const scale = useSharedValue(1)
const animatedStyle = useAnimatedStyle(() => ({
  transform: [{ scale: scale.value }]
}))
// onPressIn: scale.value = withSpring(0.96, { damping: 14, stiffness: 200 })
// onPressOut: scale.value = withSpring(1, { damping: 14, stiffness: 200 })

## Skeleton Loader (replaces CSS shimmer)
Use opacity oscillating 0.3 → 0.7 with withRepeat + withTiming
duration: 1000ms, easing: Easing.inOut(Easing.ease)

## Screen Transitions (replaces CSS view-slide-in-*)
Expo Router handles these automatically with:
  animation: 'slide_from_right' in Stack.Screen options
  or 'fade' for modal-style screens

## Haptics (add to every meaningful interaction)
import * as Haptics from 'expo-haptics'
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)  // buttons, likes
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)   // tab switches
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success) // completed actions
```

---

## The Antigravity Prompt to Start the Migration

This is the exact prompt to paste when you're ready to begin:
```
Read GEMINI.md and all files in .agent/skills/ fully before 
responding.

We are migrating this app from React-in-Capacitor to React Native 
with Expo. Follow the Migration Plan section in GEMINI.md exactly.

Today's task is Phase 1 — Foundation only. Do not touch any 
screens yet.

Complete these steps in order:
1. Initialize a new Expo project with TypeScript template inside 
   a /mobile folder at the project root. Do not touch the existing 
   src/ web code.
2. Set up Expo Router with a tab navigator matching our 5 current 
   tabs (Feed, Discover, Search, Chat, Profile)
3. Create src/tokens/SynthTokens.ts using ONLY the color and 
   typography values from GEMINI.md. No raw hex values anywhere.
4. Build a SynthText component per the rn-tokens.md skill
5. Build a SynthButton component matching our current brand style
6. Confirm the app boots on iOS simulator, Android emulator, 
   and web browser

Before writing any code, show me the full file structure you plan 
to create and wait for my approval.