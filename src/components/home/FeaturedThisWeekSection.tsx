/**
 * Synth 2.0 Home + Discover featured strip (LOI-646).
 * Both surfaces read the same SoT week via fetchDemoWeeklyFeaturedSet (2026-W35).
 * Empty / unpublished / wrong-week responses degrade to the curated empty state.
 * Order follows SoT position; no hard-coded pin list / seed fixtures.
 */
import React, { forwardRef, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Calendar, MessageCircle } from 'lucide-react';
import {
  SYNTH_20_DEMO,
  SYNTH_20_FEATURED_WEEK_ID,
  SYNTH_20_HOME,
} from '@/config/synth20Demo';
import {
  fetchDemoWeeklyFeaturedSet,
  type WeeklyFeaturedShow,
} from '@/services/weeklyFeaturedService';

interface FeaturedThisWeekSectionProps {
  onEventClick?: (eventId: string, name: string) => void;
  onOpenChat?: (eventId: string, chatProvisionKey: string) => void;
  onSeeAll?: () => void;
}

function formatGenreChip(genre: string | null | undefined): string | null {
  if (!genre?.trim()) return null;
  return genre
    .trim()
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export const FeaturedThisWeekSection = forwardRef<HTMLElement, FeaturedThisWeekSectionProps>(
  function FeaturedThisWeekSection({ onEventClick, onOpenChat, onSeeAll }, ref) {
    const [shows, setShows] = useState<WeeklyFeaturedShow[]>([]);
    const [weekId, setWeekId] = useState(SYNTH_20_FEATURED_WEEK_ID);
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
          const set = await fetchDemoWeeklyFeaturedSet();
          if (!cancelled) {
            setWeekId(set?.weekId ?? SYNTH_20_FEATURED_WEEK_ID);
            // Position order comes from SoT; cap is density max (15), never a hard-coded pin list.
            setShows((set?.shows ?? []).slice(0, SYNTH_20_HOME.featuredCap));
          }
        } catch (err) {
          console.error('[FeaturedThisWeekSection]', err);
          if (!cancelled) {
            setShows([]);
            setWeekId(SYNTH_20_FEATURED_WEEK_ID);
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
        id="synth20-featured-week"
        data-testid="home-featured-this-week"
        data-featured-week={weekId}
        data-featured-count={shows.length}
        aria-label={copy.title}
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
              const genreChip = formatGenreChip(show.genre);
              const blurb = show.curatorNote?.trim() || null;
              return (
                <button
                  key={show.eventId}
                  type="button"
                  data-featured-position={show.position}
                  data-event-id={show.eventId}
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
                    {genreChip ? (
                      <span
                        style={{
                          alignSelf: 'flex-start',
                          fontSize: 11,
                          fontWeight: 600,
                          letterSpacing: 0.2,
                          color: 'var(--brand-pink-600, #b01d6e)',
                          background: 'var(--brand-pink-50, #fce8f3)',
                          borderRadius: 999,
                          padding: '2px 8px',
                        }}
                      >
                        {genreChip}
                      </span>
                    ) : null}
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
                    {blurb ? (
                      <p
                        style={{
                          margin: 0,
                          fontSize: 12,
                          lineHeight: 1.35,
                          color: 'var(--neutral-700)',
                        }}
                      >
                        {blurb}
                      </p>
                    ) : null}
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
