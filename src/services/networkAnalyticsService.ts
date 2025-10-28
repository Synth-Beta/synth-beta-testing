/**
 * Network Analytics Service
 * 
 * Tracks network effect and critical mass metrics across expansion phases
 * All calculations use existing database tables without requiring new migrations
 */

import { supabase } from '@/integrations/supabase/client';
import { CITY_TARGETS, matchCityToTarget, getCitiesForPhase, getCurrentPhase, normalizeCityName, type CityTarget } from '@/config/cityTargets';

export interface CityMetrics {
  city: string;
  currentMAU: number;
  targetMAU: number;
  percentComplete: number;
  wowGrowth: number;
  week2Retention: number;
  networkCompleteness: number;
  eventCoverage: number;
  organicGrowthRate: number;
  status: 'below' | 'building' | 'near_critical' | 'sustainable';
  userCount: number; // Total users with this city
  activeUserCount: number; // Users active in last 30 days
}

export interface RetentionCohort {
  cohortWeek: string;
  week2Retention: number;
  week4Retention: number;
  week8Retention: number;
  cohortSize: number;
}

export interface ActivationMetrics {
  avgDaysTo3Friends: number;
  avgDaysTo5Friends: number;
  avgDaysTo7Friends: number;
  usersWith3PlusFriends: number;
  usersWith5PlusFriends: number;
  usersWith7PlusFriends: number;
  totalUsers: number;
}

export interface InvitationFunnel {
  invitesSent: number;
  invitesAccepted: number;
  usersActivated: number; // Users with 5+ friends
  acceptanceRate: number;
  activationRate: number;
}

export interface MagicNumberAnalysis {
  friendCountBucket: string;
  userCount: number;
  week2Retention: number;
  week4Retention: number;
  week8Retention: number;
}

export interface ContentHealthMetrics {
  eventsWith0Rankings: number;
  eventsWith1to2Rankings: number;
  eventsWith3to5Rankings: number;
  eventsWith6PlusRankings: number;
  totalEvents: number;
  coverageScore: number;
}

export interface LaunchEfficiency {
  city: string;
  daysTo100MAU: number | null;
  daysTo250MAU: number | null;
  daysTo500MAU: number | null;
  currentMAU: number;
  launchDate: string | null; // Earliest user signup date in city
}

export interface PhaseStatus {
  phaseNumber: number;
  cities: CityMetrics[];
  readyToLaunchNext: boolean;
  blockingIssues: string[];
}

export interface RedFlag {
  city: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  metric: string;
  value: number;
  threshold: number;
}

/**
 * Cached batch data for efficient queries
 */
interface BatchData {
  profiles: Array<{ user_id: string; location_city: string | null; created_at: string }>;
  friendships: Array<{ user1_id: string; user2_id: string; created_at: string }>;
  interactions: Array<{ user_id: string; occurred_at: string }>;
  reviews: Array<{ event_id: string; user_id: string }>;
  events: Array<{ id: string; venue_city: string | null }>;
  cityUserMap: Map<string, Set<string>>; // city -> Set<user_id>
  userCityMap: Map<string, string>; // user_id -> city
  loadTime: number;
}

let batchDataCache: BatchData | null = null;
const CACHE_TTL = 60000; // 1 minute cache

export class NetworkAnalyticsService {
  /**
   * Load all data in one batch query
   */
  static async loadBatchData(): Promise<BatchData> {
    const now = Date.now();
    
    // Return cached data if still fresh
    if (batchDataCache && (now - batchDataCache.loadTime) < CACHE_TTL) {
      return batchDataCache;
    }

    console.log('[NetworkAnalytics] Loading batch data...');
    const startTime = Date.now();

    // Load all data in parallel
    const [profilesResult, friendshipsResult, interactionsResult, reviewsResult, eventsResult] = await Promise.all([
      supabase.from('profiles').select('user_id, location_city, created_at').not('location_city', 'is', null),
      supabase.from('friends').select('user1_id, user2_id, created_at'),
      supabase.from('user_interactions').select('user_id, occurred_at').gte('occurred_at', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()),
      supabase.from('user_reviews').select('event_id, user_id').eq('is_draft', false),
      supabase.from('jambase_events').select('id, venue_city').not('venue_city', 'is', null)
    ]);

    const profiles = profilesResult.data || [];
    const friendships = friendshipsResult.data || [];
    const interactions = interactionsResult.data || [];
    const reviews = reviewsResult.data || [];
    const events = eventsResult.data || [];

    // Build city -> user mapping for all configured cities
    const cityUserMap = new Map<string, Set<string>>();
    const userCityMap = new Map<string, string>();

    for (const target of CITY_TARGETS) {
      const cityUsers = new Set<string>();

      // Use the matchCityToTarget function for each user's location_city
      for (const profile of profiles) {
        if (profile.location_city) {
          const matchedCity = matchCityToTarget(profile.location_city);
          if (matchedCity === target.city) {
            cityUsers.add(profile.user_id);
            userCityMap.set(profile.user_id, target.city);
          }
        }
      }

      if (cityUsers.size > 0) {
        cityUserMap.set(target.city, cityUsers);
        console.log(`[NetworkAnalytics] Matched ${cityUsers.size} users to ${target.city}`);
      }
    }
    
    // Debug: Show unmatched location_city values (for DC specifically)
    const unmatchedDC = profiles
      .filter(p => p.location_city && p.location_city.toLowerCase().includes('washington') && p.location_city.toLowerCase().includes('dc'))
      .filter(p => !userCityMap.has(p.user_id));
    
    if (unmatchedDC.length > 0) {
      console.warn(`[NetworkAnalytics] Found ${unmatchedDC.length} unmatched DC users:`, unmatchedDC.map(p => p.location_city));
    }

    batchDataCache = {
      profiles,
      friendships,
      interactions,
      reviews,
      events,
      cityUserMap,
      userCityMap,
      loadTime: Date.now()
    };

    console.log(`[NetworkAnalytics] Batch data loaded in ${Date.now() - startTime}ms`);
    return batchDataCache;
  }

  /**
   * Get MAU for a specific city (users with interactions in last 30 days)
   */
  static async getCityMAU(city: string, daysBack: number = 30): Promise<number> {
    try {
      const batchData = await this.loadBatchData();
      const cityUsers = batchData.cityUserMap.get(city);
      
      if (!cityUsers || cityUsers.size === 0) return 0;

      // Filter interactions to this city and time period
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysBack);
      const cutoffISO = cutoffDate.toISOString();

      const activeUsers = new Set<string>();
      for (const interaction of batchData.interactions) {
        if (cityUsers.has(interaction.user_id) && interaction.occurred_at >= cutoffISO) {
          activeUsers.add(interaction.user_id);
        }
      }

      return activeUsers.size;
    } catch (error) {
      console.error(`Error getting MAU for ${city}:`, error);
      return 0;
    }
  }

  /**
   * Get total user count for a city
   */
  static async getCityUserCount(city: string): Promise<number> {
    try {
      const batchData = await this.loadBatchData();
      const cityUsers = batchData.cityUserMap.get(city);
      return cityUsers ? cityUsers.size : 0;
    } catch (error) {
      console.error(`Error getting user count for ${city}:`, error);
      return 0;
    }
  }

  /**
   * Get week-over-week growth rate
   */
  static async getWowGrowth(city: string): Promise<number> {
    try {
      const batchData = await this.loadBatchData();
      const cityUsers = batchData.cityUserMap.get(city);
      
      if (!cityUsers || cityUsers.size === 0) return 0;

      const now = new Date();
      const thisWeekStart = new Date(now);
      thisWeekStart.setDate(now.getDate() - 7);
      const lastWeekStart = new Date(now);
      lastWeekStart.setDate(now.getDate() - 14);
      const lastWeekEnd = thisWeekStart;

      let thisWeekActive = 0;
      let lastWeekActive = 0;

      for (const interaction of batchData.interactions) {
        if (!cityUsers.has(interaction.user_id)) continue;
        
        const interactionDate = new Date(interaction.occurred_at);
        if (interactionDate >= thisWeekStart) {
          thisWeekActive++;
        } else if (interactionDate >= lastWeekStart && interactionDate < lastWeekEnd) {
          lastWeekActive++;
        }
      }

      const thisWeekUnique = new Set();
      const lastWeekUnique = new Set();

      for (const interaction of batchData.interactions) {
        if (!cityUsers.has(interaction.user_id)) continue;
        
        const interactionDate = new Date(interaction.occurred_at);
        if (interactionDate >= thisWeekStart) {
          thisWeekUnique.add(interaction.user_id);
        } else if (interactionDate >= lastWeekStart && interactionDate < lastWeekEnd) {
          lastWeekUnique.add(interaction.user_id);
        }
      }

      const thisWeekMAU = thisWeekUnique.size;
      const lastWeekMAU = lastWeekUnique.size;

      if (lastWeekMAU === 0) return thisWeekMAU > 0 ? 100 : 0;
      return ((thisWeekMAU - lastWeekMAU) / lastWeekMAU) * 100;
    } catch (error) {
      console.error(`Error getting WoW growth for ${city}:`, error);
      return 0;
    }
  }

  /**
   * Get retention curve for a city
   */
  static async getCityRetentionCurve(city: string, weeksBack: number = 8): Promise<RetentionCohort[]> {
    try {
      const batchData = await this.loadBatchData();
      const cityUsers = batchData.cityUserMap.get(city);
      
      if (!cityUsers || cityUsers.size === 0) return [];

      // Get city users with signup dates
      const cityUserProfiles = batchData.profiles.filter(p => cityUsers.has(p.user_id));

      // Group users by signup week
      const cohorts = new Map<string, string[]>();
      
      cityUserProfiles.forEach(user => {
        const signupDate = new Date(user.created_at);
        const weekStart = new Date(signupDate);
        weekStart.setDate(signupDate.getDate() - signupDate.getDay()); // Start of week (Sunday)
        const weekKey = weekStart.toISOString().split('T')[0];
        
        if (!cohorts.has(weekKey)) {
          cohorts.set(weekKey, []);
        }
        cohorts.get(weekKey)!.push(user.user_id);
      });

      // Calculate retention for each cohort using batch data
      const retentionCurves: RetentionCohort[] = [];
      const now = new Date();

      for (const [weekKey, userIds] of cohorts.entries()) {
        const weekStart = new Date(weekKey);
        
        // Only analyze cohorts old enough for week 8 retention
        const weeksSinceSignup = Math.floor((now.getTime() - weekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));
        if (weeksSinceSignup < 8) continue;

        const cohortSize = userIds.length;
        const userIdSet = new Set(userIds);
        
        // Check week 2 retention (users active in week 2)
        const week2Start = new Date(weekStart);
        week2Start.setDate(week2Start.getDate() + 14);
        const week2End = new Date(week2Start);
        week2End.setDate(week2End.getDate() + 7);
        
        const week2Active = new Set<string>();
        for (const interaction of batchData.interactions) {
          if (userIdSet.has(interaction.user_id)) {
            const interactionDate = new Date(interaction.occurred_at);
            if (interactionDate >= week2Start && interactionDate < week2End) {
              week2Active.add(interaction.user_id);
            }
          }
        }
        
        // Check week 4 retention
        const week4Start = new Date(weekStart);
        week4Start.setDate(week4Start.getDate() + 28);
        const week4End = new Date(week4Start);
        week4End.setDate(week4End.getDate() + 7);
        
        const week4Active = new Set<string>();
        for (const interaction of batchData.interactions) {
          if (userIdSet.has(interaction.user_id)) {
            const interactionDate = new Date(interaction.occurred_at);
            if (interactionDate >= week4Start && interactionDate < week4End) {
              week4Active.add(interaction.user_id);
            }
          }
        }
        
        // Check week 8 retention
        const week8Start = new Date(weekStart);
        week8Start.setDate(week8Start.getDate() + 56);
        const week8End = new Date(week8Start);
        week8End.setDate(week8End.getDate() + 7);
        
        const week8Active = new Set<string>();
        for (const interaction of batchData.interactions) {
          if (userIdSet.has(interaction.user_id)) {
            const interactionDate = new Date(interaction.occurred_at);
            if (interactionDate >= week8Start && interactionDate < week8End) {
              week8Active.add(interaction.user_id);
            }
          }
        }

        retentionCurves.push({
          cohortWeek: weekKey,
          week2Retention: cohortSize > 0 ? (week2Active.size / cohortSize) * 100 : 0,
          week4Retention: cohortSize > 0 ? (week4Active.size / cohortSize) * 100 : 0,
          week8Retention: cohortSize > 0 ? (week8Active.size / cohortSize) * 100 : 0,
          cohortSize
        });
      }

      // Return last N cohorts, sorted by date
      return retentionCurves
        .sort((a, b) => b.cohortWeek.localeCompare(a.cohortWeek))
        .slice(0, weeksBack);
    } catch (error) {
      console.error(`Error getting retention curve for ${city}:`, error);
      return [];
    }
  }

  /**
   * Get network completeness score (avg friends per user / 5 friends target) × 100
   */
  static async getNetworkCompleteness(city: string): Promise<number> {
    try {
      const batchData = await this.loadBatchData();
      const cityUsers = batchData.cityUserMap.get(city);
      
      if (!cityUsers || cityUsers.size === 0) return 0;

      const cityUserIds = Array.from(cityUsers);
      const cityUserSet = new Set(cityUserIds);

      // Count friends per user using batch data
      const friendCounts = new Map<string, number>();
      cityUserIds.forEach(id => friendCounts.set(id, 0));

      for (const friendship of batchData.friendships) {
        if (cityUserSet.has(friendship.user1_id)) {
          friendCounts.set(friendship.user1_id, (friendCounts.get(friendship.user1_id) || 0) + 1);
        }
        if (cityUserSet.has(friendship.user2_id)) {
          friendCounts.set(friendship.user2_id, (friendCounts.get(friendship.user2_id) || 0) + 1);
        }
      }

      const avgFriends = Array.from(friendCounts.values()).reduce((sum, count) => sum + count, 0) / cityUserIds.length;
      const targetFriends = 5;
      
      return Math.min((avgFriends / targetFriends) * 100, 100);
    } catch (error) {
      console.error(`Error getting network completeness for ${city}:`, error);
      return 0;
    }
  }

  /**
   * Get event coverage score (% of events with 3+ rankings)
   */
  static async getEventCoverageScore(city: string): Promise<number> {
    try {
      const batchData = await this.loadBatchData();
      const target = CITY_TARGETS.find(t => t.city === city);
      if (!target) return 0;

      const cityVariations = [target.city, ...(target.aliases || [])];
      const normalizedVariations = cityVariations.map(c => c.toLowerCase().trim());

      // Filter events to this city using batch data
      const cityEventIds = batchData.events
        .filter(e => {
          if (!e.venue_city) return false;
          const eventCity = e.venue_city.toLowerCase().trim();
          return normalizedVariations.some(variant => 
            eventCity.includes(variant) || variant.includes(eventCity)
          );
        })
        .map(e => e.id);

      if (cityEventIds.length === 0) return 0;

      const cityEventSet = new Set(cityEventIds);

      // Count reviews per event using batch data
      const reviewCounts = new Map<string, number>();
      cityEventIds.forEach(id => reviewCounts.set(id, 0));
      
      for (const review of batchData.reviews) {
        if (cityEventSet.has(review.event_id)) {
          reviewCounts.set(review.event_id, (reviewCounts.get(review.event_id) || 0) + 1);
        }
      }

      // Count events with 3+ reviews
      const eventsWith3Plus = Array.from(reviewCounts.values()).filter(count => count >= 3).length;
      
      return cityEventIds.length > 0 ? (eventsWith3Plus / cityEventIds.length) * 100 : 0;
    } catch (error) {
      console.error(`Error getting event coverage for ${city}:`, error);
      return 0;
    }
  }

  /**
   * Get organic growth rate (placeholder - would need invite tracking)
   */
  static async getOrganicGrowthRate(city: string, weeks: number = 4): Promise<number> {
    // This requires tracking invite-driven signups
    // For now, return a placeholder based on growth rate
    try {
      const wowGrowth = await this.getWowGrowth(city);
      // Assume positive WoW growth indicates organic growth
      return Math.max(wowGrowth, 0);
    } catch (error) {
      console.error(`Error getting organic growth rate for ${city}:`, error);
      return 0;
    }
  }

  /**
   * Get activation metrics (time to 3/5/7 friends)
   */
  static async getActivationMetrics(city: string): Promise<ActivationMetrics> {
    try {
      const batchData = await this.loadBatchData();
      const cityUsers = batchData.cityUserMap.get(city);
      
      if (!cityUsers || cityUsers.size === 0) {
        return {
          avgDaysTo3Friends: 0,
          avgDaysTo5Friends: 0,
          avgDaysTo7Friends: 0,
          usersWith3PlusFriends: 0,
          usersWith5PlusFriends: 0,
          usersWith7PlusFriends: 0,
          totalUsers: 0
        };
      }

      // Get city users with signup dates
      const cityUserProfiles = batchData.profiles
        .filter(p => cityUsers.has(p.user_id))
        .map(p => ({ userId: p.user_id, signupDate: new Date(p.created_at) }));

      const totalUsers = cityUserProfiles.length;
      if (totalUsers === 0) {
        return {
          avgDaysTo3Friends: 0,
          avgDaysTo5Friends: 0,
          avgDaysTo7Friends: 0,
          usersWith3PlusFriends: 0,
          usersWith5PlusFriends: 0,
          usersWith7PlusFriends: 0,
          totalUsers: 0
        };
      }

      const userIds = cityUserProfiles.map(u => u.userId);
      const userIdSet = new Set(userIds);

      // Build friend connections map using batch data
      const userFriendConnections = new Map<string, string[]>();
      userIds.forEach(id => userFriendConnections.set(id, []));
      
      for (const friendship of batchData.friendships) {
        if (userIdSet.has(friendship.user1_id)) {
          userFriendConnections.get(friendship.user1_id)?.push(friendship.user2_id);
        }
        if (userIdSet.has(friendship.user2_id)) {
          userFriendConnections.get(friendship.user2_id)?.push(friendship.user1_id);
        }
      }

      // Calculate days to reach friend milestones
      const daysTo3: number[] = [];
      const daysTo5: number[] = [];
      const daysTo7: number[] = [];
      
      let usersWith3Plus = 0;
      let usersWith5Plus = 0;
      let usersWith7Plus = 0;

      for (const user of cityUsers) {
        const friends = userFriendConnections.get(user.userId) || [];
        const friendCount = friends.length;

        if (friendCount >= 3) usersWith3Plus++;
        if (friendCount >= 5) usersWith5Plus++;
        if (friendCount >= 7) usersWith7Plus++;

        // For users with 3+ friends, find when they reached that milestone
        // This is simplified - we'd need friend request timestamps for accuracy
        if (friendCount >= 3) {
          daysTo3.push(30); // Placeholder - would need actual friend request dates
        }
        if (friendCount >= 5) {
          daysTo5.push(45); // Placeholder
        }
        if (friendCount >= 7) {
          daysTo7.push(60); // Placeholder
        }
      }

      return {
        avgDaysTo3Friends: daysTo3.length > 0 ? daysTo3.reduce((a, b) => a + b, 0) / daysTo3.length : 0,
        avgDaysTo5Friends: daysTo5.length > 0 ? daysTo5.reduce((a, b) => a + b, 0) / daysTo5.length : 0,
        avgDaysTo7Friends: daysTo7.length > 0 ? daysTo7.reduce((a, b) => a + b, 0) / daysTo7.length : 0,
        usersWith3PlusFriends: usersWith3Plus,
        usersWith5PlusFriends: usersWith5Plus,
        usersWith7PlusFriends: usersWith7Plus,
        totalUsers
      };
    } catch (error) {
      console.error(`Error getting activation metrics for ${city}:`, error);
      return {
        avgDaysTo3Friends: 0,
        avgDaysTo5Friends: 0,
        avgDaysTo7Friends: 0,
        usersWith3PlusFriends: 0,
        usersWith5PlusFriends: 0,
        usersWith7PlusFriends: 0,
        totalUsers: 0
      };
    }
  }

  /**
   * Get invitation funnel (simplified - would need friend_request tracking)
   */
  static async getInvitationFunnel(city: string): Promise<InvitationFunnel> {
    // Placeholder implementation - would need friend_request table data
    return {
      invitesSent: 0,
      invitesAccepted: 0,
      usersActivated: 0,
      acceptanceRate: 0,
      activationRate: 0
    };
  }

  /**
   * Get comprehensive city metrics
   */
  static async getCityMetrics(city: string): Promise<CityMetrics> {
    const target = CITY_TARGETS.find(t => t.city === city);
    if (!target) {
      throw new Error(`City ${city} not found in targets`);
    }

    const [mau, userCount, wowGrowth, retentionCurve, networkCompleteness, eventCoverage, organicGrowth] = await Promise.all([
      this.getCityMAU(city),
      this.getCityUserCount(city),
      this.getWowGrowth(city),
      this.getCityRetentionCurve(city, 3), // Last 3 cohorts
      this.getNetworkCompleteness(city),
      this.getEventCoverageScore(city),
      this.getOrganicGrowthRate(city)
    ]);

    // Calculate average week 2 retention from recent cohorts
    const avgWeek2Retention = retentionCurve.length > 0
      ? retentionCurve.reduce((sum, c) => sum + c.week2Retention, 0) / retentionCurve.length
      : 0;

    // Determine status
    const percentComplete = (mau / target.targetMAU) * 100;
    let status: 'below' | 'building' | 'near_critical' | 'sustainable' = 'below';
    
    if (percentComplete >= 100 && wowGrowth > 0 && avgWeek2Retention >= 60) {
      status = 'sustainable';
    } else if (percentComplete >= 75 || (percentComplete >= 60 && wowGrowth > 10)) {
      status = 'near_critical';
    } else if (percentComplete >= 25 || mau > 50) {
      status = 'building';
    }

    return {
      city,
      currentMAU: mau,
      targetMAU: target.targetMAU,
      percentComplete,
      wowGrowth,
      week2Retention: avgWeek2Retention,
      networkCompleteness,
      eventCoverage,
      organicGrowthRate: organicGrowth,
      status,
      userCount,
      activeUserCount: mau
    };
  }

  /**
   * Get snapshot of all cities
   */
  static async getAllCitiesSnapshot(): Promise<CityMetrics[]> {
    const cities = CITY_TARGETS.filter(t => t.phase < 4); // Exclude Phase 4 placeholder
    const metrics = await Promise.all(
      cities.map(city => this.getCityMetrics(city.city).catch(() => null))
    );
    
    return metrics.filter((m): m is CityMetrics => m !== null);
  }

  /**
   * Get phase progress
   */
  static async getPhaseProgress(phaseNumber: number): Promise<PhaseStatus> {
    const cities = getCitiesForPhase(phaseNumber);
    const cityMetrics = await Promise.all(
      cities.map(city => this.getCityMetrics(city.city).catch(() => null))
    );
    
    const validMetrics = cityMetrics.filter((m): m is CityMetrics => m !== null);
    
    // Check if ready to launch next phase
    const readyToLaunchNext = validMetrics.every(m => 
      m.percentComplete >= 60 && 
      m.week2Retention >= 60 && 
      m.status !== 'below'
    );

    const blockingIssues: string[] = [];
    validMetrics.forEach(m => {
      if (m.percentComplete < 60) {
        blockingIssues.push(`${m.city}: Below 60% of target MAU (${m.percentComplete.toFixed(1)}%)`);
      }
      if (m.week2Retention < 60) {
        blockingIssues.push(`${m.city}: Week 2 retention below 60% (${m.week2Retention.toFixed(1)}%)`);
      }
    });

    return {
      phaseNumber,
      cities: validMetrics,
      readyToLaunchNext,
      blockingIssues
    };
  }

  /**
   * Get magic number analysis (retention by friend count)
   */
  static async getMagicNumberAnalysis(city: string): Promise<MagicNumberAnalysis[]> {
    // Simplified implementation
    return [
      { friendCountBucket: '0-2', userCount: 0, week2Retention: 0, week4Retention: 0, week8Retention: 0 },
      { friendCountBucket: '3-4', userCount: 0, week2Retention: 0, week4Retention: 0, week8Retention: 0 },
      { friendCountBucket: '5-6', userCount: 0, week2Retention: 0, week4Retention: 0, week8Retention: 0 },
      { friendCountBucket: '7+', userCount: 0, week2Retention: 0, week4Retention: 0, week8Retention: 0 }
    ];
  }

  /**
   * Get content health metrics
   */
  static async getContentHealthMetrics(city: string): Promise<ContentHealthMetrics> {
    try {
      const batchData = await this.loadBatchData();
      const target = CITY_TARGETS.find(t => t.city === city);
      if (!target) {
        return {
          eventsWith0Rankings: 0,
          eventsWith1to2Rankings: 0,
          eventsWith3to5Rankings: 0,
          eventsWith6PlusRankings: 0,
          totalEvents: 0,
          coverageScore: 0
        };
      }

      const cityVariations = [target.city, ...(target.aliases || [])];
      const normalizedVariations = cityVariations.map(c => c.toLowerCase().trim());

      // Get events in this city using batch data
      const cityEventIds = batchData.events
        .filter(e => {
          if (!e.venue_city) return false;
          const eventCity = e.venue_city.toLowerCase().trim();
          return normalizedVariations.some(variant => 
            eventCity.includes(variant) || variant.includes(eventCity)
          );
        })
        .map(e => e.id);

      const totalEvents = cityEventIds.length;
      if (totalEvents === 0) {
        return {
          eventsWith0Rankings: 0,
          eventsWith1to2Rankings: 0,
          eventsWith3to5Rankings: 0,
          eventsWith6PlusRankings: 0,
          totalEvents: 0,
          coverageScore: 0
        };
      }

      const cityEventSet = new Set(cityEventIds);

      // Count reviews per event using batch data
      const reviewCounts = new Map<string, number>();
      cityEventIds.forEach(id => reviewCounts.set(id, 0));
      
      for (const review of batchData.reviews) {
        if (cityEventSet.has(review.event_id)) {
          reviewCounts.set(review.event_id, (reviewCounts.get(review.event_id) || 0) + 1);
        }
      }

      let eventsWith0 = 0;
      let eventsWith1to2 = 0;
      let eventsWith3to5 = 0;
      let eventsWith6Plus = 0;

      reviewCounts.forEach(count => {
        if (count === 0) eventsWith0++;
        else if (count <= 2) eventsWith1to2++;
        else if (count <= 5) eventsWith3to5++;
        else eventsWith6Plus++;
      });

      const coverageScore = totalEvents > 0 ? ((eventsWith3to5 + eventsWith6Plus) / totalEvents) * 100 : 0;

      return {
        eventsWith0Rankings: eventsWith0,
        eventsWith1to2Rankings: eventsWith1to2,
        eventsWith3to5Rankings: eventsWith3to5,
        eventsWith6PlusRankings: eventsWith6Plus,
        totalEvents,
        coverageScore
      };
    } catch (error) {
      console.error(`Error getting content health for ${city}:`, error);
      return {
        eventsWith0Rankings: 0,
        eventsWith1to2Rankings: 0,
        eventsWith3to5Rankings: 0,
        eventsWith6PlusRankings: 0,
        totalEvents: 0,
        coverageScore: 0
      };
    }
  }

  /**
   * Get red flags for a city
   */
  static async getRedFlags(city: string): Promise<RedFlag[]> {
    const flags: RedFlag[] = [];
    const metrics = await this.getCityMetrics(city);
    const retentionCurve = await this.getCityRetentionCurve(city, 4);

    // Check for declining retention
    if (retentionCurve.length >= 3) {
      const recentRetention = retentionCurve.slice(0, 3).map(c => c.week2Retention);
      const isDeclining = recentRetention[0] < recentRetention[1] && 
                         recentRetention[1] < recentRetention[2];
      if (isDeclining) {
        flags.push({
          city,
          severity: 'high',
          message: `Retention declining for 3+ consecutive cohorts`,
          metric: 'week2Retention',
          value: recentRetention[0],
          threshold: recentRetention[2]
        });
      }
    }

    // Check organic invite rate (placeholder)
    if (metrics.organicGrowthRate < 0.2) {
      flags.push({
        city,
        severity: 'medium',
        message: `Organic invite rate below 0.2 invites/user/week`,
        metric: 'organicGrowthRate',
        value: metrics.organicGrowthRate,
        threshold: 0.2
      });
    }

    // Check event coverage
    if (metrics.eventCoverage < 30) {
      flags.push({
        city,
        severity: 'medium',
        message: `Event coverage below 30%`,
        metric: 'eventCoverage',
        value: metrics.eventCoverage,
        threshold: 30
      });
    }

    // Check MAU growth
    if (metrics.wowGrowth <= 0 && metrics.percentComplete < 50) {
      flags.push({
        city,
        severity: 'high',
        message: `MAU growth flat and below 50% of target`,
        metric: 'wowGrowth',
        value: metrics.wowGrowth,
        threshold: 0
      });
    }

    return flags;
  }

  /**
   * Get all red flags across all cities
   */
  static async getAllRedFlags(): Promise<RedFlag[]> {
    const cities = CITY_TARGETS.filter(t => t.phase < 4);
    const allFlags = await Promise.all(
      cities.map(city => this.getRedFlags(city.city))
    );
    return allFlags.flat();
  }

  /**
   * Get launch efficiency metrics
   */
  static async getLaunchEfficiency(city: string): Promise<LaunchEfficiency> {
    // Simplified - would need historical MAU data
    const metrics = await this.getCityMetrics(city);
    
    // Get earliest user signup in city
    const target = CITY_TARGETS.find(t => t.city === city);
    if (!target) {
      return {
        city,
        daysTo100MAU: null,
        daysTo250MAU: null,
        daysTo500MAU: null,
        currentMAU: 0,
        launchDate: null
      };
    }

    const cityVariations = [target.city, ...(target.aliases || [])];
    const normalizedVariations = cityVariations.map(c => c.toLowerCase().trim());

    const { data: cityProfiles } = await supabase
      .from('profiles')
      .select('created_at, location_city')
      .not('location_city', 'is', null)
      .order('created_at', { ascending: true });

    if (!cityProfiles) {
      return {
        city,
        daysTo100MAU: null,
        daysTo250MAU: null,
        daysTo500MAU: null,
        currentMAU: metrics.currentMAU,
        launchDate: null
      };
    }

    const citySignups = cityProfiles
      .filter(p => {
        const userCity = (p.location_city || '').toLowerCase().trim();
        return normalizedVariations.some(variant => 
          userCity.includes(variant) || variant.includes(userCity)
        );
      })
      .map(p => new Date(p.created_at))
      .sort((a, b) => a.getTime() - b.getTime());

    const launchDate = citySignups.length > 0 ? citySignups[0].toISOString().split('T')[0] : null;

    return {
      city,
      daysTo100MAU: metrics.currentMAU >= 100 ? 30 : null, // Placeholder
      daysTo250MAU: metrics.currentMAU >= 250 ? 60 : null,
      daysTo500MAU: metrics.currentMAU >= 500 ? 90 : null,
      currentMAU: metrics.currentMAU,
      launchDate
    };
  }
}

