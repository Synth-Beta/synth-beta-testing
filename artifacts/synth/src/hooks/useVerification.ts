import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { VerificationService } from '@/services/verificationService';
import { TrustScoreBreakdown } from '@/utils/verificationUtils';

interface VerificationStatus {
  verified: boolean;
  accountType: 'user' | 'creator' | 'business' | 'admin';
  trustScore: number;
  loading: boolean;
  error: string | null;
}

export function useVerification(userId: string | undefined): VerificationStatus {
  const [status, setStatus] = useState<VerificationStatus>({
    verified: false,
    accountType: 'user',
    trustScore: 0,
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!userId) {
      setStatus({
        verified: false,
        accountType: 'user',
        trustScore: 0,
        loading: false,
        error: null,
      });
      return;
    }

    let mounted = true;

    const fetchVerificationStatus = async () => {
      try {
        // Query users_complete view to get verification data
        const { data: profile, error } = await supabase
          .from('users_complete')
          .select('verified, account_type, trust_score')
          .eq('user_id', userId)
          .single();

        if (!mounted) return;

        if (error) {
          setStatus(prev => ({
            ...prev,
            loading: false,
            error: error.message,
          }));
          return;
        }

        setStatus({
          verified: profile?.verified || false,
          accountType: profile?.account_type || 'user',
          trustScore: profile?.trust_score || 0,
          loading: false,
          error: null,
        });
      } catch (err) {
        if (!mounted) return;
        setStatus(prev => ({
          ...prev,
          loading: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        }));
      }
    };

    fetchVerificationStatus();

    // Subscribe to verification changes (user_verifications table)
    const subscription = supabase
      .channel(`profile_verification_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_verifications',
          filter: `user_id=eq.${userId}`,
        },
        async (payload) => {
          if (!mounted) return;
          // Refetch verification status when user_verifications changes
          const { data: profile } = await supabase
            .from('users_complete')
            .select('verified, account_type, trust_score')
            .eq('user_id', userId)
            .single();
          
          if (profile) {
            setStatus({
              verified: profile.verified || false,
              accountType: profile.account_type || 'user',
              trustScore: profile.trust_score || 0,
              loading: false,
              error: null,
            });
          }
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [userId]);

  return status;
}

export function useTrustScoreBreakdown(userId: string | undefined) {
  const [breakdown, setBreakdown] = useState<TrustScoreBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setBreakdown(null);
      setLoading(false);
      return;
    }

    let mounted = true;

    const fetchBreakdown = async () => {
      try {
        setLoading(true);
        const result = await VerificationService.getTrustScoreBreakdown(userId);
        
        if (!mounted) return;
        
        setBreakdown(result);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchBreakdown();

    return () => {
      mounted = false;
    };
  }, [userId]);

  return { breakdown, loading, error };
}

