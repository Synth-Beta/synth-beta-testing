/**
 * The quoted-message bar. Used in two places:
 * - inside a bubble, showing what a reply is answering
 * - above the composer, showing what you are about to reply to (with a dismiss)
 *
 * Requires supabase/chat-parity-2026-08-25/01_message_reply_to.sql.
 */

import React from 'react';
import { X } from 'lucide-react';
import type { QuotedMessage } from '@synth/shared';

interface ReplyQuoteProps {
  quote: QuotedMessage;
  /** Renders on a sent (pink) bubble, so the quote needs light-on-dark colours. */
  onSentBubble?: boolean;
  onDismiss?: () => void;
  onClick?: () => void;
}

export const ReplyQuote: React.FC<ReplyQuoteProps> = ({
  quote,
  onSentBubble = false,
  onDismiss,
  onClick,
}) => {
  const accent = onSentBubble ? 'rgba(255, 255, 255, 0.75)' : 'var(--brand-pink-500)';
  const nameColor = onSentBubble ? 'rgba(255, 255, 255, 0.95)' : 'var(--neutral-900)';
  const textColor = onSentBubble ? 'rgba(255, 255, 255, 0.75)' : 'var(--neutral-600)';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: onDismiss ? 0 : 6,
        paddingLeft: 8,
        borderLeft: `3px solid ${accent}`,
        cursor: onClick ? 'pointer' : 'default',
        // The bubble around this is width:fit-content. Without a floor, the
        // ellipsised children below report a near-zero min-content width and the
        // whole bubble collapses into a tall narrow column.
        minWidth: 190,
        maxWidth: '100%',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-family)',
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1.3,
            color: nameColor,
            // Names wrap mid-word without this ("Sam Loiterstei / n").
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {quote.sender_name}
        </p>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-family)',
            fontSize: 12,
            lineHeight: 1.35,
            color: textColor,
            // One line only — the quote is a hint, not a re-read.
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {quote.preview}
        </p>
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cancel reply"
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
            height: 24,
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'var(--neutral-600)',
          }}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};
