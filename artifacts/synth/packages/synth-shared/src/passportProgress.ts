/**
 * Passport stamps from `passport_entries` — same query web ProfileView / PassportModal use.
 */
import type { SynthSupabaseClient } from './supabaseClientType';

export interface PassportUnlockEntry {
  id: string;
  user_id: string;
  type:
    | 'city'
    | 'venue'
    | 'artist'
    | 'scene'
    | 'era'
    | 'festival'
    | 'artist_milestone';
  entity_id: string | null;
  entity_uuid: string | null;
  entity_name: string;
  unlocked_at: string;
  metadata: Record<string, any>;
  rarity?: 'common' | 'uncommon' | 'legendary';
  cultural_context?: string;
}

export interface PassportUnlockProgress {
  cities: PassportUnlockEntry[];
  venues: PassportUnlockEntry[];
  artists: PassportUnlockEntry[];
  scenes: PassportUnlockEntry[];
  totalCount: number;
}

export async function fetchPassportUnlockProgress(
  client: SynthSupabaseClient,
  userId: string
): Promise<PassportUnlockProgress> {
  try {
    const { data, error } = await client
      .from('passport_entries')
      .select('*')
      .eq('user_id', userId)
      .order('unlocked_at', { ascending: false });

    if (error) throw error;

    const entries = (data || []) as PassportUnlockEntry[];

    return {
      cities: entries.filter(e => e.type === 'city'),
      venues: entries.filter(e => e.type === 'venue'),
      artists: entries.filter(e => e.type === 'artist'),
      scenes: entries.filter(e => e.type === 'scene'),
      totalCount: entries.length,
    };
  } catch (error) {
    console.error('[synth-shared] fetchPassportUnlockProgress:', error);
    return {
      cities: [],
      venues: [],
      artists: [],
      scenes: [],
      totalCount: 0,
    };
  }
}
