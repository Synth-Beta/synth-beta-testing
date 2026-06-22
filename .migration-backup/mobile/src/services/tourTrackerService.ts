import { supabase } from '../integrations/supabase/client';

export interface TourEvent {
    id: string;
    title?: string | null;
    event_date: string;
    venue_name?: string | null;
    venue_city: string;
    venue_state?: string | null;
    latitude: number;
    longitude: number;
    artist_id?: string | null;
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

function hasLngLat(lat: number, lng: number): boolean {
    return Number.isFinite(lat) && Number.isFinite(lng);
}

export class TourTrackerService {
    static async getArtistTourEvents(artistId: string): Promise<TourEvent[]> {
        try {
            const { data: artist, error: artistError } = await supabase
                .from('artists')
                .select('id, name, identifier')
                .eq('id', artistId)
                .single();

            if (artistError || !artist) {
                return [];
            }

            const { data, error } = await supabase
                .from('events')
                .select('*, venues(name)')
                .eq('artist_id', artist.id)
                .gte('event_date', new Date().toISOString())
                .not('latitude', 'is', null)
                .not('longitude', 'is', null)
                .order('event_date', { ascending: true });

            if (error) {
                throw error;
            }

            return (data || []).map((event: Record<string, unknown> & { venues?: { name?: string } }) => ({
                ...event,
                latitude: Number(event.latitude),
                longitude: Number(event.longitude),
                venue_city: String(event.venue_city ?? ''),
                venue_state: event.venue_state != null ? String(event.venue_state) : undefined,
                venue_name: event.venues?.name || event.venue_name || '',
            })) as TourEvent[];
        } catch {
            return [];
        }
    }

    static calculateTourRoute(events: TourEvent[]): TourRoute {
        const sortedEvents = [...events].sort((a, b) => {
            const dateA = new Date(a.event_date).getTime();
            const dateB = new Date(b.event_date).getTime();
            return dateA - dateB;
        });

        const route: TourRoute['route'] = [];
        for (let i = 0; i < sortedEvents.length - 1; i++) {
            const from = sortedEvents[i];
            const to = sortedEvents[i + 1];

            if (
                hasLngLat(from.latitude, from.longitude) &&
                hasLngLat(to.latitude, to.longitude)
            ) {
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

    static async getArtistGroupChats(artistId: string, _userId: string): Promise<ArtistGroupChat[]> {
        try {
            const chats: ArtistGroupChat[] = [];

            const { data: artist } = await supabase
                .from('artists')
                .select('id, name, identifier')
                .eq('id', artistId)
                .single();

            if (!artist) {
                return [];
            }

            const artistName = artist.name;

            const { data: chatsByName, error: chatsError } = await supabase
                .from('chats')
                .select('id, chat_name, users')
                .ilike('chat_name', `%${artistName}%`)
                .eq('is_group_chat', true);

            if (!chatsError && chatsByName) {
                for (const chat of chatsByName) {
                    const memberCount = Array.isArray(chat.users) ? chat.users.length : 0;

                    chats.push({
                        id: chat.id,
                        name: chat.chat_name || 'Unnamed Chat',
                        chat_id: chat.id,
                        member_count: memberCount,
                    });
                }
            }

            const { data: events } = await supabase
                .from('events')
                .select('id, title')
                .eq('artist_id', artist.id)
                .gte('event_date', new Date().toISOString())
                .limit(10);

            if (events) {
                for (const event of events) {
                    const { data: eventChats } = await supabase
                        .from('chats')
                        .select('id, chat_name, users')
                        .ilike('chat_name', `%${event.title}%`)
                        .eq('is_group_chat', true);

                    if (eventChats) {
                        for (const chat of eventChats) {
                            if (!chats.find(c => c.id === chat.id)) {
                                const memberCount = Array.isArray(chat.users) ? chat.users.length : 0;

                                chats.push({
                                    id: chat.id,
                                    name: chat.chat_name || 'Unnamed Chat',
                                    chat_id: chat.id,
                                    event_id: event.id,
                                    member_count: memberCount,
                                });
                            }
                        }
                    }
                }
            }

            return chats;
        } catch {
            return [];
        }
    }
}
