import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PassportBadge } from './PassportBadge';
import { PassportService, type PassportProgress, type NextToUnlock } from '@/services/passportService';
import { PassportIdentity } from '@/components/passport/PassportIdentity';
import { PassportStampsView } from '@/components/passport/PassportStampsView';
import { PassportTimelineView } from '@/components/passport/PassportTimelineView';
import { PassportBucketListView } from '@/components/passport/PassportBucketListView';
import { PassportAchievementService, type AchievementDisplay } from '@/services/passportAchievementService';
import { Loader2, MapPin, Building2, Music, Sparkles, User, Clock, Award, ListChecks } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PassportEntry } from '@/services/passportService';

interface ProcessedAchievement extends AchievementDisplay {
  completedTier?: 'bronze' | 'silver' | 'gold' | null;
  bronzeGoal?: number;
  silverGoal?: number;
  goldGoal?: number;
}

interface PassportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName?: string;
  inline?: boolean; // If true, render without Dialog wrapper
}

export const PassportModal: React.FC<PassportModalProps> = ({
  isOpen,
  onClose,
  userId,
  userName,
  inline = false,
}) => {
  const [progress, setProgress] = useState<PassportProgress>({
    cities: [],
    venues: [],
    artists: [],
    scenes: [],
    totalCount: 0,
  });
  const [allStamps, setAllStamps] = useState<PassportEntry[]>([]);
  const [achievements, setAchievements] = useState<AchievementDisplay[]>([]);
  const [nextToUnlock, setNextToUnlock] = useState<NextToUnlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'identity' | 'stamps' | 'achievements' | 'timeline' | 'taste' | 'bucket'>('identity');

  useEffect(() => {
    if (isOpen || inline) {
      loadPassportData();
    }
  }, [isOpen, inline, userId]);

  const loadPassportData = async () => {
    setLoading(true);
    try {
      const [progressData, stampsData, achievementsData, nextData] = await Promise.all([
        PassportService.getPassportProgress(userId),
        PassportService.getStampsByRarity(userId),
        PassportAchievementService.getBehavioralAchievements(userId),
        PassportService.getNextToUnlock(userId),
      ]);
      setProgress(progressData);
      setAllStamps(stampsData);
      setAchievements(achievementsData);
      setNextToUnlock(nextData);
    } catch (error) {
      console.error('Error loading passport data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getProgressPercent = (current: number, total: number = 50) => {
    return Math.min((current / total) * 100, 100);
  };

  if (!isOpen) {
    return null;
  }

  const content = (
    <>
      {inline && (
        <div className="mb-6">
          <h2 className="text-2xl font-bold gradient-text">Live Music Passport</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Your curated, earned, and evolving snapshot of your live-music journey
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className={inline ? '' : 'mt-4'}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="identity" className="flex items-center gap-2">
              <User className="w-4 h-4" />
              Identity
            </TabsTrigger>
            <TabsTrigger value="stamps" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Stamps ({allStamps.length})
            </TabsTrigger>
            <TabsTrigger value="achievements" className="flex items-center gap-2">
              <Award className="w-4 h-4" />
              Achievements ({achievements.length})
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="bucket" className="flex items-center gap-2">
              <ListChecks className="w-4 h-4" />
              Bucket List
            </TabsTrigger>
          </TabsList>

          <TabsContent value="identity" className="mt-4">
            <PassportIdentity userId={userId} userName={userName} />
          </TabsContent>

          <TabsContent value="stamps" className="mt-4">
            <PassportStampsView stamps={allStamps} achievements={achievements} loading={loading} />
          </TabsContent>

            <TabsContent value="achievements" className="mt-4">
              {achievements.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No achievements unlocked yet.</p>
                  <p className="text-xs mt-1">Keep attending events and writing reviews to unlock achievements!</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {(() => {
                    // Group achievements by type
                    const groupedByType = new Map<string, AchievementDisplay[]>();
                    achievements.forEach(achievement => {
                      if (!groupedByType.has(achievement.type)) {
                        groupedByType.set(achievement.type, []);
                      }
                      groupedByType.get(achievement.type)!.push(achievement);
                    });

                    // Convert to array and process each group
                    const processedAchievements = Array.from(groupedByType.entries()).map(([type, tierAchievements]) => {
                      // Sort by tier: bronze, silver, gold
                      tierAchievements.sort((a, b) => {
                        const tierOrder = { bronze: 0, silver: 1, gold: 2 };
                        return (tierOrder[a.tier || 'bronze'] || 0) - (tierOrder[b.tier || 'bronze'] || 0);
                      });

                      // Get all tiers - we need to find the goals from any tier that has them
                      // The goals are consistent across tiers for the same achievement type
                      const goldTier = tierAchievements.find(a => a.tier === 'gold');
                      const silverTier = tierAchievements.find(a => a.tier === 'silver');
                      const bronzeTier = tierAchievements.find(a => a.tier === 'bronze');

                      // Get goals - check metadata or use the goal from each tier
                      // Since all tiers share the same progress, we can get goals from any tier
                      // But we need to get the actual tier-specific goals
                      // For now, use the goals from the tier objects, or infer from the service
                      let bronzeGoal = bronzeTier?.goal || 0;
                      let silverGoal = silverTier?.goal || 0;
                      let goldGoal = goldTier?.goal || 0;
                      
                      // If we don't have all goals, try to get them from the achievement info
                      // We'll need to call the service method to get the goals
                      if (!bronzeGoal || !silverGoal || !goldGoal) {
                        // Get goals from the service's getAchievementInfo method
                        // For now, we'll use standard goals based on achievement type
                        // This is a fallback - ideally the RPC should return all goals
                        const getStandardGoals = (achievementType: string) => {
                          const goals: Record<string, { bronze: number; silver: number; gold: number }> = {
                            venue_hopper: { bronze: 3, silver: 7, gold: 15 },
                            scene_explorer: { bronze: 2, silver: 4, gold: 7 },
                            city_crosser: { bronze: 2, silver: 5, gold: 10 },
                            era_walker: { bronze: 2, silver: 3, gold: 5 },
                            first_through_door: { bronze: 1, silver: 3, gold: 6 },
                            trusted_voice: { bronze: 3, silver: 10, gold: 25 },
                            deep_cut_reviewer: { bronze: 2, silver: 5, gold: 10 },
                            scene_regular: { bronze: 3, silver: 6, gold: 10 },
                            road_tripper: { bronze: 1, silver: 3, gold: 6 },
                            venue_loyalist: { bronze: 3, silver: 6, gold: 10 },
                            genre_blender: { bronze: 2, silver: 4, gold: 6 },
                            memory_maker: { bronze: 1, silver: 3, gold: 5 },
                            early_adopter: { bronze: 1, silver: 3, gold: 5 },
                            connector: { bronze: 2, silver: 5, gold: 10 },
                            passport_complete: { bronze: 5, silver: 10, gold: 15 },
                          };
                          return goals[achievementType] || { bronze: 0, silver: 0, gold: 0 };
                        };
                        
                        const standardGoals = getStandardGoals(type);
                        if (!bronzeGoal) bronzeGoal = standardGoals.bronze;
                        if (!silverGoal) silverGoal = standardGoals.silver;
                        if (!goldGoal) goldGoal = standardGoals.gold;
                      }

                      // Use the highest goal (gold if available, otherwise silver, otherwise bronze)
                      const highestGoal = goldGoal || silverGoal || bronzeGoal || 0;
                      const currentProgress = goldTier?.progress || silverTier?.progress || bronzeTier?.progress || 0;

                      // Determine which tier is completed (highest unlocked tier)
                      let completedTier: 'bronze' | 'silver' | 'gold' | null = null;
                      if (goldTier?.unlocked) {
                        completedTier = 'gold';
                      } else if (silverTier?.unlocked) {
                        completedTier = 'silver';
                      } else if (bronzeTier?.unlocked) {
                        completedTier = 'bronze';
                      }

                      // Get base achievement info (use bronze for name/icon)
                      const baseAchievement = bronzeTier || silverTier || goldTier || tierAchievements[0];
                      
                      // Get base description (without tier label)
                      const baseDescription = bronzeTier?.description?.replace(/\([^)]+\)\s*$/, '').trim() || 
                                             baseAchievement.description?.replace(/\([^)]+\)\s*$/, '').trim() || 
                                             '';

                      return {
                        ...baseAchievement,
                        type,
                        progress: currentProgress,
                        goal: highestGoal,
                        completedTier,
                        bronzeGoal,
                        silverGoal,
                        goldGoal,
                        description: baseDescription,
                        unlocked: !!completedTier,
                        unlocked_at: goldTier?.unlocked_at || silverTier?.unlocked_at || bronzeTier?.unlocked_at,
                      } as ProcessedAchievement;
                    });

                    // Separate into unlocked and in progress
                    const unlocked = processedAchievements.filter(a => a.unlocked);
                    const inProgress = processedAchievements.filter(a => !a.unlocked);
                    
                    return (
                      <>
                        {/* Unlocked Achievements */}
                        {unlocked.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <Award className="w-5 h-5 text-yellow-500" />
                          <h3 className="text-lg font-semibold">
                            Unlocked ({unlocked.length})
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {unlocked.map((achievement) => {
                                const progressPercent = Math.min((achievement.progress / achievement.goal) * 100, 100);
                                
                                // Determine current tier based on progress
                                let currentTier: 'bronze' | 'silver' | 'gold' = 'bronze';
                                if (achievement.goldGoal > 0 && achievement.progress >= achievement.goldGoal) {
                                  currentTier = 'gold';
                                } else if (achievement.silverGoal > 0 && achievement.progress >= achievement.silverGoal) {
                                  currentTier = 'silver';
                                } else if (achievement.bronzeGoal > 0 && achievement.progress >= achievement.bronzeGoal) {
                                  currentTier = 'bronze';
                                }
                                
                                // Color based on current tier
                                const cardColors = {
                                  gold: 'bg-white border-yellow-400 border-2',
                                  silver: 'bg-white border-gray-400 border-2',
                                  bronze: 'bg-white border-orange-400 border-2',
                            };
                                
                                const progressBarColors = {
                              gold: 'bg-yellow-500',
                              silver: 'bg-gray-400',
                              bronze: 'bg-orange-400',
                            };

                                const cardColor = cardColors[currentTier];
                                const progressColor = progressBarColors[currentTier];
                            
                            return (
                              <Card 
                                    key={achievement.type} 
                                    className={cardColor}
                              >
                                <CardContent className="p-4">
                                  <div className="flex items-start gap-3">
                                    <div className="text-3xl">{achievement.icon}</div>
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between mb-1">
                                        <h4 className="font-semibold">{achievement.name.replace(/\s+\([^)]+\)$/, '')}</h4>
                                            <div className="flex items-center gap-1">
                                              {achievement.completedTier === 'gold' && (
                                                <span className="text-yellow-600 text-lg">⭐</span>
                                              )}
                                        <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs px-2 py-0.5">
                                                ✓ {achievement.completedTier?.charAt(0).toUpperCase() + achievement.completedTier?.slice(1)}
                                        </Badge>
                                      </div>
                                          </div>
                                          <p className="text-sm text-muted-foreground mb-2">{achievement.description || baseAchievement.description}</p>
                                          {/* Tier goals */}
                                          <div className="flex items-center gap-2 mb-3 text-xs">
                                            {achievement.bronzeGoal > 0 && (
                                              <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
                                                Bronze: {achievement.bronzeGoal}
                                              </span>
                                            )}
                                            {achievement.silverGoal > 0 && (
                                              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                                                Silver: {achievement.silverGoal}
                                              </span>
                                            )}
                                            {achievement.goldGoal > 0 && (
                                              <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">
                                                Gold: {achievement.goldGoal}
                                              </span>
                                            )}
                                          </div>
                                      <div className="mb-2">
                                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                          <span>Progress</span>
                                          <span className="font-medium">{achievement.progress} / {achievement.goal}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                          <div 
                                                className={`h-2 rounded-full ${progressColor}`}
                                            style={{ width: `${progressPercent}%` }}
                                          ></div>
                                        </div>
                                      </div>
                                      {achievement.unlocked_at && (
                                        <p className="text-xs text-muted-foreground mt-2">
                                          Unlocked {new Date(achievement.unlocked_at).toLocaleDateString()}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                        )}

                  {/* In Progress Achievements */}
                        {inProgress.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <Award className="w-5 h-5 text-gray-400" />
                          <h3 className="text-lg font-semibold">
                            In Progress ({inProgress.length})
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {inProgress.map((achievement) => {
                            const progressPercent = Math.min((achievement.progress / achievement.goal) * 100, 100);
                                
                                // Determine current tier based on progress
                                let currentTier: 'bronze' | 'silver' | 'gold' = 'bronze';
                                if (achievement.goldGoal > 0 && achievement.progress >= achievement.goldGoal) {
                                  currentTier = 'gold';
                                } else if (achievement.silverGoal > 0 && achievement.progress >= achievement.silverGoal) {
                                  currentTier = 'silver';
                                } else if (achievement.bronzeGoal > 0 && achievement.progress >= achievement.bronzeGoal) {
                                  currentTier = 'bronze';
                                } else {
                                  // Not yet at bronze - determine which tier they're working toward
                                  if (achievement.bronzeGoal > 0 && achievement.progress < achievement.bronzeGoal) {
                                    currentTier = 'bronze';
                                  } else if (achievement.silverGoal > 0 && achievement.progress < achievement.silverGoal) {
                                    currentTier = 'silver';
                                  } else {
                                    currentTier = 'gold';
                                  }
                                }
                                
                                // Color based on current tier
                                const cardColors = {
                                  gold: 'bg-white border-yellow-400 border-2',
                                  silver: 'bg-white border-gray-400 border-2',
                                  bronze: 'bg-white border-orange-400 border-2',
                            };
                                
                                const progressBarColors = {
                                  gold: 'bg-yellow-500',
                                  silver: 'bg-gray-400',
                                  bronze: 'bg-orange-400',
                            };

                                const cardColor = cardColors[currentTier];
                                const progressColor = progressBarColors[currentTier];
                            
                            return (
                              <Card 
                                    key={achievement.type} 
                                    className={cardColor}
                              >
                                <CardContent className="p-4">
                                  <div className="flex items-start gap-3">
                                    <div className="text-3xl opacity-60">{achievement.icon}</div>
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between mb-1">
                                        <h4 className="font-semibold">{achievement.name.replace(/\s+\([^)]+\)$/, '')}</h4>
                                        <Award className="w-4 h-4 text-gray-400" />
                                      </div>
                                          <p className="text-sm text-muted-foreground mb-2">{achievement.description}</p>
                                          {/* Tier goals */}
                                          <div className="flex items-center gap-2 mb-3 text-xs">
                                            {achievement.bronzeGoal > 0 && (
                                              <span className="px-2 py-0.5 rounded bg-orange-100 text-orange-700 font-medium">
                                                Bronze: {achievement.bronzeGoal}
                                              </span>
                                            )}
                                            {achievement.silverGoal > 0 && (
                                              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium">
                                                Silver: {achievement.silverGoal}
                                              </span>
                                            )}
                                            {achievement.goldGoal > 0 && (
                                              <span className="px-2 py-0.5 rounded bg-yellow-100 text-yellow-700 font-medium">
                                                Gold: {achievement.goldGoal}
                                              </span>
                                            )}
                                          </div>
                                      <div className="mb-2">
                                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                          <span>Progress</span>
                                          <span className="font-medium">{achievement.progress} / {achievement.goal}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                          <div 
                                                className={`h-2 rounded-full ${progressColor}`}
                                            style={{ width: `${progressPercent}%` }}
                                          ></div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            <PassportTimelineView userId={userId} />
          </TabsContent>

          <TabsContent value="bucket" className="mt-4 relative overflow-visible">
            <PassportBucketListView userId={userId} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );

  if (inline) {
    return <div className="w-full">{content}</div>;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Live Music Passport</DialogTitle>
          <DialogDescription>
            Your curated, earned, and evolving snapshot of your live-music journey
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  );
};










