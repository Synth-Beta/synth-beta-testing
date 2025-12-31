import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Pin, PinOff, Calendar, Music, MapPin, Star, Award, 
  Sparkles, TrendingUp, Camera, FileText, Users, Zap, Plus, Edit2 
} from 'lucide-react';
import { PassportService } from '@/services/passportService';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { TimelineEntryModal } from './TimelineEntryModal';

interface TimelineEntry {
  id: string;
  review_id: string | null;
  is_pinned: boolean;
  is_auto_selected: boolean;
  significance: string | null;
  description: string | null;
  Event_name: string | null;
  created_at: string;
  review?: {
    id: string;
    rating: number;
    review_text: string | null;
    Event_date: string;
    event_id: string | null;
  } | null;
}

interface PassportTimelineViewProps {
  userId: string;
}

export const PassportTimelineView: React.FC<PassportTimelineViewProps> = ({ userId }) => {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinnedCount, setPinnedCount] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<TimelineEntry | null>(null);
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
        if (entry?.review_id) {
          await PassportService.pinTimelineEvent(userId, entry.review_id);
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

  // Get icon and styling based on significance text
  const getMilestoneInfo = (entry: TimelineEntry) => {
    if (!entry.significance) {
      return { icon: Sparkles, color: 'text-synth-pink', bg: 'bg-synth-pink/10' };
    }
    
    const sig = entry.significance.toLowerCase();
    
    // Firsts
    if (sig.includes('first review')) {
      return { icon: Zap, color: 'text-yellow-600', bg: 'bg-yellow-100' };
    }
    if (sig.includes('first time seeing')) {
      return { icon: Music, color: 'text-blue-600', bg: 'bg-blue-100' };
    }
    if (sig.includes('first time at')) {
      return { icon: MapPin, color: 'text-purple-600', bg: 'bg-purple-100' };
    }
    
    // Best setlist
    if (sig.includes('best setlist')) {
      return { icon: FileText, color: 'text-indigo-600', bg: 'bg-indigo-100' };
    }
    
    // Special show / custom
    return { icon: Star, color: 'text-pink-600', bg: 'bg-pink-100' };
  };

  // Sort timeline - must be called before early returns (hooks rule)
  const sortedTimeline = useMemo(() => {
    return [...timeline].sort((a, b) => {
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [timeline]);

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  const handleAddMilestone = () => {
    setEditingEntry(null);
    setModalOpen(true);
  };

  const handleEditMilestone = (entry: TimelineEntry) => {
    setEditingEntry(entry);
    setModalOpen(true);
  };

  const handleModalSuccess = () => {
    loadTimeline();
  };

  const handleDeleteEntry = async (entryId: string) => {
    try {
      await PassportService.deleteTimelineEntry(userId, entryId);
      toast({
        title: 'Deleted',
        description: 'Timeline entry removed',
      });
      await loadTimeline();
    } catch (error) {
      console.error('Error deleting timeline entry:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete timeline entry',
        variant: 'destructive',
      });
    }
  };

  if (timeline.length === 0) {
    return (
      <>
        <div className="text-center py-12 text-muted-foreground">
          <Sparkles className="w-12 h-12 mx-auto mb-4 text-synth-pink/30" />
          <p className="font-medium">No timeline highlights yet.</p>
          <p className="text-sm mt-2">Mark special moments in your music journey.</p>
          <Button onClick={handleAddMilestone} className="mt-4" variant="default">
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Milestone
          </Button>
        </div>
        <TimelineEntryModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          userId={userId}
          existingReviewId={editingEntry?.review_id || undefined}
          existingSignificance={editingEntry?.significance || undefined}
          existingDescription={editingEntry?.description || undefined}
          onSuccess={handleModalSuccess}
        />
      </>
    );
  }

  return (
    <>
      <div className="relative">
        {/* Add Milestone Button */}
        <div className="mb-6 flex justify-end">
          <Button onClick={handleAddMilestone} variant="outline" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Milestone
          </Button>
        </div>

        {/* Timeline line - positioned to align with center of nodes */}
        <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-synth-pink/30 via-synth-pink/40 to-synth-pink/20" />
      
      <div className="space-y-8">
        {sortedTimeline.map((entry, index) => {
          const milestoneInfo = getMilestoneInfo(entry);
          const Icon = milestoneInfo.icon;
          const eventDate = entry.review?.Event_date ? new Date(entry.review.Event_date) : new Date(entry.created_at);
          const canEdit = !entry.is_auto_selected;
          
          return (
            <div key={entry.id} className="relative pl-20">
              {/* Timeline node with date - centered on the line */}
              <div className="absolute left-5 top-0 flex flex-col items-center -translate-x-1/2">
                {/* Date badge above icon */}
                <div className={cn(
                  "mb-2 px-2 py-1 rounded-md text-xs font-semibold whitespace-nowrap shadow-sm",
                  entry.is_pinned 
                    ? "bg-synth-pink text-white" 
                    : "bg-gray-100 text-gray-700"
                )}>
                  {format(eventDate, 'MMM d, yyyy')}
                </div>
                
                {/* Icon circle */}
                <div className={cn(
                  "w-12 h-12 rounded-full border-2 border-white shadow-lg flex items-center justify-center z-10 transition-all duration-300",
                  entry.is_pinned 
                    ? "bg-synth-pink ring-4 ring-synth-pink/30 scale-110 shadow-xl shadow-synth-pink/40" 
                    : `${milestoneInfo.bg} ring-2 ring-white/80`
                )}>
                  <Icon className={cn("w-6 h-6", entry.is_pinned ? "text-white" : milestoneInfo.color)} />
                </div>
              </div>
              
              {/* Card */}
              <Card className={cn(
                "relative overflow-hidden transition-all duration-300 hover:shadow-xl",
                entry.is_pinned 
                  ? "border-2 border-synth-pink shadow-lg shadow-synth-pink/20 bg-gradient-to-br from-white to-synth-pink/5" 
                  : "border border-gray-200 bg-white hover:border-synth-pink/30"
              )}>
                <CardContent className="p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Significance/Milestone Text - PROMINENT! */}
                      {entry.significance && (
                        <div className="mb-4">
                          <div className={cn(
                            "inline-flex items-center gap-2 px-4 py-2 rounded-lg font-bold text-lg mb-3",
                            entry.is_pinned 
                              ? "bg-synth-pink/10 text-synth-pink border-2 border-synth-pink/30"
                              : `${milestoneInfo.bg} ${milestoneInfo.color} border-2 border-current/20`
                          )}>
                            <Icon className="w-5 h-5" />
                            <span>{entry.significance}</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Event Name */}
                      {entry.Event_name && (
                        <h4 className="font-bold text-xl text-gray-900 mb-3">
                          {entry.Event_name}
                        </h4>
                      )}
                      
                      {/* Star Rating */}
                      {entry.review?.rating && (
                        <div className="flex items-center gap-1.5 mb-4">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={cn(
                                "w-5 h-5 transition-colors",
                                i < Math.round(entry.review!.rating!)
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "fill-gray-200 text-gray-200"
                              )}
                            />
                          ))}
                          <span className="text-sm font-semibold text-gray-700 ml-1">
                            {entry.review.rating.toFixed(1)}
                          </span>
                        </div>
                      )}
                      
                      {/* Review Text */}
                      {entry.review?.review_text && (
                        <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">
                          {entry.review.review_text}
                        </p>
                      )}
                    </div>
                    
                    {/* Actions */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {entry.is_pinned && (
                        <Badge className="bg-synth-pink text-white border-0 text-xs">
                          <Pin className="w-3 h-3 mr-1 fill-current" />
                          Pinned
                        </Badge>
                      )}
                      <div className="flex gap-1">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 rounded-full text-gray-400 hover:text-synth-pink hover:bg-synth-pink/5"
                            onClick={() => handleEditMilestone(entry)}
                            title="Edit milestone"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-8 w-8 p-0 rounded-full transition-all",
                            entry.is_pinned 
                              ? "text-synth-pink hover:bg-synth-pink/10" 
                              : "text-gray-400 hover:text-synth-pink hover:bg-synth-pink/5"
                          )}
                          onClick={() => handlePinToggle(entry.id, entry.is_pinned)}
                          disabled={!entry.is_pinned && pinnedCount >= 5}
                          title={entry.is_pinned ? "Unpin" : "Pin to timeline"}
                        >
                          {entry.is_pinned ? (
                            <Pin className="w-4 h-4 fill-current" />
                          ) : (
                            <Pin className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
                
                {/* Decorative gradient line for pinned items */}
                {entry.is_pinned && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-synth-pink via-synth-pink-light to-transparent" />
                )}
              </Card>
            </div>
          );
        })}
      </div>
      </div>
      
      <TimelineEntryModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        userId={userId}
        existingReviewId={editingEntry?.review_id || undefined}
        existingSignificance={editingEntry?.significance || undefined}
        existingDescription={editingEntry?.description || undefined}
        onSuccess={handleModalSuccess}
      />
    </>
  );
};
