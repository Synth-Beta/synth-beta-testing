import React from 'react';

interface JamBaseAttributionProps {
  variant?: 'footer' | 'inline';
  className?: string;
}

/**
 * JamBase Attribution Component
 * 
 * Displays "Powered by JamBase" attribution as required by JamBase API terms.
 * The "JamBase" text links to https://www.jambase.com with rel="nofollow" as required.
 * 
 * Variants:
 * - "footer": For bottom of page/screen placement
 * - "inline": For placement under standalone cards or sections
 */
export const JamBaseAttribution: React.FC<JamBaseAttributionProps> = ({
  variant = 'footer',
  className = '',
}) => {
  const baseStyles: React.CSSProperties = {
    fontFamily: 'var(--font-family)',
    fontSize: 'var(--typography-meta-size, 14px)',
    fontWeight: 'var(--typography-meta-weight, 500)',
    lineHeight: 'var(--typography-meta-line-height, 1.5)',
    color: 'var(--neutral-600)',
    textAlign: variant === 'footer' ? 'center' : 'left',
  };

  const linkStyles: React.CSSProperties = {
    color: 'var(--neutral-600)',
    textDecoration: 'underline',
    textDecorationColor: 'var(--neutral-400)',
    textUnderlineOffset: '2px',
    transition: 'color 0.2s ease',
  };

  const containerStyles: React.CSSProperties =
    variant === 'footer'
      ? {
          paddingTop: 'var(--spacing-small, 12px)',
          paddingBottom: 'var(--spacing-small, 12px)',
        }
      : {
          paddingTop: 'var(--spacing-small, 12px)',
        };

  return (
    <div
      className={className}
      style={{
        ...containerStyles,
        ...baseStyles,
      }}
    >
      <span>
        Powered by{' '}
        <a
          href="https://www.jambase.com"
          target="_blank"
          rel="nofollow noopener noreferrer"
          style={linkStyles}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--neutral-900)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--neutral-600)';
          }}
        >
          JamBase
        </a>
      </span>
    </div>
  );
};
