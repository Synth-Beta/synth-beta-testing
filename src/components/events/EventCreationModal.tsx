/**
 * Event Creation Modal
 * Comprehensive event creation form for business accounts
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
import { PhotoUpload } from '@/components/ui/photo-upload';
import { SinglePhotoUpload } from '@/components/ui/photo-upload';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Calendar, Clock, MapPin, Ticket, ImageIcon, Loader2, Save } from 'lucide-react';
import EventManagementService, { CreateEventData, TicketInfo } from '@/services/eventManagementService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');

  const [formData, setFormData] = useState<CreateEventData>({
    title: prefilledData?.title || '',
    artist_name: prefilledData?.artist_name || '',
    venue_name: prefilledData?.venue_name || '',
    event_date: prefilledData?.event_date || '',
    doors_time: prefilledData?.doors_time || null,
    description: prefilledData?.description || '',
    genres: prefilledData?.genres || [],
    venue_address: prefilledData?.venue_address || '',
    venue_city: prefilledData?.venue_city || '',
    venue_state: prefilledData?.venue_state || '',
    venue_zip: prefilledData?.venue_zip || '',
    price_range: prefilledData?.price_range || '',
    poster_image_url: prefilledData?.poster_image_url || '',
    media_urls: prefilledData?.media_urls || [],
    age_restriction: prefilledData?.age_restriction || '',
    accessibility_info: prefilledData?.accessibility_info || '',
    parking_info: prefilledData?.parking_info || '',
    venue_capacity: prefilledData?.venue_capacity || undefined,
    event_status: 'published',
  });

  const [ticketData, setTicketData] = useState<TicketInfo>({
    ticket_provider: 'ticketmaster',
    ticket_url: '',
    ticket_type: 'general_admission',
    price_min: undefined,
    price_max: undefined,
    currency: 'USD',
    is_primary: true,
  });

  const [genreInput, setGenreInput] = useState('');

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleNumberInput = (name: string, value: string) => {
    const numValue = value ? parseFloat(value) : undefined;
    setFormData((prev) => ({ ...prev, [name]: numValue }));
  };

  const handleTicketChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setTicketData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTicketNumberChange = (name: string, value: string) => {
    const numValue = value ? parseFloat(value) : undefined;
    setTicketData((prev) => ({ ...prev, [name]: numValue }));
  };

  const addGenre = () => {
    if (genreInput.trim() && !formData.genres?.includes(genreInput.trim())) {
      setFormData((prev) => ({
        ...prev,
        genres: [...(prev.genres || []), genreInput.trim()],
      }));
      setGenreInput('');
    }
  };

  const removeGenre = (genre: string) => {
    setFormData((prev) => ({
      ...prev,
      genres: prev.genres?.filter((g) => g !== genre) || [],
    }));
  };

  const handleSubmit = async (isDraft: boolean = false) => {
    // Validation
    if (
      !formData.artist_name.trim() ||
      !formData.venue_name.trim() ||
      !formData.event_date
    ) {
      toast({
        title: 'Missing Required Fields',
        description: 'Please fill in artist name, venue name, and event date.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Create event
      const eventData: CreateEventData = {
        ...formData,
        title: formData.title.trim() || `${formData.artist_name} at ${formData.venue_name}`,
        event_status: isDraft ? 'draft' : 'published',
      };

      const event = await EventManagementService.createEvent(eventData);

      // Add ticket if provided
      if (ticketData.ticket_url.trim()) {
        await EventManagementService.addEventTicket(event.id, {
          ...ticketData,
          ticket_url: ticketData.ticket_url.trim(),
        });
      }

      toast({
        title: isDraft ? 'Event Saved as Draft! 📝' : 'Event Created! 🎉',
        description: `${event.title} has been ${isDraft ? 'saved' : 'published'}.`,
      });

      onEventCreated?.(event);
      handleClose();
    } catch (error) {
      console.error('Error creating event:', error);
      toast({
        title: 'Error',
        description:
          error instanceof Error ? error.message : 'Failed to create event',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setFormData({
        title: '',
        artist_name: '',
        venue_name: '',
        event_date: '',
        doors_time: null,
        description: '',
        genres: [],
        venue_address: '',
        venue_city: '',
        venue_state: '',
        venue_zip: '',
        price_range: '',
        poster_image_url: '',
        media_urls: [],
        age_restriction: '',
        accessibility_info: '',
        parking_info: '',
        venue_capacity: undefined,
        event_status: 'published',
      });
      setTicketData({
        ticket_provider: 'ticketmaster',
        ticket_url: '',
        ticket_type: 'general_admission',
        price_min: undefined,
        price_max: undefined,
        currency: 'USD',
        is_primary: true,
      });
      setActiveTab('basic');
      onClose();
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Create New Event
          </DialogTitle>
          <DialogDescription>
            Fill in the details for your event. Required fields are marked with *.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="basic">Basic Info</TabsTrigger>
            <TabsTrigger value="location">Location</TabsTrigger>
            <TabsTrigger value="media">Media</TabsTrigger>
            <TabsTrigger value="tickets">Tickets</TabsTrigger>
          </TabsList>

          {/* Basic Info Tab */}
          <TabsContent value="basic" className="space-y-4 mt-4">
            {/* Artist Name */}
            <div className="space-y-2">
              <Label htmlFor="artist_name">
                Artist/Performer Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="artist_name"
                name="artist_name"
                placeholder="e.g., Taylor Swift"
                value={formData.artist_name}
                onChange={handleInputChange}
                disabled={isSubmitting}
              />
            </div>

            {/* Venue Name */}
            <div className="space-y-2">
              <Label htmlFor="venue_name">
                Venue Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="venue_name"
                name="venue_name"
                placeholder="e.g., Madison Square Garden"
                value={formData.venue_name}
                onChange={handleInputChange}
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
              {!formData.title && formData.artist_name && formData.venue_name && (
                <p className="text-xs text-gray-500">
                  Will be: "{formData.artist_name} at {formData.venue_name}"
                </p>
              )}
            </div>

            {/* Date and Time */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="event_date">
                  Event Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="event_date"
                  name="event_date"
                  type="datetime-local"
                  min={today}
                  value={formData.event_date}
                  onChange={handleInputChange}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="doors_time">Doors Open Time</Label>
                <Input
                  id="doors_time"
                  name="doors_time"
                  type="datetime-local"
                  value={formData.doors_time || ''}
                  onChange={handleInputChange}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Event Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="Describe the event..."
                value={formData.description}
                onChange={handleInputChange}
                disabled={isSubmitting}
                rows={4}
              />
            </div>

            {/* Genres */}
            <div className="space-y-2">
              <Label>Genres</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Add a genre"
                  value={genreInput}
                  onChange={(e) => setGenreInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addGenre();
                    }
                  }}
                  disabled={isSubmitting}
                />
                <Button type="button" onClick={addGenre} disabled={isSubmitting}>
                  Add
                </Button>
              </div>
              {formData.genres && formData.genres.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {formData.genres.map((genre) => (
                    <span
                      key={genre}
                      className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm flex items-center gap-1"
                    >
                      {genre}
                      <button
                        type="button"
                        onClick={() => removeGenre(genre)}
                        className="ml-1 hover:text-purple-900"
                        disabled={isSubmitting}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Additional Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age_restriction">Age Restriction</Label>
                <Input
                  id="age_restriction"
                  name="age_restriction"
                  placeholder="e.g., 21+, All Ages"
                  value={formData.age_restriction}
                  onChange={handleInputChange}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="venue_capacity">Venue Capacity</Label>
                <Input
                  id="venue_capacity"
                  name="venue_capacity"
                  type="number"
                  placeholder="e.g., 20000"
                  value={formData.venue_capacity || ''}
                  onChange={(e) => handleNumberInput('venue_capacity', e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </TabsContent>

          {/* Location Tab */}
          <TabsContent value="location" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="venue_address">Street Address</Label>
              <Input
                id="venue_address"
                name="venue_address"
                placeholder="123 Main St"
                value={formData.venue_address}
                onChange={handleInputChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="venue_city">City</Label>
                <Input
                  id="venue_city"
                  name="venue_city"
                  placeholder="New York"
                  value={formData.venue_city}
                  onChange={handleInputChange}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="venue_state">State</Label>
                <Input
                  id="venue_state"
                  name="venue_state"
                  placeholder="NY"
                  value={formData.venue_state}
                  onChange={handleInputChange}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="venue_zip">ZIP Code</Label>
              <Input
                id="venue_zip"
                name="venue_zip"
                placeholder="10001"
                value={formData.venue_zip}
                onChange={handleInputChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="parking_info">Parking Information</Label>
              <Textarea
                id="parking_info"
                name="parking_info"
                placeholder="Where to park, parking fees, etc."
                value={formData.parking_info}
                onChange={handleInputChange}
                disabled={isSubmitting}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="accessibility_info">Accessibility Information</Label>
              <Textarea
                id="accessibility_info"
                name="accessibility_info"
                placeholder="Wheelchair access, accessible seating, etc."
                value={formData.accessibility_info}
                onChange={handleInputChange}
                disabled={isSubmitting}
                rows={3}
              />
            </div>
          </TabsContent>

          {/* Media Tab */}
          <TabsContent value="media" className="space-y-4 mt-4">
            {user && (
              <>
                <div className="space-y-2">
                  <Label>Event Poster</Label>
                  <SinglePhotoUpload
                    value={formData.poster_image_url}
                    onChange={(url) =>
                      setFormData((prev) => ({ ...prev, poster_image_url: url }))
                    }
                    userId={user.id}
                    bucket="event-media"
                    label="Upload Poster"
                    helperText="Upload a poster image for the event (recommended: 1080x1080px)"
                    aspectRatio="square"
                    disabled={isSubmitting}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Additional Photos</Label>
                  <PhotoUpload
                    value={formData.media_urls || []}
                    onChange={(urls) =>
                      setFormData((prev) => ({ ...prev, media_urls: urls }))
                    }
                    userId={user.id}
                    bucket="event-media"
                    maxPhotos={10}
                    label="Upload Photos"
                    helperText="Upload up to 10 photos of the venue, past events, etc."
                    disabled={isSubmitting}
                  />
                </div>
              </>
            )}
          </TabsContent>

          {/* Tickets Tab */}
          <TabsContent value="tickets" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="ticket_url">Ticket URL</Label>
              <Input
                id="ticket_url"
                name="ticket_url"
                type="url"
                placeholder="https://ticketmaster.com/..."
                value={ticketData.ticket_url}
                onChange={handleTicketChange}
                disabled={isSubmitting}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ticket_provider">Ticket Provider</Label>
                <select
                  id="ticket_provider"
                  name="ticket_provider"
                  value={ticketData.ticket_provider}
                  onChange={handleTicketChange}
                  className="w-full px-3 py-2 border rounded-md"
                  disabled={isSubmitting}
                >
                  <option value="ticketmaster">Ticketmaster</option>
                  <option value="eventbrite">Eventbrite</option>
                  <option value="dice">DICE</option>
                  <option value="seatgeek">SeatGeek</option>
                  <option value="axs">AXS</option>
                  <option value="stubhub">StubHub</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ticket_type">Ticket Type</Label>
                <select
                  id="ticket_type"
                  name="ticket_type"
                  value={ticketData.ticket_type}
                  onChange={handleTicketChange}
                  className="w-full px-3 py-2 border rounded-md"
                  disabled={isSubmitting}
                >
                  <option value="general_admission">General Admission</option>
                  <option value="reserved_seating">Reserved Seating</option>
                  <option value="vip">VIP</option>
                  <option value="early_bird">Early Bird</option>
                  <option value="student">Student</option>
                  <option value="group">Group</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="price_min">Min Price ($)</Label>
                <Input
                  id="price_min"
                  name="price_min"
                  type="number"
                  step="0.01"
                  placeholder="25.00"
                  value={ticketData.price_min || ''}
                  onChange={(e) => handleTicketNumberChange('price_min', e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="price_max">Max Price ($)</Label>
                <Input
                  id="price_max"
                  name="price_max"
                  type="number"
                  step="0.01"
                  placeholder="150.00"
                  value={ticketData.price_max || ''}
                  onChange={(e) => handleTicketNumberChange('price_max', e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <select
                  id="currency"
                  name="currency"
                  value={ticketData.currency}
                  onChange={handleTicketChange}
                  className="w-full px-3 py-2 border rounded-md"
                  disabled={isSubmitting}
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="CAD">CAD</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="price_range">Price Range (Display Text)</Label>
              <Input
                id="price_range"
                name="price_range"
                placeholder="e.g., $25-$150"
                value={formData.price_range}
                onChange={handleInputChange}
                disabled={isSubmitting}
              />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleSubmit(true)}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Draft
              </>
            )}
          </Button>
          <Button
            type="button"
            onClick={() => handleSubmit(false)}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Publishing...
              </>
            ) : (
              'Publish Event'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default EventCreationModal;

