/**
 * "Alex is typing…" line above the composer.
 *
 * Reserves no space when nobody is typing — the composer must not jump.
 */

import React from 'react';
import { formatTypingIndicator, type TypingUser } from '@synth/shared';

export const TypingIndicator: React.FC<{ users: TypingUser[] }> = ({ users }) => {
  if (!users.length) return null;

  return (
    <p
      aria-live="polite"
      style={{
        margin: 0,
        paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
        paddingBottom: 4,
        fontFamily: 'var(--font-family)',
        fontSize: 12,
        fontStyle: 'italic',
        lineHeight: 1.3,
        color: 'var(--neutral-600)',
      }}
    >
      {formatTypingIndicator(users)}
    </p>
  );
};
