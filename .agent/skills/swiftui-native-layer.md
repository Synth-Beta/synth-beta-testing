# Skill: Adding Native SwiftUI Over WebView

## Context
This app runs React inside a Capacitor WebView (ContentView.swift).
Native Swift views render ON TOP of the WebView as overlays.
The web layer and native layer must be carefully coordinated.

## Rules
- New SwiftUI views are overlays — they sit above the WebView
- Use SynthDeepLinkRouter to pass navigation events web ↔ native
- Never break the Capacitor bridge in ContentView.swift
- When replacing a web component with native, disable it in React 
  first (CSS display:none via a feature flag), then implement in Swift
- Always test the handoff: tapping native element → web content loads
- Native overlays must match web z-index stacking visually

## Pattern for wiring a new native view
1. Add feature flag in React: const USE_NATIVE_NAV = true
2. Conditionally hide web version: {!USE_NATIVE_NAV && <WebBottomNav/>}
3. Build SwiftUI view using SynthColor.* and SynthTypography.*
4. Wire via AppDelegate or ContentView overlay
5. Use Capacitor JS bridge for any data the native view needs