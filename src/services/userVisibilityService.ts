import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';

export interface VisibilityProfile {
  user_id: string;
  avatar_url: string | null;
  is_public_profile: boolean;
  last_active_at: string;
}

export class UserVisibilityService {
  /**
   * Check if a user should be visible based on their profile settings
   * Rules:
   * 1. If viewing own profile, always visible
   * 2. Friends can always see each other (regardless of privacy settings)
   * 3. For non-friends: must have profile picture AND public profile
   */
  static isUserVisible(
    profile: VisibilityProfile,
    currentUserId: string,
    isFriend: boolean = false
  ): boolean {
    // If viewing own profile, always visible
    if (profile.user_id === currentUserId) {
      return true;
    }

    // Friends can always see each other (regardless of privacy settings)
    if (isFriend) {
      return true;
    }

    // For non-friends: must have profile picture AND public profile
    const hasProfilePicture = profile.avatar_url && profile.avatar_url.trim() !== '';
    const isPublic = profile.is_public_profile === true;
    
    return hasProfilePicture && isPublic;
  }

  /**
   * Filter an array of profiles to only include visible users
   * For search results: shows all users (friends always visible, non-friends if public with profile pic)
   * For friend lists: shows all friends regardless of privacy settings
   */
  static filterVisibleUsers<T extends VisibilityProfile>(
    profiles: T[],
    currentUserId: string,
    friendUserIds: string[] = []
  ): T[] {
    return profiles.filter(profile => {
      const isFriend = friendUserIds.includes(profile.user_id);
      return this.isUserVisible(profile, currentUserId, isFriend);
    });
  }

  /**
   * Check if user should be visible in search results
   * Shows ALL users regardless of profile picture or privacy settings
   */
  static isVisibleInSearch(
    profile: VisibilityProfile,
    currentUserId: string,
    isFriend: boolean = false
  ): boolean {
    // If viewing own profile, always visible
    if (profile.user_id === currentUserId) {
      return true;
    }

    // SEARCH: Show ALL users regardless of profile picture or privacy
    // The client-side UI can handle showing different info based on profile status
    return true;
  }

  /**
   * Check if user should be visible for event matching/interactions
   * Only public users with profile pics are visible for matching
   */
  static isVisibleForMatching(
    profile: VisibilityProfile,
    currentUserId: string,
    isFriend: boolean = false
  ): boolean {
    // If viewing own profile, always visible
    if (profile.user_id === currentUserId) {
      return true;
    }

    // Friends can always see each other for matching
    if (isFriend) {
      return true;
    }

    // For non-friends: must have profile picture AND be public
    const hasProfilePicture = profile.avatar_url && profile.avatar_url.trim() !== '';
    const isPublic = profile.is_public_profile === true;
    
    return hasProfilePicture && isPublic;
  }

  /**
   * Format last active timestamp into a human-readable string
   * Examples: "Just now", "5m ago", "2h ago", "3d ago", "Jan 1"
   */
  static formatLastActive(lastActiveAt: string | Date): string {
    if (!lastActiveAt) {
      return 'Recently';
    }

    try {
      const lastActiveDate = typeof lastActiveAt === 'string' 
        ? new Date(lastActiveAt) 
        : lastActiveAt;
      
      const now = new Date();
      const diffMs = now.getTime() - lastActiveDate.getTime();
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      // Just now (less than 1 minute)
      if (diffMinutes < 1) {
        return 'Just now';
      }

      // Minutes ago (1-59 minutes)
      if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
      }

      // Hours ago (1-23 hours)
      if (diffHours < 24) {
        return `${diffHours}h ago`;
      }

      // Days ago (1-6 days)
      if (diffDays < 7) {
        return `${diffDays}d ago`;
      }

      // Use date-fns for older dates
      return formatDistanceToNow(lastActiveDate, { addSuffix: true });
    } catch (error) {
      console.error('Error formatting last active time:', error);
      return 'Recently';
    }
  }

  /**
   * Update the current user's last active timestamp
   */
  static async updateLastActive(userId: string): Promise<void> {
    try {
      // Call the database function to update last_active_at
      const { error } = await supabase.rpc('update_user_last_active', {
        user_id_param: userId
      });

      if (error) {
        console.error('Error updating last active:', error);
      }
    } catch (error) {
      console.error('Failed to update last active:', error);
    }
  }

  /**
   * Get a user's visibility settings
   */
  static async getUserVisibilitySettings(userId: string): Promise<{
    has_avatar: boolean;
    is_public_profile: boolean;
    last_active_at: string;
  } | null> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_url, is_public_profile, last_active_at')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching visibility settings:', error);
        return null;
      }

      return {
        has_avatar: !!data?.avatar_url,
        is_public_profile: data?.is_public_profile ?? true,
        last_active_at: data?.last_active_at || new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to fetch visibility settings:', error);
      return null;
    }
  }

  /**
   * Update a user's profile visibility setting
   */
  static async setProfileVisibility(
    userId: string,
    isPublic: boolean
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_public_profile: isPublic })
        .eq('user_id', userId);

      if (error) {
        console.error('Error updating profile visibility:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Failed to update profile visibility:', error);
      return false;
    }
  }

  /**
   * Check if current user has a profile picture
   */
  static async hasProfilePicture(userId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_url')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error checking profile picture:', error);
        return false;
      }

      return !!(data?.avatar_url && data.avatar_url.trim() !== '');
    } catch (error) {
      console.error('Failed to check profile picture:', error);
      return false;
    }
  }

  /**
   * Get list of friend user IDs for the current user
   */
  static async getFriendIds(currentUserId: string): Promise<string[]> {
    try {
      const { data, error } = await supabase
        .from('friends')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`);

      if (error) {
        console.error('Error fetching friends:', error);
        return [];
      }

      // Extract the friend IDs (the other user in each friendship)
      return (data || []).map(friendship => 
        friendship.user1_id === currentUserId 
          ? friendship.user2_id 
          : friendship.user1_id
      );
    } catch (error) {
      console.error('Failed to fetch friends:', error);
      return [];
    }
  }
}

