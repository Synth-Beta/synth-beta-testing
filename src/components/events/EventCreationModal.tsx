/**
 * Simplified Event Creation Modal
 * Allows admin, creator, and business accounts to create events
 * No complex claiming logic - just simple event creation
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
import { Calendar, MapPin, Loader2, Music, Users, Clock } from 'lucide-react';
import EventManagementService, { CreateEventData } from '@/services/eventManagementService';

interface EventCreationModalProps {
  open: boolean;
  onClose: () => void;
  onEventCreated?: (event: any) => void;
  prefilledData?: Partial<CreateEventData>;
}

export function EventCreationModal({
  open,
  onClose,
  onEventCreated,
  prefilledData,
}: EventCreationModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CreateEventData>({
    title: '',
    artist_name: '',
    venue_name: '',
    event_date: '',
    latitude: undefined,
    longitude: undefined,
    poster_image_url: '',
    video_url: '',
    age_restriction: '',
    accessibility_info: '',
    parking_info: '',
    venue_capacity: undefined,
    estimated_attendance: undefined,
    media_urls: [],
    ...prefilledData,
  });

  const { toast } = useToast();

  const handleInputChange = (field: keyof CreateEventData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast({
        title: 'Title required',
        description: 'Please enter an event title.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const event = await EventManagementService.createEvent(formData);
      
      toast({
        title: 'Event created!',
        description: 'Your event has been created successfully.',
      });

      onEventCreated?.(event);
      handleClose();
    } catch (error) {
      console.error('Error creating event:', error);
      toast({
        title: 'Creation failed',
        description: error instanceof Error ? error.message : 'Failed to create event',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setFormData({
        title: '',
        artist_name: '',
        venue_name: '',
        event_date: '',
        latitude: undefined,
        longitude: undefined,
        poster_image_url: '',
        video_url: '',
        age_restriction: '',
        accessibility_info: '',
        parking_info: '',
        venue_capacity: undefined,
        estimated_attendance: undefined,
        media_urls: [],
        ...prefilledData,
      });
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-purple-600" />
            Create New Event
          </DialogTitle>
          <DialogDescription>
            Create a new event for your audience. Fill in the details below.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Music className="h-5 w-5" />
              Basic Information
            </h3>
            
            <div className="space-y-2">
              <Label htmlFor="title">Event Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="e.g., Summer Music Festival 2024"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="artist_name">Artist/Performer</Label>
                <Input
                  id="artist_name"
                  value={formData.artist_name || ''}
                  onChange={(e) => handleInputChange('artist_name', e.target.value)}
                  placeholder="e.g., The Rolling Stones"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="venue_name">Venue</Label>
                <Input
                  id="venue_name"
                  value={formData.venue_name || ''}
                  onChange={(e) => handleInputChange('venue_name', e.target.value)}
                  placeholder="e.g., Madison Square Garden"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="event_date">Event Date & Time</Label>
              <Input
                id="event_date"
                type="datetime-local"
                value={formData.event_date || ''}
                onChange={(e) => handleInputChange('event_date', e.target.value)}
              />
            </div>
          </div>

          {/* Location Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Location Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="latitude">Latitude</Label>
                <Input
                  id="latitude"
                  type="number"
                  step="any"
                  value={formData.latitude || ''}
                  onChange={(e) => handleInputChange('latitude', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="40.7128"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="longitude">Longitude</Label>
                <Input
                  id="longitude"
                  type="number"
                  step="any"
                  value={formData.longitude || ''}
                  onChange={(e) => handleInputChange('longitude', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="-74.0060"
                />
              </div>
            </div>
          </div>

          {/* Additional Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Users className="h-5 w-5" />
              Additional Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="venue_capacity">Venue Capacity</Label>
                <Input
                  id="venue_capacity"
                  type="number"
                  value={formData.venue_capacity || ''}
                  onChange={(e) => handleInputChange('venue_capacity', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="5000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="estimated_attendance">Estimated Attendance</Label>
                <Input
                  id="estimated_attendance"
                  type="number"
                  value={formData.estimated_attendance || ''}
                  onChange={(e) => handleInputChange('estimated_attendance', e.target.value ? parseInt(e.target.value) : undefined)}
                  placeholder="3000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="age_restriction">Age Restriction</Label>
              <Input
                id="age_restriction"
                value={formData.age_restriction || ''}
                onChange={(e) => handleInputChange('age_restriction', e.target.value)}
                placeholder="e.g., 18+, All Ages, 21+"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessibility_info">Accessibility Information</Label>
              <Textarea
                id="accessibility_info"
                value={formData.accessibility_info || ''}
                onChange={(e) => handleInputChange('accessibility_info', e.target.value)}
                placeholder="Information about accessibility features..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parking_info">Parking Information</Label>
              <Textarea
                id="parking_info"
                value={formData.parking_info || ''}
                onChange={(e) => handleInputChange('parking_info', e.target.value)}
                placeholder="Information about parking options..."
                rows={3}
              />
            </div>
          </div>

          {/* Media URLs */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Music className="h-5 w-5" />
              Media
            </h3>

            <div className="space-y-2">
              <Label htmlFor="poster_image_url">Poster Image URL</Label>
              <Input
                id="poster_image_url"
                value={formData.poster_image_url || ''}
                onChange={(e) => handleInputChange('poster_image_url', e.target.value)}
                placeholder="https://example.com/poster.jpg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="video_url">Video URL</Label>
              <Input
                id="video_url"
                value={formData.video_url || ''}
                onChange={(e) => handleInputChange('video_url', e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
              />
            </div>
          </div>
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            onClick={handleSubmit}
            disabled={loading}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Calendar className="w-4 h-4 mr-2" />
                Create Event
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
