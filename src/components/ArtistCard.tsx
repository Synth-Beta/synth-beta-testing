import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Music, 
  Calendar, 
  MapPin, 
  Clock,
  ExternalLink,
  Star,
  Ticket,
  ArrowLeft
} from 'lucide-react';
import type { Artist } from '@/types/concertSearch';
import type { JamBaseEvent } from '@/types/eventTypes';
import { cn } from '@/lib/utils';
import { ArtistFollowButton } from '@/components/artists/ArtistFollowButton';
import { supabase } from '@/integrations/supabase/client';
import { VerifiedChatBadge } from '@/components/chats/VerifiedChatBadge';
import { SwiftUIEventCard } from '@/components/events/SwiftUIEventCard';

interface ArtistCardProps {
  artist: Artist;
  events: JamBaseEvent[];
  totalEvents: number;
  source: 'database' | 'api';
  userId?: string;
  onBack?: () => void;
  onViewAllEvents?: () => void;
  showAllEvents?: boolean;
  className?: string;
}

export function ArtistCard({ 
  artist, 
  events, 
  totalEvents, 
  source,
  userId,
  onBack, 
  onViewAllEvents,
  showAllEvents = false,
  className 
}: ArtistCardProps) {
  const [currentUserId, setCurrentUserId] = React.useState<string | undefined>(userId);

  // Get current user if not provided
  React.useEffect(() => {
    if (!userId) {
      supabase.auth.getUser().then(({ data }) => {
        setCurrentUserId(data.user?.id);
      });
    }
  }, [userId]);
  const upcomingEvents = events.filter(event => 
    new Date(event.event_date) > new Date()
  );
  
  // Show all events or limit to 10 based on showAllEvents prop
  const displayedUpcomingEvents = showAllEvents ? upcomingEvents : upcomingEvents.slice(0, 10);

  const formatGenres = (genres: string[] = []) => {
    if (genres.length === 0) return null;
    return genres.slice(0, 4).join(', ');
  };

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

  const getLocationString = (event: JamBaseEvent) => {
    const parts = [event.venue_city, event.venue_state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Location TBD';
  };

  return (
    <div className={cn("w-full max-w-4xl mx-auto space-y-6 overflow-x-hidden px-4 pb-6", className)}>
      {/* Back Button - SwiftUI Style */}
      {onBack && (
        <button
          onClick={onBack}
          className="mb-4 flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            color: 'var(--neutral-700)',
            fontFamily: 'var(--font-family)',
            fontSize: '15px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
            e.currentTarget.style.transform = 'translateX(-2px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
            e.currentTarget.style.transform = 'translateX(0)';
          }}
        >
          <ArrowLeft size={18} />
          <span>Back</span>
        </button>
      )}

      {/* Artist Header Card - SwiftUI Liquid Glass */}
      <div
        className="rounded-3xl overflow-hidden relative"
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          border: '1px solid rgba(255, 255, 255, 0.3)',
          boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.1), 0 2px 8px 0 rgba(0, 0, 0, 0.05), inset 0 1px 0 0 rgba(255, 255, 255, 0.6)',
          padding: '24px',
        }}
      >
        {/* Glass overlay gradient */}
        <div
          className="absolute inset-0 pointer-events-none rounded-3xl"
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, transparent 50%, rgba(236, 72, 153, 0.02) 100%)',
          }}
        />

        <div className="relative z-10">
          <div className="flex items-start gap-4">
            <div
              className="flex-shrink-0 rounded-2xl overflow-hidden"
              style={{
                width: '80px',
                height: '80px',
                backgroundColor: 'rgba(236, 72, 153, 0.1)',
                border: '1px solid rgba(236, 72, 153, 0.2)',
                boxShadow: '0 4px 16px rgba(236, 72, 153, 0.15)',
              }}
            >
              {artist.image_url ? (
                <img
                  src={artist.image_url}
                  alt={artist.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Music className="w-10 h-10" style={{ color: 'var(--brand-pink-500)' }} />
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 mb-3">
                <h1
                  className="font-bold leading-tight"
                  style={{
                    fontSize: '28px',
                    fontFamily: 'var(--font-family)',
                    color: 'var(--neutral-900)',
                  }}
                >
                  {artist.name}
                </h1>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {currentUserId && (
                    <>
                      <VerifiedChatBadge
                        entityType="artist"
                        entityId={artist.id || artist.jambase_artist_id}
                        entityName={artist.name}
                        currentUserId={currentUserId}
                        onChatOpen={(chatId) => {
                          window.location.href = `/chats?chatId=${chatId}`;
                        }}
                        variant="compact"
                      />
                      <ArtistFollowButton
                        artistName={artist.name}
                        jambaseArtistId={artist.jambase_artist_id}
                        userId={currentUserId}
                        variant="outline"
                        size="default"
                        showFollowerCount={true}
                      />
                    </>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {artist.jambase_artist_id && (
                  <span
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-semibold text-xs"
                    style={{
                      backgroundColor: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.2)',
                      color: 'var(--brand-blue-600)',
                      fontFamily: 'var(--font-family)',
                    }}
                  >
                    <ExternalLink size={12} />
                    Verified
                  </span>
                )}
                <span
                  className="inline-flex items-center px-3 py-1 rounded-lg font-medium text-xs"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.05)',
                    color: 'var(--neutral-600)',
                    fontFamily: 'var(--font-family)',
                  }}
                >
                  {source === 'api' ? 'Live Data' : 'Cached Data'}
                </span>
              </div>
              
              {artist.description && (
                <p
                  className="leading-relaxed mb-4"
                  style={{
                    fontSize: '15px',
                    fontFamily: 'var(--font-family)',
                    color: 'var(--neutral-700)',
                    lineHeight: '1.6',
                  }}
                >
                  {artist.description}
                </p>
              )}
              
              {artist.genres && artist.genres.length > 0 && (
                <div className="mb-4">
                  <div
                    className="font-semibold mb-2 text-xs uppercase tracking-wide"
                    style={{
                      fontFamily: 'var(--font-family)',
                      color: 'var(--neutral-600)',
                    }}
                  >
                    Genres
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {artist.genres.map((genre, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2.5 py-1 rounded-lg font-semibold text-xs"
                        style={{
                          backgroundColor: 'rgba(236, 72, 153, 0.1)',
                          border: '1px solid rgba(236, 72, 153, 0.2)',
                          color: 'var(--brand-pink-600)',
                          fontFamily: 'var(--font-family)',
                        }}
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex items-center gap-6 flex-wrap">
                <div className="flex items-center gap-2">
                  <Calendar size={16} style={{ color: 'var(--brand-pink-500)' }} />
                  <span
                    className="font-medium"
                    style={{
                      fontSize: '14px',
                      fontFamily: 'var(--font-family)',
                      color: 'var(--neutral-700)',
                    }}
                  >
                    {totalEvents} total events
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock size={16} style={{ color: 'var(--brand-pink-500)' }} />
                  <span
                    className="font-medium"
                    style={{
                      fontSize: '14px',
                      fontFamily: 'var(--font-family)',
                      color: 'var(--neutral-700)',
                    }}
                  >
                    {upcomingEvents.length} upcoming
                  </span>
                </div>
                {artist.popularity_score && (
                  <div className="flex items-center gap-2">
                    <Star size={16} className="text-yellow-400 fill-current" />
                    <span
                      className="font-medium"
                      style={{
                        fontSize: '14px',
                        fontFamily: 'var(--font-family)',
                        color: 'var(--neutral-700)',
                      }}
                    >
                      Score: {artist.popularity_score}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Events Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Events</h2>
          {onViewAllEvents && totalEvents > events.length && (
            <Button variant="outline" onClick={onViewAllEvents}>
              View All {totalEvents} Events
            </Button>
          )}
        </div>

        {/* Upcoming Events Grid - Optimized for iPhone */}
        {upcomingEvents.length > 0 && (
          <div className="w-full overflow-x-hidden">
            <h3
              className="font-bold mb-4 flex items-center gap-2"
              style={{
                fontSize: '20px',
                fontFamily: 'var(--font-family)',
                color: 'var(--neutral-900)',
              }}
            >
              <Calendar size={20} style={{ color: 'var(--brand-pink-500)' }} />
              <span>Upcoming Events ({upcomingEvents.length})</span>
            </h3>
            {/* Responsive grid: 1 column on mobile, 2 on tablet, 3 on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
              {displayedUpcomingEvents.map((event) => (
                <SwiftUIEventCard
                  key={event.jambase_event_id || event.id}
                  event={{
                    id: event.id || event.jambase_event_id || '',
                    title: event.title || 'Event',
                    event_date: event.event_date,
                    venue_name: event.venue_name,
                    venue_city: event.venue_city,
                    venue_state: event.venue_state,
                    doors_time: event.doors_time,
                    price_range: event.price_range,
                    ticket_urls: event.ticket_urls,
                    ticket_available: event.ticket_available,
                    genres: event.genres,
                  }}
                  onClick={() => {
                    // Event click handling - could be extended to open event details modal
                    if (onViewAllEvents) {
                      // Navigate to full events page or open modal
                      window.location.href = `/artist/${encodeURIComponent(artist.name)}/events`;
                    }
                  }}
                />
              ))}
            </div>
            {!showAllEvents && upcomingEvents.length > 10 && (
              <div className="mt-4">
                <button
                  onClick={onViewAllEvents}
                  className="w-full py-3 rounded-2xl font-semibold transition-all"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    color: 'var(--brand-pink-600)',
                    fontFamily: 'var(--font-family)',
                    fontSize: '15px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  Show {upcomingEvents.length - 10} More Upcoming Events
                </button>
              </div>
            )}
            {showAllEvents && upcomingEvents.length > 10 && (
              <div className="mt-4">
                <button
                  onClick={() => onViewAllEvents?.()}
                  className="w-full py-3 rounded-2xl font-semibold transition-all"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(20px)',
                    WebkitBackdropFilter: 'blur(20px)',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    color: 'var(--brand-pink-600)',
                    fontFamily: 'var(--font-family)',
                    fontSize: '15px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  Show Less (Back to 10 events)
                </button>
              </div>
            )}
          </div>
        )}


        {/* No Events */}
        {events.length === 0 && (
          <Card>
            <CardContent className="text-center py-12">
              <Music className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Events Found</h3>
              <p className="text-muted-foreground">
                No events found for {artist.name}. This could mean:
              </p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                <li>• The artist has no upcoming or recent events</li>
                <li>• The artist name might be spelled differently</li>
                <li>• The events might not be in our database yet</li>
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
