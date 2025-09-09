import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Mock Supabase client that doesn't actually connect
const SUPABASE_URL = "https://mock.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "mock-key";

export const supabase = {
  auth: {
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    signOut: () => Promise.resolve({ error: null })
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        gte: () => ({
          order: () => Promise.resolve({ data: [], error: null })
        })
      })
    }),
    insert: () => Promise.resolve({ data: [], error: null }),
    delete: () => ({
      eq: () => Promise.resolve({ error: null })
    })
  })
} as any;
