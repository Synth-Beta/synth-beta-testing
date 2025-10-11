import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type AccountType = 'user' | 'creator' | 'business' | 'admin';

export interface AccountInfo {
  account_type: AccountType;
  subscription_tier: 'free' | 'premium' | 'professional' | 'enterprise';
  verified: boolean;
  verification_level: 'none' | 'email' | 'phone' | 'identity' | 'business';
  business_info?: any;
}

export function useAccountType() {
  const { user } = useAuth();
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setAccountInfo(null);
      setLoading(false);
      return;
    }

    fetchAccountInfo();
  }, [user]);

  const fetchAccountInfo = async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('account_type, subscription_tier, verified, verification_level, business_info')
        .eq('user_id', user.id)
        .single();

      if (fetchError) {
        console.error('Error fetching account info:', fetchError);
        setError(fetchError.message);
        // Default to 'user' if there's an error
        setAccountInfo({
          account_type: 'user',
          subscription_tier: 'free',
          verified: false,
          verification_level: 'none',
        });
      } else {
        setAccountInfo({
          account_type: data.account_type || 'user',
          subscription_tier: data.subscription_tier || 'free',
          verified: data.verified || false,
          verification_level: data.verification_level || 'none',
          business_info: data.business_info,
        });
      }
    } catch (err) {
      console.error('Error in fetchAccountInfo:', err);
      setError('Failed to fetch account information');
      // Default to 'user' if there's an error
      setAccountInfo({
        account_type: 'user',
        subscription_tier: 'free',
        verified: false,
        verification_level: 'none',
      });
    } finally {
      setLoading(false);
    }
  };

  const hasAnalyticsAccess = () => {
    if (!accountInfo) return false;
    return ['creator', 'business', 'admin'].includes(accountInfo.account_type);
  };

  const isAdmin = () => {
    return accountInfo?.account_type === 'admin';
  };

  const isCreator = () => {
    return accountInfo?.account_type === 'creator';
  };

  const isBusiness = () => {
    return accountInfo?.account_type === 'business';
  };

  const isRegularUser = () => {
    return accountInfo?.account_type === 'user';
  };

  const hasPremiumFeatures = () => {
    if (!accountInfo) return false;
    return ['premium', 'professional', 'enterprise'].includes(accountInfo.subscription_tier);
  };

  const getAnalyticsDashboardRoute = () => {
    if (!accountInfo) return null;
    
    switch (accountInfo.account_type) {
      case 'creator':
        return '/analytics/creator';
      case 'business':
        return '/analytics/business';
      case 'admin':
        return '/analytics/admin';
      default:
        return null;
    }
  };

  return {
    accountInfo,
    loading,
    error,
    hasAnalyticsAccess,
    isAdmin,
    isCreator,
    isBusiness,
    isRegularUser,
    hasPremiumFeatures,
    getAnalyticsDashboardRoute,
    refetch: fetchAccountInfo,
  };
}
