import { supabase } from '@/integrations/supabase/client';
import type { ArtistFollow, ArtistFollowWithDetails, ArtistFollowStats } from '@/types/artistFollow';

/**
 * Service for managing artist follows
 * Similar to UserEventService for event interest
 */
export class ArtistFollowService {
  /**
   * Toggle artist follow status
   * @param userId - The user ID
   * @param artistId - The artist UUID (not jambase_artist_id)
   * @param following - Whether to follow or unfollow
   */
  static async setArtistFollow(
    userId: string,
    artistId: string,
    following: boolean
  ): Promise<void> {
    try {
      // Try RPC function first (preferred method)
      const { error: rpcError } = await (supabase as any).rpc('set_artist_follow', {
        p_artist_id: artistId,
        p_following: following
      });

      // Check if RPC function doesn't exist or has issues (404, function not found, or table not found errors)
      const isRpcNotFound = rpcError && (
        rpcError.code === '42883' || // Function does not exist
        rpcError.code === 'PGRST404' || // PostgREST 404
        rpcError.code === '42P01' || // Table does not exist (error in function)
        rpcError.message?.includes('404') ||
        rpcError.message?.includes('does not exist') ||
        rpcError.message?.includes('function') ||
        rpcError.message?.includes('relation')
      );

      // If RPC function doesn't exist or has table issues, fallback to direct table operations
      if (isRpcNotFound) {
        console.warn('⚠️ RPC function set_artist_follow not available, using direct table operations');
        
        // Validate that the artist exists before following
        if (following) {
          const { data: artistExists, error: checkError } = await supabase
            .from('artists')
            .select('id, name')
            .eq('id', artistId)
            .maybeSingle();

          if (checkError && checkError.code !== 'PGRST116') {
            console.error('Error checking if artist exists:', checkError);
            throw new Error(`Failed to verify artist: ${checkError.message}`);
          }

          if (!artistExists) {
            throw new Error(`Artist with ID ${artistId} does not exist. Please use setArtistFollowByName to create the artist first.`);
          }

          // Insert follow record in artist_follows table (3NF schema)
          const { error: insertError } = await supabase
            .from('artist_follows')
            .insert({
              user_id: userId,
              artist_id: artistId
            });

          // Ignore unique constraint errors (already following)
          if (insertError && insertError.code !== '23505') {
            throw insertError;
          }
        } else {
          // Delete follow record from artist_follows table
          const { error: deleteError } = await supabase
            .from('artist_follows')
            .delete()
            .eq('user_id', userId)
            .eq('artist_id', artistId);

          if (deleteError) throw deleteError;
        }
      } else if (rpcError) {
        // Other RPC errors should be thrown
        throw rpcError;
      }

      console.log(`✅ Artist follow ${following ? 'added' : 'removed'}:`, { userId, artistId });
    } catch (error) {
      console.error('Error setting artist follow:', error);
      throw new Error(`Failed to ${following ? 'follow' : 'unfollow'} artist: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Toggle artist follow status by artist name (creates artist if needed)
   * @param userId - The user UUID
   * @param artistName - The artist name
   * @param jambaseArtistId - Optional JamBase artist ID
   * @param following - Whether to follow (true) or unfollow (false)
   */
  static async setArtistFollowByName(
    userId: string, 
    artistName: string, 
    jambaseArtistId?: string, 
    following: boolean = true
  ): Promise<void> {
    try {
      // First, try to find or create the artist
      let artistId: string | null = null;

      // Validate artist name
      if (!artistName || artistName.trim() === '') {
        throw new Error('Cannot follow artist without a name');
      }

      const trimmedName = artistName.trim();

      // Try to find existing artist by name
      const { data: existingArtist, error: searchError } = await supabase
        .from('artists')
        .select('id, name')
        .ilike('name', trimmedName)
        .limit(1)
        .maybeSingle();

      if (searchError) {
        console.warn('Error searching for existing artist:', searchError);
        // Continue with creating new artist
      }

      if (existingArtist) {
        artistId = existingArtist.id;
        
        // Ensure the artist has a name (in case it was created without one)
        if (!existingArtist.name) {
          const { error: updateError } = await supabase
            .from('artists')
            .update({ name: trimmedName, updated_at: new Date().toISOString() })
            .eq('id', artistId);
          
          if (updateError) {
            console.warn('Failed to update artist name:', updateError);
          } else {
            console.log(`✅ Updated artist name to: ${trimmedName}`);
          }
        }
      } else {
        // Create a new artist entry - MUST have a name
        const { data: newArtist, error: createError } = await supabase
          .from('artists')
          .insert({
            name: trimmedName,
            identifier: jambaseArtistId || `manual:${trimmedName.toLowerCase().replace(/\s+/g, '-')}`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .select('id, name')
          .single();

        if (createError) {
          console.error('Error creating artist:', createError);
          throw createError;
        }
        
        if (!newArtist || !newArtist.name) {
          throw new Error('Failed to create artist - artist was created without a name');
        }
        
        artistId = newArtist.id;
        console.log(`✅ Created artist: ${newArtist.name} (ID: ${artistId})`);
      }

      if (!artistId) {
        throw new Error('Failed to find or create artist');
      }

      // Now follow/unfollow the artist
      await this.setArtistFollow(userId, artistId, following);
    } catch (error) {
      console.error('Error setting artist follow by name:', error);
      throw new Error(`Failed to ${following ? 'follow' : 'unfollow'} artist: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if user is following an artist
   * @param artistId - The artist UUID
   * @param userId - The user UUID
   */
  static async isFollowingArtist(artistId: string, userId: string): Promise<boolean> {
    try {
      // Query artist_follows table directly (3NF schema)
      const { data, error } = await supabase
        .from('artist_follows')
        .select('id')
        .eq('user_id', userId)
        .eq('artist_id', artistId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error checking if following artist:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Error checking if following artist:', error);
      return false;
    }
  }

  /**
   * Get follower count for an artist
   * @param artistId - The artist UUID
   */
  static async getFollowerCount(artistId: string): Promise<number> {
    try {
      // Query artist_follows table directly (3NF schema)
      const { count, error } = await supabase
        .from('artist_follows')
        .select('*', { count: 'exact', head: true })
        .eq('artist_id', artistId);

      if (error) {
        console.error('Error getting follower count:', error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.error('Error getting follower count:', error);
      return 0;
    }
  }

  /**
   * Get artist follow stats (follower count + is following)
   * @param artistId - The artist UUID
   * @param userId - The user UUID (optional)
   */
  static async getArtistFollowStats(artistId: string, userId?: string): Promise<ArtistFollowStats> {
    try {
      const [followerCount, isFollowing] = await Promise.all([
        this.getFollowerCount(artistId),
        userId ? this.isFollowingArtist(artistId, userId) : Promise.resolve(false)
      ]);

      return {
        follower_count: followerCount,
        is_following: isFollowing
      };
    } catch (error) {
      console.error('Error getting artist follow stats:', error);
      return {
        follower_count: 0,
        is_following: false
      };
    }
  }

  /**
   * Get artist follow stats by artist name
   * @param artistName - The artist name
   * @param userId - The user UUID (optional)
   */
  static async getArtistFollowStatsByName(artistName: string, userId?: string): Promise<ArtistFollowStats> {
    try {
      // First try to find the artist
      const { data: artist, error: searchError } = await supabase
        .from('artists')
        .select('id')
        .ilike('name', artistName)
        .limit(1)
        .maybeSingle();

      if (searchError) {
        console.warn('Error searching for artist in getArtistFollowStatsByName:', searchError);
        // Return default stats if search fails
        return {
          follower_count: 0,
          is_following: false
        };
      }

      if (!artist) {
        // Artist doesn't exist, so not following
        return {
          follower_count: 0,
          is_following: false
        };
      }

      // Get stats for the found artist
      return await this.getArtistFollowStats(artist.id, userId);
    } catch (error) {
      console.error('Error getting artist follow stats by name:', error);
      return {
        follower_count: 0,
        is_following: false
      };
    }
  }

  /**
   * Get all artists that a user follows
   * @param userId - The user UUID
   */
  static async getUserFollowedArtists(userId: string): Promise<ArtistFollowWithDetails[]> {
    try {
      console.log('🔍 Getting followed artists for user:', userId);
      
      // Query artist_follows table (3NF schema)
      const { data: follows, error: followsError } = await supabase
        .from('artist_follows')
        .select('id, artist_id, user_id, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      console.log('🔍 ArtistFollowService query result:', {
        followsLength: follows?.length || 0,
        error: followsError,
        firstFollow: follows?.[0]
      });

      if (followsError) {
        console.error('❌ Error fetching artist follows:', followsError);
        console.error('❌ Error details:', JSON.stringify(followsError, null, 2));
        return [];
      }

      if (!follows || follows.length === 0) {
        console.log('⚠️ No artist follows found for user:', userId);
        return [];
      }

      console.log(`✅ Found ${follows.length} artist follows`);

      // Extract artist IDs (from artist_id in 3NF schema)
      const artistIds = follows.map((follow: any) => follow.artist_id).filter(Boolean);
      console.log('Artist IDs to fetch:', artistIds.length);

      if (artistIds.length === 0) {
        return [];
      }

      // Fetch artist details
      const { data: artists, error: artistsError } = await supabase
        .from('artists')
        .select('id, name, image_url, identifier')
        .in('id', artistIds);

      if (artistsError) {
        console.error('Error fetching artist details:', artistsError);
        return [];
      }

      // Create a map of artist_id -> artist data
      const artistsMap = new Map((artists || []).map((a: any) => [a.id, a]));

      // Track missing artist IDs for fallback lookup
      const missingArtistIds: string[] = [];

      // Transform to match expected format
      const result = follows.map((follow: any) => {
        const artist = artistsMap.get(follow.artist_id);
        
        // If artist not found, mark for fallback lookup
        if (!artist) {
          missingArtistIds.push(follow.artist_id);
        }
        
        return {
          id: follow.id,
          user_id: userId,
          artist_id: follow.artist_id,
          created_at: follow.created_at,
          artist_name: artist?.name || null,
          artist_image_url: artist?.image_url || null,
          jambase_artist_id: artist?.identifier || null,
          num_upcoming_events: null,
          genres: null,
          user_name: null,
          user_avatar_url: null
        } as ArtistFollowWithDetails;
      });

      // If we have missing artists, try to find them via multiple sources
      if (missingArtistIds.length > 0) {
        console.warn(`⚠️ Found ${missingArtistIds.length} followed artists not in artists table, attempting fallback lookup...`);
        
        // Try to find artist names from multiple sources
        for (const missingId of missingArtistIds) {
          let foundName: string | null = null;
          
          try {
            // Method 1: Try to find artist name from events table
            const { data: eventData } = await supabase
              .from('events')
              .select('artist_name, artist_id')
              .eq('artist_id', missingId)
              .limit(1)
              .maybeSingle();
            
            if (eventData?.artist_name) {
              foundName = eventData.artist_name;
            }
            
            // Method 2: If not found, try events_with_artist_venue view
            if (!foundName) {
              const { data: viewData } = await supabase
                .from('events_with_artist_venue')
                .select('artist_name_normalized, artist_id')
                .eq('artist_id', missingId)
                .limit(1)
                .maybeSingle();
              
              if (viewData?.artist_name_normalized) {
                foundName = viewData.artist_name_normalized;
              }
            }
            
            // Method 3: Try artists_with_external_ids view (in case artist exists but not in main table)
            if (!foundName) {
              const { data: externalData } = await supabase
                .from('artists_with_external_ids')
                .select('name, id')
                .eq('id', missingId)
                .maybeSingle();
              
              if (externalData?.name) {
                foundName = externalData.name;
              }
            }
            
            // If we found a name, update the result
            if (foundName) {
              const followIndex = result.findIndex(r => r.artist_id === missingId);
              if (followIndex >= 0) {
                result[followIndex].artist_name = foundName;
                console.log(`✅ Found artist name: ${foundName} for ID: ${missingId}`);
                
                // Also try to create/update the artist record so it exists next time
                try {
                  await supabase
                    .from('artists')
                    .upsert({
                      id: missingId,
                      name: foundName,
                      updated_at: new Date().toISOString()
                    }, {
                      onConflict: 'id'
                    });
                  console.log(`✅ Created/updated artist record for: ${foundName}`);
                } catch (upsertError) {
                  console.warn(`⚠️ Failed to upsert artist record:`, upsertError);
                }
              }
            } else {
              console.error(`❌ Could not find artist name for ID: ${missingId} - this follow should be removed`);
            }
          } catch (error) {
            console.warn(`⚠️ Fallback lookup failed for artist ID ${missingId}:`, error);
          }
        }
      }

      // Filter out follows where we still don't have an artist name (orphaned follows)
      const validResults = result.filter(r => r.artist_name !== null && r.artist_name !== '');
      
      if (validResults.length < result.length) {
        const orphanedCount = result.length - validResults.length;
        console.warn(`⚠️ Filtered out ${orphanedCount} follows with missing artist data - these should be cleaned up`);
        
        // Optionally clean up orphaned follows (commented out for safety - uncomment if desired)
        // for (const orphaned of result.filter(r => !r.artist_name || r.artist_name === '')) {
        //   try {
        //     await supabase
        //       .from('artist_follows')
        //       .delete()
        //       .eq('id', orphaned.id);
        //     console.log(`🧹 Cleaned up orphaned follow: ${orphaned.id}`);
        //   } catch (error) {
        //     console.error(`Failed to clean up orphaned follow:`, error);
        //   }
        // }
      }

      console.log('✅ Followed artists fetched:', validResults.length);
      return validResults;
    } catch (error) {
      console.error('Error getting followed artists:', error);
      // Return empty array instead of throwing to prevent blocking the UI
      return [];
    }
  }

  /**
   * Get all users following an artist
   * @param artistId - The artist UUID
   */
  static async getArtistFollowers(artistId: string): Promise<ArtistFollowWithDetails[]> {
    try {
      // Query artist_follows table with artist filter (3NF schema)
      const { data: follows, error: followsError } = await supabase
        .from('artist_follows')
        .select('id, user_id, artist_id, created_at, updated_at')
        .eq('artist_id', artistId)
        .order('created_at', { ascending: false });

      if (followsError) throw followsError;

      if (!follows || follows.length === 0) {
        return [];
      }

      // Fetch user and artist details
      const userIds = follows.map(f => f.user_id);
      const [usersData, artistData] = await Promise.all([
        supabase.from('users').select('user_id, name, avatar_url').in('user_id', userIds),
        supabase.from('artists').select('id, name, image_url, identifier').eq('id', artistId).maybeSingle()
      ]);

      const usersMap = new Map((usersData.data || []).map(u => [u.user_id, u]));

      // Transform to match expected format
      return follows.map(follow => ({
        id: follow.id,
        user_id: follow.user_id,
        artist_id: follow.artist_id,
        created_at: follow.created_at,
        artist_name: artistData.data?.name || null,
        artist_image_url: artistData.data?.image_url || null,
        jambase_artist_id: artistData.data?.identifier || null,
        num_upcoming_events: null,
        genres: null,
        user_name: usersMap.get(follow.user_id)?.name || null,
        user_avatar_url: usersMap.get(follow.user_id)?.avatar_url || null
      } as ArtistFollowWithDetails));
    } catch (error) {
      console.error('Error getting artist followers:', error);
      throw new Error(`Failed to get artist followers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get artist UUID from jambase_artist_id
   * Searches both artists and artist_profile tables
   * @param jambaseArtistId - The JamBase artist ID
   */
  static async getArtistUuidByJambaseId(jambaseArtistId: string): Promise<string | null> {
    try {
      // Use helper function to get UUID from external ID (normalized schema)
      const { data: uuidResult, error: uuidError } = await supabase
        .rpc('get_entity_uuid_by_external_id', {
          p_external_id: jambaseArtistId,
          p_source: 'jambase',
          p_entity_type: 'artist'
        });

      if (!uuidError && uuidResult) {
        return uuidResult;
      }

      // Fallback: try helper view for backward compatibility
      const { data, error } = await supabase
        .from('artists_with_external_ids')
        .select('id')
        .eq('jambase_artist_id', jambaseArtistId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('Artists table query failed:', error);
      } else if (data) {
        return data.id;
      }

      return null;
    } catch (error) {
      console.error('Error getting artist UUID:', error);
      return null;
    }
  }

  /**
   * Get artist UUID from artist name
   * Searches both artists and artist_profile tables
   * @param artistName - The artist name
   */
  static async getArtistUuidByName(artistName: string): Promise<string | null> {
    try {
      // Try artists table first (more reliable, always available)
      let { data, error } = await supabase
        .from('artists')
        .select('id')
        .ilike('name', artistName)
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.warn('Artists table query failed:', error);
      } else if (data) {
        return data.id;
      }

      // Do not query artist_profile in this environment; table may not exist

      return null;
    } catch (error) {
      console.error('Error getting artist UUID by name:', error);
      return null;
    }
  }

  /**
   * Subscribe to artist follow changes for real-time updates
   * @param userId - The user UUID
   * @param onFollowChange - Callback when follow status changes
   */
  static subscribeToArtistFollows(
    userId: string,
    onFollowChange: (follow: ArtistFollow, event: 'INSERT' | 'DELETE') => void
  ) {
    const channel = supabase
      .channel('artist-follows')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'artist_follows',  // Use artist_follows table (3NF schema)
          filter: `user_id=eq.${userId}`
        },
        (payload: any) => {
          // Process artist follow insert
            onFollowChange({
              id: payload.new.id,
              user_id: payload.new.user_id,
            artist_id: payload.new.artist_id
            } as ArtistFollow, 'INSERT');
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'artist_follows',  // Use artist_follows table (3NF schema)
          filter: `user_id=eq.${userId}`
        },
        (payload: any) => {
          // Process artist follow delete
            onFollowChange({
              id: payload.old.id,
              user_id: payload.old.user_id,
            artist_id: payload.old.artist_id
            } as ArtistFollow, 'DELETE');
        }
      )
      .subscribe();

    return channel;
  }
}

