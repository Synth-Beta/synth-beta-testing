import { useState } from 'react';
import { Heart, X, Calendar, MapPin, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export interface Event {
  id: string;
  title: string;
  venue: string;
  date: string;
  time: string;
  category: 'music' | 'food' | 'arts' | 'sports' | 'social';
  description: string;
  image: string;
  price?: string;
  attendeeCount: number;
}

interface EventCardProps {
  event: Event;
  onSwipe: (eventId: string, direction: 'like' | 'pass') => void;
  className?: string;
}

export const EventCard = ({ event, onSwipe, className = '' }: EventCardProps) => {
  const [isAnimating, setIsAnimating] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'like' | 'pass' | null>(null);

  const handleSwipe = (direction: 'like' | 'pass') => {
    setSwipeDirection(direction);
    setIsAnimating(true);
    
    setTimeout(() => {
      onSwipe(event.id, direction);
      setIsAnimating(false);
      setSwipeDirection(null);
    }, 300);
  };

  const getCategoryColor = (category: string) => {
    const colors = {
      music: 'category-music',
      food: 'category-food', 
      arts: 'category-arts',
      sports: 'category-sports',
      social: 'category-social'
    };
    return colors[category as keyof typeof colors] || 'category-social';
  };

  return (
    <Card 
      className={`
        relative w-full max-w-sm mx-auto bg-card rounded-2xl overflow-hidden shadow-lg
        ${isAnimating && swipeDirection === 'like' ? 'animate-swipe-like' : ''}
        ${isAnimating && swipeDirection === 'pass' ? 'animate-swipe-pass' : ''}
        ${className}
      `}
    >
      {/* Event Image */}
      <div className="relative h-64 overflow-hidden">
        <img 
          src={event.image} 
          alt={event.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute top-4 left-4">
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getCategoryColor(event.category)}`}>
            {event.category.charAt(0).toUpperCase() + event.category.slice(1)}
          </span>
        </div>
        {event.price && (
          <div className="absolute top-4 right-4 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-semibold">
            {event.price}
          </div>
        )}
      </div>

      {/* Event Details */}
      <div className="p-6 space-y-4">
        <div>
          <h3 className="text-xl font-bold text-card-foreground mb-2">{event.title}</h3>
          <p className="text-muted-foreground text-sm line-clamp-2">{event.description}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>{event.date} at {event.time}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <MapPin className="w-4 h-4" />
            <span>{event.venue}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="w-4 h-4" />
            <span>{event.attendeeCount} interested</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 pt-4">
          <Button
            onClick={() => handleSwipe('pass')}
            variant="outline"
            size="lg"
            className="flex-1 btn-swipe-pass"
            disabled={isAnimating}
          >
            <X className="w-5 h-5 mr-2" />
            Pass
          </Button>
          <Button
            onClick={() => handleSwipe('like')}
            size="lg"
            className="flex-1 btn-swipe-like"
            disabled={isAnimating}
          >
            <Heart className="w-5 h-5 mr-2" />
            I'm In!
          </Button>
        </div>
      </div>
    </Card>
  );
};