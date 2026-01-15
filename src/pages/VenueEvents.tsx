import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { 
  ArrowLeft, 
  Calendar, 
  MapPin, 
  Clock, 
  Building2, 
  Ticket,
  ExternalLink,
  Users,
  Filter,
  SortAsc,
  SortDesc,
  Star,
  Music,
  ChevronUp,
  ChevronDown,
  User,
  Navigation
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/types/eventTypes';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { LocationService } from '@/services/locationService';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { VenueFollowButton } from '@/components/venues/VenueFollowButton';
import { UnifiedEventSearchService, type UnifiedEvent } from '@/services/unifiedEventSearchService';

// Fix for default markers in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface VenueEventsPageProps {}

export default function VenueEventsPage({}: VenueEventsPageProps) {
  const { venueId } = useParams<{ venueId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [events, setEvents] = useState<JamBaseEvent[]>([]);
  const [venueName, setVenueName] = useState<string>('');
  const [venueLocation, setVenueLocation] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEvent | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Venue profile data
  const [venueStats, setVenueStats] = useState({
    totalReviews: 0,
    averageRating: 0,
    loading: true
  });
  const [venueReviews, setVenueReviews] = useState<any[]>([]);
  const [venueAddress, setVenueAddress] = useState<string>('');
  const [venueCity, setVenueCity] = useState<string>('');
  const [venueState, setVenueState] = useState<string>('');
  const [venueZip, setVenueZip] = useState<string>('');
  const [venuePhone, setVenuePhone] = useState<string>('');
  const [venueWebsite, setVenueWebsite] = useState<string>('');
  const [venueCapacity, setVenueCapacity] = useState<number | null>(null);
  const [venueImage, setVenueImage] = useState<string>('');
  const [showReviews, setShowReviews] = useState(false);
  const [reviewSortBy, setReviewSortBy] = useState<'newest' | 'oldest' | 'highest_rating' | 'lowest_rating'>('newest');
  const [reviewFilterBy, setReviewFilterBy] = useState<'all' | '5_star' | '4_star' | '3_star' | '2_star' | '1_star'>('all');
  const [venueCoordinates, setVenueCoordinates] = useState<{lat: number, lng: number} | null>(null);
  
  // Sorting state
  const [upcomingSortBy, setUpcomingSortBy] = useState<'date' | 'artist' | 'price'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const computeCategoryAverage = (review: any) => {
    // In 3NF schema, only the main rating column exists
    // Return the rating directly
    return typeof review.rating === 'number' ? review.rating : 0;
  };

  const fetchVenueProfile = async (venueName: string) => {
    try {
      // Fetch venue stats and reviews
      // Fetch reviews first, then fetch events separately (can't join directly in 3NF schema)
      // Only select columns that actually exist in the reviews table
      const { data: reviewsData, error: reviewsError } = await (supabase as any)
        .from('reviews')
        .select(`
          id,
          user_id,
          event_id,
          rating,
          venue_rating,
          artist_performance_rating,
          production_rating,
          location_rating,
          value_rating,
          artist_performance_feedback,
          production_feedback,
          venue_feedback,
          location_feedback,
          value_feedback,
          ticket_price_paid,
          review_text,
          created_at,
          mood_tags,
          genre_tags,
          photos,
          was_there,
          is_public,
          is_draft
        `)
        .eq('is_public', true)
        .eq('is_draft', false)
        .not('review_text', 'is', null)
        .neq('review_text', 'ATTENDANCE_ONLY');

      if (reviewsError) {
        console.error('Error fetching venue reviews:', reviewsError);
        return;
      }

      // Fetch events separately for venue filtering
      const eventIds = reviewsData?.map((r: any) => r.event_id).filter(Boolean) || [];
      const eventMap = new Map();
      if (eventIds.length > 0) {
        const { data: eventsData } = await (supabase as any)
          .from('events')
          .select('id, venue_uuid, artist_name, event_date, title, venue_city, venue_state')
          .in('id', eventIds);
        
        if (eventsData) {
          // Get venue names for events that have venue_uuid
          const venueUuids = eventsData
            .map((e: any) => e.venue_uuid)
            .filter(Boolean);
          
          let venueMap = new Map<string, string>();
          if (venueUuids.length > 0) {
            const { data: venues } = await supabase
              .from('venues')
              .select('id, name')
              .in('id', venueUuids);
            
            venues?.forEach((v: any) => {
              venueMap.set(v.id, v.name);
            });
          }
          
          eventsData.forEach((event: any) => {
            // Add venue_name from venues table lookup
            const venueName = event.venue_uuid ? venueMap.get(event.venue_uuid) : null;
            eventMap.set(event.id, {
              ...event,
              venue_name: venueName
            });
          });
        }
      }

      // Filter reviews to only those for this venue
      const venueReviews = (reviewsData || []).filter((review: any) => {
        const event = eventMap.get(review.event_id);
        return event && event.venue_name?.toLowerCase().includes(venueName.toLowerCase());
      });

      // Fetch user profiles for reviewers
      const userIds = venueReviews?.map((r: any) => r.user_id).filter(Boolean) || [];
      const { data: profiles } = await (supabase as any)
        .from('users')
        .select('user_id, name, avatar_url')
        .in('user_id', userIds);

      // Transform reviews data - only use columns that actually exist
      const transformedReviews = venueReviews?.map((review: any) => {
        const profile = profiles?.find((p: any) => p.user_id === review.user_id);
        const event = eventMap.get(review.event_id);
        
        return {
          id: review.id,
          rating: review.rating,
          venue_rating: review.venue_rating,
          artist_performance_rating: review.artist_performance_rating,
          production_rating: review.production_rating,
          location_rating: review.location_rating,
          value_rating: review.value_rating,
          artist_performance_feedback: review.artist_performance_feedback,
          production_feedback: review.production_feedback,
          venue_feedback: review.venue_feedback,
          location_feedback: review.location_feedback,
          value_feedback: review.value_feedback,
          ticket_price_paid: review.ticket_price_paid,
          review_text: review.review_text,
          created_at: review.created_at,
          reviewer_name: profile?.name || 'Anonymous',
          reviewer_avatar: profile?.avatar_url || null,
          event_title: event?.title || '',
          event_date: event?.event_date || '',
          artist_name: event?.artist_name || '',
          mood_tags: review.mood_tags || [],
          genre_tags: review.genre_tags || [],
          photos: Array.isArray(review.photos) ? review.photos : [],
          category_average: review.rating // Use main rating as category average since detailed ratings don't exist
        };
      }) || [];

      // Calculate stats using the main rating column
      const validRatings = transformedReviews
        .map(review => review.rating ?? null)
        .filter((value): value is number => typeof value === 'number' && value > 0);

      const totalReviews = validRatings.length;
      const averageRating = totalReviews > 0 
        ? validRatings.reduce((sum, rating) => sum + rating, 0) / totalReviews 
        : 0;

      setVenueStats({
        totalReviews,
        averageRating,
        loading: false
      });

      setVenueReviews(transformedReviews);

      // Try to fetch venue details from database
      // Note: Venue data is optional - if query fails, page will still work
      // This query may fail due to schema differences or RLS policies
      let venueData: any = null;
      
      // Only attempt query if we have a venue name
      if (venueName) {
        try {
          // Query with minimal columns to avoid schema mismatch errors
          const { data, error } = await (supabase as any)
            .from('venues')
            .select('id, name, url, image_url')
            .ilike('name', `%${venueName}%`)
            .limit(1)
            .maybeSingle();
          
          if (!error && data) {
            venueData = data;
          } else if (error) {
            // Silently fail - venue details are optional
            console.debug('Venue query failed (non-critical):', error.message || error);
          }
        } catch (error: any) {
          // Silently fail - venue details are optional for page functionality
          console.debug('Venue query exception (non-critical):', error?.message || error);
        }
      }

      if (venueData) {
        console.log('🏢 Venue data found:', venueData);
        setVenueAddress(venueData.address || '');
        setVenueCity(venueData.city || '');
        setVenueState(venueData.state || '');
        setVenueZip(venueData.zip || '');
        // Note: phone and capacity columns don't exist in venues table
        setVenuePhone(''); // Column doesn't exist in venues table
        setVenueWebsite(venueData.url || ''); // Use 'url' column instead of 'website'
        setVenueCapacity(null); // Column doesn't exist in venues table
        setVenueImage(venueData.image_url || '');
      } else {
        console.log('🏢 No venue data found in database for:', venueName);
        // Fallback: Set sample address for The Masquerade
        if (venueName.toLowerCase().includes('masquerade')) {
          setVenueAddress('695 North Ave NE');
          setVenueCity('Atlanta');
          setVenueState('GA');
          setVenueZip('30308');
        }
      }

      // Get venue coordinates - try multiple sources
      let searchAddress = '';
      
      if (venueData?.address && venueData?.city && venueData?.state) {
        // Use detailed venue data if available
        searchAddress = `${venueData.address}, ${venueData.city}, ${venueData.state}${venueData.zip ? ` ${venueData.zip}` : ''}`;
      } else if (events.length > 0) {
        // Fallback to venue location from events
        const firstEvent = events[0];
        if (firstEvent.venue_city && firstEvent.venue_state) {
          searchAddress = `${venueName}, ${firstEvent.venue_city}, ${firstEvent.venue_state}`;
        }
      }
      
      if (searchAddress) {
        try {
          // For now, use a simple coordinate lookup for Atlanta
          if (searchAddress.toLowerCase().includes('atlanta')) {
            console.log('🎯 Setting Atlanta coordinates for venue:', venueName);
            setVenueCoordinates({ lat: 33.7490, lng: -84.3880 });
          } else {
            // Try to get coordinates from city name
            const cityName = searchAddress.split(',')[1]?.trim().toLowerCase();
            if (cityName) {
              const city = LocationService.searchCity(cityName);
              if (city) {
                setVenueCoordinates({ lat: city.lat, lng: city.lng });
              }
            }
          }
        } catch (error) {
          console.error('Error getting venue coordinates:', error);
        }
      }
    } catch (error) {
      console.error('Error fetching venue profile:', error);
      setVenueStats(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    if (!venueId) {
      setError('No venue ID provided');
      setLoading(false);
      return;
    }

    fetchVenueEvents();
  }, [venueId]);

  // Fetch venue profile when venue name is available
  useEffect(() => {
    if (venueName) {
      fetchVenueProfile(venueName);
    }
  }, [venueName]);

  // Get coordinates when events are loaded (fallback)
  useEffect(() => {
    const getCoordinatesFromEvents = async () => {
      if (!venueCoordinates && events.length > 0 && venueName) {
        const firstEvent = events[0];
        if (firstEvent.venue_city && firstEvent.venue_state) {
          const searchAddress = `${venueName}, ${firstEvent.venue_city}, ${firstEvent.venue_state}`;
          try {
            // For now, use a simple coordinate lookup for Atlanta
            if (searchAddress.toLowerCase().includes('atlanta')) {
              console.log('🎯 Setting Atlanta coordinates from events for venue:', venueName);
              setVenueCoordinates({ lat: 33.7490, lng: -84.3880 });
            } else {
              // Try to get coordinates from city name
              const cityName = firstEvent.venue_city.toLowerCase();
              const city = LocationService.searchCity(cityName);
              if (city) {
                setVenueCoordinates({ lat: city.lat, lng: city.lng });
              }
            }
          } catch (error) {
            console.error('Error getting coordinates from events:', error);
          }
        }
      }
    };

    getCoordinatesFromEvents();
  }, [events, venueName, venueCoordinates]);

  // Decode the venue ID (which might be a URL-encoded name)
  const decodedVenueId = venueId ? decodeURIComponent(venueId) : '';

  // Helper to check if a string is a valid UUID
  const isValidUUID = (str: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  const fetchVenueEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      let eventsData: any[] | null = null;
      let eventsError: any = null;
      let venueNameToSearch = decodedVenueId;
      let venueLocation = 'Location TBD';
      let venueUuid: string | null = null;

      // Step 1: Determine the venue UUID
      if (venueId && isValidUUID(venueId)) {
        // It's a UUID, use it directly
        venueUuid = venueId;
        
        // Get venue details (venues table doesn't have city column)
        const { data: venueData } = await supabase
          .from('venues')
          .select('id, name, state, street_address')
          .eq('id', venueUuid)
          .maybeSingle();
        
        if (venueData) {
          venueNameToSearch = venueData.name;
          const locationParts = [venueData.street_address, venueData.state].filter(Boolean);
          venueLocation = locationParts.length > 0 ? locationParts.join(', ') : 'Location TBD';
        }
      } else {
        // It's a name, find the venue UUID by name
        // Try multiple matching strategies
        let venueData = null;
        
        // Strategy 1: Try exact match (case-insensitive) - venues table doesn't have city column
        const { data: exactMatches } = await supabase
          .from('venues')
          .select('id, name, state, street_address')
          .ilike('name', `%${decodedVenueId}%`)
          .limit(5);
        
        if (exactMatches && exactMatches.length > 0) {
          // Find the best match (exact or closest)
          const exactMatch = exactMatches.find(v => 
            v.name.toLowerCase() === decodedVenueId.toLowerCase()
          );
          venueData = exactMatch || exactMatches[0];
        }
        
        if (venueData) {
          venueUuid = venueData.id;
          venueNameToSearch = venueData.name;
          const locationParts = [venueData.street_address, venueData.state].filter(Boolean);
          venueLocation = locationParts.length > 0 ? locationParts.join(', ') : 'Location TBD';
        }
      }

      // Step 2: Query events by venue_id (if we have a UUID)
      if (venueUuid) {
        const result = await supabase
          .from('events')
          .select('*')
          .eq('venue_id', venueUuid)
          .order('event_date', { ascending: true });
        eventsData = result.data;
        eventsError = result.error;
      } else {
        // No venue found - return empty results
        // Don't try to query by venue_id with a name string (venue_id is UUID type)
        eventsData = [];
        eventsError = null;
        console.warn(`Venue not found: ${decodedVenueId}`);
      }

      if (eventsError) throw eventsError;

      // Set venue location
      setVenueLocation(venueLocation);

      // Use database events only (API calls removed)
      const dbEvents: JamBaseEvent[] = (eventsData || []).map(event => ({
        ...event,
        source: 'manual'
      }));

      const allEvents = [...dbEvents];

      // Deduplicate events by artist_name + venue_name + event_date (normalized)
      const deduplicatedEvents = deduplicateEvents(allEvents);

      // Sort by date
      deduplicatedEvents.sort((a, b) => 
        new Date(a.event_date).getTime() - new Date(b.event_date).getTime()
      );

      setEvents(deduplicatedEvents);
      setVenueName(venueNameToSearch || decodedVenueId || 'Unknown Venue');
      
      // Set location from first event if available
      if (deduplicatedEvents.length > 0) {
        const firstEvent = deduplicatedEvents[0];
        const locationParts = [firstEvent.venue_city, firstEvent.venue_state].filter(Boolean);
        setVenueLocation(locationParts.length > 0 ? locationParts.join(', ') : 'Location TBD');
      }
    } catch (err) {
      console.error('Error fetching venue events:', err);
      setError('Failed to load venue events');
    } finally {
      setLoading(false);
    }
  };

  // Helper function to deduplicate events
  const deduplicateEvents = (events: JamBaseEvent[]): JamBaseEvent[] => {
    const seen = new Map<string, JamBaseEvent>();
    
    return events.filter(event => {
      // Normalize artist and venue names for better matching
      const normalizeArtist = (event.artist_name || '').toLowerCase().trim();
      // Use venue_uuid for matching if venue_name doesn't exist, or get venue name from venues table
      // For now, use a combination of venue_city and venue_state if venue_name unavailable
      const venueIdentifier = (event as any).venue_name || 
        `${(event as any).venue_city || ''} ${(event as any).venue_state || ''}`.trim() ||
        (event as any).venue_uuid || '';
      const normalizeVenue = venueIdentifier.toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/\bthe\s+/gi, '')
        .replace(/[^\w\s]/g, '')
        .trim();
      
      // Create unique key from artist + venue + date (date only, ignore time)
      const dateKey = event.event_date?.split('T')[0] || '';
      const key = `${normalizeArtist}|${normalizeVenue}|${dateKey}`;
      
      if (seen.has(key)) {
        // Removed Ticketmaster preference logic
        const existing = seen.get(key)!;
        if (false) { // Removed API preference
          seen.set(key, event);
          return true;
        }
        // If both are Ticketmaster or both database, prefer the first one
        return false;
      }
      
      seen.set(key, event);
      return true;
    });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDoorsTime = (doorsTime: string | null) => {
    if (!doorsTime) return null;
    const date = new Date(doorsTime);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatPrice = (priceRange: string | null) => {
    if (!priceRange) return null;
    
    // Extract numeric value from price range string
    const numericValue = parseFloat(priceRange.replace(/[^0-9.]/g, ''));
    
    if (isNaN(numericValue)) return priceRange; // Return original if not a valid number
    
    // Format as currency
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(numericValue);
  };

  const renderStars = (rating: number) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
      );
    }
    
    if (hasHalfStar) {
      stars.push(
        <Star key="half" className="w-4 h-4 fill-yellow-400/50 text-yellow-400" />
      );
    }
    
    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
      stars.push(
        <Star key={`empty-${i}`} className="w-4 h-4 text-gray-300" />
      );
    }
    
    return stars;
  };

  const sortReviews = (reviewsList: any[], sortBy: 'newest' | 'oldest' | 'highest_rating' | 'lowest_rating') => {
    const sorted = [...reviewsList];
    switch (sortBy) {
      case 'newest':
        return sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      case 'oldest':
        return sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case 'highest_rating':
        return sorted.sort((a, b) => ((b.venue_rating ?? b.rating ?? 0) - (a.venue_rating ?? a.rating ?? 0)));
      case 'lowest_rating':
        return sorted.sort((a, b) => ((a.venue_rating ?? a.rating ?? 0) - (b.venue_rating ?? b.rating ?? 0)));
      default:
        return sorted;
    }
  };

  const filterReviews = (reviewsList: any[], filterBy: 'all' | '5_star' | '4_star' | '3_star' | '2_star' | '1_star') => {
    if (filterBy === 'all') return reviewsList;
    
    const targetRating = parseInt(filterBy.split('_')[0], 10);
    return reviewsList.filter(review => {
      const rating = review.venue_rating ?? review.rating ?? 0;
      return Math.floor(rating) === targetRating;
    });
  };

  const formatReviewDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getFullAddress = () => {
    const parts = [venueAddress, venueCity, venueState, venueZip].filter(Boolean);
    return parts.join(', ');
  };

  const isUpcomingEvent = (eventDate: string) => new Date(eventDate) >= new Date();

  const getLocationString = (event: JamBaseEvent) => {
    const parts = [event.venue_city, event.venue_state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Location TBD';
  };

  const handleEventClick = (event: JamBaseEvent) => {
    setSelectedEvent(event);
    setModalOpen(true);
  };

  const handleArtistClick = (artistId: string) => {
    navigate(`/artist/${artistId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading venue events...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-red-500 mb-4">{error}</p>
              <Button onClick={() => navigate(-1)}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sort events with independent sorting for each section
  const sortEvents = (eventsList: JamBaseEvent[], sortBy: 'date' | 'artist' | 'price') => {
    return [...eventsList].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
          break;
        case 'artist':
          comparison = (a.artist_name || '').localeCompare(b.artist_name || '');
          break;
        case 'price':
          const priceA = parseFloat(a.price_range?.replace(/[^0-9.]/g, '') || '0');
          const priceB = parseFloat(b.price_range?.replace(/[^0-9.]/g, '') || '0');
          comparison = priceA - priceB;
          break;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
  };

  const upcomingEvents = sortEvents(events.filter(event => isUpcomingEvent(event.event_date)), upcomingSortBy);

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50 overflow-x-hidden w-full max-w-full">
      <div className="container mx-auto px-4 py-8 w-full max-w-full overflow-x-hidden">
        {/* Header */}
        <div className="mb-8">
          <Button 
            variant="ghost" 
            onClick={() => {
              // Check if we have state indicating where we came from
              const fromFeed = location.state?.fromFeed;
              const eventId = location.state?.eventId;
              
              if (eventId) {
                // Store the event ID in localStorage so UnifiedFeed can re-open it
                localStorage.setItem('reopenEventId', eventId);
              }
              
              if (fromFeed) {
                navigate(fromFeed);
              } else {
                // Fallback to main feed
                navigate('/');
              }
            }}
            className="mb-4 hover-button"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="p-2 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full flex-shrink-0">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold gradient-text break-words truncate">
                    {venueName || 'Unknown Venue'}
                  </h1>
            </div>
                  {user?.id && venueName && (
                    <VenueFollowButton
                      venueName={venueName}
                      venueCity={venueCity}
                      venueState={venueState}
                      userId={user.id}
                      variant="outline"
                size="sm"
                showFollowerCount={false}
                className="flex-shrink-0"
                    />
                  )}
              </div>
              
          {venueLocation && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-muted-foreground">All events at this venue</span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">{venueLocation}</span>
                </div>
              )}

          <div className="flex items-center gap-2 text-sm">
              <Badge variant="default" className="bg-green-100 text-green-800">
                {upcomingEvents.length} Upcoming
              </Badge>
          </div>
        </div>

        {/* Venue Profile Section */}
        <div className="mb-8 space-y-6">
          {/* Venue Stats Cards */}
          <div className="grid grid-cols-3 gap-2">
            <Card>
              <CardContent className="p-3 text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  {renderStars(venueStats.averageRating)}
                </div>
                <div className="text-xl font-bold text-gray-900">
                  {venueStats.averageRating.toFixed(1)}
                </div>
                <div className="text-xs text-gray-600">
                  Average Rating
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-xl font-bold text-gray-900">
                  {venueStats.totalReviews}
                </div>
                <div className="text-xs text-gray-600">
                  Total Reviews
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-3 text-center">
                <div className="text-xl font-bold text-pink-600">
                  {upcomingEvents.length}
                </div>
                <div className="text-xs text-gray-600">
                  Total Events
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Reviews Section */}
          {venueStats.totalReviews > 0 && (
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Star className="w-5 h-5 text-yellow-500" />
                    <h3 className="text-lg font-semibold">Reviews</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowReviews(!showReviews)}
                    className="flex items-center gap-1"
                  >
                    {showReviews ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {showReviews ? 'Hide' : 'View'} Reviews
                  </Button>
                </div>
                
                <div className="flex items-center gap-2 mb-4">
                  {renderStars(venueStats.averageRating)}
                  <span className="text-sm font-medium">
                    {venueStats.averageRating.toFixed(1)}
                  </span>
                  <span className="text-sm text-gray-600">
                    ({venueStats.totalReviews} review{venueStats.totalReviews !== 1 ? 's' : ''})
                  </span>
                </div>
                
                {showReviews && (
                  <div className="space-y-4">
                    {/* Filters */}
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Filter className="w-4 h-4 text-gray-500" />
                        <span className="text-sm font-medium">Filter by rating:</span>
                        <Select value={reviewFilterBy} onValueChange={(value: 'all' | '5_star' | '4_star' | '3_star' | '2_star' | '1_star') => setReviewFilterBy(value)}>
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Ratings</SelectItem>
                            <SelectItem value="5_star">5 Stars</SelectItem>
                            <SelectItem value="4_star">4 Stars</SelectItem>
                            <SelectItem value="3_star">3 Stars</SelectItem>
                            <SelectItem value="2_star">2 Stars</SelectItem>
                            <SelectItem value="1_star">1 Star</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Sort by:</span>
                        <Select value={reviewSortBy} onValueChange={(value: 'newest' | 'oldest' | 'highest_rating' | 'lowest_rating') => setReviewSortBy(value)}>
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="newest">Newest</SelectItem>
                            <SelectItem value="oldest">Oldest</SelectItem>
                            <SelectItem value="highest_rating">Highest Rating</SelectItem>
                            <SelectItem value="lowest_rating">Lowest Rating</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {sortReviews(filterReviews(venueReviews, reviewFilterBy), reviewSortBy).map(review => (
                        <div key={review.id} className="border rounded-lg p-4 space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-3">
                              <Avatar className="w-8 h-8">
                                <AvatarImage src={review.reviewer_avatar || undefined} />
                                <AvatarFallback className="text-xs">
                                  {review.reviewer_name.charAt(0).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium text-sm">{review.reviewer_name}</div>
                                <div className="text-xs text-gray-500 flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatReviewDate(review.event_date)}
                                </div>
                                {review.artist_name && (
                                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                    <Music className="w-3 h-3" />
                                    {review.artist_name}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center space-x-1">
                              {renderStars(review.category_average ?? computeCategoryAverage(review))}
                              <span className="text-sm font-medium ml-1">
                                {(review.category_average ?? computeCategoryAverage(review)).toFixed(1)}
                              </span>
                            </div>
                          </div>
                          
                          {review.review_text && (
                            <p className="text-sm text-gray-700">{review.review_text}</p>
                          )}
                          
                          {typeof review.ticket_price_paid === 'number' && review.ticket_price_paid > 0 && (
                            <div className="text-xs text-gray-600 bg-gray-100 inline-flex px-2 py-1 rounded">
                              Ticket price (private): ${review.ticket_price_paid.toFixed(2)}
                            </div>
                          )}

                          {[
                            {
                              label: 'Artist performance',
                              rating: review.artist_performance_rating,
                              feedback: review.artist_performance_feedback,
                            },
                            {
                              label: 'Production',
                              rating: review.production_rating,
                              feedback: review.production_feedback,
                              recommendation: review.production_recommendation
                            },
                            {
                              label: 'Venue',
                              rating: review.venue_rating,
                              feedback: review.venue_feedback,
                              recommendation: review.venue_recommendation
                            },
                            {
                              label: 'Location',
                              rating: review.location_rating,
                              feedback: review.location_feedback,
                              recommendation: review.location_recommendation
                            },
                            {
                              label: 'Value',
                              rating: review.value_rating,
                              feedback: review.value_feedback,
                              recommendation: review.value_recommendation
                            }
                          ]
                            .filter(({ rating, feedback }) => rating || feedback)
                            .map(({ label, rating, feedback }) => (
                              <div key={label} className="text-sm border-l-4 border-blue-200 pl-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-600">{label}</span>
                                  {typeof rating === 'number' && (
                                    <span className="text-xs text-gray-500">{rating.toFixed(1)}</span>
                                  )}
                                </div>
                                {feedback && (
                                  <div className="text-xs text-gray-700 italic">“{feedback}”</div>
                                )}
                              </div>
                            ))}
                          
                          {(review.mood_tags && review.mood_tags.length > 0) && (
                            <div className="flex flex-wrap gap-1">
                              {review.mood_tags.map((tag: string, index: number) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                          
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Upcoming Events */}
        {upcomingEvents.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold gradient-text">Upcoming Events</h2>
              <Select value={upcomingSortBy} onValueChange={(value: 'date' | 'artist' | 'price') => setUpcomingSortBy(value)}>
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="artist">Artist</SelectItem>
                  <SelectItem value="price">Price</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-2 w-full max-w-full overflow-x-hidden">
              {upcomingEvents.map((event) => (
                <Card 
                  key={event.id} 
                  className="overflow-hidden cursor-pointer w-full max-w-full min-w-0 hover:shadow-md transition-shadow"
                  onClick={() => handleEventClick(event)}
                >
                  <div className="p-2 w-full max-w-full overflow-x-hidden">
                    <h3 className="font-semibold text-xs mb-1 line-clamp-2 break-words min-h-[32px]">
                          {event.title}
                        </h3>
                    <div className="space-y-1 mb-2">
                      <div className="flex items-center gap-1 text-xs">
                        <Calendar className="w-3 h-3 text-pink-500 flex-shrink-0" />
                        <span className="truncate">{formatDate(event.event_date)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <Clock className="w-3 h-3 text-pink-500 flex-shrink-0" />
                        <span className="truncate">{formatTime(event.event_date)}</span>
                    </div>
                      <div className="flex items-center gap-1 text-xs">
                        <MapPin className="w-3 h-3 text-pink-500 flex-shrink-0" />
                        <span className="truncate text-muted-foreground">
                          {getLocationString(event)}
                          </span>
                      </div>
                      </div>
                    {event.genres && event.genres.length > 0 && (
                      <div className="flex flex-wrap gap-0.5">
                        {event.genres.slice(0, 2).map((genre, index) => (
                          <Badge key={index} variant="secondary" className="text-[10px] px-1 py-0 h-4">
                            {genre}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}



        {/* No Events Message */}
        {events.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Events Found</h3>
            <p className="text-muted-foreground mb-4">
              No events found for {venueName || 'this venue'}.
            </p>
            <Button onClick={() => navigate(-1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go Back
            </Button>
          </div>
        )}
      </div>

      {/* Event Details Modal */}
      <EventDetailsModal
        event={selectedEvent}
        currentUserId={user?.id || ''}
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedEvent(null);
        }}
      />
    </div>
  );
}
