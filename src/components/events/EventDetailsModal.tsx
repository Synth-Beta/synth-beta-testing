import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Music
} from 'lucide-react';
import { EventCommentsModal } from './EventCommentsModal';
import { JamBaseEventCard } from './JamBaseEventCard';
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

interface EventDetailsModalProps {
  event: JamBaseEvent | null;
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
  onInterestToggle?: (eventId: string, interested: boolean) => void;
  onReview?: (eventId: string) => void;
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
  isInterested = false,
  hasReviewed = false,
  onNavigateToProfile,
  onNavigateToChat
}: EventDetailsModalProps) {
  const [actualEvent, setActualEvent] = useState<any>(event);
  const [loading, setLoading] = useState(false);

  // All hooks must be declared before any conditional returns
  const [interestedCount, setInterestedCount] = useState<number | null>(null);
  const [friendModalOpen, setFriendModalOpen] = useState(false);
  const [friendModalUser, setFriendModalUser] = useState<{ id: string; user_id: string; name: string; username: string; avatar_url?: string | null; bio?: string | null; created_at: string } | null>(null);
  const [showInterestedUsers, setShowInterestedUsers] = useState(false);
  const [interestedUsers, setInterestedUsers] = useState<Array<{ id: string; user_id: string; name: string; avatar_url?: string }>>([]);
  const [usersPage, setUsersPage] = useState(1);
  const pageSize = 3;
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [setlistExpanded, setSetlistExpanded] = useState(false);
  const [userWasThere, setUserWasThere] = useState<boolean | null>(null);
  const [attendanceCount, setAttendanceCount] = useState<number | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const { toast } = useToast();

  // Update actualEvent when event prop changes
  useEffect(() => {
    setActualEvent(event);
  }, [event]);

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

  // Fetch interested count
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

  // Early return after all hooks are declared
  if (!event || !actualEvent) return null;
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

  const loadAttendanceData = async () => {
    try {
      setAttendanceLoading(true);
      const [userAttendance, count] = await Promise.all([
        UserEventService.getUserAttendance(currentUserId, actualEvent.id),
        UserEventService.getEventAttendanceCount(actualEvent.id)
      ]);
      setUserWasThere(userAttendance);
      setAttendanceCount(count);
    } catch (error) {
      console.error('Error loading attendance data:', error);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleAttendanceToggle = async () => {
    try {
      setAttendanceLoading(true);
      const newAttendanceStatus = !userWasThere;
      await UserEventService.markUserAttendance(currentUserId, actualEvent.id, newAttendanceStatus);
      setUserWasThere(newAttendanceStatus);
      
      // Update attendance count
      const newCount = await UserEventService.getEventAttendanceCount(actualEvent.id);
      setAttendanceCount(newCount);
      
      toast({
        title: newAttendanceStatus ? "Marked as attended!" : "Removed attendance",
        description: newAttendanceStatus 
          ? "You've marked that you were at this event" 
          : "You've removed your attendance from this event",
      });
    } catch (error) {
      console.error('Error toggling attendance:', error);
      toast({
        title: "Error",
        description: "Failed to update attendance. Please try again.",
        variant: "destructive",
      });
    } finally {
      setAttendanceLoading(false);
    }
  };




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
        .select('id, user_id, name, avatar_url')
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
              {/* Interest button placed directly under event name */}
              {isUpcomingEvent && onInterestToggle && (
                <div className="mb-3">
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
                </div>
              )}
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
          </div>

          {/* Artist and Venue Info */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            {/* Artist Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                <Music className="w-5 h-5" />
                Artist
              </h3>
              <div className="font-medium text-lg">{actualEvent.artist_name}</div>
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
              <div className="font-medium text-lg mb-1">{actualEvent.venue_name}</div>
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

          {/* Setlist Accordion - Only show for past events with setlists */}
          {isPastEvent && actualEvent.setlist_enriched && actualEvent.setlist_song_count && actualEvent.setlist_song_count > 0 && (
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
                      <p className="text-sm text-purple-700">{actualEvent.setlist_song_count} songs performed</p>
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
                <AccordionContent className="px-6 pb-6">
                  {(() => {
                    const setlistData = actualEvent.setlist as any;
                    
                    // Handle different setlist data formats
                    let songs = [];
                    if (setlistData) {
                      if (Array.isArray(setlistData)) {
                        // If setlist is directly an array of songs
                        songs = setlistData;
                      } else if (setlistData.songs && Array.isArray(setlistData.songs)) {
                        // If setlist has a songs property
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
                          {actualEvent.setlist_fm_url && (
                            <p className="text-sm text-purple-600 mt-2">
                              <a href={actualEvent.setlist_fm_url} target="_blank" rel="noopener noreferrer" className="underline">
                                View on setlist.fm
                              </a>
                            </p>
                          )}
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
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(() => {
                                  // Split songs into two columns for vertical numbering
                                  const songsPerColumn = Math.ceil(setSongs.length / 2);
                                  const firstColumn = setSongs.slice(0, songsPerColumn);
                                  const secondColumn = setSongs.slice(songsPerColumn);
                                  
                                  return (
                                    <>
                                      {/* First Column */}
                                      <div className="space-y-2">
                                        {firstColumn.map((song: any, idx: number) => (
                                          <div key={idx} className="flex items-start gap-2 text-sm">
                                            <span className="text-purple-600 font-medium min-w-[24px]">
                                              {song.position || (idx + 1)}.
                                            </span>
                                            <div className="flex-1">
                                              <span className="text-gray-900">
                                                {song.name || song.title || song.song || 'Unknown Song'}
                                              </span>
                                              {song.cover && (
                                                <span className="text-xs text-purple-600 ml-2">
                                                  ({song.cover.artist || song.cover} cover)
                                                </span>
                                              )}
                                              {(song.info || song.notes) && (
                                                <p className="text-xs text-gray-600 mt-1">
                                                  {song.info || song.notes}
                                                </p>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      
                                      {/* Second Column */}
                                      {secondColumn.length > 0 && (
                                        <div className="space-y-2">
                                          {secondColumn.map((song: any, idx: number) => (
                                            <div key={idx + songsPerColumn} className="flex items-start gap-2 text-sm">
                                              <span className="text-purple-600 font-medium min-w-[24px]">
                                                {song.position || (idx + songsPerColumn + 1)}.
                                              </span>
                                              <div className="flex-1">
                                                <span className="text-gray-900">
                                                  {song.name || song.title || song.song || 'Unknown Song'}
                                                </span>
                                                {song.cover && (
                                                  <span className="text-xs text-purple-600 ml-2">
                                                    ({song.cover.artist || song.cover} cover)
                                                  </span>
                                                )}
                                                {(song.info || song.notes) && (
                                                  <p className="text-xs text-gray-600 mt-1">
                                                    {song.info || song.notes}
                                                  </p>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </div>
                            </div>
                          );
                        })}
                        
                        {setlistData.info && (
                          <div className="bg-purple-100/50 rounded-lg p-3">
                            <p className="text-sm text-purple-900">
                              <span className="font-semibold">Note:</span> {setlistData.info}
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
                      asChild
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <a 
                        href={actualEvent.ticket_urls[0]} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1"
                        onClick={() => { try { trackInteraction.click('ticket', actualEvent.id, { providerUrl: actualEvent.ticket_urls[0] }); } catch {} }}
                      >
                        <Ticket className="w-4 h-4" />
                        <span>Get Tickets</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
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
      </DialogContent>
    </Dialog>
  );
}
