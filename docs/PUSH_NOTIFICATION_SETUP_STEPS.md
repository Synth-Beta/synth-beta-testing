# Push Notification Setup – Complete Steps

Run these in order to enable push notifications on iPhone.

---

## Part 1: Apple Developer (APNs Key)

### 1.1 Create APNs Auth Key

1. Go to [developer.apple.com/account](https://developer.apple.com/account) and sign in.
2. Open **Certificates, Identifiers & Profiles** → **Keys**.
3. Click the **+** button.
4. **Key Name:** e.g. `Synth Push Notifications`.
5. Under **Services**, enable **Apple Push Notifications service (APNs)**.
6. Click **Continue** → **Register**.
7. On the next screen, click **Download** to get the `.p8` file.
   - ⚠️ You can only download this once. Store it securely (e.g. `~/.secrets/`).
8. Note the **Key ID** (10 characters) shown on the page.
9. Note your **Team ID**: **Membership** in the sidebar, or from your App ID.

### 1.2 Enable Push for Your App ID

1. In Apple Developer, go to **Certificates, Identifiers & Profiles** → **Identifiers**.
2. Open your App ID (e.g. `com.tejpatel.synth`).
3. Under **Capabilities**, enable **Push Notifications**.
4. Save.

### 1.3 Xcode

1. In Xcode, open the iOS project.
2. Select the app target → **Signing & Capabilities**.
3. Confirm **Push Notifications** is enabled.

---

## Part 2: Vercel Environment Variables

### 2.1 Encode the .p8 Key

From your project root:

```bash
base64 -i ~/.secrets/AuthKey_XXXXXXXXXX.p8 | tr -d '\n'
```

Copy the full output (single line).

### 2.2 Add Variables in Vercel

1. Open [vercel.com](https://vercel.com) → your project → **Settings** → **Environment Variables**.
2. Add for **Production** (and **Preview** if needed):

| Name | Value |
|------|-------|
| `SUPABASE_URL` | `https://glpiolbrafqikqhnseto.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key |
| `APNS_KEY_CONTENT` | The base64 string from step 2.1 |
| `APNS_KEY_ID` | Your 10‑character Key ID |
| `APNS_TEAM_ID` | Your Team ID |
| `APNS_BUNDLE_ID` | `com.tejpatel.synth` |
| `APNS_PRODUCTION` | `true` for TestFlight/App Store, `false` for Xcode debug |

3. Save.
4. Redeploy the project (Deployments → three dots on latest → Redeploy).

---

## Part 3: Supabase Webhook

### 3.1 Create Webhook

1. Open [supabase.com/dashboard](https://supabase.com/dashboard) → your project.
2. Go to **Database** → **Webhooks**.
3. Click **Create Webhook**.
4. Configure:
   - **Name:** `push-notification-webhook`
   - **Table:** `notifications`
   - **Events:** enable **Insert**
   - **Type:** HTTP Request
   - **Method:** POST
   - **URL:** `https://YOUR_VERCEL_URL/api/push-notification-webhook`  
     Replace `YOUR_VERCEL_URL` with your Vercel URL (e.g. `synth-beta-testing.vercel.app`).
5. Save.

### 3.2 Check Webhook Logs

1. In **Database** → **Webhooks**, open the new webhook.
2. Go to **Logs**.
3. Run `scripts/verify-and-test-push-notifications.sql` in the SQL Editor.
4. Confirm the webhook fires and returns 200.

---

## Part 4: Verify

### 4.1 Device Tokens

Run in Supabase SQL Editor:

```sql
SELECT user_id, platform, is_active, created_at 
FROM device_tokens 
WHERE platform = 'ios' AND is_active = true 
LIMIT 5;
```

- Empty: user has not opened the app while logged in, or push permission was denied.
- Rows present: tokens are registered.

### 4.2 End-to-End Test

1. Run `scripts/verify-and-test-push-notifications.sql` in Supabase SQL Editor.
2. Check Webhook logs for 200.
3. Confirm the test notification appears on the device within a few seconds.

---

## Quick Reference

| Part | Where | What |
|------|-------|------|
| 1 | Apple Developer | APNs key, enable Push for App ID |
| 2 | Vercel | Env vars (including `APNS_KEY_CONTENT`) |
| 3 | Supabase | Webhook on `notifications` Insert |
| 4 | App | User logged in, push permission granted |
