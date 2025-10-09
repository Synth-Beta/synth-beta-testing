import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  
  // Debug logging
  React.useEffect(() => {
  }, [open, initialQuery]);
  const [formData, setFormData] = useState({
    name: '',
    streetAddress: '',
    city: '',
    state: '',
    zipCode: '',
    country: 'US',
    capacity: '',
    imageUrl: '',
  });

  // Update form data when modal opens or initialQuery changes
  React.useEffect(() => {
    if (open && initialQuery) {
      setFormData(prev => ({ ...prev, name: initialQuery }));
    }
  }, [open, initialQuery]);
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: "Error",
        description: "Venue name is required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Create venue in database using the correct 'venues' table
      const venueData = {
        jambase_venue_id: `user-created-${Date.now()}`,
        name: formData.name.trim(),
        identifier: `user-created-${formData.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
        url: null,
        image_url: formData.imageUrl.trim() || null,
        address: formData.streetAddress.trim() || null,
        city: formData.city.trim() || null,
        state: formData.state.trim() || null,
        zip: formData.zipCode.trim() || null,
        country: formData.country.trim() || 'US',
        latitude: null,
        longitude: null,
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


      toast({
        title: "Venue Created! 📍",
        description: `${formData.name} has been added to your database.`,
      });

      // Convert to the expected format for the callback
      const venueFormatted = {
        id: venue.id,
        name: venue.name,
        identifier: venue.identifier,
        address: venue.address,
        city: venue.city,
        state: venue.state,
        zip: venue.zip,
        country: venue.country,
        latitude: venue.latitude,
        longitude: venue.longitude,
        image_url: venue.image_url,
        url: venue.url,
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
    setFormData({
      name: '',
      streetAddress: '',
      city: '',
      state: '',
      zipCode: '',
      country: 'US',
      capacity: '',
      imageUrl: '',
    });
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
              value={formData.name}
              onChange={handleInputChange}
              required
              disabled={isSubmitting}
            />
          </div>

          {/* Street Address */}
          <div className="space-y-2">
            <Label htmlFor="streetAddress">Street Address (Optional)</Label>
            <Input
              id="streetAddress"
              name="streetAddress"
              placeholder="e.g., 131 W 3rd St"
              value={formData.streetAddress}
              onChange={handleInputChange}
              disabled={isSubmitting}
            />
          </div>

          {/* City and State */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                name="city"
                placeholder="e.g., New York"
                value={formData.city}
                onChange={handleInputChange}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State/Region</Label>
              <Input
                id="state"
                name="state"
                placeholder="e.g., NY"
                value={formData.state}
                onChange={handleInputChange}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Zip Code and Country */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="zipCode">Zip/Postal Code</Label>
              <Input
                id="zipCode"
                name="zipCode"
                placeholder="e.g., 10012"
                value={formData.zipCode}
                onChange={handleInputChange}
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                name="country"
                placeholder="e.g., US"
                value={formData.country}
                onChange={handleInputChange}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Capacity */}
          <div className="space-y-2">
            <Label htmlFor="capacity">Capacity (Optional)</Label>
            <Input
              id="capacity"
              name="capacity"
              type="number"
              placeholder="e.g., 1500"
              value={formData.capacity}
              onChange={handleInputChange}
              disabled={isSubmitting}
            />
          </div>

          {/* Image URL */}
          <div className="space-y-2">
            <Label htmlFor="imageUrl">Image URL (Optional)</Label>
            <Input
              id="imageUrl"
              name="imageUrl"
              placeholder="https://example.com/venue-image.jpg"
              type="url"
              value={formData.imageUrl}
              onChange={handleInputChange}
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
            <Button type="submit" disabled={isSubmitting || !formData.name.trim()}>
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

