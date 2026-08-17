# Deployment Guide — Synth

**Single codebase:** [Synth-Beta/synth-beta-testing](https://github.com/Synth-Beta/synth-beta-testing)  
**Retired:** `samandtej-plusone/plusone-event-crew` (deleted — use `apps/admin/` here instead)

| App | Path in repo | Domain | Vercel |
|-----|--------------|--------|--------|
| Consumer web + APIs + admin | repo root (+ `apps/admin` build) | https://join.getsynth.app, https://getsynth.app | `synth-beta-testing` |
| Styleguide | `styleguide/` | https://styleguide.getsynth.app | `synth-styleguide` |
| Mobile | `mobile/` | App Store / EAS | — |

`/admin` on **getsynth.app** is served from the same **`synth-beta-testing`** deployment as join (host-based routing via `middleware.ts`). The legacy **`plusone-event-crew`** project is retired — do not deploy admin there.

## Vercel — unified web (`synth-beta-testing`)

Production deploys from **[Synth-Beta/synth-beta-testing](https://github.com/Synth-Beta/synth-beta-testing)** `main`.

- **join.getsynth.app** → consumer Vite app (`dist/`)
- **getsynth.app** → admin + marketing (`dist/_site/getsynth/`, built from `apps/admin/`)
- Build: `node scripts/build-vercel-production.mjs` (see root `vercel.json`)

Copy **Production** env vars from the old getsynth project if anything admin-only is missing (Instagram API keys, etc.).

Local admin:

```bash
npm run admin:install && npm run admin:dev
```

## Vercel — join.getsynth.app (API routes)

1. Link the Vercel project to `Synth-Beta/synth-beta-testing` (Git integration on `main`).
2. Set **Production** environment variables:

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server routes (`api/share`, push webhook, crons) |
| `PUSH_WEBHOOK_SECRET` | Yes | Generate: `npm run push:setup-webhook` |
| `EXPO_ACCESS_TOKEN` | Yes | Expo push delivery for mobile tokens |
| `CRON_SECRET` | Yes | Protects `/api/cron/*` |
| `BACKEND_URL` | If using cron sync | Express backend for JamBase sync |
| `SETLIST_FM_API_KEY` | Optional | Setlist search API |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Optional | Spotify sync API |

3. **Redeploy** production after changing env vars (Deployments → Redeploy).
4. Verify push webhook: `npm run push:test-webhook` (expects 401 without secret, 200 with valid secret).

### Supabase Database Webhook (push notifications)

In Supabase Dashboard → Database → Webhooks:

- **Table:** `public.notifications`
- **Event:** Insert
- **URL:** `https://join.getsynth.app/api/push-notification-webhook`
- **Header:** `x-webhook-secret` = same value as Vercel `PUSH_WEBHOOK_SECRET`

Apply migration `20260624140000_disable_push_queue_trigger_use_webhook.sql` to disable the duplicate DB trigger path.

## GitHub Actions (EAS mobile builds)

Add repository secret **`EXPO_TOKEN`** (from [expo.dev](https://expo.dev) → Access tokens).

Workflow: `.github/workflows/eas-mobile-build.yml` — runs on pushes to `mobile/**` or manual dispatch.

## EAS (iOS + Android)

From `mobile/`:

```bash
npm ci
npx eas-cli build --platform all --profile production
```

**iOS:** APNs key must be uploaded in Expo project settings.  
**Android:** Add `mobile/google-services.json` (from Firebase) and upload FCM service account in Expo.

See [mobile/README.md](mobile/README.md) for local dev and credential details.

## Local verification before deploy

```bash
npm ci && npm run build
cd mobile && npm ci && npx tsc --noEmit
npm run push:test-webhook   # after Vercel env is set
```
