import React from 'react';
import { cn } from '@/lib/utils';

interface JamBaseHeaderAttributionProps {
  className?: string;
}

/**
 * JamBase Header Attribution
 * 
 * A glassmorphism attribution component for the top right corner of the header.
 * Designed for iOS with liquid glass effects. Only shown for events feed.
 */
export const JamBaseHeaderAttribution: React.FC<JamBaseHeaderAttributionProps> = ({
  className,
}) => {
  return (
    <div
      className={cn('jambase-header-attribution', className)}
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        right: 'calc(var(--spacing-screen-margin-x, 20px) + 44px + 12px)',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        padding: '6px 10px',
        borderRadius: '12px',
        background: 'rgba(255, 255, 255, 0.7)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        boxShadow: `
          0 8px 32px 0 rgba(0, 0, 0, 0.1),
          inset 0 1px 0 0 rgba(255, 255, 255, 0.5),
          inset 0 -1px 0 0 rgba(0, 0, 0, 0.05)
        `,
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <a
        href="https://www.jambase.com"
        target="_blank"
        rel="nofollow noopener noreferrer"
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '16px',
          textDecoration: 'none',
          transition: 'opacity 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = '0.8';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = '1';
        }}
      >
        <img
          src="/Jambase Attrition/JamBase API Attribution Logo - 20240807 - Black.png"
          alt="JamBase"
          style={{
            height: '16px',
            width: 'auto',
            objectFit: 'contain',
            imageRendering: 'crisp-edges',
          }}
          onError={(e) => {
            // Fallback to white version if black doesn't load
            const target = e.currentTarget;
            if (target.src.includes('Black')) {
              target.src = '/Jambase Attrition/JamBase API Attribution Logo - 20240807 - White.png';
            }
          }}
        />
      </a>
    </div>
  );
};
