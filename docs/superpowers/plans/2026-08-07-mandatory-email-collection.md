# Mandatory Email Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a real contact email from every Apple/Google social-auth user — collected inline during onboarding for new signups, and via a hard-block retrofit screen for existing users who lack one — without touching Supabase Auth's own email/confirmation flow.

**Architecture:** A new `public.users.contact_email` column, written and read as a plain synchronous data field (never through `supabase.auth.updateUser`, which requires email-change confirmation on this project and would create a chicken-and-egg loop for a required gate). A shared, pure predicate function in `packages/synth-shared` decides who needs the gate, using data already on the Supabase auth session (`user.email`, `user.app_metadata.provider`) plus the one new column. New signups get the field folded into the existing onboarding profile screen (mirroring how `acquisition_source` was added there); existing users get a full-screen hard block (new component on web, new route on mobile) mirroring the existing `UsernameRequiredModal` retrofit pattern.

**Tech Stack:** React 18 + TypeScript + Vite (web, `src/`), Expo + React Native + expo-router (`mobile/`), Supabase (Postgres + PostgREST + Auth), a small shared TS package (`packages/synth-shared`) consumed by both.

## Global Constraints

- **Never apply Supabase schema/data changes directly.** Task 1's migration is written to a file for the user to review and apply themselves — never run it via `mcp__supabase__apply_migration`, `mcp__supabase__execute_sql`, or any other execution path.
- **Never commit or push without explicit user permission.** Stop after each task for review; do not `git commit` unless asked.
- **Do not use `supabase.auth.updateUser({ email })` anywhere in this feature.** Confirmed live: this Supabase project has "Confirm email change" ON, so that call would not apply until the user clicks a confirmation link — incompatible with a required, blocking gate. All reads/writes here go through `public.users.contact_email`, a plain data column with no relationship to Supabase Auth's login email or its confirmation flow.
- **No test runner exists** for `src/` (web), `mobile/`, or `packages/synth-shared` (no vitest/jest, no `test` script anywhere in this repo). Per-task verification uses TypeScript typechecking in place of a unit test run:
  - Web: `npx tsc --noEmit -p tsconfig.app.json` from the repo root. Baseline: **138 pre-existing errors**, unrelated to this feature.
  - Mobile: `npx tsc --noEmit` from `mobile/`. Baseline: **8 pre-existing errors**, unrelated to this feature.
  - Verification means "no NEW errors beyond these baselines," not "zero errors." Typechecking either app also typechecks `packages/synth-shared` as consumed (it has no separate tsconfig/build step).
- Follow existing patterns exactly: the `acquisition_source` field (already in both onboarding screens) is the precedent for the new-signup field on both platforms; `UsernameRequiredModal`/`usernameService.updateUsername` is the precedent for the existing-user retrofit gate.

---

### Task 1: Migration — `contact_email` column + `public.users.email` sync fix

**Files:**
- Create: `supabase/migrations/20260807120000_add_contact_email_and_sync_trigger.sql`

**Interfaces:**
- Produces: `public.users.contact_email` (nullable text) — the column every later task reads from and writes to. Also fixes `public.users.email` drift (independent of `contact_email`, bundled in per user decision).

- [ ] **Step 1: Write the migration file**

```sql
-- Add a plain, non-auth-linked contact email field for safety/abuse-report purposes.
-- Deliberately NOT routed through Supabase Auth's email/confirmation flow — this
-- project has "Confirm email change" ON, so supabase.auth.updateUser({ email })
-- would not apply until a confirmation link is clicked, which is incompatible with
-- a required, blocking gate. This column is written/read directly instead.

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS contact_email text;

-- Bundled fix: public.users.email drifts from auth.users.email today (Settings'
-- "Change Email" flow only updates auth.users.email, never public.users.email).
-- Backfill existing rows (additive only, never overwrites an existing value):
UPDATE public.users u
SET email = a.email
FROM auth.users a
WHERE u.user_id = a.id
  AND u.email IS NULL
  AND a.email IS NOT NULL;

-- Keep public.users.email in sync going forward.
CREATE OR REPLACE FUNCTION public.sync_public_user_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.users SET email = NEW.email WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_sync_public_user_email ON auth.users;
CREATE TRIGGER trigger_sync_public_user_email
AFTER UPDATE ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_public_user_email();
```

- [ ] **Step 2: Self-check the migration (no execution)**

Read the file back and confirm: the `contact_email` column addition is separate from and does not depend on the trigger/backfill; the trigger's `SECURITY DEFINER` + `SET search_path = public, auth, pg_catalog` matches the pattern in `supabase/migrations/20260716130000_add_public_user_trigger.sql`. Do **not** run this file against any database — leave it for the user to review and apply.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260807120000_add_contact_email_and_sync_trigger.sql
git commit -m "Add contact_email column and public.users.email sync trigger"
```

(Only commit if the user has told you it's fine to commit for this session.)

---

### Task 2: Shared predicate module

**Files:**
- Create: `packages/synth-shared/src/contactEmailGate.ts`
- Modify: `packages/synth-shared/src/index.ts`

**Interfaces:**
- Consumes: nothing (pure module; `User` type from `@supabase/supabase-js`, already a peer dependency of this package).
- Produces: `needsContactEmail(user, contactEmail): boolean`. Tasks 3–6 all import this.

- [ ] **Step 1: Write the module**

```typescript
import type { User } from '@supabase/supabase-js';

const RELAY_EMAIL_SUFFIX = '@privaterelay.appleid.com';

type MinimalAuthUser = Pick<User, 'email' | 'app_metadata'>;

/**
 * True when a user signed up via Apple or Google, has no real contact email on
 * file yet, and their auth-provider email is either missing or an undeliverable
 * Apple private-relay address.
 */
export function needsContactEmail(
  user: MinimalAuthUser | null | undefined,
  contactEmail: string | null | undefined
): boolean {
  if (!user) return false;
  const provider = user.app_metadata?.provider;
  if (provider !== 'apple' && provider !== 'google') return false;
  if (contactEmail && contactEmail.trim().length > 0) return false;
  const email = user.email;
  if (!email) return true;
  return email.toLowerCase().endsWith(RELAY_EMAIL_SUFFIX);
}
```

- [ ] **Step 2: Export it from the package index**

In `packages/synth-shared/src/index.ts`, find the end of the file:

```typescript
export { GENRE_CHAT_TAG_MAP } from './genreChatTagMap';
```

Add directly after it:

```typescript
export { GENRE_CHAT_TAG_MAP } from './genreChatTagMap';
export { needsContactEmail } from './contactEmailGate';
```

- [ ] **Step 3: Typecheck**

Run both (from repo root, then from `mobile/`):
```bash
npx tsc --noEmit -p tsconfig.app.json
```
```bash
cd mobile && npx tsc --noEmit
```
Expected: web shows 138 errors, mobile shows 8 errors — no new ones referencing `contactEmailGate.ts` or the `index.ts` export line.

- [ ] **Step 4: Commit**

```bash
git add packages/synth-shared/src/contactEmailGate.ts packages/synth-shared/src/index.ts
git commit -m "Add shared needsContactEmail predicate"
```

---

### Task 3: Web new-signup field

**Files:**
- Modify: `src/services/onboardingService.ts`
- Modify: `src/components/onboarding/OnboardingFlow.tsx`

**Interfaces:**
- Consumes: `needsContactEmail` from `@synth/shared` (Task 2).
- Produces: `OnboardingService.ProfileSetupData.contact_email` (Task 5's `updateContactEmail` method is separate and does not depend on this).

- [ ] **Step 1: Extend `ProfileSetupData` and `saveProfileSetup`**

In `src/services/onboardingService.ts`, find:

```typescript
export interface ProfileSetupData {
  name?: string;
  username?: string;
  location_city?: string;
  birthday?: string;
  gender?: string;
  bio?: string;
  avatar_url?: string;
  acquisition_source?: string | null;
  other_acquisition_source?: string | null;
}
```

Replace with:

```typescript
export interface ProfileSetupData {
  name?: string;
  username?: string;
  location_city?: string;
  birthday?: string;
  gender?: string;
  bio?: string;
  avatar_url?: string;
  acquisition_source?: string | null;
  other_acquisition_source?: string | null;
  contact_email?: string | null;
}
```

Find:

```typescript
      if (data.acquisition_source !== undefined) {
        updateData.acquisition_source = data.acquisition_source;
      }
      if (data.other_acquisition_source !== undefined) {
        updateData.other_acquisition_source = data.other_acquisition_source;
      }

      const { error } = await supabase
        .from('users')
        .upsert(updateData, { onConflict: 'user_id' });
```

Replace with:

```typescript
      if (data.acquisition_source !== undefined) {
        updateData.acquisition_source = data.acquisition_source;
      }
      if (data.other_acquisition_source !== undefined) {
        updateData.other_acquisition_source = data.other_acquisition_source;
      }
      if (data.contact_email !== undefined) {
        updateData.contact_email = data.contact_email;
      }

      const { error } = await supabase
        .from('users')
        .upsert(updateData, { onConflict: 'user_id' });
```

Find:

```typescript
          const updateWithoutOptional = { ...updateData };
          delete updateWithoutOptional.username;
          delete updateWithoutOptional.location_city;
          delete updateWithoutOptional.acquisition_source;
          delete updateWithoutOptional.other_acquisition_source;
```

Replace with:

```typescript
          const updateWithoutOptional = { ...updateData };
          delete updateWithoutOptional.username;
          delete updateWithoutOptional.location_city;
          delete updateWithoutOptional.acquisition_source;
          delete updateWithoutOptional.other_acquisition_source;
          delete updateWithoutOptional.contact_email;
```

- [ ] **Step 2: Add the import in `OnboardingFlow.tsx`**

Find:

```typescript
import { ACQUISITION_SOURCE_CANONICAL_ORDER, type AcquisitionSource } from '@synth/shared';
```

Replace with:

```typescript
import { ACQUISITION_SOURCE_CANONICAL_ORDER, type AcquisitionSource, needsContactEmail } from '@synth/shared';
```

- [ ] **Step 3: Add state**

Find:

```typescript
  const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource | null>(null);
  const [acquisitionSourceOther, setAcquisitionSourceOther] = useState('');
  const [acquisitionSourceError, setAcquisitionSourceError] = useState<string | null>(null);
```

Replace with:

```typescript
  const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource | null>(null);
  const [acquisitionSourceOther, setAcquisitionSourceOther] = useState('');
  const [acquisitionSourceError, setAcquisitionSourceError] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState('');
  const [contactEmailError, setContactEmailError] = useState<string | null>(null);
```

- [ ] **Step 4: Compute whether the field should show**

Find (inside the component body, right after the `useAuth()` destructure):

```typescript
  const { user, session } = useAuth();
```

Replace with:

```typescript
  const { user, session } = useAuth();
  const showContactEmailField = needsContactEmail(user, null);
```

(A brand-new onboarding session never has a `contact_email` yet, so the second argument is always `null` here.)

- [ ] **Step 5: Add validation in `handleCompleteSetup`**

Find:

```typescript
    if (acquisitionSource === 'Other' && !trimmedOtherSource) {
      setAcquisitionSourceError('Please describe where you heard about Synth');
      completeButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    setLoading(true);
```

Replace with:

```typescript
    if (acquisitionSource === 'Other' && !trimmedOtherSource) {
      setAcquisitionSourceError('Please describe where you heard about Synth');
      completeButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    const trimmedContactEmail = contactEmail.trim();
    setContactEmailError(null);
    if (showContactEmailField) {
      if (!trimmedContactEmail) {
        setContactEmailError('Please enter your email');
        completeButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedContactEmail)) {
        setContactEmailError('Please enter a valid email');
        completeButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
    }

    setLoading(true);
```

- [ ] **Step 6: Include it in the save payload**

Find:

```typescript
      if (acquisitionSource !== null) {
        profilePayload.acquisition_source = acquisitionSource;
        profilePayload.other_acquisition_source =
          acquisitionSource === 'Other' ? trimmedOtherSource : null;
      }
```

Replace with:

```typescript
      if (acquisitionSource !== null) {
        profilePayload.acquisition_source = acquisitionSource;
        profilePayload.other_acquisition_source =
          acquisitionSource === 'Other' ? trimmedOtherSource : null;
      }
      if (showContactEmailField) {
        profilePayload.contact_email = trimmedContactEmail;
      }
```

- [ ] **Step 7: Add the field to the JSX**

Find the end of the acquisition_source `<section>` and the start of the Music taste `<section>`:

```typescript
                </div>
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-4">Music taste</h2>
```

Replace with:

```typescript
                </div>
              </section>

              {showContactEmailField && (
                <section>
                  <h2 className="text-xl font-semibold mb-4">Contact email</h2>
                  <div className="space-y-2">
                    <Label htmlFor="contact_email_input">Email *</Label>
                    <Input
                      id="contact_email_input"
                      type="email"
                      value={contactEmail}
                      onChange={(event) => {
                        setContactEmail(event.target.value);
                        if (contactEmailError) {
                          setContactEmailError(null);
                        }
                      }}
                      placeholder="you@example.com"
                      className={`bg-white ${contactEmailError ? 'border-destructive' : ''}`}
                    />
                    {contactEmailError ? (
                      <p className="text-[15px] font-medium leading-[1.5] text-destructive">
                        {contactEmailError}
                      </p>
                    ) : (
                      <p className="text-[15px] font-medium leading-[1.5] text-muted-foreground">
                        We need a real contact email on file so we can reach you about your account and about reports of harassment or abuse.
                      </p>
                    )}
                  </div>
                </section>
              )}

              <section>
                <h2 className="text-xl font-semibold mb-4">Music taste</h2>
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json` from repo root.
Expected: 138 errors (baseline), none new.

- [ ] **Step 9: Commit**

```bash
git add src/services/onboardingService.ts src/components/onboarding/OnboardingFlow.tsx
git commit -m "Collect contact email during onboarding for Apple/Google signups (web)"
```

---

### Task 4: Mobile new-signup field

**Files:**
- Modify: `mobile/src/services/onboardingService.ts`
- Modify: `mobile/app/(onboarding)/profile.tsx`

**Interfaces:**
- Consumes: `needsContactEmail` from `@synth/shared` (Task 2).

- [ ] **Step 1: Extend `saveProfileSetup`'s data type and body**

In `mobile/src/services/onboardingService.ts`, find:

```typescript
    static async saveProfileSetup(userId: string, data: {
        name?: string;
        username?: string;
        birthday?: string; // YYYY-MM-DD
        location_city?: string;
        gender?: string;
        bio?: string;
        acquisition_source?: AcquisitionSource | null;
        other_acquisition_source?: string | null;
    }): Promise<void> {
```

Replace with:

```typescript
    static async saveProfileSetup(userId: string, data: {
        name?: string;
        username?: string;
        birthday?: string; // YYYY-MM-DD
        location_city?: string;
        gender?: string;
        bio?: string;
        acquisition_source?: AcquisitionSource | null;
        other_acquisition_source?: string | null;
        contact_email?: string | null;
    }): Promise<void> {
```

Find:

```typescript
        if (data.acquisition_source !== undefined) update.acquisition_source = data.acquisition_source;
        if (data.other_acquisition_source !== undefined) update.other_acquisition_source = data.other_acquisition_source;
```

Replace with:

```typescript
        if (data.acquisition_source !== undefined) update.acquisition_source = data.acquisition_source;
        if (data.other_acquisition_source !== undefined) update.other_acquisition_source = data.other_acquisition_source;
        if (data.contact_email !== undefined) update.contact_email = data.contact_email;
```

- [ ] **Step 2: Add imports and the module-scope email regex**

Find:

```typescript
import { ACQUISITION_SOURCE_CANONICAL_ORDER, type AcquisitionSource } from '@synth/shared';

const PINK = SynthTokens.colors.brandPink500;

const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
```

Replace with:

```typescript
import { ACQUISITION_SOURCE_CANONICAL_ORDER, type AcquisitionSource, needsContactEmail } from '@synth/shared';
import type { User } from '@supabase/supabase-js';

const PINK = SynthTokens.colors.brandPink500;

const USERNAME_RE = /^[a-z0-9_.]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
```

- [ ] **Step 3: Capture the full auth user (not just id/name) and add state**

Find:

```typescript
    const [name, setName] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
```

Replace with:

```typescript
    const [name, setName] = useState('');
    const [userId, setUserId] = useState<string | null>(null);
    const [authUser, setAuthUser] = useState<User | null>(null);
```

Find:

```typescript
    const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource | ''>('');
    const [acquisitionSourceOther, setAcquisitionSourceOther] = useState('');
    const [acquisitionSourceError, setAcquisitionSourceError] = useState('');
```

Replace with:

```typescript
    const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource | ''>('');
    const [acquisitionSourceOther, setAcquisitionSourceOther] = useState('');
    const [acquisitionSourceError, setAcquisitionSourceError] = useState('');
    const [contactEmail, setContactEmail] = useState('');
    const [contactEmailError, setContactEmailError] = useState('');
```

Find:

```typescript
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;
            setUserId(user.id);
            const displayName: string =
```

Replace with:

```typescript
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;
            setUserId(user.id);
            setAuthUser(user);
            const displayName: string =
```

- [ ] **Step 4: Compute whether the field should show, and gate `canContinue`**

Find:

```typescript
    const canContinue =
        username.length >= 3 &&
        (usernameStatus === 'available' || usernameStatus === 'idle') &&
        !validateBirthday(birthday) &&
        !!acquisitionSource;
```

Replace with:

```typescript
    const showContactEmailField = needsContactEmail(authUser, null);

    const canContinue =
        username.length >= 3 &&
        (usernameStatus === 'available' || usernameStatus === 'idle') &&
        !validateBirthday(birthday) &&
        !!acquisitionSource &&
        (!showContactEmailField || EMAIL_RE.test(contactEmail.trim()));
```

- [ ] **Step 5: Validate and save in `handleContinue`**

Find:

```typescript
        const trimmedOtherSource = acquisitionSourceOther.trim();
        if (!acquisitionSource) {
            setAcquisitionSourceError('Please select where you heard about Synth');
            return;
        }
        if (acquisitionSource === 'Other' && !trimmedOtherSource) {
            setAcquisitionSourceError('Please describe where you heard about Synth');
            return;
        }

        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await OnboardingService.saveProfileSetup(user.id, {
                    name: name.trim() || undefined,
                    username: username.trim() || undefined,
                    birthday: birthday.trim() || undefined,
                    location_city: city.trim() || undefined,
                    gender: gender || undefined,
                    acquisition_source: acquisitionSource || undefined,
                    other_acquisition_source:
                        acquisitionSource === 'Other' ? trimmedOtherSource : null,
                });
            }
        } catch (e) {
```

Replace with:

```typescript
        const trimmedOtherSource = acquisitionSourceOther.trim();
        if (!acquisitionSource) {
            setAcquisitionSourceError('Please select where you heard about Synth');
            return;
        }
        if (acquisitionSource === 'Other' && !trimmedOtherSource) {
            setAcquisitionSourceError('Please describe where you heard about Synth');
            return;
        }

        const trimmedContactEmail = contactEmail.trim();
        if (showContactEmailField && !EMAIL_RE.test(trimmedContactEmail)) {
            setContactEmailError('Please enter a valid email');
            return;
        }

        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await OnboardingService.saveProfileSetup(user.id, {
                    name: name.trim() || undefined,
                    username: username.trim() || undefined,
                    birthday: birthday.trim() || undefined,
                    location_city: city.trim() || undefined,
                    gender: gender || undefined,
                    acquisition_source: acquisitionSource || undefined,
                    other_acquisition_source:
                        acquisitionSource === 'Other' ? trimmedOtherSource : null,
                    contact_email: showContactEmailField ? trimmedContactEmail : undefined,
                });
            }
        } catch (e) {
```

- [ ] **Step 6: Add the field to the JSX**

Find the end of the acquisition-source "Other" block and the start of the Gender block:

```typescript
                    {acquisitionSource === 'Other' && (
                        <View style={styles.fieldBlock}>
                            <Text style={styles.label}>Share a bit more</Text>
                            <TextInput
                                style={[styles.input, styles.otherInput, acquisitionSourceError ? styles.inputError : null]}
                                value={acquisitionSourceOther}
                                onChangeText={text => {
                                    setAcquisitionSourceOther(text);
                                    if (acquisitionSourceError) setAcquisitionSourceError('');
                                }}
                                placeholder="e.g., referred by DJ Alex / saw Synth at Embarcadero Festival"
                                placeholderTextColor={SynthTokens.colors.neutral400}
                                multiline
                            />
                            {acquisitionSourceError ? (
                                <Text style={[styles.hint, { color: '#dc2626' }]}>{acquisitionSourceError}</Text>
                            ) : (
                                <Text style={styles.hint}>Share any detail that helps us attribute this referral.</Text>
                            )}
                        </View>
                    )}

                    {/* Gender */}
```

Replace with:

```typescript
                    {acquisitionSource === 'Other' && (
                        <View style={styles.fieldBlock}>
                            <Text style={styles.label}>Share a bit more</Text>
                            <TextInput
                                style={[styles.input, styles.otherInput, acquisitionSourceError ? styles.inputError : null]}
                                value={acquisitionSourceOther}
                                onChangeText={text => {
                                    setAcquisitionSourceOther(text);
                                    if (acquisitionSourceError) setAcquisitionSourceError('');
                                }}
                                placeholder="e.g., referred by DJ Alex / saw Synth at Embarcadero Festival"
                                placeholderTextColor={SynthTokens.colors.neutral400}
                                multiline
                            />
                            {acquisitionSourceError ? (
                                <Text style={[styles.hint, { color: '#dc2626' }]}>{acquisitionSourceError}</Text>
                            ) : (
                                <Text style={styles.hint}>Share any detail that helps us attribute this referral.</Text>
                            )}
                        </View>
                    )}

                    {showContactEmailField && (
                        <View style={styles.fieldBlock}>
                            <Text style={styles.label}>Contact Email <Text style={styles.required}>*</Text></Text>
                            <TextInput
                                style={[styles.input, contactEmailError ? styles.inputError : null]}
                                value={contactEmail}
                                onChangeText={text => { setContactEmail(text); if (contactEmailError) setContactEmailError(''); }}
                                placeholder="you@example.com"
                                placeholderTextColor={SynthTokens.colors.neutral400}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="email-address"
                            />
                            {contactEmailError ? (
                                <Text style={[styles.hint, { color: '#dc2626' }]}>{contactEmailError}</Text>
                            ) : (
                                <Text style={styles.hint}>We need a real contact email on file so we can reach you about your account and about reports of harassment or abuse.</Text>
                            )}
                        </View>
                    )}

                    {/* Gender */}
```

- [ ] **Step 7: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: 8 errors (baseline), none new.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/services/onboardingService.ts "mobile/app/(onboarding)/profile.tsx"
git commit -m "Collect contact email during onboarding for Apple/Google signups (mobile)"
```

---

### Task 5: Web existing-user retrofit gate

**Files:**
- Modify: `src/services/onboardingService.ts`
- Create: `src/components/onboarding/EmailRequiredModal.tsx`
- Modify: `src/components/MainApp.tsx`

**Interfaces:**
- Consumes: `needsContactEmail` from `@synth/shared` (Task 2), `useAuth` (existing).
- Produces: `OnboardingService.updateContactEmail(userId, email): Promise<boolean>`, `EmailRequiredModal` component with `onComplete: (email: string) => void` prop.

- [ ] **Step 1: Add the targeted update method**

In `src/services/onboardingService.ts`, find the end of `saveProfileSetup` (the closing of its `catch` block) and the start of `requestAccountUpgrade`:

```typescript
      return false;
    }
  }

  /**
   * Create an account upgrade request (Step 2)
   */
```

Replace with:

```typescript
      return false;
    }
  }

  /**
   * Targeted update for the existing-user "contact email required" retrofit gate.
   * Does not touch any other profile field, unlike saveProfileSetup.
   */
  static async updateContactEmail(userId: string, email: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('users')
        .update({ contact_email: email, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error updating contact email:', error);
      return false;
    }
  }

  /**
   * Create an account upgrade request (Step 2)
   */
```

- [ ] **Step 2: Create the modal**

```typescript
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { OnboardingService } from '@/services/onboardingService';
import { logger } from '@/utils/logger';

interface EmailRequiredModalProps {
  onComplete: (email: string) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailRequiredModal({ onComplete }: EmailRequiredModalProps) {
  const { user } = useAuth();
  const [value, setValue] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = EMAIL_RE.test(value.trim()) && !saving;

  const handleSave = async () => {
    if (!user?.id || !canSave) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const trimmed = value.trim();
      const success = await OnboardingService.updateContactEmail(user.id, trimmed);
      if (success) {
        onComplete(trimmed);
      } else {
        setErrorMsg('Could not save your email. Please try again.');
      }
    } catch (err) {
      logger.error('EmailRequiredModal: save failed', err);
      setErrorMsg('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background px-6"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="text-5xl mb-4">📧</div>
          <h1 className="text-2xl font-bold">We need a contact email</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            We now require a real contact email on every account so we can reach you about your account and about reports of harassment or abuse.
          </p>
        </div>

        <div className="space-y-3">
          <Input
            type="email"
            placeholder="you@example.com"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            autoComplete="email"
            autoFocus
          />
          {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
        </div>

        <Button
          className="w-full"
          onClick={handleSave}
          disabled={!canSave}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            'Save email'
          )}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire it into `MainApp.tsx`**

Find:

```typescript
import { UsernameRequiredModal } from './onboarding/UsernameRequiredModal';
```

Replace with:

```typescript
import { UsernameRequiredModal } from './onboarding/UsernameRequiredModal';
import { EmailRequiredModal } from './onboarding/EmailRequiredModal';
import { needsContactEmail } from '@synth/shared';
```

Find:

```typescript
  const [usernameRequired, setUsernameRequired] = useState<string | null>(null);
```

Replace with:

```typescript
  const [usernameRequired, setUsernameRequired] = useState<string | null>(null);
  const [emailRequired, setEmailRequired] = useState(false);
```

Find:

```typescript
  useEffect(() => {
    if (loading || !user) return;

    const checkUsername = async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('username')
          .eq('user_id', user.id)
          .maybeSingle();
        const username: string = data?.username ?? '';
        const { isAutoGeneratedUsername } = await import('@/utils/usernameUtils');

        if (isAutoGeneratedUsername(username)) {
          setUsernameRequired(username || '(none)');
        }
      } catch (err) {
        console.warn('Username check failed:', err);
      }
    };

    checkUsername();
  }, [user?.id, loading]);
```

Replace with:

```typescript
  useEffect(() => {
    if (loading || !user) return;

    const checkUsername = async () => {
      try {
        const { data } = await supabase
          .from('users')
          .select('username, contact_email')
          .eq('user_id', user.id)
          .maybeSingle();
        const username: string = data?.username ?? '';
        const { isAutoGeneratedUsername } = await import('@/utils/usernameUtils');

        if (isAutoGeneratedUsername(username)) {
          setUsernameRequired(username || '(none)');
        }

        if (needsContactEmail(user, data?.contact_email)) {
          setEmailRequired(true);
        }
      } catch (err) {
        console.warn('Username check failed:', err);
      }
    };

    checkUsername();
  }, [user?.id, loading]);
```

Find:

```typescript
  if (usernameRequired !== null) {
    return (
      <UsernameRequiredModal
        currentUsername={usernameRequired}
        onComplete={() => setUsernameRequired(null)}
      />
    );
  }
```

Replace with:

```typescript
  if (usernameRequired !== null) {
    return (
      <UsernameRequiredModal
        currentUsername={usernameRequired}
        onComplete={() => setUsernameRequired(null)}
      />
    );
  }

  if (emailRequired) {
    return (
      <EmailRequiredModal
        onComplete={() => setEmailRequired(false)}
      />
    );
  }
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json` from repo root.
Expected: 138 errors (baseline), none new.

- [ ] **Step 5: Commit**

```bash
git add src/services/onboardingService.ts src/components/onboarding/EmailRequiredModal.tsx src/components/MainApp.tsx
git commit -m "Add existing-user contact email retrofit gate (web)"
```

---

### Task 6: Mobile existing-user retrofit gate

**Files:**
- Modify: `mobile/src/services/onboardingService.ts`
- Create: `mobile/app/email-required.tsx`
- Modify: `mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `needsContactEmail` from `@synth/shared` (Task 2).
- Produces: `OnboardingService.updateContactEmail(userId, email): Promise<boolean>` (mobile), a new `/email-required` route.

- [ ] **Step 1: Add the targeted update method**

In `mobile/src/services/onboardingService.ts`, find the end of `saveProfileSetup` and the start of `followVenues`:

```typescript
        const { error } = await supabase
            .from('users')
            .upsert(update, { onConflict: 'user_id' });

        if (error) {
            throw error;
        }
    }

    /**
     * Follow venues in user_venue_relationships
     */
    static async followVenues(userId: string, venueIds: string[]): Promise<void> {
```

Replace with:

```typescript
        const { error } = await supabase
            .from('users')
            .upsert(update, { onConflict: 'user_id' });

        if (error) {
            throw error;
        }
    }

    /**
     * Targeted update for the existing-user "contact email required" retrofit gate.
     * Does not touch any other profile field, unlike saveProfileSetup.
     */
    static async updateContactEmail(userId: string, email: string): Promise<boolean> {
        const { error } = await supabase
            .from('users')
            .update({ contact_email: email, updated_at: new Date().toISOString() })
            .eq('user_id', userId);
        if (error) {
            console.warn('Error updating contact email:', error);
            return false;
        }
        return true;
    }

    /**
     * Follow venues in user_venue_relationships
     */
    static async followVenues(userId: string, venueIds: string[]): Promise<void> {
```

- [ ] **Step 2: Create the retrofit screen**

```typescript
import React, { useState } from 'react';
import {
    StyleSheet,
    View,
    SafeAreaView,
    TextInput,
    Text,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SynthText } from '../src/components/SynthText';
import { SynthButton } from '../src/components/SynthButton';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { supabase } from '../src/integrations/supabase/client';
import { OnboardingService } from '../src/services/onboardingService';

const PINK = SynthTokens.colors.brandPink500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EmailRequiredScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);

    const canSave = EMAIL_RE.test(email.trim()) && !saving;

    const handleSave = async () => {
        const trimmed = email.trim();
        if (!EMAIL_RE.test(trimmed)) {
            setError('Please enter a valid email');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setError('Something went wrong. Please try again.');
                return;
            }
            const success = await OnboardingService.updateContactEmail(user.id, trimmed);
            if (!success) {
                setError('Could not save your email. Please try again.');
                return;
            }
            router.replace('/(tabs)');
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <View style={styles.content}>
                    <SynthText variant="h1" style={styles.title}>We need a contact email</SynthText>
                    <SynthText variant="meta" color="secondary" style={styles.subtitle}>
                        We now require a real contact email on every account so we can reach you about your account and about reports of harassment or abuse.
                    </SynthText>

                    <View style={styles.fieldBlock}>
                        <Text style={styles.label}>Email</Text>
                        <TextInput
                            style={[styles.input, error ? styles.inputError : null]}
                            value={email}
                            onChangeText={text => { setEmail(text); if (error) setError(''); }}
                            placeholder="you@example.com"
                            placeholderTextColor={SynthTokens.colors.neutral400}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="email-address"
                            autoFocus
                        />
                        {error ? <Text style={styles.hint}>{error}</Text> : null}
                    </View>
                </View>
            </KeyboardAvoidingView>

            <View style={styles.footer}>
                {saving ? (
                    <ActivityIndicator color={PINK} />
                ) : (
                    <SynthButton title="Save email" onPress={() => void handleSave()} disabled={!canSave} />
                )}
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
    content: { flex: 1, padding: SynthTokens.spacing.xl, justifyContent: 'center' },
    title: { marginBottom: 8 },
    subtitle: { marginBottom: 28 },
    fieldBlock: { marginBottom: 20 },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: SynthTokens.colors.neutral600,
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    input: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        borderRadius: SynthTokens.radius.medium,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: 16,
        color: SynthTokens.colors.neutral900,
    },
    inputError: { borderColor: '#dc2626' },
    hint: { fontSize: 12, color: '#dc2626', marginTop: 5 },
    footer: { padding: SynthTokens.spacing.xl, paddingBottom: SynthTokens.spacing.xl + 20 },
});
```

- [ ] **Step 3: Add the import**

`_layout.tsx` already imports `supabase` from `../src/integrations/supabase/client` (line 14) — Step 4 below reuses that existing import directly, no new Supabase import needed. Only add `needsContactEmail`.

Find:

```typescript
import { ensurePublicUserProfile } from '../src/services/publicUserRecoveryService';
```

Replace with:

```typescript
import { ensurePublicUserProfile } from '../src/services/publicUserRecoveryService';
import { needsContactEmail } from '@synth/shared';
```

- [ ] **Step 4: Add `contactEmail` state and fetch effect**

Find:

```typescript
  }, [sessionResolved, sessionUserId, storageOnboardingComplete]);

  useEffect(() => {
    ensureExpoPushNotificationHandler();
  }, []);
```

Replace with:

```typescript
  }, [sessionResolved, sessionUserId, storageOnboardingComplete]);

  const [contactEmail, setContactEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionUserId) {
      setContactEmail(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('users')
      .select('contact_email')
      .eq('user_id', sessionUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setContactEmail(data?.contact_email ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  useEffect(() => {
    ensureExpoPushNotificationHandler();
  }, []);
```

- [ ] **Step 5: Compute `needsEmail`**

Find:

```typescript
  const routingReady =
    fontsReady &&
    session !== undefined &&
    storageOnboardingComplete !== null &&
    onboardingEffectiveReady;
```

Replace with:

```typescript
  const routingReady =
    fontsReady &&
    session !== undefined &&
    storageOnboardingComplete !== null &&
    onboardingEffectiveReady;

  const needsEmail = Boolean(
    session?.user && isOnboardingComplete && needsContactEmail(session.user, contactEmail)
  );
```

- [ ] **Step 6: Update the route-gate effect**

Find the entire effect (from its opening to its dependency array):

```typescript
  useEffect(() => {
    if (!routingReady) return;

    const seg0 = segments[0];

    // `useSegments()` can be empty at `/` before `app/index.tsx` resolves — otherwise no branch matches and the UI can stall.
    if (seg0 === undefined) {
      void (async () => {
        const pendingShare = await loadPendingShareLink();
        // Let useShareDeepLink route to /event or /review instead of overwriting with home.
        if (pendingShare && session && isOnboardingComplete) {
          return;
        }
        if (!session) {
          router.replace('/(auth)/sign-in');
        } else if (!isOnboardingComplete) {
          router.replace(ONBOARDING_FLOW_ENTRY);
        } else {
          router.replace('/(tabs)');
        }
      })();
      return;
    }

    const inAuth = seg0 === '(auth)';
    const inOnboarding = seg0 === '(onboarding)';
    const needsAuth =
      seg0 === '(tabs)' ||
      seg0 === 'chat' ||
      seg0 === 'event' ||
      seg0 === 'review' ||
      seg0 === 'notifications' ||
      seg0 === 'friend-requests' ||
      seg0 === 'profile-friends' ||
      seg0 === 'profile-following' ||
      seg0 === 'stats' ||
      seg0 === 'modal' ||
      seg0 === 'profile-edit' ||
      seg0 === 'my-events' ||
      seg0 === 'interested-events' ||
      seg0 === 'settings' ||
      seg0 === 'app-menu' ||
      seg0 === 'user' ||
      seg0 === 'artist' ||
      seg0 === 'venue';

    if (!session && needsAuth) {
      router.replace('/(auth)/sign-in');
      return;
    }

    if (!isOnboardingComplete && needsAuth && session) {
      void (async () => {
        const reconciled = sessionUserId ? await refreshOnboardingFromStorage(sessionUserId) : false;
        if (!reconciled) {
          router.replace(ONBOARDING_FLOW_ENTRY);
        }
      })();
      return;
    }

    if (session && inAuth) {
      router.replace(isOnboardingComplete ? '/(tabs)' : ONBOARDING_FLOW_ENTRY);
      return;
    }

    if (isOnboardingComplete && inOnboarding) {
      if (session) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(auth)/sign-in');
      }
      return;
    }

    if (!isOnboardingComplete && !inOnboarding && !inAuth) {
      if (session) {
        void (async () => {
          const reconciled = sessionUserId ? await refreshOnboardingFromStorage(sessionUserId) : false;
          if (!reconciled) {
            router.replace(ONBOARDING_FLOW_ENTRY);
          }
        })();
      } else {
        router.replace('/(auth)/sign-in');
      }
    }
  }, [routingReady, isOnboardingComplete, session, segments, router, sessionUserId, refreshOnboardingFromStorage]);
```

Replace with:

```typescript
  useEffect(() => {
    if (!routingReady) return;

    const seg0 = segments[0];

    // `useSegments()` can be empty at `/` before `app/index.tsx` resolves — otherwise no branch matches and the UI can stall.
    if (seg0 === undefined) {
      void (async () => {
        const pendingShare = await loadPendingShareLink();
        // Let useShareDeepLink route to /event or /review instead of overwriting with home.
        if (pendingShare && session && isOnboardingComplete) {
          return;
        }
        if (!session) {
          router.replace('/(auth)/sign-in');
        } else if (!isOnboardingComplete) {
          router.replace(ONBOARDING_FLOW_ENTRY);
        } else if (needsEmail) {
          router.replace('/email-required');
        } else {
          router.replace('/(tabs)');
        }
      })();
      return;
    }

    const inAuth = seg0 === '(auth)';
    const inOnboarding = seg0 === '(onboarding)';
    const inEmailRequired = seg0 === 'email-required';
    const needsAuth =
      seg0 === '(tabs)' ||
      seg0 === 'chat' ||
      seg0 === 'event' ||
      seg0 === 'review' ||
      seg0 === 'notifications' ||
      seg0 === 'friend-requests' ||
      seg0 === 'profile-friends' ||
      seg0 === 'profile-following' ||
      seg0 === 'stats' ||
      seg0 === 'modal' ||
      seg0 === 'profile-edit' ||
      seg0 === 'my-events' ||
      seg0 === 'interested-events' ||
      seg0 === 'settings' ||
      seg0 === 'app-menu' ||
      seg0 === 'user' ||
      seg0 === 'artist' ||
      seg0 === 'venue';

    if (!session && needsAuth) {
      router.replace('/(auth)/sign-in');
      return;
    }

    if (!isOnboardingComplete && needsAuth && session) {
      void (async () => {
        const reconciled = sessionUserId ? await refreshOnboardingFromStorage(sessionUserId) : false;
        if (!reconciled) {
          router.replace(ONBOARDING_FLOW_ENTRY);
        }
      })();
      return;
    }

    if (needsEmail && needsAuth && session && !inEmailRequired) {
      router.replace('/email-required');
      return;
    }

    if (session && inAuth) {
      router.replace(!isOnboardingComplete ? ONBOARDING_FLOW_ENTRY : needsEmail ? '/email-required' : '/(tabs)');
      return;
    }

    if (isOnboardingComplete && inOnboarding) {
      if (session) {
        router.replace(needsEmail ? '/email-required' : '/(tabs)');
      } else {
        router.replace('/(auth)/sign-in');
      }
      return;
    }

    if (inEmailRequired && !needsEmail) {
      router.replace(session ? '/(tabs)' : '/(auth)/sign-in');
      return;
    }

    if (!isOnboardingComplete && !inOnboarding && !inAuth) {
      if (session) {
        void (async () => {
          const reconciled = sessionUserId ? await refreshOnboardingFromStorage(sessionUserId) : false;
          if (!reconciled) {
            router.replace(ONBOARDING_FLOW_ENTRY);
          }
        })();
      } else {
        router.replace('/(auth)/sign-in');
      }
    }
  }, [routingReady, isOnboardingComplete, session, segments, router, sessionUserId, refreshOnboardingFromStorage, needsEmail]);
```

- [ ] **Step 7: Register the new route**

Find:

```typescript
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false, animation: 'fade' }} />
```

Replace with:

```typescript
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="email-required" options={{ headerShown: false, animation: 'fade' }} />
```

- [ ] **Step 8: Typecheck**

Run: `cd mobile && npx tsc --noEmit`
Expected: 8 errors (baseline), none new.

- [ ] **Step 9: Commit**

```bash
git add mobile/src/services/onboardingService.ts mobile/app/email-required.tsx mobile/app/_layout.tsx
git commit -m "Add existing-user contact email retrofit gate (mobile)"
```

---

### Task 7: End-to-end verification after the migration is applied

Human-only, like the equivalent task in the signup-method-tracking plan — cannot be completed by an agent without DB write access.

**Files:** none (verification only).

- [ ] **Step 1: Apply the migration**

Review and apply `supabase/migrations/20260807120000_add_contact_email_and_sync_trigger.sql`.

- [ ] **Step 2: Verify the predicate against live data**

```sql
SELECT count(*) FROM auth.users a
JOIN public.users u ON u.user_id = a.id
WHERE a.raw_app_meta_data->>'provider' IN ('apple', 'google')
  AND (u.contact_email IS NULL OR u.contact_email = '')
  AND (a.email IS NULL OR a.email ILIKE '%@privaterelay.appleid.com');
```

Expected: ~29 (matches the live count from the design doc, modulo any signups/changes since).

- [ ] **Step 3: Manual QA — new signup**

Create a test Apple-auth account (or use a staging one) with a private-relay email, go through onboarding, confirm the "Contact email" field appears on the profile step, is required, and that submitting completes onboarding normally with `public.users.contact_email` set to the submitted value.

- [ ] **Step 4: Manual QA — existing user retrofit**

Pick one of the ~29 affected existing users' credentials (or manually null out `contact_email` for a test account that already completed onboarding), sign in, and confirm:
- Web: the full-screen `EmailRequiredModal` appears and cannot be dismissed; after saving, normal app UI appears.
- Mobile: the app redirects to `/email-required` and cannot navigate elsewhere; after saving, it redirects to `/(tabs)`.

- [ ] **Step 5: Confirm unaffected users see nothing**

Sign in as an email/password user and as an Apple user who already has a real (non-relay) email — confirm neither sees any new UI.
