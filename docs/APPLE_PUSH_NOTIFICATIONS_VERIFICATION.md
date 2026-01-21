# Apple Push Notifications - Verification & Setup Checklist

This document verifies that Apple Push Notifications are properly configured for your Synth app.

## ✅ Verified Components

### 1. iOS AppDelegate ✅
**File**: `ios/App/App/AppDelegate.swift`

- ✅ `UNUserNotificationCenter.current().delegate = self` - Set correctly
- ✅ `application.registerForRemoteNotifications()` - Called after permission granted
- ✅ `didRegisterForRemoteNotificationsWithDeviceToken` - Handles device token
- ✅ `userNotificationCenter(_:willPresent:)` - Shows notifications in foreground
- ✅ `userNotificationCenter(_:didReceive:)` - Handles notification taps
- ✅ Posts `DeviceTokenReceived` event to web layer (dual method: NotificationCenter + JavaScript)

### 2. Frontend Push Token Service ✅
**File**: `src/services/pushTokenService.ts`

- ✅ `PushTokenService.initialize()` - Called in `MainApp.tsx` when user authenticates
- ✅ Requests push notification permissions
- ✅ Listens for Capacitor `registration` event
- ✅ Listens for native iOS `DeviceTokenReceived` event (fallback)
- ✅ Calls `register_device_token` RPC with device token
- ✅ Handles notification taps and navigation

### 3. Supabase RPC Functions ✅
**Migration**: `supabase/migrations/20250202000000_create_push_notification_system_safe.sql`

- ✅ `register_device_token` - Exists and properly configured
- ✅ `unregister_device_token` - Exists for cleanup
- ✅ Tables: `device_tokens`, `notifications`, `push_notification_queue` - All exist

### 4. Backend APNs Service ✅
**File**: `backend/push-notification-service.js`

- ✅ Uses APNs Auth Key (.p8) method (not certificates)
- ✅ Reads key from `APNS_KEY_PATH` environment variable
- ✅ Uses `APNS_KEY_ID` and `APNS_TEAM_ID` from environment
- ✅ Bundle ID: Uses `APNS_BUNDLE_ID` env var or defaults to `com.tejpatel.synth`
- ✅ Production mode: Uses `NODE_ENV === 'production'` for production APNs

### 5. Backend Worker ✅
**File**: `backend/push-notification-worker.js`

- ✅ Processes push notification queue every 30 seconds
- ✅ Queues pending notifications automatically
- ✅ Handles retries and error logging

### 6. Bundle ID Match ✅
- ✅ Capacitor config: `com.tejpatel.synth`
- ✅ Xcode project: `com.tejpatel.synth`
- ✅ APNs service: `com.tejpatel.synth` (default)
- ✅ **All match!**

## ⚠️ Required Configuration

### Backend Environment Variables

On your Node.js backend server (where `push-notification-worker.js` runs), set these:

```bash
# APNs Authentication Key
APNS_KEY_PATH=./AuthKey_J764D4P5DU.p8
APNS_KEY_ID=J764D4P5DU
APNS_TEAM_ID=R6JXB945ND
APNS_BUNDLE_ID=com.tejpatel.synth

# Supabase (for worker)
SUPABASE_URL=https://glpiolbrafqikqhnseto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Environment
NODE_ENV=production  # Use 'production' for TestFlight builds, 'development' for dev builds
```

**Important Notes:**
- Place the `.p8` key file in your backend root directory (where `push-notification-service.js` is)
- The bundle ID **must** match your App ID in Apple Developer Portal exactly
- `NODE_ENV=production` is required for TestFlight builds (uses production APNs)
- For Xcode debug builds, use `NODE_ENV=development` (uses sandbox APNs)

## 🧪 Testing

### Step 1: Test APNs Connection

Run the test script to verify APNs authentication works:

```bash
node backend/test-apns-connection.js
```

Expected output:
```
✅ APNs provider initialized successfully
✅ APNs connection established successfully!
```

### Step 2: Test with Device Token

1. Install app on physical iPhone (TestFlight or dev build)
2. Grant push notification permissions
3. Check Supabase `device_tokens` table - should see your device token
4. Run test script with your device token:

```bash
node backend/test-apns-connection.js <your_device_token_here>
```

Expected: Notification appears on your device within seconds.

### Step 3: Test via Database

1. Insert a test notification using `backend/test-push-notification.sql`
2. Make sure push worker is running: `node backend/push-notification-worker.js`
3. Check device - notification should arrive within 30 seconds

## 🚀 Deployment Checklist

Before deploying to production:

- [ ] Backend environment variables set (see above)
- [ ] `.p8` key file placed in backend directory
- [ ] Push notification worker running continuously (Railway/Render/PM2)
- [ ] `NODE_ENV=production` set for TestFlight builds
- [ ] Bundle ID matches exactly: `com.tejpatel.synth`
- [ ] Apple Developer Portal: Push Notifications enabled for App ID
- [ ] Test on physical device (not simulator - simulators don't receive push)

## 🔍 Troubleshooting

### No device token in database
- **Cause**: Permission not granted or AppDelegate not receiving token
- **Fix**: Reinstall app, grant permissions, check Xcode console for token

### APNs auth error (403)
- **Cause**: Wrong Key ID, Team ID, or key file mismatch
- **Fix**: Verify all three match exactly in Apple Developer Portal

### Notifications queued but not sent
- **Cause**: Worker not running or APNs connection failed
- **Fix**: Start worker, check logs, verify environment variables

### Works on dev but not TestFlight
- **Cause**: Using sandbox APNs instead of production
- **Fix**: Set `NODE_ENV=production` on backend server

### Device token format errors
- **Cause**: Token format mismatch
- **Fix**: iOS sends hex format, which is correct. Ensure no transformation occurs.

## 📝 Files Modified

- ✅ `ios/App/App/AppDelegate.swift` - Enhanced device token bridging
- ✅ `src/services/pushTokenService.ts` - Improved event listener handling
- ✅ `backend/push-notification-service.js` - Made bundle ID configurable
- ✅ `backend/test-apns-connection.js` - NEW: APNs connection test script
- ✅ `backend/test-push-notification.sql` - NEW: SQL test script

## ✅ Summary

Your push notification system is properly configured! The main requirement is:

1. **Set backend environment variables** (see above)
2. **Place `.p8` key file** in backend directory
3. **Run the worker** continuously
4. **Test with real device** (not simulator)

Once these are done, push notifications should work end-to-end! 🎉

