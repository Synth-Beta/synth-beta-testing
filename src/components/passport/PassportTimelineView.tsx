import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pin, PinOff, Calendar, Music, MapPin } from 'lucide-react';
import { PassportService } from '@/services/passportService';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';

interface TimelineEntry {
  id: string;
  event_id: string | null;
  review_id: string | null;
  is_pinned: boolean;
  is_auto_selected: boolean;
  significance: string | null;
  created_at: string;
  event?: {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
  } | null;
  review?: {
    id: string;
    rating: number;
    review_text: string | null;
  } | null;
}

interface PassportTimelineViewProps {
  userId: string;
}

export const PassportTimelineView: React.FC<PassportTimelineViewProps> = ({ userId }) => {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinnedCount, setPinnedCount] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    loadTimeline();
  }, [userId]);

  const loadTimeline = async () => {
    setLoading(true);
    try {
      const data = await PassportService.getTimeline(userId);
      setTimeline(data as TimelineEntry[]);
      setPinnedCount(data.filter((t: TimelineEntry) => t.is_pinned).length);
    } catch (error) {
      console.error('Error loading timeline:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePinToggle = async (timelineId: string, currentlyPinned: boolean) => {
    try {
      if (currentlyPinned) {
        await PassportService.unpinTimelineEvent(userId, timelineId);
        toast({
          title: 'Unpinned',
          description: 'Event removed from pinned timeline',
        });
      } else {
        if (pinnedCount >= 5) {
          toast({
            title: 'Maximum pins reached',
            description: 'You can pin a maximum of 5 timeline events',
            variant: 'destructive',
          });
          return;
        }
        // Find the timeline entry and pin it
        const entry = timeline.find(t => t.id === timelineId);
        if (entry?.event_id) {
          await PassportService.pinTimelineEvent(userId, entry.event_id, entry.review_id || undefined);
          toast({
            title: 'Pinned',
            description: 'Event pinned to timeline',
          });
        }
      }
      await loadTimeline();
    } catch (error) {
      console.error('Error toggling pin:', error);
      toast({
        title: 'Error',
        description: 'Failed to update pin status',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (timeline.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No timeline highlights yet.</p>
        <p className="text-xs mt-1">Significant moments will appear here as you attend more events.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sort: Pinned first, then by date */}
      {[...timeline].sort((a, b) => {
        if (a.is_pinned && !b.is_pinned) return -1;
        if (!a.is_pinned && b.is_pinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }).map((entry) => (
        <Card key={entry.id} className={entry.is_pinned ? 'border-2 border-synth-pink' : ''}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {entry.event && (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <h4 className="font-semibold">{entry.event.artist_name}</h4>
                      {entry.is_pinned && (
                        <Badge variant="secondary" className="bg-synth-pink/10 text-synth-pink">
                          <Pin className="w-3 h-3 mr-1" />
                          Pinned
                        </Badge>
                      )}
                      {entry.is_auto_selected && !entry.is_pinned && (
                        <Badge variant="outline" className="text-xs">
                          Auto-selected
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-2">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {entry.event.venue_name}
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(entry.event.event_date), 'MMM d, yyyy')}
                      </div>
                    </div>
                  </>
                )}
                {entry.significance && (
                  <p className="text-sm text-muted-foreground italic mb-2">
                    {entry.significance}
                  </p>
                )}
                {entry.review && entry.review.review_text && (
                  <p className="text-sm mt-2 line-clamp-2">{entry.review.review_text}</p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handlePinToggle(entry.id, entry.is_pinned)}
                disabled={!entry.is_pinned && pinnedCount >= 5}
              >
                {entry.is_pinned ? (
                  <PinOff className="w-4 h-4" />
                ) : (
                  <Pin className="w-4 h-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

