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

**Ignored Build Step:** `apps/admin/vercel.json` sets `"ignoreCommand": "exit 1"`, which always signals "changed" so Vercel builds on every push. Do not switch this back to a `git diff --quiet HEAD^ HEAD -- ./apps/admin`-style check in the dashboard — that command only diffs the new commit against its immediate parent, so a *batch* push (several commits landing in one `git push`, e.g. a merge) gets checked only against the last commit. If that last commit doesn't touch `apps/admin`, Vercel silently skips the rebuild even though earlier commits in the same batch changed admin code — this already happened once (2026-08-07) and cost hours to diagnose because the deploy looked fresh (new timestamp) while serving stale JS. If admin changes ever don't show up after a push, first verify the live bundle actually contains the new code (fetch the deployed `/assets/index-*.js` and grep for a string you just added) before assuming the source is wrong.
