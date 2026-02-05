# Vercel Push Notification Setup – Steps in Order

Do these steps in order in Vercel.

---

## Step 1: Get the Base64-Encoded APNs Key (on your machine)

1. Open Terminal.
2. Run from your project directory (key at `~/.secrets/`):

   ```bash
   base64 -i ~/.secrets/AuthKey_J764D4P5DU.p8 | tr -d '\n'
   ```


3. The output is a long single line (no spaces or newlines). Copy the entire output and paste it into Vercel in Step 4 as the value of APNS_KEY_CONTENT.

---

## Step 2: Open Vercel Environment Variables

1. Go to [vercel.com](https://vercel.com).
2. Open your project (e.g. synth-beta-testing).
3. Go to **Settings** → **Environment Variables**.

---

## Step 3: Add Supabase Variables

Add these (one at a time):

| Name | Value | Environments |
|------|-------|--------------|
| `SUPABASE_URL` | `https://glpiolbrafqikqhnseto.supabase.co` | Production, Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | (from Supabase: Settings → API → service_role key) | Production, Preview |

---

## Step 4: Add APNS_KEY_CONTENT

1. Click **Add New**.
2. **Name:** `APNS_KEY_CONTENT`
3. **Value:** Paste the base64 string from Step 1 (no spaces or newlines).
4. **Environments:** Production and Preview.
5. Save.

---

## Step 5: Add APNS_KEY_ID

| Name | Value | Environments |
|------|-------|--------------|
| `APNS_KEY_ID` | `J764D4P5DU` (or your Key ID from Apple) | Production, Preview |

---

## Step 6: Add APNS_TEAM_ID

| Name | Value | Environments |
|------|-------|--------------|
| `APNS_TEAM_ID` | `R6JXB945ND` (or your Team ID from Apple) | Production, Preview |

---

## Step 7: Add APNS_BUNDLE_ID

| Name | Value | Environments |
|------|-------|--------------|
| `APNS_BUNDLE_ID` | `com.tejpatel.synth` | Production, Preview |

---

## Step 8: Add APNS_PRODUCTION

| Name | Value | When to use |
|------|-------|-------------|
| `APNS_PRODUCTION` | `false` | Xcode debug build on device |
| `APNS_PRODUCTION` | `true` | TestFlight or App Store build |

- **Name:** `APNS_PRODUCTION`
- **Value:** `true` or `false` (see above)
- **Environments:** Production and Preview

---

## Step 9: Redeploy

1. Go to **Deployments**.
2. Open the **⋮** menu on the latest deployment.
3. Click **Redeploy**.
4. Wait for the deployment to finish.

Env vars apply only to new deployments.

---

## Checklist

- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `APNS_KEY_CONTENT` (base64 of .p8)
- [ ] `APNS_KEY_ID`
- [ ] `APNS_TEAM_ID`
- [ ] `APNS_BUNDLE_ID`
- [ ] `APNS_PRODUCTION`
- [ ] Redeploy
