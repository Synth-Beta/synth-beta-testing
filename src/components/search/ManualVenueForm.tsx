import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MapPin, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
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
      // Create venue in database - only name is required
      const jambaseVenueId = `user-created-${Date.now()}`;
      const venueData = {
        jambase_venue_id: jambaseVenueId, // Keep for backward compatibility during migration
        name: name.trim(),
        identifier: `user-created-${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        date_published: new Date().toISOString(),
        date_modified: new Date().toISOString(),
      };

      const { data: venue, error: insertError } = await supabase
        .from('venues')
        .insert([venueData])
        .select()
        .single();

      if (insertError) {
        console.error('🏗️ ManualVenueForm: Database error:', insertError);
        throw insertError;
      }

      // Insert into external_entity_ids for normalization
      await supabase
        .from('external_entity_ids')
        .insert({
          entity_type: 'venue',
          entity_uuid: venue.id,
          source: 'manual',
          external_id: jambaseVenueId
        })
        .catch(() => {}); // Ignore duplicate errors

      toast({
        title: "Venue Created! 📍",
        description: `${name.trim()} has been added to your database.`,
      });

      // Convert to the expected format for the callback
      const venueFormatted = {
        id: venue.id,
        name: venue.name,
        identifier: venue.identifier,
        match_score: 100,
        is_from_database: true,
        source: 'user_created',
      };

      onVenueCreated(venueFormatted);
      handleClose();
    } catch (error) {
      console.error('Error creating venue:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create venue",
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
            Add Venue Manually
          </DialogTitle>
          <DialogDescription>
            Can't find the venue you're looking for? Add it manually to your database.
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
                  Creating...
                </>
              ) : (
                'Create Venue'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

