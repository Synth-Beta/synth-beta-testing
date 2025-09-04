import { Heart, MessageCircle, User, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavigationProps {
  currentView: 'events' | 'matches' | 'profile' | 'settings';
  onViewChange: (view: 'events' | 'matches' | 'profile' | 'settings') => void;
}

export const Navigation = ({ currentView, onViewChange }: NavigationProps) => {
  const navItems = [
    { id: 'events', icon: Heart, label: 'Events' },
    { id: 'matches', icon: MessageCircle, label: 'Matches' },
    { id: 'profile', icon: User, label: 'Profile' },
    { id: 'settings', icon: Settings, label: 'Settings' }
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