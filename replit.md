# Synth - Find Friends for Local Events

A social app for discovering local events (concerts, shows, activities) and finding others to attend with.

## Run & Operate

- `pnpm --filter @workspace/synth run dev` — run the frontend (via workflow: `artifacts/synth: web`)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port auto-assigned)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: Vite + React, Tailwind CSS v3, React Router DOM, Supabase
- Backend: Express 5
- DB: PostgreSQL + Drizzle ORM (Replit-managed) + Supabase (user data/auth)
- UI: Radix UI, shadcn/ui components
- Maps: Leaflet / React Leaflet
- Auth: Supabase Auth (email, Apple, Spotify OAuth)

## Where things live

- `artifacts/synth/` — main web frontend (Vite + React)
- `artifacts/synth/src/pages/` — page components (App, Auth, ArtistPage, VenuePage, etc.)
- `artifacts/synth/src/components/` — shared UI components
- `artifacts/synth/src/integrations/supabase/` — Supabase client config
- `artifacts/synth/src/services/` — business logic / API calls
- `artifacts/synth/packages/synth-shared/` — shared utilities
- `artifacts/api-server/` — Express backend API
- `lib/db/` — Drizzle ORM schema (Replit Postgres)
- `lib/api-spec/openapi.yaml` — OpenAPI spec

## Architecture decisions

- Uses Supabase for auth + real-time data; Replit Postgres via Drizzle for internal/backend data
- `@synth/shared` package contains shared business logic
- Capacitor dependencies included for native iOS/Android builds (the original mobile layer)
- React Router DOM (not wouter) is used for routing — matches the original app

## Product

A social concert/event app: users sign in, discover nearby events, connect with others going to the same shows, chat, follow artists/venues, and build their social music graph.

## User preferences

- Tailwind CSS v3 (not v4/tailwindcss/vite plugin — uses postcss config instead)
- `@synth/shared` resolves to `artifacts/synth/packages/synth-shared/src/index.ts` via vite alias
- `@src/` alias resolves to `artifacts/synth/src/` (for asset imports like `@src/assets/Synth_Placeholder.png`)

## Required Environment Variables

Set these as Replit Secrets:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase anonymous/publishable key
- `VITE_SUPABASE_PUBLISHABLE_KEY` — (same as anon key)
- `VITE_SPOTIFY_CLIENT_ID` — Spotify OAuth client ID
- `VITE_SPOTIFY_REDIRECT_URI` — Spotify callback URL
- `VITE_MAPBOX_TOKEN` — Mapbox token for maps
- `VITE_MAPBOX_KEY` — Mapbox key

## Gotchas

- The app requires Supabase credentials to function — without them auth will fail but the UI still renders
- Capacitor push notifications (`@capacitor/push-notifications`) are installed but gracefully degrade on web
- `react-joyride` default export workaround needed (CJS/ESM issue) — see OnboardingTour.tsx
- Tailwind v3 uses postcss.config.js, NOT `@tailwindcss/vite` plugin
- `public_reviews_with_profiles` is a Supabase view, not an npm package — ignore install error
- Do NOT run `pnpm dev` at workspace root — use workflow or `pnpm --filter @workspace/synth run dev`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
