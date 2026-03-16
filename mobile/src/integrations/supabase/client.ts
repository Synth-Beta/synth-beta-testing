import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Get Supabase credentials from environment variables or use placeholders for development
// In a real Expo project, these would be in .env and accessed via process.env.EXPO_PUBLIC_...
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "https://your-project.supabase.co";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "your-anon-key";

if (SUPABASE_URL === "https://your-project.supabase.co" || SUPABASE_ANON_KEY === "your-anon-key") {
    console.warn('⚠️ Supabase credentials not found! Check environment variables.');
}

import { Platform } from 'react-native';

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
