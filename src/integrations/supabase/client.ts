import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://your-project.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "your-anon-key";

// Debug logging
console.log('Supabase URL:', SUPABASE_URL);
console.log('Supabase Key (first 20 chars):', SUPABASE_PUBLISHABLE_KEY.substring(0, 20) + '...');

// Check if we have valid credentials
if (SUPABASE_URL === "https://your-project.supabase.co" || SUPABASE_PUBLISHABLE_KEY === "your-anon-key") {
  console.error('❌ Supabase credentials not found! Check environment variables.');
} else {
  console.log('✅ Supabase credentials loaded successfully');
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
