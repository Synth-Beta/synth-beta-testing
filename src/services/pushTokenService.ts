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
   * Initialize push notifications (call on app startup).
   *
   * This web bundle has no native push bridge (the legacy Capacitor iOS app
   * that provided one is gone; the current native app ships via Expo, see
   * mobile/, with its own push registration). Left as a no-op so existing
   * call sites don't need to be torn out individually.
   */
  static async initialize(): Promise<void> {
    this.initialized = true;
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

