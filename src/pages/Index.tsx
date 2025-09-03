import { useState } from 'react';
import { WelcomeScreen } from '@/components/WelcomeScreen';
import { SwipeView } from '@/components/SwipeView';
import { EventList } from '@/components/EventList';
import { Navigation } from '@/components/Navigation';
import { mockEvents } from '@/data/mockEvents';
import { useToast } from '@/hooks/use-toast';

type ViewType = 'welcome' | 'swipe' | 'list' | 'profile' | 'settings';

const Index = () => {
  const [currentView, setCurrentView] = useState<ViewType>('welcome');
  const [likedEvents, setLikedEvents] = useState<string[]>([]);
  const { toast } = useToast();

  const handleGetStarted = () => {
    setCurrentView('swipe');
  };

  const handleEventSwipe = (eventId: string, direction: 'like' | 'pass') => {
    if (direction === 'like') {
      setLikedEvents(prev => [...prev, eventId]);
      const event = mockEvents.find(e => e.id === eventId);
      toast({
        title: "Great choice! 🎉",
        description: `You're interested in "${event?.title}". We'll let you know if others want to go too!`,
      });
    }
  };

  const handleEventLike = (eventId: string) => {
    if (!likedEvents.includes(eventId)) {
      setLikedEvents(prev => [...prev, eventId]);
      const event = mockEvents.find(e => e.id === eventId);
      toast({
        title: "Added to your interests! ✨",
        description: `"${event?.title}" - We'll connect you with others who want to attend.`,
      });
    }
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'welcome':
        return <WelcomeScreen onGetStarted={handleGetStarted} />;
      case 'swipe':
        return (
          <SwipeView 
            events={mockEvents} 
            onEventSwipe={handleEventSwipe}
          />
        );
      case 'list':
        return (
          <EventList 
            events={mockEvents}
            onEventLike={handleEventLike}
          />
        );
      case 'profile':
        return (
          <div className="min-h-screen flex items-center justify-center p-4">
            <div className="text-center max-w-sm mx-auto">
              <h2 className="text-2xl font-bold mb-4">Profile Coming Soon</h2>
              <p className="text-muted-foreground">
                Profile creation and management features will be available soon!
              </p>
            </div>
          </div>
        );
      case 'settings':
        return (
          <div className="min-h-screen flex items-center justify-center p-4">
            <div className="text-center max-w-sm mx-auto">
              <h2 className="text-2xl font-bold mb-4">Settings</h2>
              <p className="text-muted-foreground">
                App settings and preferences will be available here.
              </p>
            </div>
          </div>
        );
      default:
        return <WelcomeScreen onGetStarted={handleGetStarted} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {renderCurrentView()}
      {currentView !== 'welcome' && (
        <Navigation 
          currentView={currentView as any} 
          onViewChange={(view) => setCurrentView(view as ViewType)} 
        />
      )}
    </div>
  );
};

export default Index;
