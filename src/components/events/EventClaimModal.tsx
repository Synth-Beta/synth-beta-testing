/**
 * Event Claim Modal
 * Allows creators to claim ownership of events featuring their performances
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Award, Loader2, ExternalLink } from 'lucide-react';
import EventManagementService, { EventClaimRequest } from '@/services/eventManagementService';

interface EventClaimModalProps {
  open: boolean;
  onClose: () => void;
  event: {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
  };
  onClaimSubmitted?: () => void;
}

export function EventClaimModal({
  open,
  onClose,
  event,
  onClaimSubmitted,
}: EventClaimModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<EventClaimRequest>({
    event_id: event.id,
    claim_reason: '',
    verification_proof: '',
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.claim_reason.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please provide a reason for claiming this event.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await EventManagementService.claimEvent(formData);

      toast({
        title: 'Claim Submitted! ✅',
        description:
          'Your claim request has been submitted for review. We\'ll notify you once it\'s been reviewed.',
      });

      onClaimSubmitted?.();
      handleClose();
    } catch (error) {
      console.error('Error claiming event:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to submit claim',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({
        event_id: event.id,
        claim_reason: '',
        verification_proof: '',
      });
      onClose();
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-purple-600" />
            Claim Event Ownership
          </DialogTitle>
          <DialogDescription>
            Submit a claim to manage this event as the performing artist or their
            representative.
          </DialogDescription>
        </DialogHeader>

        {/* Event Details */}
        <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
          <h3 className="font-semibold text-lg mb-2">{event.title}</h3>
          <div className="space-y-1 text-sm text-gray-700">
            <p>
              <span className="font-medium">Artist:</span> {event.artist_name}
            </p>
            <p>
              <span className="font-medium">Venue:</span> {event.venue_name}
            </p>
            <p>
              <span className="font-medium">Date:</span> {formatDate(event.event_date)}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Claim Reason */}
          <div className="space-y-2">
            <Label htmlFor="claim_reason">
              Why are you claiming this event? <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="claim_reason"
              name="claim_reason"
              placeholder="e.g., I am the artist performing at this event, I am the band manager, etc."
              value={formData.claim_reason}
              onChange={handleInputChange}
              disabled={isSubmitting}
              rows={4}
              required
            />
            <p className="text-xs text-gray-500">
              Explain your relationship to the event and why you should be able to
              manage it.
            </p>
          </div>

          {/* Verification Proof */}
          <div className="space-y-2">
            <Label htmlFor="verification_proof">
              Verification Link (Optional but Recommended)
            </Label>
            <Input
              id="verification_proof"
              name="verification_proof"
              type="url"
              placeholder="https://instagram.com/yourband or official website"
              value={formData.verification_proof}
              onChange={handleInputChange}
              disabled={isSubmitting}
            />
            <p className="text-xs text-gray-500 flex items-start gap-1">
              <ExternalLink className="h-3 w-3 mt-0.5 flex-shrink-0" />
              Provide a link to your official social media, website, or other proof
              that verifies your identity as the artist or their representative.
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-sm text-blue-900 mb-2">
              What happens next?
            </h4>
            <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
              <li>Your claim will be reviewed by our team</li>
              <li>We may reach out for additional verification</li>
              <li>You'll receive a notification once your claim is approved or rejected</li>
              <li>
                Once approved, you'll be able to edit event details, add media, and
                manage tickets
              </li>
            </ul>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Award className="w-4 h-4 mr-2" />
                  Submit Claim
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default EventClaimModal;

