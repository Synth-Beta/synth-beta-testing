import React, { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Check, Calendar } from 'lucide-react';
import { ArtistSearchBox } from '@/components/ArtistSearchBox';
import { VenueSearchBox } from '@/components/VenueSearchBox';
import type { Artist } from '@/types/concertSearch';
import type { VenueSearchResult } from '@/services/unifiedVenueSearchService';
import type { ReviewFormData } from '@/hooks/useReviewForm';
import { supabase } from '@/integrations/supabase/client';

interface EventDetailsStepProps {
  formData: ReviewFormData;
  errors: Record<string, string>;
  onUpdateFormData: (updates: Partial<ReviewFormData>) => void;
}

export function EventDetailsStep({ formData, errors, onUpdateFormData }: EventDetailsStepProps) {
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
        const { data, error } = await supabase
          .from('jambase_events')
          .select('id, title, artist_name, venue_name, event_date')
          .or(`artist_name.ilike.%${q}%,title.ilike.%${q}%,venue_name.ilike.%${q}%`)
          .order('event_date', { ascending: false })
          .limit(20);
        if (!error) {
          setEventResults(data || []);
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

  const applyEventSelection = (ev: any) => {
    const eventDate = ev?.event_date ? String(ev.event_date).split('T')[0] : '';
    const selectedArtist = ev?.artist_name ? ({ id: ev.artist_id || `manual-${ev.artist_name}`, name: ev.artist_name, is_from_database: !!ev.artist_id } as any) : null;
    const selectedVenue = ev?.venue_name ? ({ id: ev.venue_id || `manual-${ev.venue_name}`, name: ev.venue_name, is_from_database: !!ev.venue_id } as any) : null;
    const updates: Partial<ReviewFormData> = { reviewType: 'event' } as any;
    if (selectedArtist) (updates as any).selectedArtist = selectedArtist;
    if (selectedVenue) (updates as any).selectedVenue = selectedVenue;
    if (eventDate) (updates as any).eventDate = eventDate;
    onUpdateFormData(updates);
    setShowEventResults(false);
  };

  const handleArtistSelect = (artist: Artist) => {
    onUpdateFormData({ selectedArtist: artist });
  };

  const handleVenueSelect = (venue: VenueSearchResult) => {
    console.log('🎯 Venue selected:', venue);
    onUpdateFormData({ selectedVenue: venue });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateFormData({ eventDate: e.target.value });
  };

  const [artistLocked, setArtistLocked] = React.useState(!!formData.selectedArtist);
  const [venueLocked, setVenueLocked] = React.useState(!!formData.selectedVenue);

  React.useEffect(() => {
    // Keep locks in sync with prefilled data
    setArtistLocked(!!formData.selectedArtist);
  }, [formData.selectedArtist]);

  React.useEffect(() => {
    setVenueLocked(!!formData.selectedVenue);
  }, [formData.selectedVenue]);

  return (
    <div className="space-y-6">
      {/* Quick Event Search */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">Quick search existing event (optional)</Label>
        <div className="relative">
          <Input
            placeholder="Search by artist, event title, or venue..."
            value={eventQuery}
            onChange={(e) => setEventQuery(e.target.value)}
            onFocus={() => { if (eventResults.length > 0) setShowEventResults(true); }}
          />
          {showEventResults && (eventResults.length > 0 || eventLoading) && (
            <div className="absolute z-20 mt-1 w-full max-h-64 overflow-auto rounded-md border bg-white shadow">
              {eventLoading && (
                <div className="px-3 py-2 text-sm text-muted-foreground">Searching…</div>
              )}
              {!eventLoading && eventResults.map(ev => (
                <button
                  key={ev.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  onClick={() => applyEventSelection(ev)}
                >
                  <div className="font-medium text-gray-900">{ev.title || `${ev.artist_name} @ ${ev.venue_name}`}</div>
                  <div className="text-xs text-gray-500">{ev.artist_name} • {ev.venue_name} • {new Date(ev.event_date).toLocaleDateString()}</div>
                </button>
              ))}
              {!eventLoading && eventResults.length === 0 && (
                <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>
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
              onArtistSelect={(a)=>{ handleArtistSelect(a); setArtistLocked(true); }}
              placeholder="Search for an artist or band..."
              className="w-full"
            />
          ) : (
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <div>
                <p className="text-sm font-medium text-green-800">{formData.selectedArtist.name}</p>
              </div>
              <button className="text-xs text-red-600" onClick={()=>{ onUpdateFormData({ selectedArtist: null }); setArtistLocked(false); }}>×</button>
            </div>
          )}
          {errors.selectedArtist && (
            <p className="text-sm text-red-600">{errors.selectedArtist}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="venue" className="text-sm font-medium">Venue *</Label>
          {!formData.selectedVenue || !venueLocked ? (
            <VenueSearchBox
              onVenueSelect={(v)=>{ handleVenueSelect(v); setVenueLocked(true); }}
              placeholder="Search for a venue..."
              className="w-full"
            />
          ) : (
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
              <div>
                <p className="text-sm font-medium text-green-800">{formData.selectedVenue.name}</p>
                {formData.selectedVenue.address && (
                  <p className="text-xs text-green-700">{[formData.selectedVenue.address.addressLocality, formData.selectedVenue.address.addressRegion].filter(Boolean).join(', ')}</p>
                )}
              </div>
              <button className="text-xs text-red-600" onClick={()=>{ onUpdateFormData({ selectedVenue: null }); setVenueLocked(false); }}>×</button>
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
          <h3 className="text-sm font-medium text-blue-900 mb-2">Event Summary</h3>
          <div className="text-sm text-blue-800">
            <p><strong>{formData.selectedArtist.name}</strong></p>
            <p>at <strong>{formData.selectedVenue.name}</strong></p>
            <p>on {new Date(formData.eventDate).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })}</p>
          </div>
        </div>
      )}
    </div>
  );
}
