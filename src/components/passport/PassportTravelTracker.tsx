import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon, divIcon, latLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Calendar, Music, Star, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { Skeleton } from '@/components/ui/skeleton';
import { getMapboxToken } from '@/utils/mapboxToken';

// Fix for default markers in React Leaflet
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Custom pink marker icon for travel tracker — count badge shows when several shows share a city.
const createPinkMarkerIcon = (count: number = 1) => {
  const badge = count > 1 ? `
      <div style="
        position: absolute;
        top: -3px;
        right: -3px;
        min-width: 16px;
        height: 16px;
        padding: 0 3px;
        border-radius: 8px;
        background: white;
        border: 1.5px solid var(--brand-pink-500);
        color: var(--brand-pink-500);
        font-size: 9px;
        font-weight: 800;
        display: flex;
        align-items: center;
        justify-content: center;
      ">${count > 9 ? '9+' : count}</div>` : '';
  return divIcon({
    className: 'travel-tracker-marker',
    html: `<div style="
      position: relative;
      background-color: var(--brand-pink-500);
      color: white;
      border: 3px solid white;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-music2-icon lucide-music-2" style="stroke: var(--neutral-50);">
        <circle cx="8" cy="18" r="4"/>
        <path d="M12 18V2l7 4"/>
      </svg>
      ${badge}
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
};

interface ReviewWithLocation {
  id: string;
  event_id: string | null;
  venue_id: string | null;
  rating: number | null;
  review_text: string | null;
  created_at: string;
  Event_date: string;
  venue_name: string | null;
  artist_name: string | null;
  event_title: string | null;
  latitude: number;
  longitude: number;
  venue_city: string | null;
  venue_state: string | null;
  photos: string[] | null;
  mood_tags: string[] | null;
  genre_tags: string[] | null;
}

/** One map dot — all reviews in the same city/metro area, so nearby venues don't render as overlapping pins. */
interface ReviewCityGroup {
  key: string;
  city: string | null;
  state: string | null;
  latitude: number;
  longitude: number;
  shows: ReviewWithLocation[];
}

function groupReviewsByCity(reviews: ReviewWithLocation[]): ReviewCityGroup[] {
  const groups = new Map<string, ReviewCityGroup>();
  for (const review of reviews) {
    const city = review.venue_city?.trim() || null;
    const state = review.venue_state?.trim() || null;
    const key = city
      ? `${city.toLowerCase()}|${(state || '').toLowerCase()}`
      : state
        ? `state:${state.toLowerCase()}`
        : `venue:${(review.venue_name || review.id).toLowerCase()}`;

    const existing = groups.get(key);
    if (existing) {
      const n = existing.shows.length;
      existing.latitude = (existing.latitude * n + review.latitude) / (n + 1);
      existing.longitude = (existing.longitude * n + review.longitude) / (n + 1);
      existing.shows.push(review);
    } else {
      groups.set(key, {
        key,
        city,
        state,
        latitude: review.latitude,
        longitude: review.longitude,
        shows: [review],
      });
    }
  }
  return Array.from(groups.values());
}

interface PassportTravelTrackerProps {
  userId: string;
}

// Component to fit map bounds to all markers
const MapBoundsFitter = ({ reviews }: { reviews: ReviewWithLocation[] }) => {
  const map = useMap();
  
  useEffect(() => {
    if (reviews.length === 0) return;
    
    try {
      const bounds = latLngBounds(
        reviews.map(review => [review.latitude, review.longitude] as [number, number])
      );
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [50, 50] });
      }
    } catch (error) {
      console.error('Error fitting map bounds:', error);
    }
  }, [map, reviews]);
  
  return null;
};

export const PassportTravelTracker: React.FC<PassportTravelTrackerProps> = ({ userId }) => {
  const [reviews, setReviews] = useState<ReviewWithLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReview, setSelectedReview] = useState<ReviewWithLocation | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([39.8283, -98.5795]); // Center of US
  const cityGroups = useMemo(() => groupReviewsByCity(reviews), [reviews]);

  useEffect(() => {
    loadTravelData();
  }, [userId]);

  const loadTravelData = async () => {
    setLoading(true);
    try {
      // Fetch user's reviews with venue coordinates - only use venues table
      const { data: reviewsData, error } = await supabase
        .from('reviews')
        .select(`
          id,
          event_id,
          venue_id,
          rating,
          review_text,
          created_at,
          Event_date,
          photos,
          mood_tags,
          genre_tags,
          venues:venue_id (
            id,
            name,
            latitude,
            longitude,
            city,
            state,
            street_address
          )
        `)
        .eq('user_id', userId)
        .eq('is_draft', false)
        .not('venue_id', 'is', null)
        .order('Event_date', { ascending: false });

      if (error) throw error;

      // Transform data to include location info from venues table only
      const reviewsWithLocation: ReviewWithLocation[] = (reviewsData || [])
        .map((review: any) => {
          // Get venue data (handle both array and object responses)
          const venue = Array.isArray(review.venues) ? review.venues[0] : review.venues;
          
          if (!venue) return null;

          const latitude = venue.latitude ? Number(venue.latitude) : null;
          const longitude = venue.longitude ? Number(venue.longitude) : null;

          // Only include reviews with valid coordinates
          if (latitude && longitude && !isNaN(latitude) && !isNaN(longitude) && 
              latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180) {
            return {
              id: review.id,
              event_id: review.event_id,
              venue_id: review.venue_id,
              rating: review.rating,
              review_text: review.review_text,
              created_at: review.created_at,
              Event_date: review.Event_date || review.created_at,
              venue_name: venue.name || null,
              artist_name: null, // Not available from venues table
              event_title: null, // Not available from venues table
              latitude,
              longitude,
              venue_city: venue.city || null,
              venue_state: venue.state || null,
              photos: review.photos || null,
              mood_tags: review.mood_tags || null,
              genre_tags: review.genre_tags || null,
            };
          }
          return null;
        })
        .filter((review): review is ReviewWithLocation => review !== null);

      setReviews(reviewsWithLocation);

      // Set map center based on reviews
      if (reviewsWithLocation.length > 0) {
        const avgLat = reviewsWithLocation.reduce((sum, r) => sum + r.latitude, 0) / reviewsWithLocation.length;
        const avgLng = reviewsWithLocation.reduce((sum, r) => sum + r.longitude, 0) / reviewsWithLocation.length;
        setMapCenter([avgLat, avgLng]);
      }
    } catch (error) {
      console.error('Error loading travel data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ 
        paddingLeft: 'var(--spacing-screen-margin-x, 20px)', 
        paddingRight: 'var(--spacing-screen-margin-x, 20px)',
        paddingTop: 'var(--spacing-small, 12px)',
        paddingBottom: 'var(--spacing-small, 12px)'
      }}>
        {/* Section Header */}
        <div className="flex items-center gap-2" style={{ marginBottom: 'var(--spacing-small, 12px)' }}>
          <MapPin size={24} style={{ color: 'var(--brand-pink-500)' }} />
          <h2 style={{ 
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-h2-size, 24px)',
            fontWeight: 'var(--typography-h2-weight, 700)',
            lineHeight: 'var(--typography-h2-line-height, 1.3)',
            color: 'var(--neutral-900)',
            margin: 0
          }}>
            Travel Tracker
          </h2>
        </div>
        <Skeleton className="h-96 w-full" style={{ borderRadius: 'var(--radius-corner, 10px)' }} />
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div style={{ 
        paddingLeft: 'var(--spacing-screen-margin-x, 20px)', 
        paddingRight: 'var(--spacing-screen-margin-x, 20px)',
        paddingTop: 'var(--spacing-small, 12px)',
        paddingBottom: 'var(--spacing-small, 12px)'
      }}>
        {/* Section Header */}
        <div className="flex items-center gap-2" style={{ marginBottom: 'var(--spacing-small, 12px)' }}>
          <MapPin size={24} style={{ color: 'var(--brand-pink-500)' }} />
          <h2 style={{ 
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-h2-size, 24px)',
            fontWeight: 'var(--typography-h2-weight, 700)',
            lineHeight: 'var(--typography-h2-line-height, 1.3)',
            color: 'var(--neutral-900)',
            margin: 0
          }}>
            Travel Tracker
          </h2>
        </div>
        
        {/* Empty State */}
        <div className="flex flex-col items-center justify-center" style={{ 
          gap: 'var(--spacing-inline, 6px)',
          paddingTop: 'var(--spacing-big-section, 60px)',
          paddingBottom: 'var(--spacing-big-section, 60px)'
        }}>
          {/* Large icon (60px), dark grey */}
          <MapPin size={60} style={{ color: 'var(--neutral-600)' }} />
          
          {/* Heading - Body typography, off black */}
          <h3 style={{ 
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-body-size, 20px)',
            fontWeight: 'var(--typography-body-weight, 500)',
            lineHeight: 'var(--typography-body-line-height, 1.5)',
            color: 'var(--neutral-900)',
            margin: 0,
            textAlign: 'center'
          }}>
            No shows tracked yet
          </h3>
          
          {/* Description - Meta typography, dark grey */}
          <p style={{ 
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-meta-size, 16px)',
            fontWeight: 'var(--typography-meta-weight, 500)',
            lineHeight: 'var(--typography-meta-line-height, 1.5)',
            color: 'var(--neutral-600)',
            margin: 0,
            textAlign: 'center'
          }}>
            Start reviewing shows to see your travel map!
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div style={{ 
        paddingLeft: 'var(--spacing-screen-margin-x, 20px)', 
        paddingRight: 'var(--spacing-screen-margin-x, 20px)',
        paddingTop: 'var(--spacing-small, 12px)',
        paddingBottom: 'var(--spacing-small, 12px)'
      }}>
        {/* Section Header */}
        <div className="flex items-center justify-between" style={{ marginBottom: 'var(--spacing-small, 12px)' }}>
          <div className="flex items-center gap-2">
            <MapPin size={24} style={{ color: 'var(--brand-pink-500)' }} />
            <h2 style={{ 
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-h2-size, 24px)',
              fontWeight: 'var(--typography-h2-weight, 700)',
              lineHeight: 'var(--typography-h2-line-height, 1.3)',
              color: 'var(--neutral-900)',
              margin: 0
            }}>
              Travel Tracker
            </h2>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
            {reviews.length} {reviews.length === 1 ? 'show' : 'shows'}
          </span>
        </div>
        
        {/* Map Content */}
        <div>
          <div className="h-96 rounded-lg overflow-hidden border relative z-0">
            <style>{`
              .leaflet-control-attribution {
                font-size: 8px !important;
                padding: 2px 5px !important;
                background: rgba(255,255,255,0.7) !important;
                max-width: 150px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              .leaflet-control-attribution a { color: #666 !important; }
              
              /* Travel Tracker Popup Styling */
              .travel-tracker-popup .leaflet-popup-content-wrapper {
                padding: 0 !important;
              }
              
              .travel-tracker-popup .leaflet-popup-content {
                margin: 0 !important;
                padding: 0 !important;
                position: relative;
              }              
              
              .travel-tracker-popup .leaflet-popup-close-button {
                top: 12px !important;
                right: 20px !important;
                width: 24px !important;
                height: 24px !important;
                font-size: 24px !important;
                line-height: 24px !important;
                color: var(--neutral-900) !important;
                z-index: 10;
              }
              
              .travel-tracker-popup-content {
                padding-left: 20px !important;
                padding-right: 20px !important;
                padding-bottom: 12px !important;
                word-wrap: break-word;
                overflow-wrap: break-word;
              }
              .travel-tracker-popup-review {
                margin-top: 8px !important;
                margin-bottom: 12px !important;
                color: var(--neutral-900) !important;
              }
              
              
              .travel-tracker-popup-title {
                /* Close button: top 12px + height 24px = 36px. Add 12px spacing => 48px */
                margin-top: 48px !important;
                padding-right: 28px !important;
                font-family: var(--font-family) !important;
                font-size: var(--typography-body-size, 18px) !important;
                font-weight: var(--typography-body-weight, 500) !important;
                line-height: var(--typography-body-line-height, 1.5) !important;
                color: var(--neutral-900) !important;
              }
              
              
              .travel-tracker-popup-meta {
                font-family: var(--font-family) !important;
                font-size: var(--typography-meta-size, 16px) !important;
                font-weight: var(--typography-meta-weight, 500) !important;
                line-height: var(--typography-meta-line-height, 1.5) !important;
                word-wrap: break-word;
                overflow-wrap: break-word;
              }
            `}</style>
            <MapContainer
              center={mapCenter}
              zoom={4}
              style={{ height: '100%', width: '100%', zIndex: 0 }}
            >
              <TileLayer
                url={`https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=${getMapboxToken()}`}
                attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              <MapBoundsFitter reviews={reviews} />
              
              {cityGroups.map((group) => (
                <Marker
                  key={group.key}
                  position={[group.latitude, group.longitude]}
                  icon={createPinkMarkerIcon(group.shows.length)}
                  eventHandlers={
                    group.shows.length === 1
                      ? { click: () => setSelectedReview(group.shows[0]) }
                      : undefined
                  }
                >
                  <Popup maxWidth={300} className="travel-tracker-popup">
                    <div className="travel-tracker-popup-content">
                      <div className="travel-tracker-popup-title">
                        {group.city || group.state || group.shows[0].venue_name || 'Show'}
                      </div>
                      <div className="travel-tracker-popup-meta" style={{ color: 'var(--neutral-600)', marginTop: '4px', marginBottom: '4px' }}>
                        {group.shows.length} {group.shows.length === 1 ? 'show' : 'shows'}
                        {group.state ? ` · ${group.state}` : ''}
                      </div>

                      {group.shows.length === 1 ? (
                        <>
                          {group.shows[0].rating && (
                            <div className="travel-tracker-popup-meta" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', marginBottom: '4px' }}>
                              <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" style={{ flexShrink: 0 }} />
                              <span>{group.shows[0].rating.toFixed(1)}</span>
                            </div>
                          )}
                          {group.shows[0].review_text && (
                            <div className="travel-tracker-popup-meta travel-tracker-popup-review">
                              {group.shows[0].review_text}
                            </div>
                          )}
                          <button
                            onClick={() => setSelectedReview(group.shows[0])}
                            className="travel-tracker-popup-meta"
                            style={{
                              marginTop: '8px',
                              color: 'var(--brand-pink-500)',
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              textDecoration: 'underline'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = 'var(--brand-pink-600)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = 'var(--brand-pink-500)';
                            }}
                          >
                            View Review →
                          </button>
                        </>
                      ) : (
                        <div style={{ marginTop: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                          {group.shows.map((show) => (
                            <button
                              key={show.id}
                              onClick={() => setSelectedReview(show)}
                              className="travel-tracker-popup-meta"
                              style={{
                                display: 'block',
                                width: '100%',
                                textAlign: 'left',
                                background: 'none',
                                border: 'none',
                                borderTop: '1px solid var(--neutral-200, #eee)',
                                padding: '8px 0',
                                cursor: 'pointer',
                              }}
                            >
                              <div style={{ fontWeight: 600, color: 'var(--neutral-900)' }}>
                                {show.venue_name || 'Show'}
                              </div>
                              <div style={{ color: 'var(--neutral-600)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {format(new Date(show.Event_date), 'MMM d, yyyy')}
                                {show.rating != null && (
                                  <>
                                    <span>·</span>
                                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                                    {show.rating.toFixed(1)}
                                  </>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        </div>
      </div>

      {/* Review Detail Modal */}
      <Dialog open={!!selectedReview} onOpenChange={() => setSelectedReview(null)}>
      <DialogContent
  className="max-w-2xl max-h-[90vh] overflow-y-auto"
  style={{
    paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
    paddingRight: 'var(--spacing-screen-margin-x, 20px)',
    paddingTop: 'var(--spacing-screen-margin-x, 20px)',
    paddingBottom: 'var(--spacing-screen-margin-x, 20px)',
    borderRadius: 'var(--radius-corner, 10px)'
  }}
>

          {selectedReview && (
            <>
              <DialogHeader
  className="p-0 !text-left"
  style={{
    textAlign: 'left',
    paddingTop: '36px'
  }}
>

  <DialogTitle
    className="flex items-start gap-2 !text-left font-bold"
    style={{ textAlign: 'left', width: '100%', margin: 0, fontFamily: 'var(--font-family)',
    fontSize: 'var(--typography-h2-size, 24px)',
    fontWeight: 'var(--typography-h2-weight, 700)',
    lineHeight: 'var(--typography-h2-line-height, 1.3)',
    color: 'var(--neutral-900)',
     }}
  >

              <Music
  className="w-5 h-5 text-synth-pink"
  style={{ marginTop: 2, flexShrink: 0 }}
  aria-hidden="true"
/>

  <span style={{ display: 'block' }}>
    {selectedReview.venue_name || 'Show Review'}
  </span>
</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Event Info */}
                <div className="space-y-2">
                {selectedReview.venue_name && (
  <div className="flex items-start gap-2 text-sm">
    <MapPin className="w-4 h-4 text-muted-foreground" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
    <span style={{ display: 'block' }}>
      <span className="font-medium">
        {selectedReview.venue_city || selectedReview.venue_name}
      </span>
      {selectedReview.venue_state && (
        <span className="text-muted-foreground">
          {`, ${selectedReview.venue_state}`}
        </span>
      )}
    </span>
  </div>
)}

                  <div className="flex items-start gap-2 text-sm">
  <Calendar className="w-4 h-4 text-muted-foreground" style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
                    <span>{format(new Date(selectedReview.Event_date), 'MMMM d, yyyy')}</span>
                  </div>
                  {selectedReview.rating && (
                    <div className="flex items-center gap-2">
                      <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                      <span className="text-lg font-semibold">{selectedReview.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>

                {/* Review Text */}
                {selectedReview.review_text && (
  <div
    className="pt-2 border-t"
    style={{ paddingBottom: 'var(--spacing-small, 12px)' }}
  >
    <p className="text-sm whitespace-pre-wrap" style={{ margin: 0 }}>
      {selectedReview.review_text}
    </p>
  </div>
)}


                {/* Tags */}
                {(selectedReview.mood_tags?.length || selectedReview.genre_tags?.length) && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    {selectedReview.mood_tags?.map((tag, idx) => (
                      <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
                        {tag}
                      </span>
                    ))}
                    {selectedReview.genre_tags?.map((tag, idx) => (
                      <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Photos */}
                {selectedReview.photos && selectedReview.photos.length > 0 && (
                  <div className="pt-2 border-t">
                    <div className="grid grid-cols-2 gap-2">
                      {selectedReview.photos.slice(0, 4).map((photo, idx) => (
                        <img
                          key={idx}
                          src={photo}
                          alt={`Review photo ${idx + 1}`}
                          className="w-full h-32 object-cover rounded-lg"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

