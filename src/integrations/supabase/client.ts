import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://your-project.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || "your-anon-key";

// Debug logging (disabled in production)
if (import.meta.env.DEV) {
  console.log('Supabase URL:', SUPABASE_URL);
  console.log('Supabase Key (first 20 chars):', SUPABASE_PUBLISHABLE_KEY.substring(0, 20) + '...');
}

// Check if we have valid credentials
if (SUPABASE_URL === "https://your-project.supabase.co" || SUPABASE_PUBLISHABLE_KEY === "your-anon-key") {
  console.error('❌ Supabase credentials not found! Check environment variables.');
} else {
  if (import.meta.env.DEV) {
    console.log('✅ Supabase credentials loaded successfully');
  }
}

// Detect if running on mobile (Capacitor)
const isMobile = Capacitor.isNativePlatform();

// Configure Supabase client with mobile-specific settings
const supabaseConfig: any = {
  auth: {
    // Auto-refresh session
    autoRefreshToken: true,
    // Persist session in mobile app storage
    persistSession: true,
    // Detect session from URL (for deep links) - only on web
    detectSessionInUrl: !isMobile, // Disable on mobile, we handle deep links manually
    // Storage adapter for mobile (uses Capacitor Preferences)
    // Let Supabase use default storage which works on both web and mobile
    // Redirect URLs based on platform
    redirectTo: isMobile 
      ? 'synth://' // Mobile deep link scheme
      : typeof window !== 'undefined' ? window.location.origin : 'https://synth-beta-testing.vercel.app', // Web origin
  },
};

if (isMobile && import.meta.env.DEV) {
  console.log('📱 Mobile platform detected - using mobile auth configuration');
}

// Create Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, supabaseConfig);

// Set up auth state change listener for deep link handling on mobile
// This is mobile-only because web handles auth callbacks differently
if (isMobile && typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    if (import.meta.env.DEV) {
      console.log('🔐 Auth state changed:', event, session ? 'Session exists' : 'No session');
    }
    
    // Handle deep link callbacks
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      // Session is established, app can proceed
      // Deep link processing is handled in App.tsx DeepLinkHandlerInner component
      if (import.meta.env.DEV) {
        console.log('✅ User authenticated via deep link');
      }
    }
  });
}
