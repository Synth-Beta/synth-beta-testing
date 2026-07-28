import React from 'react';
import { Button } from '@/components/ui/button';
import { Map, Calendar } from 'lucide-react';

interface ViewToggleProps {
  currentView: 'map' | 'calendar';
  onViewChange: (view: 'map' | 'calendar') => void;
  className?: string;
}

export const ViewToggle: React.FC<ViewToggleProps> = ({
  currentView,
  onViewChange,
  className = ''
}) => {
  return (
    <div className={`flex bg-muted rounded-lg p-1 ${className}`}>
      <Button
        variant={currentView === 'map' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('map')}
        className={`flex items-center gap-2 px-3 py-2 ${
          currentView === 'map' 
            ? 'bg-background text-foreground shadow-sm' 
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Map className="h-4 w-4" />
        <span className="hidden sm:inline">Map</span>
      </Button>
      
      <Button
        variant={currentView === 'calendar' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => onViewChange('calendar')}
        className={`flex items-center gap-2 px-3 py-2 ${
          currentView === 'calendar' 
            ? 'bg-background text-foreground shadow-sm' 
            : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        <Calendar className="h-4 w-4" />
        <span className="hidden sm:inline">Calendar</span>
      </Button>
    </div>
  );
};
