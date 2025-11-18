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
import { PromotionTrackingService } from '@/services/promotionTrackingService';
import { UserEventService } from '@/services/userEventService';
import { useToast } from '@/hooks/use-toast';
import { useAccountType } from '@/hooks/useAccountType';
import { addUTMToURL, extractTicketProvider, getDaysUntilEvent, extractEventMetadata } from '@/utils/trackingHelpers';
import { SetlistService } from '@/services/setlistService';

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
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [setlistExpanded, setSetlistExpanded] = useState(false);
  const [fetchingSetlist, setFetchingSetlist] = useState(false);
  const [showBuddyFinder, setShowBuddyFinder] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [showPhotos, setShowPhotos] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [eventGroups, setEventGroups] = useState<any[]>([]);
  const [userWasThere, setUserWasThere] = useState<boolean | null>(null);
  const [attendanceCount, setAttendanceCount] = useState<number | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const { toast } = useToast();
  const { isCreator, isAdmin, isBusiness } = useAccountType();

  // 🎯 TRACKING: View duration tracking
  const viewStartTime = useRef<number | null>(null);
  const hasInteracted = useRef(false);

  // Update actualEvent when event prop changes
  useEffect(() => {
    setActualEvent(event);
    
    // Load event groups when modal opens
    if (event) {
      loadEventGroups();
    }
  }, [event, isCreator, isAdmin]);
  
  const loadEventGroups = async () => {
    if (!actualEvent?.id) return;
    try {
      // Get the database UUID (not Ticketmaster/JamBase ID)
      // If id is not a valid UUID, it's a Ticketmaster ID - skip loading groups
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(actualEvent.id)) {
        console.log('Skipping group load - event not in database yet:', actualEvent.id);
        return;
      }
      
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
          // Validate UUID; if not UUID, try fetching by jambase_event_id
          const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          let data: any = null;
          let error: any = null;

          if (uuidPattern.test(event.id)) {
            const resp = await supabase
              .from('events')
              .select('*')
              .eq('id', event.id)
              .single();
            data = resp.data;
            error = resp.error;
          } else {
            const resp = await supabase
              .from('events')
              .select('*')
              .eq('jambase_event_id', event.id)
              .single();
            data = resp.data;
            error = resp.error;
          }
          
          if (error) {
            console.error('Error fetching event data:', error);
            setActualEvent(event); // Fallback to passed event
          } else {
            console.log('✅ EventDetailsModal: Fetched event data from jambase_events:', data);
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

  // Fetch setlist from setlist.fm API for past events that don't have a setlist
  useEffect(() => {
    if (!actualEvent || !isOpen) return;
    
    const isPastEvent = new Date(actualEvent.event_date) < new Date();
    const setlistData = actualEvent.setlist;
    const hasSetlist = setlistData && 
      setlistData !== null && 
      typeof setlistData === 'object' && 
      Object.keys(setlistData).length > 0 &&
      (Array.isArray(setlistData) || (setlistData.songs && Array.isArray(setlistData.songs)) || (setlistData.setlist && Array.isArray(setlistData.setlist)));
    const hasSetlistEnriched = actualEvent.setlist_enriched === true;
    
    // Only fetch if it's a past event and doesn't have a setlist
    if (isPastEvent && !hasSetlist && !hasSetlistEnriched && actualEvent.artist_name) {
      const fetchSetlist = async () => {
        setFetchingSetlist(true);
        try {

          // Format date for setlist.fm (DD-MM-YYYY)
          const eventDate = new Date(actualEvent.event_date);
          const formattedDate = `${String(eventDate.getDate()).padStart(2, '0')}-${String(eventDate.getMonth() + 1).padStart(2, '0')}-${eventDate.getFullYear()}`;

          // Try multiple search strategies for better results
          let setlists: any[] | null = null;
          
          // Strategy 1: Search with all parameters (most specific)
          setlists = await SetlistService.searchSetlists({
            artistName: actualEvent.artist_name,
            date: formattedDate,
            venueName: actualEvent.venue_name,
            cityName: actualEvent.venue_city,
            stateCode: actualEvent.venue_state
          });

          // Strategy 2: If no results, try without venue (artist + date only)
          if (!setlists || setlists.length === 0) {
            setlists = await SetlistService.searchSetlists({
              artistName: actualEvent.artist_name,
              date: formattedDate
            });
          }

          // Strategy 3: If still no results, try artist only (no date)
          if (!setlists || setlists.length === 0) {
            setlists = await SetlistService.searchSetlists({
              artistName: actualEvent.artist_name
            });
          }

          if (setlists && setlists.length > 0) {
            // Find the best matching setlist
            // First, try to match by exact date and venue
            let bestSetlist = setlists.find(s => {
              const setlistDate = new Date(s.eventDate);
              const eventDate = new Date(actualEvent.event_date);
              const sameDate = setlistDate.toDateString() === eventDate.toDateString();
              const venueMatch = s.venue.name.toLowerCase().includes(actualEvent.venue_name?.toLowerCase() || '') ||
                actualEvent.venue_name?.toLowerCase().includes(s.venue.name.toLowerCase());
              return sameDate && venueMatch;
            });

            // If no exact match, try date match only
            if (!bestSetlist) {
              bestSetlist = setlists.find(s => {
                const setlistDate = new Date(s.eventDate);
                const eventDate = new Date(actualEvent.event_date);
                return setlistDate.toDateString() === eventDate.toDateString();
              });
            }

            // Fallback to first result
            if (!bestSetlist) {
              bestSetlist = setlists[0];
            }

            // Update the event in the database with the setlist
            const { error: updateError } = await supabase
              .from('events')
              .update({
                setlist: bestSetlist,
                setlist_enriched: true,
                setlist_song_count: bestSetlist.songCount || 0,
                setlist_fm_id: bestSetlist.setlistFmId,
                setlist_fm_url: bestSetlist.url,
                setlist_source: 'setlist.fm',
                setlist_last_updated: new Date().toISOString()
              })
              .eq('id', actualEvent.id);

            if (updateError) {
              console.error('Error updating event with setlist:', updateError);
            } else {
              // Update local state to show the setlist immediately
              // Use functional update to ensure we don't lose other fields
              setActualEvent(prev => {
                if (!prev) return prev;
                return {
                  ...prev,
                  setlist: bestSetlist,
                  setlist_enriched: true,
                  setlist_song_count: bestSetlist.songCount || 0,
                  setlist_fm_id: bestSetlist.setlistFmId,
                  setlist_fm_url: bestSetlist.url,
                  setlist_source: 'setlist.fm',
                  setlist_last_updated: new Date().toISOString()
                };
              });
              
              // Also refetch from database after a short delay to ensure consistency
              setTimeout(async () => {
                try {
                  const { data: refreshedData, error: refreshError } = await supabase
                    .from('events')
                    .select('*')
                    .eq('id', actualEvent.id)
                    .single();
                  
                  if (!refreshError && refreshedData && refreshedData.setlist) {
                    // Only update if setlist is present to avoid overwriting with null
                    if (refreshedData.setlist) {
                      setActualEvent(refreshedData);
                    }
                  }
                } catch (refreshError) {
                  // Silently handle refresh errors
                }
              }, 1000);
            }
          }
        } catch (error) {
          console.error('Error fetching setlist from setlist.fm:', error);
        } finally {
          setFetchingSetlist(false);
        }
      };

      fetchSetlist();
    }
    // Only run when event changes or modal opens, not when setlist is updated (to prevent infinite loop)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actualEvent?.id, actualEvent?.event_date, actualEvent?.artist_name, actualEvent?.venue_name, isOpen]);

  // Fetch interested count using actualEvent
  useEffect(() => {
    console.log('🔍 fetchInterestedCount useEffect triggered', { actualEventId: actualEvent?.id, isOpen });
    const fetchInterestedCount = async () => {
      if (!actualEvent?.id) {
        console.log('🔍 fetchInterestedCount: No actualEvent.id, skipping');
        return;
      }
      
      try {
        const eventId = actualEvent.jambase_event_id || actualEvent.id;
        console.log('🔍 fetchInterestedCount - Event data:', {
          actualEventId: actualEvent.id,
          jambaseEventId: actualEvent.jambase_event_id,
          eventId,
          currentUserId
        });
        
        // If eventId is already a UUID (from jambase_events.id), use it directly
        // Otherwise, try to find the UUID by querying jambase_events table
        let uuidId = eventId;
        
        // Check if eventId is not a UUID format (contains hyphens)
        if (!eventId.includes('-')) {
          console.log('🔍 EventId is not UUID format, looking up UUID...');
          // This is likely a jambase_event_id string, try to find the UUID
          const { data: jambaseEvent, error: jambaseError } = await supabase
            .from('events')
            .select('id')
            .eq('jambase_event_id', eventId.toString())
            .single();
            
          console.log('🔍 Jambase event lookup result:', { jambaseEvent, jambaseError });
          if (!jambaseError && jambaseEvent && 'id' in jambaseEvent) {
            uuidId = jambaseEvent.id;
          }
          // If there's an error, we'll try using the original eventId as UUID
        }
        
        console.log('🔍 Using UUID for count query:', uuidId);
        
        // Use the UUID id to get the count, excluding current user
        // The user_jambase_events table stores the jambase_events.id (UUID) in jambase_event_id column
        const { count, error } = await supabase
          .from('user_jambase_events')
          .select('*', { count: 'exact', head: true })
          .eq('jambase_event_id', uuidId)
          .neq('user_id', currentUserId);
          
        console.log('🔍 Count query result:', { count, error });
        console.log('🔍 Current user ID for exclusion:', currentUserId);
        console.log('🔍 UUID being queried:', uuidId);
        
        // Also check what users are actually in the database for this event
        const { data: allUsersCheck, error: allUsersCheckError } = await supabase
          .from('user_jambase_events')
          .select('user_id')
          .eq('jambase_event_id', uuidId);
        console.log('🔍 All users check (no exclusion):', { allUsersCheck, allUsersCheckError });
        
        if (error) {
          console.error('🔍 Count query failed, trying alternative approach...');
          // Try alternative approach - get all users and count manually
          const { data: allUsers, error: allUsersError } = await supabase
            .from('user_jambase_events')
            .select('user_id')
            .eq('jambase_event_id', uuidId);
            
          if (allUsersError) {
            console.error('🔍 Alternative query also failed:', allUsersError);
            throw allUsersError;
          }
          
          console.log('🔍 All users in database:', allUsers);
          console.log('🔍 Current user ID:', currentUserId);
          const filteredUsers = allUsers?.filter(user => user && 'user_id' in user && user.user_id !== currentUserId) || [];
          console.log('🔍 Filtered users (excluding current user):', filteredUsers);
          const dbCount = filteredUsers.length;
          console.log('🔍 Alternative count result:', dbCount);
          setInterestedCount(dbCount);
        } else {
          const dbCount = count ?? 0;
          console.log('🔍 Setting interested count to:', dbCount);
          setInterestedCount(dbCount);
        }
      } catch (error) {
        console.error('🔍 Error fetching interested count:', error);
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
      
      // 🎯 TRACK: Event click (for promotion analytics)
      trackInteraction.click('event', actualEvent.id, {
        source: 'event_modal_artist_click',
        artist_name: actualEvent.artist_name,
        venue_name: actualEvent.venue_name,
        event_date: actualEvent.event_date,
        genres: actualEvent.genres,
        price_range: actualEvent.price_range,
        days_until_event: actualEvent.event_date ? getDaysUntilEvent(actualEvent.event_date) : undefined
      });
      
      // 🎯 TRACK: Promotion interaction if this event is promoted
      PromotionTrackingService.trackPromotionInteraction(
        actualEvent.id,
        currentUserId || '',
        'click',
        {
          source: 'event_modal_artist_click',
          artist_name: actualEvent.artist_name,
          venue_name: actualEvent.venue_name
        }
      );
      
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
      
      // 🎯 TRACK: Event click (for promotion analytics)
      trackInteraction.click('event', actualEvent.id, {
        source: 'event_modal_venue_click',
        artist_name: actualEvent.artist_name,
        venue_name: actualEvent.venue_name,
        event_date: actualEvent.event_date,
        genres: actualEvent.genres,
        price_range: actualEvent.price_range,
        days_until_event: actualEvent.event_date ? getDaysUntilEvent(actualEvent.event_date) : undefined
      });
      
      // 🎯 TRACK: Promotion interaction if this event is promoted
      PromotionTrackingService.trackPromotionInteraction(
        actualEvent.id,
        currentUserId || '',
        'click',
        {
          source: 'event_modal_venue_click',
          artist_name: actualEvent.artist_name,
          venue_name: actualEvent.venue_name
        }
      );
      
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
          .from('events')
          .select('id')
          .eq('jambase_event_id', eventId.toString())
          .single();
          
        if (jambaseError) {
          console.error('Error finding jambase event:', jambaseError);
          // Try using the eventId directly as UUID anyway
          uuidId = eventId;
        } else if (jambaseEvent && 'id' in jambaseEvent) {
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
      const userIds = interestedUserIds?.map(row => row && 'user_id' in row ? row.user_id : null).filter(Boolean) || [];
      const { data: profiles, error: profilesError } = await supabase
        .from('users')
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
                    onClick={async () => {
                      // 🎯 TRACK: Promotion interaction for interest toggle
                      if (!isInterested) {
                        // User is expressing interest - this is a conversion
                        PromotionTrackingService.trackPromotionInteraction(
                          actualEvent.id,
                          currentUserId || '',
                          'conversion',
                          {
                            source: 'event_modal_interest_button',
                            action: 'interested'
                          }
                        );
                      }
                      
                      // Call the original handler
                      onInterestToggle(actualEvent.id, !isInterested);
                    }}
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
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 flex-wrap">
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
                {(() => {
                  const event = actualEvent as any;
                  const priceRange = event?.price_range;
                  const priceMin = event?.ticket_price_min ?? event?.price_min;
                  const priceMax = event?.ticket_price_max ?? event?.price_max;
                  
                  if (priceRange || priceMin || priceMax) {
                    let priceDisplay = '';
                    if (priceRange) {
                      priceDisplay = formatPrice(priceRange);
                    } else if (priceMin && priceMax) {
                      priceDisplay = `$${priceMin} - $${priceMax}`;
                    } else if (priceMin) {
                      priceDisplay = `$${priceMin}+`;
                    } else if (priceMax) {
                      priceDisplay = `Up to $${priceMax}`;
                    }
                    
                    return (
                      <>
                        <span>•</span>
                        <Ticket className="w-4 h-4" />
                        <span className="font-medium text-gray-900">{priceDisplay}</span>
                      </>
                    );
                  }
                  return null;
                })()}
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
                  Meet People Going ({interestedCount !== null ? interestedCount : 0})
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
                {...(interestedCount !== null && { interestedCount })}
                onMatchCreated={(matchedUser) => {
                  toast({
                    title: 'New Match! 🎉',
                    description: `You matched with ${matchedUser.name}!`,
                  });
                }}
                onNavigateToProfile={(userId) => {
                  if (onNavigateToProfile) {
                    onNavigateToProfile(userId);
                    onClose();
                  }
                }}
              />
            )}
          </div>

          {/* Setlist Accordion - Show for past events with setlists or while fetching */}
          {(() => {
            // Check if we have setlist data (either in setlist field or setlist_enriched)
            const setlistData = actualEvent?.setlist;
            const hasSetlistData = setlistData && 
              setlistData !== null && 
              typeof setlistData === 'object' && 
              Object.keys(setlistData).length > 0 &&
              (Array.isArray(setlistData) || (setlistData.songs && Array.isArray(setlistData.songs)) || (setlistData.setlist && Array.isArray(setlistData.setlist)));
            const hasSetlistEnriched = actualEvent?.setlist_enriched === true;
            const hasSetlistSongCount = actualEvent?.setlist_song_count && actualEvent.setlist_song_count > 0;
            const hasSetlist = isPastEvent && (hasSetlistData || hasSetlistEnriched || hasSetlistSongCount || fetchingSetlist);
            
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
                  {fetchingSetlist ? (
                    <div className="text-center py-8">
                      <Music className="w-8 h-8 text-purple-500 mx-auto mb-3 animate-pulse" />
                      <p className="text-purple-700">Loading setlist from setlist.fm...</p>
                    </div>
                  ) : (() => {
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
                          <p className="text-xs text-gray-500 mt-1">Setlist type: {typeof setlistData}</p>
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
                  {(() => {
                    const event = actualEvent as any;
                    const priceRange = event?.price_range;
                    const priceMin = event?.ticket_price_min ?? event?.price_min;
                    const priceMax = event?.ticket_price_max ?? event?.price_max;
                    
                    if (priceRange || priceMin || priceMax) {
                      let priceDisplay = '';
                      if (priceRange) {
                        priceDisplay = formatPrice(priceRange);
                      } else if (priceMin && priceMax) {
                        priceDisplay = `$${priceMin} - $${priceMax}`;
                      } else if (priceMin) {
                        priceDisplay = `$${priceMin}+`;
                      } else if (priceMax) {
                        priceDisplay = `Up to $${priceMax}`;
                      }
                      
                      return (
                        <div className="text-sm">
                          <span className="text-muted-foreground">Price: </span>
                          <span className="font-medium">{priceDisplay}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                {/* External Links for Upcoming Events */}
                <div className="flex items-center gap-2">
                  {(((actualEvent as any).ticket_urls && (actualEvent as any).ticket_urls.length > 0) || 
                    (actualEvent as any).ticket_url) && (
                    <Button
                      variant="default"
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                      onClick={() => {
                        // 🎯 TRACK: Ticket link click (CRITICAL FOR REVENUE!)
                        const ticketUrl = (actualEvent as any).ticket_urls?.[0] || (actualEvent as any).ticket_url;
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
                        
                        // 🎯 TRACK: Promotion interaction for ticket click
                        PromotionTrackingService.trackPromotionInteraction(
                          actualEvent.id,
                          currentUserId || '',
                          'click',
                          {
                            source: 'event_modal_ticket_click',
                            ticket_url: ticketUrl,
                            ticket_provider: ticketProvider
                          }
                        );
                        
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
