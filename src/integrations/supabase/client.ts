import { createClient } from '@supabase/supabase-js';
import { nativeStorage } from '@/lib/nativeStorage';
import { getCanonicalSiteUrl } from '@/utils/canonicalSiteUrl';

// Get Supabase credentials from environment variables
// These MUST be set at build time (npm run build) for mobile apps
// For local builds: Set in .env.local file
// For Xcode Cloud: Set in workflow environment variables
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://your-project.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "your-anon-key";

// CRITICAL: If credentials are missing, throw error immediately so it's obvious
if (SUPABASE_URL === "https://your-project.supabase.co" || SUPABASE_PUBLISHABLE_KEY === "your-anon-key") {
  const errorMsg = `❌ CRITICAL: Supabase credentials missing! 
  
Environment variables not set at build time:
- VITE_SUPABASE_URL: ${SUPABASE_URL === "https://your-project.supabase.co" ? "MISSING" : "SET"}
- VITE_SUPABASE_ANON_KEY or VITE_SUPABASE_PUBLISHABLE_KEY: ${SUPABASE_PUBLISHABLE_KEY === "your-anon-key" ? "MISSING" : "SET"}

To fix:
1. Create .env.local file with your Supabase credentials
2. Run: npm run build
3. Then: npx cap sync ios
4. Rebuild in Xcode

OR for Xcode Cloud:
1. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to workflow environment variables
2. Ensure ci_post_clone.sh runs npm run build with these variables`;
  
  console.error(errorMsg);
  // Don't throw - let the app try to load, but it will fail with clear error messages
}

// Debug logging (disabled in production)
if (import.meta.env.DEV) {
  console.log('Supabase URL:', SUPABASE_URL);
  console.log('Supabase Key (first 20 chars):', SUPABASE_PUBLISHABLE_KEY.substring(0, 20) + '...');
}

// Check if we have valid credentials
if (SUPABASE_URL === "https://your-project.supabase.co" || SUPABASE_PUBLISHABLE_KEY === "your-anon-key") {
  console.error('❌ Supabase credentials not found! Check environment variables.');
  console.error('SUPABASE_URL:', SUPABASE_URL);
  console.error('SUPABASE_KEY present:', !!SUPABASE_PUBLISHABLE_KEY);
  console.error('Environment check - DEV:', import.meta.env.DEV);
  console.error('Environment check - MODE:', import.meta.env.MODE);
} else if (import.meta.env.DEV) {
  console.log('✅ Supabase credentials loaded');
  console.log('Supabase URL:', SUPABASE_URL);
}

// Configure Supabase client
const supabaseConfig: any = {
  auth: {
    // Auto-refresh session - ensures tokens are refreshed before expiry
    autoRefreshToken: true,
    // Persist session in storage
    persistSession: true,
    storage: nativeStorage,
    // Detect session from URL (for deep links)
    detectSessionInUrl: true,
    redirectTo: getCanonicalSiteUrl(),
  },
};

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, supabaseConfig);

// Expose URL for validation (for debugging)
(supabase as any).supabaseUrl = SUPABASE_URL;
