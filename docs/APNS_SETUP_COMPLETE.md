# ✅ APNs Setup Complete

Your Apple Push Notifications are now configured!

## What Was Set Up

### 1. ✅ Auth Key Secured
- **Key File**: `~/.secrets/AuthKey_J764D4P5DU.p8`
- **Key ID**: `J764D4P5DU`
- **Team ID**: `R6JXB945ND`
- **Permissions**: `600` (read/write owner only)

### 2. ✅ Backend Service Created
- `backend/push-notification-service.js` - Sends push notifications via APNs
- `backend/push-notification-worker.js` - Background worker to process queue

### 3. ✅ Database Trigger Created
- `supabase/migrations/20250202000001_trigger_push_notifications.sql`
- Automatically queues push notifications when database notifications are created

### 4. ✅ iOS App Updated
- `AppDelegate.swift` - Registers for push notifications
- `pushTokenService.ts` - Registers device tokens

## Next Steps

### 1. Add Environment Variables

Add these to your `.env.local` file in the project root:

```env
# Apple Push Notifications (APNs)
APNS_KEY_PATH=/Users/sloiterstein/.secrets/AuthKey_J764D4P5DU.p8
APNS_KEY_ID=J764D4P5DU
APNS_TEAM_ID=R6JXB945ND
NODE_ENV=development  # Use 'production' for production APNs
```

### 2. Install APNs Package

```bash
cd backend
npm install apn --save
```

### 3. Run Database Migration

```bash
# Run the push notification trigger migration
supabase migration up
# OR apply manually in Supabase dashboard
```

### 4. Start Push Notification Worker

**Option A: Run as separate process**
```bash
cd backend
node push-notification-worker.js
```

**Option B: Add to package.json scripts**
```json
"scripts": {
  "push:worker": "node backend/push-notification-worker.js"
}
```

Then run: `npm run push:worker`

**Option C: Use PM2 (for production)**
```bash
pm2 start backend/push-notification-worker.js --name push-worker
```

### 5. Test on Physical iOS Device

1. Build and run app on physical device (push notifications don't work on simulator)
2. Log in to the app
3. Device token should be registered automatically
4. Check `device_tokens` table in database to verify
5. Create a test notification to trigger push

## How It Works

1. **User logs in** → iOS app registers for push notifications
2. **Device token received** → Stored in `device_tokens` table
3. **Notification created** → Database trigger queues push in `push_notification_queue`
4. **Worker processes queue** → Sends push via APNs
5. **User receives notification** → On their iOS device

## Testing

### Test Device Token Registration
```sql
-- Check if device tokens are being registered
SELECT * FROM device_tokens 
WHERE is_active = true 
ORDER BY created_at DESC;
```

### Test Push Notification Queue
```sql
-- Check push notification queue
SELECT * FROM push_notification_queue 
WHERE status = 'pending' 
ORDER BY created_at DESC;
```

### Manually Trigger Push (for testing)
```javascript
// In backend, you can test manually:
const pushService = require('./push-notification-service');

// Send to a specific user
await pushService.sendToUser('user-uuid-here', {
  title: 'Test Notification',
  message: 'This is a test push notification',
  badge: 1
});
```

## Production Deployment

### Environment Variables (Production)
```env
APNS_KEY_PATH=/secure/path/to/AuthKey_J764D4P5DU.p8
APNS_KEY_ID=J764D4P5DU
APNS_TEAM_ID=R6JXB945ND
NODE_ENV=production  # Important: Use production APNs
```

### Deploy Worker
- Use PM2, systemd, or cloud service (AWS ECS, etc.)
- Or use Supabase Edge Functions (if supported)
- Or use a scheduled job service

## Security Checklist

- ✅ Key file stored in secure location (`~/.secrets/`)
- ✅ Key file permissions set to `600`
- ✅ Key file added to `.gitignore`
- ✅ Environment variables used (not hardcoded)
- ✅ Service role key used for database access (not anon key)

## Troubleshooting

**Issue: "APNs provider not initialized"**
- Check `APNS_KEY_PATH` is correct
- Verify key file exists and is readable
- Check `APNS_KEY_ID` and `APNS_TEAM_ID` are set

**Issue: "Device token not registered"**
- Must test on physical device (not simulator)
- Check app has notification permissions
- Check `device_tokens` table for entries

**Issue: "Push notifications not received"**
- Verify `NODE_ENV=production` for production APNs
- Check worker is running and processing queue
- Verify device token is active in database
- Check APNs certificate/key is valid

## Files Created

- ✅ `backend/push-notification-service.js`
- ✅ `backend/push-notification-worker.js`
- ✅ `supabase/migrations/20250202000001_trigger_push_notifications.sql`
- ✅ `src/services/pushTokenService.ts`
- ✅ Updated `ios/App/App/AppDelegate.swift`

## Status

🎉 **Ready to test!** Just add the environment variables and start the worker.


