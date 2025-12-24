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
import { Loader2, MapPin, Building2, Music, Sparkles } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface PassportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export const PassportModal: React.FC<PassportModalProps> = ({
  isOpen,
  onClose,
  userId,
}) => {
  const [progress, setProgress] = useState<PassportProgress>({
    cities: [],
    venues: [],
    artists: [],
    scenes: [],
    totalCount: 0,
  });
  const [nextToUnlock, setNextToUnlock] = useState<NextToUnlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'cities' | 'venues' | 'artists' | 'scenes'>('cities');

  useEffect(() => {
    if (isOpen) {
      loadPassportData();
    }
  }, [isOpen, userId]);

  const loadPassportData = async () => {
    setLoading(true);
    try {
      const [progressData, nextData] = await Promise.all([
        PassportService.getPassportProgress(userId),
        PassportService.getNextToUnlock(userId),
      ]);
      setProgress(progressData);
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Live Music Passport</DialogTitle>
          <DialogDescription>
            Track your cultural progress through cities, venues, artists, and scenes
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6 mt-4">
            {/* Overall Progress */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total Unlocked</span>
                <span className="text-sm font-bold">{progress.totalCount}</span>
              </div>
              <Progress value={getProgressPercent(progress.totalCount, 200)} className="h-2" />
            </div>

            {/* Next to Unlock */}
            {nextToUnlock.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Next to Unlock</h3>
                <div className="space-y-2">
                  {nextToUnlock.map((hint, index) => (
                    <div
                      key={index}
                      className="p-3 rounded-lg border bg-muted/50 text-sm"
                    >
                      <p className="font-medium">{hint.entity_name}</p>
                      <p className="text-muted-foreground text-xs mt-1">{hint.hint}</p>
                      {hint.progress !== undefined && hint.goal !== undefined && (
                        <div className="mt-2">
                          <Progress
                            value={getProgressPercent(hint.progress, hint.goal)}
                            className="h-1"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="cities" className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Cities ({progress.cities.length})
                </TabsTrigger>
                <TabsTrigger value="venues" className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Venues ({progress.venues.length})
                </TabsTrigger>
                <TabsTrigger value="artists" className="flex items-center gap-2">
                  <Music className="w-4 h-4" />
                  Artists ({progress.artists.length})
                </TabsTrigger>
                <TabsTrigger value="scenes" className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Scenes ({progress.scenes.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="cities" className="mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {progress.cities.length === 0 ? (
                    <div className="col-span-full text-center py-8 text-muted-foreground">
                      <p>No cities unlocked yet.</p>
                      <p className="text-xs mt-1">Attend events in different cities to unlock them!</p>
                    </div>
                  ) : (
                    progress.cities.map((entry) => (
                      <PassportBadge key={entry.id} entry={entry} />
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="venues" className="mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {progress.venues.length === 0 ? (
                    <div className="col-span-full text-center py-8 text-muted-foreground">
                      <p>No venues unlocked yet.</p>
                      <p className="text-xs mt-1">Attend events at iconic venues to unlock them!</p>
                    </div>
                  ) : (
                    progress.venues.map((entry) => (
                      <PassportBadge key={entry.id} entry={entry} />
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="artists" className="mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {progress.artists.length === 0 ? (
                    <div className="col-span-full text-center py-8 text-muted-foreground">
                      <p>No artists unlocked yet.</p>
                      <p className="text-xs mt-1">See artists live to unlock them!</p>
                    </div>
                  ) : (
                    progress.artists.map((entry) => (
                      <PassportBadge key={entry.id} entry={entry} />
                    ))
                  )}
                </div>
              </TabsContent>

              <TabsContent value="scenes" className="mt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {progress.scenes.length === 0 ? (
                    <div className="col-span-full text-center py-8 text-muted-foreground">
                      <p>No scenes unlocked yet.</p>
                      <p className="text-xs mt-1">Participate in music scenes to unlock them!</p>
                    </div>
                  ) : (
                    progress.scenes.map((entry) => (
                      <PassportBadge key={entry.id} entry={entry} />
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

