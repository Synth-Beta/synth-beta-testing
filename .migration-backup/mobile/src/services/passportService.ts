import {
  fetchPassportUnlockProgress,
  fetchProfileReviewTimeline,
  fetchProfileStatsSummary,
  type PassportUnlockEntry,
  type PassportUnlockProgress,
  type ProfileReviewTimelineItem,
  type ProfileStatsSummary,
} from '@synth/shared';
import { supabase } from '../integrations/supabase/client';
import { todayLocalYmd } from '../utils/localYmd';

export type ProfileStats = ProfileStatsSummary;
/** Review-based concert timeline rows (not passport stamp entries). */
export type ProfileTimelineItem = ProfileReviewTimelineItem;
export type PassportEntry = PassportUnlockEntry;

export interface NextToUnlock {
  type: 'city' | 'venue' | 'artist' | 'scene';
  entity_name: string;
  hint: string;
  progress?: number;
  goal?: number;
}

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

  /** Full stamp rows from `passport_entries` (same as web `getStampsByRarity`). */
  static async getStampsByRarity(
    userId: string,
    rarity?: 'common' | 'uncommon' | 'legendary'
  ): Promise<PassportEntry[]> {
    try {
      let query = supabase
        .from('passport_entries')
        .select('*')
        .eq('user_id', userId)
        .order('unlocked_at', { ascending: false });

      if (rarity) {
        query = query.eq('rarity', rarity);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as PassportEntry[];
    } catch (e) {
      console.warn('[PassportService] getStampsByRarity', e);
      return [];
    }
  }

  /** Suggested next unlocks (same logic as web PassportService.getNextToUnlock). */
  static async getNextToUnlock(userId: string): Promise<NextToUnlock[]> {
    try {
      const hints: NextToUnlock[] = [];
      const progress = await this.getPassportUnlockProgress(userId);

      const { data: userProfile } = await supabase
        .from('users')
        .select('location_city, location_state')
        .eq('user_id', userId)
        .single();

      if (userProfile?.location_city) {
        const visitedCities = new Set(
          progress.cities.map(c => (c.entity_id || '').toLowerCase()).filter(Boolean)
        );
        const userCityId = `${userProfile.location_city.toLowerCase()}_${(userProfile.location_state || '').toLowerCase()}`;

        if (!visitedCities.has(userCityId)) {
          hints.push({
            type: 'city',
            entity_name: userProfile.location_city,
            hint: `Review an event in ${userProfile.location_city} to unlock this city`,
            progress: progress.cities.length,
            goal: progress.cities.length + 1,
          });
        }
      }

      const { data: upcomingEvents } = await supabase
        .from('events')
        .select('artist_id, artists!inner(name)')
        .gte('event_date', todayLocalYmd())
        .not('artist_id', 'is', null)
        .limit(10);

      if (upcomingEvents?.length) {
        const seenArtists = new Set(progress.artists.map(a => a.entity_id).filter(Boolean));
        const unseenArtist = upcomingEvents.find(e => {
          const artistId = e.artist_id as string | null | undefined;
          return Boolean(artistId && !seenArtists.has(artistId));
        });

        if (unseenArtist) {
          const raw = unseenArtist.artists as { name?: string } | { name?: string }[] | null | undefined;
          const artistName =
            Array.isArray(raw) ? raw[0]?.name : raw?.name;
          const resolvedName = artistName || 'Unknown Artist';
          hints.push({
            type: 'artist',
            entity_name: resolvedName,
            hint: `Attend a show by ${resolvedName} to unlock this artist`,
            progress: progress.artists.length,
            goal: progress.artists.length + 1,
          });
        }
      }

      return hints.slice(0, 3);
    } catch (e) {
      console.warn('[PassportService] getNextToUnlock', e);
      return [];
    }
  }
}
