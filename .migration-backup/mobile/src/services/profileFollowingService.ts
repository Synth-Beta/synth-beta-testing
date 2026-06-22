import { supabase } from '../integrations/supabase/client';

export interface FollowedArtistRow {
  id: string;
  artist_id: string;
  artist_name: string | null;
  artist_image_url: string | null;
}

export interface FollowedVenueRow {
  id: string;
  venue_id: string;
  venue_name: string | null;
  venue_street?: string | null;
  venue_state?: string | null;
}

/** Mirrors web `ArtistFollowService.getUserFollowedArtists` (minimal fields for list UI). */
export async function getUserFollowedArtistsForProfile(userId: string): Promise<FollowedArtistRow[]> {
  try {
    const { data: follows, error } = await supabase
      .from('artist_follows')
      .select('id, artist_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !follows?.length) {
      if (error) console.warn('[profileFollowing] artists', error.message);
      return [];
    }

    const artistIds = [...new Set(follows.map((f: { artist_id: string }) => f.artist_id).filter(Boolean))];
    if (artistIds.length === 0) return [];

    const { data: artists, error: artErr } = await supabase
      .from('artists')
      .select('id, name, image_url')
      .in('id', artistIds);

    if (artErr) {
      console.warn('[profileFollowing] artist details', artErr.message);
      return [];
    }

    const map = new Map((artists || []).map((a: any) => [a.id, a]));

    const rows: FollowedArtistRow[] = follows
      .map((f: any) => {
        const a = map.get(f.artist_id);
        const name = a?.name?.trim();
        if (!name) return null;
        return {
          id: f.id,
          artist_id: f.artist_id,
          artist_name: a?.name ?? null,
          artist_image_url: a?.image_url ?? null,
        };
      })
      .filter(Boolean) as FollowedArtistRow[];

    return rows.sort((x, y) =>
      (x.artist_name || '').localeCompare(y.artist_name || '', undefined, { sensitivity: 'base' })
    );
  } catch (e) {
    console.warn('[profileFollowing] getUserFollowedArtistsForProfile', e);
    return [];
  }
}

/** Mirrors web `VenueFollowService.getUserFollowedVenues` (minimal fields for list UI). */
export async function getUserFollowedVenuesForProfile(userId: string): Promise<FollowedVenueRow[]> {
  try {
    const { data: follows, error } = await supabase
      .from('user_venue_relationships')
      .select('id, venue_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error || !follows?.length) {
      if (error) console.warn('[profileFollowing] venues', error.message);
      return [];
    }

    const venueIds = [...new Set(follows.map((f: { venue_id: string }) => f.venue_id).filter(Boolean))];
    if (venueIds.length === 0) return [];

    const { data: venues, error: vErr } = await supabase
      .from('venues')
      .select('id, name, street_address, state')
      .in('id', venueIds);

    if (vErr) {
      console.warn('[profileFollowing] venue details', vErr.message);
      return [];
    }

    const map = new Map((venues || []).map((v: any) => [v.id, v]));

    const rows: FollowedVenueRow[] = follows
      .map((f: any) => {
        const v = map.get(f.venue_id);
        return {
          id: f.id,
          venue_id: f.venue_id,
          venue_name: v?.name ?? null,
          venue_street: v?.street_address ?? null,
          venue_state: v?.state ?? null,
        };
      })
      .filter((r) => (r.venue_name || '').trim() !== '') as FollowedVenueRow[];

    return rows.sort((x, y) =>
      (x.venue_name || '').localeCompare(y.venue_name || '', undefined, { sensitivity: 'base' })
    );
  } catch (e) {
    console.warn('[profileFollowing] getUserFollowedVenuesForProfile', e);
    return [];
  }
}
