import { supabase } from '@/integrations/supabase/client';

export interface MusicTag {
  id: string;
  user_id: string;
  tag_type: 'genre' | 'artist';
  tag_value: string;
  tag_source: 'manual' | 'spotify';
  weight: number;
  created_at: string;
  updated_at: string;
}

export interface MusicTagInput {
  tag_type: 'genre' | 'artist';
  tag_value: string;
  tag_source?: 'manual' | 'spotify';
  weight?: number;
}

export class MusicTagsService {
  /**
   * Get all music tags for a user from user_preferences table
   */
  static async getUserMusicTags(userId: string): Promise<MusicTag[]> {
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('preferred_genres, preferred_artists, music_preference_signals')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      if (!data) return [];

      // Convert genres array to MusicTag format
      const genres = (data.preferred_genres || []).map((genre: string) => ({
        id: `${userId}-genre-${genre}`,
        user_id: userId,
        tag_type: 'genre' as const,
        tag_value: genre,
        tag_source: 'manual' as const,
        weight: 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // Convert artist UUIDs to names (preferred_artists is UUID[] not TEXT[])
      const artistUuids = data.preferred_artists || [];
      let artists: MusicTag[] = [];
      
      if (artistUuids.length > 0) {
        const { data: artistData } = await supabase
          .from('artists')
          .select('id, name')
          .in('id', artistUuids);
        
        if (artistData) {
          artists = artistData.map((artist: any) => ({
            id: `${userId}-artist-${artist.id}`,
            user_id: userId,
            tag_type: 'artist' as const,
            tag_value: artist.name, // Return name for backwards compatibility
            tag_source: 'manual' as const,
            weight: 5,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }));
        }
      }

      return [...genres, ...artists];
    } catch (error) {
      console.error('Error fetching user music tags:', error);
      return [];
    }
  }

  /**
   * Get music tags by type
   */
  static async getUserMusicTagsByType(
    userId: string,
    tagType: 'genre' | 'artist'
  ): Promise<MusicTag[]> {
    try {
      const allTags = await this.getUserMusicTags(userId);
      return allTags.filter(tag => tag.tag_type === tagType);
    } catch (error) {
      console.error(`Error fetching ${tagType} tags:`, error);
      return [];
    }
  }

  /**
   * Add a single music tag
   */
  static async addMusicTag(
    userId: string,
    tagInput: MusicTagInput
  ): Promise<MusicTag | null> {
    try {
      // Get existing preferences
      const { data: existingPrefs } = await supabase
        .from('user_preferences')
        .select('preferred_genres, preferred_artists, id')
        .eq('user_id', userId)
        .maybeSingle();

      const genres = existingPrefs?.preferred_genres || [];
      const existingArtistUuids = existingPrefs?.preferred_artists || [];

      let updateData: any;

      // Add the new tag
      if (tagInput.tag_type === 'genre') {
        if (!genres.includes(tagInput.tag_value)) {
          genres.push(tagInput.tag_value);
        }
        updateData = {
          preferred_genres: genres,
          preferred_artists: existingArtistUuids, // Keep existing UUIDs
          updated_at: new Date().toISOString()
        };
      } else {
        // For artists, find or create the artist, then convert name to UUID
        let artistId: string | null = null;
        
        // Try to find existing artist by name (case-insensitive)
        const { data: existingArtist, error: searchError } = await supabase
          .from('artists')
          .select('id, name')
          .ilike('name', tagInput.tag_value)
          .limit(1)
          .maybeSingle();
        
        if (searchError && searchError.code !== 'PGRST116') {
          console.warn(`Error searching for artist "${tagInput.tag_value}":`, searchError);
        }
        
        if (existingArtist) {
          artistId = existingArtist.id;
        } else {
          // Artist doesn't exist - submit a request instead of creating directly
          // Users can no longer directly create artists
          try {
            const { MissingEntityRequestService } = await import('@/services/missingEntityRequestService');
            await MissingEntityRequestService.submitRequest({
              entity_type: 'artist',
              entity_name: tagInput.tag_value,
            });
            console.log(`📝 Submitted request for missing artist: "${tagInput.tag_value}"`);
            // Note: We don't set artistId here since the artist doesn't exist yet
            // The user will need to wait for admin approval
          } catch (error) {
            console.warn(`Error submitting artist request "${tagInput.tag_value}":`, error);
          }
          // Don't add to preferred_artists since the artist doesn't exist yet
        }
        
        if (artistId && !existingArtistUuids.includes(artistId)) {
          existingArtistUuids.push(artistId);
        }
        
        updateData = {
          preferred_genres: genres,
          preferred_artists: existingArtistUuids,
          updated_at: new Date().toISOString()
        };
      }

      let data, error;
      if (existingPrefs) {
        // Update existing record
        const result = await supabase
          .from('user_preferences')
          .update(updateData)
          .eq('user_id', userId)
          .select()
          .single();
        data = result.data;
        error = result.error;
      } else {
        // Insert new record
        const result = await supabase
          .from('user_preferences')
          .insert({
            user_id: userId,
            ...updateData
          })
          .select()
          .single();
        data = result.data;
        error = result.error;
      }

      if (error) throw error;

      // Return in MusicTag format
      return {
        id: `${userId}-${tagInput.tag_type}-${tagInput.tag_value}`,
        user_id: userId,
        tag_type: tagInput.tag_type,
        tag_value: tagInput.tag_value,
        tag_source: tagInput.tag_source || 'manual',
        weight: tagInput.weight || 5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Error adding music tag:', error);
      return null;
    }
  }

  /**
   * Remove a music tag by ID (format: userId-type-value)
   */
  static async removeMusicTag(tagId: string): Promise<boolean> {
    try {
      // Parse the tagId to extract user_id, tag_type, and tag_value
      const parts = tagId.split('-');
      if (parts.length < 3) {
        console.error('Invalid tag ID format:', tagId);
        return false;
      }

      const userId = parts[0];
      const tagType = parts[1] as 'genre' | 'artist';
      const tagValue = parts.slice(2).join('-');

      return await this.removeMusicTagByValue(userId, tagType, tagValue);
    } catch (error) {
      console.error('Error removing music tag:', error);
      return false;
    }
  }

  /**
   * Remove a music tag by value (for easier removal in UI)
   */
  static async removeMusicTagByValue(
    userId: string,
    tagType: 'genre' | 'artist',
    tagValue: string
  ): Promise<boolean> {
    try {
      // Get existing preferences
      const { data: existing } = await supabase
        .from('user_preferences')
        .select('preferred_genres, preferred_artists')
        .eq('user_id', userId)
        .maybeSingle();

      if (!existing) return true;

      let genres = existing.preferred_genres || [];
      let artistUuids = existing.preferred_artists || [];

      // Remove the tag from appropriate array
      if (tagType === 'genre') {
        genres = genres.filter((g: string) => g !== tagValue);
      } else {
        // For artists, find UUID for the artist name, then remove it
        const { data: artist } = await supabase
          .from('artists')
          .select('id')
          .eq('name', tagValue)
          .maybeSingle();
        
        if (artist) {
          artistUuids = artistUuids.filter((uuid: string) => uuid !== artist.id);
        } else {
          console.warn(`⚠️ Artist "${tagValue}" not found in database, cannot remove`);
        }
      }

      // Update preferences
      const { error } = await supabase
        .from('user_preferences')
        .update({
          preferred_genres: genres,
          preferred_artists: artistUuids, // UUID[] in DB
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error removing music tag by value:', error);
      return false;
    }
  }

  /**
   * Bulk update/replace all manual music tags for a user
   * This is useful for the onboarding flow
   */
  static async bulkUpdateMusicTags(
    userId: string,
    tags: MusicTagInput[]
  ): Promise<boolean> {
    try {
      // Separate genres and artists
      const genres = tags
        .filter(t => t.tag_type === 'genre')
        .map(t => t.tag_value);
      
      const artistNames = tags
        .filter(t => t.tag_type === 'artist')
        .map(t => t.tag_value);

      // Convert artist names to UUIDs (preferred_artists is UUID[] not TEXT[])
      // Create artists if they don't exist
      const artistUuids: string[] = [];
      if (artistNames.length > 0) {
        // Process each artist name - find or create
        for (const artistName of artistNames) {
          try {
            // Try to find existing artist by name (case-insensitive)
            const { data: existingArtist, error: searchError } = await supabase
              .from('artists')
              .select('id, name')
              .ilike('name', artistName)
              .limit(1)
              .maybeSingle();
            
            if (searchError && searchError.code !== 'PGRST116') {
              console.warn(`Error searching for artist "${artistName}":`, searchError);
              continue;
            }
            
            if (existingArtist) {
              // Artist exists, use its UUID
              if (!artistUuids.includes(existingArtist.id)) {
                artistUuids.push(existingArtist.id);
              }
            } else {
              // Artist doesn't exist, create it (jambase_artist_id column removed - use external_entity_ids instead)
              const normalizedIdentifier = artistName.toLowerCase().replace(/\s+/g, '-');
              const jambaseArtistId = `manual:${normalizedIdentifier}-${Date.now()}`;
              const { data: newArtist, error: createError } = await supabase
                .from('artists')
                .insert({
                  name: artistName,
                  identifier: normalizedIdentifier,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
                .select('id')
                .single();
              
              if (createError) {
                console.warn(`Error creating artist "${artistName}":`, createError);
                continue;
              }
              
              if (newArtist) {
                // Insert into external_entity_ids for normalization
                await supabase
                  .from('external_entity_ids')
                  .insert({
                    entity_type: 'artist',
                    entity_uuid: newArtist.id,
                    source: 'manual',
                    external_id: jambaseArtistId
                  })
                  .catch(() => {}); // Ignore duplicate errors
                
                artistUuids.push(newArtist.id);
                console.log(`✅ Created new artist: "${artistName}" (${newArtist.id})`);
              }
            }
          } catch (error) {
            console.error(`Error processing artist "${artistName}":`, error);
            // Continue with other artists
          }
        }
      }

      // Check if preferences exist
      const { data: existingPrefs, error: checkError } = await supabase
        .from('user_preferences')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      // Handle check error (ignore PGRST116 which means no record found)
      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      // preferred_artists is UUID[] in the database schema
      const updateData = {
        preferred_genres: (genres || []) as string[],
        preferred_artists: artistUuids as string[], // UUID[] in DB
        updated_at: new Date().toISOString()
      };

      if (existingPrefs) {
        // Update existing record
        const { error } = await supabase
          .from('user_preferences')
          .update(updateData)
          .eq('user_id', userId);
        
        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('user_preferences')
          .insert({
            user_id: userId,
            preferred_genres: (genres || []) as string[],
            preferred_artists: artistUuids as string[], // UUID[] in DB
            updated_at: new Date().toISOString()
          });
        
        if (error) throw error;
      }

      return true;
    } catch (error) {
      console.error('Error bulk updating music tags:', error);
      return false;
    }
  }

  /**
   * Sync Spotify tags - merge with manual tags
   * Spotify tags get slightly higher weight (stored in music_preference_signals)
   */
  static async syncSpotifyTags(
    userId: string,
    spotifyTags: MusicTagInput[]
  ): Promise<boolean> {
    try {
      // Get existing preferences
      const { data: existingPrefs } = await supabase
        .from('user_preferences')
        .select('preferred_genres, preferred_artists, music_preference_signals, id')
        .eq('user_id', userId)
        .maybeSingle();

      let genres = existingPrefs?.preferred_genres || [];
      let existingArtistUuids = existingPrefs?.preferred_artists || [];
      const signals = existingPrefs?.music_preference_signals || {};

      // Separate Spotify artist names
      const spotifyArtistNames = spotifyTags
        .filter(tag => tag.tag_type === 'artist')
        .map(tag => tag.tag_value);

      // Convert Spotify artist names to UUIDs - create artists if they don't exist
      const newArtistUuids: string[] = [];
      if (spotifyArtistNames.length > 0) {
        for (const artistName of spotifyArtistNames) {
          try {
            // Try to find existing artist by name (case-insensitive)
            const { data: existingArtist, error: searchError } = await supabase
              .from('artists')
              .select('id, name')
              .ilike('name', artistName)
              .limit(1)
              .maybeSingle();
            
            if (searchError && searchError.code !== 'PGRST116') {
              console.warn(`Error searching for Spotify artist "${artistName}":`, searchError);
              continue;
            }
            
            if (existingArtist) {
              // Artist exists, use its UUID
              if (!newArtistUuids.includes(existingArtist.id)) {
                newArtistUuids.push(existingArtist.id);
              }
            } else {
              // Artist doesn't exist, create it
              const normalizedIdentifier = artistName.toLowerCase().replace(/\s+/g, '-');
              const { data: newArtist, error: createError } = await supabase
                .from('artists')
                .insert({
                  name: artistName,
                  jambase_artist_id: `spotify:${normalizedIdentifier}-${Date.now()}`,
                  identifier: normalizedIdentifier,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                })
                .select('id')
                .single();
              
              if (createError) {
                console.warn(`Error creating Spotify artist "${artistName}":`, createError);
                continue;
              }
              
              if (newArtist) {
                newArtistUuids.push(newArtist.id);
                console.log(`✅ Created new Spotify artist: "${artistName}" (${newArtist.id})`);
              }
            }
          } catch (error) {
            console.error(`Error processing Spotify artist "${artistName}":`, error);
            // Continue with other artists
          }
        }
      }

      // Add Spotify tags (merge with existing, avoid duplicates)
      spotifyTags.forEach(tag => {
        if (tag.tag_type === 'genre') {
          if (!genres.includes(tag.tag_value)) {
            genres.push(tag.tag_value);
          }
        }
      });

      // Merge artist UUIDs (avoid duplicates)
      const allArtistUuids = [...new Set([...existingArtistUuids, ...newArtistUuids])];

      const updateData = {
        preferred_genres: genres,
        preferred_artists: allArtistUuids, // UUID[] in DB
        music_preference_signals: signals,
        updated_at: new Date().toISOString()
      };

      let error;
      if (existingPrefs) {
        // Update existing record
        const result = await supabase
          .from('user_preferences')
          .update(updateData)
          .eq('user_id', userId);
        error = result.error;
      } else {
        // Insert new record
        const result = await supabase
          .from('user_preferences')
          .insert({
            user_id: userId,
            ...updateData
          });
        error = result.error;
      }

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error syncing Spotify tags:', error);
      return false;
    }
  }

  /**
   * Update tag weight (useful for reordering favorites)
   * Note: Arrays don't support weights, so we store weight info in music_preference_signals
   */
  static async updateTagWeight(tagId: string, weight: number): Promise<boolean> {
    try {
      // Parse tagId to get user_id, tag_type, tag_value
      const parts = tagId.split('-');
      if (parts.length < 3) {
        console.error('Invalid tag ID format:', tagId);
        return false;
      }

      const userId = parts[0];
      const tagType = parts[1];
      const tagValue = parts.slice(2).join('-');

      // Get existing signals
      const { data: existing } = await supabase
        .from('user_preferences')
        .select('music_preference_signals')
        .eq('user_id', userId)
        .single();

      const signals = existing?.music_preference_signals || {};
      const key = `${tagType}_${tagValue}`;
      signals[key] = { ...signals[key], weight };

      // Update with weight in signals
      const { error } = await supabase
        .from('user_preferences')
        .update({
          music_preference_signals: signals,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error updating tag weight:', error);
      return false;
    }
  }

  /**
   * Get a summary of user's music preferences for recommendations
   */
  static async getMusicPreferencesSummary(userId: string): Promise<{
    genres: string[];
    artists: string[];
    hasSpotify: boolean;
  }> {
    try {
      const { data, error } = await supabase
        .from('user_preferences')
        .select('preferred_genres, preferred_artists, music_preference_signals')
        .eq('user_id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      const genres = data?.preferred_genres || [];
      const artistUuids = data?.preferred_artists || []; // UUID[] in DB
      const signals = data?.music_preference_signals || {};
      
      // Convert artist UUIDs to names
      let artistNames: string[] = [];
      if (artistUuids.length > 0) {
        const { data: artistData } = await supabase
          .from('artists')
          .select('name')
          .in('id', artistUuids);
        
        if (artistData) {
          artistNames = artistData.map(a => a.name);
        }
      }
      
      // Check if there are any Spotify-synced signals (indicates Spotify connection)
      const hasSpotify = Object.keys(signals).some(key => 
        typeof signals[key] === 'object' && signals[key]?.source === 'spotify'
      );

      return { genres, artists: artistNames, hasSpotify };
    } catch (error) {
      console.error('Error getting music preferences summary:', error);
      return { genres: [], artists: [], hasSpotify: false };
    }
  }
}

