import { supabase } from '@/integrations/supabase/client';
import {
  getUserArtistAffinity as getUserArtistAffinityShared,
  boostEventsByArtistAffinity,
  type ArtistAffinity,
} from '@synth/shared';

/**
 * Web binding for the shared artist-affinity boost. The logic moved to
 * packages/synth-shared/src/artistAffinity.ts so Expo runs the same ordering — this file
 * only supplies the web Supabase client. Keeping the path means existing imports stay put.
 */
export type { ArtistAffinity };
export { boostEventsByArtistAffinity };

export function getUserArtistAffinity(userId: string): Promise<ArtistAffinity> {
  return getUserArtistAffinityShared(supabase, userId);
}
