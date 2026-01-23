import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PassportService } from '@/services/passportService';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { Loader2 } from 'lucide-react';

interface Review {
  id: string;
  rating: number | null;
  review_text: string | null;
  created_at: string;
  event?: {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
  } | null;
}

interface TimelineEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  existingReviewId?: string;
  existingSignificance?: string;
  existingDescription?: string;
  onSuccess: () => void;
}

export const TimelineEntryModal: React.FC<TimelineEntryModalProps> = ({
  isOpen,
  onClose,
  userId,
  existingReviewId,
  existingSignificance,
  existingDescription,
  onSuccess,
}) => {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [selectedReviewId, setSelectedReviewId] = useState<string>(existingReviewId || '');
  const [milestoneType, setMilestoneType] = useState<'best_setlist' | 'first_favorite_artist' | 'first_favorite_venue' | 'custom'>('best_setlist');
  const [significance, setSignificance] = useState<string>(existingSignificance || '');
  const [customMilestoneName, setCustomMilestoneName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadReviews();
      
      if (existingReviewId) {
        setSelectedReviewId(existingReviewId);
        
        // Detect milestone type from existing significance
        const sig = existingSignificance || '';
        if (sig.toLowerCase().includes('best setlist')) {
          setMilestoneType('best_setlist');
          setSignificance(existingDescription || '');
        } else if (sig.toLowerCase().includes('first time seeing')) {
          setMilestoneType('first_favorite_artist');
          setSignificance(existingDescription || '');
        } else if (sig.toLowerCase().includes('first time at')) {
          setMilestoneType('first_favorite_venue');
          setSignificance(existingDescription || '');
        } else {
          // Custom milestone - significance is the name, description is the description
          setMilestoneType('custom');
          setCustomMilestoneName(sig || '');
          setSignificance(existingDescription || '');
        }
      }
    }
  }, [isOpen, existingReviewId, existingSignificance, existingDescription]);

  const loadReviews = async () => {
    setLoadingReviews(true);
    try {
      const data = await PassportService.getUserReviewsForTimeline(userId, 100);
      setReviews(data as Review[]);
    } catch (error) {
      console.error('Error loading reviews:', error);
      toast({
        title: 'Error',
        description: 'Failed to load reviews',
        variant: 'destructive',
      });
    } finally {
      setLoadingReviews(false);
    }
  };

  const handleSubmit = async () => {
    if (!existingReviewId && !selectedReviewId) {
      toast({
        title: 'Selection required',
        description: 'Please select a review',
        variant: 'destructive',
      });
      return;
    }

    const reviewIdToUse = existingReviewId || selectedReviewId;
    if (!reviewIdToUse) {
      return;
    }

    // Build significance text based on milestone type (this is the label, not the description)
    const selectedReview = reviews.find(r => r.id === reviewIdToUse);
    let finalSignificance = '';
    let descriptionText: string | null = null;
    
    if (milestoneType === 'best_setlist') {
      finalSignificance = 'Best setlist';
      descriptionText = significance.trim() || null;
    } else if (milestoneType === 'first_favorite_artist') {
      const artistName = selectedReview?.event?.artist_name || 'this artist';
      finalSignificance = 'First time seeing ' + artistName;
      descriptionText = significance.trim() || null;
    } else if (milestoneType === 'first_favorite_venue') {
      const venueName = selectedReview?.event?.venue_name || 'this venue';
      finalSignificance = 'First time at ' + venueName;
      descriptionText = significance.trim() || null;
    } else if (milestoneType === 'custom') {
      if (!customMilestoneName.trim()) {
        toast({
          title: 'Milestone name required',
          description: 'Please name your custom milestone',
          variant: 'destructive',
        });
        return;
      }
      finalSignificance = customMilestoneName.trim();
      descriptionText = significance.trim() || null;
    }

    setLoading(true);
    try {
      if (existingReviewId) {
        // Find timeline entry ID by review_id
        const timeline = await PassportService.getTimeline(userId, 1000);
        const existingEntry = timeline.find((t: any) => t.review_id === existingReviewId);
        
        if (!existingEntry) {
          throw new Error('Timeline entry not found');
        }

        await PassportService.updateTimelineMilestone(
          userId,
          existingEntry.id,
          finalSignificance,
          descriptionText
        );
      } else {
        await PassportService.addTimelineMilestone(
          userId,
          selectedReviewId,
          finalSignificance,
          descriptionText
        );
      }

      toast({
        title: 'Success',
        description: 'Timeline milestone added successfully',
      });

      onSuccess();
      handleClose();
    } catch (error) {
      console.error('Error saving timeline milestone:', error);
      toast({
        title: 'Error',
        description: 'Failed to save timeline milestone',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setSelectedReviewId('');
      setMilestoneType('best_setlist');
      setSignificance('');
      setCustomMilestoneName('');
      onClose();
    }
  };

  const selectedReview = reviews.find(r => r.id === selectedReviewId);
  
  // Show description field for custom or when user wants to add details
  const showDescriptionField = milestoneType === 'custom' || milestoneType === 'best_setlist';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && !loading) {
        handleClose();
      }
    }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader style={{ paddingLeft: 'var(--spacing-screen-margin-x, 20px)', paddingRight: 'var(--spacing-screen-margin-x, 20px)' }}>
          <DialogTitle>
            {existingReviewId ? 'Edit Timeline Milestone' : 'Add Timeline Milestone'}
          </DialogTitle>
          <DialogDescription>
            Mark a special moment in your music journey. Choose a review and tell us why it's significant.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4" style={{ paddingLeft: 'var(--spacing-screen-margin-x, 20px)', paddingRight: 'var(--spacing-screen-margin-x, 20px)', paddingTop: 'var(--spacing-small, 12px)', paddingBottom: 'var(--spacing-small, 12px)' }}>
          {!existingReviewId && (
            <div className="space-y-2">
              <Label htmlFor="review">Select Review</Label>
              {loadingReviews ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-synth-pink" />
                </div>
              ) : (
                <Select value={selectedReviewId} onValueChange={setSelectedReviewId}>
                  <SelectTrigger id="review">
                    <SelectValue placeholder="Choose a review..." />
                  </SelectTrigger>
                  <SelectContent className="z-[10000] bg-white">
                    {reviews.map((review) => (
                      <SelectItem key={review.id} value={review.id}>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {review.event?.artist_name || 'Unknown Artist'} @ {review.event?.venue_name || 'Unknown Venue'}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {review.event?.event_date
                              ? format(new Date(review.event.event_date), 'MMM d, yyyy')
                              : format(new Date(review.created_at), 'MMM d, yyyy')}
                            {review.rating && ` • ${review.rating.toFixed(1)}⭐`}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              {selectedReview && (
                <div className="mt-2 p-3 bg-muted rounded-lg">
                  <div className="text-sm font-medium">
                    {selectedReview.event?.artist_name} @ {selectedReview.event?.venue_name}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {selectedReview.event?.event_date
                      ? format(new Date(selectedReview.event.event_date), 'MMM d, yyyy')
                      : format(new Date(selectedReview.created_at), 'MMM d, yyyy')}
                  </div>
                  {selectedReview.review_text && (
                    <div className="text-sm mt-2 line-clamp-2">{selectedReview.review_text}</div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="milestone-type">What makes this moment significant?</Label>
            <Select value={milestoneType} onValueChange={(value: any) => {
              setMilestoneType(value);
              // Clear fields when switching types
              if (value !== 'custom') {
                setCustomMilestoneName('');
                setSignificance('');
              }
            }}>
              <SelectTrigger id="milestone-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[10000] bg-white">
                <SelectItem value="best_setlist">Best Setlist</SelectItem>
                <SelectItem value="first_favorite_artist">First Time Seeing Favorite Artist</SelectItem>
                <SelectItem value="first_favorite_venue">First Time at Favorite Venue</SelectItem>
                <SelectItem value="custom">Custom Milestone</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {milestoneType === 'custom' && (
            <div className="space-y-2">
              <Label htmlFor="custom-milestone-name">Milestone Name</Label>
              <Input
                id="custom-milestone-name"
                placeholder="e.g., First festival, Best encore, Special guest appearance..."
                value={customMilestoneName}
                onChange={(e) => setCustomMilestoneName(e.target.value)}
                maxLength={100}
              />
              <div className="text-xs text-muted-foreground text-right">
                {customMilestoneName.length}/100
              </div>
            </div>
          )}

          {(milestoneType === 'custom' || milestoneType === 'best_setlist') && (
            <div className="space-y-2">
              <Label htmlFor="significance">
                {milestoneType === 'best_setlist' 
                  ? 'Why was this the best setlist?' 
                  : 'Description (optional)'}
              </Label>
              <Textarea
                id="significance"
                placeholder={
                  milestoneType === 'best_setlist'
                    ? "Tell us what made this setlist stand out..."
                    : "Describe why this moment is significant..."
                }
                value={significance}
                onChange={(e) => setSignificance(e.target.value)}
                rows={4}
                maxLength={500}
              />
              <div className="text-xs text-muted-foreground text-right">
                {significance.length}/500
              </div>
            </div>
          )}

          {milestoneType === 'first_favorite_artist' && selectedReview && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-900">
                This will mark this as your first time seeing <strong>{selectedReview.event?.artist_name || 'this artist'}</strong> as your favorite artist.
              </p>
            </div>
          )}

          {milestoneType === 'first_favorite_venue' && selectedReview && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-sm text-purple-900">
                This will mark this as your first time at <strong>{selectedReview.event?.venue_name || 'this venue'}</strong> as your favorite venue.
              </p>
            </div>
          )}
        </div>

        <DialogFooter style={{ paddingLeft: 'var(--spacing-screen-margin-x, 20px)', paddingRight: 'var(--spacing-screen-margin-x, 20px)', gap: 'var(--spacing-inline, 6px)' }}>
          <Button 
            type="button"
            variant="outline" 
            onClick={handleClose} 
            disabled={loading}
          >
            Cancel
          </Button>
          <Button 
            type="button"
            onClick={handleSubmit} 
            disabled={loading || (!existingReviewId && !selectedReviewId)}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              existingReviewId ? 'Update' : 'Add to Timeline'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
