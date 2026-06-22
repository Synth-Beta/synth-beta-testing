# LEGACY — Capacitor Android shell

This directory is the **Capacitor** Android project. It wraps the **Vite production bundle** (`dist/`) from the repo root in a **WebView**.

- **Do not** add new product features here. Implement phone UX in **`mobile/`** (Expo / React Native).
- **Store builds:** use **EAS** from `mobile/` — not this Gradle project — unless you still maintain a legacy Capacitor release.
- **When to touch this tree:** critical fixes for anyone still on the Capacitor app, or `npm run android:build` after web bundle changes for that shell.

See [../mobile/README.md](../mobile/README.md) and [../.cursor/rules/expo-mobile-primary.mdc](../.cursor/rules/expo-mobile-primary.mdc).
