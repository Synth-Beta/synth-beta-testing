/**
 * Home featured shows (LOI-571 AC-1): weekly SoT, collision order, 10–15 band clamp.
 * People-going proof + show-chat entry on each card. Mid-week drops keep rail layout (T4).
 */
import React, { forwardRef, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Calendar, MessageCircle } from 'lucide-react';
import { FEATURED_MAX, FEATURED_MIN, FEATURED_TARGET, dcWeekId } from '@synth/shared';
import { SYNTH_20_DEMO, SYNTH_20_HOME } from '@/config/synth20Demo';
import {
  fetchWeeklyFeaturedSet,
  type WeeklyFeaturedShow,
} from '@/services/weeklyFeaturedService';
import {
  clampFeaturedBand,
  flagPmFeaturedBand,
  getSeedFeaturedShows,
  goingLabel,
  loadPeopleGoingProof,
  orderFeaturedByCollisionPotential,
  type PeopleGoingProof,
} from '@/services/homeDensityService';
import { UserEventService } from '@/services/userEventService';
import { supabase } from '@/integrations/supabase/client';

interface FeaturedThisWeekSectionProps {
  onEventClick?: (eventId: string, name: string) => void;
  onOpenChat?: (eventId: string, chatProvisionKey: string) => void;
  onSeeAll?: () => void;
  /** Lift featured shows for sibling strips (who’s going). */
  onShowsChange?: (shows: WeeklyFeaturedShow[]) => void;
}

export const FeaturedThisWeekSection = forwardRef<HTMLElement, FeaturedThisWeekSectionProps>(
  function FeaturedThisWeekSection(
    { onEventClick, onOpenChat, onSeeAll, onShowsChange },
    ref
  ) {
    const [shows, setShows] = useState<WeeklyFeaturedShow[]>([]);
    const [proofById, setProofById] = useState<Map<string, PeopleGoingProof>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [usedSeed, setUsedSeed] = useState(false);
    const copy = SYNTH_20_HOME.featured;

    useEffect(() => {
      if (!SYNTH_20_DEMO) return;
      let cancelled = false;
      (async () => {
        setLoading(true);
        setError(false);
        setUsedSeed(false);
        try {
          const set = await fetchWeeklyFeaturedSet();
          const raw = set?.shows ?? [];
          let interestBoost = new Set<string>();
          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();
            if (user?.id) {
              interestBoost = await UserEventService.getUserInterestedEventIdSet(user.id);
            }
          } catch {
            // interest boost is optional
          }

          // Two-pass collision: load going counts before order so they participate (P3).
          let goingCounts = new Map<string, number>();
          try {
            goingCounts = await UserEventService.getInterestedCountsByEventId(
              raw.map((s) => s.eventId)
            );
          } catch {
            // going counts optional for sort; proof still loads below
          }

          const ordered = orderFeaturedByCollisionPotential(raw, {
            interestBoostIds: interestBoost,
            goingCounts,
          });
          const clamped = clampFeaturedBand(ordered, {
            min: FEATURED_MIN,
            max: FEATURED_MAX,
            target: FEATURED_TARGET,
          });

          if (clamped.outsideBand && clamped.reason) {
            flagPmFeaturedBand({
              rawCount: clamped.rawCount,
              shownCount: clamped.shows.length,
              reason: clamped.reason,
              weekId: set?.weekId ?? dcWeekId(),
            });
          }

          let next = clamped.shows;
          let seed = false;
          if (next.length === 0) {
            // Seed fixtures OK when curator set empty (LOI-574); never metro catalog dump.
            next = getSeedFeaturedShows(set?.weekId ?? dcWeekId());
            seed = true;
          }

          if (!cancelled) {
            setShows(next);
            setUsedSeed(seed);
            onShowsChange?.(next);
          }

          const proof = await loadPeopleGoingProof(next.map((s) => s.eventId));
          if (!cancelled) {
            setProofById(proof);
            // Re-order after proof so live going counts refine collision (same band).
            const refinedCounts = new Map<string, number>();
            for (const [id, p] of proof) {
              refinedCounts.set(id, p.count);
            }
            const refined = orderFeaturedByCollisionPotential(next, {
              interestBoostIds: interestBoost,
              goingCounts: refinedCounts,
            });
            setShows(refined);
            onShowsChange?.(refined);
          }
        } catch (err) {
          console.error('[FeaturedThisWeekSection]', err);
          if (!cancelled) {
            const seed = getSeedFeaturedShows(dcWeekId());
            setShows(seed);
            setUsedSeed(true);
            setError(true);
            onShowsChange?.(seed);
            flagPmFeaturedBand({
              rawCount: 0,
              shownCount: seed.length,
              reason: 'featured SoT fetch failed; using seed fixtures',
              weekId: dcWeekId(),
            });
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []); // setState setter from parent is stable; avoid re-fetch loops

    if (!SYNTH_20_DEMO) return null;

    return (
      <section
        ref={ref}
        id="synth20-featured-week"
        data-testid="home-featured-this-week"
        data-featured-count={shows.length}
        data-featured-min={FEATURED_MIN}
        data-featured-max={FEATURED_MAX}
        data-featured-seed={usedSeed ? 'true' : 'false'}
        aria-label={copy.title}
        style={{
          marginBottom: 'var(--spacing-medium, 24px)',
          paddingLeft: 'var(--spacing-small, 12px)',
          paddingRight: 'var(--spacing-small, 12px)',
          /* T4: keep rail height stable when bottom 2–3 shows drop mid-week */
          minHeight: 220,
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
        ) : error && shows.length === 0 ? (
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
              minHeight: 180,
            }}
          >
            {shows.map((show) => {
              const label = show.artistName || show.title || 'Show';
              const day = show.eventDate ? format(new Date(show.eventDate), 'EEE') : '';
              const cardLine = [day, show.venueName, show.venueCity].filter(Boolean).join(' · ');
              const proof = proofById.get(show.eventId);
              const going =
                proof && proof.count > 0 ? goingLabel(proof.count) : null;
              return (
                <div
                  key={show.eventId}
                  data-featured-position={show.position}
                  style={{
                    flex: '0 0 auto',
                    width: 220,
                    border: '1px solid var(--neutral-150, #ebebeb)',
                    borderRadius: 16,
                    background: 'var(--neutral-0, #fff)',
                    overflow: 'hidden',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onEventClick?.(show.eventId, label)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      textAlign: 'left',
                      cursor: 'pointer',
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
                    <div style={{ padding: '12px 12px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                        {cardLine || 'This week in DC'}
                      </div>
                      {(going || (proof && proof.faces.length > 0)) && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--neutral-600)',
                          }}
                        >
                          {proof?.faces.slice(0, 3).map((face, idx) => (
                            <span
                              key={face.userId}
                              title={face.name}
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: '50%',
                                marginLeft: idx === 0 ? 0 : -6,
                                border: '1px solid #fff',
                                background: face.avatarUrl
                                  ? `center/cover no-repeat url(${face.avatarUrl})`
                                  : 'var(--brand-pink-500, #e91e8c)',
                                color: '#fff',
                                fontSize: 9,
                                fontWeight: 700,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {!face.avatarUrl ? face.name.charAt(0).toUpperCase() : null}
                            </span>
                          ))}
                          <span>{going || `${proof?.faces[0]?.name ?? ''} going`}</span>
                        </div>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenChat?.(show.eventId, show.chatProvisionKey)}
                    style={{
                      margin: 12,
                      marginTop: 8,
                      border: 'none',
                      borderRadius: 10,
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 700,
                      color: '#fff',
                      background: 'var(--brand-pink-500, #e91e8c)',
                      cursor: 'pointer',
                    }}
                  >
                    <MessageCircle size={12} />
                    {SYNTH_20_HOME.chats.showChatCta}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  }
);

export default FeaturedThisWeekSection;
