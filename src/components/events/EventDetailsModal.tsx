import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  Ticket, 
  ExternalLink, 
  X,
  Star,
  Heart,
  MessageSquare,
  Users,
  Music
} from 'lucide-react';
import { EventCommentsModal } from './EventCommentsModal';
import { JamBaseEventCard } from './JamBaseEventCard';
import { FriendProfileCard } from '@/components/FriendProfileCard';
import { formatPrice } from '@/utils/currencyUtils';
import { EventReviewsSection } from '@/components/reviews/EventReviewsSection';
import { EventMap } from '@/components/EventMap';
import type { JamBaseEvent } from '@/services/jambaseEventsService';
import { supabase } from '@/integrations/supabase/client';
import { trackInteraction } from '@/services/interactionTrackingService';

interface EventDetailsModalProps {
  event: JamBaseEvent | null;
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
  onInterestToggle?: (eventId: string, interested: boolean) => void;
  onReview?: (eventId: string) => void;
  isInterested?: boolean;
  hasReviewed?: boolean;
}

export function EventDetailsModal({
  event,
  currentUserId,
  isOpen,
  onClose,
  onInterestToggle,
  onReview,
  isInterested = false,
  hasReviewed = false
}: EventDetailsModalProps) {
  if (!event) return null;
  const [interestedCount, setInterestedCount] = useState<number | null>(null);
  const [friendModalOpen, setFriendModalOpen] = useState(false);
  const [friendModalUser, setFriendModalUser] = useState<{ id: string; user_id: string; name: string; username: string; avatar_url?: string | null; bio?: string | null; created_at: string } | null>(null);
  const [showInterestedUsers, setShowInterestedUsers] = useState(false);
  const [interestedUsers, setInterestedUsers] = useState<Array<{ id: string; name: string; avatar_url?: string }>>([]);
  const [usersPage, setUsersPage] = useState(1);
  const pageSize = 3;
  const [commentsOpen, setCommentsOpen] = useState(false);
  // All data is real; no demo flags

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

  const isPastEvent = new Date(event.event_date) < new Date();
  const isUpcomingEvent = new Date(event.event_date) >= new Date();

  const getLocationString = () => {
    const parts = [event.venue_city, event.venue_state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Location TBD';
  };

  const getVenueAddress = () => {
    if (event.venue_address) {
      return event.venue_address;
    }
    return getLocationString();
  };

  useEffect(() => {
    const fetchInterestedCount = async () => {
      try {
        const eventId = event.jambase_event_id || event.id;
        
        // First, find the UUID id from jambase_events table
        const { data: jambaseEvent, error: jambaseError } = await supabase
          .from('jambase_events')
          .select('id')
          .eq('jambase_event_id', eventId.toString())
          .single();
          
        if (jambaseError) {
          // Try using the eventId directly as UUID (in case it's already the UUID id)
          const { count, error } = await supabase
            .from('user_jambase_events')
            .select('*', { count: 'exact', head: true })
            .eq('jambase_event_id', eventId);
          if (error) throw error;
          const dbCount = count ?? 0;
          setInterestedCount(dbCount);
          return;
        }
        
        // Use the UUID id to get the count
        const { count, error } = await supabase
          .from('user_jambase_events')
          .select('*', { count: 'exact', head: true })
          .eq('jambase_event_id', jambaseEvent.id);
        if (error) throw error;
        const dbCount = count ?? 0;
        setInterestedCount(dbCount);
      } catch {
        setInterestedCount(null);
      }
    };
    fetchInterestedCount();
  }, [event.id]);

  const fetchInterestedUsers = async (page: number) => {
    try {
      console.log('Fetching interested users for event:', event.id);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      // First, we need to find the UUID id from jambase_events table
      // because user_jambase_events.jambase_event_id references jambase_events.id (UUID)
      const eventId = event.jambase_event_id || event.id;
      console.log('Event ID being used:', eventId, 'Type:', typeof eventId);
      
      // Get the UUID id from jambase_events table using the jambase_event_id (TEXT)
      const { data: jambaseEvent, error: jambaseError } = await supabase
        .from('jambase_events')
        .select('id')
        .eq('jambase_event_id', eventId.toString())
        .single();
        
      if (jambaseError) {
        console.error('Error finding jambase event:', jambaseError);
        // Try using the eventId directly as UUID (in case it's already the UUID id)
        const { data: interestedUserIds, error: interestsError } = await supabase
          .from('user_jambase_events')
          .select('user_id')
          .eq('jambase_event_id', eventId)
          .neq('user_id', currentUserId)
          .range(from, to);
          
        if (interestsError) {
          console.error('Error fetching interested user IDs:', interestsError);
          throw interestsError;
        }
        
        if (!interestedUserIds || interestedUserIds.length === 0) {
          setInterestedUsers([]);
          return;
        }
        
        // Get profile details
        const userIds = interestedUserIds.map(row => row.user_id);
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('id, user_id, name, avatar_url')
          .in('user_id', userIds);
          
        if (profilesError) {
          console.error('Error fetching profiles:', profilesError);
          throw profilesError;
        }
        
        setInterestedUsers(profiles || []);
        return;
      }
      
      console.log('Found jambase event UUID:', jambaseEvent.id);
      
      // Now get the user_ids using the UUID id
      const { data: interestedUserIds, error: interestsError } = await supabase
        .from('user_jambase_events')
        .select('user_id')
        .eq('jambase_event_id', jambaseEvent.id)
        .neq('user_id', currentUserId)
        .range(from, to);
        
      if (interestsError) {
        console.error('Error fetching interested user IDs:', interestsError);
        throw interestsError;
      }
      
      console.log('Found interested user IDs:', interestedUserIds);
      
      if (!interestedUserIds || interestedUserIds.length === 0) {
        setInterestedUsers([]);
        return;
      }
      
      // Then get the profile details for those users
      const userIds = interestedUserIds.map(row => row.user_id);
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_id, name, avatar_url')
        .in('user_id', userIds);
        
      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        throw profilesError;
      }
      
      console.log('Found profiles:', profiles);
      setInterestedUsers(profiles || []);
    } catch (error) {
      console.error('Error fetching interested users:', error);
      setInterestedUsers([]);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-[95vw] h-[85vh] my-4 p-0 overflow-y-auto" aria-describedby="event-details-desc">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold leading-tight mb-2">
                {event.title}
              </DialogTitle>
              {/* Interest button placed directly under event name */}
              {isUpcomingEvent && onInterestToggle && (
                <div className="mb-3">
                  <Button
                    variant={isInterested ? "default" : "outline"}
                    size="sm"
                    onClick={() => onInterestToggle(event.id, !isInterested)}
                    className={
                      isInterested 
                        ? "bg-red-500 hover:bg-red-600 text-white" 
                        : "hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                    }
                  >
                    <Heart className={`w-4 h-4 mr-1 ${isInterested ? 'fill-current' : ''}`} />
                    {isInterested ? 'Interested' : "I'm Interested"}
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
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
          </div>
        </DialogHeader>

        <div className="flex flex-col px-6 pb-28" id="event-details-desc">
          {/* Event Status Badges */}
          <div className="flex flex-wrap gap-2 mb-4">
            {isPastEvent && (
              <Badge variant="secondary" className="text-sm">
                Past Event
              </Badge>
            )}
            {isUpcomingEvent && (
              <Badge variant="default" className="text-sm">
                Upcoming
              </Badge>
            )}
            {event.ticket_available && (
              <Badge variant="outline" className="text-sm text-green-600 border-green-600">
                <Ticket className="w-3 h-3 mr-1" />
                Tickets Available
              </Badge>
            )}
          </div>

          {/* Artist and Venue Info */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Artist Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Music className="w-5 h-5" />
                Artist
              </h3>
              <div className="font-medium text-lg">{event.artist_name}</div>
              {event.genres && event.genres.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {event.genres.slice(0, 3).map((genre, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {genre}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Venue Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Venue
              </h3>
              <div className="font-medium text-lg mb-1">{event.venue_name}</div>
              <div className="text-muted-foreground text-sm">
                {getVenueAddress()}
              </div>
              {event.venue_zip && (
                <div className="text-xs text-muted-foreground mt-1">
                  ZIP: {event.venue_zip}
                </div>
              )}
            </div>
          </div>

          {/* Interested People - Only show if current user is interested */}
          {isInterested && (
            <div className="mb-6 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {interestedCount === null ? 'Loading people going…' : `${interestedCount} people are interested`}
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => { setShowInterestedUsers(true); fetchInterestedUsers(1); setUsersPage(1); }}>
                  <Users className="w-4 h-4 mr-1" />
                  Meet people going
                </Button>
                {showInterestedUsers && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Button size="sm" variant="ghost" className="px-2" onClick={() => { if (usersPage > 1) { const p = usersPage - 1; setUsersPage(p); fetchInterestedUsers(p); } }}>
                      Prev
                    </Button>
                    <span>|</span>
                    <Button size="sm" variant="ghost" className="px-2" onClick={() => { const p = usersPage + 1; setUsersPage(p); fetchInterestedUsers(p); }}>
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {showInterestedUsers && (
              <div className="mt-3 grid grid-cols-3 gap-3">
                {interestedUsers.length === 0 ? (
                  <div className="col-span-3 text-sm text-muted-foreground">No interested users yet.</div>
                ) : interestedUsers.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-2 rounded border p-2 cursor-pointer hover:bg-gray-50"
                      onClick={() => {
                        setFriendModalUser({
                          id: u.id,
                          user_id: u.user_id,
                          name: u.name,
                          username: u.name.replace(/\s+/g, '').toLowerCase(),
                          avatar_url: u.avatar_url || null,
                          bio: '',
                          created_at: new Date().toISOString()
                        });
                        setFriendModalOpen(true);
                      }}
                    >
                    <img src={u.avatar_url || '/placeholder.svg'} alt={u.name} className="w-8 h-8 rounded-full" />
                    <div className="text-sm">
                      <div className="font-medium leading-none">{u.name}</div>
                      <div className="text-xs text-muted-foreground">Tap to add friend • Chat</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Main Content: Map and Reviews */}
          <div className="grid grid-cols-2 gap-6 min-h-[400px]">
            {/* Left: Map */}
            <div className="flex flex-col">
              <h3 className="text-lg font-semibold mb-2">Location</h3>
              {event.latitude != null && event.longitude != null && !Number.isNaN(Number(event.latitude)) && !Number.isNaN(Number(event.longitude)) ? (
                <div className="flex-1 rounded-lg overflow-hidden border">
                  <EventMap
                    center={[Number(event.latitude), Number(event.longitude)]}
                    zoom={13}
                    events={[event as any]}
                    onEventClick={() => {}}
                    showCountBadge={false}
                  />
                </div>
              ) : (
                <div className="flex-1 bg-gray-100 rounded-lg flex items-center justify-center">
                  <div className="text-center text-gray-500">
                    <MapPin className="w-8 h-8 mx-auto mb-2" />
                    <p>Location not available</p>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Reviews */}
            <div className="flex flex-col">
              <h3 className="text-lg font-semibold mb-2">Reviews</h3>
              <div className="h-[400px] overflow-y-auto">
                <EventReviewsSection event={event as any} userId={currentUserId} />
              </div>
            </div>
          </div>

          {/* Bottom: Ticketing and Actions */}
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {/* Interest button moved to header; no duplicate here */}

                {/* Review Button for Past Events */}
                {isPastEvent && onReview && (
                  <Button
                    variant={hasReviewed ? "default" : "outline"}
                    size="sm"
                    onClick={() => onReview(event.id)}
                    className={
                      hasReviewed 
                        ? "bg-yellow-500 hover:bg-yellow-600 text-white" 
                        : "hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-300"
                    }
                  >
                    {hasReviewed ? (
                      <Star className="w-4 h-4 mr-1 fill-current" />
                    ) : (
                      <Star className="w-4 h-4 mr-1" />
                    )}
                    {hasReviewed ? 'Reviewed' : 'I Was There'}
                  </Button>
                )}

                {/* Event Comments Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCommentsOpen(true)}
                >
                  <MessageSquare className="w-4 h-4 mr-1" />
                  Comments
                </Button>

                {/* Price Range */}
                {event.price_range && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Price: </span>
                    <span className="font-medium">{formatPrice(event.price_range)}</span>
                  </div>
                )}
              </div>

              {/* External Links */}
              <div className="flex items-center gap-2">
                {event.ticket_urls && event.ticket_urls.length > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    asChild
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <a 
                      href={event.ticket_urls[0]} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-1"
                      onClick={() => { try { trackInteraction.click('ticket', event.id, { providerUrl: event.ticket_urls[0] }); } catch {} }}
                    >
                      <Ticket className="w-4 h-4" />
                      <span>Get Tickets</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </Button>
                )}
              </div>
            </div>
            {/* interested section rendered above under event info when interested */}
          </div>
          {/* Spacer to ensure ticketing controls are not overlapped by footers */}
          <div className="h-6" />
        </div>
        {/* Friend Profile Modal (inline) */}
        {friendModalOpen && friendModalUser && (
          <FriendProfileCard
            friend={friendModalUser}
            isOpen={friendModalOpen}
            onClose={() => setFriendModalOpen(false)}
            onStartChat={(friendUserId) => {
              const evt = new CustomEvent('start-chat', { detail: { friendUserId, eventId: event.id } });
              window.dispatchEvent(evt);
              setFriendModalOpen(false);
            }}
            onAddFriend={async (friendUserId: string) => {
              try {
                await supabase.from('friend_requests').insert({ sender_id: currentUserId, receiver_id: friendUserId });
              } catch (error) {
                console.error('Failed to send friend request:', error);
              }
            }}
          />
        )}
        <EventCommentsModal
          eventId={event.id}
          isOpen={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          currentUserId={currentUserId}
        />
      </DialogContent>
    </Dialog>
  );
}
