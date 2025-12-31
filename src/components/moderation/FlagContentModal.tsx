import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ModerationService } from '@/services/moderationService';
import { Flag } from 'lucide-react';

interface FlagContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  contentType: 'event' | 'review' | 'artist' | 'venue';
  contentId: string;
  contentTitle?: string;
}

export const FlagContentModal: React.FC<FlagContentModalProps> = ({
  isOpen,
  onClose,
  contentType,
  contentId,
  contentTitle,
}) => {
  const [flagCategory, setFlagCategory] = useState<string>('');
  const [flagReason, setFlagReason] = useState<string>('');
  const [additionalDetails, setAdditionalDetails] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const flagCategories = [
    { value: 'spam', label: 'Spam' },
    { value: 'harassment', label: 'Harassment' },
    { value: 'inappropriate_content', label: 'Inappropriate Content' },
    { value: 'misinformation', label: 'Misinformation' },
    { value: 'copyright_violation', label: 'Copyright Violation' },
    { value: 'fake_content', label: 'Fake Content' },
    { value: 'other', label: 'Other' },
  ];

  const handleSubmit = async () => {
    if (!flagCategory || !flagReason.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please select a category and provide a reason for flagging.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await ModerationService.flagContent({
        content_type: contentType,
        content_id: contentId,
        flag_reason: flagReason.trim(),
        flag_category: flagCategory as any,
        additional_details: additionalDetails.trim() || undefined,
      });

      toast({
        title: 'Content Flagged',
        description: 'Thank you for reporting this. Our team will review it shortly.',
      });

      // Reset form
      setFlagCategory('');
      setFlagReason('');
      setAdditionalDetails('');
      onClose();
    } catch (error: any) {
      console.error('Error flagging content:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to flag content. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const contentTypeLabels = {
    event: 'Event',
    review: 'Review',
    artist: 'Artist',
    venue: 'Venue',
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-red-500" />
            Flag {contentTypeLabels[contentType]}
          </DialogTitle>
          <DialogDescription>
            {contentTitle && (
              <span className="font-semibold">{contentTitle}</span>
            )}
            <br />
            Help us keep the community safe by reporting content that violates our guidelines.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="flag-category">Category *</Label>
            <Select value={flagCategory} onValueChange={setFlagCategory}>
              <SelectTrigger id="flag-category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {flagCategories.map((category) => (
                  <SelectItem key={category.value} value={category.value}>
                    {category.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="flag-reason">Reason *</Label>
            <Textarea
              id="flag-reason"
              placeholder="Please describe why you're flagging this content..."
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="additional-details">Additional Details (Optional)</Label>
            <Textarea
              id="additional-details"
              placeholder="Any additional information that might help us review this..."
              value={additionalDetails}
              onChange={(e) => setAdditionalDetails(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit Flag'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

