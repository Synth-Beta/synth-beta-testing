import React, { useMemo } from 'react';
import { format } from 'date-fns';
import { ArrowUpRight, EyeOff, Flame, Heart, MapPin, MessageCircle, MoreHorizontal, Send, Star, Ticket, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { replaceJambasePlaceholder, getFallbackEventImage, getSynthPlaceholderImage } from '@/utils/eventImageFallbacks';
import { trackInteraction } from '@/services/interactionTrackingService';
import { getEventUuid, getEventMetadata } from '@/utils/entityUuidResolver';
import { getCompliantEventLink } from '@/utils/jambaseLinkUtils';
import type { EventReason } from '../CompactEventCard';
import { findPick5Band, pick5BandUrl, PICK5_LOGO_SRC } from './pick5';
import type { ReviewHighlight } from './useReviewHighlights';

const POPULAR_THRESHOLD = 5;

const REASON_LABELS: Record<EventReason, string> = {
  recommended: 'For you',
  trending: 'Trending',
  friend_interested: 'Friends',
  following: 'Following',
  bucket_list: 'Bucket list',
  pick5: 'Pick5 partner',
};

export interface CardReviewHighlight extends ReviewHighlight {
  scope: 'artist' | 'venue';
  name?: string;
}

export interface ThreadEventCardProps {
  event: {
    id: string;
    title: string;
    artist_name?: string;
    venue_name?: string;
    event_date?: string;
    venue_city?: string;
    venue_state?: string;
    image_url?: string;
    poster_image_url?: string;
  };
  reason?: EventReason;
  reasonLabel?: string;
  interestedCount?: number;
  friendsInterestedCount?: number;
  distanceLabel?: string;
  isInterested?: boolean;
  reviewHighlight?: CardReviewHighlight;
  onInterestClick?: (e: React.MouseEvent) => void;
  onShareClick?: (e: React.MouseEvent) => void;
  onJoinChatClick?: (e: React.MouseEvent) => void;
  onHideArtist?: () => void;
  onClick?: () => void;
}

export const ThreadEventCard: React.FC<ThreadEventCardProps> = ({
  event,
  reason,
  reasonLabel,
  interestedCount = 0,
  friendsInterestedCount = 0,
  distanceLabel,
  isInterested = false,
  reviewHighlight,
  onInterestClick,
  onShareClick,
  onJoinChatClick,
  onHideArtist,
  onClick,
}) => {
  const imageUrl = useMemo(() => {
    const raw = event.poster_image_url || event.image_url;
    return (raw ? replaceJambasePlaceholder(raw) : null) || getFallbackEventImage(event.id);
  }, [event.id, event.image_url, event.poster_image_url]);

  const date = event.event_date ? new Date(event.event_date) : null;
  const place = [event.venue_city, event.venue_state].filter(Boolean).join(', ');
  const pick5Band = findPick5Band(event.artist_name);
  const ticketLink = getCompliantEventLink(event);
  const isPopular = interestedCount >= POPULAR_THRESHOLD;
  const showArtistLine = !!event.artist_name && !event.title.toLowerCase().startsWith(event.artist_name.toLowerCase());

  const track = (fn: () => void) => {
    try {
      fn();
    } catch (error) {
      console.error('Error tracking event card interaction:', error);
    }
  };

  const handleOpen = () => {
    if (!onClick) return;
    track(() =>
      trackInteraction.click(
        'event',
        event.id,
        { ...getEventMetadata(event), source: 'feed', reason: reason || 'unknown' },
        getEventUuid(event) || undefined
      )
    );
    onClick();
  };

  const handleInterest = (e: React.MouseEvent) => {
    e.stopPropagation();
    track(() =>
      trackInteraction.interest('event', event.id, !isInterested, { source: 'event_card', reason: reason || 'unknown' }, getEventUuid(event) || undefined)
    );
    onInterestClick?.(e);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    track(() => trackInteraction.share('event', event.id, 'native', { source: 'event_card' }, getEventUuid(event) || undefined));
    onShareClick?.(e);
  };

  const handleChat = (e: React.MouseEvent) => {
    e.stopPropagation();
    track(() =>
      trackInteraction.click('event', event.id, { source: 'event_card', action: 'join_chat', reason: reason || 'unknown' }, getEventUuid(event) || undefined)
    );
    onJoinChatClick?.(e);
  };

  const handlePick5Click = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pick5Band) track(() => trackInteraction.click('event', event.id, { source: 'event_card', partner: 'pickfive', band: pick5Band.slug }));
  };

  const handleImageError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const generic = getFallbackEventImage(event.id);
    if (img.src.includes('Synth_Placeholder')) img.onerror = null;
    else if (!img.src.includes('Generic') && img.src !== generic) img.src = generic;
    else img.src = getSynthPlaceholderImage();
  };

  const card = (
    <article
      className={cn('thread-card', pick5Band && 'thread-card--pick5')}
      onClick={handleOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleOpen();
        }
      }}
      tabIndex={0}
      role="button"
      aria-label={`View event: ${event.title}`}
    >
      {pick5Band && (
        <a
          href={pick5BandUrl(pick5Band.slug)}
          target="_blank"
          rel="noopener noreferrer"
          className="thread-card__partner"
          onClick={handlePick5Click}
          aria-label={`Predict the ${pick5Band.name} setlist on Pick5`}
        >
          <img src={PICK5_LOGO_SRC} alt="" width={26} height={26} />
          <span className="thread-card__partner-text">
            <strong>Pick5</strong>
            <span>Predict the {pick5Band.name} setlist</span>
          </span>
          <span className="thread-card__partner-cta">
            Make picks <ArrowUpRight size={14} aria-hidden="true" />
          </span>
        </a>
      )}

      <div className="thread-card__media">
        <img src={imageUrl} alt="" loading="lazy" onError={handleImageError} />
        <div className="thread-card__scrim" aria-hidden="true" />

        <div className="thread-card__chips">
          {reason && (
            <span className="thread-chip" data-reason={reason}>
              <span className="thread-chip__dot" aria-hidden="true" />
              {reasonLabel || REASON_LABELS[reason]}
            </span>
          )}
          {isPopular && (
            <span className="thread-chip thread-chip--hot">
              <Flame size={12} aria-hidden="true" /> Popular
            </span>
          )}
        </div>

        {date && (
          <div className="thread-card__date" aria-label={format(date, 'EEEE, MMMM d')}>
            <span>{format(date, 'MMM')}</span>
            <strong>{format(date, 'd')}</strong>
            <span>{format(date, 'EEE')}</span>
          </div>
        )}
      </div>

      <div className="thread-card__body">
        <div className="thread-card__heading">
          <div className="min-w-0 flex-1">
            <h2 className="thread-card__title line-clamp-2">{event.title}</h2>
            {showArtistLine && <p className="thread-card__artist">{event.artist_name}</p>}
          </div>
          {onHideArtist && event.artist_name && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="thread-btn thread-btn--icon thread-btn--quiet"
                  onClick={(e) => e.stopPropagation()}
                  aria-label="More options"
                >
                  <MoreHorizontal size={18} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onSelect={onHideArtist} className="gap-2">
                  <EyeOff size={16} aria-hidden="true" />
                  Don't recommend {event.artist_name}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="thread-card__where">
          <MapPin size={15} aria-hidden="true" />
          <span className="truncate">
            {[event.venue_name?.trim() || 'Venue TBA', place, distanceLabel].filter(Boolean).join(' · ')}
          </span>
        </div>

        {reviewHighlight && (
          <div className="thread-card__review">
            <div className="thread-card__review-meta">
              <Star size={14} fill="currentColor" aria-hidden="true" />
              <strong>{reviewHighlight.avgRating.toFixed(1)}</strong>
              <span>
                · {reviewHighlight.count} {reviewHighlight.count === 1 ? 'review' : 'reviews'} of{' '}
                {reviewHighlight.name || (reviewHighlight.scope === 'artist' ? 'this artist' : 'this venue')}
              </span>
            </div>
            {reviewHighlight.quote && <p>“{reviewHighlight.quote}”</p>}
          </div>
        )}

        {(interestedCount > 0 || friendsInterestedCount > 0) && (
          <div className="thread-card__social">
            {friendsInterestedCount > 0 && (
              <span className="thread-card__friends">
                <Users size={14} aria-hidden="true" />
                {friendsInterestedCount} {friendsInterestedCount === 1 ? 'friend' : 'friends'}
              </span>
            )}
            {interestedCount > 0 && (
              <span>
                {interestedCount} {interestedCount === 1 ? 'person' : 'people'} interested
              </span>
            )}
          </div>
        )}

        <div className="thread-card__actions">
          <button
            type="button"
            onClick={handleInterest}
            className={cn('thread-btn thread-btn--interest', isInterested && 'is-active')}
            aria-pressed={isInterested}
            aria-label={isInterested ? 'Remove interest' : 'Mark as interested'}
          >
            <Heart size={17} strokeWidth={2.4} aria-hidden="true" fill={isInterested ? 'currentColor' : 'none'} />
            {isInterested ? 'Interested' : "I'm in"}
          </button>
          <button type="button" onClick={handleShare} className="thread-btn thread-btn--icon" aria-label="Share event">
            <Send size={17} strokeWidth={2.4} />
          </button>
          {isInterested && onJoinChatClick && (
            <button type="button" onClick={handleChat} className="thread-btn thread-btn--icon" aria-label="Join event chat">
              <MessageCircle size={17} strokeWidth={2.4} />
            </button>
          )}
          <div className="flex-1" />
          {ticketLink && (
            <a
              href={ticketLink}
              target="_blank"
              rel="nofollow noopener noreferrer"
              className="thread-btn thread-btn--ghost"
              onClick={(e) => {
                e.stopPropagation();
                track(() =>
                  trackInteraction.click('ticket_link', event.id, { source: 'event_card', reason: reason || 'unknown' }, getEventUuid(event) || undefined)
                );
              }}
              aria-label="Get tickets"
            >
              <Ticket size={16} strokeWidth={2.4} aria-hidden="true" />
              Tickets
            </a>
          )}
        </div>
      </div>
    </article>
  );

  return pick5Band ? <div className="thread-card-frame--pick5">{card}</div> : card;
};
