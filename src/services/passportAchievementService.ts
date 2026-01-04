import { supabase } from '@/integrations/supabase/client';

export interface PassportAchievement {
  id: string;
  user_id: string;
  achievement_type: string;
  tier?: 'bronze' | 'silver' | 'gold';
  progress?: number;
  goal?: number;
  unlocked_at: string;
  metadata: Record<string, any>;
}

export interface AchievementDisplay {
  id?: string;
  type: string;
  name: string;
  description: string;
  icon: string;
  tier?: 'bronze' | 'silver' | 'gold';
  progress: number;
  goal: number;
  unlocked: boolean;
  unlocked_at?: string;
  metadata?: Record<string, any>;
}

export class PassportAchievementService {
  /**
   * Get all achievements with current progress for a user
   * Returns all possible achievements, not just unlocked ones
   * Uses the new achievements and user_achievement_progress tables
   */
  static async getBehavioralAchievements(userId: string): Promise<AchievementDisplay[]> {
    try {
      // Get all active achievements
      const { data: allAchievements, error: achievementsError } = await supabase
        .from('achievements')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (achievementsError) throw achievementsError;

      // Get user's progress for all achievements
      const { data: userProgress, error: progressError } = await supabase
        .from('user_achievement_progress')
        .select('*')
        .eq('user_id', userId);

      if (progressError) throw progressError;

      // Create a map of progress by achievement_id
      const progressMap = new Map<string, any>();
      (userProgress || []).forEach(progress => {
        progressMap.set(progress.achievement_id, progress);
      });

      // Build achievements list
      const achievements: AchievementDisplay[] = [];

      (allAchievements || []).forEach((achievement) => {
        const progress = progressMap.get(achievement.id);
        const currentProgress = progress?.current_progress || 0;
        const highestTier = progress?.highest_tier_achieved || null;

        // Parse goals from strings to numbers
        const bronzeGoal = parseInt(String(achievement.bronze_goal)) || 0;
        const silverGoal = parseInt(String(achievement.silver_goal)) || 0;
        const goldGoal = parseInt(String(achievement.gold_goal)) || 0;

        // Determine unlocked status and which goal/requirement to show
        let unlocked = false;
        let currentGoal = bronzeGoal;
        let currentTier: 'bronze' | 'silver' | 'gold' | null = null;
        let unlockedAt: string | undefined = undefined;
        let description = achievement.bronze_requirement;
        
        if (highestTier === 'gold') {
          unlocked = true;
          currentTier = 'gold';
          currentGoal = goldGoal;
          description = achievement.gold_requirement;
          unlockedAt = progress?.gold_achieved_at;
        } else if (highestTier === 'silver') {
          unlocked = true;
          currentTier = 'silver';
          currentGoal = silverGoal;
          description = achievement.silver_requirement;
          unlockedAt = progress?.silver_achieved_at;
        } else if (highestTier === 'bronze') {
          unlocked = true;
          currentTier = 'bronze';
          currentGoal = bronzeGoal;
          description = achievement.bronze_requirement;
          unlockedAt = progress?.bronze_achieved_at;
        } else {
          // Not unlocked - show bronze tier requirement and goal
          currentGoal = bronzeGoal;
          currentTier = null;
          description = achievement.bronze_requirement;
          }
          
        // Get icon based on category or use default
        const icon = this.getIconForAchievement(achievement.achievement_key, achievement.category);
          
          achievements.push({
          id: achievement.id,
          type: achievement.achievement_key,
          name: achievement.name,
          description: description,
          icon: icon,
          tier: currentTier || undefined,
          progress: currentProgress,
          goal: currentGoal,
          unlocked: unlocked,
          unlocked_at: unlockedAt,
          metadata: progress?.progress_metadata || {}
        });
      });

      // Sort: unlocked first, then by sort_order
      return achievements.sort((a, b) => {
        if (a.unlocked !== b.unlocked) {
          return a.unlocked ? -1 : 1;
        }
        // For unlocked, sort by tier (gold > silver > bronze)
        if (a.unlocked && b.unlocked) {
        const tierOrder = { gold: 0, silver: 1, bronze: 2 };
          const aTier = a.tier || 'bronze';
          const bTier = b.tier || 'bronze';
          const tierDiff = (tierOrder[aTier] || 2) - (tierOrder[bTier] || 2);
        if (tierDiff !== 0) return tierDiff;
        }
        // Then by progress
        return (b.progress || 0) - (a.progress || 0);
      });
    } catch (error) {
      console.error('Error fetching behavioral achievements:', error);
      return [];
    }
  }

  /**
   * Get icon emoji for achievement based on key and category
   */
  private static getIconForAchievement(achievementKey: string, category: string): string {
    // Map achievement keys to icons
    const iconMap: Record<string, string> = {
      'genre_curator': '🎵',
      'genre_specialist': '🎸',
      'bucket_list_starter': '📝',
      'intentional_explorer': '🔍',
      'return_engagement': '🔄',
      'new_blood': '🆕',
      'festival_attendance': '🎪',
      'artist_devotee': '❤️',
      'venue_regular': '🏛️',
      'go_with_friends': '👥',
      // Legacy achievements (if they still exist)
      'venue_hopper': '🏛️',
      'scene_explorer': '🎭',
      'city_crosser': '🌆',
      'era_walker': '⏳',
      'first_through_door': '🚪',
      'trusted_voice': '💬',
      'deep_cut_reviewer': '🎸',
      'scene_regular': '🎪',
      'road_tripper': '🛣️',
      'venue_loyalist': '❤️',
      'genre_blender': '🎵',
      'memory_maker': '📌',
      'early_adopter': '🌟',
      'connector': '👥',
      'passport_complete': '🎫',
    };

    if (iconMap[achievementKey]) {
      return iconMap[achievementKey];
    }

    // Fallback by category
    const categoryIcons: Record<string, string> = {
      'exploration': '🗺️',
      'specialization': '🎯',
      'milestones': '🏆',
      'discovery': '✨',
      'loyalty': '💎',
      'social': '👥',
    };

    return categoryIcons[category] || '🏆';
  }

  /**
   * Check and unlock achievements
   */
  static async checkAndUnlockAchievements(userId: string): Promise<void> {
    try {
      // Trigger master function to check all achievements
      const { error } = await supabase.rpc('check_all_achievements', { p_user_id: userId });
      if (error) throw error;
    } catch (error) {
      console.error('Error checking achievements:', error);
    }
  }

  /**
   * Map achievement to display format (deprecated - use getBehavioralAchievements instead)
   */
  private static mapAchievementToDisplay(achievement: PassportAchievement): AchievementDisplay {
    const achievementInfo = this.getAchievementInfo(achievement.achievement_type, achievement.tier);
    
    return {
      id: achievement.id,
      type: achievement.achievement_type,
      name: achievementInfo.name,
      description: achievementInfo.description,
      icon: achievementInfo.icon,
      tier: achievement.tier,
      progress: achievement.progress || 0,
      goal: achievement.goal || 0,
      unlocked: !!achievement.unlocked_at,
      unlocked_at: achievement.unlocked_at,
      metadata: achievement.metadata,
    };
  }

  /**
   * Get achievement display information
   */
  private static getAchievementInfo(
    type: string,
    tier?: 'bronze' | 'silver' | 'gold'
  ): { name: string; description: string; icon: string } {
    const tierLabel = tier ? ` (${tier.charAt(0).toUpperCase() + tier.slice(1)})` : '';
    
    const achievements: Record<string, { name: string; description: string; icon: string }> = {
      venue_hopper: {
        name: 'Venue Hopper' + tierLabel,
        description: tier === 'gold' ? 'Attend shows at 15 different venues' :
                     tier === 'silver' ? 'Attend shows at 7 different venues' :
                     'Attend shows at 3 different venues',
        icon: '🏛️',
      },
      scene_explorer: {
        name: 'Scene Explorer' + tierLabel,
        description: tier === 'gold' ? 'Engage with 7 distinct scenes' :
                     tier === 'silver' ? 'Engage with 4 distinct scenes' :
                     'Engage with 2 distinct scenes',
        icon: '🎭',
      },
      city_crosser: {
        name: 'City Crosser' + tierLabel,
        description: tier === 'gold' ? 'Attend shows in 10 cities' :
                     tier === 'silver' ? 'Attend shows in 5 cities' :
                     'Attend shows in 2 cities',
        icon: '🌆',
      },
      era_walker: {
        name: 'Era Walker' + tierLabel,
        description: tier === 'gold' ? 'Attend shows from 5 different eras' :
                     tier === 'silver' ? 'Attend shows from 3 different eras' :
                     'Attend shows from 2 different eras',
        icon: '⏳',
      },
      first_through_door: {
        name: 'First Through the Door' + tierLabel,
        description: tier === 'gold' ? 'Attend 6 emerging-artist shows' :
                     tier === 'silver' ? 'Attend 3 emerging-artist shows' :
                     'Attend 1 emerging-artist show',
        icon: '🚪',
      },
      trusted_voice: {
        name: 'Trusted Voice' + tierLabel,
        description: tier === 'gold' ? 'Reviews saved by others 25 times' :
                     tier === 'silver' ? 'Reviews saved by others 10 times' :
                     'Reviews saved by others 3 times',
        icon: '💬',
      },
      deep_cut_reviewer: {
        name: 'Deep Cut Reviewer' + tierLabel,
        description: tier === 'gold' ? 'Review 10 non-headliner performances' :
                     tier === 'silver' ? 'Review 5 non-headliner performances' :
                     'Review 2 non-headliner performances',
        icon: '🎸',
      },
      scene_regular: {
        name: 'Scene Regular' + tierLabel,
        description: tier === 'gold' ? 'Attend 10 events in the same scene' :
                     tier === 'silver' ? 'Attend 6 events in the same scene' :
                     'Attend 3 events in the same scene',
        icon: '🎪',
      },
      road_tripper: {
        name: 'Road Tripper' + tierLabel,
        description: tier === 'gold' ? 'Attend 6 out-of-town shows' :
                     tier === 'silver' ? 'Attend 3 out-of-town shows' :
                     'Attend 1 out-of-town show',
        icon: '🛣️',
      },
      venue_loyalist: {
        name: 'Venue Loyalist' + tierLabel,
        description: tier === 'gold' ? 'Attend 10 shows at the same venue' :
                     tier === 'silver' ? 'Attend 6 shows at the same venue' :
                     'Attend 3 shows at the same venue',
        icon: '❤️',
      },
      genre_blender: {
        name: 'Genre Blender' + tierLabel,
        description: tier === 'gold' ? 'Attend shows across 6 genres' :
                     tier === 'silver' ? 'Attend shows across 4 genres' :
                     'Attend shows across 2 genres',
        icon: '🎵',
      },
      memory_maker: {
        name: 'Memory Maker' + tierLabel,
        description: tier === 'gold' ? 'Pin 5 defining shows to your passport' :
                     tier === 'silver' ? 'Pin 3 defining shows to your passport' :
                     'Pin 1 defining show to your passport',
        icon: '📌',
      },
      early_adopter: {
        name: 'Early Adopter' + tierLabel,
        description: tier === 'gold' ? 'Attend 5 shows early after joining' :
                     tier === 'silver' ? 'Attend 3 shows early after joining' :
                     'Attend a show shortly after joining',
        icon: '🌟',
      },
      connector: {
        name: 'Connector' + tierLabel,
        description: tier === 'gold' ? 'Attend 10 shows with friends' :
                     tier === 'silver' ? 'Attend 5 shows with friends' :
                     'Attend 2 shows with friends',
        icon: '👥',
      },
      passport_complete: {
        name: 'Passport Complete' + tierLabel,
        description: tier === 'gold' ? 'Unlock all 15 achievements' :
                     tier === 'silver' ? 'Unlock 10 achievements' :
                     'Unlock 5 achievements',
        icon: '🎫',
      },
    };

    return achievements[type] || {
      name: 'Achievement' + tierLabel,
      description: 'Awarded for your musical journey',
      icon: '🏆',
    };
  }
}

