# Synth Admin Portal (`getsynth.app`)

This is the **getsynth.app** app — marketing site + `/admin` — vendored into the beta monorepo from [samandtej-plusone/plusone-event-crew](https://github.com/samandtej-plusone/plusone-event-crew).

**Do not change `/admin` behavior here unless you intend to change production admin.** This folder exists so you can edit admin and the consumer app in one repo.

| | |
|---|---|
| **Live** | https://getsynth.app (`/admin` = ops portal) |
| **Consumer app** | Repo root → https://join.getsynth.app |
| **Vercel project** | `plusone-event-crew` (Root Directory = `apps/admin`) |

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

Copy env from the getsynth.app Vercel project (or existing plusone `.env`) into `apps/admin/.env.local`. Never commit it.

## Deploy

Vercel project for getsynth.app must use:

- **Root Directory:** `apps/admin`
- **Build:** `npm run build`
- **Output:** `dist`

After linking Git to `Synth-Beta/synth-beta-testing`, only changes under `apps/admin/**` should trigger that project (configure Ignored Build Step if needed).
