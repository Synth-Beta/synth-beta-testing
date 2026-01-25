/**
 * Native Storage Adapter for Supabase Auth
 * 
 * Uses Capacitor Preferences for persistent storage on mobile.
 * Falls back to localStorage on web.
 * 
 * This ensures sessions survive app restarts on mobile devices.
 */

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

const isMobile = Capacitor.isNativePlatform();

/**
 * Storage adapter compatible with Supabase Auth
 * Supabase expects: getItem, setItem, removeItem (can be async)
 */
export const nativeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (isMobile) {
      try {
        const { value } = await Preferences.get({ key });
        return value;
      } catch (error) {
        console.warn('Native storage getItem failed:', error);
        return null;
      }
    }
    return localStorage.getItem(key);
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (isMobile) {
      try {
        await Preferences.set({ key, value });
      } catch (error) {
        console.warn('Native storage setItem failed:', error);
      }
    } else {
      localStorage.setItem(key, value);
    }
  },

  removeItem: async (key: string): Promise<void> => {
    if (isMobile) {
      try {
        await Preferences.remove({ key });
      } catch (error) {
        console.warn('Native storage removeItem failed:', error);
      }
    } else {
      localStorage.removeItem(key);
    }
  },
};
