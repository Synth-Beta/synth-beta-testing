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
  ChevronUp,
  ChevronDown,
  User,
  Phone,
  Globe,
  Navigation
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/services/jambaseEventsService';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { LocationService } from '@/services/locationService';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { VenueFollowButton } from '@/components/venues/VenueFollowButton';

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
  
  // Independent sorting state for each section
  const [upcomingSortBy, setUpcomingSortBy] = useState<'date' | 'artist' | 'price'>('date');
  const [pastSortBy, setPastSortBy] = useState<'date' | 'artist' | 'price'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const fetchVenueProfile = async (venueName: string) => {
    try {
      // Fetch venue stats and reviews
      const { data: reviewsData, error: reviewsError } = await (supabase as any)
        .from('user_reviews')
        .select(`
          id,
          user_id,
          event_id,
          rating,
          venue_rating_new,
          review_text,
          venue_review_text,
          created_at,
          mood_tags,
          genre_tags,
          reaction_emoji,
          jambase_events!inner(venue_name, artist_name, event_date, title)
        `)
        .eq('is_public', true)
        .eq('is_draft', false)
        .ilike('jambase_events.venue_name', venueName)
        .or('venue_rating_new.not.is.null,venue_rating.not.is.null');

      if (reviewsError) {
        console.error('Error fetching venue reviews:', reviewsError);
        return;
      }

      // Fetch user profiles for reviewers
      const userIds = reviewsData?.map((r: any) => r.user_id).filter(Boolean) || [];
      const { data: profiles } = await (supabase as any)
        .from('profiles')
        .select('user_id, name, avatar_url')
        .in('user_id', userIds);

      // Transform reviews data
      const transformedReviews = reviewsData?.map((review: any) => {
        const profile = profiles?.find((p: any) => p.user_id === review.user_id);
        const event = review.jambase_events;
        
        return {
          id: review.id,
          rating: review.rating,
          venue_rating_new: review.venue_rating_new,
          review_text: review.review_text,
          venue_review_text: review.venue_review_text,
          created_at: review.created_at,
          reviewer_name: profile?.name || 'Anonymous',
          reviewer_avatar: profile?.avatar_url || null,
          event_title: event?.title || '',
          event_date: event?.event_date || '',
          artist_name: event?.artist_name || '',
          mood_tags: review.mood_tags || [],
          genre_tags: review.genre_tags || [],
          reaction_emoji: review.reaction_emoji || null
        };
      }) || [];

      // Calculate stats
      const validRatings = transformedReviews
        .filter(review => review.venue_rating_new)
        .map(review => review.venue_rating_new);

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
      const { data: venueData } = await (supabase as any)
        .from('venues')
        .select('address, city, state, zip, phone, website, capacity, image_url')
        .eq('name', venueName)
        .single();

      if (venueData) {
        console.log('🏢 Venue data found:', venueData);
        setVenueAddress(venueData.address || '');
        setVenueCity(venueData.city || '');
        setVenueState(venueData.state || '');
        setVenueZip(venueData.zip || '');
        setVenuePhone(venueData.phone || '');
        setVenueWebsite(venueData.website || '');
        setVenueCapacity(venueData.capacity || null);
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

  const fetchVenueEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to fetch events by venue_id first
      let { data: eventsData, error: eventsError } = await supabase
        .from('jambase_events')
        .select('*')
        .eq('venue_id', venueId)
        .order('event_date', { ascending: true });

      // If no events found by venue_id, try by exact venue_name match
      if (!eventsData || eventsData.length === 0) {
        // Use exact match instead of fuzzy match to avoid showing similar venues
        const { data: nameSearchData, error: nameSearchError } = await supabase
          .from('jambase_events')
          .select('*')
          .eq('venue_name', decodedVenueId) // Exact match, not fuzzy
          .order('event_date', { ascending: true });
          
        if (!nameSearchError && nameSearchData && nameSearchData.length > 0) {
          eventsData = nameSearchData;
          eventsError = null;
        }
      }

      if (eventsError) throw eventsError;

      if (eventsData && eventsData.length > 0) {
        setEvents(eventsData);
        const firstEvent = eventsData[0];
        setVenueName(firstEvent.venue_name);
        
        const locationParts = [firstEvent.venue_city, firstEvent.venue_state].filter(Boolean);
        setVenueLocation(locationParts.length > 0 ? locationParts.join(', ') : 'Location TBD');
      } else {
        setEvents([]);
        setVenueName(decodedVenueId || 'Unknown Venue');
      }
    } catch (err) {
      console.error('Error fetching venue events:', err);
      setError('Failed to load venue events');
    } finally {
      setLoading(false);
    }
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
        return sorted.sort((a, b) => (b.venue_rating_new || 0) - (a.venue_rating_new || 0));
      case 'lowest_rating':
        return sorted.sort((a, b) => (a.venue_rating_new || 0) - (b.venue_rating_new || 0));
      default:
        return sorted;
    }
  };

  const filterReviews = (reviewsList: any[], filterBy: 'all' | '5_star' | '4_star' | '3_star' | '2_star' | '1_star') => {
    if (filterBy === 'all') return reviewsList;
    
    const targetRating = parseInt(filterBy.split('_')[0]);
    return reviewsList.filter(review => {
      const rating = review.venue_rating_new || 0;
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

  const isPastEvent = (eventDate: string) => new Date(eventDate) < new Date();
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
  const pastEvents = sortEvents(events.filter(event => isPastEvent(event.event_date)), pastSortBy);

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
      <div className="container mx-auto px-4 py-8">
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
                navigate('/app');
              }
            }}
            className="mb-4 hover-button"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <div className="flex items-center gap-4 flex-1">
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-2">
                  <h1 className="text-3xl font-bold gradient-text">
                    {venueName || 'Unknown Venue'}
                  </h1>
                  {user?.id && venueName && (
                    <VenueFollowButton
                      venueName={venueName}
                      venueCity={venueCity}
                      venueState={venueState}
                      userId={user.id}
                      variant="outline"
                      size="default"
                      showFollowerCount={true}
                    />
                  )}
                </div>
                <p className="text-muted-foreground">
                  {venueLocation}
                </p>
              </div>
              
              {/* Leaflet Map */}
              {venueCoordinates && (
                <div className="w-80 h-40 rounded-lg overflow-hidden shadow-lg">
                  {console.log('🗺️ Rendering map with coordinates:', venueCoordinates)}
                  <MapContainer
                    center={[venueCoordinates.lat, venueCoordinates.lng]}
                    zoom={15}
                    style={{ height: '100%', width: '100%' }}
                    scrollWheelZoom={false}
                    zoomControl={false}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker position={[venueCoordinates.lat, venueCoordinates.lng]}>
                      <Popup>
                        <div className="text-center">
                          <strong>{venueName}</strong>
                          <br />
                          {venueLocation}
                        </div>
                      </Popup>
                    </Marker>
                  </MapContainer>
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="bg-green-100 text-green-800">
                {upcomingEvents.length} Upcoming
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {pastEvents.length} Past
              </Badge>
            </div>
          </div>
        </div>

        {/* Venue Profile Section */}
        <div className="mb-8 space-y-6">
          {/* Venue Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-2">
                  {renderStars(venueStats.averageRating)}
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {venueStats.averageRating.toFixed(1)}
                </div>
                <div className="text-sm text-gray-600">
                  Average Rating
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {venueStats.totalReviews}
                </div>
                <div className="text-sm text-gray-600">
                  Total Reviews
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-pink-600">
                  {upcomingEvents.length + pastEvents.length}
                </div>
                <div className="text-sm text-gray-600">
                  Total Events
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Contact Information */}
          {(venuePhone || venueWebsite) && (
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-3">Contact Information</h3>
                <div className="space-y-3">
                  {venuePhone && (
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-500" />
                      <a href={`tel:${venuePhone}`} className="text-blue-600 hover:underline">
                        {venuePhone}
                      </a>
                    </div>
                  )}
                  {venueWebsite && (
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-gray-500" />
                      <a 
                        href={venueWebsite.startsWith('http') ? venueWebsite : `https://${venueWebsite}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {venueWebsite}
                      </a>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}


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
                              {renderStars(review.venue_rating_new || 0)}
                              <span className="text-sm font-medium ml-1">
                                {(review.venue_rating_new || 0).toFixed(1)}
                              </span>
                            </div>
                          </div>
                          
                          {review.review_text && (
                            <p className="text-sm text-gray-700">{review.review_text}</p>
                          )}
                          
                          {review.venue_review_text && (
                            <div className="text-sm">
                              <span className="font-medium text-gray-600">Venue: </span>
                              <span className="text-gray-700">{review.venue_review_text}</span>
                            </div>
                          )}
                          
                          {(review.mood_tags && review.mood_tags.length > 0) && (
                            <div className="flex flex-wrap gap-1">
                              {review.mood_tags.map((tag: string, index: number) => (
                                <Badge key={index} variant="secondary" className="text-xs">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                          
                          {review.reaction_emoji && (
                            <div className="text-lg">{review.reaction_emoji}</div>
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcomingEvents.map((event) => (
                <Card 
                  key={event.id} 
                  className="glass-card hover-card overflow-hidden floating-shadow cursor-pointer"
                  onClick={() => handleEventClick(event)}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-1 line-clamp-2">
                          {event.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-2">
                          {event.description && event.description.length > 100 
                            ? `${event.description.substring(0, 100)}...` 
                            : event.description}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                        <span>{formatDate(event.event_date)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                        <span>{formatTime(event.event_date)}</span>
                        {event.doors_time && (
                          <span className="text-muted-foreground">
                            (Doors: {formatDoorsTime(event.doors_time)})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                        <span 
                          className="cursor-pointer hover:text-pink-600 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (event.artist_id) handleArtistClick(event.artist_id);
                          }}
                        >
                          {event.artist_name}
                        </span>
                      </div>
                    </div>

                    {event.genres && event.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {event.genres.slice(0, 3).map((genre, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {genre}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      {event.ticket_available && (
                        <Badge variant="outline" className="text-green-600 border-green-600">
                          <Ticket className="w-3 h-3 mr-1" />
                          Tickets Available
                        </Badge>
                      )}
                      {event.price_range && (
                        <span className="text-sm font-medium">
                          {formatPrice(event.price_range)}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Past Events */}
        {pastEvents.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold gradient-text">Past Events</h2>
              <Select value={pastSortBy} onValueChange={(value: 'date' | 'artist' | 'price') => setPastSortBy(value)}>
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pastEvents.map((event) => (
                <Card 
                  key={event.id} 
                  className="glass-card hover-card overflow-hidden floating-shadow cursor-pointer opacity-75"
                  onClick={() => handleEventClick(event)}
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1">
                        <h3 className="font-semibold text-lg mb-1 line-clamp-2">
                          {event.title}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-2">
                          {event.description && event.description.length > 100 
                            ? `${event.description.substring(0, 100)}...` 
                            : event.description}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                        <span>{formatDate(event.event_date)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                        <span>{formatTime(event.event_date)}</span>
                        {event.doors_time && (
                          <span className="text-muted-foreground">
                            (Doors: {formatDoorsTime(event.doors_time)})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                        <span 
                          className="cursor-pointer hover:text-pink-600 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (event.artist_id) handleArtistClick(event.artist_id);
                          }}
                        >
                          {event.artist_name}
                        </span>
                      </div>
                    </div>

                    {event.genres && event.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {event.genres.slice(0, 3).map((genre, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {genre}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-sm">
                        Past Event
                      </Badge>
                      {event.price_range && (
                        <span className="text-sm font-medium text-muted-foreground">
                          {formatPrice(event.price_range)}
                        </span>
                      )}
                    </div>
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
