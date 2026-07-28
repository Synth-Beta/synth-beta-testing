# Deployment Guide — Synth

**Single codebase:** [Synth-Beta/synth-beta-testing](https://github.com/Synth-Beta/synth-beta-testing)  
**Retired:** `samandtej-plusone/plusone-event-crew` (deleted — use `apps/admin/` here instead)

| App | Path in repo | Domain | Vercel |
|-----|--------------|--------|--------|
| Consumer web + APIs | repo root | https://join.getsynth.app | `synth-beta-testing` |
| Admin + marketing | `apps/admin/` | https://getsynth.app | `plusone-event-crew` (Root Directory = `apps/admin`) |
| Styleguide | `styleguide/` | https://styleguide.getsynth.app | `synth-styleguide` |
| Mobile | `mobile/` | App Store / EAS | — |

`/admin` on getsynth.app is the ops portal from `apps/admin` — same app as before the monorepo merge. Do not change admin UX unless intentional.

## Vercel — join.getsynth.app (repo root)

Production deploys from **[Synth-Beta/synth-beta-testing](https://github.com/Synth-Beta/synth-beta-testing)** `main` via Vercel. Mobile store builds use **EAS** from `mobile/`.

## Vercel — getsynth.app (`apps/admin`)

1. Project **plusone-event-crew** → connect Git to `Synth-Beta/synth-beta-testing`
2. Settings → General → **Root Directory** = `apps/admin`
3. Keep existing Production env vars on that project (do not reuse join-only secrets incorrectly)
4. Optional Ignored Build Step so admin only rebuilds when `apps/admin/**` changes:
   ```bash
   git diff --quiet HEAD^ HEAD -- ./apps/admin
   ```

Local admin:
```bash
npm run admin:install && npm run admin:dev
```

## Vercel (web + API routes — join)

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
