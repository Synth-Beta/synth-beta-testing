import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, MapPin, Clock, X, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import EventManagementService from '@/services/eventManagementService';

interface EventEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: any;
  onEventUpdated: () => void;
}

export function EventEditModal({ isOpen, onClose, event, onEventUpdated }: EventEditModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    artist_name: '',
    venue_name: '',
    event_date: '',
    doors_time: '',
    description: '',
    venue_address: '',
    venue_city: '',
    venue_state: '',
    venue_zip: '',
    price_range: '',
    poster_image_url: '',
    age_restriction: '',
    accessibility_info: '',
    parking_info: '',
    venue_capacity: '',
    event_status: 'published' as 'draft' | 'published'
  });

  // Populate form with event data when modal opens
  useEffect(() => {
    if (event && isOpen) {
      setFormData({
        title: event.title || '',
        artist_name: event.artist_name || '',
        venue_name: event.venue_name || '',
        event_date: event.event_date ? new Date(event.event_date).toISOString().slice(0, 16) : '',
        doors_time: event.doors_time ? new Date(event.doors_time).toISOString().slice(0, 16) : '',
        description: event.description || '',
        venue_address: event.venue_address || '',
        venue_city: event.venue_city || '',
        venue_state: event.venue_state || '',
        venue_zip: event.venue_zip || '',
        price_range: event.price_range || '',
        poster_image_url: event.poster_image_url || '',
        age_restriction: event.age_restriction || '',
        accessibility_info: event.accessibility_info || '',
        parking_info: event.parking_info || '',
        venue_capacity: event.venue_capacity?.toString() || '',
        event_status: event.event_status || 'published'
      });
    }
  }, [event, isOpen]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await EventManagementService.updateEvent(event.id, {
        title: formData.title,
        artist_name: formData.artist_name,
        venue_name: formData.venue_name,
        event_date: formData.event_date,
        doors_time: formData.doors_time || null,
        description: formData.description || null,
        venue_address: formData.venue_address || null,
        venue_city: formData.venue_city || null,
        venue_state: formData.venue_state || null,
        venue_zip: formData.venue_zip || null,
        price_range: formData.price_range || null,
        poster_image_url: formData.poster_image_url || null,
        age_restriction: formData.age_restriction || null,
        accessibility_info: formData.accessibility_info || null,
        parking_info: formData.parking_info || null,
        venue_capacity: formData.venue_capacity ? parseInt(formData.venue_capacity) : null,
        event_status: formData.event_status
      });

      toast({
        title: 'Event Updated',
        description: 'Your event has been successfully updated',
      });

      onEventUpdated();
      onClose();
    } catch (error) {
      console.error('Error updating event:', error);
      toast({
        title: 'Error',
        description: 'Failed to update event. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!event) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Edit Event
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Basic Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Event Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleInputChange('title', e.target.value)}
                  placeholder="Enter event title"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="artist_name">Artist Name *</Label>
                <Input
                  id="artist_name"
                  value={formData.artist_name}
                  onChange={(e) => handleInputChange('artist_name', e.target.value)}
                  placeholder="Enter artist name"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Describe your event..."
                rows={3}
              />
            </div>
          </div>

          {/* Date & Time */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Date & Time</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="event_date">Event Date & Time *</Label>
                <Input
                  id="event_date"
                  type="datetime-local"
                  value={formData.event_date}
                  onChange={(e) => handleInputChange('event_date', e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="doors_time">Doors Open</Label>
                <Input
                  id="doors_time"
                  type="datetime-local"
                  value={formData.doors_time}
                  onChange={(e) => handleInputChange('doors_time', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Venue Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Venue Information</h3>
            
            <div className="space-y-2">
              <Label htmlFor="venue_name">Venue Name *</Label>
              <Input
                id="venue_name"
                value={formData.venue_name}
                onChange={(e) => handleInputChange('venue_name', e.target.value)}
                placeholder="Enter venue name"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="venue_address">Address</Label>
              <Input
                id="venue_address"
                value={formData.venue_address}
                onChange={(e) => handleInputChange('venue_address', e.target.value)}
                placeholder="Enter venue address"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="venue_city">City</Label>
                <Input
                  id="venue_city"
                  value={formData.venue_city}
                  onChange={(e) => handleInputChange('venue_city', e.target.value)}
                  placeholder="City"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="venue_state">State</Label>
                <Input
                  id="venue_state"
                  value={formData.venue_state}
                  onChange={(e) => handleInputChange('venue_state', e.target.value)}
                  placeholder="State"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="venue_zip">ZIP Code</Label>
                <Input
                  id="venue_zip"
                  value={formData.venue_zip}
                  onChange={(e) => handleInputChange('venue_zip', e.target.value)}
                  placeholder="ZIP"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="venue_capacity">Venue Capacity</Label>
                <Input
                  id="venue_capacity"
                  type="number"
                  value={formData.venue_capacity}
                  onChange={(e) => handleInputChange('venue_capacity', e.target.value)}
                  placeholder="Capacity"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="price_range">Price Range</Label>
                <Input
                  id="price_range"
                  value={formData.price_range}
                  onChange={(e) => handleInputChange('price_range', e.target.value)}
                  placeholder="e.g., $20-50"
                />
              </div>
            </div>
          </div>

          {/* Additional Information */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Additional Information</h3>
            
            <div className="space-y-2">
              <Label htmlFor="poster_image_url">Poster Image URL</Label>
              <Input
                id="poster_image_url"
                value={formData.poster_image_url}
                onChange={(e) => handleInputChange('poster_image_url', e.target.value)}
                placeholder="https://example.com/poster.jpg"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age_restriction">Age Restriction</Label>
                <Input
                  id="age_restriction"
                  value={formData.age_restriction}
                  onChange={(e) => handleInputChange('age_restriction', e.target.value)}
                  placeholder="e.g., 18+, 21+, All Ages"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="event_status">Event Status</Label>
                <Select value={formData.event_status} onValueChange={(value) => handleInputChange('event_status', value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessibility_info">Accessibility Information</Label>
              <Textarea
                id="accessibility_info"
                value={formData.accessibility_info}
                onChange={(e) => handleInputChange('accessibility_info', e.target.value)}
                placeholder="Accessibility details..."
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parking_info">Parking Information</Label>
              <Textarea
                id="parking_info"
                value={formData.parking_info}
                onChange={(e) => handleInputChange('parking_info', e.target.value)}
                placeholder="Parking details..."
                rows={2}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Event'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
