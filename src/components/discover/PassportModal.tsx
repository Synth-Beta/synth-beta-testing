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
import { Icon } from '@/components/Icon/Icon';
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
          <Icon name="refresh" size={24} className="animate-spin" color="var(--neutral-600)" />
        </div>
      ) : (
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className={`${inline ? '' : 'mt-4'} w-full max-w-full overflow-x-hidden`}>
          <TabsList className="grid w-full max-w-full grid-cols-5 gap-0.5 p-0.5 overflow-x-hidden">
            <TabsTrigger value="identity" className="flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-xs flex-shrink-0 min-w-0">
              <Icon name="user" size={16} className="flex-shrink-0" color="var(--neutral-900)" />
              <span className="truncate w-full text-center leading-tight">Identity</span>
            </TabsTrigger>
            <TabsTrigger value="stamps" className="flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-xs flex-shrink-0 min-w-0">
              <Icon name="mediumShootingStar" size={16} className="flex-shrink-0" color="var(--neutral-900)" />
              <span className="truncate w-full text-center leading-tight">
                Stamps
              </span>
            </TabsTrigger>
            <TabsTrigger value="achievements" className="flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-xs flex-shrink-0 min-w-0">
              <Icon name="ribbonAward" size={16} className="flex-shrink-0" color="var(--neutral-900)" />
              <span className="truncate w-full text-center leading-tight">
                Achievements
              </span>
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-xs flex-shrink-0 min-w-0">
              <Icon name="clock" size={16} className="flex-shrink-0" color="var(--neutral-900)" />
              <span className="truncate w-full text-center leading-tight">Timeline</span>
            </TabsTrigger>
            <TabsTrigger value="bucket" className="flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-xs flex-shrink-0 min-w-0">
              <Icon name="checkMark" size={16} className="flex-shrink-0" color="var(--neutral-900)" />
              <span className="truncate w-full text-center leading-tight">Bucket List</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="identity" className="mt-4">
            <PassportIdentity userId={userId} userName={userName} />
          </TabsContent>

          <TabsContent value="stamps" className="mt-4">
            <PassportStampsView stamps={allStamps} achievements={achievements} loading={loading} />
          </TabsContent>

            <TabsContent value="achievements" className="mt-4 w-full max-w-full overflow-x-hidden">
              {achievements.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No achievements unlocked yet.</p>
                  <p className="text-xs mt-1">Keep attending events and writing reviews to unlock achievements!</p>
                </div>
              ) : (
                <div className="space-y-3 w-full max-w-full overflow-x-hidden">
                  {achievements.map((achievement) => {
                    const progressPercent = achievement.goal > 0 ? Math.min((achievement.progress / achievement.goal) * 100, 100) : 0;
                    
                    return (
                      <div
                        key={achievement.id || achievement.type}
                        className={`flex gap-[6px] items-center px-6 py-3 rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] w-full max-w-full ${
                          achievement.unlocked
                            ? 'bg-[#fcfcfc] border border-[#5d646f]'
                            : 'bg-[rgba(201,201,201,0.5)] border border-[#5d646f]'
                        }`}
                      >
                        {/* Icon */}
                        <p className="font-bold text-[35px] leading-[normal] flex-shrink-0">
                          {achievement.icon || '🏆'}
                        </p>
                        
                        {/* Main Content */}
                        <div className="flex flex-col gap-[6px] items-start justify-center flex-1 min-w-0">
                          {/* Name */}
                          <p className="font-bold leading-[normal] text-[20px] text-black break-words">
                            {achievement.name}
                          </p>
                          
                          {/* Description */}
                          <p className="font-normal leading-[normal] text-[#5d646f] text-[16px] break-words whitespace-pre-wrap">
                            {achievement.description}
                          </p>
                          
                          {achievement.unlocked ? (
                            /* Unlocked Badge */
                            <div className="bg-[#fdf2f7] flex gap-3 h-[22px] items-center px-3 py-3 rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] mt-1">
                              <svg
                                width="15"
                                height="12"
                                viewBox="0 0 15 12"
                                fill="none"
                                xmlns="http://www.w3.org/2000/svg"
                                className="w-[17px] h-[17px]"
                              >
                                <path
                                  d="M1 6L5 10L14 1"
                                  stroke="#b00056"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              <p className="font-normal leading-[normal] text-[16px] text-[#b00056]">
                                Unlocked
                              </p>
                                      </div>
                          ) : (
                            /* Progress Section */
                            <div className="w-full mt-1">
                              {/* Progress Bar */}
                              <div className="bg-[rgba(201,201,201,0.5)] border border-[#5d646f] h-[10px] rounded-[10px] overflow-hidden relative w-full mb-1">
                                <div
                                  className="absolute bg-[#cc2486] border border-[#5d646f] h-[10px] rounded-l-[10px]"
                                            style={{ width: `${progressPercent}%` }}
                                />
                                        </div>
                              
                              {/* Progress Text */}
                              <p className="font-normal leading-[normal] text-[#5d646f] text-[16px] text-right w-full">
                                {achievement.progress}/{achievement.goal}
                                        </p>
                      </div>
                        )}
                        </div>
                      </div>
                    );
                  })}
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










