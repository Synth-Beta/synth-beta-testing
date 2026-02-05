# Push Notification Verification Runbook

Step-by-step verification for Apple Push Notifications. Run these in order when troubleshooting "push not working."

## Step 1: Verify Supabase Database Webhook

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. Go to **Database** → **Webhooks**
3. Confirm there is a webhook for:
   - **Table:** `notifications`
   - **Event:** Insert
   - **URL:** `https://<your-vercel-domain>/api/push-notification-webhook`
4. If missing: Click **Create a new webhook**, configure as above, save
5. In Webhooks → **Logs**, insert a test notification (see Step 5) and confirm the webhook is invoked and returns 200

## Step 2: Verify Vercel Environment Variables

In [Vercel Dashboard](https://vercel.com) → Project → Settings → Environment Variables, ensure for **Production** (and Preview if needed):

| Variable | Required | Notes |
|----------|----------|-------|
| `SUPABASE_URL` | Yes | e.g. `https://xxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key from Supabase |
| `APNS_KEY_CONTENT` | Yes* | Base64-encoded .p8 key contents |
| `APNS_KEY_PATH` | Yes* | Alternative to APNS_KEY_CONTENT (file path) |
| `APNS_KEY_ID` | Yes | 10-character Key ID from Apple |
| `APNS_TEAM_ID` | Yes | Team ID from Apple Developer |
| `APNS_BUNDLE_ID` | Yes | e.g. `com.tejpatel.synth` |
| `APNS_PRODUCTION` | Yes | `true` for TestFlight/App Store, `false` for Xcode debug |

*Use either APNS_KEY_CONTENT or APNS_KEY_PATH. For Vercel, APNS_KEY_CONTENT is recommended.

**To get APNS_KEY_CONTENT:**
```bash
base64 -i AuthKey_XXX.p8 | tr -d '\n'
```
Copy the output into the Vercel env var.

After changing env vars, redeploy the project.

## Step 3: Verify Device Tokens

Run `scripts/verify-device-tokens.sql` in Supabase SQL Editor (or the queries below):

```sql
SELECT user_id, platform, is_active, created_at 
FROM device_tokens 
WHERE platform = 'ios' AND is_active = true 
ORDER BY created_at DESC 
LIMIT 10;
```

- **Empty result:** Tokens not being registered. Check: push permission granted in app, user logged in when app opens (PushTokenService.initialize runs only when authenticated).
- **Rows present:** Tokens are stored; delivery failure is likely elsewhere.

## Step 4: Test APNs Connection Locally

```bash
# From project root; ensure .env.local has APNS_* vars
npm run push:test
# or: node backend/test-apns-connection.js
```

Expected: `APNs connection established successfully!`

To send a test notification:
```bash
npm run push:test -- <device_token>
```
Get `<device_token>` from the `device_tokens` table (Step 3).

- Connection OK: APNs credentials and config are valid
- Send failure: check error (403 = Key ID/Team ID; 400 = Bundle ID; 410 = token invalid)

## Step 5: End-to-End Test

1. Run `scripts/test-push-e2e.sql` in Supabase SQL Editor (or use `backend/test-push-notification.sql` with your email)
2. If using webhook: Check Supabase → Database → Webhooks → Logs for 200 response
3. If using worker: Ensure worker is running (`npm run push:worker`), check its logs
4. Confirm the device receives the push within seconds (webhook) or ~30s (worker)

## Step 6: If Using Worker Path

The worker is an alternative to the webhook. It requires an always-on host:

1. Deploy worker to Railway, Render, Fly.io, or run via PM2 on a VPS
2. Set same APNs env vars on that host
3. Start: `npm run push:worker` (runs `node backend/push-notification-worker.js`)

## Monitoring

- **Supabase Webhook logs:** Database → Webhooks → your webhook → Logs
- **Vercel Functions logs:** Vercel → Project → Logs (filter by `/api/push-notification-webhook`)
- The webhook logs `skipped` reasons to console when it does not send (no tokens, push disabled, etc.)

## Quick Reference

| Failure | Fix |
|---------|-----|
| Webhook not configured | Create in Supabase Dashboard → Database → Webhooks |
| Vercel env vars missing | Set APNS_* and Supabase vars in Vercel |
| No device tokens | Ensure push permission + user logged in when app opens |
| APNS_PRODUCTION wrong | Use `true` for TestFlight/App Store |
| Worker not running | Deploy worker to always-on host |
