import React, { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  Ticket, 
  Heart, 
  Star, 
  Share2, 
  MessageCircle,
  Music,
  ExternalLink,
  Users
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { trackInteraction } from '@/services/interactionTrackingService';
import { getEventUuid, getEventMetadata } from '@/utils/entityUuidResolver';
import { getCompliantEventLink } from '@/utils/jambaseLinkUtils';
import { supabase } from '@/integrations/supabase/client';
import { UserEventService } from '@/services/userEventService';
import { ShareService } from '@/services/shareService';
import { useToast } from '@/hooks/use-toast';
import { replaceJambasePlaceholder, getFallbackEventImage } from '@/utils/eventImageFallbacks';
import { formatPrice } from '@/utils/currencyUtils';
import { glassCard, glassCardLight, textStyles, badge, statusBadge, animations, combineStyles } from '@/styles/glassmorphism';
import type { JamBaseEvent, JamBaseEventResponse } from '@/types/eventTypes';

// Unified event type that works with all card variants
type EventData = JamBaseEvent | JamBaseEventResponse | {
  id: string;
  title: string;
  event_date: string;
  artist_name?: string;
  venue_name?: string;
  venue_city?: string;
  venue_state?: string;
  venue_address?: string;
  venue_zip?: string;
  doors_time?: string | null;
  price_range?: string | null;
  ticket_urls?: string[] | null;
  ticket_available?: boolean;
  genres?: string[];
  images?: any[];
  description?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  is_promoted?: boolean;
  promotion_tier?: string;
  active_promotion_id?: string;
};

export interface SwiftUIEventCardProps {
  /** Event data - supports full JamBaseEvent or simplified event object */
  event: EventData;
  /** Click handler for the entire card */
  onClick?: () => void;
  /** Additional CSS classes */
  className?: string;
  /** Current user ID for interaction features */
  currentUserId?: string;
  /** Whether the user is interested in this event */
  isInterested?: boolean;
  /** Whether the user has reviewed this event */
  hasReviewed?: boolean;
  /** Handler for interest toggle */
  onInterestToggle?: (eventId: string, interested: boolean) => void;
  /** Handler for review action */
  onReview?: (eventId: string) => void;
  /** Handler for attendance toggle (past events) */
  onAttendanceToggle?: (eventId: string, attended: boolean) => void;
  /** Handler for opening interested users modal */
  onOpenInterestedUsers?: (eventId: string) => void;
  /** Handler for comments */
  onComment?: () => void;
  /** Handler for share action */
  onShare?: () => void;
  /** Show interest button (default: true) */
  showInterestButton?: boolean;
  /** Show review button for past events (default: true) */
  showReviewButton?: boolean;
  /** Show action buttons row (default: true) */
  showActions?: boolean;
  /** Show hero image (default: false for list cards) */
  showImage?: boolean;
  /** Custom message (for chat shared events) */
  customMessage?: string;
  /** Trigger refresh of attendance/interest status */
  refreshTrigger?: number;
  /** Comments count */
  commentsCount?: number;
  /** Compact mode for tighter layouts */
  compact?: boolean;
}

export const SwiftUIEventCard: React.FC<SwiftUIEventCardProps> = ({
  event,
  onClick,
  className,
  currentUserId,
  isInterested: propIsInterested,
  hasReviewed: propHasReviewed,
  onInterestToggle,
  onReview,
  onAttendanceToggle,
  onOpenInterestedUsers,
  onComment,
  onShare,
  showInterestButton = true,
  showReviewButton = true,
  showActions = true,
  showImage = false,
  customMessage,
  refreshTrigger,
  commentsCount,
  compact = false,
}) => {
  const { toast } = useToast();
  const [isInterested, setIsInterested] = useState(propIsInterested ?? false);
  const [isAttended, setIsAttended] = useState(false);
  const [interestLoading, setInterestLoading] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [interestedCount, setInterestedCount] = useState<number | null>(null);
  const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Sync external isInterested prop
  useEffect(() => {
    if (propIsInterested !== undefined) {
      setIsInterested(propIsInterested);
    }
  }, [propIsInterested]);

  // Parse dates
  const eventDate = event.event_date ? new Date(event.event_date) : null;
  const doorsTime = 'doors_time' in event && event.doors_time ? new Date(event.doors_time) : null;
  const isPastEvent = eventDate ? eventDate < new Date() : false;
  const isUpcomingEvent = eventDate ? eventDate >= new Date() : false;

  // Format functions
  const formatDate = (date: Date | null) => {
    if (!date) return 'Date TBD';
    return format(date, 'EEE, MMM d');
  };

  const formatTime = (date: Date | null) => {
    if (!date) return '';
    return format(date, 'h:mm a');
  };

  const formatFullDate = (date: Date | null) => {
    if (!date) return 'Date TBD';
    return format(date, 'EEE, MMM d, yyyy');
  };

  const getLocationString = () => {
    const parts = [
      'venue_city' in event ? event.venue_city : undefined,
      'venue_state' in event ? event.venue_state : undefined
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : '';
  };

  // Get artist name
  const artistName = 'artist_name' in event ? event.artist_name : undefined;
  const venueName = 'venue_name' in event ? event.venue_name : undefined;

  // Check interest status
  useEffect(() => {
    if (currentUserId && event.id) {
      checkInterest();
      if (isPastEvent) {
        checkAttendance();
      }
    }
  }, [event.id, currentUserId, refreshTrigger]);

  const checkInterest = async () => {
    if (!currentUserId) return;
    try {
      const interested = await UserEventService.isUserInterested(currentUserId, event.id);
      setIsInterested(interested);
    } catch {
      // Silently fail
    }
  };

  const checkAttendance = async () => {
    if (!currentUserId) return;
    try {
      const { data } = await supabase
        .from('reviews')
        .select('was_there')
        .eq('user_id', currentUserId)
        .eq('event_id', event.id)
        .maybeSingle();
      setIsAttended(Boolean(data?.was_there));
    } catch {
      setIsAttended(false);
    }
  };

  // Fetch interested count
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const counts = await UserEventService.getInterestedCountsByEventId(
          [event.id],
          currentUserId
        );
        setInterestedCount(counts.get(event.id) ?? 0);
      } catch {
        setInterestedCount(null);
      }
    };
    fetchCount();
  }, [event.id, currentUserId]);

  // Resolve hero image
  useEffect(() => {
    if (!showImage) return;
    
    (async () => {
      try {
        // Try event images first
        if ('images' in event && event.images && Array.isArray(event.images) && event.images.length > 0) {
          const bestImage = event.images.find((img: any) => 
            img.url && (img.ratio === '16_9' || (img.width && img.width > 1000))
          ) || event.images.find((img: any) => img.url);
          
          if (bestImage?.url) {
            setHeroImageUrl(replaceJambasePlaceholder(bestImage.url));
            return;
          }
        }

        // Try review photos
        const { data: reviews } = await supabase
          .from('reviews')
          .select('photos')
          .eq('event_id', event.id)
          .not('photos', 'is', null)
          .order('likes_count', { ascending: false })
          .limit(1);
        
        const photo = reviews?.[0]?.photos?.[0];
        if (photo) {
          setHeroImageUrl(replaceJambasePlaceholder(photo));
          return;
        }

        // Use fallback
        setHeroImageUrl(getFallbackEventImage(event.id));
      } catch {
        setHeroImageUrl(getFallbackEventImage(event.id));
      }
    })();
  }, [event.id, showImage]);

  // Click handlers
  const handleClick = () => {
    if (onClick) {
      try {
        const eventUuid = getEventUuid(event);
        const metadata = getEventMetadata(event);
        trackInteraction.click('event', event.id, { ...metadata, source: 'event_card' }, eventUuid || undefined);
      } catch {}
      onClick();
    }
  };

  const handleInterestToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onInterestToggle || interestLoading) return;
    
    setInterestLoading(true);
    try {
      const newState = !isInterested;
      await onInterestToggle(event.id, newState);
      setIsInterested(newState);
    } catch (error) {
      console.error('Error toggling interest:', error);
    } finally {
      setInterestLoading(false);
    }
  };

  const handleAttendanceToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onAttendanceToggle || attendanceLoading) return;
    
    setAttendanceLoading(true);
    try {
      const newState = !isAttended;
      await onAttendanceToggle(event.id, newState);
      setIsAttended(newState);
    } catch (error) {
      console.error('Error toggling attendance:', error);
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleReview = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onReview) {
      onReview(event.id);
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onShare) {
      onShare();
      return;
    }
    
    try {
      const url = await ShareService.shareEvent(event.id, event.title, 'description' in event ? event.description : undefined);
      if (navigator.share) {
        await navigator.share({ title: event.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast({ title: 'Link copied!' });
      }
    } catch {
      toast({ title: 'Failed to share', variant: 'destructive' });
    }
  };

  // Get ticket link
  const eventLink = getCompliantEventLink(event);

  // Padding based on compact mode
  const contentPadding = compact ? 12 : 16;

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full text-left overflow-hidden relative group',
        'transition-all duration-300 ease-out',
        onClick && 'cursor-pointer',
        className
      )}
      style={{
        ...glassCard,
        padding: 0,
        cursor: onClick ? 'pointer' : 'default',
        outline: 'none',
        transition: `all ${animations.standardDuration} ${animations.springTiming}`,
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-2px)';
          e.currentTarget.style.boxShadow = '0 12px 40px 0 rgba(0, 0, 0, 0.12), 0 4px 12px 0 rgba(0, 0, 0, 0.08), inset 0 1px 0 0 rgba(255, 255, 255, 0.8)';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = glassCard.boxShadow as string;
        }
      }}
      onMouseDown={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'scale(0.98)';
        }
      }}
      onMouseUp={(e) => {
        if (onClick) {
          e.currentTarget.style.transform = 'translateY(-2px)';
        }
      }}
      aria-label={`View event: ${event.title}`}
    >
      {/* Glass overlay gradient */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, transparent 50%, rgba(204, 36, 134, 0.05) 100%)',
        }}
      />

      {/* Hero Image (optional) */}
      {showImage && heroImageUrl && (
        <div 
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16 / 9',
            overflow: 'hidden',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          }}
        >
          <img
            src={heroImageUrl}
            alt={artistName && venueName 
              ? `${event.title} - ${artistName} at ${venueName}`
              : event.title 
                ? `${event.title} event photo`
                : "Event photo"}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: imageLoaded ? 1 : 0,
              transition: 'opacity 0.3s ease',
            }}
            onLoad={() => setImageLoaded(true)}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              const fallback = getFallbackEventImage(event.id);
              if (target.src !== fallback) {
                target.src = fallback;
              }
            }}
          />
          {/* Gradient overlay */}
          <div
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: '50%',
              background: 'linear-gradient(to top, rgba(0, 0, 0, 0.5) 0%, transparent 100%)',
              pointerEvents: 'none',
            }}
          />
{/* Status badges removed per user request */}
        </div>
      )}

      {/* Content */}
      <div style={{ padding: contentPadding, position: 'relative', zIndex: 1 }}>
        {/* Custom message (for shared events in chat) */}
        {customMessage && (
          <div
            style={{
              ...glassCardLight,
              padding: 12,
              marginBottom: 12,
              borderRadius: 10,
            }}
          >
            <p style={{ ...textStyles.callout, fontStyle: 'italic', color: 'var(--neutral-600)' }}>
              "{customMessage}"
            </p>
          </div>
        )}

        {/* Shared event indicator */}
        {customMessage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div
              style={{
                width: 24,
                height: 24,
                background: 'linear-gradient(135deg, #CC2486 0%, #8D1FF4 100%)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Music size={14} color="#fff" />
            </div>
            <span style={{ ...textStyles.caption, color: 'var(--brand-pink-500)' }}>Shared Event</span>
          </div>
        )}

        {/* Title */}
        <h3
          style={{
            ...textStyles.title2,
            color: 'var(--neutral-900)',
            marginBottom: artistName ? 4 : 12,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {event.title}
        </h3>

        {/* Artist name */}
        {artistName && (
          <p
            style={{
              ...textStyles.callout,
              color: 'var(--brand-pink-500)',
              marginBottom: 12,
            }}
          >
            {artistName}
          </p>
        )}

        {/* Date & Time */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {eventDate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={16} style={{ color: 'var(--brand-pink-500)', flexShrink: 0 }} />
              <span style={{ ...textStyles.subhead, color: 'var(--neutral-700)' }}>
                {compact ? formatDate(eventDate) : formatFullDate(eventDate)}
              </span>
            </div>
          )}
          {eventDate && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} style={{ color: 'var(--brand-pink-500)', flexShrink: 0 }} />
              <span style={{ ...textStyles.subhead, color: 'var(--neutral-600)' }}>
                {formatTime(eventDate)}
                {doorsTime && ` · Doors: ${formatTime(doorsTime)}`}
              </span>
            </div>
          )}
        </div>

        {/* Venue */}
        {(venueName || getLocationString()) && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              paddingTop: 12,
              borderTop: '0.5px solid rgba(0, 0, 0, 0.1)',
              marginBottom: 12,
            }}
          >
            {venueName && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin size={16} style={{ color: 'var(--brand-pink-500)', flexShrink: 0 }} />
                <span
                  style={{
                    ...textStyles.subhead,
                    color: 'var(--neutral-700)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {venueName}
                </span>
              </div>
            )}
            {getLocationString() && (
              <span
                style={{
                  ...textStyles.footnote,
                  paddingLeft: 24,
                }}
              >
                {getLocationString()}
              </span>
            )}
          </div>
        )}

        {/* Genres */}
        {'genres' in event && event.genres && event.genres.length > 0 && !compact && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {event.genres.slice(0, 2).map((genre, index) => (
              <span key={index} style={badge}>
                {genre}
              </span>
            ))}
            {event.genres.length > 2 && (
              <span style={{ ...badge, background: 'rgba(100, 100, 100, 0.1)', color: 'var(--neutral-600)' }}>
                +{event.genres.length - 2}
              </span>
            )}
          </div>
        )}

        {/* Price & Ticket Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: 12,
            borderTop: '0.5px solid rgba(0, 0, 0, 0.1)',
          }}
        >
          {'price_range' in event && event.price_range ? (
            <span style={{ ...textStyles.title3, color: 'var(--neutral-900)' }}>
              {formatPrice(event.price_range)}
            </span>
          ) : (
            <span style={{ ...textStyles.footnote }}>Price TBD</span>
          )}
          
          {eventLink && (
            <a
              href={eventLink}
              target="_blank"
              rel="nofollow noopener noreferrer"
              onClick={(e) => {
                e.stopPropagation();
                // Track ticket link click
                try {
                  const eventUuid = getEventUuid(event);
                  trackInteraction.click(
                    'ticket_link',
                    event.id,
                    {
                      source: 'swift_ui_event_card',
                      ticket_url: eventLink,
                      artist_name: artistName,
                      venue_name: venueName,
                      event_date: eventDate,
                      price_range: 'price_range' in event ? event.price_range : undefined,
                    },
                    eventUuid || undefined
                  );
                } catch (error) {
                  console.error('Error tracking ticket link click:', error);
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 16px',
                background: 'var(--brand-pink-500)',
                color: '#fff',
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                borderRadius: 10,
                textDecoration: 'none',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--brand-pink-600)';
                e.currentTarget.style.transform = 'scale(1.02)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--brand-pink-500)';
                e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              <Ticket size={24} style={{ color: '#fff' }} />
              <span style={{ 
                color: '#fff',
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)'
              }}>Tickets</span>
            </a>
          )}
        </div>

        {/* Action Buttons */}
        {showActions && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingTop: 12,
              marginTop: 12,
              borderTop: '0.5px solid rgba(0, 0, 0, 0.1)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Interest button for upcoming events */}
              {isUpcomingEvent && showInterestButton && onInterestToggle && (
                <button
                  onClick={handleInterestToggle}
                  disabled={interestLoading}
                  aria-label={isInterested ? 'Remove interest' : 'Mark as interested'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    background: isInterested ? 'var(--brand-pink-500)' : 'rgba(255, 255, 255, 0.8)',
                    color: isInterested ? '#fff' : 'var(--brand-pink-500)',
                    border: isInterested ? 'none' : '1px solid var(--brand-pink-500)',
                    borderRadius: 10,
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: interestLoading ? 0.7 : 1,
                  }}
                >
                  <Heart size={16} fill={isInterested ? '#fff' : 'none'} style={{ color: isInterested ? '#fff' : 'var(--brand-pink-500)' }} aria-hidden="true" />
                  <span style={{ 
                    color: isInterested ? '#fff' : 'var(--brand-pink-500)',
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)'
                  }}>{isInterested ? 'Interested' : 'Interested?'}</span>
                </button>
              )}

              {/* Attendance/Review button for past events */}
              {isPastEvent && showReviewButton && (onAttendanceToggle || onReview) && (
                <button
                  onClick={onAttendanceToggle ? handleAttendanceToggle : handleReview}
                  disabled={attendanceLoading}
                  aria-label={isAttended || propHasReviewed ? 'Mark as not attended' : 'Mark as attended'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 14px',
                    background: isAttended || propHasReviewed ? 'var(--status-success-500)' : 'rgba(255, 255, 255, 0.8)',
                    color: isAttended || propHasReviewed ? '#fff' : 'var(--status-success-500)',
                    border: isAttended || propHasReviewed ? 'none' : '1px solid var(--status-success-500)',
                    borderRadius: 10,
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    opacity: attendanceLoading ? 0.7 : 1,
                  }}
                >
                  <Star size={16} fill={isAttended || propHasReviewed ? '#fff' : 'none'} aria-hidden="true" />
                  <span>{isAttended || propHasReviewed ? 'I Was There!' : 'I Was There'}</span>
                </button>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {/* Comments */}
              {onComment && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onComment();
                  }}
                  aria-label={`View comments${commentsCount !== undefined ? ` (${commentsCount})` : ''}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: 8,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--neutral-600)',
                    cursor: 'pointer',
                  }}
                >
                  <MessageCircle size={18} aria-hidden="true" />
                  {commentsCount !== undefined && <span style={{ fontSize: 14 }}>{commentsCount}</span>}
                </button>
              )}

              {/* Share */}
              <button
                onClick={handleShare}
                aria-label="Share event"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: 8,
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--neutral-600)',
                  cursor: 'pointer',
                }}
              >
                <Share2 size={24} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}

        {/* Interested count */}
        {interestedCount !== null && interestedCount > 0 && onOpenInterestedUsers && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenInterestedUsers(event.id);
            }}
            aria-label={`View ${interestedCount} ${interestedCount === 1 ? 'person' : 'people'} interested in this event`}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '10px 12px',
              marginTop: 12,
              background: 'rgba(204, 36, 134, 0.05)',
              border: '1px solid rgba(204, 36, 134, 0.2)',
              borderRadius: 10,
              cursor: 'pointer',
            }}
          >
            <span style={{ ...textStyles.footnote, color: 'var(--neutral-600)' }}>
              {interestedCount} {interestedCount === 1 ? 'person' : 'people'} interested
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--brand-pink-500)' }}>
              <Users size={14} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>Meet them</span>
            </div>
          </button>
        )}
      </div>
    </button>
  );
};

export default SwiftUIEventCard;
