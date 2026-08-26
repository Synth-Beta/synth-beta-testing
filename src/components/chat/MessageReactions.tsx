/**
 * Reaction pills under a message bubble, and the picker that adds one.
 *
 * Requires supabase/chat-parity-2026-08-25/02_message_reactions.sql. Renders
 * nothing when there are no reactions, so it is inert before the migration.
 */

import React, { useEffect, useRef, useState } from 'react';
import { SmilePlus } from 'lucide-react';
import { DEFAULT_REACTION_EMOJIS, type ReactionSummary } from '@synth/shared';

interface MessageReactionsProps {
  reactions: ReactionSummary[];
  align: 'flex-start' | 'flex-end';
  onToggle: (emoji: string) => void;
}

export const MessageReactions: React.FC<MessageReactionsProps> = ({
  reactions,
  align,
  onToggle,
}) => {
  if (!reactions.length) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 4,
        alignSelf: align,
        marginTop: 4,
      }}
    >
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          type="button"
          onClick={() => onToggle(reaction.emoji)}
          aria-label={`${reaction.emoji} ${reaction.count}${reaction.reactedByMe ? ', you reacted' : ''}`}
          aria-pressed={reaction.reactedByMe}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            padding: '2px 7px',
            borderRadius: 999,
            fontSize: 12,
            lineHeight: 1.4,
            cursor: 'pointer',
            // Your own reactions read as selected.
            border: reaction.reactedByMe
              ? '1px solid var(--brand-pink-500)'
              : '1px solid var(--neutral-200)',
            background: reaction.reactedByMe ? 'rgba(236, 72, 153, 0.10)' : 'var(--neutral-50)',
            color: 'var(--neutral-900)',
          }}
        >
          <span>{reaction.emoji}</span>
          {reaction.count > 1 && <span style={{ fontWeight: 600 }}>{reaction.count}</span>}
        </button>
      ))}
    </div>
  );
};

interface ReactionPickerProps {
  onPick: (emoji: string) => void;
  /** Which side of the bubble the popup opens toward. */
  align: 'flex-start' | 'flex-end';
}

export const ReactionPicker: React.FC<ReactionPickerProps> = ({ onPick, align }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Add reaction"
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 24,
          height: 24,
          borderRadius: 999,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: 'var(--neutral-600)',
        }}
      >
        <SmilePlus size={15} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            bottom: '100%',
            marginBottom: 4,
            [align === 'flex-end' ? 'right' : 'left']: 0,
            display: 'flex',
            gap: 2,
            padding: 4,
            borderRadius: 999,
            background: 'var(--neutral-50)',
            border: '1px solid var(--neutral-200)',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.12)',
            zIndex: 30,
          }}
        >
          {DEFAULT_REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              onClick={() => {
                onPick(emoji);
                setOpen(false);
              }}
              aria-label={`React with ${emoji}`}
              style={{
                border: 'none',
                background: 'transparent',
                fontSize: 18,
                lineHeight: 1,
                padding: 3,
                borderRadius: 6,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--neutral-100)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
