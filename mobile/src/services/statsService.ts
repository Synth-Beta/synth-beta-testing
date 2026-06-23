import { fetchUserStreamingStatsSnapshot, type UserStreamingStatsSnapshot } from '@synth/shared';
import { supabase } from '../integrations/supabase/client';

export type StreamingStats = UserStreamingStatsSnapshot;

export class StatsService {
  static async getStats(userId: string): Promise<StreamingStats | null> {
    return fetchUserStreamingStatsSnapshot(supabase, userId);
  }
}
