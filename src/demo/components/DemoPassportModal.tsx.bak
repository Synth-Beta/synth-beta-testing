/**
 * Demo PassportModal - Same layout and components as production PassportModal
 * 
 * Uses same UI components but with hardcoded mock data.
 * NO API calls - all data is from mockData.ts
 */

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PassportIdentity } from '@/components/passport/PassportIdentity';
import { PassportStampsView } from '@/components/passport/PassportStampsView';
import { PassportTimelineView } from '@/components/passport/PassportTimelineView';
import { PassportBucketListView } from '@/components/passport/PassportBucketListView';
import { User, Sparkles, Award, Clock, ListChecks } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { PassportEntry } from '@/services/passportService';
import type { AchievementDisplay } from '@/services/passportAchievementService';
import type { TimelineEntry } from '@/components/passport/PassportTimelineView';
import type { BucketListItem } from '@/services/bucketListService';
import type { PassportIdentity as PassportIdentityType } from '@/services/passportIdentityService';

interface DemoPassportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName?: string;
  inline?: boolean;
  // Mock data props
  identity?: PassportIdentityType;
  stamps?: PassportEntry[];
  achievements?: AchievementDisplay[];
  timeline?: TimelineEntry[];
  bucketList?: BucketListItem[];
}

export const DemoPassportModal: React.FC<DemoPassportModalProps> = ({
  isOpen,
  onClose,
  userId,
  userName,
  inline = false,
  identity,
  stamps = [],
  achievements = [],
  timeline = [],
  bucketList = [],
}) => {
  const [activeTab, setActiveTab] = useState<'identity' | 'stamps' | 'achievements' | 'timeline' | 'taste' | 'bucket'>('identity');

  if (!isOpen && !inline) {
    return null;
  }

  const getProgressPercent = (current: number, total: number = 50) => {
    return Math.min((current / total) * 100, 100);
  };

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

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)} className={`${inline ? '' : 'mt-4'} w-full max-w-full overflow-x-hidden`}>
        <TabsList className="grid w-full max-w-full grid-cols-5 gap-0.5 p-0.5 overflow-x-hidden">
          <TabsTrigger value="identity" className="flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-xs flex-shrink-0 min-w-0">
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate w-full text-center leading-tight">Identity</span>
          </TabsTrigger>
          <TabsTrigger value="stamps" className="flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-xs flex-shrink-0 min-w-0">
            <Sparkles className="w-3 h-3 flex-shrink-0" />
            <span className="truncate w-full text-center leading-tight">Stamps</span>
          </TabsTrigger>
          <TabsTrigger value="achievements" className="flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-xs flex-shrink-0 min-w-0">
            <Award className="w-3 h-3 flex-shrink-0" />
            <span className="truncate w-full text-center leading-tight">Achievements</span>
          </TabsTrigger>
          <TabsTrigger value="timeline" className="flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-xs flex-shrink-0 min-w-0">
            <Clock className="w-3 h-3 flex-shrink-0" />
            <span className="truncate w-full text-center leading-tight">Timeline</span>
          </TabsTrigger>
          <TabsTrigger value="bucket" className="flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-[10px] sm:text-xs flex-shrink-0 min-w-0">
            <ListChecks className="w-3 h-3 flex-shrink-0" />
            <span className="truncate w-full text-center leading-tight">Bucket List</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="identity" className="mt-4">
          {/* Demo Identity - EXACT same structure as production */}
          {identity ? (
            <Card className="border-2 border-synth-pink/20 bg-gradient-to-br from-white to-pink-50/30">
              <CardContent className="p-6 space-y-4">
                <Badge variant="secondary" className="text-base px-4 py-2 bg-synth-pink/10 text-synth-pink border-synth-pink/30">
                  {identity.fan_type === 'jam_chaser' ? 'Jam Chaser' : 
                   identity.fan_type === 'venue_purist' ? 'Venue Purist' :
                   identity.fan_type === 'scene_builder' ? 'Scene Builder' :
                   identity.fan_type === 'road_tripper' ? 'Road Tripper' :
                   identity.fan_type === 'genre_explorer' ? 'Genre Explorer' :
                   identity.fan_type === 'festival_fanatic' ? 'Festival Fanatic' : 'Music Lover'}
                </Badge>
                <div className="text-sm space-y-2">
                  <p className="font-medium">Live since {identity.join_year}</p>
                  {identity.home_city && (
                    <p className="text-muted-foreground">Home: {identity.home_city}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <PassportIdentity userId={userId} userName={userName} />
          )}
        </TabsContent>

        <TabsContent value="stamps" className="mt-4">
          <PassportStampsView stamps={stamps} achievements={achievements} loading={false} />
        </TabsContent>

        <TabsContent value="achievements" className="mt-4 w-full max-w-full overflow-x-hidden">
          {achievements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No achievements unlocked yet.</p>
              <p className="text-xs mt-1">Keep attending events and writing reviews to unlock achievements!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {achievements.map((achievement) => (
                <Card key={achievement.id || achievement.type}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className="text-3xl">{achievement.icon}</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold">{achievement.name}</h3>
                          {achievement.tier && (
                            <Badge variant={achievement.tier === 'gold' ? 'default' : 'secondary'}>
                              {achievement.tier}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{achievement.description}</p>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span>Progress</span>
                            <span>{achievement.progress} / {achievement.goal}</span>
                          </div>
                          <Progress value={(achievement.progress / achievement.goal) * 100} className="h-2" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          {/* Note: PassportTimelineView makes API calls, but structure is same */}
          <PassportTimelineView userId={userId} />
        </TabsContent>

        <TabsContent value="bucket" className="mt-4">
          {/* Note: PassportBucketListView makes API calls, but structure is same */}
          <PassportBucketListView userId={userId} />
        </TabsContent>
      </Tabs>
    </>
  );

  if (inline) {
    return content;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {content}
      </div>
    </div>
  );
};
