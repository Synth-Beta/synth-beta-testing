# Admin Signup Method Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show admins, in the "Users & Analytics" tab of the admin site (`apps/admin`), which signup method each user used — Apple (iOS), Android (Google), or Email — as both a filterable per-user list and an aggregate breakdown chart.

**Architecture:** Supabase already records the signup provider for every user automatically in `auth.users.raw_app_meta_data->>'provider'`. A new `SECURITY DEFINER` Postgres function exposes this to admins only (the admin frontend only holds the anon key and cannot read `auth.users` directly). The admin frontend calls this function once via `supabase.rpc(...)`, joins the result into the user list it already fetches, and renders it in two new cards that mirror the visual style of existing cards in the same tab.

**Tech Stack:** React 18 + TypeScript + Vite (`apps/admin`), Supabase (Postgres + PostgREST), `recharts` for charts, shadcn/ui components (`Card`, `Badge`, `Select`, `Table`).

## Global Constraints

- **Never apply Supabase schema/function/data changes directly.** The migration in Task 1 is written to a file for the user to review and apply themselves — do not run it via `mcp__supabase__apply_migration`, `mcp__supabase__execute_sql`, or any other execution path.
- **Never commit or push without explicit user permission.** Stop after each task and let the user review; do not `git commit` unless asked.
- `apps/admin` has no test runner configured (no vitest/jest, no `test` script in `package.json`) and no precedent of component tests for `Admin.tsx`. Per-task verification therefore uses TypeScript typechecking (`npx tsc --noEmit -p tsconfig.app.json` from `apps/admin/`) in place of a unit test run, plus a manual dev-server check at the end. This is a deliberate adaptation to this codebase's actual tooling, not a shortcut — do not add a new test framework as part of this plan (out of scope, YAGNI).
- Follow existing patterns exactly: state hooks, `Select`/`Badge`/`Card` usage, and chart styling must match the neighboring code they sit next to (see each task's anchors).

---

### Task 1: Migration — expose signup provider to admins

**Files:**
- Create: `supabase/migrations/20260806120000_add_get_user_signup_providers_function.sql`

**Interfaces:**
- Produces: a Postgres function `public.get_user_signup_providers()` returning `TABLE(user_id uuid, signup_method text)`, where `signup_method` is one of `'apple' | 'android' | 'email' | 'unknown'`. Task 3 calls this via `supabase.rpc('get_user_signup_providers')`.

- [ ] **Step 1: Write the migration file**

```sql
-- Expose each user's signup provider (Apple / Google / email) to admins only.
--
-- Supabase already records this automatically in auth.users.raw_app_meta_data->>'provider'
-- for every account (past and future) — this function just surfaces it safely to the
-- admin frontend, which only holds the anon key and cannot read the auth schema directly.

CREATE OR REPLACE FUNCTION public.get_user_signup_providers()
RETURNS TABLE (user_id uuid, signup_method text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.user_id = auth.uid()
      AND u.account_type = 'admin'::account_type
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    au.id AS user_id,
    CASE au.raw_app_meta_data ->> 'provider'
      WHEN 'apple' THEN 'apple'
      WHEN 'google' THEN 'android'
      WHEN 'email' THEN 'email'
      ELSE 'unknown'
    END AS signup_method
  FROM auth.users au;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_signup_providers() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_signup_providers() TO authenticated;
```

- [ ] **Step 2: Self-check the migration (no execution)**

Read the file back and confirm, by inspection:
- The admin gate (`account_type = 'admin'::account_type`) matches the exact pattern already used in `supabase/perf-review-2026-07-12/02_consolidate_rls_policies.sql:86-87`.
- `SET search_path = public, auth, pg_catalog` matches the pattern in `supabase/migrations/20260716130000_add_public_user_trigger.sql`.
- `REVOKE ALL ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated` matches the "anon EXECUTE revoke" precedent from the 2026-07-10 security review.

Do **not** run this file against the database — leave it for the user to review and apply.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260806120000_add_get_user_signup_providers_function.sql
git commit -m "Add admin-only function to expose user signup provider"
```

(Only run this commit if the user has already told you it's fine to commit for this session — otherwise stop and let them review the file first.)

---

### Task 2: Signup-method helper module

**Files:**
- Create: `apps/admin/src/lib/signupMethod.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces:
  - `type SignupMethod = 'apple' | 'android' | 'email' | 'unknown'`
  - `normalizeSignupMethod(value: string | null | undefined): SignupMethod`
  - `SIGNUP_METHOD_LABELS: Record<SignupMethod, string>`
  - `SIGNUP_METHOD_BADGE_VARIANT: Record<SignupMethod, 'default' | 'secondary' | 'destructive' | 'outline'>`
  - `SIGNUP_METHOD_FILTER_OPTIONS: Array<{ value: 'all' | SignupMethod; label: string }>`

  Task 3 imports `SignupMethod` and `normalizeSignupMethod`. Tasks 4 and 5 import `SIGNUP_METHOD_LABELS`, `SIGNUP_METHOD_BADGE_VARIANT`, and `SIGNUP_METHOD_FILTER_OPTIONS`.

- [ ] **Step 1: Write the module**

```typescript
export type SignupMethod = 'apple' | 'android' | 'email' | 'unknown';

const VALID_SIGNUP_METHODS: SignupMethod[] = ['apple', 'android', 'email', 'unknown'];

/**
 * The RPC already normalizes provider -> signup_method server-side; this validates
 * the boundary response defensively rather than trusting it blindly.
 */
export function normalizeSignupMethod(value: string | null | undefined): SignupMethod {
  if (value && (VALID_SIGNUP_METHODS as string[]).includes(value)) {
    return value as SignupMethod;
  }
  return 'unknown';
}

export const SIGNUP_METHOD_LABELS: Record<SignupMethod, string> = {
  apple: 'Apple (iOS)',
  android: 'Android (Google)',
  email: 'Email',
  unknown: 'Unknown',
};

export const SIGNUP_METHOD_BADGE_VARIANT: Record<SignupMethod, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  apple: 'default',
  android: 'secondary',
  email: 'outline',
  unknown: 'destructive',
};

export const SIGNUP_METHOD_FILTER_OPTIONS: Array<{ value: 'all' | SignupMethod; label: string }> = [
  { value: 'all', label: 'All Signup Methods' },
  { value: 'apple', label: SIGNUP_METHOD_LABELS.apple },
  { value: 'android', label: SIGNUP_METHOD_LABELS.android },
  { value: 'email', label: SIGNUP_METHOD_LABELS.email },
  { value: 'unknown', label: SIGNUP_METHOD_LABELS.unknown },
];
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/admin && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors referencing `signupMethod.ts` (pre-existing unrelated errors elsewhere in the app, if any, are not this task's concern — only confirm no *new* errors from this file).

- [ ] **Step 3: Commit**

```bash
git add apps/admin/src/lib/signupMethod.ts
git commit -m "Add signup-method normalization and label helpers"
```

---

### Task 3: Fetch signup methods and wire state into Admin.tsx

**Files:**
- Modify: `apps/admin/src/pages/Admin.tsx`

**Interfaces:**
- Consumes: `SignupMethod`, `normalizeSignupMethod` from `@/lib/signupMethod` (Task 2).
- Produces: state `signupMethods: Record<string, SignupMethod>` (keyed by `user.id`, which is `auth.users.id` — see `fetchUsers` at `Admin.tsx:407-408` where `User.id` is already set from `userRecord.user_id`), `signupMethodsError: string | null`, `signupMethodFilter: 'all' | SignupMethod`, and setters `setSignupMethodFilter`. Tasks 4 and 5 read these.

- [ ] **Step 1: Add the import**

In `apps/admin/src/pages/Admin.tsx`, find this existing import (around line 62):

```typescript
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
```

Add directly after it:

```typescript
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  SignupMethod,
  normalizeSignupMethod,
  SIGNUP_METHOD_LABELS,
  SIGNUP_METHOD_BADGE_VARIANT,
  SIGNUP_METHOD_FILTER_OPTIONS,
} from '@/lib/signupMethod';
```

- [ ] **Step 2: Add state**

Find this existing state block (around line 227-231):

```typescript
  const [dayUsersDialogOpen, setDayUsersDialogOpen] = useState(false);
  const [selectedDayLabel, setSelectedDayLabel] = useState('');
  const [selectedDayKey, setSelectedDayKey] = useState('');
  const [daySignupUsers, setDaySignupUsers] = useState<DaySignupUser[]>([]);
  const [dayUsersLoading, setDayUsersLoading] = useState(false);
```

Add directly after it:

```typescript
  const [dayUsersDialogOpen, setDayUsersDialogOpen] = useState(false);
  const [selectedDayLabel, setSelectedDayLabel] = useState('');
  const [selectedDayKey, setSelectedDayKey] = useState('');
  const [daySignupUsers, setDaySignupUsers] = useState<DaySignupUser[]>([]);
  const [dayUsersLoading, setDayUsersLoading] = useState(false);
  const [signupMethods, setSignupMethods] = useState<Record<string, SignupMethod>>({});
  const [signupMethodsError, setSignupMethodsError] = useState<string | null>(null);
  const [signupMethodFilter, setSignupMethodFilter] = useState<'all' | SignupMethod>('all');
```

- [ ] **Step 3: Add the fetch function**

Find the end of `fetchUsers` (around line 444):

```typescript
    } finally {
      setLoading(false);
    }
  };

  const calculateDailyUsers = (usersList: User[]) => {
```

Insert a new function between them:

```typescript
    } finally {
      setLoading(false);
    }
  };

  const fetchSignupMethods = async () => {
    const { data, error } = await db.rpc('get_user_signup_providers');

    if (error) {
      console.error('Error fetching signup methods:', error);
      setSignupMethodsError(error.message || 'Signup method data unavailable.');
      setSignupMethods({});
      return;
    }

    const map: Record<string, SignupMethod> = {};
    (data || []).forEach((row: { user_id: string; signup_method: string }) => {
      map[row.user_id] = normalizeSignupMethod(row.signup_method);
    });
    setSignupMethods(map);
    setSignupMethodsError(null);
  };

  const calculateDailyUsers = (usersList: User[]) => {
```

- [ ] **Step 4: Call it alongside the other fetches**

Find the main data-loading effect (around line 376-384):

```typescript
  useEffect(() => {
    if (user && isAdmin) {
      fetchUsers();
      fetchTodayAdditions();
      fetchModerationFlags();
      fetchUserAnalytics();
      fetchSocialMediaAnalytics();
    }
  }, [user, isAdmin, fetchSocialMediaAnalytics]);
```

Replace with:

```typescript
  useEffect(() => {
    if (user && isAdmin) {
      fetchUsers();
      fetchTodayAdditions();
      fetchModerationFlags();
      fetchUserAnalytics();
      fetchSocialMediaAnalytics();
      fetchSignupMethods();
    }
  }, [user, isAdmin, fetchSocialMediaAnalytics]);
```

- [ ] **Step 5: Typecheck**

Run: `cd apps/admin && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 6: Manual verification of the fallback path**

Run: `cd apps/admin && npm run dev`, open the admin site, sign in as an admin, open the "Users & Analytics" tab, open the browser console.
Expected: since the migration from Task 1 has not been applied to the database yet, `fetchSignupMethods` should log `Error fetching signup methods: ...` (function does not exist) to the console, and no unhandled exception should crash the tab — the rest of the page (existing cards/charts) must still render normally. This confirms the graceful-fallback wiring works before the new UI even exists.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/pages/Admin.tsx
git commit -m "Fetch signup method data for admin users tab"
```

---

### Task 4: "Users · Signup Method" card

**Files:**
- Modify: `apps/admin/src/pages/Admin.tsx`

**Interfaces:**
- Consumes: `users` (existing state), `signupMethods`, `signupMethodsError`, `signupMethodFilter`, `setSignupMethodFilter` (Task 3), `SIGNUP_METHOD_LABELS`, `SIGNUP_METHOD_BADGE_VARIANT`, `SIGNUP_METHOD_FILTER_OPTIONS` (Task 2).

- [ ] **Step 1: Add the card**

Find the end of the existing "Users · Shares" card, immediately before the "Daily Users Added" card (around line 2318-2320):

```typescript
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">Daily Users Added</CardTitle>
```

Insert a new card between them:

```typescript
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">Users · Signup Method</CardTitle>
                    <CardDescription className="text-xs">Apple, Android, or email signup, per user</CardDescription>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-0 space-y-3">
                    <Select value={signupMethodFilter} onValueChange={(value) => setSignupMethodFilter(value as 'all' | SignupMethod)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Filter by signup method" />
                      </SelectTrigger>
                      <SelectContent>
                        {SIGNUP_METHOD_FILTER_OPTIONS.map(option => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {signupMethodsError ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">Signup method data unavailable</p>
                    ) : loading ? (
                      <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
                    ) : (
                      <div className="max-h-[280px] overflow-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Name</TableHead>
                              <TableHead className="text-xs text-right">Method</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {users
                              .filter(u => signupMethodFilter === 'all' || (signupMethods[u.id] ?? 'unknown') === signupMethodFilter)
                              .map(u => {
                                const method = signupMethods[u.id] ?? 'unknown';
                                return (
                                  <TableRow key={u.id}>
                                    <TableCell className="text-sm py-2">{u.name || u.id.slice(0, 8) || '—'}</TableCell>
                                    <TableCell className="text-right py-2">
                                      <Badge variant={SIGNUP_METHOD_BADGE_VARIANT[method]} className="text-[10px]">
                                        {SIGNUP_METHOD_LABELS[method]}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="shadow-sm">
                  <CardHeader className="py-3 px-4">
                    <CardTitle className="text-sm">Daily Users Added</CardTitle>
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/admin && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 3: Manual visual verification**

With `npm run dev` running (from Task 3, Step 6), reload the "Users & Analytics" tab.
Expected: a new "Users · Signup Method" card appears in the left column below "Users · Shares", showing "Signup method data unavailable" (since the migration isn't applied yet — this is the correct, intended state right now). The filter dropdown renders with all 5 options and doesn't crash the page when changed.

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/pages/Admin.tsx
git commit -m "Add per-user signup method card with filter"
```

---

### Task 5: "Signup Method Distribution" chart card

**Files:**
- Modify: `apps/admin/src/pages/Admin.tsx`

**Interfaces:**
- Consumes: `users` (existing state), `signupMethods`, `signupMethodsError` (Task 3), `SIGNUP_METHOD_LABELS` (Task 2).

- [ ] **Step 1: Add the card**

Find the end of the existing "Event Type Distribution" card, immediately before the "Detailed Breakdown by Event Type" card (around line 2889-2892):

```typescript
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Detailed Breakdown by Event Type */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
```

Insert a new card between them:

```typescript
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Signup Method Distribution Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Signup Method Distribution
                  </CardTitle>
                  <CardDescription>
                    Apple (iOS), Android (Google), or email signups
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {signupMethodsError ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      Signup method data unavailable
                    </p>
                  ) : (
                    <div className="h-[300px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={(['apple', 'android', 'email', 'unknown'] as SignupMethod[])
                            .map(method => ({
                              method: SIGNUP_METHOD_LABELS[method],
                              count: users.filter(u => (signupMethods[u.id] ?? 'unknown') === method).length,
                            }))
                            .filter(entry => entry.count > 0)}
                          margin={{ top: 20, right: 30, left: 0, bottom: 60 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis
                            dataKey="method"
                            tick={{ fontSize: 11 }}
                            angle={-45}
                            textAnchor="end"
                            height={80}
                          />
                          <YAxis tick={{ fontSize: 12 }} />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                return (
                                  <div className="rounded-lg border bg-background p-2 shadow-sm">
                                    <div className="font-medium">{payload[0].payload.method}</div>
                                    <div className="text-sm text-muted-foreground">
                                      Count: <span className="font-medium">{payload[0].value?.toLocaleString()}</span>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Detailed Breakdown by Event Type */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/admin && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors.

- [ ] **Step 3: Manual visual verification**

With `npm run dev` running, reload the "Users & Analytics" tab.
Expected: a new "Signup Method Distribution" card appears in the right column below "Event Type Distribution", currently showing "Signup method data unavailable" (migration not yet applied — expected for now).

- [ ] **Step 4: Commit**

```bash
git add apps/admin/src/pages/Admin.tsx
git commit -m "Add signup method distribution chart"
```

---

### Task 6: End-to-end verification after the migration is applied

This task is for the user (or whoever has DB access) to run once they've reviewed and applied `supabase/migrations/20260806120000_add_get_user_signup_providers_function.sql` from Task 1 — it cannot be completed by an agent without DB write access.

**Files:** none (verification only).

- [ ] **Step 1: Apply the migration**

Review `supabase/migrations/20260806120000_add_get_user_signup_providers_function.sql` and apply it to the Supabase project (dashboard SQL editor or CLI — whichever this project normally uses).

- [ ] **Step 2: Cross-check the counts**

Run this read-only query directly against the project to get ground truth:

```sql
SELECT
  CASE raw_app_meta_data ->> 'provider'
    WHEN 'apple' THEN 'apple'
    WHEN 'google' THEN 'android'
    WHEN 'email' THEN 'email'
    ELSE 'unknown'
  END AS signup_method,
  count(*)
FROM auth.users
GROUP BY 1
ORDER BY 2 DESC;
```

- [ ] **Step 3: Compare against the admin UI**

Reload the "Users & Analytics" tab as an admin. Expected:
- The "Signup Method Distribution" bar chart's bar heights match the counts from Step 2.
- The "Users · Signup Method" card's badges match each user's provider, and the filter dropdown correctly narrows the list to just that method.
- No "Signup method data unavailable" message remains.
