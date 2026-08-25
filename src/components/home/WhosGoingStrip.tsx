/**
 * People-going proof strip for Home density composition (LOI-571 AC-1).
 * Faces/names when available; else counts. Never invents cold catalog users.
 */
import React, { useEffect, useState } from 'react';
import { SYNTH_20_DEMO, SYNTH_20_HOME } from '@/config/synth20Demo';
import {
  loadPeopleGoingProof,
  type PeopleGoingProof,
} from '@/services/homeDensityService';
import type { WeeklyFeaturedShow } from '@/services/weeklyFeaturedService';

interface WhosGoingStripProps {
  shows: WeeklyFeaturedShow[];
  onOpenShow?: (eventId: string, name: string) => void;
}

export const WhosGoingStrip: React.FC<WhosGoingStripProps> = ({
  shows,
  onOpenShow,
}) => {
  const [proof, setProof] = useState<PeopleGoingProof[]>([]);
  const [loading, setLoading] = useState(true);
  const copy = SYNTH_20_HOME.whosGoing;

  useEffect(() => {
    if (!SYNTH_20_DEMO) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const map = await loadPeopleGoingProof(shows.map((s) => s.eventId));
        if (cancelled) return;
        const rows = shows
          .map((s) => map.get(s.eventId))
          .filter((p): p is PeopleGoingProof => !!p && p.count > 0)
          .slice(0, 12);
        setProof(rows);
      } catch (err) {
        console.error('[WhosGoingStrip]', err);
        if (!cancelled) setProof([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shows]);

  if (!SYNTH_20_DEMO) return null;

  return (
    <section
      data-testid="home-whos-going-strip"
      aria-label={copy.title}
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
          {copy.title}
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
          {copy.subtitle}
        </p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--neutral-500)', fontSize: 14 }}>Loading who's going…</div>
      ) : proof.length === 0 ? (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            border: '1px solid var(--neutral-200)',
            background: 'var(--neutral-0, #fff)',
            color: 'var(--neutral-600)',
            fontSize: 14,
          }}
        >
          {copy.empty}
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: 12,
            overflowX: 'auto',
            paddingBottom: 8,
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {proof.map((row) => {
            const show = shows.find((s) => s.eventId === row.eventId);
            const label = show?.artistName || show?.title || 'Show';
            return (
              <button
                key={row.eventId}
                type="button"
                onClick={() => onOpenShow?.(row.eventId, label)}
                style={{
                  flex: '0 0 auto',
                  width: 220,
                  textAlign: 'left',
                  border: '1px solid var(--neutral-150, #ebebeb)',
                  borderRadius: 16,
                  background: 'var(--neutral-0, #fff)',
                  padding: 12,
                  cursor: 'pointer',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  {row.faces.length > 0 ? (
                    row.faces.slice(0, 4).map((face, idx) => (
                      <div
                        key={face.userId}
                        title={face.name}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          marginLeft: idx === 0 ? 0 : -8,
                          border: '2px solid #fff',
                          background: face.avatarUrl
                            ? `center/cover no-repeat url(${face.avatarUrl})`
                            : 'var(--brand-pink-500, #e91e8c)',
                          color: '#fff',
                          fontSize: 11,
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {!face.avatarUrl ? face.name.charAt(0).toUpperCase() : null}
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'rgba(233,30,140,0.15)',
                        color: 'var(--brand-pink-500, #e91e8c)',
                        fontSize: 12,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {row.count}
                    </div>
                  )}
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: 14,
                    color: 'var(--neutral-900)',
                    lineHeight: 1.25,
                  }}
                >
                  {row.faces[0]?.name
                    ? `${row.faces[0].name}${row.count > 1 ? ` +${row.count - 1}` : ''}`
                    : `${row.count} going`}
                </div>
                <div style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 4 }}>
                  {label}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default WhosGoingStrip;
