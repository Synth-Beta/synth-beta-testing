import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';

// Mock authentication hook that bypasses Supabase for now
export function useAuth() {
  const [user, setUser] = useState<User | null>({
    id: 'test-user-123',
    email: 'test@example.com',
    created_at: new Date().toISOString(),
    aud: 'authenticated',
    role: 'authenticated',
    updated_at: new Date().toISOString(),
    app_metadata: {},
    user_metadata: {},
    identities: [],
    factors: []
  } as User);
  
  const [session, setSession] = useState<Session | null>({
    access_token: 'mock-token',
    refresh_token: 'mock-refresh-token',
    expires_in: 3600,
    expires_at: Date.now() + 3600000,
    token_type: 'bearer',
    user: user!
  } as Session);
  
  const [loading, setLoading] = useState(false);

  const signOut = async () => {
    setUser(null);
    setSession(null);
  };

  return {
    user,
    session,
    loading,
    signOut,
  };
}
