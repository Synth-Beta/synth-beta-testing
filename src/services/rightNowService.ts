import { supabase } from '@/integrations/supabase/client';
import { HomeFeedService, type TrendingEvent } from './homeFeedService';
import type { JamBaseEvent } from '@/types/eventTypes';

export interface RightNowEvent extends JamBaseEvent {
  socialProofCount?: number;
  reasonLabel?: string;
}

export interface RightNowData {
  trending: RightNowEvent[];
  justAnnounced: RightNowEvent[];
  friendsSaving: RightNowEvent[];
}

export class RightNowService {
  /**
   * Get trending events near user's location
   */
  static async getTrendingNearYou(
    userId: string,
    latitude?: number,
    longitude?: number,
    limit: number = 12
  ): Promise<RightNowEvent[]> {
    try {
      // Get user's location if not provided
      if (!latitude || !longitude) {
        const { data: userProfile } = await supabase
          .from('users')
          .select('latitude, longitude, location_city')
          .eq('user_id', userId)
          .single();

        if (userProfile?.latitude && userProfile?.longitude) {
          latitude = userProfile.latitude;
          longitude = userProfile.longitude;
        } else if (userProfile?.location_city) {
          // Try to get coordinates from city
          const { RadiusSearchService } = await import('./radiusSearchService');
          const coords = await RadiusSearchService.getCityCoordinates(userProfile.location_city);
          if (coords) {
            latitude = coords.lat;
            longitude = coords.lng;
          }
        }
      }

      if (!latitude || !longitude) {
        // Fallback: get trending events without location
        const trending = await HomeFeedService.getTrendingEvents(userId, undefined, undefined, 50, limit);
        return trending.map(e => ({
          ...e,
          id: e.event_id, // Map event_id to id for JamBaseEvent compatibility
          socialProofCount: e.save_velocity || e.attendance_markings || 0,
          reasonLabel: e.trending_label || `${e.save_velocity || 0} people saved this`,
        })) as RightNowEvent[];
      }

      const trending = await HomeFeedService.getTrendingEvents(userId, latitude, longitude, 50, limit);
      
      return trending.map(e => ({
        ...e,
        id: e.event_id, // Map event_id to id for JamBaseEvent compatibility
        socialProofCount: e.save_velocity || e.attendance_markings || 0,
        reasonLabel: e.trending_label || `${e.save_velocity || 0} people saved this`,
      })) as RightNowEvent[];
    } catch (error) {
      console.error('Error getting trending near you:', error);
      return [];
    }
  }

  /**
   * Get just announced events (created in last 7 days)
   */
  static async getJustAnnounced(limit: number = 12): Promise<RightNowEvent[]> {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: events } = await supabase
        .from('events')
        .select('*')
        .gte('event_date', new Date().toISOString())
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(limit);

      return (events || []).map(e => ({
        ...e,
        socialProofCount: 0,
        reasonLabel: 'Just announced',
      })) as RightNowEvent[];
    } catch (error) {
      console.error('Error getting just announced:', error);
      return [];
    }
  }

  /**
   * Get events friends are saving (aggregate interest counts)
   */
  static async getFriendsSaving(userId: string, limit: number = 12): Promise<RightNowEvent[]> {
    try {
      // Get user's friends
      const { data: friends } = await supabase.rpc('get_first_degree_connections', {
        target_user_id: userId,
      });

      if (!friends || friends.length === 0) {
        return [];
      }

      const friendIds = friends.map((f: any) => f.connected_user_id);

      // Get events where friends are interested
      const { data: relationships } = await supabase
        .from('user_event_relationships')
        .select('event_id, user_id')
        .in('user_id', friendIds)
        .eq('relationship_type', 'interested')
        .order('created_at', { ascending: false })
        .limit(limit * 2);

      if (!relationships || relationships.length === 0) {
        return [];
      }

      // Count interest per event
      const eventInterestCounts = new Map<string, number>();
      relationships.forEach((rel: any) => {
        eventInterestCounts.set(rel.event_id, (eventInterestCounts.get(rel.event_id) || 0) + 1);
      });

      // Get event details
      const eventIds = Array.from(eventInterestCounts.keys()).slice(0, limit);
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .in('id', eventIds)
        .gte('event_date', new Date().toISOString())
        .order('event_date', { ascending: true });

      // Map events with interest counts
      return (events || []).map(e => {
        const count = eventInterestCounts.get(e.id) || 0;
        return {
          ...e,
          socialProofCount: count,
          reasonLabel: count === 1 ? '1 friend saved this' : `${count} friends saved this`,
        };
      }) as RightNowEvent[];
    } catch (error) {
      console.error('Error getting friends saving:', error);
      return [];
    }
  }

  /**
   * Get all Right Now data
   */
  static async getAllRightNowData(
    userId: string,
    latitude?: number,
    longitude?: number
  ): Promise<RightNowData> {
    const [trending, justAnnounced, friendsSaving] = await Promise.all([
      this.getTrendingNearYou(userId, latitude, longitude, 12),
      this.getJustAnnounced(12),
      this.getFriendsSaving(userId, 12),
    ]);

    return {
      trending,
      justAnnounced,
      friendsSaving,
    };
  }
}

