import { supabase } from '@/integrations/supabase/client';

export interface HolisticUserStats {
  reviewsCount: number;
  interestedEventsCount: number;
  upcomingInterestedCount: number;
  artistsInteractedCount: number;
  venuesInteractedCount: number;
  ticketsClickedCount: number;
  friendsCount: number;
}

export class UserStatsService {
  static async getHolisticStats(userId: string): Promise<HolisticUserStats> {
    const [reviewsCount, interestedCounts, artistsCount, venuesCount, ticketsCount, friendsCount] = await Promise.all([
      this.countReviews(userId),
      this.getInterestedEventCounts(userId),
      this.countInteractions(userId, 'artist'),
      this.countInteractions(userId, 'venue'),
      this.countSpecificClick(userId, 'ticket'),
      this.countFriends(userId)
    ]);

    return {
      reviewsCount,
      interestedEventsCount: interestedCounts.total,
      upcomingInterestedCount: interestedCounts.upcoming,
      artistsInteractedCount: artistsCount,
      venuesInteractedCount: venuesCount,
      ticketsClickedCount: ticketsCount,
      friendsCount
    };
  }

  private static async countReviews(userId: string): Promise<number> {
    const { count } = await supabase
      .from('reviews')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_public', true)
      .eq('is_draft', false);
    return count ?? 0;
  }

  private static async getInterestedEventCounts(userId: string): Promise<{ total: number; upcoming: number }> {
    const totalRes = await supabase
      .from('relationships')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('related_entity_type', 'event')
      .in('relationship_type', ['interest', 'going', 'maybe']);
    const total = totalRes.count ?? 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateStr = today.toISOString();
    const upcomingRes = await supabase
      .from('relationships')
      .select('*, event:events!inner(event_date)', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('related_entity_type', 'event')
      .in('relationship_type', ['interest', 'going', 'maybe'])
      .gte('event.event_date', dateStr);
    const upcoming = upcomingRes.count ?? 0;
    return { total, upcoming };
  }

  private static async countInteractions(userId: string, entityType: string): Promise<number> {
    const { data, error } = await supabase
      .from('interactions')
      .select('entity_id')
      .eq('user_id', userId)
      .eq('entity_type', entityType)
      .in('event_type', ['search', 'click', 'view', 'music_pref', 'listen', 'interest', 'review'])
      .order('occurred_at', { ascending: false })
      .limit(5000);
    if (error) return 0;
    const unique = new Set((data || []).map((d: any) => d.entity_id));
    return unique.size;
  }

  private static async countSpecificClick(userId: string, entityType: string): Promise<number> {
    const { count } = await supabase
      .from('interactions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('event_type', 'click')
      .eq('entity_type', entityType);
    return count ?? 0;
  }

  private static async countFriends(userId: string): Promise<number> {
    const { count } = await supabase
      .from('relationships')
      .select('*', { count: 'exact', head: true })
      .eq('related_entity_type', 'user')
      .eq('relationship_type', 'friend')
      .eq('status', 'accepted')
      .or(`user_id.eq.${userId},related_entity_id.eq.${userId}`);
    return count ?? 0;
  }
}

export const userStatsService = UserStatsService;


