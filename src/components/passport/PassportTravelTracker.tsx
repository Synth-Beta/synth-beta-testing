import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Icon, divIcon, latLngBounds } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Calendar, Music, Star, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

// Fix for default markers in React Leaflet
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Custom pink marker icon for travel tracker
const createPinkMarkerIcon = () => {
  return divIcon({
    className: 'travel-tracker-marker',
    html: `<div style="
      background-color: #FF3399;
      color: white;
      border: 3px solid white;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    ">🎵</div>`,
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
              venue_city: null, // Not in venues schema provided
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
          <Badge variant="secondary" style={{
            backgroundColor: 'var(--neutral-100)',
            color: 'var(--neutral-900)',
            border: '1px solid var(--neutral-200)'
          }}>
            {reviews.length} {reviews.length === 1 ? 'show' : 'shows'}
          </Badge>
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
            `}</style>
            <MapContainer
              center={mapCenter}
              zoom={4}
              style={{ height: '100%', width: '100%', zIndex: 0 }}
            >
              <TileLayer
                url={`https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=${import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MAPBOX_KEY || 'pk.eyJ1Ijoic2xvaXRlcnN0ZWluIiwiYSI6ImNtamhvM3ozOTFnOHIza29yZHJmcGQ0ZGkifQ.5FU9eVyo5DAhSfESdWrI9w'}`}
                attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              />
              <MapBoundsFitter reviews={reviews} />
              
              {reviews.map((review) => (
                <Marker
                  key={review.id}
                  position={[review.latitude, review.longitude]}
                  icon={createPinkMarkerIcon()}
                  eventHandlers={{
                    click: () => {
                      setSelectedReview(review);
                    },
                  }}
                >
                  <Popup maxWidth={300}>
                    <div className="p-2">
                      <div className="font-semibold text-sm mb-1">
                        {review.venue_name || 'Show'}
                      </div>
                      {review.venue_state && (
                        <div className="text-xs text-gray-600 mb-1">
                          {review.venue_state}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mb-2">
                        {format(new Date(review.Event_date), 'MMM d, yyyy')}
                      </div>
                      {review.rating && (
                        <div className="flex items-center gap-1 text-xs">
                          <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                          <span>{review.rating.toFixed(1)}</span>
                        </div>
                      )}
                      <button
                        onClick={() => setSelectedReview(review)}
                        className="mt-2 text-xs text-synth-pink hover:underline"
                      >
                        View Review →
                      </button>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {selectedReview && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Music className="w-5 h-5 text-synth-pink" />
                  {selectedReview.venue_name || 'Show Review'}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {/* Event Info */}
                <div className="space-y-2">
                  {selectedReview.venue_name && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{selectedReview.venue_name}</span>
                      {selectedReview.venue_state && (
                        <span className="text-muted-foreground">
                          {selectedReview.venue_state}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
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
                  <div className="pt-2 border-t">
                    <p className="text-sm whitespace-pre-wrap">{selectedReview.review_text}</p>
                  </div>
                )}

                {/* Tags */}
                {(selectedReview.mood_tags?.length || selectedReview.genre_tags?.length) && (
                  <div className="flex flex-wrap gap-2 pt-2 border-t">
                    {selectedReview.mood_tags?.map((tag, idx) => (
                      <Badge key={`mood-${idx}`} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                    {selectedReview.genre_tags?.map((tag, idx) => (
                      <Badge key={`genre-${idx}`} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
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

