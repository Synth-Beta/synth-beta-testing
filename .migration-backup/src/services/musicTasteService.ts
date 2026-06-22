import { supabase } from '@/integrations/supabase/client';

export interface MusicTasteSummary {
  topArtists: Array<{ name: string; popularity?: number }>;
  topGenres: Array<{ genre: string; count: number }>;
  totalListeningHours?: number;
  description: string;
  serviceType?: 'spotify' | 'apple-music' | 'unknown';
  lastUpdated?: string | null;
}

function normalizeGenre(genre: string): string {
  return genre.trim().toLowerCase();
}

function generateDescription(topArtists: string[], topGenres: string[]): string {
  if (topArtists.length === 0 && topGenres.length === 0) return 'No listening data yet. Connect a streaming service to showcase your music taste.';
  const primary = topArtists.slice(0, 3);
  const genreLine = topGenres.slice(0, 3);
  const vibe = genreLine.length > 0 ? genreLine.join(', ') : 'eclectic vibes';
  if (primary.length > 0) {
    return `Into ${vibe}, with frequent plays of ${primary.join(', ')}.`;
  }
  return `Shows strong ${vibe} tendencies across recent listening.`;
}

export class MusicTasteService {
  static async getUserMusicTaste(userId: string): Promise<MusicTasteSummary> {
    // NOTE: user_streaming_stats_summary table has been removed - skip to fallback
    // 1) Aggregate from user_interactions (fallback)
    try {
      const { data: interactions, error } = await supabase
        .from('interactions')
        .select('event_type, entity_type, entity_id, metadata, occurred_at')
        .eq('user_id', userId)
        .in('event_type', ['music_pref', 'listen'])
        .order('occurred_at', { ascending: false })
        .limit(1000);

      if (error) throw error;

      const artistCounts = new Map<string, { name: string; count: number; popularity?: number }>();
      const genreCounts = new Map<string, number>();

      (interactions || []).forEach(row => {
        const md = (row as any).metadata || {};
        if ((row as any).entity_type === 'artist') {
          const name = String(md.name || 'Unknown Artist');
          const key = name.toLowerCase();
          const prev = artistCounts.get(key) || { name, count: 0, popularity: md.popularity };
          artistCounts.set(key, { name, count: prev.count + 1, popularity: prev.popularity ?? md.popularity });
          const genres: string[] = Array.isArray(md.genres) ? md.genres : [];
          genres.map(normalizeGenre).forEach(g => genreCounts.set(g, (genreCounts.get(g) || 0) + 1));
        }
        if ((row as any).entity_type === 'track') {
          const artistNames: string[] = Array.isArray(md.artistNames) ? md.artistNames : [];
          artistNames.forEach(n => {
            const key = n.toLowerCase();
            const prev = artistCounts.get(key) || { name: n, count: 0 };
            artistCounts.set(key, { name: n, count: prev.count + 1, popularity: prev.popularity });
          });
        }
      });

      const topArtists = Array.from(artistCounts.values())
        .sort((a, b) => (b.count - a.count) || ((b.popularity ?? 0) - (a.popularity ?? 0)))
        .slice(0, 10)
        .map(a => ({ name: a.name, popularity: a.popularity }));

      const topGenres = Array.from(genreCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([genre, count]) => ({ genre, count }));

      const description = generateDescription(topArtists.map(a => a.name), topGenres.map(g => g.genre));

      return {
        topArtists,
        topGenres,
        totalListeningHours: undefined,
        description,
        serviceType: 'unknown',
        lastUpdated: null,
      };
    } catch {
      return {
        topArtists: [],
        topGenres: [],
        description: 'No listening data yet. Connect a streaming service to showcase your music taste.',
        totalListeningHours: undefined,
        serviceType: 'unknown',
        lastUpdated: null,
      };
    }
  }
}

export const musicTasteService = MusicTasteService;


