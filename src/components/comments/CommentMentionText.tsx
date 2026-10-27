import React from 'react';
import { parseCommentMentionSegments } from '@synth/shared';

interface CommentMentionTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  onMentionClick?: (userId: string) => void;
}

/** Renders comment body with structured @[user](user:id) tokens as pink @handles. */
export function CommentMentionText({
  text,
  className,
  style,
  onMentionClick,
}: CommentMentionTextProps) {
  const segments = parseCommentMentionSegments(text || '');

  return (
    <p className={className} style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', ...style }}>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <React.Fragment key={i}>{seg.value}</React.Fragment>;
        }
        const handle = `@${seg.username}`;
        if (onMentionClick) {
          return (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onMentionClick(seg.userId);
              }}
              className="font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-500"
              style={{
                color: 'var(--brand-pink-500)',
                background: 'transparent',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                font: 'inherit',
              }}
            >
              {handle}
            </button>
          );
        }
        return (
          <span key={i} style={{ color: 'var(--brand-pink-500)', fontWeight: 500 }}>
            {handle}
          </span>
        );
      })}
    </p>
  );
}
