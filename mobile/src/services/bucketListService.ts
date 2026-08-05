import { supabase } from '../integrations/supabase/client';

export interface BucketListItem {
  id: string;
  user_id: string;
  entity_type: 'artist' | 'venue';
  entity_id: string;
  entity_name: string;
  added_at: string;
  rank_order?: number | null;
  metadata?: Record<string, any>;
  // Joined data (optional)
  artist?: {
    id: string;
    name: string;
    image_url?: string;
  };
  venue?: {
    id: string;
    name: string;
    image_url?: string;
  };
}

type EntityRow = {
  id: string;
  entity_type: string;
  entity_uuid: string | null;
};

type NameFallbackResult =
  | { kind: 'artist'; row: { id: string; name: string; image_url?: string | null } }
  | { kind: 'venue'; row: { id: string; name: string; image_url?: string | null } }
  | null;

function toBucketArtist(row: { id: string; name: string; image_url?: string | null }) {
  return {
    id: row.id,
    name: row.name,
    ...(row.image_url != null && row.image_url !== '' ? { image_url: row.image_url } : {}),
  };
}

function toBucketVenue(row: { id: string; name: string; image_url?: string | null }) {
  return {
    id: row.id,
    name: row.name,
    ...(row.image_url != null && row.image_url !== '' ? { image_url: row.image_url } : {}),
  };
}

export class BucketListService {
  /**
   * Get all bucket list items for a user
   */
  static async getBucketList(userId: string): Promise<BucketListItem[]> {
    try {
      let { data, error }: { data: any[] | null; error: any } = await supabase
        .from('bucket_list')
        .select('id, user_id, entity_id, entity_name, added_at, rank_order, metadata')
        .eq('user_id', userId)
        .order('rank_order', { ascending: true, nullsFirst: false })
        .order('added_at', { ascending: true });

      // rank_order migration not applied yet on this environment - fall back gracefully.
      if (error && /rank_order/i.test(error.message || '')) {
        const fallback = await supabase
          .from('bucket_list')
          .select('id, user_id, entity_id, entity_name, added_at, metadata')
          .eq('user_id', userId)
          .order('added_at', { ascending: true });
        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw error;

      const items = (data || []) as Array<{
        id: string;
        user_id: string;
        entity_id: string | null;
        entity_name: string;
        added_at: string;
        rank_order?: number | null;
        metadata?: Record<string, unknown>;
      }>;

      const entityIds = [...new Set(items.map(i => i.entity_id).filter(Boolean))] as string[];

      let entityRows: EntityRow[] = [];
      if (entityIds.length > 0) {
        const { data: ent, error: entErr } = await supabase
          .from('entities')
          .select('id, entity_type, entity_uuid')
          .in('id', entityIds);
        if (entErr) throw entErr;
        entityRows = (ent || []) as EntityRow[];
      }

      const entityById = new Map<string, EntityRow>();
      for (const e of entityRows) {
        entityById.set(e.id, e);
      }

      const uuidSet = new Set<string>();
      for (const e of entityRows) {
        if (e.entity_uuid) uuidSet.add(e.entity_uuid);
      }
      const uuids = [...uuidSet];

      const artistByUuid = new Map<string, { id: string; name: string; image_url?: string | null }>();
      const venueByUuid = new Map<string, { id: string; name: string; image_url?: string | null }>();

      if (uuids.length > 0) {
        const [artRes, venRes] = await Promise.all([
          supabase.from('artists').select('id, name, image_url').in('id', uuids),
          supabase.from('venues').select('id, name, image_url').in('id', uuids),
        ]);
        if (artRes.error) throw artRes.error;
        if (venRes.error) throw venRes.error;
        for (const a of artRes.data || []) {
          artistByUuid.set(a.id, a);
        }
        for (const v of venRes.data || []) {
          venueByUuid.set(v.id, v);
        }
      }

      const nameFallbackCache = new Map<string, Promise<NameFallbackResult>>();

      const resolveByName = (entityName: string): Promise<NameFallbackResult> => {
        const key = entityName.trim();
        const cached = nameFallbackCache.get(key);
        if (cached) return cached;

        const p = (async (): Promise<NameFallbackResult> => {
          const { data: artistByName } = await supabase
            .from('artists')
            .select('id, name, image_url')
            .ilike('name', key)
            .limit(1)
            .maybeSingle();

          if (artistByName) {
            return { kind: 'artist', row: artistByName };
          }

          const { data: venueByName } = await supabase
            .from('venues')
            .select('id, name, image_url')
            .ilike('name', key)
            .limit(1)
            .maybeSingle();

          if (venueByName) {
            return { kind: 'venue', row: venueByName };
          }
          return null;
        })();

        nameFallbackCache.set(key, p);
        return p;
      };

      const enrichedItems = await Promise.all(
        items.map(async item => {
          let entityType: 'artist' | 'venue' | undefined;
          let entityUuid: string | undefined;

          if (item.entity_id) {
            const entity = entityById.get(item.entity_id);
            if (entity) {
              entityType = entity.entity_type as 'artist' | 'venue';
              entityUuid = entity.entity_uuid || undefined;
            }
          }

          if (entityUuid) {
            const artist = artistByUuid.get(entityUuid);
            if (artist) {
              return {
                id: item.id,
                user_id: item.user_id,
                entity_type: 'artist' as const,
                entity_id: entityUuid,
                entity_name: item.entity_name,
                added_at: item.added_at,
            rank_order: item.rank_order ?? null,
                metadata: item.metadata || {},
                artist: toBucketArtist(artist),
              };
            }

            const venue = venueByUuid.get(entityUuid);
            if (venue) {
              return {
                id: item.id,
                user_id: item.user_id,
                entity_type: 'venue' as const,
                entity_id: entityUuid,
                entity_name: item.entity_name,
                added_at: item.added_at,
            rank_order: item.rank_order ?? null,
                metadata: item.metadata || {},
                venue: toBucketVenue(venue),
              };
            }
          }

          if (!entityType) {
            const resolved = await resolveByName(item.entity_name);
            if (resolved?.kind === 'artist') {
              return {
                id: item.id,
                user_id: item.user_id,
                entity_type: 'artist' as const,
                entity_id: resolved.row.id,
                entity_name: item.entity_name,
                added_at: item.added_at,
            rank_order: item.rank_order ?? null,
                metadata: item.metadata || {},
                artist: toBucketArtist(resolved.row),
              };
            }
            if (resolved?.kind === 'venue') {
              return {
                id: item.id,
                user_id: item.user_id,
                entity_type: 'venue' as const,
                entity_id: resolved.row.id,
                entity_name: item.entity_name,
                added_at: item.added_at,
            rank_order: item.rank_order ?? null,
                metadata: item.metadata || {},
                venue: toBucketVenue(resolved.row),
              };
            }
          }

          return {
            id: item.id,
            user_id: item.user_id,
            entity_type: entityType || 'artist',
            entity_id: entityUuid || item.entity_id || '',
            entity_name: item.entity_name,
            added_at: item.added_at,
            rank_order: item.rank_order ?? null,
            metadata: item.metadata || {},
          } as BucketListItem;
        })
      );

      // bucket_list has no DB-level uniqueness on (user_id, entity_id) yet (pending migration),
      // so collapse any duplicate rows here rather than showing the same entity twice.
      const seen = new Set<string>();
      return enrichedItems.filter((item) => {
        const key = item.entity_id || item.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    } catch (error) {
      console.error('Error fetching bucket list:', error);
      return [];
    }
  }

  /**
   * Add an artist to bucket list.
   * Resolves artist UUID to entities.id via get_or_create_entity, then inserts into bucket_list.
   * bucket_list.entity_id is an FK to entities.id (entity_type column was removed in migration).
   */
  static async addArtist(userId: string, artistId: string, artistName: string): Promise<boolean> {
    try {
      if (!artistId) return false;

      const { data: entityId, error: rpcError } = await supabase.rpc('get_or_create_entity', {
        p_entity_type: 'artist',
        p_entity_uuid: artistId,
      });
      if (rpcError) throw rpcError;
      if (!entityId) return false;

      const { error } = await supabase
        .from('bucket_list')
        .insert({
          user_id: userId,
          entity_id: entityId,
          entity_name: artistName,
        });

      if (error) {
        if (error.code === '23505') return true; // already in list
        throw error;
      }
      return true;
    } catch (error) {
      console.error('Error adding artist to bucket list:', error);
      return false;
    }
  }

  /**
   * Add a venue to bucket list.
   * Resolves venue UUID to entities.id via get_or_create_entity, then inserts into bucket_list.
   * bucket_list.entity_id is an FK to entities.id (entity_type column was removed in migration).
   */
  static async addVenue(userId: string, venueId: string, venueName: string): Promise<boolean> {
    try {
      if (!venueId) return false;

      const { data: entityId, error: rpcError } = await supabase.rpc('get_or_create_entity', {
        p_entity_type: 'venue',
        p_entity_uuid: venueId,
      });
      if (rpcError) throw rpcError;
      if (!entityId) return false;

      const { error } = await supabase
        .from('bucket_list')
        .insert({
          user_id: userId,
          entity_id: entityId,
          entity_name: venueName,
        });

      if (error) {
        if (error.code === '23505') return true; // already in list
        throw error;
      }
      return true;
    } catch (error) {
      console.error('Error adding venue to bucket list:', error);
      return false;
    }
  }

  /**
   * Remove an item from bucket list
   */
  static async removeItem(userId: string, itemId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('bucket_list')
        .delete()
        .eq('id', itemId)
        .eq('user_id', userId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error removing item from bucket list:', error);
      return false;
    }
  }

  /**
   * Persist a new priority order for the user's bucket list.
   */
  static async reorderBucketList(userId: string, orderedItemIds: string[]): Promise<boolean> {
    try {
      const updates = orderedItemIds.map((id, idx) =>
        supabase
          .from('bucket_list')
          .update({ rank_order: idx })
          .eq('id', id)
          .eq('user_id', userId)
      );
      const results = await Promise.all(updates);
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;
      return true;
    } catch (error) {
      console.error('Error reordering bucket list:', error);
      return false;
    }
  }

  /**
   * Remove by entity (artist or venue).
   * bucket_list has no entity_type; entity_id is FK to entities.id. Resolve via entities table.
   */
  static async removeEntity(
    userId: string,
    entityType: 'artist' | 'venue',
    entityId: string
  ): Promise<boolean> {
    try {
      const { data: entity } = await supabase
        .from('entities')
        .select('id')
        .eq('entity_type', entityType)
        .eq('entity_uuid', entityId)
        .maybeSingle();
      if (!entity) return true; // nothing to remove

      const { error } = await supabase
        .from('bucket_list')
        .delete()
        .eq('user_id', userId)
        .eq('entity_id', entity.id);
      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error removing entity from bucket list:', error);
      return false;
    }
  }

  /**
   * Check if an entity is in the bucket list.
   * bucket_list has no entity_type; entity_id is FK to entities.id. Resolve via entities table.
   */
  static async isInBucketList(
    userId: string,
    entityType: 'artist' | 'venue',
    entityId: string
  ): Promise<boolean> {
    try {
      const { data: entity, error: entityErr } = await supabase
        .from('entities')
        .select('id')
        .eq('entity_type', entityType)
        .eq('entity_uuid', entityId)
        .maybeSingle();
      if (entityErr || !entity) return false;

      const { data, error } = await supabase
        .from('bucket_list')
        .select('id')
        .eq('user_id', userId)
        .eq('entity_id', entity.id)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return !!data;
    } catch (error) {
      console.error('Error checking bucket list:', error);
      return false;
    }
  }

  /**
   * Search bucket list using PostgreSQL trigram indexes for fast fuzzy search
   */
  static async searchBucketList(
    userId: string,
    searchQuery: string,
    limit: number = 50
  ): Promise<BucketListItem[]> {
    try {
      if (!searchQuery.trim()) {
        // If no search query, return all items
        return await this.getBucketList(userId);
      }

      const { data, error } = await supabase
        .rpc('search_bucket_list', {
          p_user_id: userId,
          p_search_query: searchQuery.trim(),
          p_limit: limit,
        });

      if (error) throw error;

      // Transform RPC result to BucketListItem format
      return (data || []).map((item: any) => ({
        id: item.id,
        user_id: item.user_id,
        entity_type: item.entity_type as 'artist' | 'venue',
        entity_id: item.entity_id,
        entity_name: item.entity_name,
        added_at: item.added_at,
        metadata: item.metadata || {},
        artist: item.artist_id ? {
          id: item.artist_id,
          name: item.artist_name || item.entity_name,
          image_url: item.artist_image_url || undefined,
        } : undefined,
        venue: item.venue_id ? {
          id: item.venue_id,
          name: item.venue_name || item.entity_name,
          image_url: item.venue_image_url || undefined,
        } : undefined,
      }));
    } catch (error) {
      console.error('Error searching bucket list:', error);
      return [];
    }
  }
}

