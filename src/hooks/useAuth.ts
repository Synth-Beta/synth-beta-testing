import { useState, useEffect, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { PreferenceSignalsService } from '@/services/preferenceSignalsService';
import { Capacitor } from '@capacitor/core';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const preferenceRefreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Get initial session - user stays logged in until they explicitly log out
    const getInitialSession = async (retryCount = 0): Promise<void> => {
      const maxRetries = Capacitor.isNativePlatform() ? 3 : 1;
      const retryDelay = 500;

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          // On mobile, retry if storage might still be loading
          if (retryCount < maxRetries - 1 && Capacitor.isNativePlatform()) {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            return getInitialSession(retryCount + 1);
          }
          console.error('Error getting session:', error);
          setSession(null);
          setUser(null);
        } else if (session) {
          // Session found - user is logged in
          setSession(session);
          setUser(session.user);
          // Refresh preference signals
          schedulePreferenceRefresh();
        } else {
          // No session - user not logged in
          setSession(null);
          setUser(null);
        }
      } catch (error) {
        if (retryCount < maxRetries - 1 && Capacitor.isNativePlatform()) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return getInitialSession(retryCount + 1);
        }
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

    // Listen for auth changes - only log out when user explicitly signs out
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Only handle explicit sign out - ignore token expiration
        if (event === 'SIGNED_OUT') {
          console.log('👋 User signed out');
          setSessionExpired(false);
          setSession(null);
          setUser(null);
        } else if (session) {
          // User is logged in (new sign in, token refresh, etc.)
          setSessionExpired(false);
          setSession(session);
          setUser(session.user);
          
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            schedulePreferenceRefresh();
          }
        }
        // Note: We intentionally don't clear session on token expiration
        // User stays "logged in" until they explicitly click logout
        
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
