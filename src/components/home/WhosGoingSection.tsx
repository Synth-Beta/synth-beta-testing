/**
 * Synth 2.0 Home "Who's going" proof block. CMO-approved copy from LOI-553.
 */
import React, { useMemo, useState } from 'react';
import { format } from 'date-fns';
import type { NetworkEvent } from '@/services/homeFeedService';
import { SYNTH_20_COPY } from '@/config/synth20Demo';

interface WhosGoingSectionProps {
  events: NetworkEvent[];
  onEventClick?: (eventId: string) => void;
  onOverflow?: () => void;
  /** When true, show "You're going" affordance state for demo. */
  userMarkedGoing?: boolean;
}

const INITIAL_VISIBLE = 6;

export const WhosGoingSection: React.FC<WhosGoingSectionProps> = ({
  events,
  onEventClick,
  onOverflow,
  userMarkedGoing = false,
}) => {
  const copy = SYNTH_20_COPY.whosGoing;
  const [expanded, setExpanded] = useState(false);

  const goingRows = useMemo(() => {
    const going = events.filter((e) => e.action_type === 'going' || e.action_type === 'interested');
    const seen = new Set<string>();
    const unique: NetworkEvent[] = [];
    for (const row of going) {
      const key = `${row.friend_id}-${row.event_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }
    return unique;
  }, [events]);

  const visible = expanded ? goingRows : goingRows.slice(0, INITIAL_VISIBLE);
  const hasOverflow = goingRows.length > INITIAL_VISIBLE;

  return (
    <section
      aria-label={copy.sectionTitle}
      style={{
        marginBottom: 'var(--spacing-medium, 24px)',
        paddingLeft: 'var(--spacing-small, 12px)',
        paddingRight: 'var(--spacing-small, 12px)',
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <h2
          style={{
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-h2-size, 24px)',
            fontWeight: 700,
            color: 'var(--neutral-900)',
            margin: 0,
          }}
        >
          {copy.sectionTitle}
        </h2>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: 14,
            color: 'var(--neutral-600)',
            lineHeight: 1.4,
            maxWidth: 520,
          }}
        >
          {copy.sectionSub}
        </p>
      </div>

      {goingRows.length === 0 ? (
        <div
          style={{
            padding: 16,
            borderRadius: 12,
            border: '1px solid var(--neutral-200)',
            background: 'var(--neutral-0, #fff)',
            color: 'var(--neutral-600)',
            fontSize: 14,
          }}
        >
          <p style={{ margin: 0 }}>{copy.empty}</p>
          <p
            style={{
              margin: '10px 0 0',
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--brand-pink-500)',
            }}
          >
            {userMarkedGoing ? copy.affordanceDone : copy.affordance}
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {visible.map((row) => {
            const day = row.event_date ? format(new Date(row.event_date), 'EEE') : '';
            const show = row.artist_name || row.title || 'Show';
            const line = [row.friend_name, show, day].filter(Boolean).join(' · ');
            return (
              <li key={`${row.friend_id}-${row.event_id}-${row.action_type}`}>
                <button
                  type="button"
                  onClick={() => onEventClick?.(row.event_id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: '1px solid var(--neutral-150, #ebebeb)',
                    borderRadius: 12,
                    background: 'var(--neutral-0, #fff)',
                    padding: '12px 14px',
                    cursor: 'pointer',
                    fontSize: 14,
                    color: 'var(--neutral-900)',
                  }}
                >
                  {line}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hasOverflow && !expanded && (
        <button
          type="button"
          onClick={() => {
            setExpanded(true);
            onOverflow?.();
          }}
          style={{
            marginTop: 12,
            border: 'none',
            background: 'transparent',
            color: 'var(--brand-pink-500)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {copy.overflow}
        </button>
      )}
    </section>
  );
};

export default WhosGoingSection;
