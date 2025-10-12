import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
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
  Music,
  Award,
  Flag,
  MoreVertical
} from 'lucide-react';
import { EventCommentsModal } from './EventCommentsModal';
import { EventClaimModal } from './EventClaimModal';
import { ReportContentModal } from '../moderation/ReportContentModal';
import { JamBaseEventCard } from './JamBaseEventCard';
import { FriendsInterestedBadge } from '../social/FriendsInterestedBadge';
import { TrendingBadge } from '../social/TrendingBadge';
import { PopularityIndicator } from '../social/PopularityIndicator';
import { ConcertBuddySwiper } from '../matching/ConcertBuddySwiper';
import { EventPhotoGallery } from '../photos/EventPhotoGallery';
import { EventGroupCard } from '../groups/EventGroupCard';
import { CreateEventGroupModal } from '../groups/CreateEventGroupModal';
import EventGroupService from '@/services/eventGroupService';
import { FriendProfileCard } from '@/components/FriendProfileCard';
import { formatPrice } from '@/utils/currencyUtils';
import { EventReviewsSection } from '@/components/reviews/EventReviewsSection';
import { ArtistVenueReviews } from '@/components/reviews/ArtistVenueReviews';
import { EventMap } from '@/components/EventMap';
import type { JamBaseEvent } from '@/services/jambaseEventsService';
import { supabase } from '@/integrations/supabase/client';
import { trackInteraction } from '@/services/interactionTrackingService';
import { UserEventService } from '@/services/userEventService';
import { useToast } from '@/hooks/use-toast';
import { useAccountType } from '@/hooks/useAccountType';
import { addUTMToURL, extractTicketProvider, getDaysUntilEvent, extractEventMetadata } from '@/utils/trackingHelpers';

interface EventDetailsModalProps {
  event: JamBaseEvent | null;
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
  onInterestToggle?: (eventId: string, interested: boolean) => void;
  onReview?: (eventId: string) => void;
  onAttendanceChange?: (eventId: string, attended: boolean) => void;
  isInterested?: boolean;
  hasReviewed?: boolean;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
}

export function EventDetailsModal({
  event,
  currentUserId,
  isOpen,
  onClose,
  onInterestToggle,
  onReview,
  onAttendanceChange,
  isInterested = false,
  hasReviewed = false,
  onNavigateToProfile,
  onNavigateToChat
}: EventDetailsModalProps) {
  // All hooks must be called before any conditional returns
  const navigate = useNavigate();
  const [actualEvent, setActualEvent] = useState<any>(event);
  const [loading, setLoading] = useState(false);
  
  // Debug: Check if navigation handlers are provided
  const [interestedCount, setInterestedCount] = useState<number | null>(null);
  const [friendModalOpen, setFriendModalOpen] = useState(false);
  const [friendModalUser, setFriendModalUser] = useState<{ id: string; user_id: string; name: string; username: string; avatar_url?: string | null; bio?: string | null; created_at: string; gender?: string; birthday?: string } | null>(null);
  const [showInterestedUsers, setShowInterestedUsers] = useState(false);
  const [interestedUsers, setInterestedUsers] = useState<Array<{ 
    id: string; 
    user_id: string; 
    name: string; 
    avatar_url?: string; 
    bio?: string;
    created_at: string;
    last_active_at?: string;
    gender?: string; 
    birthday?: string;
    music_streaming_profile?: any;
  }>>([]);
  const [usersPage, setUsersPage] = useState(1);
  const pageSize = 5; // Show up to 5 mini profiles at once
  const [currentProfileIndex, setCurrentProfileIndex] = useState(0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [claimModalOpen, setClaimModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [setlistExpanded, setSetlistExpanded] = useState(false);
  const [showBuddyFinder, setShowBuddyFinder] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [eventGroups, setEventGroups] = useState<any[]>([]);
  const [userWasThere, setUserWasThere] = useState<boolean | null>(null);
  const [attendanceCount, setAttendanceCount] = useState<number | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [canClaim, setCanClaim] = useState(false);
  const { toast } = useToast();
  const { isCreator, isAdmin } = useAccountType();

  // 🎯 TRACKING: View duration tracking
  const viewStartTime = useRef<number | null>(null);
  const hasInteracted = useRef(false);

  // 🎯 TRACKING: View duration tracking
  const viewStartTime = useRef<number | null>(null);
  const hasInteracted = useRef(false);

  // Update actualEvent when event prop changes
  useEffect(() => {
    setActualEvent(event);
    
    // Check if event can be claimed (not already claimed, user is creator)
    if (event && (isCreator() || isAdmin())) {
      // Check if event has claimed_by_creator_id property (type-safe check)
      const eventWithClaim = event as JamBaseEvent & { claimed_by_creator_id?: string };
      setCanClaim(!eventWithClaim.claimed_by_creator_id);
    } else {
      setCanClaim(false);
    }
    
    // Load event groups when modal opens
    if (event) {
      loadEventGroups();
    }
  }, [event, isCreator, isAdmin]);
  
  const loadEventGroups = async () => {
    if (!actualEvent?.id) return;
    try {
      const groups = await EventGroupService.getEventGroups(actualEvent.id);
      setEventGroups(groups);
    } catch (error) {
      console.error('Error loading event groups:', error);
    }
  };

  // 🎯 TRACKING: Modal open/close tracking (view duration)
  useEffect(() => {
    if (isOpen && actualEvent?.id) {
      // Track modal open
      viewStartTime.current = Date.now();
      hasInteracted.current = false;
      
      const eventMetadata = extractEventMetadata(actualEvent, {
        source: 'event_modal',
        has_ticket_urls: !!(actualEvent.ticket_urls?.length),
        has_setlist: !!actualEvent.setlist,
        price_range: actualEvent.price_range,
        days_until_event: actualEvent.event_date ? getDaysUntilEvent(actualEvent.event_date) : undefined
      });

      trackInteraction.view('event', actualEvent.id, undefined, eventMetadata);
    }

    // Cleanup: Track modal close on unmount or when modal closes
    return () => {
      if (viewStartTime.current && actualEvent?.id) {
        const duration = Math.floor((Date.now() - viewStartTime.current) / 1000);
        
        trackInteraction.view('event', actualEvent.id, duration, {
          source: 'event_modal_close',
          duration_seconds: duration,
          interacted: hasInteracted.current
        });
        
        viewStartTime.current = null;
      }
    };
  }, [isOpen, actualEvent?.id]);

  // 🎯 TRACKING: Modal open/close tracking (view duration)
  useEffect(() => {
    if (isOpen && actualEvent?.id) {
      // Track modal open
      viewStartTime.current = Date.now();
      hasInteracted.current = false;
      
      const eventMetadata = extractEventMetadata(actualEvent, {
        source: 'event_modal',
        has_ticket_urls: !!(actualEvent.ticket_urls?.length),
        has_setlist: !!actualEvent.setlist,
        price_range: actualEvent.price_range,
        days_until_event: actualEvent.event_date ? getDaysUntilEvent(actualEvent.event_date) : undefined
      });

      trackInteraction.view('event', actualEvent.id, undefined, eventMetadata);
    }

    // Cleanup: Track modal close on unmount or when modal closes
    return () => {
      if (viewStartTime.current && actualEvent?.id) {
        const duration = Math.floor((Date.now() - viewStartTime.current) / 1000);
        
        trackInteraction.view('event', actualEvent.id, duration, {
          source: 'event_modal_close',
          duration_seconds: duration,
          interacted: hasInteracted.current
        });
        
        viewStartTime.current = null;
      }
    };
  }, [isOpen, actualEvent?.id]);

  // Fetch the actual event data from jambase_events table
  useEffect(() => {
    if (isOpen && event?.id) {
      setLoading(true);
      const fetchEventData = async () => {
        try {
          const { data, error } = await supabase
            .from('jambase_events')
            .select('*')
            .eq('id', event.id)
            .single();
          
          if (error) {
            console.error('Error fetching event data:', error);
            setActualEvent(event); // Fallback to passed event
          } else {
            console.log('✅ EventDetailsModal: Fetched event data from jambase_events:', data);
            console.log('🎵 EventDetailsModal: Setlist data from database:', {
              eventId: data.id,
              eventTitle: data.title,
              artistName: data.artist_name,
              venueName: data.venue_name,
              eventDate: data.event_date,
              setlist: data.setlist,
              hasSetlist: !!data.setlist,
              setlistType: typeof data.setlist,
              setlistKeys: data.setlist ? Object.keys(data.setlist) : null,
              allFields: Object.keys(data)
            });
            setActualEvent(data);
          }
        } catch (error) {
          console.error('Error fetching event data:', error);
          setActualEvent(event); // Fallback to passed event
        } finally {
          setLoading(false);
        }
      };
      
      fetchEventData();
    }
  }, [isOpen, event?.id]);

  // Load attendance data for past events
  useEffect(() => {
    if (actualEvent && isOpen) {
      const isPastEvent = new Date(actualEvent.event_date) < new Date();
      if (isPastEvent) {
        loadAttendanceData();
      }
    }
  }, [actualEvent?.id, isOpen, currentUserId]);

  // Fetch interested count using actualEvent
  useEffect(() => {
    const fetchInterestedCount = async () => {
      if (!actualEvent?.id) return;
      
      try {
        const eventId = actualEvent.jambase_event_id || actualEvent.id;
        
        // If eventId is already a UUID (from jambase_events.id), use it directly
        // Otherwise, try to find the UUID by querying jambase_events table
        let uuidId = eventId;
        
        // Check if eventId is not a UUID format (contains hyphens)
        if (!eventId.includes('-')) {
          // This is likely a jambase_event_id string, try to find the UUID
          const { data: jambaseEvent, error: jambaseError } = await supabase
            .from('jambase_events')
            .select('id')
            .eq('jambase_event_id', eventId.toString())
            .single();
            
          if (!jambaseError && jambaseEvent) {
            uuidId = jambaseEvent.id;
          }
          // If there's an error, we'll try using the original eventId as UUID
        }
        
        // Use the UUID id to get the count, excluding current user
        const { count, error } = await supabase
          .from('user_jambase_events')
          .select('*', { count: 'exact', head: true })
          .eq('jambase_event_id', uuidId)
          .neq('user_id', currentUserId);
        if (error) throw error;
        const dbCount = count ?? 0;
        setInterestedCount(dbCount);
      } catch {
        setInterestedCount(null);
      }
    };
    fetchInterestedCount();
  }, [actualEvent?.id, currentUserId]);
  
  if (!actualEvent) return null;
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

  const isPastEvent = new Date(actualEvent.event_date) < new Date();
  const isUpcomingEvent = new Date(actualEvent.event_date) >= new Date();

  const getLocationString = () => {
    const parts = [actualEvent.venue_city, actualEvent.venue_state].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Location TBD';
  };

  const getVenueAddress = () => {
    if (actualEvent.venue_address) {
      return actualEvent.venue_address;
    }
    return getLocationString();
  };

  const loadAttendanceData = async () => {
    try {
      setAttendanceLoading(true);
      
      if (!actualEvent?.id || !currentUserId) {
        setUserWasThere(false);
        setAttendanceCount(0);
        return;
      }

      // Check if current user attended
      const userAttended = await UserEventService.getUserAttendance(currentUserId, actualEvent.id);
      setUserWasThere(userAttended);

      // Get total attendance count
      const count = await UserEventService.getEventAttendanceCount(actualEvent.id);
      setAttendanceCount(count);
    } catch (error) {
      console.error('Error loading attendance data:', error);
      setUserWasThere(false);
      setAttendanceCount(0);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleAttendanceToggle = async () => {
    try {
      setAttendanceLoading(true);
      const newAttendanceStatus = !userWasThere;
      
      if (!actualEvent?.id) {
        throw new Error('Event ID is missing');
      }

      // Call the service to mark attendance
      await UserEventService.markUserAttendance(
        currentUserId,
        actualEvent.id,
        newAttendanceStatus
      );
      
      // Update local state
      setUserWasThere(newAttendanceStatus);
      
      // Update attendance count
      const newCount = await UserEventService.getEventAttendanceCount(actualEvent.id);
      setAttendanceCount(newCount);
      
      // Notify parent component that attendance changed
      if (onAttendanceChange) {
        onAttendanceChange(actualEvent.id, newAttendanceStatus);
      }
      
      toast({
        title: newAttendanceStatus ? "Marked as attended!" : "Removed attendance",
        description: newAttendanceStatus 
          ? "You've marked that you were at this event. Add a review to share your experience!"
          : "You've removed your attendance for this event"
      });

      // Reload attendance data to ensure consistency
      await loadAttendanceData();
    } catch (error) {
      console.error('Error toggling attendance:', error);
      toast({
        title: "Error",
        description: "Failed to update attendance",
        variant: "destructive"
      });
    } finally {
      setAttendanceLoading(false);
    }
  };

  // Navigation click handlers for artist and venue names
  const handleArtistClick = () => {
    if (actualEvent.artist_name) {
      // 🎯 TRACK: Artist click from event modal
      trackInteraction.click('artist', actualEvent.artist_name, {
        source: 'event_modal',
        event_id: actualEvent.id,
        artist_name: actualEvent.artist_name,
        from_view: window.location.pathname
      });
      
      // Mark interaction for duration tracking
      hasInteracted.current = true;
      
      // Close modal and navigate
      onClose();
      navigate(`/artist/${encodeURIComponent(actualEvent.artist_name)}`, {
        state: { 
          fromFeed: window.location.pathname,
          eventId: actualEvent.id // Pass the event ID so we can re-open this modal
        }
      });
    }
  };

  const handleVenueClick = () => {
    if (actualEvent.venue_name) {
      // 🎯 TRACK: Venue click from event modal
      trackInteraction.click('venue', actualEvent.venue_name, {
        source: 'event_modal',
        event_id: actualEvent.id,
        venue_name: actualEvent.venue_name,
        venue_city: actualEvent.venue_city,
        venue_state: actualEvent.venue_state,
        from_view: window.location.pathname
      });
      
      // Mark interaction for duration tracking
      hasInteracted.current = true;
      
      // Close modal and navigate
      onClose();
      navigate(`/venue/${encodeURIComponent(actualEvent.venue_name)}`, {
        state: { 
          fromFeed: window.location.pathname,
          eventId: actualEvent.id // Pass the event ID so we can re-open this modal
        }
      });
    }
  };

  const fetchInterestedUsers = async (page: number) => {
    try {
      console.log('🔍 fetchInterestedUsers called with page:', page);
      console.log('📋 Event ID:', actualEvent.id);
      console.log('📋 Event jambase_event_id:', actualEvent.jambase_event_id);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      console.log('📋 Range:', from, 'to', to);
      
      // The eventId should be the UUID id from jambase_events table
      // user_jambase_events.jambase_event_id references jambase_events.id (UUID)
      const eventId = actualEvent.jambase_event_id || actualEvent.id;
      console.log('Event ID being used:', eventId, 'Type:', typeof eventId);
      
      // If eventId is already a UUID (from jambase_events.id), use it directly
      // Otherwise, try to find the UUID by querying jambase_events table
      let uuidId = eventId;
      
      // Check if eventId is not a UUID format (contains hyphens)
      if (!eventId.includes('-')) {
        // This is likely a jambase_event_id string, try to find the UUID
        const { data: jambaseEvent, error: jambaseError } = await supabase
          .from('jambase_events')
          .select('id')
          .eq('jambase_event_id', eventId.toString())
          .single();
          
        if (jambaseError) {
          console.error('Error finding jambase event:', jambaseError);
          // Try using the eventId directly as UUID anyway
          uuidId = eventId;
        } else {
          uuidId = jambaseEvent.id;
        }
      }
      
      // Now query user_jambase_events with the correct UUID
      const { data: interestedUserIds, error: interestsError } = await supabase
        .from('user_jambase_events')
        .select('user_id')
        .eq('jambase_event_id', uuidId)
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
        .select('id, user_id, name, avatar_url, bio, created_at, last_active_at, gender, birthday, music_streaming_profile')
        .in('user_id', userIds);
        
      console.log('Found interested user IDs:', interestedUserIds);
        
      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        throw profilesError;
      }
      
      console.log('✅ Found profiles:', profiles);
      console.log('📊 Setting interestedUsers to:', profiles || []);
      setInterestedUsers(profiles || []);
    } catch (error) {
      console.error('❌ Error fetching interested users:', error);
      setInterestedUsers([]);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] my-4 p-0 overflow-y-auto" aria-describedby="event-details-desc">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <DialogTitle className="text-2xl font-bold leading-tight mb-2">
                {actualEvent.title}
              </DialogTitle>
              {/* Interest button and Claim button placed directly under event name */}
              <div className="mb-3 flex gap-2 flex-wrap">
                {isUpcomingEvent && onInterestToggle && (
                  <Button
                    variant={isInterested ? "default" : "outline"}
                    size="sm"
                    onClick={() => onInterestToggle(actualEvent.id, !isInterested)}
                    className={
                      isInterested 
                        ? "bg-red-500 hover:bg-red-600 text-white" 
                        : "hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                    }
                  >
                    <Heart className={`w-4 h-4 mr-1 ${isInterested ? 'fill-current' : ''}`} />
                    {isInterested ? 'Interested' : "I'm Interested"}
                  </Button>
                )}
                {canClaim && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setClaimModalOpen(true)}
                    className="hover:bg-purple-50 hover:text-purple-600 hover:border-purple-300"
                  >
                    <Award className="w-4 h-4 mr-1" />
                    Claim Event
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReportModalOpen(true)}
                  className="text-gray-600 hover:text-red-600"
                >
                  <Flag className="w-4 h-4 mr-1" />
                  Report
                </Button>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                <Calendar className="w-4 h-4" />
                <span>{formatDate(actualEvent.event_date)}</span>
                <span>•</span>
                <Clock className="w-4 h-4" />
                <span>{formatTime(actualEvent.event_date)}</span>
                {actualEvent.doors_time && (
                  <>
                    <span>•</span>
                    <span>Doors: {formatDoorsTime(actualEvent.doors_time)}</span>
                  </>
                )}
              </div>
            </div>
            
            {/* Remove Interest Button for Past Events - Top Right */}
            {isPastEvent && onInterestToggle && isInterested && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onInterestToggle(actualEvent.id, false)}
                className="text-gray-600 hover:text-red-600 hover:border-red-300 ml-4"
              >
                <X className="w-4 h-4 mr-1" />
                Remove Interest
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className={`flex flex-col px-6 pb-28 ${friendModalOpen ? 'pb-40' : ''}`} id="event-details-desc">
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
            {actualEvent.ticket_available && (
              <Badge variant="outline" className="text-sm text-green-600 border-green-600">
                <Ticket className="w-3 h-3 mr-1" />
                Tickets Available
              </Badge>
            )}
            <TrendingBadge eventId={actualEvent.id} />
            <FriendsInterestedBadge eventId={actualEvent.id} />
            <PopularityIndicator interestedCount={interestedCount || 0} attendanceCount={attendanceCount || 0} />
          </div>

          {/* Artist and Venue Info */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Artist Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Music className="w-5 h-5" />
                Artist
              </h3>
              <div
                className="font-medium text-lg cursor-pointer hover:text-pink-600 transition-colors"
                onClick={handleArtistClick}
                title="Click to view all events for this artist"
              >
                {actualEvent.artist_name}
              </div>
              {actualEvent.genres && actualEvent.genres.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {actualEvent.genres.slice(0, 3).map((genre, index) => (
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
              <div
                className="font-medium text-lg mb-1 cursor-pointer hover:text-pink-600 transition-colors"
                onClick={handleVenueClick}
                title="Click to view all events at this venue"
              >
                {actualEvent.venue_name}
              </div>
              <div className="text-muted-foreground text-sm">
                {getVenueAddress()}
              </div>
              {actualEvent.venue_zip && (
                <div className="text-xs text-muted-foreground mt-1">
                  ZIP: {actualEvent.venue_zip}
                </div>
              )}
            </div>
          </div>


          {/* Reviews Section - Show artist and venue reviews for all events */}
          <ArtistVenueReviews
            artistName={actualEvent.artist_name}
            venueName={actualEvent.venue_name}
            artistId={actualEvent.artist_id}
            venueId={actualEvent.venue_id}
          />

          {/* Social Features Tabs */}
          <div className="mt-6 space-y-4">
            <div className="flex gap-2 border-b pb-2">
              <Button
                variant={showPhotos ? 'default' : 'ghost'}
                size="sm"
                onClick={() => {
                  setShowPhotos(!showPhotos);
                  setShowGroups(false);
                  setShowBuddyFinder(false);
                }}
              >
                📸 Photos
              </Button>
              <Button
                variant={showGroups ? 'default' : 'ghost'}
                size="sm"
                onClick={() => {
                  setShowGroups(!showGroups);
                  setShowPhotos(false);
                  setShowBuddyFinder(false);
                }}
              >
                <Users className="h-4 w-4 mr-1" />
                Groups ({eventGroups.length})
              </Button>
              {isUpcomingEvent && (
                <Button
                  variant={showBuddyFinder ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => {
                    setShowBuddyFinder(!showBuddyFinder);
                    setShowPhotos(false);
                    setShowGroups(false);
                  }}
                >
                  <Heart className="h-4 w-4 mr-1" />
                  Find Buddies
                </Button>
              )}
            </div>

            {/* Photo Gallery */}
            {showPhotos && (
              <EventPhotoGallery
                eventId={actualEvent.id}
                eventTitle={actualEvent.title}
                canUpload={isPastEvent}
              />
            )}

            {/* Event Groups */}
            {showGroups && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Event Groups</h3>
                  <Button size="sm" onClick={() => setShowCreateGroup(true)}>
                    Create Group
                  </Button>
                </div>
                {eventGroups.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-600 text-sm">No groups yet</p>
                      <p className="text-xs text-gray-500 mt-1">Create the first group for this event!</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {eventGroups.map((group) => (
                      <EventGroupCard
                        key={group.id}
                        group={group}
                        onJoinLeave={loadEventGroups}
                        onChatClick={(chatId) => {
                          // Navigate to group chat if handler exists
                          if (onNavigateToChat) {
                            onClose(); // Close event modal first
                            onNavigateToChat(chatId);
                          } else {
                            toast({
                              title: 'Group Chat',
                              description: 'Chat navigation handler not available',
                              variant: 'destructive',
                            });
                          }
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Concert Buddy Finder */}
            {showBuddyFinder && (
              <ConcertBuddySwiper
                eventId={actualEvent.id}
                eventTitle={actualEvent.title}
                onMatchCreated={(matchedUser) => {
                  toast({
                    title: 'New Match! 🎉',
                    description: `You matched with ${matchedUser.name}!`,
                  });
                }}
              />
            )}
          </div>

          {/* Setlist Accordion - Only show for past events with setlists */}
          {(() => {
            // Check if we have setlist data (either in setlist field or setlist_enriched)
            const hasSetlistData = actualEvent.setlist && actualEvent.setlist !== null && actualEvent.setlist !== '{}';
            const hasSetlistEnriched = actualEvent.setlist_enriched === true;
            const hasSetlist = isPastEvent && (hasSetlistData || hasSetlistEnriched);
            
            return hasSetlist;
          })() && (
            <Accordion 
              type="single" 
              collapsible 
              value={setlistExpanded ? "setlist" : ""}
              onValueChange={(value) => setSetlistExpanded(value === "setlist")}
              className="mb-6"
            >
              <AccordionItem value="setlist" className="border border-purple-200 rounded-lg">
                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                  <div className="flex items-center gap-3 w-full">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center">
                      <Music className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="text-lg font-bold text-purple-900">Setlist from this Show</h3>
                      <p className="text-sm text-purple-700">
                        {(() => {
                          // Use song count from database if available, otherwise calculate from setlist data
                          if (actualEvent.setlist_song_count && actualEvent.setlist_song_count > 0) {
                            return actualEvent.setlist_song_count;
                          }
                          const setlistData = actualEvent.setlist as any;
                          return setlistData && setlistData.songs ? setlistData.songs.length : 'Multiple';
                        })()} songs performed
                      </p>
                    </div>
                    {actualEvent.setlist_fm_url && (
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                        className="border-purple-300 hover:bg-purple-100"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <a 
                          href={actualEvent.setlist_fm_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="flex items-center gap-1"
                        >
                          <span>View on setlist.fm</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </Button>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6 max-h-96 overflow-y-auto">
                  {(() => {
                    const setlistData = actualEvent.setlist as any;
                    
                    // Handle different setlist data formats
                    let songs = [];
                    if (setlistData && typeof setlistData === 'object') {
                      if (Array.isArray(setlistData)) {
                        // If setlist is directly an array of songs
                        songs = setlistData;
                      } else if (setlistData.songs && Array.isArray(setlistData.songs)) {
                        // If setlist has a songs property (most common format)
                        songs = setlistData.songs;
                      } else if (setlistData.setlist && Array.isArray(setlistData.setlist)) {
                        // If setlist has a setlist property
                        songs = setlistData.setlist;
                      }
                    }
                    
                    if (!songs || songs.length === 0) {
                      return (
                        <div className="text-center py-4">
                          <p className="text-purple-700">Setlist data is available but in an unexpected format.</p>
                          <p className="text-xs text-gray-500 mt-2">Data keys: {setlistData ? Object.keys(setlistData).join(', ') : 'none'}</p>
                        </div>
                      );
                    }
                    
                    return (
                      <div className="space-y-4">
                        {/* Group songs by set */}
                        {Array.from(new Set(songs.map((song: any) => song.setNumber || 1))).map((setNum: any) => {
                          const setSongs = songs.filter((song: any) => (song.setNumber || 1) === setNum);
                          const setName = setSongs[0]?.setName || `Set ${setNum}`;
                          
                          return (
                            <div key={setNum} className="bg-white/70 rounded-lg p-4">
                              <h4 className="font-semibold text-purple-900 mb-3 flex items-center gap-2">
                                <Music className="w-4 h-4" />
                                {setName}
                              </h4>
                              <div className="space-y-1">
                                {setSongs.map((song: any, idx: number) => (
                                  <div key={song.position || idx} className="flex items-start gap-3 py-1">
                                    <span className="text-purple-600 font-medium min-w-[28px] text-sm">
                                      {song.position || (idx + 1)}.
                                    </span>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-gray-900 text-sm font-medium">
                                          {song.name || song.title || song.song || 'Unknown Song'}
                                        </span>
                                        {song.cover && (
                                          <span className="text-xs text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                                            {song.cover.artist || song.cover} cover
                                          </span>
                                        )}
                                      </div>
                                      {(song.info || song.notes) && (
                                        <p className="text-xs text-gray-600 mt-1 italic">
                                          {song.info || song.notes}
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        
                        {setlistData.info && (
                          <div className="bg-purple-100/50 rounded-lg p-3 mt-4">
                            <p className="text-sm text-purple-900">
                              <span className="font-semibold">Note:</span> {setlistData.info}
                            </p>
                          </div>
                        )}
                        
                        {/* Tour information */}
                        {setlistData.tour && (
                          <div className="bg-blue-100/50 rounded-lg p-3 mt-4">
                            <p className="text-sm text-blue-900">
                              <span className="font-semibold">Tour:</span> {setlistData.tour}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          {/* Attendance Section for Past Events */}
          {isPastEvent && (
            <div className="mb-6 rounded-md border p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center">
                    <Users className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-blue-900">Event Attendance</h3>
                    <p className="text-sm text-blue-700">
                      {attendanceLoading ? 'Loading...' : 
                       attendanceCount === null ? 'Loading attendance...' :
                       attendanceCount === 0 ? 'No one has marked attendance yet' :
                       `${attendanceCount} person${attendanceCount === 1 ? '' : 's'} attended this event`}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={userWasThere ? "default" : "outline"}
                  onClick={handleAttendanceToggle}
                  disabled={attendanceLoading}
                  className={userWasThere 
                    ? "bg-blue-600 hover:bg-blue-700 text-white" 
                    : "border-blue-300 text-blue-700 hover:bg-blue-100"
                  }
                >
                  {attendanceLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                  ) : userWasThere ? (
                    <>
                      <Users className="w-4 h-4 mr-2" />
                      I was there
                    </>
                  ) : (
                    <>
                      <Users className="w-4 h-4 mr-2" />
                      I was there
                    </>
                  )}
                </Button>
              </div>
              
              {userWasThere && (
                <div className="text-sm text-blue-700 bg-blue-100/50 rounded-lg p-2">
                  ✅ You've marked that you attended this event
                </div>
              )}
            </div>
          )}

          {/* Interested People - Only show for upcoming events */}
          {isInterested && !isPastEvent && (
            <div className="mb-6 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {interestedCount === null ? (isPastEvent ? 'Loading people who were there…' : 'Loading people going…') : 
                 interestedCount === 0 ? (isPastEvent ? 'You were the only one there' : 'You are the only interested user') : 
                 isPastEvent ? `${interestedCount} other user${interestedCount === 1 ? '' : 's'} ${interestedCount === 1 ? 'was' : 'were'} there` :
                 `${interestedCount} other user${interestedCount === 1 ? '' : 's'} ${interestedCount === 1 ? 'is' : 'are'} interested`}
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  disabled={interestedCount === 0}
                  className="relative z-10"
                  onClick={(e) => { 
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔘 Meet people going button clicked');
                    console.log('📊 Current interestedCount:', interestedCount);
                    console.log('📊 Current showInterestedUsers:', showInterestedUsers);
                    setShowInterestedUsers(true); 
                    fetchInterestedUsers(1); 
                    setUsersPage(1); 
                  }}
                >
                  <Users className="w-4 h-4 mr-1" />
                  {isPastEvent ? 'Meet people who were there' : 'Meet people going'}
                </Button>
                {showInterestedUsers && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Button size="sm" variant="ghost" className="px-2 relative z-10" onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('🔘 Prev button clicked, current page:', usersPage);
                      if (usersPage > 1) { 
                        const p = usersPage - 1; 
                        setUsersPage(p); 
                        fetchInterestedUsers(p); 
                      } 
                    }}>
                      Prev
                    </Button>
                    <span>|</span>
                    <Button size="sm" variant="ghost" className="px-2 relative z-10" onClick={(e) => { 
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('🔘 Next button clicked, current page:', usersPage);
                      const p = usersPage + 1; 
                      setUsersPage(p); 
                      fetchInterestedUsers(p); 
                    }}>
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {showInterestedUsers && (
              <div className="mt-4">
                {interestedUsers.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">No interested users yet.</div>
                ) : (
                  <div className="space-y-4">
                    {/* Mini Profiles Carousel */}
                    <div className="flex flex-col items-center space-y-3 min-h-[200px]">
                      {interestedUsers.slice(currentProfileIndex, currentProfileIndex + pageSize).map((u, index) => (
                        <div
                          key={u.id}
                          className="flex flex-col items-center gap-3 rounded-lg border p-4 cursor-pointer hover:bg-gray-50 transition-colors w-full max-w-sm bg-white"
                          onClick={() => {
                            setFriendModalUser({
                              id: u.id,
                              user_id: u.user_id,
                              name: u.name,
                              username: u.name.replace(/\s+/g, '').toLowerCase(),
                              avatar_url: u.avatar_url || null,
                              bio: u.bio || '',
                              created_at: u.created_at,
                              gender: u.gender || undefined,
                              birthday: u.birthday || undefined
                            });
                            setFriendModalOpen(true);
                          }}
                        >
                          {/* Avatar */}
                          <img src={u.avatar_url || '/placeholder.svg'} alt={u.name} className="w-16 h-16 rounded-full" />
                          
                          {/* Name and Username */}
                          <div className="text-center">
                            <div className="font-bold text-lg">{u.name}</div>
                            <div className="text-sm text-muted-foreground">@{u.name.replace(/\s+/g, '').toLowerCase()}</div>
                          </div>
                          
                          {/* Gender and Age Display */}
                          {(u.gender || u.birthday) && (
                            <div className="flex items-center gap-2">
                              {u.gender && (
                                <Badge variant="secondary" className="text-xs">
                                  {u.gender}
                                </Badge>
                              )}
                              {u.birthday && (
                                <Badge variant="secondary" className="text-xs">
                                  {(() => {
                                    const birthDate = new Date(u.birthday);
                                    const today = new Date();
                                    let age = today.getFullYear() - birthDate.getFullYear();
                                    const monthDiff = today.getMonth() - birthDate.getMonth();
                                    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                                      age--;
                                    }
                                    return `${age} years old`;
                                  })()}
                                </Badge>
                              )}
                            </div>
                          )}
                          
                          {/* Member Since */}
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Member since {new Date(u.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                          </div>
                          
                          {/* Music Preferences */}
                          {u.music_streaming_profile && (
                            <div className="flex flex-wrap gap-1 justify-center">
                              <Badge variant="outline" className="text-xs">
                                <Music className="w-3 h-3 mr-1" />
                                Concert Lover
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                <Heart className="w-3 h-3 mr-1" />
                                Live Music
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                <Star className="w-3 h-3 mr-1" />
                                Music Enthusiast
                              </Badge>
                            </div>
                          )}
                          
                          {/* Recent Activity */}
                          {u.last_active_at && (
                            <div className="flex items-center gap-1 text-xs text-green-600">
                              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                              Active now
                            </div>
                          )}
                          
                          <div className="text-xs text-muted-foreground mt-1">Tap to view full profile</div>
                        </div>
                      ))}
                    </div>

                    {/* Navigation Controls */}
                    {interestedUsers.length > pageSize && (
                      <div className="flex justify-center items-center gap-4 mt-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentProfileIndex(Math.max(0, currentProfileIndex - pageSize))}
                          disabled={currentProfileIndex === 0}
                        >
                          Previous
                        </Button>
                        <span className="text-sm text-muted-foreground">
                          {currentProfileIndex + 1}-{Math.min(currentProfileIndex + pageSize, interestedUsers.length)} of {interestedUsers.length}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentProfileIndex(Math.min(interestedUsers.length - pageSize, currentProfileIndex + pageSize))}
                          disabled={currentProfileIndex + pageSize >= interestedUsers.length}
                        >
                          Next
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          )}

          {/* Map Section - Only show for upcoming events */}
          {isUpcomingEvent && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold mb-2">Location</h3>
              {actualEvent.latitude != null && actualEvent.longitude != null && !Number.isNaN(Number(actualEvent.latitude)) && !Number.isNaN(Number(actualEvent.longitude)) ? (
                <div className="rounded-lg overflow-hidden border h-[400px]">
                  <EventMap
                    center={[Number(actualEvent.latitude), Number(actualEvent.longitude)]}
                    zoom={13}
                    events={[event as any]}
                    onEventClick={() => {}}
                  />
                </div>
              ) : (
                <div className="bg-gray-100 rounded-lg flex items-center justify-center h-[400px]">
                  <div className="text-center text-gray-500">
                    <MapPin className="w-8 h-8 mx-auto mb-2" />
                    <p>Location not available</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom: Actions - Different for past vs upcoming events */}
          <div className={`pt-4 border-t ${friendModalOpen ? 'mt-2' : 'mt-4'}`}>
            {isPastEvent ? (
              /* Past Event Actions */
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* I Was There Button for Past Events */}
                  {onReview && (
                    <Button
                      variant={hasReviewed ? "default" : "outline"}
                      size="sm"
                      onClick={() => onReview(actualEvent.id)}
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
                      {hasReviewed ? 'Reviewed' : 'I Was There!'}
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              /* Upcoming Event Actions */
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Event Comments Button for Upcoming Events */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCommentsOpen(true)}
                  >
                    <MessageSquare className="w-4 h-4 mr-1" />
                    Comments
                  </Button>

                  {/* Price Range for Upcoming Events */}
                  {actualEvent.price_range && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Price: </span>
                      <span className="font-medium">{formatPrice(actualEvent.price_range)}</span>
                    </div>
                  )}
                </div>

                {/* External Links for Upcoming Events */}
                <div className="flex items-center gap-2">
                  {actualEvent.ticket_urls && actualEvent.ticket_urls.length > 0 && (
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() => {
                        // 🎯 TRACK: Ticket link click (CRITICAL FOR REVENUE!)
                        const ticketUrl = actualEvent.ticket_urls[0];
                        const ticketProvider = extractTicketProvider(ticketUrl);
                        const daysUntilEvent = actualEvent.event_date ? getDaysUntilEvent(actualEvent.event_date) : undefined;
                        
                        trackInteraction.click('ticket_link', actualEvent.id, {
                          ticket_url: ticketUrl,
                          ticket_provider: ticketProvider,
                          price_range: actualEvent.price_range,
                          event_date: actualEvent.event_date,
                          artist_name: actualEvent.artist_name,
                          venue_name: actualEvent.venue_name,
                          days_until_event: daysUntilEvent,
                          source: 'event_modal',
                          user_interested: isInterested
                        });
                        
                        // Mark interaction for duration tracking
                        hasInteracted.current = true;
                        
                        // Add UTM parameters for commission tracking
                        const urlWithUTM = addUTMToURL(ticketUrl, {
                          eventId: actualEvent.id,
                          userId: currentUserId,
                          source: 'event_modal'
                        });
                        
                        // Open ticket link in new tab
                        window.open(urlWithUTM, '_blank', 'noopener,noreferrer');
                      }}
                    >
                      <Ticket className="w-4 h-4" />
                      <span>Get Tickets</span>
                      <ExternalLink className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            )}
            {/* interested section rendered above under event info when interested */}
          </div>
          {/* Spacer to ensure ticketing controls are not overlapped by footers */}
          <div className={`${friendModalOpen ? 'h-20' : 'h-2'}`} />
        </div>
        {/* Friend Profile Modal (inline) */}
        {friendModalOpen && friendModalUser && (
          <FriendProfileCard
            friend={friendModalUser}
            isOpen={friendModalOpen}
            onClose={() => setFriendModalOpen(false)}
            onStartChat={(friendUserId) => {
              if (onNavigateToChat) {
                onNavigateToChat(friendUserId);
                // Close the event details modal when navigating to chat
                onClose();
              } else {
                // Fallback to custom event if navigation handler not provided
                const evt = new CustomEvent('start-chat', { detail: { friendUserId, eventId: actualEvent.id } });
                window.dispatchEvent(evt);
              }
              setFriendModalOpen(false);
            }}
            onNavigateToProfile={(userId: string) => {
              if (onNavigateToProfile) {
                onNavigateToProfile(userId);
                // Close the event details modal when navigating to profile
                onClose();
              }
            }}
            onAddFriend={async (friendUserId: string) => {
              try {
                // Check if friend request already exists
                const { data: existingRequest, error: checkError } = await supabase
                  .from('friend_requests')
                  .select('id')
                  .eq('sender_id', currentUserId)
                  .eq('receiver_id', friendUserId)
                  .single();
                
                if (existingRequest) {
                  return;
                }
                
                // Check if they're already friends
                const { data: existingFriend, error: friendCheckError } = await supabase
                  .from('friends')
                  .select('id')
                  .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
                  .or(`user1_id.eq.${friendUserId},user2_id.eq.${friendUserId}`)
                  .single();
                
                if (existingFriend) {
                  return;
                }
                
                // Send friend request
                const { error } = await supabase
                  .from('friend_requests')
                  .insert({ sender_id: currentUserId, receiver_id: friendUserId });
                
                if (error) throw error;
                console.log('✅ Friend request sent successfully');
              } catch (error) {
                console.error('❌ Failed to send friend request:', error);
              }
            }}
          />
        )}


        <EventCommentsModal
          eventId={actualEvent.id}
          isOpen={commentsOpen}
          onClose={() => setCommentsOpen(false)}
          currentUserId={currentUserId}
        />

        {canClaim && (
          <EventClaimModal
            open={claimModalOpen}
            onClose={() => setClaimModalOpen(false)}
            event={{
              id: actualEvent.id,
              title: actualEvent.title,
              artist_name: actualEvent.artist_name,
              venue_name: actualEvent.venue_name,
              event_date: actualEvent.event_date,
            }}
            onClaimSubmitted={() => {
              setClaimModalOpen(false);
              // Reload event to update claim status
              // Could trigger a refetch here if needed
            }}
          />
        )}

        <ReportContentModal
          open={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          contentType="event"
          contentId={actualEvent.id}
          contentTitle={actualEvent.title}
          onReportSubmitted={() => {
            setReportModalOpen(false);
            toast({
              title: 'Report Submitted',
              description: 'Thank you for helping keep our community safe',
            });
          }}
        />

        <CreateEventGroupModal
          open={showCreateGroup}
          onClose={() => setShowCreateGroup(false)}
          event={{
            id: actualEvent.id,
            title: actualEvent.title,
            artist_name: actualEvent.artist_name,
            event_date: actualEvent.event_date,
          }}
          onGroupCreated={(groupId) => {
            setShowCreateGroup(false);
            loadEventGroups();
            toast({
              title: 'Group Created! 🎉',
              description: 'Your event group is ready',
            });
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
