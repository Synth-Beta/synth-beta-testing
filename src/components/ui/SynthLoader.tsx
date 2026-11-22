import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Music } from 'lucide-react';

export interface SynthLoaderProps {
  /**
   * Size variant: 'sm' | 'md' | 'lg' | 'xl'
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * Kept for existing callers; every variant now renders the same calm spinner.
   */
  variant?: 'spinner' | 'pulse' | 'dots' | 'logo';
  /**
   * Show text below loader
   */
  text?: string;
  /**
   * Full page overlay (covers entire screen)
   */
  fullPage?: boolean;
  /**
   * Inline loader (doesn't cover content)
   */
  inline?: boolean;
  /**
   * Custom className
   */
  className?: string;
  /**
   * Background color variant
   */
  background?: 'transparent' | 'blur' | 'solid';
  /**
   * Wait this long before showing anything, so fast loads never flash a spinner. Default 300ms.
   */
  delayMs?: number;
}

const sizeClasses = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-[3px]',
  lg: 'w-12 h-12 border-4',
  xl: 'w-16 h-16 border-4',
};

const textSizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
};

export const SynthLoader: React.FC<SynthLoaderProps> = ({
  size = 'md',
  text,
  fullPage = false,
  inline = false,
  className,
  background = 'blur',
  delayMs = 300,
}) => {
  const [visible, setVisible] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) return;
    const t = setTimeout(() => setVisible(true), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);

  const content = (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3', !visible && 'invisible', className)}
    >
      {/* One ring at constant speed: it shows work is happening and nothing more. */}
      <div
        className={cn('rounded-full animate-spin border-synth-pink/20 border-t-synth-pink', sizeClasses[size])}
        style={{ animationDuration: '0.9s' }}
      />
      {text ? (
        <p className={cn('text-muted-foreground font-medium', textSizeClasses[size])}>{text}</p>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );

  if (fullPage) {
    return (
      <div
        className={cn(
          'fixed inset-0 z-50 flex items-center justify-center',
          background === 'blur' && 'bg-background/80 backdrop-blur-sm',
          background === 'solid' && 'bg-background',
          background === 'transparent' && 'bg-transparent'
        )}
      >
        <div className="text-center space-y-6">
          {content}
        </div>
      </div>
    );
  }

  if (inline) {
    return (
      <div className={cn('flex items-center justify-center py-8', className)}>
        {content}
      </div>
    );
  }

  return content;
};

/**
 * Full page loading screen
 */
export const SynthLoadingScreen: React.FC<{
  text?: string;
  showLogo?: boolean;
}> = ({ text = 'Loading…', showLogo = false }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-6 px-4">
        {showLogo && (
          <div className="w-20 h-20 mx-auto rounded-2xl bg-synth-pink flex items-center justify-center">
            <Music className="w-10 h-10 text-white" />
          </div>
        )}
        <SynthLoader size="lg" text={text} />
      </div>
    </div>
  );
};

/**
 * Inline loading component for sections
 */
export const SynthLoadingInline: React.FC<{
  text?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'spinner' | 'pulse' | 'dots';
}> = ({ text, size = 'md' }) => {
  return <SynthLoader size={size} text={text} inline />;
};

/**
 * Overlay loading component
 */
export const SynthLoadingOverlay: React.FC<{
  text?: string;
  background?: 'transparent' | 'blur' | 'solid';
}> = ({ text, background = 'blur' }) => {
  return <SynthLoader size="lg" text={text} fullPage background={background} />;
};
