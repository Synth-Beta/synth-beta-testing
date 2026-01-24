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
  /**
   * Whether the viewer is allowed to edit this user's timeline.
   * On other users' profiles this should be false.
   */
  canEdit?: boolean;
}

export const PassportTimelineView: React.FC<PassportTimelineViewProps> = ({ userId, canEdit = true }) => {
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
    // Editing (pin/unpin) is only allowed for the owner's own timeline
    if (!canEdit) return;

    try {
      if (currentlyPinned) {
        // Only unpin if it's a real timeline entry ID (not a generated review-* ID)
        if (!timelineId.startsWith('review-')) {
          await PassportService.unpinTimelineEvent(userId, timelineId);
          toast({
            title: 'Unpinned',
            description: 'Event removed from pinned timeline',
          });
        }
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
      // Pinned items always come first
      if (a.is_pinned && !b.is_pinned) return -1;
      if (!a.is_pinned && b.is_pinned) return 1;
      
      // Sort by event date (most recent first), fallback to created_at if Event_date is not available
      const dateA = a.review?.Event_date ? new Date(a.review.Event_date) : new Date(a.created_at);
      const dateB = b.review?.Event_date ? new Date(b.review.Event_date) : new Date(b.created_at);
      return dateB.getTime() - dateA.getTime();
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
          <Sparkles className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--neutral-600)' }} />
          <p className="font-medium">No timeline highlights yet.</p>
          <p className="text-sm mt-2">
            {canEdit
              ? 'Mark special moments in your music journey.'
              : 'Highlights will appear here when this fan adds milestones.'}
          </p>
          {canEdit && (
            <Button onClick={handleAddMilestone} className="mt-4" variant="default">
              Add Your First Milestone
              <Plus className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
        {canEdit && (
          <TimelineEntryModal
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            userId={userId}
            existingReviewId={editingEntry?.review_id || undefined}
            existingSignificance={editingEntry?.significance || undefined}
            existingDescription={editingEntry?.description || undefined}
            onSuccess={handleModalSuccess}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="relative">
        {/* Add Milestone Button (only for own profile) */}
        {canEdit && (
          <div className="mb-6 flex justify-end">
            <Button
              onClick={handleAddMilestone}
              variant="outline"
              style={{
                height: 'var(--size-button-height, 36px)',
                paddingLeft: 'var(--spacing-small, 12px)',
                paddingRight: 'var(--spacing-small, 12px)',
                borderColor: 'var(--neutral-200)',
                color: 'var(--neutral-900)',
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
              }}
            >
              <Plus size={16} style={{ marginRight: 'var(--spacing-inline, 6px)' }} />
              Add Milestone
            </Button>
          </div>
        )}

        {/* Timeline line - positioned to align with center of nodes */}
        <div className="absolute left-7 sm:left-9 top-0 bottom-0 w-0.5 bg-gradient-to-b from-synth-pink/30 via-synth-pink/40 to-synth-pink/20" />
      
      <div className="space-y-8">
        {sortedTimeline.map((entry, index) => {
          const milestoneInfo = getMilestoneInfo(entry);
          const Icon = milestoneInfo.icon;
          const eventDate = entry.review?.Event_date ? new Date(entry.review.Event_date) : new Date(entry.created_at);
          const canEdit = !entry.is_auto_selected;
          
          return (
            <div key={entry.id} className="relative pl-16 sm:pl-20">
              {/* Timeline node with date - positioned to the left */}
              <div className="absolute left-0 top-0 flex flex-col items-end pr-2 w-14 sm:w-16">
                {/* Date badge above icon - compact format */}
                <div className={cn(
                  "mb-2 px-1.5 py-0.5 rounded text-[10px] sm:text-xs font-semibold whitespace-nowrap shadow-sm text-center w-full",
                  entry.is_pinned 
                    ? "bg-synth-pink text-white" 
                    : "bg-gray-100 text-gray-700"
                )}>
                  <div className="leading-tight">
                    {format(eventDate, 'MMM')}
                  </div>
                  <div className="leading-tight font-bold">
                    {format(eventDate, 'd')}
                  </div>
                  <div className="leading-tight text-[9px] sm:text-[10px] opacity-75">
                    {format(eventDate, 'yyyy')}
                  </div>
                </div>
                
                {/* Icon circle */}
                <div className={cn(
                  "w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 border-white shadow-lg flex items-center justify-center z-10 transition-all duration-300 mx-auto",
                  entry.is_pinned 
                    ? "bg-synth-pink ring-4 ring-synth-pink/30 scale-110 shadow-xl shadow-synth-pink/40" 
                    : `${milestoneInfo.bg} ring-2 ring-white/80`
                )}>
                  <Icon className={cn("w-4 h-4 sm:w-5 sm:h-5", entry.is_pinned ? "text-white" : milestoneInfo.color)} />
                </div>
              </div>
              
              {/* Card */}
              <Card className={cn(
                "relative overflow-hidden transition-all duration-300 hover:shadow-xl w-full max-w-full",
                entry.is_pinned 
                  ? "border-2 border-synth-pink shadow-lg shadow-synth-pink/20 bg-gradient-to-br from-white to-synth-pink/5" 
                  : "border border-gray-200 bg-white hover:border-synth-pink/30"
              )}>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start justify-between gap-3 sm:gap-4">
                    <div className="flex-1 min-w-0 overflow-x-hidden">
                      {/* Significance/Milestone Text - PROMINENT! */}
                      {entry.significance && (
                        <div className="mb-3 sm:mb-4">
                          <div className={cn(
                            "inline-flex items-center gap-1.5 sm:gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg font-bold text-sm sm:text-base mb-2 sm:mb-3 break-words",
                            entry.is_pinned 
                              ? "bg-synth-pink/10 text-synth-pink border-2 border-synth-pink/30"
                              : `${milestoneInfo.bg} ${milestoneInfo.color} border-2 border-current/20`
                          )}>
                            <Icon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                            <span className="break-words">{entry.significance}</span>
                          </div>
                        </div>
                      )}
                      
                      {/* Event Name */}
                      {entry.Event_name && (
                        <h4 className="font-bold text-base sm:text-lg text-gray-900 mb-2 sm:mb-3 break-words">
                          {entry.Event_name}
                        </h4>
                      )}
                      
                      {/* Star Rating */}
                      {entry.review?.rating && (
                        <div className="flex items-center gap-1 sm:gap-1.5 mb-3 sm:mb-4">
                          {[...Array(5)].map((_, i) => (
                            <Star
                              key={i}
                              className={cn(
                                "w-4 h-4 sm:w-5 sm:h-5 transition-colors flex-shrink-0",
                                i < Math.round(entry.review!.rating!)
                                  ? "fill-yellow-400 text-yellow-400"
                                  : "fill-gray-200 text-gray-200"
                              )}
                            />
                          ))}
                          <span className="text-xs sm:text-sm font-semibold text-gray-700 ml-1 flex-shrink-0">
                            {entry.review.rating.toFixed(1)}
                          </span>
                        </div>
                      )}
                      
                      {/* Review Text */}
                      {entry.review?.review_text && (
                        <p className="text-xs sm:text-sm text-gray-700 leading-relaxed line-clamp-3 break-words">
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
                      {canEdit && (
                        <div className="flex gap-1">
                          {/* Show edit button if entry has milestone, or add milestone button if it doesn't */}
                          {entry.significance ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 rounded-full text-gray-400 hover:text-synth-pink hover:bg-synth-pink/5"
                              onClick={() => handleEditMilestone(entry)}
                              title="Edit milestone"
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 rounded-full text-gray-400 hover:text-synth-pink hover:bg-synth-pink/5"
                              onClick={() => handleEditMilestone(entry)}
                              title="Add milestone"
                            >
                              <Plus className="w-4 h-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              'h-8 w-8 p-0 rounded-full transition-all',
                              entry.is_pinned
                                ? 'text-synth-pink hover:bg-synth-pink/10'
                                : 'text-gray-400 hover:text-synth-pink hover:bg-synth-pink/5',
                            )}
                            onClick={() => handlePinToggle(entry.id, entry.is_pinned)}
                            disabled={!entry.is_pinned && pinnedCount >= 5}
                            title={entry.is_pinned ? 'Unpin' : 'Pin to timeline'}
                          >
                            {entry.is_pinned ? (
                              <Pin className="w-4 h-4 fill-current" />
                            ) : (
                              <Pin className="w-4 h-4" />
                            )}
                          </Button>
                        </div>
                      )}
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
      
      {canEdit && (
        <TimelineEntryModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          userId={userId}
          existingReviewId={editingEntry?.review_id || undefined}
          existingSignificance={editingEntry?.significance || undefined}
          existingDescription={editingEntry?.description || undefined}
          onSuccess={handleModalSuccess}
        />
      )}
    </>
  );
};
