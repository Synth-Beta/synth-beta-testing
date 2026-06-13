import { getStreamingLinkStatus as getStreamingLinkStatusShared } from '@synth/shared';
import type { StreamingLinkStatus, StreamingProvider } from '@synth/shared';
import { supabase } from '@/integrations/supabase/client';

export type { StreamingLinkStatus, StreamingProvider };

export async function getStreamingLinkStatus(userId: string): Promise<StreamingLinkStatus> {
  return getStreamingLinkStatusShared(supabase, userId);
}

export async function isStreamingLinked(userId: string): Promise<boolean> {
  const status = await getStreamingLinkStatus(userId);
  return status.linked;
}
