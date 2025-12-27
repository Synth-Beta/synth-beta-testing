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
   */
  static async getBehavioralAchievements(userId: string): Promise<AchievementDisplay[]> {
    try {
      // First, get current progress for all achievements
      const { data: progressData, error: progressError } = await supabase
        .rpc('get_achievement_progress', { p_user_id: userId });

      if (progressError) throw progressError;

      // Get unlocked achievements to know which tier was actually unlocked
      const { data: unlockedData, error: unlockedError } = await supabase
        .from('passport_achievements')
        .select('*')
        .eq('user_id', userId);

      if (unlockedError) throw unlockedError;

      // Create a map of unlocked achievements by type and tier
      const unlockedMap = new Map<string, { tier: string; unlocked_at: string }>();
      (unlockedData || []).forEach(achievement => {
        const key = `${achievement.achievement_type}_${achievement.tier || 'none'}`;
        unlockedMap.set(key, { 
          tier: achievement.tier || '', 
          unlocked_at: achievement.unlocked_at 
        });
      });

      // Build achievements list from progress data
      const achievements: AchievementDisplay[] = [];

      (progressData || []).forEach((progress: any) => {
        const achievementType = progress.achievement_type;
        
        // Determine which tier to show:
        // - If gold unlocked: show gold only
        // - If silver unlocked: show silver (unlocked) and gold (in progress)
        // - If bronze unlocked: show bronze (unlocked) and silver (in progress)
        // - If none unlocked: show bronze (in progress) only
        
        const highestTier = progress.highest_tier;
        let tiersToShow: Array<'bronze' | 'silver' | 'gold'> = [];
        
        if (highestTier === 'gold') {
          tiersToShow = ['gold'];
        } else if (highestTier === 'silver') {
          tiersToShow = ['silver', 'gold'];
        } else if (highestTier === 'bronze') {
          tiersToShow = ['bronze', 'silver'];
        } else {
          tiersToShow = ['bronze'];
        }

        tiersToShow.forEach((tier, index) => {
          const goal = tier === 'gold' ? progress.gold_goal :
                      tier === 'silver' ? progress.silver_goal :
                      progress.bronze_goal;
          
          const progressValue = progress.current_progress;
          
          // Determine if this specific tier is unlocked
          let isUnlocked = false;
          if (highestTier === 'gold') {
            isUnlocked = tier === 'gold';
          } else if (highestTier === 'silver') {
            isUnlocked = tier === 'silver';
          } else if (highestTier === 'bronze') {
            isUnlocked = tier === 'bronze';
          }
          
          // Check if this tier was actually unlocked in the database
          const key = `${achievementType}_${tier}`;
          const unlocked = unlockedMap.get(key);
          isUnlocked = isUnlocked && !!unlocked;
          
          const achievementInfo = this.getAchievementInfo(achievementType, tier);
          
          achievements.push({
            id: `${achievementType}_${tier}_${index}`,
            type: achievementType,
            name: achievementInfo.name,
            description: achievementInfo.description,
            icon: achievementInfo.icon,
            tier: tier,
            progress: progressValue,
            goal: goal,
            unlocked: isUnlocked,
            unlocked_at: unlocked?.unlocked_at,
            metadata: {}
          });
        });
      });

      // Sort: unlocked first, then by tier (gold > silver > bronze), then by progress
      return achievements.sort((a, b) => {
        if (a.unlocked !== b.unlocked) {
          return a.unlocked ? -1 : 1;
        }
        const tierOrder = { gold: 0, silver: 1, bronze: 2 };
        const tierDiff = (tierOrder[a.tier || 'bronze'] || 2) - (tierOrder[b.tier || 'bronze'] || 2);
        if (tierDiff !== 0) return tierDiff;
        return (b.progress || 0) - (a.progress || 0);
      });
    } catch (error) {
      console.error('Error fetching behavioral achievements:', error);
      return [];
    }
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

