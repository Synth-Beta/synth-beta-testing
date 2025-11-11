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
  Music, 
  Ticket,
  ExternalLink,
  Users,
  Filter,
  SortAsc,
  SortDesc,
  ChevronDown,
  Star,
  ChevronUp,
  User
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/services/jambaseEventsService';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { useAuth } from '@/hooks/useAuth';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ArtistFollowButton } from '@/components/artists/ArtistFollowButton';

interface ArtistEventsPageProps {}

export default function ArtistEventsPage({}: ArtistEventsPageProps) {
  const { artistId } = useParams<{ artistId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [events, setEvents] = useState<JamBaseEvent[]>([]);
  const [artistName, setArtistName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEvent | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  
  // Artist profile data
  const [artistStats, setArtistStats] = useState({
    totalReviews: 0,
    averageRating: 0,
    loading: true
  });
  const [artistReviews, setArtistReviews] = useState<any[]>([]);
  const [artistDescription, setArtistDescription] = useState<string>('');
  const [artistImage, setArtistImage] = useState<string>('');
  const [showReviews, setShowReviews] = useState(false);
  const [reviewSortBy, setReviewSortBy] = useState<'newest' | 'oldest' | 'highest_rating' | 'lowest_rating'>('newest');
  const [reviewFilterBy, setReviewFilterBy] = useState<'all' | '5_star' | '4_star' | '3_star' | '2_star' | '1_star'>('all');
  
  // Independent sorting state for each section
  const [upcomingSortBy, setUpcomingSortBy] = useState<'date' | 'location' | 'price'>('date');
  const [pastSortBy, setPastSortBy] = useState<'date' | 'location' | 'price'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const computeCategoryAverage = (review: {
    rating?: number;
    artist_performance_rating?: number;
    production_rating?: number;
    venue_rating?: number;
    location_rating?: number;
    value_rating?: number;
  }) => {
    const values = [
      review.artist_performance_rating,
      review.production_rating,
      review.venue_rating,
      review.location_rating,
      review.value_rating
    ].filter((value): value is number => typeof value === 'number' && value > 0);

    if (values.length > 0) {
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    return typeof review.rating === 'number' ? review.rating : 0;
  };

  const fetchArtistProfile = async (artistName: string) => {
    try {
      // Fetch artist stats and reviews
      const { data: reviewsData, error: reviewsError } = await (supabase as any)
        .from('user_reviews')
        .select(`
          id,
          user_id,
          event_id,
          rating,
          artist_performance_rating,
          production_rating,
          venue_rating,
          location_rating,
          value_rating,
          artist_performance_feedback,
          production_feedback,
          venue_feedback,
          location_feedback,
          value_feedback,
          artist_performance_recommendation,
          production_recommendation,
          venue_recommendation,
          location_recommendation,
          value_recommendation,
          ticket_price_paid,
          review_text,
          created_at,
          mood_tags,
          genre_tags,
          reaction_emoji,
          jambase_events!inner(artist_name, venue_name, event_date, title)
        `)
        .eq('is_public', true)
        .eq('is_draft', false)
        .ilike('jambase_events.artist_name', artistName);

      if (reviewsError) {
        console.error('Error fetching artist reviews:', reviewsError);
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
          artist_performance_rating: review.artist_performance_rating ?? undefined,
          production_rating: review.production_rating ?? undefined,
          venue_rating: review.venue_rating ?? undefined,
          location_rating: review.location_rating ?? undefined,
          value_rating: review.value_rating ?? undefined,
          artist_performance_feedback: review.artist_performance_feedback ?? undefined,
          production_feedback: review.production_feedback ?? undefined,
          venue_feedback: review.venue_feedback ?? undefined,
          location_feedback: review.location_feedback ?? undefined,
          value_feedback: review.value_feedback ?? undefined,
          artist_performance_recommendation: review.artist_performance_recommendation ?? undefined,
          production_recommendation: review.production_recommendation ?? undefined,
          venue_recommendation: review.venue_recommendation ?? undefined,
          location_recommendation: review.location_recommendation ?? undefined,
          value_recommendation: review.value_recommendation ?? undefined,
          ticket_price_paid: review.ticket_price_paid ?? undefined,
          review_text: review.review_text,
          created_at: review.created_at,
          reviewer_name: profile?.name || 'Anonymous',
          reviewer_avatar: profile?.avatar_url || null,
          event_title: event?.title || '',
          event_date: event?.event_date || '',
          venue_name: event?.venue_name || '',
          mood_tags: review.mood_tags || [],
          genre_tags: review.genre_tags || [],
          reaction_emoji: review.reaction_emoji || null,
          category_average: computeCategoryAverage(review)
        };
      }) || [];

      // Calculate stats
      const validRatings = transformedReviews
        .map(review => review.category_average ?? computeCategoryAverage(review))
        .filter(value => typeof value === 'number' && value > 0);

      const totalReviews = validRatings.length;
      const averageRating = totalReviews > 0 
        ? validRatings.reduce((sum, rating) => sum + rating, 0) / totalReviews 
        : 0;

      setArtistStats({
        totalReviews,
        averageRating,
        loading: false
      });

      setArtistReviews(transformedReviews);

      // Try to fetch artist data from database (without description column)
      const { data: artistData } = await (supabase as any)
        .from('artists')
        .select('id, name, jambase_artist_id, image_url')
        .eq('name', artistName)
        .single();

      if (artistData) {
        setArtistDescription(''); // No description column available
        setArtistImage(artistData.image_url || '');
      }
    } catch (error) {
      console.error('Error fetching artist profile:', error);
      setArtistStats(prev => ({ ...prev, loading: false }));
    }
  };

  useEffect(() => {
    if (!artistId) {
      setError('No artist ID provided');
      setLoading(false);
      return;
    }

    fetchArtistEvents();
  }, [artistId]);

  // Fetch artist profile when artist name is available
  useEffect(() => {
    if (artistName) {
      fetchArtistProfile(artistName);
    }
  }, [artistName]);

  // Decode the artist ID (which might be a URL-encoded name)
  const decodedArtistId = artistId ? decodeURIComponent(artistId) : '';

  const fetchArtistEvents = async () => {
    try {
      setLoading(true);
      setError(null);

      // First try to get the artist name from the URL parameter
      // If artistId is actually a name (not an ID), use it directly
      let artistNameToSearch = decodedArtistId;
      
      // Try to fetch events by artist_id first
      let { data: eventsData, error: eventsError } = await supabase
        .from('jambase_events')
        .select('*')
        .eq('artist_id', artistId)
        .order('event_date', { ascending: true });

      // If no events found by artist_id, try by exact artist_name match
      if (!eventsData || eventsData.length === 0) {
        // Use exact match instead of fuzzy match to avoid showing similar artists
        const { data: nameSearchData, error: nameSearchError } = await supabase
          .from('jambase_events')
          .select('*')
          .eq('artist_name', decodedArtistId) // Exact match, not fuzzy
          .order('event_date', { ascending: true });
          
        if (!nameSearchError && nameSearchData && nameSearchData.length > 0) {
          eventsData = nameSearchData;
          eventsError = null;
          artistNameToSearch = nameSearchData[0].artist_name;
        }
      }

      if (eventsError) throw eventsError;

      if (eventsData && eventsData.length > 0) {
        setEvents(eventsData);
        setArtistName(eventsData[0].artist_name);
      } else {
        setEvents([]);
        setArtistName(artistNameToSearch || 'Unknown Artist');
      }
    } catch (err) {
      console.error('Error fetching artist events:', err);
      setError('Failed to load artist events');
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
        return sorted.sort((a, b) => {
          const aRating = a.category_average ?? computeCategoryAverage(a);
          const bRating = b.category_average ?? computeCategoryAverage(b);
          return (bRating || 0) - (aRating || 0);
        });
      case 'lowest_rating':
        return sorted.sort((a, b) => {
          const aRating = a.category_average ?? computeCategoryAverage(a);
          const bRating = b.category_average ?? computeCategoryAverage(b);
          return (aRating || 0) - (bRating || 0);
        });
      default:
        return sorted;
    }
  };

  const filterReviews = (reviewsList: any[], filterBy: 'all' | '5_star' | '4_star' | '3_star' | '2_star' | '1_star') => {
    if (filterBy === 'all') return reviewsList;
    
    const targetRating = parseInt(filterBy.split('_')[0]);
    return reviewsList.filter(review => {
      const avgRating = review.category_average ?? computeCategoryAverage(review);
      return Math.floor(avgRating) === targetRating;
    });
  };

  const formatReviewDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const isPastEvent = (eventDate: string) => new Date(eventDate) < new Date();
  const isUpcomingEvent = (eventDate: string) => new Date(eventDate) >= new Date();

  const getLocationString = (event: JamBaseEvent) => {
    const parts = [event.venue_city, event.venue_state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Location TBD';
  };

  const getVenueAddress = (event: JamBaseEvent) => {
    if (event.venue_address) {
      return event.venue_address;
    }
    return getLocationString(event);
  };

  const handleEventClick = (event: JamBaseEvent) => {
    setSelectedEvent(event);
    setModalOpen(true);
  };

  const handleVenueClick = (venueId: string) => {
    navigate(`/venue/${venueId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-purple-50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading artist events...</p>
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
  const sortEvents = (eventsList: JamBaseEvent[], sortBy: 'date' | 'location' | 'price') => {
    return [...eventsList].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
          break;
        case 'location':
          const locationA = `${a.venue_city || ''}, ${a.venue_state || ''}`.trim();
          const locationB = `${b.venue_city || ''}, ${b.venue_state || ''}`.trim();
          comparison = locationA.localeCompare(locationB);
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
              
              console.log('🔙 ArtistEvents: Back button clicked');
              console.log('🔙 ArtistEvents: fromFeed:', fromFeed);
              console.log('🔙 ArtistEvents: eventId:', eventId);
              
              if (eventId) {
                // Store the event ID in localStorage so UnifiedFeed can re-open it
                localStorage.setItem('reopenEventId', eventId);
                console.log('🔙 ArtistEvents: Stored eventId in localStorage:', eventId);
              }
              
              if (fromFeed) {
                console.log('🔙 ArtistEvents: Navigating to', fromFeed);
                navigate(fromFeed);
              } else {
                console.log('🔙 ArtistEvents: No fromFeed, navigating to /');
                navigate('/');
              }
            }}
            className="mb-4 hover-button"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-gradient-to-br from-pink-500 to-purple-600 rounded-full">
              <Music className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold gradient-text">
                    {artistName || 'Unknown Artist'}
                  </h1>
                  <p className="text-muted-foreground">
                    All events for this artist
                  </p>
                  
                  {/* Music Platform Links */}
                  {artistName && (
                    <div className="flex items-center gap-3 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`https://open.spotify.com/search/${encodeURIComponent(artistName)}`, '_blank')}
                        className="flex items-center gap-2 hover:bg-green-50 hover:border-green-300"
                      >
                        <div className="w-4 h-4 bg-green-500 rounded-sm flex items-center justify-center">
                          <span className="text-white text-xs font-bold">♪</span>
                        </div>
                        Spotify
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(`https://music.apple.com/search?term=${encodeURIComponent(artistName)}`, '_blank')}
                        className="flex items-center gap-2 hover:bg-gray-50 hover:border-gray-400"
                      >
                        <div className="w-4 h-4 bg-black rounded-sm flex items-center justify-center">
                          <span className="text-white text-xs font-bold">♫</span>
                        </div>
                        Apple Music
                      </Button>
                    </div>
                  )}
                </div>
                {user?.id && (
                  <ArtistFollowButton
                    artistName={artistName}
                    userId={user.id}
                    variant="outline"
                    size="default"
                    showFollowerCount={true}
                  />
                )}
              </div>
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

        {/* Artist Profile Section */}
        <div className="mb-8 space-y-6">
          {/* Artist Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center gap-1 mb-2">
                  {renderStars(artistStats.averageRating)}
                </div>
                <div className="text-2xl font-bold text-gray-900">
                  {artistStats.averageRating.toFixed(1)}
                </div>
                <div className="text-sm text-gray-600">
                  Average Rating
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-gray-900">
                  {artistStats.totalReviews}
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

          {/* Artist Description */}
          {artistDescription && (
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-3">About {artistName}</h3>
                <p className="text-gray-700 leading-relaxed">{artistDescription}</p>
              </CardContent>
            </Card>
          )}

          {/* Reviews Section */}
          {artistStats.totalReviews > 0 && (
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
                  {renderStars(artistStats.averageRating)}
                  <span className="text-sm font-medium">
                    {artistStats.averageRating.toFixed(1)}
                  </span>
                  <span className="text-sm text-gray-600">
                    ({artistStats.totalReviews} review{artistStats.totalReviews !== 1 ? 's' : ''})
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
                      {sortReviews(filterReviews(artistReviews, reviewFilterBy), reviewSortBy).map(review => (
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
                                {review.venue_name && (
                                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                    <MapPin className="w-3 h-3" />
                                    {review.venue_name}
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
                              recommendation: review.artist_performance_recommendation
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
                            .filter(({ rating, feedback, recommendation }) => rating || feedback || recommendation)
                            .map(({ label, rating, feedback, recommendation }) => (
                              <div key={label} className="text-xs border-l-4 border-pink-200 pl-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-600">{label}</span>
                                  {typeof rating === 'number' && (
                                    <span className="text-gray-500">{rating.toFixed(1)}</span>
                                  )}
                                </div>
                                {recommendation && (
                                  <div className="text-gray-500">{recommendation}</div>
                                )}
                                {feedback && (
                                  <div className="text-gray-700 italic">“{feedback}”</div>
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
              <Select value={upcomingSortBy} onValueChange={(value: 'date' | 'location' | 'price') => setUpcomingSortBy(value)}>
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="location">Location</SelectItem>
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
                            if (event.venue_id) handleVenueClick(event.venue_id);
                          }}
                        >
                          {event.venue_name}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {getLocationString(event)}
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
              <Select value={pastSortBy} onValueChange={(value: 'date' | 'location' | 'price') => setPastSortBy(value)}>
                <SelectTrigger className="w-24 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="location">Location</SelectItem>
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
                            if (event.venue_id) handleVenueClick(event.venue_id);
                          }}
                        >
                          {event.venue_name}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {getLocationString(event)}
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
            <Music className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">No Events Found</h3>
            <p className="text-muted-foreground mb-4">
              No events found for {artistName || 'this artist'}.
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
