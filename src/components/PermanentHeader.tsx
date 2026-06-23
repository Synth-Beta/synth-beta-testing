import React from 'react';
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
      className={cn('fixed left-0 right-0', className)}
      style={{
        top: 'env(safe-area-inset-top, 54px)',
        zIndex: 'var(--z-index-modal, 100)' as any,
        boxShadow: 'var(--shadow-default)',
      }}
    >
      <div
        className="flex items-center justify-between px-5 pb-4"
        style={{
          height: '59px',
          backgroundColor: 'var(--neutral-50)',
        }}
      >
        {/* Left side: Synth Logo and Text */}
        <div className="flex items-center" style={{ gap: '3px' }}>
          <div className="relative shrink-0" style={{ width: '50px', height: '50px' }}>
            <img
              src="/Logos/Main logo black background.png"
              alt="Synth Logo"
              className="absolute inset-0 max-w-none object-cover pointer-events-none w-full h-full"
            />
          </div>
          <p
            className="relative shrink-0 whitespace-pre-wrap"
            style={{
              fontFamily: 'var(--font-family)',
              fontSize: '36px',
              fontWeight: 'var(--typography-h1-weight, 700)',
              lineHeight: 'normal',
              color: 'var(--neutral-900)',
              width: '93px',
              height: '52px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            ynth
          </p>
        </div>

        {/* Right side: Notification Bell Button */}
        <div className="relative">
          <NotificationBell
            onClick={onNavigateToNotifications}
            className="p-3 flex items-center justify-center transition-colors border-0 hover:bg-[var(--brand-pink-600)]"
            style={{
              backgroundColor: 'var(--brand-pink-500)',
              borderRadius: 'var(--radius-corner, 10px)',
              boxShadow: 'var(--shadow-default)',
              width: 'var(--size-input-height, 44px)',
              height: 'var(--size-input-height, 44px)',
            }}
          />
        </div>
      </div>
    </header>
  );
};
