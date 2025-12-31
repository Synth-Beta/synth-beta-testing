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
      // Get friendship records from user_relationships table (3NF structure)
      // Friends are stored as: relationship_type='friend', status='accepted'
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
      // related_user_id contains the friend's user_id when user_id is the current user
      // user_id contains the friend's user_id when related_user_id is the current user
      const userIdsSet = new Set<string>();
      friendships.forEach(f => {
        const otherUserId = f.user_id === userId ? f.related_user_id : f.user_id;
        // related_user_id is UUID, so we need to ensure it's a valid UUID
        if (otherUserId && otherUserId !== userId) {
          userIdsSet.add(String(otherUserId));
        }
      });
      const userIds = Array.from(userIdsSet);

      if (userIds.length === 0) {
        return [];
      }

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
        const otherUserId = friendship.user_id === userId ? String(friendship.related_user_id) : String(friendship.user_id);
        
        // Skip if we've already added this friend or if it's the current user
        if (friendsMap.has(otherUserId) || otherUserId === userId) {
          return;
        }
        
        const profile = profiles?.find(p => String(p.user_id) === otherUserId);
        
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

  /**
   * Cancel a pending friend request
   * @param requestId - The friend request ID to cancel
   * @returns Promise that resolves when cancellation is complete
   */
  static async cancelFriendRequest(requestId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('cancel_friend_request', {
        request_id: requestId
      });

      if (error) {
        console.error('Error cancelling friend request:', error);
        throw error;
      }
    } catch (error: any) {
      console.error('Error in cancelFriendRequest:', error);
      throw error;
    }
  }

  /**
   * Get pending friend request ID for a user
   * @param senderId - The sender's user ID
   * @param receiverId - The receiver's user ID
   * @returns Promise that resolves to the request ID or null
   */
  static async getPendingRequestId(senderId: string, receiverId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('user_relationships')
        .select('id')
        .eq('user_id', senderId)
        .eq('related_user_id', receiverId)
        .eq('relationship_type', 'friend')
        .eq('status', 'pending')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        console.error('Error getting pending request ID:', error);
        return null;
      }

      return data?.id || null;
    } catch (error) {
      console.error('Error in getPendingRequestId:', error);
      return null;
    }
  }

  /**
   * Get recommended friends from 2nd and 3rd degree connections
   * @param userId - The user ID to get recommendations for
   * @param limit - Maximum number of recommendations (default: 10)
   * @returns Array of friend recommendation objects with connection depth and mutual friends info
   */
  static async getRecommendedFriends(userId: string, limit: number = 10): Promise<Array<{
    user_id: string;
    name: string;
    avatar_url: string | null;
    verified?: boolean;
    connection_depth: number;
    mutual_friends_count: number;
    shared_genres_count?: number;
  }>> {
    try {
      // Get 2nd and 3rd degree connections using existing RPC functions
      const [secondDegreeResult, thirdDegreeResult] = await Promise.all([
        supabase.rpc('get_second_degree_connections', { target_user_id: userId }),
        supabase.rpc('get_third_degree_connections', { target_user_id: userId })
      ]);

      if (secondDegreeResult.error) {
        console.error('Error fetching second degree connections:', secondDegreeResult.error);
      }
      if (thirdDegreeResult.error) {
        console.error('Error fetching third degree connections:', thirdDegreeResult.error);
      }

      const secondDegree = secondDegreeResult.data || [];
      const thirdDegree = thirdDegreeResult.data || [];

      // Combine and format the results
      const recommendations: Array<{
        user_id: string;
        name: string;
        avatar_url: string | null;
        verified?: boolean;
        connection_depth: number;
        mutual_friends_count: number;
        shared_genres_count?: number;
      }> = [];

      // Add 2nd degree connections
      secondDegree.forEach((conn: any) => {
        recommendations.push({
          user_id: conn.connected_user_id,
          name: conn.name || 'Unknown User',
          avatar_url: conn.avatar_url || null,
          verified: conn.is_public_profile !== false, // Use profile visibility as proxy
          connection_depth: 2,
          mutual_friends_count: conn.mutual_friends_count || 0,
        });
      });

      // Add 3rd degree connections
      thirdDegree.forEach((conn: any) => {
        recommendations.push({
          user_id: conn.connected_user_id,
          name: conn.name || 'Unknown User',
          avatar_url: conn.avatar_url || null,
          verified: conn.is_public_profile !== false,
          connection_depth: 3,
          mutual_friends_count: conn.mutual_friends_count || 0,
        });
      });

      // Sort by mutual friends count (descending), then by connection depth (2nd before 3rd)
      recommendations.sort((a, b) => {
        if (a.mutual_friends_count !== b.mutual_friends_count) {
          return b.mutual_friends_count - a.mutual_friends_count;
        }
        return a.connection_depth - b.connection_depth;
      });

      // Remove duplicates (in case same user appears in both)
      const uniqueRecommendations = Array.from(
        new Map(recommendations.map(rec => [rec.user_id, rec])).values()
      );

      // Return limited results
      return uniqueRecommendations.slice(0, limit);
    } catch (error) {
      console.error('Error getting recommended friends:', error);
      return [];
    }
  }
}

