"use client"

import { useMemo, useState } from "react"
import { Heart, X, Calendar, MapPin, Users, Star, Music } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { isEventPast, getEventStatus } from "@/utils/eventStatusUtils"
import { useSetlist } from "@/hooks/useSetlist"
import { getFallbackEventImage } from "@/utils/eventImageFallbacks"

export interface Event {
  id: string
  title: string
  venue: string
  date: string
  time: string
  event_date?: string // Add event_date for status checking
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

  // Determine if this is a past event
  const eventDate = event.event_date || event.date
  const isPast = isEventPast(eventDate)
  const eventStatus = getEventStatus(eventDate)

  // Fetch setlist data for past events
  const { setlist, loading: setlistLoading, hasSetlist, songCount } = useSetlist(event.id)

  const fallbackImage = useMemo(
    () => getFallbackEventImage(`${event.id}-${event.title}`),
    [event.id, event.title]
  )
  const eventImage = event.image || fallbackImage

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
    // TODO: Implement review functionality for past events
    console.log('Write review for past event:', event.id)
  }

  const getCategoryColor = (category: string) => {
    const colors = {
      music: "category-music",
      food: "category-food",
      arts: "category-arts",
      sports: "category-sports",
      social: "category-social",
    }
    return colors[category as keyof typeof colors] || "category-social"
  }

  return (
        <Card
          className={`
            glass-card hover-card depth-card relative w-full max-w-sm mx-auto overflow-hidden floating-shadow
            ${isAnimating && swipeDirection === "like" ? "animate-swipe-like" : ""}
            ${isAnimating && swipeDirection === "pass" ? "animate-swipe-pass" : ""}
            ${className}
          `}
          role="article"
          aria-label={`Event: ${event.title}`}
        >
      {/* Event Image */}
      <div className="relative h-72 overflow-hidden">
        <img
          src={eventImage}
          alt={`${event.title} event image`}
          className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        <div className="absolute top-4 left-4">
          <span
            className={`px-4 py-2 rounded-full text-xs font-semibold shadow-lg backdrop-blur-sm hover-icon ${getCategoryColor(event.category)}`}
          >
            {event.category.charAt(0).toUpperCase() + event.category.slice(1)}
          </span>
        </div>
        {event.price && (
          <div className="absolute top-4 right-4 gradient-badge rounded-full text-sm font-bold shadow-lg">
            {event.price}
          </div>
        )}
        {/* Event Status Badge */}
        {isPast && (
          <div className="absolute top-4 left-4 bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-medium shadow-lg">
            Past Event
          </div>
        )}
      </div>

     <div className="p-6 space-y-5">
        <div>
          <h3 className="synth-heading text-2xl mb-3 leading-tight">{event.title}</h3>
          <p className="synth-text text-muted-foreground text-sm leading-relaxed line-clamp-2">{event.description}</p>
        </div>

        <div className="space-y-3 bg-muted/30 rounded-xl p-4">
          <div className="flex items-center gap-3 text-sm text-foreground">
            <Calendar className="w-5 h-5 hover-icon flex-shrink-0" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} aria-hidden="true" />
            <span className="font-medium">
              {event.date} at {event.time}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-foreground">
            <MapPin className="w-5 h-5 hover-icon flex-shrink-0" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} aria-hidden="true" />
            <span className="font-medium">{event.venue}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-foreground">
            <Users className="w-5 h-5 hover-icon flex-shrink-0" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} aria-hidden="true" />
            <span className="font-medium">{event.attendeeCount} interested</span>
          </div>
          {/* Setlist information for past events */}
          {isPast && (
            <div className="flex items-center gap-3 text-sm text-foreground">
              <Music className="w-5 h-5 hover-icon flex-shrink-0" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} aria-hidden="true" />
              <div className="flex items-center gap-2">
                {setlistLoading ? (
                  <span className="text-muted-foreground">Loading setlist...</span>
                ) : hasSetlist ? (
                  <>
                    <span className="font-medium">Setlist available</span>
                    <Badge variant="secondary" className="text-xs">
                      {songCount} songs
                    </Badge>
                  </>
                ) : (
                  <span className="text-muted-foreground">No setlist available</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons - Different for past vs upcoming events */}
        <div className="flex gap-4 pt-2">
          {isPast ? (
            // Past event actions
            <>
              <Button
                onClick={handleWriteReview}
                size="lg"
                className="hover-button gradient-button flex-1 h-14 text-base font-semibold"
                aria-label="Write a review for this past event"
              >
                <Star className="w-6 h-6 mr-2 hover-icon" aria-hidden="true" />
                Write Review
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="hover-button flex-1 border-2 border-gray-300 hover:border-gray-400 hover:text-gray-600 h-14 text-base font-semibold transition-all duration-200"
                aria-label="View event details and setlist"
              >
                {hasSetlist ? (
                  <>
                    <Music className="w-6 h-6 mr-2 hover-icon" aria-hidden="true" />
                    View Setlist
                  </>
                ) : (
                  <>
                    <Calendar className="w-6 h-6 mr-2 hover-icon" aria-hidden="true" />
                    View Details
                  </>
                )}
              </Button>
            </>
          ) : (
            // Upcoming event actions
            <>
              <Button
                onClick={() => handleSwipe("pass")}
                variant="outline"
                size="lg"
                className="hover-button flex-1 border-2 border-gray-300 hover:border-red-400 hover:text-red-500 btn-swipe-pass h-14 text-base font-semibold transition-all duration-200"
                disabled={isAnimating}
                aria-label="Pass on this event"
              >
                <X className="w-6 h-6 mr-2 hover-icon" aria-hidden="true" />
                Pass
              </Button>
              <Button
                onClick={() => handleSwipe("like")}
                size="lg"
                className="hover-button gradient-button flex-1 h-14 text-base font-semibold"
                disabled={isAnimating}
                aria-label="Like this event"
              >
                <Heart className="w-6 h-6 mr-2 hover-heart" aria-hidden="true" />
                Interested
              </Button>
            </>
          )}
        </div>
      </div>
    </Card>
  )
}