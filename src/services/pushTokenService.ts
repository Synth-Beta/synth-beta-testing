/**
 * Push Token Service
 * Handles device token registration and push notification initialization
 */

import { supabase } from '@/integrations/supabase/client';

export class PushTokenService {
  private static initialized = false;

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
      
      console.log('✅ Device token registered successfully');
    } catch (error) {
      console.error('❌ Error registering device token:', error);
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
      
      console.log('✅ Device token unregistered successfully');
    } catch (error) {
      console.error('❌ Error unregistering device token:', error);
    }
  }

  /**
   * Get stored device token from localStorage (if any)
   */
  private static getStoredToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('device_token');
  }

  /**
   * Store device token in localStorage
   */
  private static storeToken(token: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('device_token', token);
  }

  /**
   * Initialize push notifications (call on app startup)
   */
  static async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('Push notifications already initialized');
      return;
    }

    if (typeof window === 'undefined') {
      console.log('Window not available, skipping push notification initialization');
      return;
    }

    // Check if we're on a native platform
    const isNative = (window as any).Capacitor?.isNativePlatform();
    
    if (!isNative) {
      console.log('Not on native platform, skipping push notification initialization');
      return;
    }

    try {
      // Try to use Capacitor Push Notifications plugin
      const { PushNotifications } = await import('@capacitor/push-notifications');
      
      // Request permission
      const permission = await PushNotifications.requestPermissions();
      
      if (permission.receive === 'granted') {
        // Register for push notifications
        await PushNotifications.register();
        console.log('✅ Push notifications registered');
      } else {
        console.log('❌ Push notification permission denied');
        return;
      }

      // Listen for registration (device token received)
      PushNotifications.addListener('registration', async (token) => {
        console.log('📱 Device token received:', token.value);
        this.storeToken(token.value);
        
        // Get app version if available
        const appVersion = (window as any).Capacitor?.getPlatform() === 'ios' 
          ? (await import('@capacitor/app')).App.getInfo().then(info => info.version)
          : undefined;
        
        // Register token with backend
        await this.registerToken(
          token.value,
          'ios',
          undefined, // deviceId - could be retrieved from device info
          await appVersion
        );
      });

      // Listen for registration errors
      PushNotifications.addListener('registrationError', (error) => {
        console.error('❌ Push notification registration error:', error);
      });

      // Listen for push notifications received while app is open
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('📬 Push notification received:', notification);
        
        // You can show an in-app notification here if needed
        // or update UI based on notification data
      });

      // Listen for notification action (when user taps notification)
      PushNotifications.addListener('pushNotificationActionPerformed', async (action) => {
        console.log('👆 Push notification action performed:', action);
        
        const data = action.notification.data;
        
        // Navigate to relevant screen based on notification type
        if (data?.type) {
          await this.handleNotificationNavigation(data);
        }
      });

      // Also listen for native iOS token (fallback method)
      window.addEventListener('DeviceTokenReceived', async (event: any) => {
        const token = event.detail?.token || (event as CustomEvent).detail?.token;
        if (token) {
          console.log('📱 Device token received via native event:', token);
          this.storeToken(token);
          await this.registerToken(token, 'ios');
        }
      });

      // Listen for notification taps from native
      window.addEventListener('PushNotificationTapped', async (event: any) => {
        const userInfo = event.detail || (event as CustomEvent).detail;
        if (userInfo) {
          await this.handleNotificationNavigation(userInfo);
        }
      });

      this.initialized = true;
      console.log('✅ Push notification service initialized');
    } catch (error) {
      console.error('❌ Error initializing push notifications:', error);
    }
  }

  /**
   * Handle navigation when notification is tapped
   */
  private static async handleNotificationNavigation(data: any): Promise<void> {
    try {
      const { type, chat_id, event_id, sender_id } = data;

      // Import router dynamically to avoid circular dependencies
      const { useRouter } = await import('react-router-dom');
      
      // Navigate based on notification type
      switch (type) {
        case 'friend_request':
          // Navigate to friend requests or profile
          if (sender_id) {
            window.location.href = `/profile/${sender_id}`;
          }
          break;
          
        case 'message':
          // Navigate to chat
          if (chat_id) {
            window.location.href = `/chat/${chat_id}`;
          }
          break;
          
        case 'event_interest':
        case 'event_reminder_1_week':
        case 'event_reminder_3_days':
        case 'event_reminder_1_day':
        case 'event_reminder_day_after':
        case 'artist_new_event':
        case 'venue_new_event':
          // Navigate to event
          if (event_id || data.event_id) {
            window.location.href = `/event/${event_id || data.event_id}`;
          }
          break;
          
        default:
          // Navigate to notifications page
          window.location.href = '/notifications';
      }
    } catch (error) {
      console.error('Error handling notification navigation:', error);
    }
  }

  /**
   * Cleanup on logout
   */
  static async cleanup(): Promise<void> {
    const storedToken = this.getStoredToken();
    if (storedToken) {
      await this.unregisterToken(storedToken);
      localStorage.removeItem('device_token');
    }
    this.initialized = false;
  }
}

