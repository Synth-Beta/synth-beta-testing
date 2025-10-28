import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  Ticket, 
  ExternalLink, 
  Heart, 
  HeartOff,
  Star,
  StarOff,
  MessageSquare,
  Users,
  Share2,
  Globe
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { JamBaseEvent, JamBaseEventResponse } from '@/services/jambaseEventsService';
import { EventMap } from '@/components/EventMap';
import { formatPrice } from '@/utils/currencyUtils';
import { supabase } from '@/integrations/supabase/client';
import { trackInteraction } from '@/services/interactionTrackingService';
import { EventShareModal } from '@/components/events/EventShareModal';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ShareService } from '@/services/shareService';
import { useToast } from '@/hooks/use-toast';
import { ArtistFollowButton } from '@/components/artists/ArtistFollowButton';
import { VenueFollowButton } from '@/components/venues/VenueFollowButton';
import { PromotedEventBadge } from '@/components/events/PromotedEventBadge';
import { usePromotionImpression } from '@/hooks/usePromotionImpression';
import { formatVenueName, formatVenueLocation, formatVenueAddress } from '@/utils/venueUtils';

interface JamBaseEventCardProps {
  event: JamBaseEvent | (JamBaseEventResponse & { images?: any[] });
  onInterestToggle?: (eventId: string, interested: boolean) => void;
  onReview?: (eventId: string) => void;
  isInterested?: boolean;
  hasReviewed?: boolean;
  showInterestButton?: boolean;
  showReviewButton?: boolean;
  currentUserId?: string;
  onOpenInterestedUsers?: (eventId: string) => void;
  className?: string;
  onClick?: () => void;
}

export function JamBaseEventCard({
  event,
  onInterestToggle,
  onReview,
  isInterested = false,
  hasReviewed = false,
  showInterestButton = true,
  showReviewButton = true,
  currentUserId,
  onOpenInterestedUsers,
  className,
  onClick
}: JamBaseEventCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [interestedCount, setInterestedCount] = useState<number | null>(null);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const { toast } = useToast();
  // All data is real; no demo flags or mock avatars

  // Promotion impression tracking
  const impressionRef = usePromotionImpression({
    promotionId: event.active_promotion_id || '',
    enabled: event.is_promoted && !!event.active_promotion_id
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
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

  const isPastEvent = new Date(event.event_date) < new Date();
  const isUpcomingEvent = new Date(event.event_date) >= new Date();

  const handleInterestToggle = async () => {
    if (!onInterestToggle || isLoading) return;
    
    setIsLoading(true);
    try {
      await onInterestToggle(event.id, !isInterested);
    } catch (error) {
      console.error('Error toggling interest:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReview = () => {
    if (onReview) {
      onReview(event.id);
    }
  };

  // Get venue display info using utility functions
  const venueName = formatVenueName(event.venue_name);
  const venueLocation = formatVenueLocation(event.venue_city, event.venue_state);
  const venueAddress = formatVenueAddress(event.venue_address, event.venue_city, event.venue_state, event.venue_zip);

  useEffect(() => {
    const fetchInterestedCount = async () => {
      try {
        const { count, error } = await supabase
          .from('user_jambase_events')
          .select('*', { count: 'exact', head: true })
          .eq('jambase_event_id', event.id)
          .neq('user_id', currentUserId || '');
        
        if (error) throw error;
        setInterestedCount(count ?? 0);
      } catch (error) {
        console.error('Error fetching interested count:', error);
        setInterestedCount(null);
      }
    };
    fetchInterestedCount();
  }, [event.id, currentUserId]);

  // Resolve a primary image for the event:
  // 1) Ticketmaster/event images (from images array)
  // 2) User review photo for this specific event
  // 3) Artist image from reviews
  // 4) Popular review photo for same artist
  useEffect(() => {
    (async () => {
      try {
        // 1) Try Ticketmaster/event images first (if available)
        if (event.images && Array.isArray(event.images) && event.images.length > 0) {
          // Ticketmaster images format: [{ url: string, width: number, height: number, ratio: string }]
          // Prefer larger images (width > 1000) or 16:9 ratio
          const bestImage = event.images.find((img: any) => 
            img.url && (img.ratio === '16_9' || (img.width && img.width > 1000))
          ) || event.images.find((img: any) => img.url);
          
          if (bestImage?.url) {
            setHeroImageUrl(bestImage.url);
            return;
          }
        }

        // 2) Try a user review photo for this specific event
        const byEvent = await (supabase as any)
          .from('user_reviews')
          .select('photos')
          .eq('event_id', event.id)
          .not('photos', 'is', null)
          .order('likes_count', { ascending: false })
          .limit(1);
        const eventPhoto = Array.isArray(byEvent.data) && byEvent.data[0]?.photos?.[0];
        if (eventPhoto) { 
          setHeroImageUrl(eventPhoto); 
          return; 
        }

        // 3) Try artist image via any review that carries artist image url
        if (event.artist_name) {
          const artist = await (supabase as any)
            .from('user_reviews')
            .select('photos, jambase_events!inner(artist_name)')
            .not('photos', 'is', null)
            .ilike('jambase_events.artist_name', `%${event.artist_name}%`)
            .order('likes_count', { ascending: false })
            .limit(1);
          const artistImg = Array.isArray(artist.data) && artist.data[0]?.photos?.[0];
          if (artistImg) { 
            setHeroImageUrl(artistImg); 
            return; 
          }

          // 4) Try most-liked review photo for same artist across events
          const byArtist = await (supabase as any)
            .from('user_reviews')
            .select('photos, jambase_events!inner(artist_name)')
            .not('photos', 'is', null)
            .ilike('jambase_events.artist_name', `%${event.artist_name}%`)
            .order('likes_count', { ascending: false })
            .limit(1);
          const artistPhoto = Array.isArray(byArtist.data) && byArtist.data[0]?.photos?.[0];
          if (artistPhoto) { 
            setHeroImageUrl(artistPhoto); 
            return; 
          }
        }
      } catch (error) {
        console.error('Error resolving event image:', error);
      }
      setHeroImageUrl(null);
    })();
  }, [event.id, event.artist_id, event.artist_name, event.images]);

  const getCheapestTicketUrl = () => {
    if (!event.ticket_urls || event.ticket_urls.length === 0) return null;
    // Heuristic: prefer URLs containing known cheap vendors first
    const preferredOrder = ['stubhub', 'vividseats', 'seatgeek', 'ticketmaster', 'axs'];
    const lower = event.ticket_urls.map(u => ({ url: u, l: u.toLowerCase() }));
    for (const vendor of preferredOrder) {
      const found = lower.find(u => u.l.includes(vendor));
      if (found) return found.url;
    }
    return event.ticket_urls[0];
  };

  return (
    <Card
      ref={impressionRef as React.Ref<HTMLDivElement>}
      className={cn(
        "w-full transition-all duration-200 hover:shadow-lg",
        // Gold glow for promoted events
        event.is_promoted && "ring-2 ring-yellow-400/50 shadow-lg shadow-yellow-200/30 border-yellow-200/50",
        className
      )}
      onClick={onClick}
    >
      {heroImageUrl && (
        <div className="h-48 w-full overflow-hidden rounded-t-lg relative">
          <img 
            src={heroImageUrl} 
            alt={event.title} 
            className="w-full h-full object-cover" 
            loading="lazy"
            onError={(e) => {
              // Handle image load errors gracefully
              console.warn('Failed to load event image:', heroImageUrl);
              setHeroImageUrl(null);
            }}
          />
          {/* Optional: Add gradient overlay for better text readability if needed */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />
        </div>
      )}
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg leading-tight mb-2">
              {event.title}
            </CardTitle>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Calendar className="w-4 h-4" />
              <span>{formatDate(event.event_date)}</span>
              <span>•</span>
              <Clock className="w-4 h-4" />
              <span>{formatTime(event.event_date)}</span>
              {event.doors_time && (
                <>
                  <span>•</span>
                  <span>Doors: {formatDoorsTime(event.doors_time)}</span>
                </>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {event.is_promoted && event.promotion_tier && (
              <PromotedEventBadge promotionTier={event.promotion_tier as 'basic' | 'premium' | 'featured'} />
            )}
            {isPastEvent && (
              <Badge variant="secondary" className="text-xs">
                Past Event
              </Badge>
            )}
            {isUpcomingEvent && (
              <Badge variant="default" className="text-xs">
                Upcoming
              </Badge>
            )}
            {event.ticket_available && (
              <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                <Ticket className="w-3 h-3 mr-1" />
                Tickets Available
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0 space-y-4">
        {/* Venue Information */}
        {venueName && (
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-medium text-sm">{venueName}</div>
                {currentUserId && event.venue_name && event.venue_name !== 'Venue TBD' && (
                  <VenueFollowButton
                    venueName={event.venue_name}
                    venueCity={event.venue_city}
                    venueState={event.venue_state}
                    userId={currentUserId}
                    variant="ghost"
                    size="sm"
                    showFollowerCount={false}
                    className="h-6 text-xs"
                  />
                )}
              </div>
              {venueAddress && (
                <div className="text-sm text-muted-foreground">
                  {venueAddress}
                </div>
              )}
              {!venueAddress && venueLocation && (
                <div className="text-sm text-muted-foreground">
                  {venueLocation}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mini Map Preview */}
        {event.latitude != null && event.longitude != null && !Number.isNaN(Number(event.latitude)) && !Number.isNaN(Number(event.longitude)) && (
          <div className="h-40 rounded-md overflow-hidden border border-gray-100">
            <EventMap
              center={[Number(event.latitude), Number(event.longitude)]}
              zoom={12}
              // Cast to response shape for the map component
              events={[event as any]}
              onEventClick={() => { /* no-op in card */ }}
            />
          </div>
        )}

        {/* Description */}
        {event.description && (
          <div className="text-sm text-muted-foreground leading-relaxed">
            {event.description.length > 200 
              ? `${event.description.substring(0, 200)}...` 
              : event.description
            }
          </div>
        )}

        {/* Artist Information with Follow Button */}
        {event.artist_name && (
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {event.artist_name}
              </Badge>
            </div>
            {currentUserId && (
              <ArtistFollowButton
                artistId={event.artist_id}
                artistName={event.artist_name}
                userId={currentUserId}
                variant="ghost"
                size="sm"
                showFollowerCount={false}
                className="h-7 text-xs"
              />
            )}
          </div>
        )}

        {/* Genres */}
        {event.genres && event.genres.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.genres.slice(0, 4).map((genre, index) => (
              <Badge key={index} variant="secondary" className="text-xs">
                {genre}
              </Badge>
            ))}
            {event.genres.length > 4 && (
              <Badge variant="secondary" className="text-xs">
                +{event.genres.length - 4} more
              </Badge>
            )}
          </div>
        )}

        {/* Tour Name */}
        {event.tour_name && (
          <div className="text-sm">
            <span className="text-muted-foreground">Tour: </span>
            <span className="font-medium">{event.tour_name}</span>
          </div>
        )}

        {/* Price Range - All APIs now populate price_range consistently */}
        {event.price_range && (
          <div className="text-sm">
            <span className="text-muted-foreground">Price: </span>
            <span className="font-medium">{formatPrice(event.price_range)}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            {/* Interest Button for Upcoming Events */}
            {isUpcomingEvent && showInterestButton && onInterestToggle && (
              <Button
                variant={isInterested ? "default" : "outline"}
                size="sm"
                onClick={handleInterestToggle}
                disabled={isLoading}
                className={cn(
                  "transition-colors",
                  isInterested 
                    ? "bg-red-500 hover:bg-red-600 text-white" 
                    : "hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                )}
              >
                {isInterested ? (
                  <Heart className="w-4 h-4 mr-1 fill-current" />
                ) : (
                  <HeartOff className="w-4 h-4 mr-1" />
                )}
                {isInterested ? 'Interested' : 'Interested?'}
              </Button>
            )}

            {/* Review Button for Past Events */}
            {isPastEvent && showReviewButton && onReview && (
              <Button
                variant={hasReviewed ? "default" : "outline"}
                size="sm"
                onClick={handleReview}
                className={cn(
                  "transition-colors",
                  hasReviewed 
                    ? "bg-yellow-500 hover:bg-yellow-600 text-white" 
                    : "hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-300"
                )}
              >
                {hasReviewed ? (
                  <Star className="w-4 h-4 mr-1 fill-current" />
                ) : (
                  <StarOff className="w-4 h-4 mr-1" />
                )}
                {hasReviewed ? 'Reviewed' : 'I Was There'}
              </Button>
            )}
          </div>

          {/* External Links */}
          <div className="flex items-center gap-2">
            {/* Unified Share Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className="text-pink-600 hover:text-pink-700 hover:bg-pink-50"
                >
                  <Share2 className="w-4 h-4" />
                  <span className="hidden sm:inline ml-1">Share</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52 bg-white/95 backdrop-blur-sm border shadow-lg z-50">
                {currentUserId && (
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setShareModalOpen(true);
                    }}
                    className="cursor-pointer bg-white hover:bg-gray-50"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Share with Synth Friends
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const url = await ShareService.shareEvent(event.id, event.title, event.description || undefined);
                      
                      // Try Web Share API first
                      if (navigator.share) {
                        await navigator.share({
                          title: event.title,
                          text: event.description || 'Check out this event!',
                          url: url
                        });
                      } else {
                        // Fallback to copying link
                        await navigator.clipboard.writeText(url);
                        toast({ title: 'Link copied', description: url });
                      }
                    } catch (error) {
                      // Fallback to copying link if Web Share fails
                      try {
                        const url = await ShareService.shareEvent(event.id, event.title, event.description || undefined);
                        await navigator.clipboard.writeText(url);
                        toast({ title: 'Link copied', description: url });
                      } catch (fallbackError) {
                        toast({ title: 'Error', description: 'Failed to share', variant: 'destructive' });
                      }
                    }
                  }}
                  className="cursor-pointer bg-white hover:bg-gray-50"
                >
                  <Globe className="w-4 h-4 mr-2" />
                  Share
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const url = await ShareService.shareEvent(event.id, event.title, event.description || undefined);
                      await navigator.clipboard.writeText(url);
                      toast({ title: 'Link copied', description: url });
                    } catch (error) {
                      toast({ title: 'Error', description: 'Failed to copy link', variant: 'destructive' });
                    }
                  }}
                  className="cursor-pointer bg-white hover:bg-gray-50"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Copy Link
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {event.ticket_urls && event.ticket_urls.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="text-blue-600 hover:text-blue-700"
              >
                <a 
                  href={getCheapestTicketUrl() || event.ticket_urls[0]} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-1"
                  onClick={() => { try { trackInteraction.click('ticket', event.id, { providerUrl: getCheapestTicketUrl() || event.ticket_urls[0] }); } catch {} }}
                >
                  <Ticket className="w-4 h-4" />
                  <span className="hidden sm:inline">Tickets</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Interested Users Preview */}
        <div className="mt-3 flex items-center justify-between rounded-md border p-2">
            <div className="text-sm text-muted-foreground">
              {interestedCount === null ? 'Loading people going…' : `${interestedCount} others are interested`}
            </div>
            {onOpenInterestedUsers && (
              <Button size="sm" variant="outline" onClick={() => onOpenInterestedUsers(event.id)}>
                Meet people going
              </Button>
            )}
        </div>

        {/* Setlist Preview */}
        {event.setlist && (
          <div className="pt-2 border-t border-gray-100">
            <div className="text-xs text-muted-foreground mb-1">Setlist Preview:</div>
            <div className="text-sm">
              {typeof event.setlist === 'string' 
                ? event.setlist.substring(0, 100) + '...'
                : JSON.stringify(event.setlist).substring(0, 100) + '...'
              }
            </div>
          </div>
        )}
      </CardContent>

      {/* Event Share Modal */}
      {currentUserId && (
        <EventShareModal
          event={event}
          currentUserId={currentUserId}
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
        />
      )}
    </Card>
  );
}
