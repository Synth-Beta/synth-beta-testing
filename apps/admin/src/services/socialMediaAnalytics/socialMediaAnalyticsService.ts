import { supabase } from '@/integrations/supabase/client';
import type {
  SocialAnalyticsPayload,
  SocialAnalyticsResponse,
} from '@/services/socialMediaAnalytics/types';

const FUNCTION_NAME = 'instagram-analytics';

interface EdgeFunctionResponse {
  data?: SocialAnalyticsPayload;
  fallback?: boolean;
  message?: string;
  warnings?: string[];
}

export const fetchInstagramSocialMediaAnalytics = async (): Promise<SocialAnalyticsResponse> => {
  const { data: payload, error } =
    await supabase.functions.invoke<EdgeFunctionResponse>(
      FUNCTION_NAME
    );

  if (error) {
    throw new Error(error.message);
  }

  if (!payload?.data) {
    throw new Error(
      'Instagram analytics function returned an empty payload.'
    );
  }

  return {
    data: payload.data,
    warning: payload.fallback
      ? payload.message ??
        'Instagram analytics is not configured yet.'
      : undefined,
    usedFallback: payload.fallback ?? false,
    warnings: payload.warnings ?? [],
  };
}; 