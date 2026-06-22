# Synth Security Overview

This document describes how Synth protects user data, secrets, and API access. For env var names see [`.env.example`](../.env.example).

## Data we store

| Data | Purpose | Protection |
|------|---------|------------|
| Profile (name, username, avatar, bio) | Social discovery, chat | RLS; `public_profiles` view for safe fields |
| Email (Apple metadata) | Account linking | Column revoked from `anon`/`authenticated` SELECT |
| Location (city, coords cache) | Event discovery | RLS on user rows; web caches lat/lng locally |
| Music taste / preferences | Feed, matching | RLS on `user_preference_signals`, `user_preferences` |
| Messages | Chat | RLS + optional encryption; chat images in private storage |
| Push tokens | Notifications | RLS on `device_tokens`; server webhook secret |
| Streaming profiles / Spotify tokens | Personalization | RLS; Spotify OAuth tokens server-side where possible |

## Authentication

- **Clients** use Supabase Auth (Apple Sign In, etc.) → JWT in session.
- **Express backend** verifies JWT via `backend/middleware/requireAuth.js` (`auth.getUser(token)`) on user-specific routes.
- **Vercel functions** verify JWT for destructive actions (`api/delete-account.ts`) and shared secrets for cron/webhooks.
- **Service role key** is used only in backend, Vercel serverless, and scripts — never in Vite or Expo bundles.

## Row Level Security (RLS)

Key migrations:

- [`20260327140000_security_linter_rls_and_invoker_views.sql`](../supabase/migrations/20260327140000_security_linter_rls_and_invoker_views.sql) — `user_preference_signals`, view invoker mode
- [`20260607120000_security_rls_hardening.sql`](../supabase/migrations/20260607120000_security_rls_hardening.sql) — `user_preferences`, bot filtering, chat INSERT lockdown, `public_profiles`, private chat-images

Summary:

- **messages / chat_participants**: member-scoped
- **user_preference_signals / user_preferences / streaming_profiles**: own-row only
- **spotify_user_tokens**: no client SELECT
- **device_tokens**: own-row only
- **users**: world-readable for real users (feeds); bots hidden via RESTRICTIVE policy; email column revoked from clients
- **chats**: client INSERT revoked — creation via SECURITY DEFINER RPCs only

Many RPCs use `SECURITY DEFINER` intentionally (chat creation, feeds). Review `anon` EXECUTE grants periodically.

## Secret management

- All secrets in environment variables (see `.env.example`).
- `.env`, `.env.local` are gitignored — never commit real values.
- Run `node scripts/check-env.mjs` before backend start; `node scripts/security-check.mjs` before deploy.
- Rotate keys immediately if ever committed (Supabase service role, Ticketmaster, Spotify, etc.).

## Bot accounts

- Seeded with random passwords (`scripts/seed-bot-accounts.mjs`); passwords are not stored in repo.
- `users.is_bot = true` excluded from analytics and client SELECT.
- **Auth hook** [`supabase/functions/block-bot-login`](../supabase/functions/block-bot-login/index.ts) rejects normal sign-in for bots.
- Bot cron (`api/cron/seed-bot-messages.ts`) uses `CRON_SECRET` + service role — not user JWTs.

## Storage

- **profile-avatars**, review/event photos: public read (social content).
- **chat-images**: private bucket; participant-scoped SELECT; clients use signed URLs.

## Reporting vulnerabilities

Email the Synth team privately with:

1. Description and impact
2. Reproduction steps
3. Affected component (web, mobile, API, Supabase)

We aim to acknowledge within 72 hours and patch critical issues promptly.

## Known limitations / future work

- `users` table still exposes non-email profile fields to all authenticated/anon clients (required for feeds); migrate more UIs to `public_profiles`.
- Spotify tokens in browser `localStorage` (XSS risk) — prefer secure storage / server-side refresh.
- Rate limiter fails open if Upstash Redis is unavailable (availability vs strict security tradeoff).
- Email on `users` may still be readable via SECURITY DEFINER RPCs — audit RPC return shapes.

### Dependency audit (manual upgrades)

After `npm audit fix`, remaining HIGH issues may require breaking changes:

| Package | Issue | Note |
|---------|-------|------|
| `apn` / `jsonwebtoken` / `node-forge` | HIGH (push notifications) | Manual upgrade: `apn@2.x` — check APNs push changelog |
| `@vercel/node` | HIGH (undici, path-to-regexp) | Manual upgrade: `@vercel/node@4.x` — test all Vercel functions |
| `expo` / `uuid` (mobile) | moderate | Tracked via Expo SDK upgrades |
