import React, { useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSynthPlaceholderImage, replaceJambasePlaceholder } from '@/utils/eventImageFallbacks';
import confetti from 'canvas-confetti';

export interface CelebrationEvent {
  id: string;
  title: string;
  event_date: string;
  venue_city?: string;
  venue_name?: string;
  artist_name?: string;
  source?: 'you_both_attended' | 'you_both_follow' | 'recommended' | 'fallback';
}

export interface SharedFollow {
  id: string;
  name: string;
  image_url?: string | null;
}

export interface SharedGenre {
  genre: string;
  match_pct: number;
}

export interface CelebrationData {
  events_attended_together: CelebrationEvent[];
  shared_genres: Array<SharedGenre | string>;
  shared_artists?: SharedFollow[];
  shared_venues?: SharedFollow[];
  suggested_events: CelebrationEvent[];
  current_user_avatar_url?: string;
  friend_avatar_url?: string;
  friendship_days?: number;
}

const SOURCE_LABELS: Record<string, string> = {
  you_both_attended: "You've both been to",
  you_both_follow: 'You both follow',
  recommended: 'Recommended',
  fallback: 'For you both',
};

interface NewFriendCelebrationModalProps {
  friendName: string;
  data: CelebrationData;
  isOpen: boolean;
  onClose: () => void;
  onEventClick?: (eventId: string) => void;
  onArtistClick?: (artistId: string, artistName: string) => void;
  onVenueClick?: (venueId: string, venueName: string) => void;
}

function EventCard({
  event,
  onClick,
}: {
  event: CelebrationEvent;
  onClick?: () => void;
}) {
  const label = event.source ? SOURCE_LABELS[event.source] ?? event.source : null;
  const displayLine =
    event.artist_name && (event.venue_name || event.venue_city)
      ? `${event.artist_name} at ${event.venue_name || event.venue_city}`
      : event.title;
  const content = (
    <div className="rounded-lg border bg-muted/40 p-3 text-left hover:bg-muted/60 transition-colors">
      {label && (
        <span className="inline-block text-xs font-medium text-[#CC2486] mb-1.5 px-2 py-0.5 rounded-full bg-[#CC2486]/10">
          {label}
        </span>
      )}
      <p className="font-medium text-foreground line-clamp-2">{displayLine}</p>
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full text-left block">
        {content}
      </button>
    );
  }
  return content;
}

function SharedFollowGrid({
  items,
  onItemClick,
}: {
  items: SharedFollow[];
  type?: 'artist' | 'venue';
  onItemClick?: (id: string, name: string) => void;
}) {
  const placeholder = getSynthPlaceholderImage();
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.slice(0, 9).map((item) => {
        const imgUrl = replaceJambasePlaceholder(item.image_url) || placeholder;
        return (
          <div key={item.id} className="flex flex-col items-center gap-1.5">
            {onItemClick ? (
              <button
                type="button"
                onClick={() => onItemClick(item.id, item.name)}
                className="flex flex-col items-center gap-1.5 hover:opacity-80 transition-opacity"
              >
                <div className="w-14 h-14 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 ring-1 ring-muted">
                  <img src={imgUrl} alt={item.name} className="w-full h-full object-cover" />
                </div>
                <span className="text-xs font-medium text-foreground text-center line-clamp-2">
                  {item.name}
                </span>
              </button>
            ) : (
              <>
                <div className="w-14 h-14 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0 ring-1 ring-muted">
                  <img src={imgUrl} alt={item.name} className="w-full h-full object-cover" />
                </div>
                <span className="text-xs font-medium text-foreground text-center line-clamp-2">
                  {item.name}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function NewFriendCelebrationModal({
  friendName,
  data,
  isOpen,
  onClose,
  onEventClick,
  onArtistClick,
  onVenueClick,
}: NewFriendCelebrationModalProps) {
  const sharedArtists = data.shared_artists ?? [];
  const sharedVenues = data.shared_venues ?? [];
  const hasSharedFollows = sharedArtists.length > 0 || sharedVenues.length > 0;
  const hasFiredConfetti = useRef(false);

  useEffect(() => {
    if (!isOpen || hasFiredConfetti.current) return;
    hasFiredConfetti.current = true;

    const duration = 3000;
    const end = Date.now() + duration;

    const frame = () => {
      confetti({
        particleCount: 3,
        angle: 270,
        spread: 120,
        startVelocity: 15,
        scalar: 0.7,
        origin: { x: Math.random(), y: -0.05 },
        gravity: 0.8,
        ticks: 300,
      });
      if (Date.now() < end) requestAnimationFrame(frame);
    };
    frame();
  }, [isOpen]);

  // Reset confetti flag when modal closes
  useEffect(() => {
    if (!isOpen) {
      hasFiredConfetti.current = false;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'var(--neutral-50, #FAFAFA)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header with back button */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingLeft: 8,
          paddingRight: 16,
          height: 56,
          flexShrink: 0,
        }}
      >
        <button
          onClick={onClose}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 12,
          }}
          aria-label="Back"
        >
          <ChevronLeft size={24} style={{ color: 'var(--neutral-900)' }} />
        </button>
      </div>

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          paddingLeft: 20,
          paddingRight: 20,
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)',
        }}
      >
        {/* Title */}
        <h1
          style={{
            fontFamily: 'var(--font-family)',
            fontSize: 24,
            fontWeight: 700,
            color: 'var(--neutral-900)',
            textAlign: 'center',
            marginBottom: 8,
          }}
        >
          You&apos;ve been friends with {friendName} for{' '}
          {typeof data.friendship_days === 'number'
            ? `${data.friendship_days} ${data.friendship_days === 1 ? 'day' : 'days'}`
            : '0 days'}
          !
        </h1>

        {/* Avatars - Venn overlap, friend on top, synth pink border */}
        <div className="flex justify-center py-6">
          <div className="relative flex items-center">
            <Avatar className="h-36 w-36 border-[4px] shrink-0" style={{ borderColor: '#CC2486', marginRight: -20 }}>
              <AvatarImage src={data.current_user_avatar_url} />
              <AvatarFallback>
                <User className="h-14 w-14" />
              </AvatarFallback>
            </Avatar>
            <Avatar className="h-36 w-36 border-[4px] shrink-0 relative z-10" style={{ borderColor: '#CC2486' }}>
              <AvatarImage src={data.friend_avatar_url} />
              <AvatarFallback>
                <User className="h-14 w-14" />
              </AvatarFallback>
            </Avatar>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {data.events_attended_together.length > 0 && (
            <div>
              <h3 className="font-semibold text-foreground mb-2">
                Events you&apos;ve been to together
              </h3>
              <div className="space-y-2">
                {data.events_attended_together.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onClick={onEventClick ? () => onEventClick(event.id) : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {data.shared_genres.length > 0 && (
            <div>
              <h3 className="font-semibold text-foreground mb-2">Shared genres</h3>
              <div className="flex flex-wrap gap-2">
                {data.shared_genres.map((g) => {
                  const genreName = typeof g === 'string' ? g : g.genre;
                  const matchPct = typeof g === 'string' ? null : g.match_pct;
                  return (
                    <span
                      key={genreName}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
                        'bg-white text-[#CC2486] border border-[#CC2486]/30'
                      )}
                    >
                      {genreName}
                      {matchPct != null && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#CC2486',
                            opacity: 0.7,
                          }}
                        >
                          {matchPct}%
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {hasSharedFollows && (
            <div>
              <h3 className="font-semibold text-foreground mb-2">Shared follows</h3>
              {sharedArtists.length > 0 && (
                <div className="mb-3">
                  <p className="text-xs text-muted-foreground mb-2">Artists</p>
                  <SharedFollowGrid
                    items={sharedArtists}
                    type="artist"
                    onItemClick={onArtistClick}
                  />
                </div>
              )}
              {sharedVenues.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Venues</p>
                  <SharedFollowGrid
                    items={sharedVenues}
                    type="venue"
                    onItemClick={onVenueClick}
                  />
                </div>
              )}
            </div>
          )}

          {data.suggested_events.length > 0 && (
            <div>
              <h3 className="font-semibold text-foreground mb-2">
                Events to check out together
              </h3>
              <div className="space-y-2">
                {data.suggested_events.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onClick={onEventClick ? () => onEventClick(event.id) : undefined}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
