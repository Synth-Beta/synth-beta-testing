import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  Ticket, 
  X,
  Star,
  Heart,
  MessageSquare,
  MessageCircle,
  Users,
  Music,
  Award,
  Flag,
  MoreVertical,
  Loader2,
  ExternalLink
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
import { ArtistDetailModal } from '@/components/discover/modals/ArtistDetailModal';
import { VenueDetailModal } from '@/components/discover/modals/VenueDetailModal';
import type { JamBaseEvent } from '@/types/eventTypes';
import { supabase } from '@/integrations/supabase/client';
import { trackInteraction } from '@/services/interactionTrackingService';
import { PromotionTrackingService } from '@/services/promotionTrackingService';
import { UserEventService } from '@/services/userEventService';
import { useToast } from '@/hooks/use-toast';
import { useAccountType } from '@/hooks/useAccountType';
import { addUTMToURL, extractTicketProvider, getDaysUntilEvent, extractEventMetadata } from '@/utils/trackingHelpers';
import { SetlistService } from '@/services/setlistService';
import { VerifiedChatBadge } from '@/components/chats/VerifiedChatBadge';

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
  // Local state for isInterested to allow immediate UI updates
  const [localIsInterested, setLocalIsInterested] = useState(isInterested);
  
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
  const [artistModalOpen, setArtistModalOpen] = useState(false);
  const [venueModalOpen, setVenueModalOpen] = useState(false);
  const [eventGroups, setEventGroups] = useState<any[]>([]);
  const [verifiedChatInfo, setVerifiedChatInfo] = useState<any>(null);
  const [verifiedChatLoading, setVerifiedChatLoading] = useState(false);
  const verifiedChatLoadedRef = useRef(false);
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
    verifiedChatLoadedRef.current = false; // Reset when event changes
    
    // Load event groups when modal opens
    // NOTE: event_groups table does not exist in 3NF schema - feature is disabled
    // if (event) {
    //   loadEventGroups();
    // }
  }, [event, isCreator, isAdmin]);

  // Load verified chat when modal opens and event is available
  useEffect(() => {
    if (isOpen && actualEvent?.id && currentUserId && !verifiedChatLoadedRef.current) {
      verifiedChatLoadedRef.current = true;
      loadVerifiedChat();
    }
  }, [isOpen, actualEvent?.id, currentUserId]);

  // Sync local interest state with prop
  useEffect(() => {
    setLocalIsInterested(isInterested);
  }, [isInterested]);
  
  const loadVerifiedChat = async () => {
    if (!actualEvent?.id || !currentUserId || verifiedChatLoading) {
      return;
    }
    
    try {
      setVerifiedChatLoading(true);
      
      const { VerifiedChatService } = await import('@/services/verifiedChatService');
      
      // Get or create verified chat
      const chatId = await VerifiedChatService.getOrCreateVerifiedChat(
        'event',
        actualEvent.id,
        actualEvent.title || 'Event'
      );
      
      // Get full chat info
      const chatInfo = await VerifiedChatService.getVerifiedChatInfo('event', actualEvent.id);
      
      setVerifiedChatInfo(chatInfo);
    } catch (error) {
      console.error('Error loading verified chat:', error);
      verifiedChatLoadedRef.current = false; // Reset on error so it can retry
    } finally {
      setVerifiedChatLoading(false);
    }
  };
  
  const loadEventGroups = async () => {
    if (!actualEvent?.id) return;
    
    // Skip loading if event_groups feature is not available (3NF schema doesn't include this table)
    // This prevents unnecessary 404 errors in console
    // Event groups feature was removed during database consolidation
    return; // Disabled until event_groups table is re-implemented for 3NF schema
    
    try {
      // Get the database UUID (not Ticketmaster/JamBase ID)
      // If id is not a valid UUID, it's a Ticketmaster ID - skip loading groups
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidPattern.test(actualEvent.id)) {
        return;
      }
      
      const groups = await EventGroupService.getEventGroups(actualEvent.id);
      setEventGroups(groups);
    } catch (error) {
      // Silently handle - event groups feature not available in 3NF schema
      setEventGroups([]);
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

      trackInteraction.view('event', actualEvent.id, undefined, eventMetadata, actualEvent.id);
    }

    // Cleanup: Track modal close on unmount or when modal closes
    return () => {
      if (viewStartTime.current && actualEvent?.id) {
        const duration = Math.floor((Date.now() - viewStartTime.current) / 1000);
        
        trackInteraction.view('event', actualEvent.id, duration, {
          source: 'event_modal_close',
          duration_seconds: duration,
          interacted: hasInteracted.current
        }, actualEvent.id);
        
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

      trackInteraction.view('event', actualEvent.id, undefined, eventMetadata, actualEvent.id);
    }

    // Cleanup: Track modal close on unmount or when modal closes
    return () => {
      if (viewStartTime.current && actualEvent?.id) {
        const duration = Math.floor((Date.now() - viewStartTime.current) / 1000);
        
        trackInteraction.view('event', actualEvent.id, duration, {
          source: 'event_modal_close',
          duration_seconds: duration,
          interacted: hasInteracted.current
        }, actualEvent.id);
        
        viewStartTime.current = null;
      }
    };
  }, [isOpen, actualEvent?.id]);

  // Fetch event with foreign keys when modal opens to ensure we have artist_id and venue_id
  useEffect(() => {
    if (isOpen && event?.id) {
      const fetchEventWithForeignKeys = async () => {
        try {
          setLoading(true);
          // Query events table directly with JOINs to get artist_id, venue_id, and names
          const { data: eventData, error } = await supabase
            .from('events')
            .select('*, artists(name), venues(name)')
            .eq('id', event.id)
            .single();

          if (error) {
            console.error('Error fetching event:', error);
            // Fallback to using passed event data
            setActualEvent(event);
            setLoading(false);
            return;
          }

          if (eventData) {
            // Normalize the event data with artist/venue names from JOINs
            const normalizedEvent = {
              ...event,
              ...eventData,
              artist_id: eventData.artist_id || event.artist_id || null,
              venue_id: eventData.venue_id || event.venue_id || null,
              artist_name: (eventData.artists?.name) || event.artist_name || null,
              venue_name: (eventData.venues?.name) || event.venue_name || null,
            };

            setActualEvent(normalizedEvent);
          } else {
            // Fallback to using passed event data
            setActualEvent(event);
          }
        } catch (error) {
          console.error('Error fetching event with foreign keys:', error);
          // Fallback to using passed event data
          setActualEvent(event);
        } finally {
          setLoading(false);
        }
      };

      fetchEventWithForeignKeys();
    } else if (isOpen && event) {
      // If no event ID, just use the passed event data
      setActualEvent(event);
      setLoading(false);
    }
  }, [isOpen, event?.id]);

  // Fetch artist and venue names if still missing after initial fetch
  useEffect(() => {
    if (isOpen && actualEvent && (!actualEvent.artist_name || !actualEvent.venue_name)) {
      const fetchArtistVenueNames = async () => {
        try {
          const promises: Promise<{ type: string; data: any; error: any }>[] = [];

          // Always try to fetch using foreign keys if we have them
          if (actualEvent.artist_id && !actualEvent.artist_name) {
            promises.push(
              Promise.resolve(
                supabase
                  .from('artists')
                  .select('name')
                  .eq('id', actualEvent.artist_id)
                  .single()
              ).then(({ data, error }) => ({ type: 'artist', data, error }))
            );
          }

          if (actualEvent.venue_id && !actualEvent.venue_name) {
            promises.push(
              Promise.resolve(
                supabase
                  .from('venues')
                  .select('name')
                  .eq('id', actualEvent.venue_id)
                  .single()
              ).then(({ data, error }) => ({ type: 'venue', data, error }))
            );
          }

          // If we don't have foreign keys, try to find them by name (fallback)
          if (!actualEvent.artist_id && actualEvent.artist_name) {
            promises.push(
              Promise.resolve(
                supabase
                  .from('artists')
                  .select('id, name')
                  .ilike('name', `%${actualEvent.artist_name}%`)
                  .limit(1)
                  .maybeSingle()
              ).then(({ data, error }) => ({ type: 'artist_lookup', data, error }))
            );
          }

          if (!actualEvent.venue_id && actualEvent.venue_name) {
            promises.push(
              Promise.resolve(
                supabase
                  .from('venues')
                  .select('id, name')
                  .ilike('name', `%${actualEvent.venue_name}%`)
                  .limit(1)
                  .maybeSingle()
              ).then(({ data, error }) => ({ type: 'venue_lookup', data, error }))
            );
          }

          const results = await Promise.all(promises);
          const updates: any = {};

          results.forEach(result => {
            if (result.data && !result.error) {
              if (result.type === 'artist') {
                updates.artist_name = result.data.name;
              } else if (result.type === 'venue') {
                updates.venue_name = result.data.name;
              } else if (result.type === 'artist_lookup') {
                updates.artist_id = result.data.id;
                updates.artist_name = result.data.name;
              } else if (result.type === 'venue_lookup') {
                updates.venue_id = result.data.id;
                updates.venue_name = result.data.name;
              }
            }
          });

          if (Object.keys(updates).length > 0) {
            setActualEvent(prev => ({ ...prev, ...updates }));
          }
        } catch (error) {
          console.error('Error fetching artist/venue names:', error);
        }
      };

      fetchArtistVenueNames();
    }
  }, [isOpen, actualEvent?.id, actualEvent?.artist_id, actualEvent?.venue_id, actualEvent?.artist_name, actualEvent?.venue_name]);

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

            // Skip database update to avoid 406 errors from RLS policies
            // The setlist is already stored in local state, which is sufficient for display
            // If database persistence is needed, it should be handled server-side
            // const { error: updateError } = await supabase
            //   .from('events')
            //   .update({...})
            //   .eq('id', actualEvent.id);

            // Always update local state regardless of database update
            {
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
              
              // Skip refetch - we already updated local state
              // This avoids 406 errors from RLS policies
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
    // Fetching interested count
    const fetchInterestedCount = async () => {
      if (!actualEvent?.id) {
        // Skipping fetch - no event ID
        return;
      }
      
      try {
        const counts = await UserEventService.getInterestedCountsByEventId(
          [actualEvent.id],
          currentUserId
        );
        setInterestedCount(counts.get(actualEvent.id) ?? 0);
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

  // Click handlers for artist and venue - open modals using foreign keys
  const handleArtistClick = async () => {
    if (!actualEvent.artist_id) {
      console.warn('No artist_id available for event:', actualEvent.id);
      return;
    }

    // Fetch artist name using foreign key if not available
    let artistId = actualEvent.artist_id;
    let artistName = actualEvent.artist_name;

    if (!artistName && artistId) {
      try {
        const { data: artistData } = await supabase
          .from('artists')
          .select('id, name')
          .eq('id', artistId)
          .single();
        
        if (artistData) {
          artistName = artistData.name;
        }
      } catch (error) {
        console.error('Error fetching artist name:', error);
      }
    }

    if (artistId && artistName) {
      // 🎯 TRACK: Artist click from event modal
      trackInteraction.click('artist', artistId, {
        source: 'event_modal',
        event_id: actualEvent.id,
        artist_name: artistName,
        from_view: window.location.pathname
      }, artistId);
      
      // 🎯 TRACK: Event click (for promotion analytics)
      trackInteraction.click('event', actualEvent.id, {
        source: 'event_modal_artist_click',
        artist_name: artistName,
        venue_name: actualEvent.venue_name,
        event_date: actualEvent.event_date,
        genres: actualEvent.genres,
        price_range: actualEvent.price_range,
        days_until_event: actualEvent.event_date ? getDaysUntilEvent(actualEvent.event_date) : undefined
      }, actualEvent.id);
      
      // 🎯 TRACK: Promotion interaction if this event is promoted
      PromotionTrackingService.trackPromotionInteraction(
        actualEvent.id,
        currentUserId || '',
        'click',
        {
          source: 'event_modal_artist_click',
          artist_name: artistName,
          venue_name: actualEvent.venue_name
        }
      );
      
      // Mark interaction for duration tracking
      hasInteracted.current = true;
      
      // Open the existing ArtistDetailModal
      setArtistModalOpen(true);
    }
  };

  const handleVenueClick = async () => {
    if (!actualEvent.venue_id) {
      console.warn('No venue_id available for event:', actualEvent.id);
      return;
    }

    // Fetch venue name using foreign key if not available
    let venueId = actualEvent.venue_id;
    let venueName = actualEvent.venue_name;

    if (!venueName && venueId) {
      try {
        const { data: venueData } = await supabase
          .from('venues')
          .select('id, name')
          .eq('id', venueId)
          .single();
        
        if (venueData) {
          venueName = venueData.name;
        }
      } catch (error) {
        console.error('Error fetching venue name:', error);
      }
    }

    if (venueId && venueName) {
      // 🎯 TRACK: Venue click from event modal
      trackInteraction.click('venue', venueId, {
        source: 'event_modal',
        event_id: actualEvent.id,
        venue_name: venueName,
        venue_city: actualEvent.venue_city,
        venue_state: actualEvent.venue_state,
        from_view: window.location.pathname
      }, venueId);
      
      // 🎯 TRACK: Event click (for promotion analytics)
      trackInteraction.click('event', actualEvent.id, {
        source: 'event_modal_venue_click',
        artist_name: actualEvent.artist_name,
        venue_name: venueName,
        event_date: actualEvent.event_date,
        genres: actualEvent.genres,
        price_range: actualEvent.price_range,
        days_until_event: actualEvent.event_date ? getDaysUntilEvent(actualEvent.event_date) : undefined
      }, actualEvent.id);
      
      // 🎯 TRACK: Promotion interaction if this event is promoted
      PromotionTrackingService.trackPromotionInteraction(
        actualEvent.id,
        currentUserId || '',
        'click',
        {
          source: 'event_modal_venue_click',
          artist_name: actualEvent.artist_name,
          venue_name: venueName
        }
      );
      
      // Mark interaction for duration tracking
      hasInteracted.current = true;
      
      // Open the existing VenueDetailModal
      setVenueModalOpen(true);
    }
  };

  const fetchInterestedUsers = async (page: number) => {
    try {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      // Use the event ID directly - no need to look it up
      // This avoids 406 errors from RLS policies
      // The event.id should already be the UUID if it exists in the database
      const uuidId = actualEvent.id;
      
      let interestedUserIds: Array<{ user_id: string | null }> | null = null;
      const { data: preferredIds, error: interestsError } = await supabase
        .from('user_event_relationships')
        .select('user_id')
        .eq('event_id', uuidId)
        .eq('relationship_type', 'interested')
        .neq('user_id', currentUserId)
        .range(from, to);

      if (interestsError) {
        console.error('Error fetching interested user IDs from user_event_relationships:', interestsError);
        throw interestsError;
      }

      interestedUserIds = preferredIds || [];
      
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
        
      if (profilesError) {
        console.error('Error fetching profiles:', profilesError);
        throw profilesError;
      }
      setInterestedUsers(profiles || []);
    } catch (error) {
      console.error('❌ Error fetching interested users:', error);
      setInterestedUsers([]);
    }
  };

  if (!isOpen) return null;

  return (
    <>
    <div 
      className="fixed inset-0 z-50 bg-[#fcfcfc] overflow-y-auto overflow-x-hidden w-full max-w-full"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom, 0px)))',
        pointerEvents: 'auto'
      }}
    >
      {/* Header with X button */}
      <div className="bg-[#fcfcfc] border-b border-gray-200 w-full max-w-full">
        <div
          style={{
            paddingTop: 'var(--spacing-grouped, 24px)',
            paddingBottom: 'var(--spacing-small, 12px)',
            paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
            paddingRight: 'var(--spacing-screen-margin-x, 20px)'
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-lg font-bold leading-tight flex-1 min-w-0 pr-2 break-words" style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-h2-size, 24px)',
              fontWeight: 'var(--typography-h2-weight, 700)',
              lineHeight: 'var(--typography-h2-line-height, 1.3)',
              color: 'var(--neutral-900)'
            }}>
                {actualEvent.title}
          </h1>
          <button
            onClick={onClose}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Close"
              style={{
                width: '44px',
                height: '44px'
              }}
          >
              <X size={24} />
          </button>
        </div>
        </div>
        <div
          style={{
            paddingBottom: 'var(--spacing-small, 12px)',
            paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
            paddingRight: 'var(--spacing-screen-margin-x, 20px)'
          }}
        >
              {/* Interest button and Claim button placed directly under event name */}
          <div className="mb-2 flex gap-1.5 flex-wrap">
                {isUpcomingEvent && onInterestToggle && (
                  <Button
                    variant={localIsInterested ? "default" : "outline"}
                    type="button"
                    onClick={async () => {
                      console.log('Interest button clicked', { currentState: localIsInterested, eventId: actualEvent?.id });
                      const newInterestState = !localIsInterested;
                      
                      // Update local state immediately for instant UI feedback
                      setLocalIsInterested(newInterestState);
                      
                      // 🎯 TRACK: Interest toggle with event metadata
                      try {
                        const { getEventMetadata } = await import('@/utils/entityUuidResolver');
                        trackInteraction.interest(
                          'event',
                          actualEvent.id,
                          newInterestState,
                          {
                            ...getEventMetadata(actualEvent),
                            source: 'event_modal_interest_button'
                          },
                          actualEvent.id
                        );
                      } catch (error) {
                        console.error('Error tracking interest toggle:', error);
                      }

                      // 🎯 TRACK: Promotion interaction for interest toggle
                      if (newInterestState) {
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
                      try {
                        await onInterestToggle?.(actualEvent.id, newInterestState);
                      } catch (error) {
                        // Revert local state if there was an error
                        console.error('Error toggling interest:', error);
                        setLocalIsInterested(!newInterestState);
                      }
                    }}
                    style={{
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      paddingLeft: 'var(--spacing-small, 12px)',
                      paddingRight: 'var(--spacing-small, 12px)',
                      height: 'var(--size-button-height-sm, 28px)',
                      borderRadius: 'var(--radius-corner, 10px)',
                      border: localIsInterested ? 'none' : '2px solid var(--brand-pink-500)',
                      backgroundColor: localIsInterested ? 'var(--brand-pink-500)' : 'var(--neutral-50)',
                      color: localIsInterested ? 'var(--neutral-0)' : 'var(--brand-pink-500)',
                      transition: 'all 0.2s ease',
                      boxShadow: '0 4px 4px 0 var(--shadow-color)',
                      pointerEvents: 'auto',
                      zIndex: 10,
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      if (!localIsInterested) {
                        e.currentTarget.style.backgroundColor = 'var(--brand-pink-050)';
                        e.currentTarget.style.borderColor = 'var(--brand-pink-600)';
                      } else {
                        e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!localIsInterested) {
                        e.currentTarget.style.backgroundColor = 'var(--neutral-50)';
                        e.currentTarget.style.borderColor = 'var(--brand-pink-500)';
                      } else {
                        e.currentTarget.style.backgroundColor = 'var(--brand-pink-500)';
                      }
                    }}
                  >
                    <Heart size={16} className={`mr-1 ${localIsInterested ? 'fill-current' : ''}`} />
                    {localIsInterested ? 'Interested' : "I'm Interested"}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Report button clicked', { eventId: actualEvent?.id });
                    if (actualEvent?.id) {
                      console.log('Opening report modal, current state:', reportModalOpen);
                      setReportModalOpen(true);
                      console.log('Report modal should now be open');
                    } else {
                      toast({
                        title: 'Error',
                        description: 'Unable to report this content',
                        variant: 'destructive',
                      });
                    }
                  }}
                  style={{
                    height: 'var(--size-button-height, 36px)',
                    paddingLeft: 'var(--spacing-small, 12px)',
                    paddingRight: 'var(--spacing-small, 12px)',
                    borderRadius: 'var(--radius-corner, 10px)',
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    pointerEvents: 'auto',
                    zIndex: 100,
                    position: 'relative'
                  }}
                >
                  <Flag size={16} style={{ color: 'var(--brand-pink-500)' }} />
                  <span>Report</span>
                </Button>
              </div>
          <div
            className="flex items-center gap-1.5 mb-3 flex-wrap"
            style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              fontWeight: 'var(--typography-meta-weight, 500)',
              lineHeight: 'var(--typography-meta-line-height, 1.5)',
              color: 'var(--neutral-600)'
            }}
          >
                <Calendar size={16} style={{ color: 'var(--neutral-600)' }} />
                <span>{formatDate(actualEvent.event_date)}</span>
                <span>•</span>
                <Clock size={16} style={{ color: 'var(--neutral-600)' }} />
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
                        <Ticket size={16} style={{ color: 'var(--neutral-600)' }} />
                        <span style={{ fontWeight: 'var(--typography-meta-weight, 500)', color: 'var(--neutral-600)' }}>{priceDisplay}</span>
                      </>
                    );
                  }
                  return null;
                })()}
            </div>
            
          {/* Remove Interest Button for Past Events */}
            {isPastEvent && onInterestToggle && localIsInterested && (
              <Button
                variant="secondary"
                type="button"
                  onClick={async () => {
                  console.log('Remove interest button clicked');
                  // Track interest removal
                  try {
                    const { getEventMetadata } = await import('@/utils/entityUuidResolver');
                    trackInteraction.interest(
                      'event',
                      actualEvent.id,
                      false,
                      {
                        ...getEventMetadata(actualEvent),
                        source: 'event_modal_remove_interest',
                        action: 'remove'
                      },
                      actualEvent.id
                    );
                  } catch (error) {
                    console.error('Error tracking interest removal:', error);
                  }
                  onInterestToggle(actualEvent.id, false);
                }}
                style={{ pointerEvents: 'auto', zIndex: 10 }}
              >
                <X size={16} style={{ marginRight: 'var(--spacing-inline, 6px)' }} />
                Remove Interest
              </Button>
            )}
          </div>
      </div>

      <div className={`flex flex-col px-4 pb-28 w-full max-w-full overflow-x-hidden ${friendModalOpen ? 'pb-40' : ''}`} id="event-details-desc" style={{
        paddingTop: 'var(--spacing-small, 12px)'
      }}>
          {/* Event Status Badges */}
          <div className="flex flex-wrap gap-1.5" style={{
            marginBottom: 'var(--spacing-grouped, 24px)'
          }}>
            {isPastEvent && (
              <div
                style={{
                  height: '25px',
                  borderRadius: 'var(--radius-corner, 10px)',
                  paddingLeft: 'var(--spacing-small, 12px)',
                  paddingRight: 'var(--spacing-small, 12px)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  backgroundColor: 'var(--neutral-100)',
                  border: '2px solid var(--neutral-200)',
                  color: 'var(--neutral-900)',
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  boxShadow: '0 4px 4px 0 var(--shadow-color)'
                }}
              >
                Past Event
              </div>
            )}
            {isUpcomingEvent && (
              <div
                style={{
                  height: '25px',
                  borderRadius: 'var(--radius-corner, 10px)',
                  paddingLeft: 'var(--spacing-small, 12px)',
                  paddingRight: 'var(--spacing-small, 12px)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  backgroundColor: 'var(--brand-pink-050)',
                  border: '2px solid var(--brand-pink-500)',
                  color: 'var(--brand-pink-500)',
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  boxShadow: '0 4px 4px 0 var(--shadow-color)'
                }}
              >
                Upcoming
              </div>
            )}
            <TrendingBadge eventId={actualEvent.id} />
            <FriendsInterestedBadge eventId={actualEvent.id} />
            <PopularityIndicator interestedCount={interestedCount || 0} attendanceCount={attendanceCount || 0} />
          </div>

          {/* Artist and Venue Info - Swift-style buttons */}
          <div className="flex flex-col gap-3 mb-3">
            {/* Artist Info - Swift button style - Only render if artist_name exists (bug fix) */}
            {actualEvent.artist_name && actualEvent.artist_id && (
              <button
                onClick={handleArtistClick}
                className="w-full text-left"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.85)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  borderRadius: 'var(--radius-corner, 10px)',
                  border: '1px solid rgba(0, 0, 0, 0.1)',
                  padding: 'var(--spacing-small, 12px)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';
                }}
                title="Click to view all events for this artist"
              >
                <div 
                  className="font-semibold break-words"
                  style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-body-size, 20px)',
                    fontWeight: 'var(--typography-body-weight, 600)',
                    lineHeight: 'var(--typography-body-line-height, 1.4)',
                    color: 'var(--neutral-900)',
                    marginBottom: actualEvent.genres && actualEvent.genres.length > 0 ? '8px' : '0'
                  }}
                >
                  {actualEvent.artist_name}
                </div>
                {actualEvent.genres && actualEvent.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {actualEvent.genres.slice(0, 3).map((genre, index) => (
                      <span
                        key={index}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          height: '25px',
                          paddingLeft: 'var(--spacing-small, 12px)',
                          paddingRight: 'var(--spacing-small, 12px)',
                          borderRadius: 'var(--radius-corner, 10px)',
                          backgroundColor: 'var(--neutral-100)',
                          border: '2px solid var(--neutral-200)',
                          fontFamily: 'var(--font-family)',
                          fontSize: 'var(--typography-meta-size, 16px)',
                          fontWeight: 'var(--typography-meta-weight, 500)',
                          lineHeight: 'var(--typography-meta-line-height, 1.5)',
                          color: 'var(--neutral-900)',
                          boxShadow: '0 4px 4px 0 var(--shadow-color)'
                        }}
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            )}

            {/* Venue Info - Swift button style - Only render if venue_name exists (bug fix) */}
            {actualEvent.venue_name && actualEvent.venue_id && (
              <button
                onClick={handleVenueClick}
                className="w-full text-left"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.85)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  borderRadius: 'var(--radius-corner, 10px)',
                  border: '1px solid rgba(0, 0, 0, 0.1)',
                  padding: 'var(--spacing-small, 12px)',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.12)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.85)';
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.08)';
                }}
                title="Click to view all events at this venue"
              >
                <div 
                  className="font-semibold break-words mb-1"
                  style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-body-size, 20px)',
                    fontWeight: 'var(--typography-body-weight, 600)',
                    lineHeight: 'var(--typography-body-line-height, 1.4)',
                    color: 'var(--neutral-900)'
                  }}
                >
                  {actualEvent.venue_name}
                </div>
                <div 
                  className="break-words"
                  style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: '14px',
                    color: 'var(--neutral-600)',
                    lineHeight: '1.4'
                  }}
                >
                  {getVenueAddress()}
                </div>
                {actualEvent.venue_zip && (
                  <div 
                    style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: '13px',
                      color: 'var(--neutral-500)',
                      marginTop: '4px'
                    }}
                  >
                    ZIP: {actualEvent.venue_zip}
                  </div>
                )}
              </button>
            )}
          </div>


          {/* Reviews Section - Show artist and venue reviews for all events */}
          {/* Only render if at least one of artist_name or venue_name exists */}
          {/* Pass actual values - use empty string fallback only when absolutely necessary */}
          {/* The component should handle empty strings by skipping those queries */}
          {(actualEvent.artist_name || actualEvent.venue_name) && (
            <ArtistVenueReviews
              artistName={actualEvent.artist_name || ''}
              venueName={actualEvent.venue_name || ''}
              artistId={actualEvent.artist_id}
              venueId={actualEvent.venue_id}
            />
          )}

          {/* Social Features Tabs */}
          <div className="mt-4 space-y-3">
            <div className="flex gap-1 border-b pb-2 flex-wrap">
              <Button
                variant={showPhotos ? 'default' : 'ghost'}
                style={{
                  height: 'var(--size-button-height, 36px)',
                  paddingLeft: 'var(--spacing-small, 12px)',
                  paddingRight: 'var(--spacing-small, 12px)',
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  color: showPhotos ? 'var(--neutral-50)' : undefined
                }}
                onClick={() => {
                  // Track tab click
                  if (!showPhotos && actualEvent?.id) {
                    trackInteraction.click('view', 'event_photos_tab', { event_id: actualEvent.id, source: 'event_modal' }, actualEvent.id);
                  }
                  setShowPhotos(!showPhotos);
                  setShowGroups(false);
                  setShowBuddyFinder(false);
                }}
              >
                <span style={{ color: showPhotos ? 'var(--neutral-50)' : undefined }}>📸 Photos</span>
              </Button>
              <Button
                variant={showGroups ? 'default' : 'ghost'}
                style={{
                  height: 'var(--size-button-height, 36px)',
                  paddingLeft: 'var(--spacing-small, 12px)',
                  paddingRight: 'var(--spacing-small, 12px)',
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  whiteSpace: 'nowrap',
                  color: showGroups ? 'var(--neutral-50)' : undefined
                }}
                onClick={() => {
                  // Track tab click
                  if (!showGroups && actualEvent?.id) {
                    trackInteraction.click('view', 'event_groups_tab', { event_id: actualEvent.id, source: 'event_modal' }, actualEvent.id);
                  }
                  setShowGroups(!showGroups);
                  setShowPhotos(false);
                  setShowBuddyFinder(false);
                }}
              >
                <Users size={16} style={{ marginRight: 'var(--spacing-inline, 6px)', color: showGroups ? 'var(--neutral-50)' : undefined }} />
                <span style={{ color: showGroups ? 'var(--neutral-50)' : undefined }}>Groups ({eventGroups.length + (verifiedChatInfo?.chat_id ? 1 : 0)})</span>
              </Button>
              {isUpcomingEvent && (
                <Button
                  variant={showBuddyFinder ? 'default' : 'ghost'}
                  style={{
                    height: 'var(--size-button-height, 36px)',
                    paddingLeft: 'var(--spacing-small, 12px)',
                    paddingRight: 'var(--spacing-small, 12px)',
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    whiteSpace: 'nowrap',
                    color: showBuddyFinder ? 'var(--neutral-50)' : undefined
                  }}
                  onClick={() => {
                    // Track tab click
                    if (!showBuddyFinder && actualEvent?.id) {
                      trackInteraction.click('view', 'event_buddies_tab', { event_id: actualEvent.id, source: 'event_modal' }, actualEvent.id);
                    }
                    setShowBuddyFinder(!showBuddyFinder);
                    setShowPhotos(false);
                    setShowGroups(false);
                  }}
                >
                  <Heart size={16} style={{ marginRight: 'var(--spacing-inline, 6px)', flexShrink: 0, color: showBuddyFinder ? 'var(--neutral-50)' : undefined }} />
                  <span style={{ color: showBuddyFinder ? 'var(--neutral-50)' : undefined }}>Meet ({interestedCount !== null ? interestedCount : 0})</span>
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
              <div className="flex items-center justify-center py-24">
                <div className="text-center space-y-2">
                  <MessageCircle size={60} className="mx-auto text-muted-foreground" />
                  <h3 className="text-lg font-semibold">Coming Soon</h3>
                  <p className="text-sm text-muted-foreground">
                    Verified chats are coming soon!
                  </p>
                </div>
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
                      <Music size={24} className="text-white" />
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
                          <ExternalLink size={16} />
                        </a>
                      </Button>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-6 max-h-96 overflow-y-auto">
                  {fetchingSetlist ? (
                    <div className="text-center py-8">
                      <Music size={35} className="text-purple-500 mx-auto mb-3 animate-pulse" />
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
                                <Music size={16} />
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
                                          <div
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              height: '25px',
                                              paddingLeft: 'var(--spacing-small, 12px)',
                                              paddingRight: 'var(--spacing-small, 12px)',
                                              borderRadius: 'var(--radius-corner, 10px)',
                                              backgroundColor: 'var(--neutral-100)',
                                              border: '2px solid var(--neutral-200)',
                                              fontFamily: 'var(--font-family)',
                                              fontSize: 'var(--typography-meta-size, 16px)',
                                              fontWeight: 'var(--typography-meta-weight, 500)',
                                              lineHeight: 'var(--typography-meta-line-height, 1.5)',
                                              color: 'var(--neutral-900)',
                                              boxShadow: '0 4px 4px 0 var(--shadow-color)'
                                            }}
                                          >
                                            {song.cover.artist || song.cover} cover
                                          </div>
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
            <div
              className="mb-6 rounded-md border p-4"
              style={{
                backgroundColor: 'var(--neutral-100)',
                borderColor: 'var(--neutral-200)'
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: 'var(--neutral-200)' }}
                  >
                    <Users size={16} style={{ color: 'var(--neutral-900)' }} />
                  </div>
                  <div>
                    <h3
                      className="font-semibold"
                      style={{ color: 'var(--neutral-900)' }}
                    >
                      Event Attendance
                    </h3>
                    <p
                      className="text-sm"
                      style={{ color: 'var(--neutral-600)' }}
                    >
                      {attendanceLoading ? 'Loading...' : 
                       attendanceCount === null ? 'Loading attendance...' :
                       attendanceCount === 0 ? 'No one has marked attendance yet' :
                       `${attendanceCount} person${attendanceCount === 1 ? '' : 's'} attended this event`}
                    </p>
                  </div>
                </div>
                <Button
                  size="default"
                  variant="secondary"
                  onClick={handleAttendanceToggle}
                  disabled={attendanceLoading}
                  style={{
                    height: 'var(--size-button-height, 36px)',
                    paddingLeft: 'var(--spacing-small, 12px)',
                    paddingRight: 'var(--spacing-small, 12px)',
                    borderRadius: 'var(--radius-corner, 10px)',
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)'
                  }}
                >
                  {attendanceLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current" />
                  ) : userWasThere ? (
                    <>
                      <Users size={16} className="mr-2" />
                      I was there
                    </>
                  ) : (
                    <>
                      <Users size={16} className="mr-2" />
                      I was there
                    </>
                  )}
                </Button>
              </div>
              
              {userWasThere && (
                <div
                  className="text-sm rounded-lg p-2"
                  style={{
                    color: 'var(--neutral-600)',
                    backgroundColor: 'var(--neutral-100)'
                  }}
                >
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
                    <MapPin size={35} className="mx-auto mb-2" />
                    <p>Location not available</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Bottom: Actions - Different for past vs upcoming events */}
          <div className={`pt-3 border-t ${friendModalOpen ? 'mt-2' : 'mt-4'} w-full max-w-full overflow-x-hidden`}>
            {isPastEvent ? (
              /* Past Event Actions */
              <div className="flex flex-wrap items-center gap-2 w-full">
                  {/* I Was There Button for Past Events */}
                  {onReview && (
                    <Button
                      variant={hasReviewed ? "default" : "outline"}
                      size="sm"
                      onClick={() => onReview(actualEvent.id)}
                    className={`text-xs px-3 py-1 h-7 ${
                        hasReviewed 
                          ? "bg-yellow-500 hover:bg-yellow-600 text-white" 
                          : "hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-300"
                    }`}
                    >
                      {hasReviewed ? (
                      <Star size={16} className="mr-1 fill-current" />
                      ) : (
                      <Star size={16} className="mr-1" />
                      )}
                    <span className="text-xs">{hasReviewed ? 'Reviewed' : 'I Was There!'}</span>
                    </Button>
                  )}
              </div>
            ) : (
              /* Upcoming Event Actions */
              <div className="flex flex-col gap-2 w-full">
                {/* First Row: Comments, Price, Members */}
                <div className="flex flex-wrap items-center gap-2 w-full">
                  {/* Event Comments Button for Upcoming Events */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCommentsOpen(true)}
                    className="text-xs px-3 py-1 h-7"
                  >
                    <MessageSquare size={16} className="mr-1 flex-shrink-0" />
                    <span className="text-xs">Comments</span>
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
                        priceDisplay = `$${priceMin}-$${priceMax}`;
                      } else if (priceMin) {
                        priceDisplay = `$${priceMin}+`;
                      } else if (priceMax) {
                        priceDisplay = `$${priceMax}`;
                      }
                      
                      return (
                        <div className="text-xs flex items-center">
                          <span className="text-muted-foreground">Price: </span>
                          <span className="font-medium">{priceDisplay}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Verified Chat Badge */}
                  {currentUserId && actualEvent?.id && (
                    <div className="flex items-center flex-shrink-0">
                      <VerifiedChatBadge
                        entityType="event"
                        entityId={actualEvent.id}
                        entityName={actualEvent.title || 'Event'}
                        currentUserId={currentUserId}
                        onChatOpen={(chatId) => {
                          console.log('🟢 EventDetailsModal: Chat opened, navigating to chat:', chatId);
                          if (onNavigateToChat) {
                            onNavigateToChat(chatId);
                          } else {
                            window.location.href = `/chats?chatId=${chatId}`;
                          }
                        }}
                      />
                    </div>
                  )}
                </div>

                {/* Second Row: Ticket Links */}
                <div className="flex flex-wrap items-center gap-2 w-full">
                  {(((actualEvent as any).ticket_urls && (actualEvent as any).ticket_urls.length > 0) || 
                    (actualEvent as any).ticket_url) && (
                    <Button
                      variant="default"
                      size="sm"
                      style={{
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)',
                        backgroundColor: 'var(--brand-pink-500)',
                        color: 'var(--neutral-0)',
                        paddingLeft: 'var(--spacing-small, 12px)',
                        paddingRight: 'var(--spacing-small, 12px)',
                        height: 'var(--size-button-height-sm, 28px)',
                        borderRadius: 'var(--radius-corner, 10px)',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-inline, 6px)',
                        transition: 'all 0.2s ease',
                        boxShadow: '0 4px 4px 0 var(--shadow-color)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--brand-pink-500)';
                      }}
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
                          user_interested: localIsInterested
                        }, actualEvent.id);
                        
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
                      <Ticket size={16} style={{ flexShrink: 0, color: 'var(--neutral-50)' }} />
                      <span style={{ color: 'var(--neutral-50)' }}>Get Tickets</span>
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
                // Use RPC function to create friend request (handles all checks)
                const { error } = await supabase.rpc('create_friend_request', {
                  receiver_user_id: friendUserId
                });
                
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


        {actualEvent?.id && (
          <ReportContentModal
            open={reportModalOpen}
            onClose={() => {
              console.log('Closing report modal');
              setReportModalOpen(false);
            }}
            contentType="event"
            contentId={actualEvent.id}
            contentTitle={actualEvent.title || 'Event'}
            onReportSubmitted={() => {
              console.log('Report submitted, closing modal');
              setReportModalOpen(false);
              toast({
                title: 'Report Submitted',
                description: 'Thank you for helping keep our community safe',
              });
            }}
          />
        )}

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
            // loadEventGroups(); // Disabled - event_groups feature not available in 3NF schema
            toast({
              title: 'Group Created! 🎉',
              description: 'Your event group is ready',
            });
          }}
        />
    </div>

    {/* Artist Detail Modal */}
    {actualEvent?.artist_id && actualEvent?.artist_name && (
      <ArtistDetailModal
        isOpen={artistModalOpen}
        onClose={() => setArtistModalOpen(false)}
        artistId={actualEvent.artist_id}
        artistName={actualEvent.artist_name}
        currentUserId={currentUserId}
      />
    )}

    {/* Venue Detail Modal */}
    {actualEvent?.venue_id && actualEvent?.venue_name && (
      <VenueDetailModal
        isOpen={venueModalOpen}
        onClose={() => setVenueModalOpen(false)}
        venueId={actualEvent.venue_id}
        venueName={actualEvent.venue_name}
        currentUserId={currentUserId}
      />
    )}
    </>
  );
}
