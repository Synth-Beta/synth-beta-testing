import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { cacheService, CacheKeys, CacheTTL } from '@/services/cacheService';
import { logger } from '@/utils/logger';

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
      
      // Check cache first
      const cacheKey = CacheKeys.userProfile(user.id);
      const cached = cacheService.get<AccountInfo>(cacheKey);
      if (cached) {
        setAccountInfo(cached);
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabase
        .from('users')
        .select('account_type, subscription_tier, verified, verification_level, business_info')
        .eq('user_id', user.id)
        .single();

      if (fetchError) {
        logger.error('❌ useAccountType: Error fetching account info:', fetchError);
        setError(fetchError.message);
        // Default to 'user' if there's an error
        const defaultAccountInfo = {
          account_type: 'user',
          subscription_tier: 'free',
          verified: false,
          verification_level: 'none',
        };
        setAccountInfo(defaultAccountInfo);
      } else {
        const processedAccountInfo = {
          account_type: data.account_type || 'user',
          subscription_tier: data.subscription_tier || 'free',
          verified: data.verified || false,
          verification_level: data.verification_level || 'none',
          business_info: data.business_info,
        };
        setAccountInfo(processedAccountInfo);
        
        // Cache the result
        cacheService.set(cacheKey, processedAccountInfo, CacheTTL.USER_PROFILE);
      }
    } catch (err) {
      logger.error('❌ useAccountType: Error in fetchAccountInfo:', err);
      setError('Failed to fetch account information');
      // Default to 'user' if there's an error
      const defaultAccountInfo = {
        account_type: 'user',
        subscription_tier: 'free',
        verified: false,
        verification_level: 'none',
      };
      setAccountInfo(defaultAccountInfo);
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
