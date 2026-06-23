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
      // Use dynamic import with error handling for optional dependency
      // @ts-ignore - Optional dependency, may not be available in web/desktop
      const pushModule = await import('@capacitor/push-notifications').catch(() => null);
      
      if (!pushModule || !pushModule.PushNotifications) {
        console.log('⚠️ Capacitor push notifications plugin not available (this is normal in web/desktop)');
        return;
      }
      
      const { PushNotifications } = pushModule;
      
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
        
        const platform = (window as any).Capacitor?.getPlatform?.() ?? 'ios';
        
        // Get app version if available
        let appVersion: string | undefined;
        try {
          const { App } = await import('@capacitor/app');
          const info = await App.getInfo();
          appVersion = info.version;
        } catch {
          appVersion = undefined;
        }
        
        // Register token with backend
        await this.registerToken(
          token.value,
          platform === 'android' ? 'android' : 'ios',
          undefined,
          appVersion
        );
      });

      // Listen for registration errors
      PushNotifications.addListener('registrationError', (error) => {
        console.error('❌ Push notification registration error:', error);
      });

      // Listen for push notifications received while app is open (foreground)
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        console.log('📬 Push notification received (foreground):', notification);
        
        // Dispatch in-app toast and badge refresh
        window.dispatchEvent(new CustomEvent('synth-push-received', {
          detail: {
            title: notification.title,
            body: notification.body,
            data: notification.data,
          }
        }));
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
      // Note: NotificationCenter events from native iOS don't use CustomEvent.detail
      // They need to be accessed via window events or Capacitor bridge
      const handleDeviceTokenReceived = async (event: any) => {
        // Try multiple ways to get the token (handles both CustomEvent and NotificationCenter posts)
        const token = event.detail?.token || 
                     (event as CustomEvent)?.detail?.token ||
                     event.token ||
                     (event as any).userInfo?.token;
        
        if (token) {
          console.log('📱 Device token received via native event:', token);
          this.storeToken(token);
          await this.registerToken(token, 'ios');
        }
      };
      
      window.addEventListener('DeviceTokenReceived', handleDeviceTokenReceived);
      
      // Also listen via Capacitor App plugin events if available
      if ((window as any).Capacitor?.Plugins?.App) {
        (window as any).Capacitor.Plugins.App.addListener('appStateChange', async (state: any) => {
          // Update badge count when app comes to foreground
          if (state.isActive) {
            const { BadgeService } = await import('./badgeService');
            await BadgeService.updateBadgeCount();
          }
        });
      }

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
   * Handle navigation when notification is tapped.
   * Dispatches custom events that MainApp listens to — never does window.location
   * because that causes a full SPA reload and loses all React state.
   */
  private static async handleNotificationNavigation(data: any): Promise<void> {
    try {
      const { type, chat_id, event_id, sender_id } = data;
      
      switch (type) {
        case 'friend_request':
          if (sender_id) {
            window.dispatchEvent(new CustomEvent('open-user-profile', {
              detail: { userId: sender_id }
            }));
          } else {
            window.dispatchEvent(new CustomEvent('synth-navigate', {
              detail: { view: 'notifications' }
            }));
          }
          break;
          
        case 'message':
        case 'chat_message': {
          const resolvedChatId = chat_id || data?.chat_id;
          if (resolvedChatId) {
            window.dispatchEvent(new CustomEvent('synth-navigate', {
              detail: { view: 'chat', chatId: resolvedChatId }
            }));
          }
          break;
        }
          
        case 'event_interest':
        case 'event_reminder_1_week':
        case 'event_reminder_3_days':
        case 'event_reminder_1_day':
        case 'event_reminder_day_after':
        case 'artist_new_event':
        case 'venue_new_event':
        case 'follows_new_events_summary':
        case 'friends_event_interest_summary':
        case 'bucket_list_new_events_summary': {
          const resolvedEventId = event_id || data?.event_id;
          if (resolvedEventId) {
            window.dispatchEvent(new CustomEvent('open-event-details', {
              detail: { eventId: resolvedEventId }
            }));
          } else {
            window.dispatchEvent(new CustomEvent('synth-navigate', {
              detail: { view: 'discover' }
            }));
          }
          break;
        }
          
        default:
          window.dispatchEvent(new CustomEvent('synth-navigate', {
            detail: { view: 'notifications' }
          }));
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

