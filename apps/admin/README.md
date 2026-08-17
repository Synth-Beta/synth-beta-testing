# Synth Admin Portal (`getsynth.app`)

Marketing site + `/admin` ops portal. Lives in this monorepo at `apps/admin/`.

**Canonical repo:** [Synth-Beta/synth-beta-testing](https://github.com/Synth-Beta/synth-beta-testing)  
**Legacy:** `samandtej-plusone/plusone-event-crew` has been deleted — do not clone or deploy from it.

**Do not change `/admin` behavior here unless you intend to change production admin.**

| | |
|---|---|
| **Live** | https://getsynth.app (`/admin` = ops portal) |
| **Consumer app** | Repo root → https://join.getsynth.app |
| **Vercel project** | `synth-beta-testing` (same deploy as join; `middleware.ts` routes getsynth.app → `apps/admin` build) |

Legacy **`plusone-event-crew`** is no longer used for production — do not deploy admin there.

## Local

```bash
# from repo root
npm run admin:install
npm run admin:dev
```

Or:

```bash
cd apps/admin && npm install && npm run dev
```

Copy env from the getsynth.app Vercel project into `apps/admin/.env.local`. Never commit it.

## Deploy

Production admin ships with the **unified** Vercel project **`synth-beta-testing`** (not a separate getsynth project):

- **Git repo:** `Synth-Beta/synth-beta-testing` (repo root)
- **Build:** `node scripts/build-vercel-production.mjs` (consumer + admin)
- **getsynth.app routing:** root `middleware.ts` → `dist/_site/getsynth/`
- **Local build check:** `npm run build:vercel`

Ensure Production env on `synth-beta-testing` includes admin needs (`VITE_SUPABASE_*`, Instagram keys if used, `SLACK_ALERTS_WEBHOOK_URL` for `/api/ops-alert`).
