# 📱 Apple Push Notifications Setup Guide

Complete guide to connect your notification system to Apple Push Notifications (APNs).

## Prerequisites ✅

You already have:
- ✅ APNs SSL Certificates (Development & Production) - expires 2027/02/05
- ✅ App ID: `com.tejpatel.synth`
- ✅ Database notification system implemented
- ✅ iOS app using Capacitor

## Step-by-Step Implementation

### Step 1: Database Setup ✅

Run the migration to create device tokens table:
```bash
# Migration already created: 20250202000000_create_push_notification_system.sql
```

This creates:
- `device_tokens` table - stores device tokens per user
- `push_notification_queue` table - optional queue for reliability
- `register_device_token()` function - RPC to register tokens
- `unregister_device_token()` function - RPC to unregister tokens

### Step 2: Install iOS Push Notification Plugin

In your iOS project directory:

```bash
cd ios/App
npm install @capacitor/push-notifications
npx cap sync ios
```

### Step 3: Update iOS AppDelegate

Update `ios/App/App/AppDelegate.swift`:

```swift
import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Register for push notifications
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if granted {
                DispatchQueue.main.async {
                    application.registerForRemoteNotifications()
                }
            }
        }
        
        return true
    }

    // Handle device token registration
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let tokenParts = deviceToken.map { data in String(format: "%02.2hhx", data) }
        let token = tokenParts.joined()
        
        // Send token to your backend via Capacitor
        NotificationCenter.default.post(
            name: NSNotification.Name("DeviceTokenReceived"),
            object: nil,
            userInfo: ["token": token]
        )
    }

    // Handle registration failure
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Failed to register for remote notifications: \(error)")
    }

    // Handle notifications when app is in foreground
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.alert, .sound, .badge])
    }

    // Handle notification tap
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let userInfo = response.notification.request.content.userInfo
        // Handle notification tap - navigate to relevant screen
        completionHandler()
    }

    // ... rest of existing AppDelegate code ...
}
```

### Step 4: Create TypeScript Service for Device Token

Create `src/services/pushTokenService.ts`:

```typescript
import { supabase } from '@/services/supabaseService';

export class PushTokenService {
  /**
   * Register device token with backend
   */
  static async registerToken(
    deviceToken: string,
    platform: 'ios' | 'android' = 'ios',
    deviceId?: string,
    appVersion?: string
  ): Promise<void> {
    try {
      const { error } = await supabase.rpc('register_device_token', {
        p_device_token: deviceToken,
        p_platform: platform,
        p_device_id: deviceId,
        p_app_version: appVersion
      });

      if (error) throw error;
      
      console.log('Device token registered successfully');
    } catch (error) {
      console.error('Error registering device token:', error);
      throw error;
    }
  }

  /**
   * Unregister device token (on logout)
   */
  static async unregisterToken(deviceToken: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('unregister_device_token', {
        p_device_token: deviceToken
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error unregistering device token:', error);
    }
  }

  /**
   * Initialize push notifications (call on app startup)
   */
  static async initialize(): Promise<void> {
    if (typeof window === 'undefined') return;

    // Listen for device token from native iOS
    window.addEventListener('DeviceTokenReceived', async (event: any) => {
      const token = event.detail?.token || (event as CustomEvent).detail?.token;
      if (token) {
        await this.registerToken(token, 'ios');
      }
    });

    // For Capacitor, use the plugin
    if (window.Capacitor?.isNativePlatform()) {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      
      // Request permission
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive === 'granted') {
        await PushNotifications.register();
      }

      // Listen for registration
      PushNotifications.addListener('registration', async (token) => {
        await this.registerToken(token.value, 'ios');
      });

      // Listen for errors
      PushNotifications.addListener('registrationError', (error) => {
        console.error('Push notification registration error:', error);
      });

      // Listen for push notifications
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('Push notification received:', notification);
      });

      // Listen for notification actions
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        console.log('Push notification action:', action);
        // Navigate to relevant screen based on notification data
      });
    }
  }
}
```

### Step 5: Create APNs Auth Key (Recommended Method)

**Why Auth Key?**
- ✅ More secure than certificates
- ✅ Works for all your apps (no per-app certificates)
- ✅ Never expires (unlike certificates which expire every year)
- ✅ Easier to manage (one key for all apps)
- ✅ No need to regenerate when certificates expire

**Step-by-Step Instructions:**

#### 1. Go to Apple Developer Portal
- Visit: https://developer.apple.com/account
- Sign in with your Apple Developer account

#### 2. Navigate to Keys Section
- In the left sidebar, click **"Certificates, Identifiers & Profiles"**
- Then click **"Keys"** in the left sidebar
- You'll see a list of existing keys (if any)
- Click the **"+"** button in the top left corner

#### 3. Configure the Key
- **Key Name**: Enter a descriptive name (e.g., "Synth Push Notifications" or "APNs Auth Key")
- Under **"Services"**, check the box for:
  - ✅ **"Apple Push Notifications service (APNs)"**
- Click **"Continue"** button

#### 4. Review and Register
- Review the key configuration
- Click **"Register"** button

#### 5. Download the Key File
- ⚠️ **CRITICAL**: You can **ONLY download this file ONCE**
- Click the **"Download"** button
- Save the `.p8` file (filename format: `AuthKey_XXXXXXXXXX.p8`)
- **Store it in a secure location**:
  - Password manager (1Password, LastPass, etc.)
  - Secure cloud storage (encrypted)
  - **DO NOT** commit to git
  - **DO NOT** share publicly

#### 6. Note Your Key ID
- On the same page, you'll see a **Key ID** (10-character string, e.g., `ABC123DEF4`)
- Copy this - you'll need it for configuration
- The Key ID is also visible in the Keys list if you need it later

#### 7. Get Your Team ID
- Your Team ID is: **`R6JXB945ND`** (from your certificate details)
- Or find it in: Apple Developer Portal → **Membership** section
- It's a 10-character alphanumeric string

**What You Should Have Now:**
- ✅ `.p8` file (e.g., `AuthKey_ABC123DEF4.p8`) - **Store securely!**
- ✅ Key ID (10 characters, e.g., `ABC123DEF4`)
- ✅ Team ID: `R6JXB945ND`

**Security Best Practices:**
1. Store the `.p8` file in a secure location (NOT in your project directory)
2. Use environment variables to reference the file path
3. Add `.p8` to your `.gitignore` file
4. Consider using a secrets management service (AWS Secrets Manager, etc.)
5. Restrict file permissions: `chmod 600 AuthKey_*.p8`

### Alternative: Certificate Method (If you prefer)

If you want to use certificates instead:

1. **Download Certificates from Apple Developer Portal:**
   - Download **Development SSL Certificate** (Apple Sandbox Push Services)
   - Download **Production SSL Certificate** (Apple Push Services)

2. **Convert to .p12 format:**
   ```bash
   # For Development
   openssl x509 -in aps_development.cer -inform DER -out aps_development.pem
   openssl pkcs12 -export -in aps_development.pem -inkey your_private_key.pem -out aps_development.p12 -name "APNs Development"
   
   # For Production
   openssl x509 -in aps_production.cer -inform DER -out aps_production.pem
   openssl pkcs12 -export -in aps_production.pem -inkey your_private_key.pem -out aps_production.p12 -name "APNs Production"
   ```

3. **Store certificates securely:**
   - Store `.p12` files in a secure location (NOT in git)
   - Use environment variables for paths

### Step 6: Create Backend Service to Send Push Notifications

Create `backend/push-notification-service.js`:

```javascript
const apn = require('apn');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const fs = require('fs');

class PushNotificationService {
  constructor() {
    // Initialize APNs provider using Auth Key method (recommended)
    const options = {
      token: {
        key: fs.readFileSync(process.env.APNS_KEY_PATH), // Path to .p8 key file
        keyId: process.env.APNS_KEY_ID, // 10-character Key ID
        teamId: process.env.APNS_TEAM_ID // Your Team ID: R6JXB945ND
      },
      production: process.env.NODE_ENV === 'production' // true for production, false for sandbox
    };

    // Alternative: Certificate method (if you prefer certificates)
    // const options = {
    //   cert: fs.readFileSync(process.env.APNS_CERT_PATH), // .p12 certificate file
    //   key: fs.readFileSync(process.env.APNS_KEY_PATH), // Private key file
    //   passphrase: process.env.APNS_PASSPHRASE, // Certificate passphrase (if any)
    //   production: process.env.NODE_ENV === 'production'
    // };

    this.apnProvider = new apn.Provider(options);
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  /**
   * Send push notification to a device
   */
  async sendNotification(deviceToken, notification) {
    const apnNotification = new apn.Notification();
    
    apnNotification.alert = {
      title: notification.title,
      body: notification.message
    };
    
    apnNotification.badge = notification.badge || 1;
    apnNotification.sound = 'default';
    apnNotification.topic = 'com.tejpatel.synth'; // Your bundle ID
    apnNotification.payload = notification.data || {};
    apnNotification.expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    apnNotification.priority = 10;

    try {
      const result = await this.apnProvider.send(apnNotification, deviceToken);
      
      if (result.failed && result.failed.length > 0) {
        console.error('Failed to send notification:', result.failed);
        return { success: false, error: result.failed[0].error };
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error sending push notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send notification to all user's devices
   */
  async sendToUser(userId, notification) {
    // Get all active device tokens for user
    const { data: devices, error } = await this.supabase
      .from('device_tokens')
      .select('device_token')
      .eq('user_id', userId)
      .eq('is_active', true)
      .eq('platform', 'ios');

    if (error) {
      console.error('Error fetching device tokens:', error);
      return { success: false, error: error.message };
    }

    if (!devices || devices.length === 0) {
      return { success: true, sent: 0, message: 'No active devices' };
    }

    // Send to all devices
    const results = await Promise.all(
      devices.map(device => this.sendNotification(device.device_token, notification))
    );

    const successful = results.filter(r => r.success).length;
    
    return {
      success: true,
      sent: successful,
      total: devices.length
    };
  }

  /**
   * Process notification from database and send push
   */
  async processDatabaseNotification(notificationId) {
    // Get notification from database
    const { data: notification, error } = await this.supabase
      .from('notifications')
      .select('*')
      .eq('id', notificationId)
      .single();

    if (error || !notification) {
      console.error('Error fetching notification:', error);
      return;
    }

    // Send push notification
    await this.sendToUser(notification.user_id, {
      title: notification.title,
      message: notification.message,
      data: notification.data || {},
      badge: 1
    });
  }
}

module.exports = new PushNotificationService();
```

### Step 7: Create Database Trigger to Send Push Notifications

Create `supabase/migrations/20250202000001_trigger_push_notifications.sql`:

```sql
-- Function to queue push notification when database notification is created
CREATE OR REPLACE FUNCTION public.queue_push_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert into push notification queue
  -- This will be processed by your backend service
  INSERT INTO public.push_notification_queue (
    user_id,
    device_token,
    notification_id,
    title,
    body,
    data,
    status
  )
  SELECT 
    NEW.user_id,
    dt.device_token,
    NEW.id,
    NEW.title,
    NEW.message,
    NEW.data,
    'pending'
  FROM public.device_tokens dt
  WHERE dt.user_id = NEW.user_id
    AND dt.is_active = true
    AND dt.platform = 'ios'
    AND NEW.is_read = false; -- Only send push for unread notifications

  RETURN NEW;
END;
$$;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_queue_push_notification ON public.notifications;
CREATE TRIGGER trigger_queue_push_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_push_notification();
```

### Step 8: Create Background Worker to Process Queue

Create `backend/push-notification-worker.js`:

```javascript
const pushNotificationService = require('./push-notification-service');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function processPushQueue() {
  // Get pending notifications (limit to 100 at a time)
  const { data: queue, error } = await supabase
    .from('push_notification_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    console.error('Error fetching push queue:', error);
    return;
  }

  for (const item of queue) {
    try {
      // Send push notification
      const result = await pushNotificationService.sendNotification(
        item.device_token,
        {
          title: item.title,
          message: item.body,
          data: item.data
        }
      );

      // Update queue status
      await supabase
        .from('push_notification_queue')
        .update({
          status: result.success ? 'sent' : 'failed',
          sent_at: result.success ? new Date().toISOString() : null,
          error_message: result.error || null,
          retry_count: item.retry_count + 1
        })
        .eq('id', item.id);

    } catch (error) {
      console.error('Error processing push notification:', error);
      
      // Mark as failed if retry limit reached
      if (item.retry_count >= 3) {
        await supabase
          .from('push_notification_queue')
          .update({
            status: 'failed',
            error_message: error.message
          })
          .eq('id', item.id);
      }
    }
  }
}

// Run every 30 seconds
setInterval(processPushQueue, 30000);

// Run immediately on startup
processPushQueue();
```

### Step 9: Install Required NPM Packages

```bash
npm install apn --save
```

### Step 10: Environment Variables

Add to your `.env` file:

**For Auth Key Method (Recommended):**
```env
# APNs Configuration (Auth Key Method)
APNS_KEY_PATH=/path/to/AuthKey_XXXXXXXXXX.p8
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=R6JXB945ND

# Environment
NODE_ENV=production
```

**For Certificate Method (Alternative):**
```env
# APNs Configuration (Certificate Method)
APNS_CERT_PATH=/path/to/aps_production.p12
APNS_KEY_PATH=/path/to/private_key.pem
APNS_PASSPHRASE=your_certificate_passphrase

# Environment
NODE_ENV=production
```

**Example with actual paths:**
```env
# Store .p8 file in a secure location outside your project
APNS_KEY_PATH=/Users/sloiterstein/.secrets/AuthKey_ABC123DEF4.p8
APNS_KEY_ID=ABC123DEF4
APNS_TEAM_ID=R6JXB945ND
NODE_ENV=production
```

**Security Note:**
- Never commit `.p8` files or certificates to git
- Add to `.gitignore`: `*.p8`, `*.p12`, `*.cer`, `*.pem`
- Use environment variables, not hardcoded paths
- Consider using a secrets management service for production

### Step 11: Initialize in Your App

In your main app file (e.g., `src/App.tsx` or `src/main.tsx`):

```typescript
import { PushTokenService } from '@/services/pushTokenService';

// On app startup, after user is authenticated
useEffect(() => {
  if (user) {
    PushTokenService.initialize();
  }
}, [user]);
```

## Testing

1. **Test Device Token Registration:**
   - Run app on physical iOS device (push notifications don't work on simulator)
   - Check `device_tokens` table in database
   - Verify token is stored

2. **Test Push Notification:**
   - Create a test notification in database
   - Check `push_notification_queue` table
   - Verify worker processes it
   - Check device receives notification

3. **Test Different Notification Types:**
   - Friend request
   - Chat message
   - Event interest
   - Event reminder

## Production Checklist

- [ ] Use APNs Auth Key instead of certificates (more secure)
- [ ] Set up proper error handling and retry logic
- [ ] Monitor push notification delivery rates
- [ ] Handle device token invalidation (when app is uninstalled)
- [ ] Set up background worker as a separate service
- [ ] Add rate limiting to prevent abuse
- [ ] Test on production APNs environment

## Troubleshooting

**Issue: "No valid 'aps-environment' entitlement"**
- Solution: Enable Push Notifications capability in Xcode

**Issue: "Device token not received"**
- Solution: Must test on physical device, not simulator

**Issue: "Certificate expired"**
- Solution: Download new certificate from Apple Developer Portal

**Issue: "Push notifications not received"**
- Check device token is registered in database
- Check APNs certificate is valid
- Check notification queue is being processed
- Check device has internet connection

## Next Steps

1. Run the database migration
2. Update AppDelegate.swift
3. Create push token service
4. Set up backend push service
5. Test on physical device
6. Deploy to production

