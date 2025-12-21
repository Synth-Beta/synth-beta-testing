import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  MapPin, 
  Music, 
  ExternalLink,
  Heart,
  Star,
  Ticket
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/types/eventTypes';
import { UserEventService } from '@/services/userEventService';
import { format, parseISO } from 'date-fns';

interface EventMessageCardProps {
  eventId: string;
  customMessage?: string;
  onEventClick?: (event: JamBaseEvent) => void;
  onInterestToggle?: (eventId: string, interested: boolean) => void;
  onAttendanceToggle?: (eventId: string, attended: boolean) => void;
  currentUserId?: string;
  className?: string;
  refreshTrigger?: number; // Add this to trigger refresh when modal closes
}

export function EventMessageCard({
  eventId,
  customMessage,
  onEventClick,
  onInterestToggle,
  onAttendanceToggle,
  currentUserId,
  className = '',
  refreshTrigger
}: EventMessageCardProps) {
  const [event, setEvent] = useState<JamBaseEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInterested, setIsInterested] = useState(false);
  const [interestLoading, setInterestLoading] = useState(false);
  const [isAttended, setIsAttended] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  useEffect(() => {
    loadEvent();
  }, [eventId]);

  useEffect(() => {
    if (event && currentUserId) {
      checkInterest();
      checkAttendance();
    }
  }, [event, currentUserId]);

  // Refresh attendance status when modal closes or user changes attendance elsewhere
  useEffect(() => {
    if (refreshTrigger && event && currentUserId) {
      checkInterest();
      checkAttendance();
    }
  }, [refreshTrigger, event, currentUserId]);

  const checkInterest = async () => {
    if (!event || !currentUserId) return;
    
    try {
      console.log('🔍 checkInterest called with:', { eventId: event.id, currentUserId });
      // Use UserEventService for consistent checking with relationships table
      const interested = await UserEventService.isUserInterested(currentUserId, event.id);
      console.log('🔍 checkInterest result:', { interested });
      setIsInterested(interested);
    } catch (error) {
      console.log('🔍 checkInterest error:', error);
      setIsInterested(false);
    }
  };

  const checkAttendance = async () => {
    if (!event || !currentUserId) return;
    
    try {
      // Check attendance - use maybeSingle to handle RLS properly
      // RLS policy allows users to view their own reviews (auth.uid() = user_id)
      const { data, error } = await supabase
        .from('reviews')
        .select('was_there')
        .eq('user_id', currentUserId)
        .eq('event_id', event.id)
        .maybeSingle(); // Use maybeSingle instead of single to avoid 406 when no row exists
      
      if (error) {
        // Log but don't fail - 406 can happen with RLS if no matching row
        if (error.code === 'PGRST116' || error.code === '406') {
          // No row found or RLS blocked - user hasn't attended
          setIsAttended(false);
          return;
        }
        console.error('Error checking attendance:', error);
        setIsAttended(false);
        return;
      }
      
      // If there's a review record, check was_there status
      if (data) {
        setIsAttended(Boolean(data.was_there));
      } else {
        setIsAttended(false);
      }
    } catch (error) {
      console.error('Error checking attendance:', error);
      setIsAttended(false);
    }
  };

  const loadEvent = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (error) {
        console.error('Error loading shared event:', error);
        return;
      }

      setEvent(data);
    } catch (error) {
      console.error('Error loading shared event:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'EEE, MMM d, yyyy');
    } catch {
      return dateString;
    }
  };

  const formatTime = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'h:mm a');
    } catch {
      return '';
    }
  };

  const isPastEvent = event ? new Date(event.event_date) < new Date() : false;
  const isUpcomingEvent = event ? new Date(event.event_date) >= new Date() : false;

  if (loading) {
    return (
      <Card className={`p-4 bg-gradient-to-r from-pink-50 to-purple-50 border-pink-200 animate-pulse ${className}`}>
        <div className="space-y-3">
          <div className="h-4 bg-pink-200 rounded w-3/4"></div>
          <div className="h-3 bg-pink-200 rounded w-1/2"></div>
          <div className="h-3 bg-pink-200 rounded w-2/3"></div>
        </div>
      </Card>
    );
  }

  if (!event) {
    return (
      <Card className={`p-4 bg-gray-50 border-gray-200 ${className}`}>
        <p className="text-sm text-gray-500">Event not found</p>
      </Card>
    );
  }

  return (
    <Card 
      className={`overflow-hidden bg-gradient-to-br from-white via-pink-50/30 to-purple-50/30 border-2 border-pink-200 hover:border-pink-300 transition-all duration-200 hover:shadow-lg cursor-pointer ${className}`}
      onClick={() => onEventClick?.(event)}
    >
      {/* Header with Music Icon */}
      <div className="bg-gradient-to-r from-pink-500 to-purple-600 p-3 flex items-center gap-2">
        <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
          <Music className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-white text-xs font-medium">Shared Event</p>
        </div>
        {isUpcomingEvent && (
          <Badge className="bg-green-500 text-white text-xs">
            Upcoming
          </Badge>
        )}
        {isPastEvent && (
          <Badge variant="secondary" className="text-xs">
            Past Event
          </Badge>
        )}
      </div>

      {/* Event Details */}
      <div className="p-4 space-y-3">
        {/* Custom Message */}
        {customMessage && (
          <div className="bg-white/80 rounded-lg p-3 border border-pink-200">
            <p className="text-sm text-gray-700 italic">"{customMessage}"</p>
          </div>
        )}

        {/* Event Title & Artist */}
        <div>
          <h3 className="font-bold text-lg text-gray-900 leading-tight mb-1">
            {event.title}
          </h3>
          <p className="text-pink-600 font-semibold text-sm">
            {event.artist_name}
          </p>
        </div>

        {/* Date & Time */}
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <Calendar className="w-4 h-4 text-pink-500" />
          <span className="font-medium">{formatDate(event.event_date)}</span>
          <span className="text-gray-400">•</span>
          <span>{formatTime(event.event_date)}</span>
        </div>

        {/* Venue */}
        <div className="flex items-start gap-2 text-sm text-gray-700">
          <MapPin className="w-4 h-4 text-pink-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">{event.venue_name}</p>
            <p className="text-xs text-gray-500">
              {[event.venue_city, event.venue_state].filter(Boolean).join(', ')}
            </p>
          </div>
        </div>

        {/* Genres */}
        {event.genres && event.genres.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {event.genres.slice(0, 3).map((genre, index) => (
              <Badge key={index} variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                {genre}
              </Badge>
            ))}
            {event.genres.length > 3 && (
              <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                +{event.genres.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Price */}
        {event.price_range && (
          <div className="text-sm">
            <span className="text-gray-600">Price: </span>
            <span className="font-semibold text-gray-900">{event.price_range}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="pt-2 border-t border-pink-100 flex gap-2">
          {isUpcomingEvent && currentUserId && onInterestToggle && (
            <Button
              size="sm"
              disabled={interestLoading}
              className={`flex-1 ${isInterested ? 'bg-green-500 hover:bg-green-600' : 'bg-pink-500 hover:bg-pink-600'} text-white`}
              onClick={async (e) => {
                e.stopPropagation();
                setInterestLoading(true);
                try {
                  const newInterestState = !isInterested;
                  console.log('🔍 Interest button clicked:', { eventId: event.id, newInterestState, currentUserId });
                  await onInterestToggle(event.id, newInterestState);
                  setIsInterested(newInterestState);
                } catch (error) {
                  console.error('Error toggling interest:', error);
                } finally {
                  setInterestLoading(false);
                }
              }}
            >
              <Heart className={`w-3 h-3 mr-1 ${isInterested ? 'fill-current' : ''}`} />
              {isInterested ? 'Interested!' : 'I\'m Interested'}
            </Button>
          )}
          
          {isPastEvent && currentUserId && onAttendanceToggle && (
            <Button
              size="sm"
              disabled={attendanceLoading}
              className={`flex-1 ${isAttended ? 'bg-blue-500 hover:bg-blue-600' : 'bg-yellow-500 hover:bg-yellow-600'} text-white`}
              onClick={async (e) => {
                e.stopPropagation();
                setAttendanceLoading(true);
                try {
                  const newAttendanceState = !isAttended;
                  await onAttendanceToggle(event.id, newAttendanceState);
                  setIsAttended(newAttendanceState);
                } catch (error) {
                  console.error('Error toggling attendance:', error);
                } finally {
                  setAttendanceLoading(false);
                }
              }}
            >
              {attendanceLoading ? (
                <div className="w-3 h-3 mr-1 animate-spin rounded-full border-b-2 border-white" />
              ) : (
                <Star className={`w-3 h-3 mr-1 ${isAttended ? 'fill-current' : ''}`} />
              )}
              {attendanceLoading ? 'Updating...' : (isAttended ? 'I Was There!' : 'I Was There')}
            </Button>
          )}

          {event.ticket_urls && event.ticket_urls.length > 0 && isUpcomingEvent && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1 border-blue-300 text-blue-700 hover:bg-blue-50"
              asChild
              onClick={(e) => e.stopPropagation()}
            >
              <a 
                href={event.ticket_urls[0]} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1"
              >
                <Ticket className="w-3 h-3" />
                Tickets
                <ExternalLink className="w-3 h-3" />
              </a>
            </Button>
          )}
        </div>

        {/* View Details Link */}
        <Button
          variant="ghost"
          size="sm"
          className="w-full text-pink-600 hover:text-pink-700 hover:bg-pink-50"
          onClick={() => onEventClick?.(event)}
        >
          View Full Details →
        </Button>
      </div>
    </Card>
  );
}

