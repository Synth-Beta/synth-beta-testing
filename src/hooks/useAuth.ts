import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    // Get initial session
    const getInitialSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error getting session:', error);
          setSessionExpired(true);
          setSession(null);
          setUser(null);
        } else if (session) {
          // Check if session is expired
          const now = Math.floor(Date.now() / 1000);
          if (session.expires_at && session.expires_at < now) {
            console.log('Initial session expired');
            setSessionExpired(true);
            setSession(null);
            setUser(null);
          } else {
            setSessionExpired(false);
            setSession(session);
            setUser(session.user);
          }
        } else {
          setSessionExpired(false);
          setSession(null);
          setUser(null);
        }
      } catch (error) {
        console.error('Error in getInitialSession:', error);
        setSessionExpired(true);
        setSession(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    getInitialSession();

    // Periodic session check every 30 seconds for testing (change back to 5 minutes in production)
    const sessionCheckInterval = setInterval(async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error checking session:', error);
          setSessionExpired(true);
          setSession(null);
          setUser(null);
        } else if (session) {
          // Check if session is expired
          const now = Math.floor(Date.now() / 1000);
          if (session.expires_at && session.expires_at < now) {
            console.log('Session expired during periodic check');
            setSessionExpired(true);
            setSession(null);
            setUser(null);
          }
        }
      } catch (error) {
        console.error('Error in periodic session check:', error);
      }
    }, 5 * 60 * 1000); // Check every 5 minutes (optimized from 30 seconds)

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.id);
        
        // Handle different auth events
        if (event === 'SIGNED_OUT') {
          console.log('User signed out');
          setSessionExpired(false);
          setSession(null);
          setUser(null);
        } else if (event === 'TOKEN_REFRESHED' && !session) {
          console.log('Session expired - no valid session after token refresh');
          setSessionExpired(true);
          setSession(null);
          setUser(null);
        } else if (session) {
          // Check if session is expired
          const now = Math.floor(Date.now() / 1000);
          if (session.expires_at && session.expires_at < now) {
            console.log('Session expired - expires_at is in the past');
            setSessionExpired(true);
            setSession(null);
            setUser(null);
          } else {
            console.log('Valid session found');
            setSessionExpired(false);
            setSession(session);
            setUser(session.user);
          }
        } else {
          // No session available
          console.log('No session available');
          setSessionExpired(false);
          setSession(null);
          setUser(null);
        }
        
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
      clearInterval(sessionCheckInterval);
    };
  }, []);

  const signOut = async () => {
    try {
      setLoading(true);
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
