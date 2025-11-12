import React from 'react';
import { SynthSLogo } from '@/components/SynthSLogo';
import { Button } from '@/components/ui/button';
import { Bell, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UnifiedBannerProps {
  currentView: 'feed' | 'search' | 'profile';
  onViewChange: (view: 'feed' | 'search' | 'profile') => void;
  onNavigateToNotifications?: () => void;
  onNavigateToChat?: (userId: string) => void;
  currentUserId: string;
  className?: string;
}

export const UnifiedBanner: React.FC<UnifiedBannerProps> = ({
  currentView,
  onViewChange,
  onNavigateToNotifications,
  onNavigateToChat,
  currentUserId,
  className,
}) => {
  return (
    <header
      className={cn(
        'sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        className
      )}
    >
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Spacer for balance */}
          <div className="w-20"></div>

          {/* Brand Section - Logo + Tagline (Centered) */}
          <div className="flex items-center gap-4 flex-1 justify-center">
            <SynthSLogo size="md" className="flex-shrink-0" />
            <div className="hidden sm:flex flex-col">
              <span className="text-lg font-bold text-foreground leading-tight">Synth</span>
              <span className="text-xs text-muted-foreground leading-tight font-normal">
                Discover • Connect • Share
              </span>
            </div>
          </div>

          {/* Actions - More Prominent */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full border-2 hover:bg-synth-pink/10 hover:border-synth-pink/50 transition-all"
              onClick={onNavigateToNotifications}
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-10 w-10 rounded-full border-2 hover:bg-synth-pink/10 hover:border-synth-pink/50 transition-all"
              onClick={() => onNavigateToChat?.(currentUserId)}
              aria-label="Open chat"
            >
              <MessageCircle className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
};

