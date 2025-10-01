import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ManualEventFormProps {
  open: boolean;
  onClose: () => void;
  onEventCreated: (event: any) => void;
  prefilledArtist?: string;
  prefilledVenue?: string;
}

export function ManualEventForm({ 
  open, 
  onClose, 
  onEventCreated,
  prefilledArtist = '',
  prefilledVenue = '',
}: ManualEventFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    artistName: prefilledArtist,
    venueName: prefilledVenue,
    eventDate: '',
    eventTime: '',
    doorsTime: '',
    description: '',
    ticketUrl: '',
    priceRange: '',
  });
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.artistName.trim() || !formData.venueName.trim() || !formData.eventDate) {
      toast({
        title: "Error",
        description: "Artist name, venue name, and event date are required",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Combine date and time
      const eventDateTime = formData.eventTime 
        ? `${formData.eventDate}T${formData.eventTime}`
        : `${formData.eventDate}T19:00:00`; // Default to 7 PM

      const doorsDateTime = formData.doorsTime
        ? `${formData.eventDate}T${formData.doorsTime}`
        : null;

      // Create event in database
      const eventData = {
        title: formData.title.trim() || `${formData.artistName} at ${formData.venueName}`,
        artist_name: formData.artistName.trim(),
        venue_name: formData.venueName.trim(),
        event_date: eventDateTime,
        doors_time: doorsDateTime,
        description: formData.description.trim() || `Live performance by ${formData.artistName}`,
        ticket_urls: formData.ticketUrl.trim() ? [formData.ticketUrl.trim()] : [],
        price_range: formData.priceRange.trim() || null,
        ticket_available: !!formData.ticketUrl.trim(),
        is_user_created: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data: eventProfile, error: profileError } = await supabase
        .from('jambase_events')
        .insert([eventData])
        .select()
        .single();

      if (profileError) throw profileError;

      toast({
        title: "Event Created! 🎉",
        description: `${eventData.title} has been added to your events.`,
      });

      onEventCreated(eventProfile);
      handleClose();
    } catch (error) {
      console.error('Error creating event:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create event",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setFormData({
      title: '',
      artistName: '',
      venueName: '',
      eventDate: '',
      eventTime: '',
      doorsTime: '',
      description: '',
      ticketUrl: '',
      priceRange: '',
    });
    onClose();
  };

  // Set today as minimum date
  const today = new Date().toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Add Event Manually
          </DialogTitle>
          <DialogDescription>
            Can't find the event you're looking for? Add it manually to your calendar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Artist Name */}
          <div className="space-y-2">
            <Label htmlFor="artistName">
              Artist Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="artistName"
              name="artistName"
              placeholder="e.g., The Beatles"
              value={formData.artistName}
              onChange={handleInputChange}
              required
              disabled={isSubmitting}
            />
          </div>

          {/* Venue Name */}
          <div className="space-y-2">
            <Label htmlFor="venueName">
              Venue Name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="venueName"
              name="venueName"
              placeholder="e.g., Madison Square Garden"
              value={formData.venueName}
              onChange={handleInputChange}
              required
              disabled={isSubmitting}
            />
          </div>

          {/* Event Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Event Title (Optional)</Label>
            <Input
              id="title"
              name="title"
              placeholder="Leave blank to auto-generate"
              value={formData.title}
              onChange={handleInputChange}
              disabled={isSubmitting}
            />
            {!formData.title && formData.artistName && formData.venueName && (
              <p className="text-xs text-gray-500">
                Will be set to: "{formData.artistName} at {formData.venueName}"
              </p>
            )}
          </div>

          {/* Event Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="eventDate">
                Event Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="eventDate"
                name="eventDate"
                type="date"
                min={today}
                value={formData.eventDate}
                onChange={handleInputChange}
                required
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="eventTime">Event Time</Label>
              <Input
                id="eventTime"
                name="eventTime"
                type="time"
                placeholder="19:00"
                value={formData.eventTime}
                onChange={handleInputChange}
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Doors Time */}
          <div className="space-y-2">
            <Label htmlFor="doorsTime">Doors Open Time (Optional)</Label>
            <Input
              id="doorsTime"
              name="doorsTime"
              type="time"
              placeholder="18:00"
              value={formData.doorsTime}
              onChange={handleInputChange}
              disabled={isSubmitting}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="e.g., Special anniversary tour performance"
              value={formData.description}
              onChange={handleInputChange}
              disabled={isSubmitting}
              rows={3}
            />
          </div>

          {/* Ticket URL */}
          <div className="space-y-2">
            <Label htmlFor="ticketUrl">Ticket URL (Optional)</Label>
            <Input
              id="ticketUrl"
              name="ticketUrl"
              type="url"
              placeholder="https://ticketmaster.com/..."
              value={formData.ticketUrl}
              onChange={handleInputChange}
              disabled={isSubmitting}
            />
          </div>

          {/* Price Range */}
          <div className="space-y-2">
            <Label htmlFor="priceRange">Price Range (Optional)</Label>
            <Input
              id="priceRange"
              name="priceRange"
              placeholder="e.g., $50-$150"
              value={formData.priceRange}
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
            <Button 
              type="submit" 
              disabled={isSubmitting || !formData.artistName.trim() || !formData.venueName.trim() || !formData.eventDate}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Event'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

