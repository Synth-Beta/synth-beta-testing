# Synth Admin Portal (`getsynth.app`)

Marketing site + `/admin` ops portal. Lives in this monorepo at `apps/admin/`.

**Canonical repo:** [Synth-Beta/synth-beta-testing](https://github.com/Synth-Beta/synth-beta-testing)  
**Legacy:** `samandtej-plusone/plusone-event-crew` has been deleted — do not clone or deploy from it.

**Do not change `/admin` behavior here unless you intend to change production admin.**

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

Copy env from the getsynth.app Vercel project into `apps/admin/.env.local`. Never commit it.

## Deploy

Vercel project for getsynth.app must use:

- **Git repo:** `Synth-Beta/synth-beta-testing`
- **Root Directory:** `apps/admin`
- **Build:** `npm run build`
- **Output:** `dist`

Optional Ignored Build Step (only rebuild when admin changes):

```bash
git diff --quiet HEAD^ HEAD -- ./apps/admin
```
