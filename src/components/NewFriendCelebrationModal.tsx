import React, { useEffect, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronLeft } from 'lucide-react';
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
  fallback: 'Suggested for you both',
};

function initialsFromDisplayName(name?: string | null): string {
  const t = name?.trim();
  if (!t) return '?';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return t.slice(0, 2).toUpperCase();
}

interface NewFriendCelebrationModalProps {
  friendName: string;
  /** Avatar fallback initials when the current user has no profile photo. */
  currentUserDisplayName?: string | null;
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
  currentUserDisplayName,
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
      {/* Header: back + centered title + spacer so the title never sits under the chevron (web + mobile). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingLeft: 8,
          paddingRight: 8,
          minHeight: 56,
          flexShrink: 0,
          borderBottom: '1px solid var(--neutral-200, #E5E5E5)',
          backgroundColor: 'var(--neutral-50, #FAFAFA)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 44,
            flexShrink: 0,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 12,
          }}
          aria-label="Back"
        >
          <ChevronLeft size={24} style={{ color: 'var(--neutral-900)' }} />
        </button>
        <h1
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--font-family)',
            fontSize: 17,
            fontWeight: 700,
            lineHeight: 1.25,
            color: 'var(--neutral-900)',
            textAlign: 'center',
            margin: 0,
            padding: '4px 0',
          }}
        >
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Friend match · {friendName}
          </span>
          <span
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--neutral-600, #525252)',
              marginTop: 2,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {typeof data.friendship_days === 'number'
              ? `${data.friendship_days} ${data.friendship_days === 1 ? 'day' : 'days'} together`
              : 'Friends'}
          </span>
        </h1>
        <div style={{ width: 44, height: 44, flexShrink: 0 }} aria-hidden />
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
        <p
          style={{
            fontFamily: 'var(--font-family)',
            fontSize: 22,
            fontWeight: 700,
            color: 'var(--neutral-900)',
            textAlign: 'center',
            marginTop: 16,
            marginBottom: 8,
            lineHeight: 1.3,
          }}
        >
          You&apos;ve been friends with {friendName} for{' '}
          {typeof data.friendship_days === 'number'
            ? `${data.friendship_days} ${data.friendship_days === 1 ? 'day' : 'days'}`
            : '0 days'}
          !
        </p>

        {/* Avatars - Venn overlap, friend on top, synth pink border */}
        <div className="flex justify-center py-6">
          <div className="relative flex items-center">
            <Avatar className="h-36 w-36 border-[4px] shrink-0" style={{ borderColor: '#CC2486', marginRight: -20 }}>
              <AvatarImage src={data.current_user_avatar_url} />
              <AvatarFallback className="bg-muted text-foreground text-3xl font-bold">
                {initialsFromDisplayName(currentUserDisplayName ?? 'You')}
              </AvatarFallback>
            </Avatar>
            <Avatar className="h-36 w-36 border-[4px] shrink-0 relative z-10" style={{ borderColor: '#CC2486' }}>
              <AvatarImage src={data.friend_avatar_url} />
              <AvatarFallback className="bg-muted text-foreground text-3xl font-bold">
                {initialsFromDisplayName(friendName)}
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
