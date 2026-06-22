# Skill: React Native Migration from Web React

## Before touching any file
1. Confirm the screen's API calls work in RN (fetch/axios work the same)
2. Check if any web-only APIs are used (window, document, localStorage)
   - window → not available in RN, use Expo equivalents
   - localStorage → use expo-secure-store or AsyncStorage
   - document → not available, remove or replace

## Component Migration Pattern
For every web component file:

Step 1 — Replace HTML primitives
  div → View
  p/span/h1-h6 → Text
  img → Image (from expo-image)
  button → Pressable or TouchableOpacity
  input → TextInput
  ul/li → FlatList or mapped Views

Step 2 — Replace styles
  Remove all className props
  Convert CSS properties to StyleSheet.create()
  CSS shorthand → explicit RN properties:
    padding: '8px 16px' → paddingVertical: 8, paddingHorizontal: 16
    border-radius: 16px → borderRadius: 16
    font-weight: '700' → fontWeight: '700'

Step 3 — Replace animations
  CSS keyframes → Reanimated 3 useAnimatedStyle + withSpring
  CSS transition → withTiming or withSpring
  Standard spring: withSpring(value, { damping: 14, stiffness: 120 })

Step 4 — Replace navigation
  React Router <Link> → Expo Router <Link>
  useNavigate() → useRouter()
  Route params → useLocalSearchParams()

Step 5 — Verify on all 3 platforms
  npx expo start → press i (iOS), a (Android), w (web)