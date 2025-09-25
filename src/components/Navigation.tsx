import { User, Search, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SynthSLogo } from '@/components/SynthSLogo';

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
    <nav className="synth-nav fixed bottom-0 left-0 right-0 p-4 z-[2000]">
      <div className="flex justify-around max-w-md mx-auto">
        {navItems.map(({ id, icon: Icon, label }) => (
          <Button
            key={id}
            variant="ghost"
            size="sm"
            onClick={() => onViewChange(id)}
            className={`synth-nav-item ${
              currentView === id ? 'active' : ''
            }`}
          >
            {currentView === id && id === 'feed' ? (
              <SynthSLogo size="sm" />
            ) : (
              <Icon className="w-5 h-5" />
            )}
            <span className="text-xs font-medium">{label}</span>
          </Button>
        ))}
      </div>
    </nav>
  );
};