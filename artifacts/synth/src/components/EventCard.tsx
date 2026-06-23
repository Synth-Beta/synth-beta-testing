"use client"

import { useMemo, useState } from "react"
import { Heart, X, Calendar, MapPin, Users, Star, Music } from "lucide-react"
import { ProgressiveImage } from "@/components/ui/ProgressiveImage"
import { isEventPast, getEventStatus } from "@/utils/eventStatusUtils"
import { useSetlist } from "@/hooks/useSetlist"
import { getFallbackEventImage, replaceJambasePlaceholder } from "@/utils/eventImageFallbacks"

export interface Event {
  id: string
  title: string
  venue: string
  date: string
  time: string
  event_date?: string
  category: "music" | "food" | "arts" | "sports" | "social"
  description: string
  image: string
  price?: string
  attendeeCount: number
}

interface EventCardProps {
  event: Event
  onSwipe: (eventId: string, direction: "like" | "pass") => void
  className?: string
}

export const EventCard = ({ event, onSwipe, className = "" }: EventCardProps) => {
  const [isAnimating, setIsAnimating] = useState(false)
  const [swipeDirection, setSwipeDirection] = useState<"like" | "pass" | null>(null)

  const eventDate = event.event_date || event.date
  const isPast = isEventPast(eventDate)
  const eventStatus = getEventStatus(eventDate)

  const { setlist, loading: setlistLoading, hasSetlist, songCount } = useSetlist(event.id)

  const fallbackImage = useMemo(
    () => getFallbackEventImage(`${event.id}-${event.title}`),
    [event.id, event.title]
  )
  const eventImage = replaceJambasePlaceholder(event.image) || fallbackImage

  const handleSwipe = (direction: "like" | "pass") => {
    setSwipeDirection(direction)
    setIsAnimating(true)
    setTimeout(() => {
      onSwipe(event.id, direction)
      setIsAnimating(false)
      setSwipeDirection(null)
    }, 300)
  }

  const handleWriteReview = () => {
    console.log('Write review for past event:', event.id)
  }

  const metaStyle: React.CSSProperties = {
    fontFamily: 'var(--font-family)',
    fontSize: 'var(--typography-meta-size, 16px)',
    fontWeight: 'var(--typography-meta-weight, 500)',
    lineHeight: 'var(--typography-meta-line-height, 1.5)',
  }

  const actionButtonBase: React.CSSProperties = {
    flex: 1,
    height: 'var(--size-button-height, 36px)',
    border: 'none',
    borderRadius: 'var(--radius-corner, 10px)',
    boxShadow: 'var(--shadow-default)',
    fontFamily: 'var(--font-family)',
    fontSize: 'var(--typography-meta-size, 16px)',
    fontWeight: 'var(--typography-meta-weight, 500)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--spacing-inline, 6px)',
  }

  return (
    <div
      className={`
        relative w-full max-w-sm mx-auto overflow-hidden
        ${isAnimating && swipeDirection === "like" ? "animate-swipe-like" : ""}
        ${isAnimating && swipeDirection === "pass" ? "animate-swipe-pass" : ""}
        ${className}
      `}
      style={{
        backgroundColor: 'var(--neutral-50)',
        border: 'var(--border-default)',
        borderRadius: 'var(--radius-corner, 10px)',
        boxShadow: 'var(--shadow-modal)',
      }}
      role="article"
      aria-label={`Event: ${event.title}`}
    >
      {/* Event Image */}
      <div className="relative overflow-hidden" style={{ height: '288px', backgroundColor: '#000000' }}>
        <ProgressiveImage
          src={eventImage}
          alt={`${event.title} event image`}
          className="absolute inset-0 w-full h-full transition-transform duration-500 hover:scale-105"
          objectFit="contain"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        {/* Category pill */}
        {!isPast && (
          <div className="absolute" style={{ top: 'var(--spacing-small, 12px)', left: 'var(--spacing-small, 12px)' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px var(--spacing-small, 12px)',
                backgroundColor: 'var(--brand-pink-050)',
                color: 'var(--brand-pink-500)',
                border: '1px solid var(--brand-pink-500)',
                borderRadius: '999px',
                ...metaStyle,
              }}
            >
              {event.category.charAt(0).toUpperCase() + event.category.slice(1)}
            </span>
          </div>
        )}

        {/* Past event badge */}
        {isPast && (
          <div className="absolute" style={{ top: 'var(--spacing-small, 12px)', left: 'var(--spacing-small, 12px)' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px var(--spacing-small, 12px)',
                backgroundColor: 'var(--status-success-050)',
                color: 'var(--status-success-500)',
                border: '1px solid var(--status-success-500)',
                borderRadius: '999px',
                ...metaStyle,
              }}
            >
              Past Event
            </span>
          </div>
        )}

        {/* Price badge */}
        {event.price && (
          <div className="absolute" style={{ top: 'var(--spacing-small, 12px)', right: 'var(--spacing-small, 12px)' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px var(--spacing-small, 12px)',
                backgroundColor: 'var(--brand-pink-500)',
                color: 'var(--neutral-50)',
                borderRadius: '999px',
                ...metaStyle,
                fontWeight: 700,
              }}
            >
              {event.price}
            </span>
          </div>
        )}
      </div>

      {/* Card Content */}
      <div style={{ padding: 'var(--spacing-grouped, 24px)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-grouped, 24px)' }}>
        {/* Title + Description */}
        <div>
          <h3
            style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-h2-size, 24px)',
              fontWeight: 'var(--typography-h2-weight, 700)',
              lineHeight: 'var(--typography-h2-line-height, 1.3)',
              color: 'var(--neutral-900)',
              marginBottom: 'var(--spacing-small, 12px)',
            }}
          >
            {event.title}
          </h3>
          <p
            style={{
              ...metaStyle,
              color: 'var(--neutral-600)',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {event.description}
          </p>
        </div>

        {/* Event Details */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--spacing-small, 12px)',
            backgroundColor: 'var(--neutral-100)',
            borderRadius: 'var(--radius-corner, 10px)',
            padding: 'var(--spacing-small, 12px)',
          }}
        >
          <div className="flex items-center" style={{ gap: 'var(--spacing-small, 12px)' }}>
            <Calendar style={{ width: '20px', height: '20px', color: 'var(--brand-pink-500)', flexShrink: 0 }} aria-hidden="true" />
            <span style={{ ...metaStyle, color: 'var(--neutral-900)' }}>{event.date} at {event.time}</span>
          </div>
          <div className="flex items-center" style={{ gap: 'var(--spacing-small, 12px)' }}>
            <MapPin style={{ width: '20px', height: '20px', color: 'var(--brand-pink-500)', flexShrink: 0 }} aria-hidden="true" />
            <span style={{ ...metaStyle, color: 'var(--neutral-900)' }}>{event.venue}</span>
          </div>
          <div className="flex items-center" style={{ gap: 'var(--spacing-small, 12px)' }}>
            <Users style={{ width: '20px', height: '20px', color: 'var(--brand-pink-500)', flexShrink: 0 }} aria-hidden="true" />
            <span style={{ ...metaStyle, color: 'var(--neutral-900)' }}>{event.attendeeCount} interested</span>
          </div>
          {isPast && (
            <div className="flex items-center" style={{ gap: 'var(--spacing-small, 12px)' }}>
              <Music style={{ width: '20px', height: '20px', color: 'var(--brand-pink-500)', flexShrink: 0 }} aria-hidden="true" />
              <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                {setlistLoading ? (
                  <span style={{ ...metaStyle, color: 'var(--neutral-600)' }}>Loading setlist...</span>
                ) : hasSetlist ? (
                  <>
                    <span style={{ ...metaStyle, color: 'var(--neutral-900)' }}>Setlist available</span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        height: '25px',
                        padding: '0 var(--spacing-small, 12px)',
                        backgroundColor: 'var(--brand-pink-050)',
                        color: 'var(--brand-pink-500)',
                        border: '2px solid var(--brand-pink-500)',
                        borderRadius: '999px',
                        ...metaStyle,
                      }}
                    >
                      {songCount} songs
                    </span>
                  </>
                ) : (
                  <span style={{ ...metaStyle, color: 'var(--neutral-600)' }}>No setlist available</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex" style={{ gap: 'var(--spacing-small, 12px)' }}>
          {isPast ? (
            <>
              <button
                onClick={handleWriteReview}
                aria-label="Write a review for this past event"
                style={{ ...actionButtonBase, backgroundColor: 'var(--brand-pink-500)', color: 'var(--neutral-50)' }}
              >
                <Star style={{ width: '24px', height: '24px' }} aria-hidden="true" />
                Write Review
              </button>
              <button
                aria-label="View event details and setlist"
                style={{ ...actionButtonBase, backgroundColor: 'var(--neutral-50)', color: 'var(--brand-pink-500)', border: 'var(--border-brand)' }}
              >
                {hasSetlist ? (
                  <><Music style={{ width: '24px', height: '24px' }} aria-hidden="true" /> View Setlist</>
                ) : (
                  <><Calendar style={{ width: '24px', height: '24px' }} aria-hidden="true" /> View Details</>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleSwipe("pass")}
                disabled={isAnimating}
                aria-label="Pass on this event"
                style={{
                  ...actionButtonBase,
                  backgroundColor: 'var(--neutral-50)',
                  color: 'var(--neutral-600)',
                  border: 'var(--border-default)',
                  opacity: isAnimating ? 0.5 : 1,
                  cursor: isAnimating ? 'not-allowed' : 'pointer',
                }}
              >
                <X style={{ width: '24px', height: '24px' }} aria-hidden="true" />
                Pass
              </button>
              <button
                onClick={() => handleSwipe("like")}
                disabled={isAnimating}
                aria-label="Like this event"
                style={{
                  ...actionButtonBase,
                  backgroundColor: isAnimating ? 'var(--state-disabled-bg)' : 'var(--brand-pink-500)',
                  color: isAnimating ? 'var(--state-disabled-text)' : 'var(--neutral-50)',
                  boxShadow: isAnimating ? 'none' : 'var(--shadow-default)',
                  cursor: isAnimating ? 'not-allowed' : 'pointer',
                }}
              >
                <Heart style={{ width: '24px', height: '24px' }} aria-hidden="true" />
                Interested
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
