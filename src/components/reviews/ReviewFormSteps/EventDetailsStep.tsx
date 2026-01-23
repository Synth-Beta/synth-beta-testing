import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar, X } from 'lucide-react';
import { ArtistSearchBox } from '@/components/ArtistSearchBox';
import { VenueSearchBox } from '@/components/VenueSearchBox';
import type { Artist } from '@/types/concertSearch';
import type { VenueSearchResult } from '@/services/unifiedVenueSearchService';
import type { ReviewFormData } from '@/hooks/useReviewForm';
import { supabase } from '@/integrations/supabase/client';
import { isEventPast, getEventStatus } from '@/utils/eventStatusUtils';

interface EventDetailsStepProps {
  formData: ReviewFormData;
  errors: Record<string, string>;
  onUpdateFormData: (updates: Partial<ReviewFormData>) => void;
  onClose?: () => void;
}

export function EventDetailsStep({ formData, errors, onUpdateFormData, onClose }: EventDetailsStepProps) {
  // Quick event search (Supabase backed)
  const [eventQuery, setEventQuery] = React.useState('');
  const [eventResults, setEventResults] = React.useState<Array<any>>([]);
  const [eventLoading, setEventLoading] = React.useState(false);
  const [showEventResults, setShowEventResults] = React.useState(false);

  React.useEffect(() => {
    const handler = setTimeout(async () => {
      const q = eventQuery.trim();
      if (q.length < 2) { setEventResults([]); return; }
      try {
        setEventLoading(true);
        // Search by artist, title, or venue with OR conditions
        // Prioritize past events for reviews by ordering past events first
        // Use helper view for normalized schema (artist_name and venue_name columns removed)
        const { data, error } = await supabase
          .from('events_with_artist_venue')
          .select('id, title, artist_name_normalized, venue_name_normalized, event_date, artist_id, venue_id')
          .or(`artist_name_normalized.ilike.%${q}%,title.ilike.%${q}%,venue_name_normalized.ilike.%${q}%`)
          .order('event_date', { ascending: false })
          .limit(50); // Increased limit to get more results
        
        if (error) {
          // Log error but don't spam console - view might not exist or have issues
          if (error.code !== 'PGRST116') { // PGRST116 = relation does not exist (expected in some cases)
            console.warn('⚠️ Event search error:', error.message);
          }
          setEventResults([]);
          setShowEventResults(false);
        } else if (data) {
          // Filter to ONLY show past events for reviews
          const pastEventsOnly = data.filter(event => isEventPast(event.event_date));
          
          // Sort past events by date (most recent first)
          const sortedResults = pastEventsOnly.sort((a, b) => 
            new Date(b.event_date).getTime() - new Date(a.event_date).getTime()
          );
          
          setEventResults(sortedResults);
          setShowEventResults(true);
        } else {
          setEventResults([]);
          setShowEventResults(false);
        }
      } finally {
        setEventLoading(false);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [eventQuery]);

  const applyEventSelection = async (ev: any) => {
    const eventDate = ev?.event_date ? String(ev.event_date).split('T')[0] : '';
    // Support both normalized and legacy column names
    const artistName = ev?.artist_name_normalized || ev?.artist_name;
    const selectedArtist = artistName ? ({ id: ev.artist_id || `manual-${artistName}`, name: artistName, is_from_database: !!ev.artist_id } as any) : null;
    
    // For venue, we need to find the actual venue record to get the correct ID
    let selectedVenue = null;
    const venueName = ev?.venue_name_normalized || ev?.venue_name;
    if (venueName) {
      try {
        // First try to find by venue_id from the event
        if (ev.venue_id) {
          const { data: venueData } = await supabase
            .from('venues')
            .select('id, name, identifier')
            .eq('id', ev.venue_id)
            .single();
          
          if (venueData) {
            selectedVenue = {
              id: venueData.id,
              name: venueData.name,
              identifier: venueData.identifier,
              is_from_database: true
            } as any;
          }
        }
        
        // Fallback: if no venue found, create a manual venue entry
        if (!selectedVenue) {
          selectedVenue = {
            id: ev.venue_id || `manual-${venueName}`,
            name: venueName,
            is_from_database: !!ev.venue_id
          } as any;
        }
      } catch (error) {
        console.error('Error looking up venue:', error);
        // Fallback to manual venue (use normalized column name)
        const fallbackVenueName = (ev as any)?.venue_name_normalized || ev?.venue_name || 'Unknown Venue';
        selectedVenue = {
          id: ev.venue_id || `manual-${fallbackVenueName}`,
          name: fallbackVenueName,
          is_from_database: false
        } as any;
      }
    }
    
    const updates: Partial<ReviewFormData> = { reviewType: 'event' } as any;
    if (selectedArtist) (updates as any).selectedArtist = selectedArtist;
    if (selectedVenue) (updates as any).selectedVenue = selectedVenue;
    if (eventDate) (updates as any).eventDate = eventDate;
    onUpdateFormData(updates);
    setShowEventResults(false);
    if (selectedArtist) setArtistLocked(true);
    if (selectedVenue) setVenueLocked(true);
  };

  const handleArtistSelect = (artist: Artist) => {
    console.log('🎵 Artist selected in EventDetailsStep:', {
      name: artist.name,
      id: artist.id,
    });
    onUpdateFormData({ selectedArtist: artist });
    // Lock immediately to prevent race condition
    setArtistLocked(true);
  };

  const handleVenueSelect = (venue: VenueSearchResult) => {
    console.log('🎯 Venue selected in EventDetailsStep:', {
      name: venue.name,
      id: venue.id,
      is_from_database: venue.is_from_database,
      identifier: venue.identifier,
    });
    console.log('🎯 Before update - formData.selectedVenue:', formData.selectedVenue);
    console.log('🎯 Before update - venueLocked:', venueLocked);
    
    onUpdateFormData({ selectedVenue: venue });
    
    console.log('🎯 After update - setting venueLocked to true');
    // Lock immediately to prevent race condition
    setVenueLocked(true);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateFormData({ eventDate: e.target.value });
  };

  const [artistLocked, setArtistLocked] = React.useState(!!formData.selectedArtist);
  const [venueLocked, setVenueLocked] = React.useState(!!formData.selectedVenue);
  
  console.log('🎵 EventDetailsStep: Debug:', {
    hasSelectedArtist: !!formData.selectedArtist,
    artistLocked,
    shouldShowButton: !formData.selectedArtist || !artistLocked,
    hasSetlist: !!formData.selectedSetlist
  });

  React.useEffect(() => {
    // When artist is selected, lock it (don't allow changing when editing)
    if (formData.selectedArtist) {
      setArtistLocked(true);
    } else {
      setArtistLocked(false);
    }
  }, [formData.selectedArtist]);

  React.useEffect(() => {
    // When venue is selected, lock it
    if (formData.selectedVenue) {
      setVenueLocked(true);
    } else {
      setVenueLocked(false);
    }
  }, [formData.selectedVenue]);

  return (
    <div className="space-y-6">
      {/* Quick Event Search with inline close */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Quick search existing event (optional)</Label>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0" aria-label="Close">
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
        <div className="relative">
          <Input
            placeholder="Search by artist, event title, or venue..."
            aria-label="Quick search existing event"
            value={eventQuery}
            onChange={(e) => setEventQuery(e.target.value)}
            onFocus={() => { if (eventResults.length > 0) setShowEventResults(true); }}
          />
          {showEventResults && (eventResults.length > 0 || eventLoading) && (
            <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-md border bg-white shadow">
              {eventLoading && (
                <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
              )}
              {!eventLoading && eventResults.map(ev => {
                const eventStatus = getEventStatus(ev.event_date);
                const isPast = isEventPast(ev.event_date);
                
                return (
                  <button
                    key={ev.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-l-4 border-l-green-500 bg-green-50/30"
                    onClick={() => applyEventSelection(ev)}
                  >
                    <div className="font-medium text-gray-900">{ev.title || `${(ev as any).artist_name_normalized || ev.artist_name || 'Artist'} @ ${(ev as any).venue_name_normalized || ev.venue_name || 'Venue'}`}</div>
                    <div className="text-xs text-gray-500 flex items-center justify-between">
                      <span>{(ev as any).artist_name_normalized || ev.artist_name || 'Artist'} • {(ev as any).venue_name_normalized || ev.venue_name || 'Venue'} • {new Date(ev.event_date).toLocaleDateString()}</span>
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Past Event
                      </span>
                    </div>
                  </button>
                );
              })}
              {!eventLoading && eventResults.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">No past events found</div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Event Details</h2>
        <p className="text-sm text-gray-600">Tell us about the concert you attended</p>
      </div>
      {/* Horizontal row: Artist, Venue, Date */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        <div className="space-y-2">
          <Label htmlFor="artist" className="text-sm font-medium">Artist or Band *</Label>
          {!formData.selectedArtist || !artistLocked ? (
            <ArtistSearchBox
              onArtistSelect={handleArtistSelect}
              placeholder="Search for an artist or band..."
              className="w-full"
              hideClearButton={!!formData.selectedArtist}
            />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
                <div>
                  <p className="text-sm font-medium text-green-800">{formData.selectedArtist.name}</p>
                </div>
                <button
                  type="button"
                  className="text-xs text-red-600"
                  onClick={() => { onUpdateFormData({ selectedArtist: null }); setArtistLocked(false); }}
                  aria-label="Clear selected artist"
                >
                  ×
                </button>
              </div>
            </div>
          )}
          {errors.selectedArtist && (
            <p className="text-sm text-red-600">{errors.selectedArtist}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="venue" className="text-sm font-medium">Venue *</Label>
          {(() => {
            console.log('🎯 Venue render check:', {
              hasSelectedVenue: !!formData.selectedVenue,
              venueLocked,
              selectedVenueName: formData.selectedVenue?.name,
              shouldShowSearch: !formData.selectedVenue || !venueLocked
            });
            return null;
          })()}
          {!formData.selectedVenue || !venueLocked ? (
            <VenueSearchBox
              onVenueSelect={handleVenueSelect}
              placeholder="Search for a venue..."
              className="w-full"
              hideClearButton={!!formData.selectedVenue}
            />
          ) : (
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <div>
                <p className="text-sm font-medium text-green-800">{formData.selectedVenue.name}</p>
                {formData.selectedVenue.address && (
                  <p className="text-xs text-green-700">{[formData.selectedVenue.address.addressLocality, formData.selectedVenue.address.addressRegion].filter(Boolean).join(', ')}</p>
                )}
              </div>
              <button
                type="button"
                className="text-xs text-red-600"
                onClick={() => { onUpdateFormData({ selectedVenue: null }); setVenueLocked(false); }}
                aria-label="Clear selected venue"
              >
                ×
              </button>
            </div>
          )}
          {errors.selectedVenue && (
            <p className="text-sm text-red-600">{errors.selectedVenue}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="eventDate" className="text-sm font-medium flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Date *
          </Label>
          <Input
            id="eventDate"
            type="date"
            value={formData.eventDate}
            onChange={handleDateChange}
            className="w-full"
            max={new Date().toISOString().split('T')[0]}
          />
          {errors.eventDate && (
            <p className="text-sm text-red-600">{errors.eventDate}</p>
          )}
        </div>
      </div>

      {/* Summary */}
      {formData.selectedArtist && formData.selectedVenue && formData.eventDate && (
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h3 className="font-medium text-blue-900 mb-2" style={{
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-body-size, 20px)',
            fontWeight: 'var(--typography-body-weight, 500)',
            lineHeight: 'var(--typography-body-line-height, 1.5)'
          }}>Event Summary</h3>
          <div className="text-blue-800" style={{
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-meta-size, 16px)',
            fontWeight: 'var(--typography-meta-weight, 500)',
            lineHeight: 'var(--typography-meta-line-height, 1.5)'
          }}>
            <p style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              lineHeight: 'var(--typography-meta-line-height, 1.5)'
            }}>
              <button
                className="font-bold hover:text-blue-600 hover:underline cursor-pointer"
                style={{
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-bold-weight, 700)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)'
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const ev = new CustomEvent('open-artist-card', { 
                    detail: { 
                      artistId: formData.selectedArtist?.id, 
                      artistName: formData.selectedArtist?.name 
                    } 
                  });
                  document.dispatchEvent(ev);
                }}
                aria-label={`View artist ${formData.selectedArtist.name}`}
              >
                {formData.selectedArtist.name}
              </button>
            </p>
            <p style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              lineHeight: 'var(--typography-meta-line-height, 1.5)'
            }}>
              at{' '}
              <button
                className="font-bold hover:text-blue-600 hover:underline cursor-pointer"
                style={{
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-bold-weight, 700)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)'
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const ev = new CustomEvent('open-venue-card', { 
                    detail: { 
                      venueId: formData.selectedVenue?.id, 
                      venueName: formData.selectedVenue?.name 
                    } 
                  });
                  document.dispatchEvent(ev);
                }}
                aria-label={`View venue ${formData.selectedVenue.name}`}
              >
                {formData.selectedVenue.name}
              </button>
            </p>
            <p style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              lineHeight: 'var(--typography-meta-line-height, 1.5)'
            }}>on {new Date(formData.eventDate + 'T12:00:00').toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}</p>
          </div>
        </div>
      )}

      {/* Setlist Modal */}
    </div>
  );
}
