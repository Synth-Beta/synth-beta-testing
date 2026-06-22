import { supabase } from '@/integrations/supabase/client';
import { PersonalizedFeedService } from '@/services/personalizedFeedService';

export interface PreferenceDebugSnapshot {
  signalsByType: Record<string, number>;
  totalSignals: number;
  userPreferencesRow: {
    hasRow: boolean;
    last_signal_at?: string | null;
    signal_count?: number | null;
    top_genres?: string[];
    top_artists?: string[];
  };
  hasMusicDataFlag: boolean;
}

/**
 * Lightweight debugging helper for understanding why personalization
 * may not be using user preferences for a given user.
 *
 * This is intended for partners and internal tooling, not end users.
 */
export class PreferencesDebugService {
  static async getSnapshotForUser(userId: string): Promise<PreferenceDebugSnapshot> {
    // 1) Raw signals
    let signalsByType: Record<string, number> = {};
    let totalSignals = 0;

    try {
      const { data, error } = await supabase
        .from('user_preference_signals')
        .select('signal_type')
        .eq('user_id', userId);

      if (error) {
        console.warn('PreferencesDebugService: error loading user_preference_signals:', error);
      } else if (Array.isArray(data)) {
        signalsByType = data.reduce<Record<string, number>>((acc, row: any) => {
          const type = String(row.signal_type ?? 'unknown');
          acc[type] = (acc[type] || 0) + 1;
          return acc;
        }, {});
        totalSignals = data.length;
      }
    } catch (err) {
      console.warn('PreferencesDebugService: unexpected error loading signals:', err);
    }

    // 2) Aggregated preferences row
    let userPreferencesRow: PreferenceDebugSnapshot['userPreferencesRow'] = {
      hasRow: false,
      last_signal_at: undefined,
      signal_count: undefined,
      top_genres: [],
      top_artists: [],
    };

    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select(
          'genre_preference_scores, artist_preference_scores, top_genres, top_artists, last_signal_at, signal_count'
        )
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('PreferencesDebugService: error loading user_preferences row:', error);
      } else if (data) {
        userPreferencesRow = {
          hasRow: true,
          last_signal_at: (data as any).last_signal_at ?? null,
          signal_count: (data as any).signal_count ?? null,
          top_genres: ((data as any).top_genres as string[] | null) ?? [],
          top_artists: ((data as any).top_artists as string[] | null) ?? [],
        };
      }
    } catch (err) {
      console.warn('PreferencesDebugService: unexpected error loading user_preferences row:', err);
    }

    // 3) What the personalization engine thinks (guards like userHasMusicData)
    let hasMusicDataFlag = false;
    try {
      hasMusicDataFlag = await PersonalizedFeedService.userHasMusicData(userId);
    } catch (err) {
      console.warn('PreferencesDebugService: error calling userHasMusicData:', err);
    }

    return {
      signalsByType,
      totalSignals,
      userPreferencesRow,
      hasMusicDataFlag,
    };
  }
}

