import React from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { cn } from '@/lib/utils';

interface PermanentHeaderProps {
  currentUserId: string;
  onNavigateToNotifications?: () => void;
  className?: string;
}

export const PermanentHeader: React.FC<PermanentHeaderProps> = ({
  currentUserId,
  onNavigateToNotifications,
  className,
}) => {
  return (
    <header
      className={cn(
        'fixed left-0 right-0 z-50 bg-transparent shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]',
        className
      )}
      style={{ 
        top: 'env(safe-area-inset-top, 54px)',
        paddingTop: 0
      }}
    >
      <div className="flex items-center justify-between h-[59px] px-5 pb-4 bg-[#fcfcfc]">
        {/* Left side: Synth Logo and Text */}
        <div className="flex items-center gap-[3px]">
          <div className="relative shrink-0 w-[50px] h-[50px]">
            <img
              src="/Logos/Main logo black background.png"
              alt="Synth Logo"
              className="absolute inset-0 max-w-none object-cover pointer-events-none w-full h-full"
            />
          </div>
          <p
            className="font-['Inter',sans-serif] font-bold h-[52px] leading-[normal] not-italic relative shrink-0 text-[36px] text-[#0e0e0e] w-[93px] whitespace-pre-wrap"
            style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
          >
            ynth
          </p>
        </div>

        {/* Right side: Notification Bell Button */}
        <div className="relative">
          <NotificationBell
            onClick={onNavigateToNotifications}
            className="bg-[#cc2486] hover:bg-[#b01f75] p-3 rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] w-[44px] h-[44px] flex items-center justify-center transition-colors border-0"
          />
        </div>
      </div>
    </header>
  );
};

