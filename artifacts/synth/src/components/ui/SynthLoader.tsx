import React from 'react';
import { cn } from '@/lib/utils';
import { Music } from 'lucide-react';

export interface SynthLoaderProps {
  /**
   * Size variant: 'sm' | 'md' | 'lg' | 'xl'
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /**
   * Variant: 'spinner' | 'pulse' | 'dots' | 'logo'
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
}

const sizeClasses = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
};

const textSizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
  xl: 'text-lg',
};

export const SynthLoader: React.FC<SynthLoaderProps> = ({
  size = 'md',
  variant = 'spinner',
  text,
  fullPage = false,
  inline = false,
  className,
  background = 'blur',
}) => {
  const renderLoader = () => {
    switch (variant) {
      case 'spinner':
        return (
          <div
            className={cn(
              'relative',
              sizeClasses[size],
              'animate-spin rounded-full border-4 border-synth-pink/20',
              'border-t-synth-pink border-r-synth-pink'
            )}
          >
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-synth-pink/40 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
          </div>
        );

      case 'pulse':
        return (
          <div className="relative">
            <div
              className={cn(
                'rounded-full bg-gradient-to-br from-synth-pink to-synth-pink-light',
                'animate-pulse',
                sizeClasses[size]
              )}
              style={{
                boxShadow: '0 0 20px rgba(255, 51, 153, 0.4)',
              }}
            />
            <div
              className={cn(
                'absolute inset-0 rounded-full bg-gradient-to-br from-synth-pink to-synth-pink-light',
                'animate-ping opacity-75',
                sizeClasses[size]
              )}
            />
          </div>
        );

      case 'dots':
        return (
          <div className="flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={cn(
                  'rounded-full bg-synth-pink',
                  size === 'sm' ? 'w-1.5 h-1.5' : size === 'md' ? 'w-2 h-2' : size === 'lg' ? 'w-3 h-3' : 'w-4 h-4',
                  'animate-bounce'
                )}
                style={{
                  animationDelay: `${i * 0.15}s`,
                  animationDuration: '0.6s',
                }}
              />
            ))}
          </div>
        );

      case 'logo':
        return (
          <div className="relative">
            <div
              className={cn(
                'flex items-center justify-center',
                'rounded-full bg-gradient-to-br from-synth-pink/20 to-synth-pink-light/20',
                'backdrop-blur-sm border-2 border-synth-pink/30',
                sizeClasses[size]
              )}
            >
              <Music
                className={cn(
                  'text-synth-pink animate-pulse',
                  size === 'sm' ? 'w-2 h-2' : size === 'md' ? 'w-4 h-4' : size === 'lg' ? 'w-6 h-6' : 'w-8 h-8'
                )}
              />
            </div>
            <div
              className={cn(
                'absolute inset-0 rounded-full border-2 border-synth-pink/40',
                'animate-ping',
                sizeClasses[size]
              )}
            />
          </div>
        );

      default:
        return null;
    }
  };

  const content = (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      {renderLoader()}
      {text && (
        <p
          className={cn(
            'text-muted-foreground font-medium animate-pulse',
            textSizeClasses[size]
          )}
        >
          {text}
        </p>
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
}> = ({ text = 'Loading...', showLogo = false }) => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-synth-beige/30 to-white">
      <div className="text-center space-y-6 px-4">
        {showLogo && (
          <div className="w-32 h-32 mx-auto mb-4">
            <div className="relative w-full h-full">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-synth-pink/20 to-synth-pink-light/20 animate-pulse" />
              <div className="absolute inset-2 rounded-full bg-gradient-to-br from-synth-pink to-synth-pink-light flex items-center justify-center">
                <Music className="w-16 h-16 text-white" />
              </div>
              <div className="absolute inset-0 rounded-full border-4 border-synth-pink/40 animate-ping" />
            </div>
          </div>
        )}
        <SynthLoader variant="spinner" size="lg" text={text} />
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
}> = ({ text, size = 'md', variant = 'spinner' }) => {
  return <SynthLoader variant={variant} size={size} text={text} inline />;
};

/**
 * Overlay loading component
 */
export const SynthLoadingOverlay: React.FC<{
  text?: string;
  background?: 'transparent' | 'blur' | 'solid';
}> = ({ text, background = 'blur' }) => {
  return <SynthLoader variant="spinner" size="lg" text={text} fullPage background={background} />;
};

