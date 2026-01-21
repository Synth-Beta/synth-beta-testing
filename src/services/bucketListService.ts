import { supabase } from '@/integrations/supabase/client';

export interface BucketListItem {
  id: string;
  user_id: string;
  entity_type: 'artist' | 'venue';
  entity_id: string;
  entity_name: string;
  added_at: string;
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

export class BucketListService {
  /**
   * Get all bucket list items for a user
   */
  static async getBucketList(userId: string): Promise<BucketListItem[]> {
    try {
      // Query bucket_list - entity_name has everything we need
      const { data, error } = await supabase
        .from('bucket_list')
        .select('id, user_id, entity_id, entity_name, added_at, metadata')
        .eq('user_id', userId)
        .order('added_at', { ascending: false });

      if (error) throw error;

      // Enrich with entity_type from entities table and artist/venue details
      const enrichedItems = await Promise.all(
        (data || []).map(async (item: any) => {
          // Get entity_type from entities table for display
          let entityType: 'artist' | 'venue' | undefined;
          let entityUuid: string | undefined;
          
          if (item.entity_id) {
            const { data: entity } = await supabase
              .from('entities')
              .select('entity_type, entity_uuid')
              .eq('id', item.entity_id)
              .single();
            
            if (entity) {
              entityType = entity.entity_type as 'artist' | 'venue';
              entityUuid = entity.entity_uuid || undefined;
            }
          }
          
          // Always try to fetch artist/venue data with image_url when we have entityUuid
          if (entityUuid) {
            // Try artist first
            const { data: artist } = await supabase
              .from('artists')
              .select('id, name, image_url')
              .eq('id', entityUuid)
              .maybeSingle();
            
            if (artist) {
              return {
                id: item.id,
                user_id: item.user_id,
                entity_type: 'artist',
                entity_id: entityUuid,
                entity_name: item.entity_name,
                added_at: item.added_at,
                metadata: item.metadata || {},
                artist: artist,
              } as BucketListItem;
            }
            
            // Try venue if not an artist
            const { data: venue } = await supabase
              .from('venues')
              .select('id, name, image_url')
              .eq('id', entityUuid)
              .maybeSingle();
            
            if (venue) {
              return {
                id: item.id,
                user_id: item.user_id,
                entity_type: 'venue',
                entity_id: entityUuid,
                entity_name: item.entity_name,
                added_at: item.added_at,
                metadata: item.metadata || {},
                venue: venue,
              } as BucketListItem;
            }
          }
          
          // Fallback: If we couldn't get entity_type from entities, try to determine from artists/venues by name
          if (!entityType) {
            const { data: artistByName } = await supabase
              .from('artists')
              .select('id, name, image_url')
              .ilike('name', item.entity_name)
              .limit(1)
              .maybeSingle();
            
            if (artistByName) {
              return {
                id: item.id,
                user_id: item.user_id,
                entity_type: 'artist',
                entity_id: artistByName.id,
                entity_name: item.entity_name,
                added_at: item.added_at,
                metadata: item.metadata || {},
                artist: artistByName,
              } as BucketListItem;
            }
            
            const { data: venueByName } = await supabase
              .from('venues')
              .select('id, name, image_url')
              .ilike('name', item.entity_name)
              .limit(1)
              .maybeSingle();
            
            if (venueByName) {
              return {
                id: item.id,
                user_id: item.user_id,
                entity_type: 'venue',
                entity_id: venueByName.id,
                entity_name: item.entity_name,
                added_at: item.added_at,
                metadata: item.metadata || {},
                venue: venueByName,
              } as BucketListItem;
            }
          }
          
          // Return with entity_name - fallback if we can't find artist/venue
          return {
            id: item.id,
            user_id: item.user_id,
            entity_type: entityType || 'artist', // Default for display
            entity_id: entityUuid || item.entity_id,
            entity_name: item.entity_name,
            added_at: item.added_at,
            metadata: item.metadata || {},
          } as BucketListItem;
        })
      );

      return enrichedItems;
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

