/**
 * Report Content Modal
 * Allows users to report inappropriate content
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
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { AlertCircle, Flag, Loader2 } from 'lucide-react';
import ContentModerationService, {
  ContentType,
  FlagReason,
  FLAG_REASONS,
} from '@/services/contentModerationService';

interface ReportContentModalProps {
  open: boolean;
  onClose: () => void;
  contentType: ContentType;
  contentId: string;
  contentTitle?: string;
  onReportSubmitted?: () => void;
}

export function ReportContentModal({
  open,
  onClose,
  contentType,
  contentId,
  contentTitle,
  onReportSubmitted,
}: ReportContentModalProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedReason, setSelectedReason] = useState<FlagReason | ''>('');
  const [details, setDetails] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedReason) {
      toast({
        title: 'Please select a reason',
        description: 'Select why you\'re reporting this content',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await ContentModerationService.reportContent({
        content_type: contentType,
        content_id: contentId,
        flag_reason: selectedReason as FlagReason,
        flag_details: details.trim() || undefined,
      });

      toast({
        title: 'Report Submitted',
        description: 'Thank you for helping keep our community safe. We\'ll review this report shortly.',
      });

      onReportSubmitted?.();
      handleClose();
    } catch (error) {
      console.error('Error submitting report:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to submit report',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setSelectedReason('');
      setDetails('');
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-red-600" />
            Report {ContentModerationService.getContentTypeDisplayName(contentType)}
          </DialogTitle>
          <DialogDescription>
            Help us understand what's wrong with this content. Your report is anonymous.
          </DialogDescription>
        </DialogHeader>

        {contentTitle && (
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200 flex-shrink-0">
            <p className="text-sm text-gray-700 font-medium truncate">
              {contentTitle}
            </p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
          <form onSubmit={handleSubmit} className="space-y-4">
          {/* Reason Selection */}
          <div className="space-y-3">
            <Label>Why are you reporting this? <span className="text-red-500">*</span></Label>
            <div className="space-y-2">
              {Object.entries(FLAG_REASONS).map(([key, reason]) => (
                <label
                  key={key}
                  className={`flex items-start p-3 border rounded-lg cursor-pointer transition-colors ${
                    selectedReason === key
                      ? 'border-red-500 bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={key}
                    checked={selectedReason === key}
                    onChange={(e) => setSelectedReason(e.target.value as FlagReason)}
                    disabled={isSubmitting}
                    className="mt-0.5 mr-3"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{reason.icon}</span>
                      <span className="font-medium text-sm">{reason.label}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{reason.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Additional Details */}
          <div className="space-y-2">
            <Label htmlFor="details">Additional Details (Optional)</Label>
            <Textarea
              id="details"
              placeholder="Provide any additional context that might help us review this report..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              disabled={isSubmitting}
              rows={4}
            />
            <p className="text-xs text-gray-500">
              Do not include personal information in your report.
            </p>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-900">
              <p className="font-medium mb-1">What happens next?</p>
              <ul className="text-xs space-y-1 list-disc list-inside">
                <li>Your report will be reviewed by our moderation team</li>
                <li>We may remove content that violates our guidelines</li>
                <li>You'll receive a notification about the outcome</li>
                <li>Reports are confidential and anonymous</li>
              </ul>
            </div>
          </div>
          </form>
        </div>

        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="destructive"
            disabled={isSubmitting || !selectedReason}
            onClick={handleSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Flag className="w-4 h-4 mr-2" />
                Submit Report
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ReportContentModal;

