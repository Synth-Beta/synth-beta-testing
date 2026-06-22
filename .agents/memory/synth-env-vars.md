---
name: Synth Environment Variables
description: Which env vars are needed, where they go, and current status.
---

## Web app (artifacts/synth) — Vite VITE_ prefix

| Variable | Status | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | Set (shared env var) | `https://glpiolbrafqikqhnseto.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Set (Replit Secret) | Required for Supabase auth to work |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Set (shared, empty) | Alias; client falls back to ANON_KEY |
| `VITE_SPOTIFY_CLIENT_ID` | Missing | Maps and Spotify stats won't work |
| `VITE_MAPBOX_TOKEN` | Missing | Maps won't render |
| `VITE_SPOTIFY_REDIRECT_URI` | Set | Redirect URI configured |

## Mobile app (artifacts/synth-mobile) — EXPO_PUBLIC_ prefix

| Variable | Status | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Set (Replit Secret) | `https://glpiolbrafqikqhnseto.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Set (Replit Secret) | Required for Supabase auth |

## Supabase project

- URL: `https://glpiolbrafqikqhnseto.supabase.co`
- Anon key is stored as `VITE_SUPABASE_ANON_KEY` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` secrets.

**Why:** Vite requires `VITE_` prefix to expose env vars to browser bundle. Expo requires `EXPO_PUBLIC_` prefix. They cannot share the same secret name even though the value is identical.
