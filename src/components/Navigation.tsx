import { User, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavigationProps {
  currentView: 'feed' | 'search' | 'profile' | 'profile-edit';
  onViewChange: (view: 'feed' | 'search' | 'profile') => void;
}

export const Navigation = ({ currentView, onViewChange }: NavigationProps) => {
  const navItems: Array<{ id: 'feed' | 'search' | 'profile', icon: any, label: string }> = [
    { id: 'feed', icon: Users, label: 'Feed' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'profile', icon: User, label: 'Profile' }
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 z-[2000]">
      <div className="flex justify-around max-w-md mx-auto">
        {navItems.map(({ id, icon: Icon, label }) => (
          <Button
            key={id}
            variant={currentView === id ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onViewChange(id)}
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