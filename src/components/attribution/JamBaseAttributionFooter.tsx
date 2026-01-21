import React from 'react';
import { JamBaseAttribution } from './JamBaseAttribution';

interface JamBaseAttributionFooterProps {
  showDivider?: boolean;
  className?: string;
}

/**
 * JamBase Attribution Footer Wrapper
 * 
 * Provides spacing and optional divider above JamBase attribution.
 * Use this component at the bottom of pages/screens that display JamBase data.
 */
export const JamBaseAttributionFooter: React.FC<JamBaseAttributionFooterProps> = ({
  showDivider = true,
  className = '',
}) => {
  return (
    <div
      className={className}
      style={{
        marginTop: 'var(--spacing-small, 12px)',
        paddingTop: showDivider ? 'var(--spacing-small, 12px)' : 0,
        borderTop: showDivider
          ? '1px solid var(--neutral-200)'
          : 'none',
      }}
    >
      <JamBaseAttribution variant="footer" />
    </div>
  );
};
