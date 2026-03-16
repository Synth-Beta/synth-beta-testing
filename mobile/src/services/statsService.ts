import { supabase } from '../integrations/supabase/client';

export interface StreamingStats {
    top_artists: Array<{ name: string; popularity: number }>;
    top_genres: Array<{ genre: string; count: number }>;
    total_listening_hours: number;
}

export class StatsService {
    static async getStats(userId: string): Promise<StreamingStats | null> {
        try {
            const { data, error } = await supabase
                .from('user_streaming_stats')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();

            if (error) throw error;

            if (!data) return { top_artists: [], top_genres: [], total_listening_hours: 0 };

            return {
                top_artists: data.top_artists || [],
                top_genres: data.top_genres || [],
                total_listening_hours: data.total_listening_hours || 0,
            };
        } catch (error) {
            console.error('Error fetching stats:', error);
            return null;
        }
    }
}
