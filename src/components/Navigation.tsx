import { Heart, MessageCircle, User, Music, Search, Users, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavigationProps {
  currentView: 'events' | 'profile' | 'search' | 'concert-feed' | 'debug';
  onViewChange: (view: 'events' | 'profile' | 'search' | 'concert-feed' | 'debug') => void;
}

export const Navigation = ({ currentView, onViewChange }: NavigationProps) => {
  const navItems = [
    { id: 'concert-feed', icon: Users, label: 'Feed' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'events', icon: Heart, label: 'Events' },
    { id: 'profile', icon: User, label: 'Profile' },
    { id: 'debug', icon: Bug, label: 'Debug' }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 z-50">
      <div className="flex justify-around max-w-md mx-auto">
        {navItems.map(({ id, icon: Icon, label }) => (
          <Button
            key={id}
            variant={currentView === id ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewChange(id as any)}
            className={`flex-col h-auto py-2 px-3 ${
              currentView === id 
                ? 'bg-primary text-primary-foreground' 
                : 'text-muted-foreground hover:text-card-foreground'
            }`}
          >
            <Icon className="w-5 h-5 mb-1" />
            <span className="text-xs">{label}</span>
          </Button>
        ))}
      </div>
    </nav>
  );
};