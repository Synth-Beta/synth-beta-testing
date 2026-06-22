---
name: Synth Mobile auth mode
description: Mobile app is Mode B — Supabase direct, no @workspace/api-client-react.
---

The synth-mobile Expo app is "Mode B": it calls Supabase directly, identical to the web artifact (artifacts/synth).

**Do NOT add @workspace/api-client-react** to the mobile package.json — it is web-only and causes type/build errors in the Expo context.

Required env vars (set as Replit Secrets with EXPO_PUBLIC_ prefix):
- EXPO_PUBLIC_SUPABASE_URL
- EXPO_PUBLIC_SUPABASE_ANON_KEY

Supabase client lives at: artifacts/synth-mobile/lib/supabase.ts
Auth context lives at: artifacts/synth-mobile/context/AuthContext.tsx

**Why:** The web app was migrated from Vercel and already uses Supabase directly. Mobile mirrors this pattern for consistency and simplicity.
