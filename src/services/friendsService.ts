/**
 * Friends Service
 * 
 * Centralized service for managing friends using user_relationships table
 * Ensures no duplicates and consistent behavior across the app
 */

import { supabase } from '@/integrations/supabase/client';

export interface Friend {
  id: string;
  user_id: string;
  name: string;
  username?: string;
  avatar_url: string | null;
  bio: string | null;
  friendship_id?: string;
  created_at?: string;
}

export class FriendsService {
  /**
   * Get list of friends for a user (deduplicated)
   * @param userId - The user ID to get friends for
   * @returns Array of friend objects, deduplicated
   */
  static async getFriends(userId: string): Promise<Friend[]> {
    try {
      // Get friendship records from user_relationships table
      const { data: friendships, error: friendsError } = await supabase
        .from('user_relationships')
        .select('id, user_id, related_user_id, created_at')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${userId},related_user_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (friendsError) {
        console.error('Error fetching friends:', friendsError);
        return [];
      }

      if (!friendships || friendships.length === 0) {
        return [];
      }

      // Deduplicate: Get all unique user IDs (the other user in each relationship)
      const userIdsSet = new Set<string>();
      friendships.forEach(f => {
        const otherUserId = f.user_id === userId ? f.related_user_id : f.user_id;
        userIdsSet.add(otherUserId);
      });
      const userIds = Array.from(userIdsSet);

      // Fetch the profiles for those users
      const { data: profiles, error: profilesError } = await supabase
        .from('users')
        .select('id, name, avatar_url, bio, user_id, created_at')
        .in('user_id', userIds);

      if (profilesError) {
        console.error('Error fetching friend profiles:', profilesError);
        return [];
      }

      // Create a map to track which friends we've already added (deduplicate)
      const friendsMap = new Map<string, Friend>();

      // Transform the data to get the other user's profile
      // Only add each friend once (deduplicate)
      friendships.forEach(friendship => {
        const otherUserId = friendship.user_id === userId ? friendship.related_user_id : friendship.user_id;
        
        // Skip if we've already added this friend
        if (friendsMap.has(otherUserId)) {
          return;
        }
        
        const profile = profiles?.find(p => p.user_id === otherUserId);
        
        friendsMap.set(otherUserId, {
          id: profile?.id || otherUserId,
          user_id: otherUserId,
          name: profile?.name || 'Unknown User',
          username: (profile?.name || 'unknown').toLowerCase().replace(/\s+/g, ''),
          avatar_url: profile?.avatar_url || null,
          bio: profile?.bio || null,
          friendship_id: friendship.id,
          created_at: friendship.created_at
        });
      });

      // Convert map to array
      return Array.from(friendsMap.values());
    } catch (error) {
      console.error('Error getting friends:', error);
      return [];
    }
  }

  /**
   * Unfriend a user
   * @param friendUserId - The user ID to unfriend
   * @returns Promise that resolves when unfriending is complete
   */
  static async unfriendUser(friendUserId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('unfriend_user', {
        friend_user_id: friendUserId
      });

      if (error) {
        // If friendship doesn't exist, that's okay - just log and continue
        // The function now returns silently instead of raising an error
        if (error.message?.includes('Friendship does not exist') || error.code === 'P0001') {
          console.log('Friendship already removed or does not exist:', friendUserId);
          return; // Success - friendship is already gone
        }
        console.error('Error unfriending user:', error);
        throw error;
      }
    } catch (error: any) {
      // Handle case where friendship might already be deleted
      if (error?.message?.includes('Friendship does not exist') || error?.code === 'P0001') {
        console.log('Friendship already removed or does not exist:', friendUserId);
        return; // Success - friendship is already gone
      }
      console.error('Error in unfriendUser:', error);
      throw error;
    }
  }
}

