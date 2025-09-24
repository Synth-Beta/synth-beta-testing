import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Calendar, Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ReviewService } from '@/services/reviewService';

interface VenueCardProps {
  venueId?: string | null;
  venueName: string;
  onClose?: () => void;
}

export function VenueCard({ venueId, venueName, onClose }: VenueCardProps) {
  const [geo, setGeo] = useState<{ lat?: number; lng?: number } | null>(null);
  const [reviews, setReviews] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      // 1) Geo from venue_profile when available
      try {
        if (venueId) {
          const { data } = await (supabase as any)
            .from('venue_profile')
            .select('geo')
            .eq('id', venueId)
            .single();
          if (data?.geo) {
            setGeo({ lat: data.geo.latitude, lng: data.geo.longitude });
          }
        }
      } catch {}

      // 2) Past reviews for this venue
      try {
        if (venueId) {
          const result = await ReviewService.getVenueReviews(venueId);
          setReviews(result.reviews || []);
        }
      } catch {}

      // 3) Upcoming events via JamBase proxy (placeholder endpoint)
      try {
        const rsp = await fetch(`/api/jambase/venues/upcoming?name=${encodeURIComponent(venueName)}`);
        if (rsp.ok) {
          const data = await rsp.json();
          setEvents(Array.isArray(data?.events) ? data.events.slice(0, 5) : []);
        }
      } catch {}
    })();
  }, [venueId, venueName]);

  return (
    <Card className="border-gray-200">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-base font-semibold">{venueName}</h3>
            {geo && ( 
              <div className="text-xs text-gray-600 flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                <span>{geo.lat?.toFixed(3)}, {geo.lng?.toFixed(3)}</span>
              </div>
            )}
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>×</Button>
          )}
        </div>

        {/* Map placeholder (replace with your existing map if desired) */}
        <div className="w-full h-40 rounded border flex items-center justify-center text-sm text-gray-500">
          {geo ? `Map: ${geo.lat?.toFixed(3)}, ${geo.lng?.toFixed(3)}` : 'Map location unavailable'}
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Recent Reviews</h4>
          {reviews.length === 0 ? (
            <p className="text-sm text-gray-500">No venue reviews yet.</p>
          ) : (
            <div className="space-y-2">
              {reviews.slice(0, 3).map((r) => (
                <div key={r.id} className="text-sm text-gray-700 flex items-center gap-2">
                  <Star className="w-3 h-3 text-yellow-400 fill-current" />
                  <span>{r.rating}/5</span>
                  <span className="text-gray-500">•</span>
                  <span className="truncate">{r.review_text || 'No text'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Upcoming Events</h4>
          {events.length === 0 ? (
            <p className="text-sm text-gray-500">No upcoming events found.</p>
          ) : (
            <div className="space-y-2">
              {events.map((e: any, idx: number) => (
                <div key={idx} className="text-sm text-gray-700 flex items-center gap-2">
                  <Calendar className="w-3 h-3" />
                  <span className="truncate">{e.title || e.name || 'Event'}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}


