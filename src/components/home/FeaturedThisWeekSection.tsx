/**
 * Synth 2.0 Home featured shows block (CMO LOI-553 copy).
 * Reads the shared weekly featured SoT (LOI-566) - same source as Discover.
 */
import React, { forwardRef, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Calendar, MessageCircle } from 'lucide-react';
import { SYNTH_20_DEMO, SYNTH_20_HOME } from '@/config/synth20Demo';
import {
  fetchWeeklyFeaturedSet,
  type WeeklyFeaturedShow,
} from '@/services/weeklyFeaturedService';

interface FeaturedThisWeekSectionProps {
  onEventClick?: (eventId: string, name: string) => void;
  onOpenChat?: (eventId: string, chatProvisionKey: string) => void;
  onSeeAll?: () => void;
}

export const FeaturedThisWeekSection = forwardRef<HTMLElement, FeaturedThisWeekSectionProps>(
  function FeaturedThisWeekSection({ onEventClick, onOpenChat, onSeeAll }, ref) {
    const [shows, setShows] = useState<WeeklyFeaturedShow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const copy = SYNTH_20_HOME.featured;

    useEffect(() => {
      if (!SYNTH_20_DEMO) return;
      let cancelled = false;
      (async () => {
        setLoading(true);
        setError(false);
        try {
          const set = await fetchWeeklyFeaturedSet();
          if (!cancelled) {
            setShows((set?.shows ?? []).slice(0, SYNTH_20_HOME.featuredCap));
          }
        } catch (err) {
          console.error('[FeaturedThisWeekSection]', err);
          if (!cancelled) {
            setShows([]);
            setError(true);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []);

    if (!SYNTH_20_DEMO) return null;

    return (
      <section
        ref={ref}
        style={{
          marginBottom: 'var(--spacing-medium, 24px)',
          paddingLeft: 'var(--spacing-small, 12px)',
          paddingRight: 'var(--spacing-small, 12px)',
        }}
      >
        <div
          style={{
            marginBottom: 12,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
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
          {onSeeAll && (
            <button
              type="button"
              onClick={onSeeAll}
              style={{
                flexShrink: 0,
                border: 'none',
                background: 'transparent',
                padding: '4px 0',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--brand-pink-500)',
                cursor: 'pointer',
              }}
            >
              {copy.seeAll}
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ color: 'var(--neutral-500)', fontSize: 14 }}>{copy.loading}</div>
        ) : error ? (
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
            {copy.error}
          </div>
        ) : shows.length === 0 ? (
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
            {shows.map((show) => {
              const label = show.artistName || show.title || 'Show';
              const day = show.eventDate ? format(new Date(show.eventDate), 'EEE') : '';
              const cardLine = [day, show.venueName, show.venueCity].filter(Boolean).join(' · ');
              return (
                <button
                  key={show.eventId}
                  type="button"
                  onClick={() => {
                    onEventClick?.(show.eventId, label);
                    onOpenChat?.(show.eventId, show.chatProvisionKey);
                  }}
                  style={{
                    flex: '0 0 auto',
                    width: 220,
                    textAlign: 'left',
                    border: '1px solid var(--neutral-150, #ebebeb)',
                    borderRadius: 16,
                    background: 'var(--neutral-0, #fff)',
                    padding: 0,
                    overflow: 'hidden',
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                  }}
                >
                  <div
                    style={{
                      height: 110,
                      background: show.imageUrl
                        ? `center/cover no-repeat url(${show.imageUrl})`
                        : 'linear-gradient(135deg, var(--brand-pink-100), var(--neutral-100))',
                    }}
                  />
                  <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div
                      style={{
                        fontWeight: 700,
                        fontSize: 15,
                        color: 'var(--neutral-900)',
                        lineHeight: 1.25,
                      }}
                    >
                      {label}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 12,
                        color: 'var(--neutral-500)',
                      }}
                    >
                      <Calendar size={12} />
                      {cardLine}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        marginTop: 4,
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--brand-pink-500)',
                      }}
                    >
                      <MessageCircle size={12} />
                      {copy.cardCta}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
    );
  }
);

export default FeaturedThisWeekSection;
