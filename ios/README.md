# LEGACY — Capacitor iOS shell

This directory is the **Capacitor** native project. It loads the **Vite production bundle** (`dist/`) from the repo root inside a **WebView**.

- **Do not** add new product features here. Implement phone UX in **`mobile/`** (Expo / React Native).
- **Store builds:** use **EAS** from `mobile/` — not this Xcode project — unless you still maintain a legacy Capacitor release.
- **When to touch this tree:** critical fixes for anyone still on the Capacitor app, or running `npm run ios:build` after web bundle changes that must ship to that shell.

See [../mobile/README.md](../mobile/README.md) and [../.cursor/rules/expo-mobile-primary.mdc](../.cursor/rules/expo-mobile-primary.mdc).
