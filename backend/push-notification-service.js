/**
 * Push Notification Service
 * Sends Apple Push Notifications via APNs
 */

const apn = require('apn');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

class PushNotificationService {
  constructor() {
    // Initialize Supabase client
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Initialize APNs provider using Auth Key method
    // Support both APNS_KEY_PATH (file) and APNS_KEY_CONTENT (base64-encoded key for cloud hosts)
    let keyBuffer = null;
    const keyPath = process.env.APNS_KEY_PATH;
    const keyContent = process.env.APNS_KEY_CONTENT;

    if (keyContent) {
      try {
        keyBuffer = Buffer.from(keyContent, 'base64');
      } catch (err) {
        console.error('❌ Failed to decode APNS_KEY_CONTENT (must be base64):', err.message);
        this.apnProvider = null;
        return;
      }
    } else if (keyPath) {
      if (!fs.existsSync(keyPath)) {
        console.error(`❌ APNs key file not found at: ${keyPath}`);
        this.apnProvider = null;
        return;
      }
      keyBuffer = fs.readFileSync(keyPath);
    }

    if (!keyBuffer) {
      console.warn('⚠️  APNS_KEY_PATH or APNS_KEY_CONTENT not set. Push notifications will not work.');
      this.apnProvider = null;
      return;
    }

    try {
      const keyId = process.env.APNS_KEY_ID;
      const teamId = process.env.APNS_TEAM_ID;
      
      if (!keyId || !teamId) {
        console.error('❌ APNS_KEY_ID and APNS_TEAM_ID environment variables are required');
        this.apnProvider = null;
        return;
      }

      // APNS_PRODUCTION takes precedence over NODE_ENV for sandbox vs production
      const production = process.env.APNS_PRODUCTION !== undefined
        ? process.env.APNS_PRODUCTION === 'true' || process.env.APNS_PRODUCTION === '1'
        : process.env.NODE_ENV === 'production';
      
      const options = {
        token: {
          key: keyBuffer,
          keyId: keyId,
          teamId: teamId
        },
        production
      };

      this.apnProvider = new apn.Provider(options);
      console.log('✅ APNs provider initialized successfully');
    } catch (error) {
      console.error('❌ Error initializing APNs provider:', error);
      this.apnProvider = null;
    }
  }

  /**
   * Expo / React Native apps register `ExponentPushToken[...]` tokens — send via Expo Push API, not raw APNs.
   * @see https://docs.expo.dev/push-notifications/sending-notifications/
   */
  static isExpoPushToken(deviceToken) {
    if (typeof deviceToken !== 'string') return false;
    const t = deviceToken.trim();
    // Expo historically used `ExponentPushToken[...]` and has also used `ExpoPushToken[...]` in some clients.
    return (
      t.startsWith('ExponentPushToken[') ||
      t.startsWith('ExpoPushToken[') ||
      t.startsWith('ExponentPushToken') ||
      t.startsWith('ExpoPushToken')
    );
  }

  /**
   * Send via Expo Push API (requires EXPO_ACCESS_TOKEN from expo.dev).
   */
  async sendExpoPushNotification(deviceToken, notification) {
    const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();

    try {
      const to = typeof deviceToken === 'string' ? deviceToken.trim() : deviceToken;
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          to,
          title: notification.title,
          body: notification.message,
          data: notification.data || {},
          sound: 'default',
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, error: json?.errors?.[0]?.message || res.statusText };
      }
      const ticket = json?.data;
      const status = Array.isArray(ticket) ? ticket[0]?.status : ticket?.status;
      if (status === 'error') {
        const errMsg = Array.isArray(ticket) ? ticket[0]?.message : ticket?.message;
        return { success: false, error: errMsg || 'Expo push error' };
      }
      return { success: true };
    } catch (error) {
      console.error('Expo push send error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send push notification to a device
   */
  async sendNotification(deviceToken, notification) {
    const normalizedToken = typeof deviceToken === 'string' ? deviceToken.trim() : deviceToken;
    if (PushNotificationService.isExpoPushToken(normalizedToken)) {
      return this.sendExpoPushNotification(normalizedToken, notification);
    }

    if (!this.apnProvider) {
      // If we don't have APNs configured, don't keep retrying forever.
      // Expo tokens should still deliver; raw APNs tokens cannot.
      return { success: false, error: 'apns:not-configured' };
    }

    const apnNotification = new apn.Notification();
    
    apnNotification.alert = {
      title: notification.title,
      body: notification.message
    };
    
    apnNotification.badge = notification.badge || 1;
    apnNotification.sound = 'default';
    apnNotification.topic = process.env.APNS_BUNDLE_ID || 'com.tejpatel.synth'; // Bundle ID from env or default
    apnNotification.payload = notification.data || {};
    apnNotification.expiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour
    apnNotification.priority = 10;

    try {
      const result = await this.apnProvider.send(apnNotification, normalizedToken);
      
      if (result.failed && result.failed.length > 0) {
        const error = result.failed[0];
        console.error('Failed to send notification:', error);
        
        // Handle invalid device tokens
        if (error.status === '410' || error.response?.reason === 'BadDeviceToken') {
          // Mark device token as inactive in database
          await this.deactivateDeviceToken(normalizedToken);
        }
        
        return { success: false, error: error.response?.reason || error.error };
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error sending push notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Deactivate invalid device token
   */
  async deactivateDeviceToken(deviceToken) {
    try {
      const { error } = await this.supabase
        .from('device_tokens')
        .update({ is_active: false })
        .eq('device_token', deviceToken);

      if (error) {
        console.error('Error deactivating device token:', error);
      } else {
        console.log('Device token deactivated:', deviceToken);
      }
    } catch (error) {
      console.error('Error deactivating device token:', error);
    }
  }

  /**
   * Send notification to all user's devices
   */
  async sendToUser(userId, notification) {
    // Get all active device tokens for user
    const { data: devices, error } = await this.supabase
      .from('device_tokens')
      .select('device_token, platform')
      .eq('user_id', userId)
      .eq('is_active', true)
      .in('platform', ['ios', 'android']);

    if (error) {
      console.error('Error fetching device tokens:', error);
      return { success: false, error: error.message };
    }

    if (!devices || devices.length === 0) {
      return { success: true, sent: 0, message: 'No active devices' };
    }

    // Send to all devices; skip non-Expo Android tokens (APNs only handles iOS)
    const results = await Promise.all(
      devices.map(device => {
        if (!PushNotificationService.isExpoPushToken(device.device_token) && device.platform !== 'ios') {
          return Promise.resolve({ success: false, error: 'android:non-expo-token-unsupported' });
        }
        return this.sendNotification(device.device_token, notification);
      })
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

    // Only send push for unread notifications
    if (notification.is_read) {
      return;
    }

    // Send push notification
    const result = await this.sendToUser(notification.user_id, {
      title: notification.title,
      message: notification.message,
      data: notification.data || {},
      badge: 1
    });

    return result;
  }

  /**
   * Queue pending notifications directly (no database function needed)
   * Call this periodically to queue notifications that need push
   * Respects user_settings_preferences.enable_push_notifications
   *
   * Uses a two-query approach: notifications and device_tokens have no direct FK
   * (both reference users via user_id), so we fetch them separately and join in code.
   */
  async queuePendingNotifications(limit = 100) {
    try {
      // Step 1: Fetch unread notifications (no embed - no FK between notifications and device_tokens)
      //
      // Chat types are included: the database coalesces them to one row per chat
      // (notify_chat_message_v2), and per-user / per-chat mutes are applied there,
      // so anything that reaches this table is meant to be delivered.
      const { data: notifications, error: notifError } = await this.supabase
        .from('notifications')
        .select('id, user_id, title, message, data')
        .eq('is_read', false)
        // Prefer newest notifications first so users get timely pushes and we don't get stuck
        // working through a huge backlog.
        .order('created_at', { ascending: false })
        .limit(limit * 2);

      if (notifError) {
        console.error('Error fetching pending notifications:', notifError);
        return { queued: 0, error: notifError.message };
      }

      if (!notifications || notifications.length === 0) {
        return { queued: 0 };
      }

      const userIds = [...new Set(notifications.map(n => n.user_id))];

      // Step 2: Fetch active iOS device tokens for those users
      const { data: deviceTokens, error: tokensError } = await this.supabase
        .from('device_tokens')
        .select('user_id, device_token')
        .in('user_id', userIds)
        .eq('is_active', true)
        .in('platform', ['ios', 'android']);

      if (tokensError) {
        console.error('Error fetching device tokens:', tokensError);
        return { queued: 0, error: tokensError.message };
      }

      if (!deviceTokens || deviceTokens.length === 0) {
        return { queued: 0 };
      }

      // Group device tokens by user_id for lookup
      const tokensByUser = new Map();
      for (const row of deviceTokens) {
        if (!tokensByUser.has(row.user_id)) {
          tokensByUser.set(row.user_id, []);
        }
        tokensByUser.get(row.user_id).push(row.device_token);
      }

      // Step 3: Fetch user preferences (enable_push_notifications)
      const { data: userPreferences, error: prefError } = await this.supabase
        .from('user_settings_preferences')
        .select('user_id, enable_push_notifications')
        .in('user_id', userIds);

      if (prefError) {
        console.warn('Error fetching user preferences (will default to enabled):', prefError);
      }

      const pushEnabledMap = new Map();
      userIds.forEach(userId => {
        const pref = userPreferences?.find(p => p.user_id === userId);
        pushEnabledMap.set(userId, pref ? pref.enable_push_notifications !== false : true);
      });

      // Filter to notifications for users who have push enabled and at least one device token
      const enabledNotifications = notifications.filter(n => {
        return pushEnabledMap.get(n.user_id) === true && (tokensByUser.get(n.user_id) || []).length > 0;
      });

      if (enabledNotifications.length === 0) {
        return { queued: 0 };
      }

      // Step 4: Check which (notification_id, device_token) pairs are already queued
      const notificationIds = enabledNotifications.map(n => n.id);
      const { data: existing, error: existingError } = await this.supabase
        .from('push_notification_queue')
        .select('notification_id, device_token')
        .in('notification_id', notificationIds)
        // Allow re-queueing items that previously failed (e.g. infra was fixed, credentials added, etc).
        // Only treat pending/sent rows as "already handled".
        .in('status', ['pending', 'sent']);

      if (existingError) {
        console.error('Error fetching existing queue entries:', existingError);
        return { queued: 0, error: existingError.message };
      }

      const normalizeTokenKey = (t) => (typeof t === 'string' ? t.trim() : t);
      const existingSet = new Set(
        (existing || []).map(e => `${e.notification_id}:${normalizeTokenKey(e.device_token)}`)
      );

      // Step 5: Build queue items (notification x device_token per user)
      const queueItems = [];
      for (const notification of enabledNotifications) {
        const tokens = tokensByUser.get(notification.user_id) || [];
        for (const deviceToken of tokens) {
          const normalizedToken = normalizeTokenKey(deviceToken);
          const isExpo = PushNotificationService.isExpoPushToken(normalizedToken);
          // If APNs isn't configured, avoid queueing non-Expo tokens (they can never be sent).
          if (!isExpo && !this.apnProvider) {
            continue;
          }

          const key = `${notification.id}:${normalizedToken}`;
          if (!existingSet.has(key)) {
            queueItems.push({
              user_id: notification.user_id,
              device_token: normalizedToken,
              notification_id: notification.id,
              title: notification.title,
              body: notification.message,
              data: notification.data || {},
              status: 'pending'
            });
          }
        }
      }

      if (queueItems.length === 0) {
        return { queued: 0 };
      }

      const { error: insertError } = await this.supabase
        .from('push_notification_queue')
        .insert(queueItems);

      if (insertError) {
        console.error('Error queueing notifications:', insertError);
        return { queued: 0, error: insertError.message };
      }

      return { queued: queueItems.length };
    } catch (error) {
      console.error('Error in queuePendingNotifications:', error);
      return { queued: 0, error: error.message };
    }
  }

  /**
   * Process push notification queue
   */
  async processQueue(limit = 100) {
    // Get pending notifications from queue
    const { data: queue, error } = await this.supabase
      .from('push_notification_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(limit);

    if (error) {
      console.error(`[${new Date().toISOString()}] Error fetching push queue:`, error);
      return { processed: 0, errors: 1 };
    }

    if (!queue || queue.length === 0) {
      return { processed: 0, errors: 0 };
    }

    console.log(`[${new Date().toISOString()}] 📋 Found ${queue.length} pending notification(s) in queue`);

    let processed = 0;
    let errors = 0;

    for (const item of queue) {
      try {
        const sendStartTime = Date.now();
        const result = await this.sendNotification(item.device_token, {
          title: item.title,
          message: item.body,
          data: item.data
        });
        const sendDuration = Date.now() - sendStartTime;

        // Update queue status
        // Only increment retry_count on failure, not on success
        const currentRetryCount = item.retry_count || 0;
        const newRetryCount = result.success ? currentRetryCount : currentRetryCount + 1;
        
        // If APNs isn't configured for non-Expo tokens, fail fast (do not retry).
        const failFast =
          result?.success === false &&
          (result.error === 'apns:not-configured' ||
            result.error === 'android:non-expo-token-unsupported');

        // Only mark as 'failed' if retry limit reached (3 retries = 4 total attempts)
        // retry_count represents the number of failed attempts, so >= 4 means initial + 3 retries
        const shouldMarkAsFailed = (!result.success && newRetryCount >= 4) || failFast;
        const newStatus = result.success ? 'sent' : (shouldMarkAsFailed ? 'failed' : 'pending');
        
        await this.supabase
          .from('push_notification_queue')
          .update({
            status: newStatus,
            sent_at: result.success ? new Date().toISOString() : null,
            error_message: result.error || null,
            retry_count: newRetryCount
          })
          .eq('id', item.id);

        if (result.success) {
          processed++;
          console.log(`[${new Date().toISOString()}] ✅ Sent push notification ${item.id} to device (${sendDuration}ms)`);
        } else {
          errors++;
          if (shouldMarkAsFailed) {
            console.warn(`[${new Date().toISOString()}] ⚠️  Failed to send push notification ${item.id} after ${newRetryCount} attempts (3 retries): ${result.error} (${sendDuration}ms)`);
          } else {
            console.warn(`[${new Date().toISOString()}] ⚠️  Failed to send push notification ${item.id}: ${result.error} (${sendDuration}ms, attempt ${newRetryCount}/4)`);
          }
        }
      } catch (error) {
        console.error(`[${new Date().toISOString()}] ❌ Error processing push notification ${item.id}:`, error);
        errors++;

        // Mark as failed if retry limit reached (3 retries = 4 total attempts)
        // retryCount represents the number of failed attempts, so >= 4 means initial + 3 retries
        const retryCount = (item.retry_count || 0) + 1;
        if (retryCount >= 4) {
          await this.supabase
            .from('push_notification_queue')
            .update({
              status: 'failed',
              retry_count: retryCount,
              error_message: error.message
            })
            .eq('id', item.id);
          console.error(`[${new Date().toISOString()}] ❌ Marked notification ${item.id} as failed after ${retryCount} attempts (3 retries)`);
        } else {
          // Update retry count but keep as pending
          await this.supabase
            .from('push_notification_queue')
            .update({
              retry_count: retryCount,
              error_message: error.message
            })
            .eq('id', item.id);
        }
      }
    }

    return { processed, errors };
  }
}

module.exports = new PushNotificationService();

