import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Calendar, MapPin, Music, Trash2, Edit, Clock } from 'lucide-react';
import { DraftReviewService, DraftReview } from '@/services/draftReviewService';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface DraftToggleProps {
  userId: string;
  onSelectDraft: (draft: DraftReview) => void;
  onNewReview: () => void;
  currentMode: 'new' | 'draft';
  currentStep?: number;
}

export function DraftToggle({ userId, onSelectDraft, onNewReview, currentMode, currentStep }: DraftToggleProps) {
  const [drafts, setDrafts] = useState<DraftReview[]>([]);
  const [showDraftsModal, setShowDraftsModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadDrafts = async () => {
    setLoading(true);
    try {
      const userDrafts = await DraftReviewService.getUserDrafts(userId);
      setDrafts(userDrafts);
    } catch (error) {
      console.error('Error loading drafts:', error);
      toast({
        title: "Error",
        description: "Failed to load draft reviews",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (showDraftsModal) {
      loadDrafts();
    }
  }, [showDraftsModal, userId]);

  const handleDeleteDraft = async (draftId: string) => {
    try {
      const success = await DraftReviewService.deleteDraft(draftId, userId);
      if (success) {
        setDrafts(prev => prev.filter(d => d.id !== draftId));
        toast({
          title: "Draft Deleted",
          description: "Draft review has been deleted",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to delete draft",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error deleting draft:', error);
      toast({
        title: "Error",
        description: "Failed to delete draft",
        variant: "destructive",
      });
    }
  };

  const handleSelectDraft = (draft: DraftReview) => {
    onSelectDraft(draft);
    setShowDraftsModal(false);
  };

  const formatDraftPreview = (draftData: any) => {
    const parts = [];
    if (draftData.selectedArtist?.name) parts.push(`Artist: ${draftData.selectedArtist.name}`);
    if (draftData.selectedVenue?.name) parts.push(`Venue: ${draftData.selectedVenue.name}`);
    if (draftData.eventDate) parts.push(`Date: ${format(new Date(draftData.eventDate), 'MMM d, yyyy')}`);
    if (draftData.performanceRating) parts.push(`Performance: ${draftData.performanceRating}/5`);
    if (draftData.venueRating) parts.push(`Venue: ${draftData.venueRating}/5`);
    if (draftData.overallExperienceRating) parts.push(`Overall: ${draftData.overallExperienceRating}/5`);
    if (draftData.reviewText) parts.push(`Review: ${draftData.reviewText.substring(0, 50)}...`);
    
    return parts.length > 0 ? parts.join(' • ') : 'Empty draft';
  };

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        {currentStep === 1 && (
          <Button
            variant={currentMode === 'new' ? 'default' : 'outline'}
            size="sm"
            onClick={onNewReview}
            className="flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            New Review
          </Button>
        )}
        
        <Button
          variant={currentMode === 'draft' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowDraftsModal(true)}
          className="flex items-center gap-2"
        >
          <Clock className="w-4 h-4" />
          View Drafts
          {drafts.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {drafts.length}
            </Badge>
          )}
        </Button>
      </div>

      <Dialog open={showDraftsModal} onOpenChange={setShowDraftsModal}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Draft Reviews
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh]">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="text-sm text-gray-500">Loading drafts...</div>
              </div>
            ) : drafts.length === 0 ? (
              <div className="text-center py-8">
                <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Draft Reviews</h3>
                <p className="text-sm text-gray-500 mb-4">
                  You don't have any draft reviews. Start writing a review to create your first draft.
                </p>
                <Button onClick={onNewReview}>
                  Create New Review
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {drafts.map((draft) => (
                  <Card key={draft.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base mb-1">
                            {draft.event_title || 'Untitled Event'}
                          </CardTitle>
                          <div className="flex items-center gap-4 text-sm text-gray-500">
                            {draft.artist_name && (
                              <div className="flex items-center gap-1">
                                <Music className="w-3 h-3" />
                                {draft.artist_name}
                              </div>
                            )}
                            {draft.venue_name && (
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {draft.venue_name}
                              </div>
                            )}
                            {draft.event_date && (
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(draft.event_date), 'MMM d, yyyy')}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSelectDraft(draft)}
                            className="flex items-center gap-1"
                          >
                            <Edit className="w-3 h-3" />
                            Continue
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteDraft(draft.id)}
                            className="flex items-center gap-1 text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="text-sm text-gray-600 mb-2">
                        {formatDraftPreview(draft.draft_data)}
                      </div>
                      <div className="text-xs text-gray-400">
                        Last saved: {format(new Date(draft.last_saved_at), 'MMM d, yyyy \'at\' h:mm a')}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
