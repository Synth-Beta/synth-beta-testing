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
   * Get all music tags for a user
   */
  static async getUserMusicTags(userId: string): Promise<MusicTag[]> {
    try {
      const { data, error } = await supabase
        .from('user_music_tags')
        .select('*')
        .eq('user_id', userId)
        .order('weight', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []) as MusicTag[];
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
      const { data, error } = await supabase
        .from('user_music_tags')
        .select('*')
        .eq('user_id', userId)
        .eq('tag_type', tagType)
        .order('weight', { ascending: false });

      if (error) throw error;

      return (data || []) as MusicTag[];
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
      const { data, error } = await supabase
        .from('user_music_tags')
        .insert({
          user_id: userId,
          tag_type: tagInput.tag_type,
          tag_value: tagInput.tag_value,
          tag_source: tagInput.tag_source || 'manual',
          weight: tagInput.weight || 5,
        })
        .select()
        .single();

      if (error) throw error;

      return data as MusicTag;
    } catch (error) {
      console.error('Error adding music tag:', error);
      return null;
    }
  }

  /**
   * Remove a music tag by ID
   */
  static async removeMusicTag(tagId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_music_tags')
        .delete()
        .eq('id', tagId);

      if (error) throw error;

      return true;
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
      const { error } = await supabase
        .from('user_music_tags')
        .delete()
        .eq('user_id', userId)
        .eq('tag_type', tagType)
        .eq('tag_value', tagValue);

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
      // First, delete all existing manual tags
      await supabase
        .from('user_music_tags')
        .delete()
        .eq('user_id', userId)
        .eq('tag_source', 'manual');

      // Then insert the new tags
      if (tags.length > 0) {
        const tagsToInsert = tags.map((tag, index) => ({
          user_id: userId,
          tag_type: tag.tag_type,
          tag_value: tag.tag_value,
          tag_source: tag.tag_source || 'manual',
          // Weight decreases for each tag (top 3 get highest weights)
          weight: tag.weight || Math.max(10 - index, 1),
        }));

        const { error } = await supabase
          .from('user_music_tags')
          .insert(tagsToInsert);

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
   * Spotify tags get slightly higher weight
   */
  static async syncSpotifyTags(
    userId: string,
    spotifyTags: MusicTagInput[]
  ): Promise<boolean> {
    try {
      // Delete existing Spotify tags
      await supabase
        .from('user_music_tags')
        .delete()
        .eq('user_id', userId)
        .eq('tag_source', 'spotify');

      // Insert new Spotify tags
      if (spotifyTags.length > 0) {
        const tagsToInsert = spotifyTags.map((tag, index) => ({
          user_id: userId,
          tag_type: tag.tag_type,
          tag_value: tag.tag_value,
          tag_source: 'spotify' as const,
          // Spotify tags get slightly higher base weight
          weight: Math.max(10 - Math.floor(index / 2), 1),
        }));

        const { error } = await supabase
          .from('user_music_tags')
          .insert(tagsToInsert);

        if (error) throw error;
      }

      return true;
    } catch (error) {
      console.error('Error syncing Spotify tags:', error);
      return false;
    }
  }

  /**
   * Update tag weight (useful for reordering favorites)
   */
  static async updateTagWeight(tagId: string, weight: number): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_music_tags')
        .update({ weight })
        .eq('id', tagId);

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
      const tags = await this.getUserMusicTags(userId);

      const genres = tags
        .filter(tag => tag.tag_type === 'genre')
        .map(tag => tag.tag_value);

      const artists = tags
        .filter(tag => tag.tag_type === 'artist')
        .map(tag => tag.tag_value);

      const hasSpotify = tags.some(tag => tag.tag_source === 'spotify');

      return { genres, artists, hasSpotify };
    } catch (error) {
      console.error('Error getting music preferences summary:', error);
      return { genres: [], artists: [], hasSpotify: false };
    }
  }
}

