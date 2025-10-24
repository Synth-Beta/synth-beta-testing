/**
 * Event Promotion Modal
 * Allows event owners to request paid promotion for their events
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
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { TrendingUp, Loader2, Check, Sparkles } from 'lucide-react';
import PromotionService, { PROMOTION_TIERS } from '@/services/promotionService';

interface EventPromotionModalProps {
  open: boolean;
  onClose: () => void;
  event: {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
  };
  onPromotionRequested?: () => void;
}

export function EventPromotionModal({
  open,
  onClose,
  event,
  onPromotionRequested,
}: EventPromotionModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedTier, setSelectedTier] = useState<'basic' | 'premium' | 'featured' | ''>('');

  const handleSubmit = async () => {
    if (!selectedTier) {
      toast({
        title: 'Select a promotion tier',
        description: 'Choose a promotion level for your event',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const tierInfo = PROMOTION_TIERS[selectedTier];
      const startsAt = new Date();
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + tierInfo.duration_days);

      await PromotionService.createPromotion({
        event_id: event.id,
        promotion_tier: selectedTier,
        starts_at: startsAt.toISOString(),
        expires_at: expiresAt.toISOString(),
      });

      toast({
        title: 'Promotion Request Submitted! 🚀',
        description: 'Your promotion request will be reviewed by our team shortly.',
      });

      onPromotionRequested?.();
      handleClose();
    } catch (error) {
      console.error('Error requesting promotion:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to submit promotion request',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setSelectedTier('');
      onClose();
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const TierCard = ({ tier }: { tier: 'basic' | 'premium' | 'featured' }) => {
    const tierInfo = PROMOTION_TIERS[tier];
    const isSelected = selectedTier === tier;

    const borderColors = {
      basic: 'border-blue-300',
      premium: 'border-purple-300',
      featured: 'border-yellow-300',
    };

    const bgColors = {
      basic: 'bg-blue-50',
      premium: 'bg-purple-50',
      featured: 'bg-yellow-50',
    };

    const textColors = {
      basic: 'text-blue-900',
      premium: 'text-purple-900',
      featured: 'text-yellow-900',
    };

    return (
      <button
        type="button"
        onClick={() => setSelectedTier(tier)}
        disabled={isSubmitting}
        className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
          isSelected
            ? `${borderColors[tier]} ${bgColors[tier]} shadow-md`
            : 'border-gray-200 hover:border-gray-300'
        }`}
      >
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className={`font-bold text-lg ${isSelected ? textColors[tier] : ''}`}>
              {tierInfo.name}
            </h3>
            <p className="text-2xl font-bold mt-1">
              ${tierInfo.price}
            </p>
            <p className="text-xs text-gray-600">{tierInfo.duration_days} days</p>
          </div>
          {isSelected && (
            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${bgColors[tier]}`}>
              <Check className="h-4 w-4 text-green-600" />
            </div>
          )}
        </div>

        <ul className="space-y-1 mt-3">
          {tierInfo.features.map((feature, index) => (
            <li key={index} className="text-sm text-gray-700 flex items-start gap-2">
              <span className="text-green-600 mt-0.5">✓</span>
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-purple-600" />
            Promote Your Event
          </DialogTitle>
          <DialogDescription>
            Boost your event's visibility and reach more people
          </DialogDescription>
        </DialogHeader>

        {/* Event Info */}
        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h3 className="font-semibold text-lg mb-1">{event.title}</h3>
          <p className="text-sm text-gray-700">
            {event.artist_name} at {event.venue_name}
          </p>
          <p className="text-xs text-gray-600 mt-1">{formatDate(event.event_date)}</p>
        </div>

        {/* Promotion Tiers */}
        <div className="space-y-3">
          <Label className="text-base font-semibold">Choose Your Promotion Level</Label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <TierCard tier="basic" />
            <TierCard tier="premium" />
            <TierCard tier="featured" />
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
          <Sparkles className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-medium mb-1">How it works:</p>
            <ol className="text-xs space-y-1 list-decimal list-inside">
              <li>Select your preferred promotion tier</li>
              <li>Submit your request for admin review</li>
              <li>Once approved, payment link will be sent</li>
              <li>Your event goes live after payment</li>
              <li>Track performance in your analytics</li>
            </ol>
            <p className="text-xs mt-2 italic">
              Note: All promotion requests are subject to approval and our content guidelines.
            </p>
          </div>
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
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedTier}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 mr-2" />
                Promote
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EventPromotionModal;

