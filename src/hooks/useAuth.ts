import { useState, useEffect, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { PreferenceSignalsService } from '@/services/preferenceSignalsService';
import { ensurePublicUserProfile } from '@/services/publicUserRecoveryService';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const preferenceRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Get initial session - user stays logged in until they explicitly log out
    const getInitialSession = async (): Promise<void> => {
      try {
        console.log('🔐 Getting session');
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Error getting session:', error);
          setSession(null);
          setUser(null);
        } else if (session) {
          // Session found - user is logged in
          console.log('✅ Session restored - user is logged in');
          setSession(session);
          setUser(session.user);
          schedulePreferenceRefresh();
        } else {
          console.log('ℹ️ No session found - user needs to log in');
          setSession(null);
          setUser(null);
        }
      } catch (error) {
        console.error('Error in getInitialSession:', error);
        setSession(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    // Helper to schedule preference signal refresh with debouncing
    const schedulePreferenceRefresh = () => {
      if (preferenceRefreshTimeoutRef.current) {
        clearTimeout(preferenceRefreshTimeoutRef.current);
      }
      preferenceRefreshTimeoutRef.current = setTimeout(() => {
        PreferenceSignalsService.refreshIfNeeded().catch(err => {
          console.warn('Failed to refresh preference signals:', err);
        });
        preferenceRefreshTimeoutRef.current = null;
      }, 1000);
    };

    getInitialSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          console.log('👋 User signed out');
          setSessionExpired(false);
          setSession(null);
          setUser(null);
        } else if (event === 'TOKEN_REFRESHED' && session) {
          // Successful refresh — clear any prior expired flag
          setSessionExpired(false);
          setSession(session);
          setUser(session.user);
        } else if (event === 'TOKEN_REFRESH_FAILED') {
          // Supabase could not silently refresh the token (network issue, revoked token,
          // or the refresh token itself has expired). The user is effectively logged out
          // — API calls will 401. Set sessionExpired so the UI routes to the login screen
          // instead of showing a broken authenticated state.
          console.warn('⚠️ Token refresh failed — prompting re-login');
          setSessionExpired(true);
          setSession(null);
          setUser(null);
        } else if (session) {
          // User is logged in (new sign in, initial session, etc.)
          setSessionExpired(false);
          setSession(session);
          setUser(session.user);

          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            schedulePreferenceRefresh();
          }
        }

        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
      if (preferenceRefreshTimeoutRef.current) {
        clearTimeout(preferenceRefreshTimeoutRef.current);
        preferenceRefreshTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      return;
    }

    let cancelled = false;

    const recoverProfile = async () => {
      const result = await ensurePublicUserProfile();
      if (cancelled) {
        return;
      }
      if (!result.success) {
        console.error('[useAuth] Failed to ensure public.users row:', result.error);
      }
    };

    void recoverProfile();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const signOut = async () => {
    try {
      setLoading(true);
      
      // Sign out from Supabase (this clears the session from storage)
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Error signing out:', error);
      }
    } catch (error) {
      console.error('Error in signOut:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetSessionExpired = () => {
    setSessionExpired(false);
  };

  return {
    user,
    session,
    loading,
    sessionExpired,
    signOut,
    resetSessionExpired,
  };
}
