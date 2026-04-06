import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const PLACEHOLDER_URL = 'https://your-project.supabase.co';
const PLACEHOLDER_KEY = 'your-anon-key';
/** Use the same Supabase project as web: set EXPO_PUBLIC_* in `mobile/.env` (or root) to match VITE_SUPABASE_* so data and auth user id align. */
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  PLACEHOLDER_URL;
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  PLACEHOLDER_KEY;

export const isSupabaseConfigured =
  SUPABASE_URL !== PLACEHOLDER_URL && SUPABASE_ANON_KEY !== PLACEHOLDER_KEY;
if (!isSupabaseConfigured) {
  console.warn(
    '⚠️ Supabase credentials missing for mobile. Set EXPO_PUBLIC_SUPABASE_URL/EXPO_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

const isWebSSR = Platform.OS === 'web' && typeof window === 'undefined';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: {
            getItem: (key: string) => {
                if (typeof window === 'undefined') return Promise.resolve(null);
                return AsyncStorage.getItem(key);
            },
            setItem: (key: string, value: string) => {
                if (typeof window === 'undefined') return Promise.resolve();
                return AsyncStorage.setItem(key, value);
            },
            removeItem: (key: string) => {
                if (typeof window === 'undefined') return Promise.resolve();
                return AsyncStorage.removeItem(key);
            }
        },
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});
