import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const PLACEHOLDER_URL = 'https://your-project.supabase.co';
const PLACEHOLDER_KEY = 'your-anon-key';
// Publishable anon key — safe to commit (RLS enforced on all tables).
const HARDCODED_URL = 'https://glpiolbrafqikqhnseto.supabase.co';
const HARDCODED_KEY = 'sb_publishable_TsjAgYyPVN5S9hz3NT_05Q_c0oGx-2b';
/** Use the same Supabase project as web: set EXPO_PUBLIC_* in `mobile/.env` (or root) to match VITE_SUPABASE_* so data and auth user id align. */
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  HARDCODED_URL;
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  HARDCODED_KEY;

export const isSupabaseConfigured =
  SUPABASE_URL !== PLACEHOLDER_URL && SUPABASE_ANON_KEY !== PLACEHOLDER_KEY;

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
