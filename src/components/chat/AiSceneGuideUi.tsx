import React from 'react';
import {
  AI_PROFILE_COPY,
  type SourceChipFact,
} from './aiSceneGuideConstants';

/** @deprecated Kept for imports; no longer rendered in consumer chat. */
export function AiBadge(_props?: { compact?: boolean }) {
  return null;
}

export function AiSceneGuideRoomNotice({
  onMute,
  muted,
}: {
  onMute?: () => void;
  muted?: boolean;
}) {
  if (!onMute) return null;
  return (
    <div
      role="status"
      style={{
        margin: '8px 12px',
        padding: '8px 12px',
        background: 'transparent',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        justifyContent: 'flex-end',
      }}
    >
      <button
        type="button"
        onClick={onMute}
        style={{
          flexShrink: 0,
          border: '1px solid var(--neutral-300)',
          background: 'var(--neutral-0)',
          borderRadius: 6,
          padding: '4px 8px',
          fontSize: 12,
          cursor: 'pointer',
          color: 'var(--neutral-700, #404040)',
        }}
      >
        {muted ? 'Guides muted' : 'Mute scene guides'}
      </button>
    </div>
  );
}

export function AiSourceChips({ facts }: { facts: SourceChipFact[] }) {
  if (!facts.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
      {facts.map((f) => {
        const isSignal = f.kind === 'topic_signal' || f.sourceKind === 'approved_reddit_api';
        return (
          <a
            key={f.id}
            href={f.sourceUrl.startsWith('http') ? f.sourceUrl : undefined}
            target="_blank"
            rel="noreferrer"
            title={`${f.sourceTitle}${f.retrievedAt ? ` · retrieved ${f.retrievedAt}` : ''}`}
            style={{
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 999,
              border: '1px solid var(--neutral-300)',
              color: 'var(--neutral-700)',
              textDecoration: 'none',
              background: 'var(--neutral-0)',
            }}
          >
            {isSignal ? 'topic signal' : 'source'}: {f.sourceTitle.slice(0, 28)}
            {f.confidence != null ? ` · ${Math.round(f.confidence * 100)}%` : ''}
          </a>
        );
      })}
    </div>
  );
}

export function AiSpoilerText({
  text,
  revealed,
  onReveal,
}: {
  text: string;
  revealed: boolean;
  onReveal: () => void;
}) {
  if (revealed) {
    return <span>{text}</span>;
  }
  return (
    <button
      type="button"
      onClick={onReveal}
      style={{
        border: 'none',
        background: 'var(--neutral-300)',
        color: 'var(--neutral-800)',
        borderRadius: 4,
        padding: '2px 8px',
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      Show setlist spoiler
    </button>
  );
}

export function AiSceneGuideProfileDrawer({
  displayName,
  onClose,
}: {
  displayName: string;
  onClose?: () => void;
}) {
  return (
    <div style={{ padding: 16, maxWidth: 360 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <strong>{displayName}</strong>
      </div>
      <p style={{ margin: '0 0 8px', fontSize: 14 }}>{AI_PROFILE_COPY.operatedBy}</p>
      <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--neutral-600)' }}>
        {AI_PROFILE_COPY.whatItDoes}
      </p>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--neutral-600)' }}>
        {AI_PROFILE_COPY.whySeeingThis}
      </p>
      {onClose && (
        <button type="button" onClick={onClose} style={{ marginTop: 12 }}>
          Close
        </button>
      )}
    </div>
  );
}

export function AiGuideMessageBubble({
  content,
  containsSetlistSpoiler,
  sourceFacts,
  isSent,
}: {
  content: string;
  containsSetlistSpoiler?: boolean;
  sourceFacts?: SourceChipFact[];
  isSent?: boolean;
}) {
  const [revealed, setRevealed] = React.useState(false);
  return (
    <div
      style={{
        display: 'inline-block',
        width: 'fit-content',
        alignSelf: isSent ? 'flex-end' : 'flex-start',
        maxWidth: 'min(340px, 72%)',
        padding: '12px',
        borderRadius: 10,
        border: '1px solid var(--neutral-200)',
        backgroundColor: 'var(--neutral-100)',
        opacity: 0.92,
      }}
    >
      <p
        style={{
          fontFamily: 'var(--font-family)',
          fontSize: 14,
          fontWeight: 500,
          lineHeight: 1.4,
          margin: 0,
          color: 'var(--neutral-900)',
          whiteSpace: 'pre-wrap',
        }}
      >
        {containsSetlistSpoiler ? (
          <AiSpoilerText text={content} revealed={revealed} onReveal={() => setRevealed(true)} />
        ) : (
          content
        )}
      </p>
      {sourceFacts && <AiSourceChips facts={sourceFacts} />}
    </div>
  );
}
