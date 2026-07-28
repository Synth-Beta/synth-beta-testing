import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useAccountType() {
  const { user } = useAuth();
  const [accountType, setAccountType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAccountType = async () => {
      if (!user) {
        setAccountType(null);
        setLoading(false);
        return;
      }

      // Set loading to true when we start fetching for a user
      setLoading(true);

      try {
        // First try to get from auth.users metadata
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser?.user_metadata?.account_type) {
          setAccountType(authUser.user_metadata.account_type);
          setLoading(false);
          return;
        }

        // Also check app_metadata
        if (authUser?.app_metadata?.account_type) {
          setAccountType(authUser.app_metadata.account_type);
          setLoading(false);
          return;
        }

        // Try users table (the actual table name in this database)
        const { data: userRecord, error } = await supabase
          .from('users')
          .select('account_type')
          .eq('user_id', user.id)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
          console.error('Error fetching account type:', error);
        }

        if (userRecord?.account_type) {
          setAccountType(userRecord.account_type);
        } else {
          // Default to 'user' if no account_type is set
          setAccountType('user');
        }
      } catch (error) {
        console.error('Error in fetchAccountType:', error);
        setAccountType('user');
      } finally {
        setLoading(false);
      }
    };

    fetchAccountType();
  }, [user]);

  const isAdmin = accountType === 'admin';

  return {
    accountType,
    isAdmin,
    loading,
  };
}

