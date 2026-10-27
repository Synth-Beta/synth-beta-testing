import { useEffect, useState } from 'react';
import { supabase } from '../integrations/supabase/client';

/** account_type === 'admin'. False until loaded, so admin-only UI never flashes for others. */
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('users')
        .select('account_type')
        .eq('user_id', session.user.id)
        .maybeSingle();
      if (alive) setIsAdmin((data as { account_type?: string } | null)?.account_type === 'admin');
    })();
    return () => {
      alive = false;
    };
  }, []);

  return isAdmin;
}
