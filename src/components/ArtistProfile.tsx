import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { 
  ArrowLeft, 
  Music, 
  Calendar, 
  Star, 
  Heart, 
  Users,
  MapPin,
  Clock,
  ExternalLink,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { JamBaseEventCard } from './JamBaseEventCard';
import { EventReviewModal } from './EventReviewModal';
import { JamBaseEventsService, JamBaseEvent } from '@/services/jambaseEventsService';
import { UserEventService, UserEventReview } from '@/services/userEventService';
import type { Artist } from '@/types/concertSearch';

interface ArtistProfileProps {
  artist: Artist;
  onBack: () => void;
  onInterestToggle?: (eventId: string, interested: boolean) => void;
  onReview?: (eventId: string) => void;
  userId?: string;
  className?: string;
}

interface EventsState {
  upcoming: JamBaseEvent[];
  past: JamBaseEvent[];
  loading: boolean;
  error: string | null;
  hasMoreUpcoming: boolean;
  hasMorePast: boolean;
  upcomingPage: number;
  pastPage: number;
}

interface UserInterests {
  [eventId: string]: boolean;
}

interface UserReviews {
  [eventId: string]: UserEventReview;
}

export function ArtistProfile({
  artist,
  onBack,
  onInterestToggle,
  onReview,
  userId,
  className
}: ArtistProfileProps) {
  const [eventsState, setEventsState] = useState<EventsState>({
    upcoming: [],
    past: [],
    loading: false,
    error: null,
    hasMoreUpcoming: false,
    hasMorePast: false,
    upcomingPage: 1,
    pastPage: 1
  });

  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [userInterests, setUserInterests] = useState<UserInterests>({});
  const [userReviews, setUserReviews] = useState<UserReviews>({});
  const [reviewModalEvent, setReviewModalEvent] = useState<JamBaseEvent | null>(null);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);

  // Load events when component mounts or artist changes
  useEffect(() => {
    loadEvents();
  }, [artist.id]);

  // Load user interests and reviews when userId changes
  useEffect(() => {
    if (userId) {
      loadUserData();
    }
  }, [userId]);

  const loadEvents = async (type: 'upcoming' | 'past' | 'both' = 'both', page: number = 1) => {
    setEventsState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const perPage = 10;
      
      if (type === 'both' || type === 'upcoming') {
        const upcomingResult = await JamBaseEventsService.getOrFetchArtistEvents(artist.name, {
          page: type === 'both' ? 1 : page,
          perPage,
          eventType: 'upcoming'
        });

        setEventsState(prev => ({
          ...prev,
          upcoming: upcomingResult.events,
          hasMoreUpcoming: upcomingResult.hasNextPage,
          upcomingPage: upcomingResult.page
        }));
      }

      if (type === 'both' || type === 'past') {
        const pastResult = await JamBaseEventsService.getOrFetchArtistEvents(artist.name, {
          page: type === 'both' ? 1 : page,
          perPage,
          eventType: 'past'
        });

        setEventsState(prev => ({
          ...prev,
          past: pastResult.events,
          hasMorePast: pastResult.hasNextPage,
          pastPage: pastResult.page
        }));
      }

      // Load user data after events are loaded
      if (userId) {
        const upcomingEvents = type === 'both' || type === 'upcoming' ? upcomingResult.events : eventsState.upcoming;
        const pastEvents = type === 'both' || type === 'past' ? pastResult.events : eventsState.past;
        await loadUserData({ upcoming: upcomingEvents, past: pastEvents });
      }

    } catch (error) {
      console.error('Error loading events:', error);
      setEventsState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load events'
      }));
    } finally {
      setEventsState(prev => ({ ...prev, loading: false }));
    }
  };

  const loadMoreEvents = async (type: 'upcoming' | 'past') => {
    const nextPage = type === 'upcoming' ? eventsState.upcomingPage + 1 : eventsState.pastPage + 1;
    await loadEvents(type, nextPage);
  };

  const loadUserData = async (events?: { upcoming: JamBaseEvent[]; past: JamBaseEvent[] }) => {
    if (!userId) return;

    const upcomingEvents = events?.upcoming || eventsState.upcoming;
    const pastEvents = events?.past || eventsState.past;

    try {
      // Load user interests for upcoming events
      const upcomingEventIds = upcomingEvents.map(e => e.jambase_event_id);
      if (upcomingEventIds.length > 0) {
        const interestPromises = upcomingEventIds.map(eventId => 
          UserEventService.isUserInterested(userId, eventId)
        );
        const interests = await Promise.all(interestPromises);
        
        const interestsMap: UserInterests = {};
        upcomingEventIds.forEach((eventId, index) => {
          interestsMap[eventId] = interests[index];
        });
        setUserInterests(prev => ({ ...prev, ...interestsMap }));
      }

      // Load user reviews for past events
      const pastEventIds = pastEvents.map(e => e.jambase_event_id);
      if (pastEventIds.length > 0) {
        const reviewPromises = pastEventIds.map(eventId => 
          UserEventService.getUserEventReview(userId, eventId)
        );
        const reviews = await Promise.all(reviewPromises);
        
        const reviewsMap: UserReviews = {};
        pastEventIds.forEach((eventId, index) => {
          if (reviews[index]) {
            reviewsMap[eventId] = reviews[index];
          }
        });
        setUserReviews(prev => ({ ...prev, ...reviewsMap }));
      }

    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const handleInterestToggle = async (eventId: string, interested: boolean) => {
    if (!userId) return;

    try {
      await UserEventService.setEventInterest(userId, eventId, interested);
      setUserInterests(prev => ({ ...prev, [eventId]: interested }));
      
      if (onInterestToggle) {
        onInterestToggle(eventId, interested);
      }
    } catch (error) {
      console.error('Error toggling interest:', error);
    }
  };

  const handleReview = (eventId: string) => {
    const event = [...eventsState.upcoming, ...eventsState.past].find(e => e.jambase_event_id === eventId);
    if (event) {
      setReviewModalEvent(event);
      setIsReviewModalOpen(true);
    }
  };

  const handleReviewSubmitted = (review: UserEventReview) => {
    setUserReviews(prev => ({ ...prev, [review.jambase_event_id]: review }));
    
    if (onReview) {
      onReview(review.jambase_event_id);
    }
  };

  const formatGenres = (genres: string[] = []) => {
    if (genres.length === 0) return null;
    return genres.slice(0, 6).join(', ');
  };

  const getTotalEvents = () => {
    return eventsState.upcoming.length + eventsState.past.length;
  };

  return (
    <div className={cn("w-full max-w-4xl mx-auto", className)}>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Artist Profile</h1>
        </div>
      </div>

      {/* Artist Info Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-start gap-4">
            <Avatar className="w-20 h-20">
              <AvatarImage src={artist.image_url || undefined} />
              <AvatarFallback className="text-2xl">
                <Music className="w-10 h-10" />
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <CardTitle className="text-2xl mb-2">{artist.name}</CardTitle>
              
              {artist.jambase_artist_id && (
                <Badge variant="outline" className="mb-3">
                  <ExternalLink className="w-3 h-3 mr-1" />
                  JamBase Verified
                </Badge>
              )}
              
              {artist.description && (
                <p className="text-muted-foreground leading-relaxed mb-4">
                  {artist.description}
                </p>
              )}
              
              {artist.genres && artist.genres.length > 0 && (
                <div className="mb-4">
                  <div className="text-sm font-medium text-muted-foreground mb-2">Genres</div>
                  <div className="flex flex-wrap gap-1">
                    {artist.genres.map((genre, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {genre}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  <span>{getTotalEvents()} events found</span>
                </div>
                {artist.popularity_score && (
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-400 fill-current" />
                    <span>Popularity: {artist.popularity_score}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Events Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'upcoming' | 'past')}>
        <TabsList className="grid w-full grid-cols-2 mb-6">
          <TabsTrigger value="upcoming" className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Upcoming Events ({eventsState.upcoming.length})
          </TabsTrigger>
          <TabsTrigger value="past" className="flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Past Events ({eventsState.past.length})
          </TabsTrigger>
        </TabsList>

        {/* Upcoming Events */}
        <TabsContent value="upcoming" className="space-y-4">
          {eventsState.loading && eventsState.upcoming.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mr-2" />
              <span>Loading upcoming events...</span>
            </div>
          ) : eventsState.error ? (
            <div className="flex items-center justify-center py-12 text-center">
              <div>
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Error Loading Events</h3>
                <p className="text-muted-foreground mb-4">{eventsState.error}</p>
                <Button onClick={() => loadEvents('upcoming')}>
                  Try Again
                </Button>
              </div>
            </div>
          ) : eventsState.upcoming.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Upcoming Events</h3>
              <p className="text-muted-foreground">
                {artist.name} doesn't have any upcoming events at the moment.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {eventsState.upcoming.map((event) => (
                  <JamBaseEventCard
                    key={event.jambase_event_id}
                    event={event}
                    onInterestToggle={handleInterestToggle}
                    showInterestButton={true}
                    showReviewButton={false}
                    isInterested={userInterests[event.jambase_event_id] || false}
                  />
                ))}
              </div>
              
              {eventsState.hasMoreUpcoming && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => loadMoreEvents('upcoming')}
                    disabled={eventsState.loading}
                  >
                    {eventsState.loading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Load More Upcoming Events
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* Past Events */}
        <TabsContent value="past" className="space-y-4">
          {eventsState.loading && eventsState.past.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin mr-2" />
              <span>Loading past events...</span>
            </div>
          ) : eventsState.error ? (
            <div className="flex items-center justify-center py-12 text-center">
              <div>
                <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Error Loading Events</h3>
                <p className="text-muted-foreground mb-4">{eventsState.error}</p>
                <Button onClick={() => loadEvents('past')}>
                  Try Again
                </Button>
              </div>
            </div>
          ) : eventsState.past.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Past Events</h3>
              <p className="text-muted-foreground">
                No past events found for {artist.name}.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {eventsState.past.map((event) => (
                  <JamBaseEventCard
                    key={event.jambase_event_id}
                    event={event}
                    onReview={handleReview}
                    showInterestButton={false}
                    showReviewButton={true}
                    hasReviewed={!!userReviews[event.jambase_event_id]}
                  />
                ))}
              </div>
              
              {eventsState.hasMorePast && (
                <div className="flex justify-center pt-4">
                  <Button
                    variant="outline"
                    onClick={() => loadMoreEvents('past')}
                    disabled={eventsState.loading}
                  >
                    {eventsState.loading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Load More Past Events
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Review Modal */}
      {userId && (
        <EventReviewModal
          event={reviewModalEvent}
          userId={userId}
          isOpen={isReviewModalOpen}
          onClose={() => {
            setIsReviewModalOpen(false);
            setReviewModalEvent(null);
          }}
          onReviewSubmitted={handleReviewSubmitted}
        />
      )}
    </div>
  );
}
