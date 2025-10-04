"use client"

import { useState } from "react"
import { Heart, X, Calendar, MapPin, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

export interface Event {
  id: string
  title: string
  venue: string
  date: string
  time: string
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

  const handleSwipe = (direction: "like" | "pass") => {
    setSwipeDirection(direction)
    setIsAnimating(true)

    setTimeout(() => {
      onSwipe(event.id, direction)
      setIsAnimating(false)
      setSwipeDirection(null)
    }, 300)
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
        synth-card relative w-full max-w-sm mx-auto overflow-hidden
        transition-all duration-300 hover:shadow-2xl
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
          src={event.image || "/placeholder.svg"}
          alt={`${event.title} event image`}
          className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        <div className="absolute top-4 left-4">
          <span
            className={`px-4 py-2 rounded-full text-xs font-semibold shadow-lg backdrop-blur-sm ${getCategoryColor(event.category)}`}
          >
            {event.category.charAt(0).toUpperCase() + event.category.slice(1)}
          </span>
        </div>
        {event.price && (
          <div className="absolute top-4 right-4 btn-synth-primary px-4 py-2 rounded-full text-sm font-bold shadow-lg">
            {event.price}
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
            <Calendar className="w-5 h-5 text-synth-pink flex-shrink-0" aria-hidden="true" />
            <span className="font-medium">
              {event.date} at {event.time}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-foreground">
            <MapPin className="w-5 h-5 text-synth-pink flex-shrink-0" aria-hidden="true" />
            <span className="font-medium">{event.venue}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-foreground">
            <Users className="w-5 h-5 text-synth-pink flex-shrink-0" aria-hidden="true" />
            <span className="font-medium">{event.attendeeCount} interested</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-2">
          <Button
            onClick={() => handleSwipe("pass")}
            variant="outline"
            size="lg"
            className="flex-1 btn-swipe-pass h-14 text-base font-semibold"
            disabled={isAnimating}
            aria-label="Pass on this event"
          >
            <X className="w-6 h-6 mr-2" aria-hidden="true" />
            Pass
          </Button>
          <Button
            onClick={() => handleSwipe("like")}
            size="lg"
            className="flex-1 btn-swipe-like h-14 text-base font-semibold"
            disabled={isAnimating}
            aria-label="Like this event"
          >
            <Heart className="w-6 h-6 mr-2" aria-hidden="true" />
            Interested
          </Button>
        </div>
      </div>
    </Card>
  )
}