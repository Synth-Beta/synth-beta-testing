/**
 * Synth 2.0 Home featured block: this week's featured / promoted DC shows.
 * Uses existing events.is_promoted + promotion_tier — no new schema.
 * Copy: CMO-approved LOI-553 (homepage-copy-draft).
 */
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { MessageCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PromotedEventBadge } from '@/components/events/PromotedEventBadge';
import {
  SYNTH_20_DEMO,
  SYNTH_20_HOME,
  SYNTH_20_COPY,
  promotionRank,
} from '@/config/synth20Demo';

export type FeaturedWeekEvent = {
  id: string;
  title: string | null;
  artist_name: string | null;
  venue_name: string | null;
  venue_city: string | null;
  event_date: string;
  image_url?: string | null;
  is_promoted?: boolean | null;
  promotion_tier?: 'basic' | 'premium' | 'featured' | null;
  going_count?: number | null;
};

interface FeaturedThisWeekSectionProps {
  onEventClick?: (eventId: string, name: string) => void;
  onOpenChat?: (eventId: string) => void;
  onSeeAll?: () => void;
}

function isDcCity(city: string | null | undefined): boolean {
  if (!city) return false;
  const c = city.toLowerCase();
  return (
    c.includes('washington') ||
    c === 'dc' ||
    c.includes('arlington') ||
    c.includes('alexandria') ||
    c.includes('silver spring') ||
    c.includes('bethesda')
  );
}

function neighborhoodFromCity(city: string | null | undefined): string {
  if (!city) return 'DC';
  const trimmed = city.replace(/,\s*DC$/i, '').replace(/Washington/i, 'DC').trim();
  return trimmed || 'DC';
}

export const FeaturedThisWeekSection: React.FC<FeaturedThisWeekSectionProps> = ({
  onEventClick,
  onOpenChat,
  onSeeAll,
}) => {
  const [events, setEvents] = useState<FeaturedWeekEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const copy = SYNTH_20_COPY.featured;

  useEffect(() => {
    if (!SYNTH_20_DEMO) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(false);
      try {
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from('events')
          .select(
            'id, title, artist_name, venue_name, venue_city, event_date, image_url, is_promoted, promotion_tier'
          )
          .gte('event_date', now)
          .order('event_date', { ascending: true })
          .limit(80);

        if (error) throw error;

        const dc = (data || []).filter((e) => isDcCity(e.venue_city));
        const ranked = [...dc].sort((a, b) => {
          const pr =
            promotionRank(b.promotion_tier, !!b.is_promoted) -
            promotionRank(a.promotion_tier, !!a.is_promoted);
          if (pr !== 0) return pr;
          return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
        });

        // Prefer promoted; if none are promoted yet, still show the next DC shows so the demo isn't empty.
        const promoted = ranked.filter(
          (e) => e.is_promoted || (e.promotion_tier && e.promotion_tier !== null)
        );
        const picked = (promoted.length > 0 ? promoted : ranked).slice(
          0,
          SYNTH_20_HOME.featuredCap
        );

        if (!cancelled) setEvents(picked as FeaturedWeekEvent[]);
      } catch (err) {
        console.error('[FeaturedThisWeekSection]', err);
        if (!cancelled) {
          setEvents([]);
          setLoadError(true);
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
      id="synth20-featured-week"
      aria-label={copy.sectionTitle}
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
        {onSeeAll && (
          <button
            type="button"
            onClick={onSeeAll}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--brand-pink-500)',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              marginTop: 4,
            }}
          >
            {copy.seeAll}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ color: 'var(--neutral-500)', fontSize: 14 }}>{copy.loading}</div>
      ) : loadError ? (
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
      ) : events.length === 0 ? (
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
          {events.map((event) => {
            const label = event.artist_name || event.title || 'Show';
            const day = event.event_date ? format(new Date(event.event_date), 'EEE') : '';
            const cardLine = [day, event.venue_name, neighborhoodFromCity(event.venue_city)]
              .filter(Boolean)
              .join(' · ');
            const going =
              typeof event.going_count === 'number' && event.going_count > 0
                ? copy.goingCount(event.going_count)
                : null;
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => {
                  onEventClick?.(event.id, label);
                  onOpenChat?.(event.id);
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
                    background: event.image_url
                      ? `center/cover no-repeat url(${event.image_url})`
                      : 'linear-gradient(135deg, var(--brand-pink-100), var(--neutral-100))',
                  }}
                />
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(event.is_promoted || event.promotion_tier) && (
                    <PromotedEventBadge
                      promotionTier={(event.promotion_tier as 'basic' | 'premium' | 'featured') || 'basic'}
                    />
                  )}
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
                      fontSize: 12,
                      color: 'var(--neutral-500)',
                      lineHeight: 1.35,
                    }}
                  >
                    {cardLine}
                  </div>
                  {going && (
                    <div style={{ fontSize: 12, color: 'var(--neutral-600)', fontWeight: 600 }}>
                      {going}
                    </div>
                  )}
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
};

export default FeaturedThisWeekSection;
