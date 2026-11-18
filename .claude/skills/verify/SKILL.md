---
name: verify
description: Prove a Synth change works by running it, before saying it is done or before the user commits. Use after any code, SQL or config change in this repo (web, mobile, api, backend, supabase). Picks the right checks for the files touched, runs them, and reports what ran and what did not.
---

# Verify

A change is not done until it has been run. Typecheck alone is not verification.

## 1. Pick checks from the diff

Run `git status --short` and match the touched paths:

| Touched | Run |
|---|---|
| `src/**`, `index.html`, `vite.config.ts` | web typecheck, `npm test`, `npm run test:e2e`, `npm run build` |
| `api/**`, `packages/synth-shared/**` | `npm test`, web typecheck |
| `backend/**` | `node -e "require('./backend/<changed file>')"` loads; start `npm run backend:dev` if a route changed |
| `apps/admin/**` | `npm run admin:build` |
| `mobile/**` | mobile typecheck; device/simulator run (section 3) |
| `supabase/migrations/**` | SQL test in a rolled-back transaction (section 4) |
| `vercel.json`, headers, `.gitignore` | `npm run security:audit`; after deploy, load the live page |
| any | `npm run security:audit` |

## 2. Commands

- Web typecheck: `npx tsc --noEmit -p tsconfig.app.json` — compare to the baseline count of pre-existing errors; only new errors in touched files matter.
- Mobile typecheck: `cd mobile && npx tsc --noEmit` — known pre-existing: typed-route errors in `app/_layout.tsx`, `/entity-followers`, tabPress.
- Unit tests: `npm test` (node test runner, ~111 tests).
- E2E (web): `npm run test:e2e`. Starts Vite on :5174 (or reuses a running one). `e2e/smoke.spec.ts` needs no account. `e2e/signed-in.spec.ts` and `e2e/onboarding.spec.ts` run only with `E2E_EMAIL` / `E2E_PASSWORD` in `.env.local` (the dedicated test account — never a real user's). `onboarding.spec.ts` resets that account's onboarding flags, walks profile, genre, artist follow, all 7 tour steps and each tab, and checks the genre signal landed in `user_preference_signals`. Against a deploy: `E2E_BASE_URL=https://join.getsynth.app npm run test:e2e`.
- If Chromium is missing: `npx playwright install chromium`.
- Add an E2E test in `e2e/` for any new user flow you build (onboarding step, form, modal). Use `getByPlaceholder` / `getByRole`, assert visible results, collect `pageerror`.

## 3. Mobile (Expo)

No automated device run exists yet. Use the Expo MCP tools when available (`simulator_start`, `automation_tap`, `automation_take_screenshot`). Otherwise give the user exact device steps (what to tap, what they should see) and mark the change "not device-verified".

## 4. SQL / migrations

Never run against production without the user. Hand the user a self-undoing test:

```sql
begin;
select set_config('request.jwt.claims', json_build_object('sub', '<user uuid>', 'role', 'authenticated')::text, true);
set local role authenticated;
-- the statement that must succeed or fail
rollback;
```

State the expected result (row count or error code) before they run it.

## 5. Rules

- Never edit a test or check to make it pass. Fix the code, or explain why the check is wrong and ask.
- No retries, sleeps or `retries > 0` for flaky tests. Find the cause, or delete the test and say why.
- Still failing after 3 fix attempts: stop and bring it to the user with the output.
- Never commit or push (the user does).
- Windows: Application Control can block freshly downloaded native `.node` files (e.g. Rollup). That is a machine policy, not a code failure — report it and note Vercel builds on Linux.

## 6. Report

End with a short list: each check, the command, pass/fail, and anything not verified (e.g. "not run on a device").
