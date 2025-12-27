import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Loader2 } from 'lucide-react';
import { MissingEntityRequestService } from '@/services/missingEntityRequestService';
import { useToast } from '@/hooks/use-toast';

interface ManualVenueFormProps {
  open: boolean;
  onClose: () => void;
  onVenueCreated: (venue: any) => void;
  initialQuery?: string;
}

export function ManualVenueForm({ open, onClose, onVenueCreated, initialQuery = '' }: ManualVenueFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');

  // Update form data when modal opens or initialQuery changes
  React.useEffect(() => {
    if (open && initialQuery) {
      setName(initialQuery);
    } else if (open) {
      setName('');
    }
  }, [open, initialQuery]);
  
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      toast({
        title: "Error",
        description: "Venue name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Submit request for missing venue instead of creating directly
      await MissingEntityRequestService.submitRequest({
        entity_type: 'venue',
        entity_name: name.trim(),
      });

      toast({
        title: "Request Submitted! 📍",
        description: `Your request for "${name.trim()}" has been submitted. We'll review it and add it to the database if approved.`,
      });

      // Don't call onVenueCreated since we're not creating a venue
      // The user will need to wait for admin approval
      handleClose();
    } catch (error) {
      console.error('Error submitting venue request:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to submit request",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setName('');
    onClose();
  };

  
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Request Missing Venue
          </DialogTitle>
          <DialogDescription>
            Can't find the venue you're looking for? Submit a request and we'll review it for addition to the database.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Venue Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Venue Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="name"
              name="name"
              placeholder="e.g., The Blue Note"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isSubmitting}
            />
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
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Request'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

