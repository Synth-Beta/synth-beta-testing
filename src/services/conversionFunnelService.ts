/**
 * Conversion Funnel Service
 * 
 * Analyzes user journey from discovery to conversion.
 * Provides funnel analysis, drop-off identification, and optimization recommendations.
 */

import { supabase } from '@/integrations/supabase/client';
import { logError } from './errorMonitoringService';

export interface FunnelStage {
  stage_name: string;
  stage_order: number;
  users_entered: number;
  users_completed: number;
  conversion_rate: number;
  drop_off_rate: number;
  average_time_spent: number; // in minutes
  revenue_attributed: number;
  key_actions: string[];
  optimization_opportunities: string[];
}

export interface FunnelAnalysis {
  funnel_id: string;
  funnel_name: string;
  total_users: number;
  overall_conversion_rate: number;
  stages: FunnelStage[];
  total_revenue: number;
  average_time_to_conversion: number;
  top_drop_off_stages: Array<{
    stage: string;
    drop_off_rate: number;
    users_lost: number;
  }>;
  recommendations: string[];
}

export interface UserJourney {
  user_id: string;
  journey_id: string;
  start_time: string;
  end_time?: string;
  stages_completed: string[];
  total_duration: number;
  conversion_achieved: boolean;
  revenue_generated: number;
  touchpoints: Array<{
    timestamp: string;
    stage: string;
    action: string;
    entity_id: string;
    metadata?: Record<string, any>;
  }>;
}

export interface FunnelComparison {
  funnel_a: FunnelAnalysis;
  funnel_b: FunnelAnalysis;
  improvement_metrics: {
    conversion_rate_improvement: number;
    revenue_improvement: number;
    time_improvement: number;
  };
}

export class ConversionFunnelService {
  // Standard funnel stages for different user types
  private static readonly FUNNEL_STAGES = {
    discovery: {
      name: 'Discovery',
      order: 1,
      events: ['view', 'search', 'navigate'],
      description: 'User discovers content or platform'
    },
    interest: {
      name: 'Interest',
      order: 2,
      events: ['interest', 'like', 'follow', 'share'],
      description: 'User shows interest in content'
    },
    consideration: {
      name: 'Consideration',
      order: 3,
      events: ['click', 'navigate', 'view'],
      description: 'User considers taking action'
    },
    conversion: {
      name: 'Conversion',
      order: 4,
      events: ['ticket_click', 'form_submit', 'profile_update'],
      description: 'User completes desired action'
    }
  };

  /**
   * Analyze conversion funnel for a specific user type
   */
  static async analyzeFunnel(
    userType: 'user' | 'creator' | 'business',
    timeRange: { start: Date; end: Date },
    additionalFilters?: Record<string, any>
  ): Promise<FunnelAnalysis> {
    try {
      // Get users of the specified type
      const { data: users } = await supabase
        .from('users')
        .select('user_id')
        .eq('account_type', userType);

      if (!users || users.length === 0) {
        return this.createEmptyFunnel(userType);
      }

      const userIds = users.map(u => u.user_id);

      // Get all interactions for these users in the time range
      const { data: interactions, error } = await supabase
        .from('interactions')
        .select('*')
        .in('user_id', userIds)
        .gte('occurred_at', timeRange.start.toISOString())
        .lte('occurred_at', timeRange.end.toISOString())
        .order('occurred_at', { ascending: true });

      if (error) {
        await logError('funnel_analysis_error', error, { userType, timeRange });
        return this.createEmptyFunnel(userType);
      }

      if (!interactions) {
        return this.createEmptyFunnel(userType);
      }

      // Analyze funnel stages
      const stages = await this.analyzeFunnelStages(interactions, userType);
      const totalUsers = new Set(interactions.map(i => i.user_id)).size;
      const overallConversionRate = this.calculateOverallConversionRate(stages);
      const totalRevenue = this.calculateTotalRevenue(stages);
      const averageTimeToConversion = this.calculateAverageTimeToConversion(interactions);
      const topDropOffStages = this.identifyTopDropOffStages(stages);
      const recommendations = this.generateRecommendations(stages, userType);

      return {
        funnel_id: `${userType}_funnel_${Date.now()}`,
        funnel_name: `${userType.charAt(0).toUpperCase() + userType.slice(1)} Conversion Funnel`,
        total_users: totalUsers,
        overall_conversion_rate: overallConversionRate,
        stages,
        total_revenue: totalRevenue,
        average_time_to_conversion: averageTimeToConversion,
        top_drop_off_stages: topDropOffStages,
        recommendations
      };
    } catch (error) {
      await logError('funnel_analysis_exception', error, { userType, timeRange });
      return this.createEmptyFunnel(userType);
    }
  }

  /**
   * Track individual user journey
   */
  static async trackUserJourney(
    userId: string,
    timeRange: { start: Date; end: Date }
  ): Promise<UserJourney[]> {
    try {
      const { data: interactions, error } = await supabase
        .from('interactions')
        .select('*')
        .eq('user_id', userId)
        .gte('occurred_at', timeRange.start.toISOString())
        .lte('occurred_at', timeRange.end.toISOString())
        .order('occurred_at', { ascending: true });

      if (error) {
        await logError('user_journey_tracking_error', error, { userId, timeRange });
        return [];
      }

      if (!interactions || interactions.length === 0) {
        return [];
      }

      // Group interactions by session
      const sessions = this.groupInteractionsBySession(interactions);
      const journeys: UserJourney[] = [];

      for (const session of sessions) {
        const journey = this.analyzeUserJourney(userId, session);
        journeys.push(journey);
      }

      return journeys;
    } catch (error) {
      await logError('user_journey_tracking_exception', error, { userId, timeRange });
      return [];
    }
  }

  /**
   * Compare two funnels
   */
  static async compareFunnels(
    funnelA: FunnelAnalysis,
    funnelB: FunnelAnalysis
  ): Promise<FunnelComparison> {
    const conversionRateImprovement = funnelB.overall_conversion_rate - funnelA.overall_conversion_rate;
    const revenueImprovement = funnelB.total_revenue - funnelA.total_revenue;
    const timeImprovement = funnelA.average_time_to_conversion - funnelB.average_time_to_conversion;

    return {
      funnel_a: funnelA,
      funnel_b: funnelB,
      improvement_metrics: {
        conversion_rate_improvement: Math.round(conversionRateImprovement * 100) / 100,
        revenue_improvement: Math.round(revenueImprovement * 100) / 100,
        time_improvement: Math.round(timeImprovement * 100) / 100
      }
    };
  }

  /**
   * Get funnel optimization recommendations
   */
  static async getOptimizationRecommendations(
    funnelAnalysis: FunnelAnalysis
  ): Promise<Array<{
    priority: 'high' | 'medium' | 'low';
    category: 'conversion' | 'engagement' | 'revenue' | 'retention';
    title: string;
    description: string;
    expected_impact: string;
    implementation_effort: 'low' | 'medium' | 'high';
  }>> {
    const recommendations = [];

    // Analyze drop-off stages
    for (const dropOff of funnelAnalysis.top_drop_off_stages) {
      if (dropOff.drop_off_rate > 50) {
        recommendations.push({
          priority: 'high' as const,
          category: 'conversion' as const,
          title: `Reduce Drop-off at ${dropOff.stage} Stage`,
          description: `${dropOff.users_lost} users are dropping off at the ${dropOff.stage} stage (${dropOff.drop_off_rate}% drop-off rate)`,
          expected_impact: `Could improve conversion by ${Math.round(dropOff.drop_off_rate * 0.3)}%`,
          implementation_effort: 'medium' as const
        });
      }
    }

    // Analyze conversion rate
    if (funnelAnalysis.overall_conversion_rate < 5) {
      recommendations.push({
        priority: 'high' as const,
        category: 'conversion' as const,
        title: 'Improve Overall Conversion Rate',
        description: `Current conversion rate is ${funnelAnalysis.overall_conversion_rate}%, which is below industry standards`,
        expected_impact: 'Could double conversion rate with optimization',
        implementation_effort: 'high' as const
      });
    }

    // Analyze time to conversion
    if (funnelAnalysis.average_time_to_conversion > 7) {
      recommendations.push({
        priority: 'medium' as const,
        category: 'engagement' as const,
        title: 'Reduce Time to Conversion',
        description: `Average time to conversion is ${funnelAnalysis.average_time_to_conversion} days`,
        expected_impact: 'Could reduce time to conversion by 30-50%',
        implementation_effort: 'medium' as const
      });
    }

    return recommendations;
  }

  // Private helper methods

  private static async analyzeFunnelStages(
    interactions: any[],
    userType: string
  ): Promise<FunnelStage[]> {
    const stages: FunnelStage[] = [];
    const stageDefinitions = Object.values(this.FUNNEL_STAGES);

    for (const stageDef of stageDefinitions) {
      const stageInteractions = interactions.filter(interaction =>
        stageDef.events.includes(interaction.event_type)
      );

      const usersEntered = new Set(stageInteractions.map(i => i.user_id)).size;
      const usersCompleted = this.calculateUsersCompleted(stageInteractions, stageDef.order);
      const conversionRate = usersEntered > 0 ? (usersCompleted / usersEntered) * 100 : 0;
      const dropOffRate = usersEntered > 0 ? ((usersEntered - usersCompleted) / usersEntered) * 100 : 0;
      const averageTimeSpent = this.calculateAverageTimeSpent(stageInteractions);
      const revenueAttributed = this.calculateStageRevenue(stageInteractions);
      const keyActions = this.identifyKeyActions(stageInteractions);
      const optimizationOpportunities = this.identifyOptimizationOpportunities(stageDef, stageInteractions);

      stages.push({
        stage_name: stageDef.name,
        stage_order: stageDef.order,
        users_entered: usersEntered,
        users_completed: usersCompleted,
        conversion_rate: Math.round(conversionRate * 100) / 100,
        drop_off_rate: Math.round(dropOffRate * 100) / 100,
        average_time_spent: Math.round(averageTimeSpent * 100) / 100,
        revenue_attributed: Math.round(revenueAttributed * 100) / 100,
        key_actions: keyActions,
        optimization_opportunities: optimizationOpportunities
      });
    }

    return stages;
  }

  private static calculateUsersCompleted(interactions: any[], stageOrder: number): number {
    // Users who completed this stage and moved to the next
    const nextStageEvents = this.getNextStageEvents(stageOrder);
    const nextStageInteractions = interactions.filter(interaction =>
      nextStageEvents.includes(interaction.event_type)
    );
    return new Set(nextStageInteractions.map(i => i.user_id)).size;
  }

  private static getNextStageEvents(stageOrder: number): string[] {
    const stageDefinitions = Object.values(this.FUNNEL_STAGES);
    const nextStage = stageDefinitions.find(s => s.order === stageOrder + 1);
    return nextStage ? nextStage.events : [];
  }

  private static calculateAverageTimeSpent(interactions: any[]): number {
    if (interactions.length === 0) return 0;

    const sessionGroups = this.groupInteractionsBySession(interactions);
    const sessionDurations = sessionGroups.map(session => {
      const start = new Date(session[0].occurred_at);
      const end = new Date(session[session.length - 1].occurred_at);
      return (end.getTime() - start.getTime()) / (1000 * 60); // minutes
    });

    return sessionDurations.reduce((sum, duration) => sum + duration, 0) / sessionDurations.length;
  }

  private static calculateStageRevenue(interactions: any[]): number {
    const revenueEvents = interactions.filter(i => 
      i.event_type === 'ticket_click' || 
      i.event_type === 'form_submit'
    );
    // Revenue calculation - only count actual revenue if we have real data
    return 0;
  }

  private static identifyKeyActions(interactions: any[]): string[] {
    const actionCounts: Record<string, number> = {};
    interactions.forEach(interaction => {
      actionCounts[interaction.event_type] = (actionCounts[interaction.event_type] || 0) + 1;
    });

    return Object.entries(actionCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([action]) => action);
  }

  private static identifyOptimizationOpportunities(
    stageDef: any,
    interactions: any[]
  ): string[] {
    const opportunities = [];

    if (interactions.length === 0) {
      opportunities.push('No user activity in this stage - consider improving discovery');
      return opportunities;
    }

    const conversionRate = this.calculateStageConversionRate(interactions);
    if (conversionRate < 20) {
      opportunities.push('Low conversion rate - consider improving user experience');
    }

    const averageTime = this.calculateAverageTimeSpent(interactions);
    if (averageTime > 10) {
      opportunities.push('Users spending too much time - consider simplifying the process');
    }

    return opportunities;
  }

  private static calculateStageConversionRate(interactions: any[]): number {
    const totalUsers = new Set(interactions.map(i => i.user_id)).size;
    const convertingUsers = new Set(
      interactions
        .filter(i => i.event_type === 'ticket_click' || i.event_type === 'form_submit')
        .map(i => i.user_id)
    ).size;
    
    return totalUsers > 0 ? (convertingUsers / totalUsers) * 100 : 0;
  }

  private static groupInteractionsBySession(interactions: any[]): any[][] {
    const sessionGroups: Record<string, any[]> = {};
    
    interactions.forEach(interaction => {
      const sessionId = interaction.session_id || 'default';
      if (!sessionGroups[sessionId]) {
        sessionGroups[sessionId] = [];
      }
      sessionGroups[sessionId].push(interaction);
    });

    return Object.values(sessionGroups);
  }

  private static analyzeUserJourney(userId: string, sessionInteractions: any[]): UserJourney {
    const startTime = sessionInteractions[0].occurred_at;
    const endTime = sessionInteractions[sessionInteractions.length - 1].occurred_at;
    const totalDuration = new Date(endTime).getTime() - new Date(startTime).getTime();

    const stagesCompleted = this.identifyStagesCompleted(sessionInteractions);
    const conversionAchieved = this.checkConversionAchieved(sessionInteractions);
    const revenueGenerated = this.calculateJourneyRevenue(sessionInteractions);

    const touchpoints = sessionInteractions.map(interaction => ({
      timestamp: interaction.occurred_at,
      stage: this.mapEventToStage(interaction.event_type),
      action: interaction.event_type,
      entity_id: interaction.entity_id,
      metadata: interaction.metadata
    }));

    return {
      user_id: userId,
      journey_id: sessionInteractions[0].session_id || crypto.randomUUID(),
      start_time: startTime,
      end_time: endTime,
      stages_completed: stagesCompleted,
      total_duration: totalDuration,
      conversion_achieved: conversionAchieved,
      revenue_generated: revenueGenerated,
      touchpoints
    };
  }

  private static identifyStagesCompleted(interactions: any[]): string[] {
    const completedStages = new Set<string>();
    
    interactions.forEach(interaction => {
      const stage = this.mapEventToStage(interaction.event_type);
      if (stage) {
        completedStages.add(stage);
      }
    });

    return Array.from(completedStages);
  }

  private static mapEventToStage(eventType: string): string | null {
    for (const [stageName, stageDef] of Object.entries(this.FUNNEL_STAGES)) {
      if (stageDef.events.includes(eventType)) {
        return stageName;
      }
    }
    return null;
  }

  private static checkConversionAchieved(interactions: any[]): boolean {
    return interactions.some(interaction => 
      interaction.event_type === 'ticket_click' || 
      interaction.event_type === 'form_submit'
    );
  }

  private static calculateJourneyRevenue(interactions: any[]): number {
    const conversionEvents = interactions.filter(i => 
      i.event_type === 'ticket_click' || 
      i.event_type === 'form_submit'
    );
    return conversionEvents.length * 50; // Estimated $50 per conversion
  }

  private static calculateOverallConversionRate(stages: FunnelStage[]): number {
    if (stages.length === 0) return 0;
    const firstStage = stages[0];
    const lastStage = stages[stages.length - 1];
    return firstStage.users_entered > 0 ? 
      (lastStage.users_completed / firstStage.users_entered) * 100 : 0;
  }

  private static calculateTotalRevenue(stages: FunnelStage[]): number {
    return stages.reduce((sum, stage) => sum + stage.revenue_attributed, 0);
  }

  private static calculateAverageTimeToConversion(interactions: any[]): number {
    const sessions = this.groupInteractionsBySession(interactions);
    const conversionSessions = sessions.filter(session => 
      session.some(interaction => 
        interaction.event_type === 'ticket_click' || 
        interaction.event_type === 'form_submit'
      )
    );

    if (conversionSessions.length === 0) return 0;

    const totalTime = conversionSessions.reduce((sum, session) => {
      const start = new Date(session[0].occurred_at);
      const end = new Date(session[session.length - 1].occurred_at);
      return sum + (end.getTime() - start.getTime());
    }, 0);

    return totalTime / (conversionSessions.length * (1000 * 60 * 60 * 24)); // days
  }

  private static identifyTopDropOffStages(stages: FunnelStage[]): Array<{
    stage: string;
    drop_off_rate: number;
    users_lost: number;
  }> {
    return stages
      .map(stage => ({
        stage: stage.stage_name,
        drop_off_rate: stage.drop_off_rate,
        users_lost: stage.users_entered - stage.users_completed
      }))
      .sort((a, b) => b.drop_off_rate - a.drop_off_rate)
      .slice(0, 3);
  }

  private static generateRecommendations(stages: FunnelStage[], userType: string): string[] {
    const recommendations = [];

    // Check for high drop-off rates
    const highDropOffStages = stages.filter(stage => stage.drop_off_rate > 50);
    if (highDropOffStages.length > 0) {
      recommendations.push(`Focus on reducing drop-off in ${highDropOffStages.map(s => s.stage_name).join(', ')} stages`);
    }

    // Check for low conversion rates
    const lowConversionStages = stages.filter(stage => stage.conversion_rate < 20);
    if (lowConversionStages.length > 0) {
      recommendations.push(`Improve conversion rates in ${lowConversionStages.map(s => s.stage_name).join(', ')} stages`);
    }

    // User type specific recommendations
    if (userType === 'user') {
      recommendations.push('Consider implementing social proof and user testimonials');
      recommendations.push('Add personalized recommendations based on music taste');
    } else if (userType === 'creator') {
      recommendations.push('Provide detailed analytics and performance metrics');
      recommendations.push('Offer exclusive content and early access features');
    } else if (userType === 'business') {
      recommendations.push('Showcase venue capacity and past successful events');
      recommendations.push('Provide detailed ROI and revenue projections');
    }

    return recommendations;
  }

  private static createEmptyFunnel(userType: string): FunnelAnalysis {
    return {
      funnel_id: `${userType}_funnel_empty`,
      funnel_name: `${userType.charAt(0).toUpperCase() + userType.slice(1)} Conversion Funnel`,
      total_users: 0,
      overall_conversion_rate: 0,
      stages: [],
      total_revenue: 0,
      average_time_to_conversion: 0,
      top_drop_off_stages: [],
      recommendations: ['No data available for analysis']
    };
  }
}
