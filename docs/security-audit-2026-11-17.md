# Security audit — 2026-11-17

The checklist from the video (18 items are visible in it; 2 extras added), checked against the code in this repo. Started in a Claude cloud session (commit 60b7702, never pushed) and finished locally from its patch. **The live Supabase project was not reachable**, so database items marked 🟡 need the checks in [Supabase checklist](#supabase-checklist-run-these-yourself) below.

✅ fine as-is · 🔧 fixed · 🟡 needs you to check or decide

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Hash passwords | ✅ | No custom password storage; Supabase Auth hashes them (bcrypt). |
| 2 | Debug mode off | ✅ | Prod build: `sourcemap: 'hidden'`, `console.log/debug/info` stripped, `debugger` dropped. Backend error handler hides stack traces in production. `/auth/apple` mock route returns 501 in production, and its mock tokens are never accepted by `requireAuth` (which verifies with Supabase). |
| 3 | Proper auth | ✅ | API routes verify the Supabase token with `auth.getUser()`; backend `requireAuth` does the same. |
| 4 | Hide API keys | ✅ | Only the Supabase **publishable** key is in code (`mobile/eas.json`, `mobile/src/integrations/supabase/client.ts`) — that key is designed to be public; RLS is what protects data. No secret keys found in tracked files or the built bundle. |
| 5 | Stop XSS | ✅ | No `dangerouslySetInnerHTML` on user content. `api/share.ts` escapes everything it puts in HTML. Admin newsletter renderer escapes all fields. |
| 6 | Exposed files | 🔧 | `supabase_logs.csv` (production request logs with user IDs and an email) was committed — untracked (`git rm --cached`; the local copy is kept) and git-ignored. It still exists in git history; if the repo is or becomes public, purge it with `git filter-repo`. |
| 7 | Rate limiting | 🔧 / 🟡 | **Fixed a bypass:** backend limiter keyed on the first 16 chars of the (unverified) Bearer token, so sending a random token per request got a fresh bucket every time. Now keyed on IP. 🟡 Vercel `/api/*` functions (e.g. `setlists/search`, `delete-account`, `auth/session`) have no rate limit — add a Vercel Firewall rate-limit rule for `/api/` in the dashboard. |
| 8 | Env variables | 🔧 | `.gitignore` only ignored `.env`, `.env.local`, `.env.*.local` — `.env.production` etc. would have been committable. Now ignores `.env.*` (keeps `*.example`). |
| 9 | Security audit | 🔧 | `npm run security:audit` pointed at a missing script. Added `scripts/security-check.mjs` and a GitHub workflow that runs it on every push/PR. Local run: 2219 tracked files + `dist/` clean. |
| 10 | Secure database | 🟡 | See Supabase checklist. Previous reviews (`supabase/security-review-*`) look thorough, but whether they were applied can only be confirmed live. |
| 11 | Sanitize forms | ✅ | Backend: sanitize middleware + Joi schemas on every route. Frontend: zod/react-hook-form. Supabase queries are parameterized. |
| 12 | CORS settings | ✅ | Backend: strict origin allowlist in production. `api/*` functions use `*` but auth is via `Authorization` header, not cookies, so other sites can't act as a logged-in user. |
| 13 | Update packages | 🔧 / 🟡 | Applied non-breaking `npm audit fix` to root, `backend`, `apps/admin`. Remaining need major upgrades: `apn` (old push lib → bundles vulnerable `jsonwebtoken`/`node-forge`; consider replacing with Expo push / `@parse/node-apn`), `zod` 3→4. `mobile/` not touched (Expo upgrades can break native builds) — has 1 critical (`shell-quote`) and 17 high; run `npx expo install --fix` + `npm audit fix` there and test an EAS build. |
| 14 | Lock admin routes | 🔧 | Cron/admin endpoints all check `CRON_SECRET` in constant time. **Fixed:** `adminCron` compared `AI_SCENE_GUIDES_ADMIN_CRON_KEY` with `===` and would accept an empty header if that env var was set to `""`. **Fixed:** no migration stopped a user from changing their own `users.account_type` — added `20261117120000_guard_users_privileged_columns.sql` (run its pre-check first). Secret consumer Admin tab check (`secretAdminAccess.ts`) is strict (admin + Lauren's email + username) — unchanged. |
| 15 | Security headers | 🔧 | `vercel.json` had none. Added `X-Content-Type-Options`, `X-Frame-Options: SAMEORIGIN`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`. Not added: Content-Security-Policy (would need testing against Supabase/Spotify/maps/etc.; start with `Content-Security-Policy-Report-Only`). |
| 16 | Own data only | ✅ / 🟡 | API handlers act on the user from the verified token, not on IDs from the request. Row-level ownership is RLS → Supabase checklist. |
| 17 | Remove unused | 🟡 | Not changed (risky without knowing what you still use). Candidates: `UsersOwnerAppDataLocalTempclaudegenre_distribution.json` (stray temp file), `backend/spotify-link-report-*.json`, `temp/`, `brag-output/` (has an mp4/mp3), `backend/test-apns-connection.js`. |
| 18 | Scan git secrets | ✅ | Scanned all tracked files: no real secrets. History not scanned — run `gitleaks detect` locally once for the full history. |
| 19 | *(extra)* Backend headers | ✅ | Express uses `helmet`. |
| 20 | *(extra)* Login rate limits | ✅ | Login/signup go through Supabase Auth (has its own rate limits — check them in Dashboard → Auth → Rate Limits). |

## Supabase checklist (run these yourself)

Run in the Supabase SQL editor.

**1. Every public table has RLS on** — should return 0 rows:
```sql
select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
```

**2. Users can't make themselves admin** — apply `supabase/migrations/20261117120000_guard_users_privileged_columns.sql` after its pre-check (the admin RPCs must be SECURITY DEFINER). Then, signed in as a normal user in the app's browser console, this must fail with error 42501:
```js
await supabase.from('users').update({ account_type: 'admin' }).eq('user_id', '<your id>')
```

**3. Run the existing audit:** `supabase/security-review-2026-09-01/10_one_shot_audit.sql` — it lists open tables, blanket write policies and anon-callable SECURITY DEFINER functions.

**4. Dashboard:** Advisors → Security Advisor (fix all errors); Auth → Rate Limits; Auth → enable leaked-password protection; Storage → confirm private buckets are private.

**5. Keys:** confirm the service-role / `sb_secret_` key exists only in Vercel/backend env vars, never in any `VITE_` / `EXPO_PUBLIC_` variable.

Note: `npm ci` needs `github.com/node-apn/node-http2` (via `apn`) — another reason to replace `apn`.
