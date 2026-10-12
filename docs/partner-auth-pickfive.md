# Synth ↔ Pick Five shared login

One person, one UUID in both apps. Each app keeps its own Supabase project, its own
database and its own normal email + password login. No migration.

When someone signs into one app with the other app's account, the first app creates its own
account **with the same UUID** and runs its own onboarding.

## 1. Endpoint both apps expose: `GET /partner/me`

Synth's: `https://join.getsynth.app/api/partner/me`

| | |
|---|---|
| `Authorization` | `Bearer <the user's access token from this app's Supabase Auth>` |
| `X-Partner-Key` | server-to-server key the other app issued to you |
| `200` | `{ "id": "<uuid>", "email": "<email>", "display_name": "<string or null>" }` |
| `401` | bad partner key, or invalid / expired / signed-out user token |
| `422` | account has no confirmed email (cannot be shared) |

Rules:
- Only return accounts whose email is **confirmed**. The other app creates its user with
  `email_confirm: true` because of this.
- Return only these three fields. Add a field only after both apps agree.
- Check the token against your own Auth on every call (`supabase.auth.getUser(token)`), so
  signed-out and deleted users are rejected.
- Only call it from a server. The partner key never ships in an app.

## 2. Login order (both apps, no extra button)

On your normal email + password form:

1. `signInWithPassword` on **your** Auth. Success → done.
2. Only if that returns `invalid_credentials`: `signInWithPassword` on the **other** app's
   Auth with the same email and password, directly from the device (use a client with
   `persistSession: false`). Failure → show your normal "wrong email or password".
3. Send the other app's access token to **your own backend**. Your backend:
   - calls the other app's `/partner/me` with it
   - if a user with that UUID exists and the email matches → sign them in
   - if no user with that UUID → `auth.admin.createUser({ id, email, email_confirm: true })`,
     then sign them in (onboarding runs because the profile is new)
   - if a **different** user already has that email → refuse (`409`); never merge two
     accounts on email alone
   - sign-in without a password: `auth.admin.generateLink({ type: 'magiclink', email })`,
     then `auth.verifyOtp({ token_hash, type: 'magiclink' })` server-side, and return the
     session tokens to the app, which calls `auth.setSession(...)`
4. Drop the other app's session (`signOut({ scope: 'local' })`).

**If your form also signs people up:** try your sign-in, then the other app's sign-in, and
only then create a new account. Creating first makes a duplicate account with a different
UUID for every user of the other app.

Synth's version of step 3 is `POST https://join.getsynth.app/api/partner/exchange` with body
`{ "partner_token": "<Pick Five access token>" }`. It returns `{ access_token, refresh_token, created }`
or `409 { "error": "account_exists" | "account_mismatch" }`.

## 3. Email code (users without a password, e.g. Synth users who signed up with Apple)

Same order as above, with codes instead of passwords:

1. `signInWithOtp({ email, options: { shouldCreateUser: false } })` on **your** Auth.
2. If the email isn't one of yours, do the same on the **other** app's Auth. The other app
   emails the code.
3. `verifyOtp({ email, token, type: 'email' })` against whichever Auth sent it.
4. If it was the other app: continue from step 3 of the login order (`/partner/me`, same UUID).

Never let a passwordless account set a password without one of these codes first.

## 4. Keys and settings

| Name | Where | What |
|---|---|---|
| `PICKFIVE_PARTNER_KEY` | Synth server | key Pick Five sends to Synth's `/partner/me` |
| `PICKFIVE_API_KEY` | Synth server | key Synth sends to Pick Five's `/partner/me` |
| `PICKFIVE_ME_URL` | Synth server | Pick Five's `/partner/me` URL |
| `EXPO_PUBLIC_PICKFIVE_SUPABASE_URL` / `_KEY` | Synth mobile | Pick Five's Supabase URL + publishable key |
| `VITE_PICKFIVE_SUPABASE_URL` / `_KEY` | Synth web | same |

Share partner keys privately (password manager), never in chat or code. Each app's email
template for sign-in codes must include `{{ .Token }}`. For Apple "Hide My Email" users,
register the sending domain in Apple's Private Email Relay settings.

## 5. Not covered yet

- Phone-number accounts: add an email to them first; phone login is off in Synth.
- Account deletion in one app does not delete the other app's account.
