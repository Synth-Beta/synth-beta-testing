import {
  fetchPassportUnlockProgress,
  fetchProfileReviewTimeline,
  fetchProfileStatsSummary,
  type PassportUnlockProgress,
  type ProfileReviewTimelineItem,
  type ProfileStatsSummary,
} from '@synth/shared';
import { supabase } from '../integrations/supabase/client';

export type ProfileStats = ProfileStatsSummary;
/** Review-based concert timeline rows (not passport stamp entries). */
export type ProfileTimelineItem = ProfileReviewTimelineItem;

export class PassportService {
  static async getTimeline(userId: string): Promise<ProfileTimelineItem[]> {
    return fetchProfileReviewTimeline(supabase, userId);
  }

  static async getProfileStats(userId: string): Promise<ProfileStats> {
    return fetchProfileStatsSummary(supabase, userId);
  }

  static async getPassportUnlockProgress(userId: string): Promise<PassportUnlockProgress> {
    return fetchPassportUnlockProgress(supabase, userId);
  }
}
