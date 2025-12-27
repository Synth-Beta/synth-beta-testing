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
import { PassportTasteMapView } from '@/components/passport/PassportTasteMapView';
import { PassportAchievementService } from '@/services/passportAchievementService';
import { Loader2, MapPin, Building2, Music, Sparkles, User, Clock, BarChart3, Award } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PassportEntry } from '@/services/passportService';

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
  const [achievements, setAchievements] = useState<any[]>([]);
  const [nextToUnlock, setNextToUnlock] = useState<NextToUnlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'identity' | 'stamps' | 'achievements' | 'timeline' | 'taste'>('identity');

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
          <TabsList className="grid w-full grid-cols-5">
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
            <TabsTrigger value="taste" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Taste Map
            </TabsTrigger>
          </TabsList>

          <TabsContent value="identity" className="mt-4">
            <PassportIdentity userId={userId} userName={userName} />
          </TabsContent>

          <TabsContent value="stamps" className="mt-4">
            <PassportStampsView stamps={allStamps} loading={loading} />
          </TabsContent>

            <TabsContent value="achievements" className="mt-4">
              {achievements.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No achievements unlocked yet.</p>
                  <p className="text-xs mt-1">Keep attending events and writing reviews to unlock achievements!</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Unlocked Achievements */}
                  {(() => {
                    const unlocked = achievements.filter(a => a.unlocked);
                    if (unlocked.length === 0) return null;
                    
                    return (
                      <div>
                        <div className="flex items-center gap-2 mb-4">
                          <Award className="w-5 h-5 text-yellow-500" />
                          <h3 className="text-lg font-semibold">
                            Unlocked ({unlocked.length})
                          </h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {unlocked.map((achievement) => {
                            const tierColors = {
                              gold: 'bg-yellow-50 border-yellow-300',
                              silver: 'bg-gray-50 border-gray-300',
                              bronze: 'bg-orange-50 border-orange-300',
                            };
                            const progressColors = {
                              gold: 'bg-yellow-500',
                              silver: 'bg-gray-400',
                              bronze: 'bg-orange-400',
                            };
                            const progressPercent = Math.min((achievement.progress / achievement.goal) * 100, 100);
                            
                            return (
                              <Card 
                                key={achievement.id} 
                                className={`border-2 ${tierColors[achievement.tier || 'bronze']}`}
                              >
                                <CardContent className="p-4">
                                  <div className="flex items-start gap-3">
                                    <div className="text-3xl">{achievement.icon}</div>
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between mb-1">
                                        <h4 className="font-semibold">{achievement.name.replace(/\s+\([^)]+\)$/, '')}</h4>
                                        <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs px-2 py-0.5">
                                          ✓ Unlocked
                                        </Badge>
                                      </div>
                                      <p className="text-sm text-muted-foreground mb-3">{achievement.description}</p>
                                      <div className="mb-2">
                                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                          <span>Progress</span>
                                          <span className="font-medium">{achievement.progress} / {achievement.goal}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                          <div 
                                            className={`h-2 rounded-full ${progressColors[achievement.tier || 'bronze']}`}
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
                    );
                  })()}

                  {/* In Progress Achievements */}
                  {(() => {
                    const inProgress = achievements.filter(a => !a.unlocked);
                    if (inProgress.length === 0) return null;
                    
                    return (
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
                            const tierColors = {
                              gold: 'border-yellow-200',
                              silver: 'border-gray-200',
                              bronze: 'border-orange-200',
                            };
                            const progressColors = {
                              gold: 'bg-yellow-400',
                              silver: 'bg-gray-300',
                              bronze: 'bg-orange-300',
                            };
                            
                            return (
                              <Card 
                                key={achievement.id} 
                                className={`border-2 bg-white ${tierColors[achievement.tier || 'bronze']}`}
                              >
                                <CardContent className="p-4">
                                  <div className="flex items-start gap-3">
                                    <div className="text-3xl opacity-60">{achievement.icon}</div>
                                    <div className="flex-1">
                                      <div className="flex items-center justify-between mb-1">
                                        <h4 className="font-semibold">{achievement.name.replace(/\s+\([^)]+\)$/, '')}</h4>
                                        <Award className="w-4 h-4 text-gray-400" />
                                      </div>
                                      <p className="text-sm text-muted-foreground mb-3">{achievement.description}</p>
                                      <div className="mb-2">
                                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                          <span>Progress</span>
                                          <span className="font-medium">{achievement.progress} / {achievement.goal}</span>
                                        </div>
                                        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                                          <div 
                                            className={`h-2 rounded-full ${progressColors[achievement.tier || 'bronze']}`}
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
                    );
                  })()}
                </div>
              )}
            </TabsContent>

          <TabsContent value="timeline" className="mt-4">
            <PassportTimelineView userId={userId} />
          </TabsContent>

          <TabsContent value="taste" className="mt-4">
            <PassportTasteMapView userId={userId} />
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










