import { useState, useEffect } from 'react';
import { EventCard, Event } from '@/components/EventCard';
import { Button } from '@/components/ui/button';
import { RotateCcw, Sparkles } from 'lucide-react';

interface SwipeViewProps {
  events: Event[];
  onEventSwipe: (eventId: string, direction: 'like' | 'pass') => void;
}

export const SwipeView = ({ events, onEventSwipe }: SwipeViewProps) => {
  const [currentEventIndex, setCurrentEventIndex] = useState(0);
  const [swipedEvents, setSwipedEvents] = useState<string[]>([]);

  const currentEvent = events[currentEventIndex];
  const hasMoreEvents = currentEventIndex < events.length - 1;

  const handleSwipe = (eventId: string, direction: 'like' | 'pass') => {
    setSwipedEvents(prev => [...prev, eventId]);
    onEventSwipe(eventId, direction);
    
    if (hasMoreEvents) {
      setCurrentEventIndex(prev => prev + 1);
    }
  };

  const resetStack = () => {
    setCurrentEventIndex(0);
    setSwipedEvents([]);
  };

  if (!currentEvent || swipedEvents.includes(currentEvent.id)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
        <div className="max-w-sm mx-auto">
          <Sparkles className="w-16 h-16 text-primary mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-card-foreground mb-2">
            You're all caught up!
          </h2>
          <p className="text-muted-foreground mb-6">
            No more events to discover right now. Check back later for new events!
          </p>
          <Button onClick={resetStack} variant="outline" className="w-full">
            <RotateCcw className="w-4 h-4 mr-2" />
            Start Over
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm mx-auto">
        {/* Progress indicator */}
        <div className="flex justify-center mb-6">
          <div className="flex gap-1">
            {events.slice(0, 5).map((_, index) => (
              <div
                key={index}
                className={`h-1 w-8 rounded-full transition-colors ${
                  index <= currentEventIndex ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Event Card Stack */}
        <div className="relative">
          {/* Next card preview */}
          {hasMoreEvents && events[currentEventIndex + 1] && (
            <div className="absolute inset-0 transform scale-95 opacity-50 z-0">
              <EventCard
                event={events[currentEventIndex + 1]}
                onSwipe={() => {}}
                className="pointer-events-none"
              />
            </div>
          )}
          
          {/* Current card */}
          <div className="relative z-10">
            <EventCard
              event={currentEvent}
              onSwipe={handleSwipe}
            />
          </div>
        </div>

        {/* Helper text */}
        <div className="text-center mt-6">
          <p className="text-sm text-muted-foreground">
            Swipe right if you want to attend, left to pass
          </p>
        </div>
      </div>
    </div>
  );
};