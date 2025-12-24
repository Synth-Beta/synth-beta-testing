import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/types/eventTypes';

export interface TourEvent extends JamBaseEvent {
  latitude: number;
  longitude: number;
  venue_city: string;
  venue_state?: string;
}

export interface TourRoute {
  events: TourEvent[];
  route: Array<{
    from: { lat: number; lng: number; city: string };
    to: { lat: number; lng: number; city: string };
  }>;
}

export interface ArtistGroupChat {
  id: string;
  name: string;
  chat_id?: string;
  event_id?: string;
  member_count?: number;
}

export class TourTrackerService {
  /**
   * Get all upcoming events for an artist
   */
  static async getArtistTourEvents(artistName: string): Promise<TourEvent[]> {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .ilike('artist_name', `%${artistName}%`)
        .gte('event_date', new Date().toISOString())
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .order('event_date', { ascending: true });

      if (error) throw error;

      return (data || []).map(event => ({
        ...event,
        latitude: Number(event.latitude),
        longitude: Number(event.longitude),
        venue_city: event.venue_city || '',
        venue_state: event.venue_state || undefined,
      })) as TourEvent[];
    } catch (error) {
      console.error('Error fetching artist tour events:', error);
      return [];
    }
  }

  /**
   * Calculate tour route with arrows between cities
   */
  static calculateTourRoute(events: TourEvent[]): TourRoute {
    // Sort events by date
    const sortedEvents = [...events].sort((a, b) => {
      const dateA = new Date(a.event_date).getTime();
      const dateB = new Date(b.event_date).getTime();
      return dateA - dateB;
    });

    // Create route segments
    const route: TourRoute['route'] = [];
    for (let i = 0; i < sortedEvents.length - 1; i++) {
      const from = sortedEvents[i];
      const to = sortedEvents[i + 1];
      
      if (from.latitude && from.longitude && to.latitude && to.longitude) {
        route.push({
          from: {
            lat: from.latitude,
            lng: from.longitude,
            city: `${from.venue_city}${from.venue_state ? `, ${from.venue_state}` : ''}`,
          },
          to: {
            lat: to.latitude,
            lng: to.longitude,
            city: `${to.venue_city}${to.venue_state ? `, ${to.venue_state}` : ''}`,
          },
        });
      }
    }

    return {
      events: sortedEvents,
      route,
    };
  }

  /**
   * Get group chats related to an artist
   * Note: event_groups table doesn't exist in 3NF schema, so we'll search chats by name/metadata
   */
  static async getArtistGroupChats(artistName: string, userId: string): Promise<ArtistGroupChat[]> {
    try {
      const chats: ArtistGroupChat[] = [];

      // Search chats by name containing artist name
      const { data: chatsByName, error: chatsError } = await supabase
        .from('chats')
        .select('id, name, metadata')
        .ilike('name', `%${artistName}%`)
        .eq('is_group', true);

      if (!chatsError && chatsByName) {
        for (const chat of chatsByName) {
          // Get member count
          const { count } = await supabase
            .from('chat_members')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', chat.id);

          chats.push({
            id: chat.id,
            name: chat.name || 'Unnamed Chat',
            chat_id: chat.id,
            member_count: count || 0,
          });
        }
      }

      // Also search for events with this artist and try to find related chats
      // (This is a workaround since event_groups doesn't exist)
      const { data: events } = await supabase
        .from('events')
        .select('id, title')
        .ilike('artist_name', `%${artistName}%`)
        .gte('event_date', new Date().toISOString())
        .limit(10);

      if (events) {
        // Search for chats that might mention these events
        for (const event of events) {
          const { data: eventChats } = await supabase
            .from('chats')
            .select('id, name, metadata')
            .ilike('name', `%${event.title}%`)
            .eq('is_group', true);

          if (eventChats) {
            for (const chat of eventChats) {
              // Avoid duplicates
              if (!chats.find(c => c.id === chat.id)) {
                const { count } = await supabase
                  .from('chat_members')
                  .select('*', { count: 'exact', head: true })
                  .eq('chat_id', chat.id);

                chats.push({
                  id: chat.id,
                  name: chat.name || 'Unnamed Chat',
                  chat_id: chat.id,
                  event_id: event.id,
                  member_count: count || 0,
                });
              }
            }
          }
        }
      }

      return chats;
    } catch (error) {
      console.error('Error fetching artist group chats:', error);
      return [];
    }
  }
}

