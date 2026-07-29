---
name: run-synth-backend
description: Build, run, and smoke-test the Synth backend Express API (search, setlists, JamBase/Ticketmaster proxies, push notifications). Use when asked to start the backend, run its dev server, hit its endpoints, or verify a backend change actually works end-to-end.
---

This is a plain Express/Node HTTP API (`backend/server.js`) — no GUI. Drive it
with the smoke-test script `.claude/skills/run-synth-backend/smoke.sh`, which
launches the server in the background, waits for it to be ready, hits real
endpoints (DB-backed + live JamBase proxy) with `curl`, and reports pass/fail.
For anything the script doesn't cover, `curl` against `http://localhost:3001`
directly while the server is running.

All paths below are relative to `backend/`.

## Known issue you may hit first: `backend/package.json` is missing

As of this writing, `backend/package.json` and `backend/package-lock.json` do
**not exist in the repo** (deleted in commit `82e3a84f`, "Clean up Replit
agent junk and restore working codebase structure" — it restored the route
`.js` files but not the manifest). `backend/node_modules/` may still be
present but stale. Before anything else, check:

```bash
ls backend/package.json 2>/dev/null || echo "MISSING"
```

If missing, restore it from the last commit before it was dropped (verified
that every dependency in this snapshot still matches everything `backend/*.js`
actually `require()`s today):

```bash
git show 82e3a84f^:.migration-backup/backend/package.json > backend/package.json
rm -rf backend/node_modules
cd backend && npm install
```

If someone has since fixed this upstream, skip straight to Setup below.

## Prerequisites

- Node.js 18+ (repo uses Node 24 in dev; `engines` says `>=18.0.0`).
- Root `.env.local` (repo root, **not** `backend/.env`) with at least:
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `JAMBASE_API_KEY`. In development,
  missing keys only warn (don't block startup) — see
  `backend/config/checkEnv.js` / `backend/config/apiKeys.js`. Production
  additionally requires `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`,
  `JWT_SECRET`.

## Setup

```bash
cd backend && npm install
```

## Run (agent path)

```bash
bash backend/.claude/skills/run-synth-backend/smoke.sh
```

This launches `node server.js` on port 3001 (log at `$TMPDIR/synth-backend.log`
or `/tmp/synth-backend.log`), polls `/health` until ready, runs 5 checks
against real endpoints, prints `N passed, N failed`, then stops the server.
Exit code is 0 iff all checks passed.

To leave the server running afterward for manual poking:

```bash
bash backend/.claude/skills/run-synth-backend/smoke.sh --keep
# then, e.g.:
curl "http://localhost:3001/api/concerts/search?query=coachella&limit=5"
curl "http://localhost:3001/api/jambase/events?limit=3"
# stop it when done:
kill $(lsof -ti:3001)   # or: taskkill //F //PID <pid> on Windows
```

Override the port with `PORT=3002 bash .claude/skills/run-synth-backend/smoke.sh`.

## Run (human path)

From repo root:

```bash
npm run backend:dev   # nodemon server.js, auto-restarts on change
npm run backend:start # node server.js, no reload
```

Blocks the terminal; `Ctrl-C` to stop. Requires `backend/package.json` to
exist (see above).

## Test

No test suite is configured (`npm test` in `backend/package.json` is a no-op
placeholder: `echo "No tests specified" && exit 0`). Use the smoke script
above as the verification step for backend changes.

## Gotchas

- **`/api/concerts/health` route order — fixed.** `backend/search-routes.js`
  used to register `router.get('/api/concerts/:id', ...)` before
  `router.get('/api/concerts/health', ...)`, so `:id` swallowed the health
  path. `health` is now registered first. The smoke script still doesn't
  check this route - worth adding.
- **`/api/concerts/search` takes `query`, not `q`.** Passing `?q=...` fails
  Joi validation with `"q" is not allowed`. Use `?query=...`.
- **`backend/node_modules` can silently go stale relative to git.** Since
  `package.json` was missing for a while, any `node_modules` on disk predates
  that gap and won't match `package.json` once restored — always
  `rm -rf backend/node_modules && npm install` after restoring the manifest,
  don't just `npm install` on top of the stale folder.
- **Root `.env.local`, not `backend/.env`.** `server.js` loads
  `path.join(__dirname, '..', '.env')` then `.env.local` — env vars live at
  the repo root, shared with the frontend (non-`VITE_`-prefixed names for
  the backend, e.g. `SUPABASE_URL` not `VITE_SUPABASE_URL`).

## Troubleshooting

- **`Error: Cannot find module 'express'` (or similar) on `npm run backend:dev`**:
  `backend/package.json` is missing or `node_modules` wasn't installed
  against it. See "Known issue" above.
- **`Port 3001 is already in use`**: a previous run wasn't stopped.
  `netstat -ano | grep :3001` (Windows) or `lsof -ti:3001` (Linux/Mac) to
  find the PID, then kill it, or run with `PORT=3002`.
- **Startup warnings about `UPSTASH_REDIS_REST_URL` / `TM_API_KEY` /
  `JWT_SECRET` missing**: expected and non-fatal in development — the server
  falls back to in-memory rate limiting and a generated temporary JWT
  secret. Only required in production (`NODE_ENV=production`).
