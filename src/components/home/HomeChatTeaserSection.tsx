/**
 * Home chat teaser entry points. CMO-approved copy from LOI-553.
 * Pass real show/scene rows when available; otherwise show the approved hint.
 */
import React from 'react';
import { MessageCircle } from 'lucide-react';
import { SYNTH_20_COPY, navigateSynthView } from '@/config/synth20Demo';

export type HomeChatTeaserRow = {
  id: string;
  label: string;
  messageCount: number;
  kind: 'show' | 'scene';
};

interface HomeChatTeaserSectionProps {
  rows?: HomeChatTeaserRow[];
  onOpenChat?: (row: HomeChatTeaserRow) => void;
  onOpenMessages?: () => void;
}

export const HomeChatTeaserSection: React.FC<HomeChatTeaserSectionProps> = ({
  rows = [],
  onOpenChat,
  onOpenMessages,
}) => {
  const copy = SYNTH_20_COPY.chats;

  const openMessages = () => {
    if (onOpenMessages) {
      onOpenMessages();
      return;
    }
    navigateSynthView('chat');
  };

  return (
    <section
      aria-label={copy.homeTeaserLabel}
      style={{
        marginBottom: 'var(--spacing-medium, 24px)',
        paddingLeft: 'var(--spacing-small, 12px)',
        paddingRight: 'var(--spacing-small, 12px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-h2-size, 24px)',
            fontWeight: 700,
            color: 'var(--neutral-900)',
            margin: 0,
          }}
        >
          {copy.homeTeaserLabel}
        </h2>
        <button
          type="button"
          onClick={openMessages}
          style={{
            border: 'none',
            background: 'transparent',
            color: 'var(--brand-pink-500)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {copy.sceneChatCta}
        </button>
      </div>

      {rows.length === 0 ? (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: '1px solid var(--neutral-200)',
            background: 'var(--neutral-0, #fff)',
          }}
        >
          <p style={{ margin: 0, fontSize: 14, color: 'var(--neutral-600)', lineHeight: 1.4 }}>
            {copy.newThreadHint}
          </p>
          <button
            type="button"
            onClick={openMessages}
            style={{
              marginTop: 12,
              border: 'none',
              background: 'transparent',
              color: 'var(--brand-pink-500)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {copy.showChatCta}
          </button>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => {
                  if (onOpenChat) onOpenChat(row);
                  else openMessages();
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  textAlign: 'left',
                  border: '1px solid var(--neutral-150, #ebebeb)',
                  borderRadius: 12,
                  background: 'var(--neutral-0, #fff)',
                  padding: '12px 14px',
                  cursor: 'pointer',
                }}
              >
                <MessageCircle size={16} style={{ color: 'var(--brand-pink-500)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14, color: 'var(--neutral-900)' }}>
                  {copy.teaserRow(row.label, row.messageCount)}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--brand-pink-500)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.kind === 'show' ? copy.showChatCta : copy.sceneChatCta}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default HomeChatTeaserSection;
