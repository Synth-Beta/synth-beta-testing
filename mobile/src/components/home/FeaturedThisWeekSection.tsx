/**
 * Expo Home + Discover featured strip (LOI-646).
 * Consumes the same SoT week as web via fetchDemoWeeklyFeaturedSet (2026-W35).
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Calendar, MessageCircle } from 'lucide-react-native';
import { DEMO_FEATURED_WEEK_ID } from '@synth/shared';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import {
  fetchDemoWeeklyFeaturedSet,
  type WeeklyFeaturedShow,
} from '../../services/weeklyFeaturedService';

const PINK = SynthTokens.colors.brandPink500;
const FEATURED_CAP = 15;

function formatGenreChip(genre: string | null | undefined): string | null {
  if (!genre?.trim()) return null;
  return genre
    .trim()
    .split(/[-_/]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function weekdayLabel(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

type Props = {
  onEventPress?: (eventId: string, name: string) => void;
};

export function FeaturedThisWeekSection({ onEventPress }: Props) {
  const [shows, setShows] = useState<WeeklyFeaturedShow[]>([]);
  const [weekId, setWeekId] = useState(DEMO_FEATURED_WEEK_ID);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const set = await fetchDemoWeeklyFeaturedSet();
        if (!cancelled) {
          setWeekId(set?.weekId ?? DEMO_FEATURED_WEEK_ID);
          setShows((set?.shows ?? []).slice(0, FEATURED_CAP));
        }
      } catch (err) {
        console.error('[FeaturedThisWeekSection mobile]', err);
        if (!cancelled) {
          setShows([]);
          setWeekId(DEMO_FEATURED_WEEK_ID);
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

  return (
    <View style={styles.wrap} testID={`featured-week-${weekId}`}>
      <View style={styles.header}>
        <SynthText variant="h2" style={styles.title}>
          This week in DC
        </SynthText>
        <SynthText variant="meta" color="secondary" style={styles.subtitle}>
          Twelve shows worth leaving the house for.
        </SynthText>
      </View>

      {loading ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={PINK} />
          <SynthText variant="meta" color="secondary">
            Loading this week&apos;s shows…
          </SynthText>
        </View>
      ) : error ? (
        <View style={styles.stateBox}>
          <SynthText variant="meta" color="secondary">
            Couldn&apos;t load this week&apos;s shows. Try again.
          </SynthText>
        </View>
      ) : shows.length === 0 ? (
        <View style={styles.stateBox}>
          <SynthText variant="meta" color="secondary">
            Featured shows for this week land here.
          </SynthText>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {shows.map((show) => {
            const label = show.artistName || show.title || 'Show';
            const day = weekdayLabel(show.eventDate);
            const cardLine = [day, show.venueName, show.venueCity].filter(Boolean).join(' · ');
            const genreChip = formatGenreChip(show.genre);
            const blurb = show.curatorNote?.trim() || null;
            return (
              <Pressable
                key={show.eventId}
                style={styles.card}
                onPress={() => onEventPress?.(show.eventId, label)}
                testID={`featured-pos-${show.position}`}
              >
                {show.imageUrl ? (
                  <Image source={{ uri: show.imageUrl }} style={styles.image} />
                ) : (
                  <View style={[styles.image, styles.imageFallback]} />
                )}
                <View style={styles.cardBody}>
                  {genreChip ? (
                    <View style={styles.chip}>
                      <SynthText variant="meta" style={styles.chipText}>
                        {genreChip}
                      </SynthText>
                    </View>
                  ) : null}
                  <SynthText variant="body" style={styles.cardTitle} numberOfLines={2}>
                    {label}
                  </SynthText>
                  <View style={styles.metaRow}>
                    <Calendar size={12} color={SynthTokens.colors.neutral500} />
                    <SynthText variant="meta" color="secondary" numberOfLines={1}>
                      {cardLine}
                    </SynthText>
                  </View>
                  {blurb ? (
                    <SynthText variant="meta" color="secondary" numberOfLines={2}>
                      {blurb}
                    </SynthText>
                  ) : null}
                  <View style={styles.ctaRow}>
                    <MessageCircle size={12} color={PINK} />
                    <SynthText variant="meta" style={styles.ctaText}>
                      Open show
                    </SynthText>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: SynthTokens.spacing.md,
  },
  header: {
    paddingHorizontal: SynthTokens.spacing.sm,
    marginBottom: 12,
    gap: 6,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    lineHeight: 18,
  },
  stateBox: {
    marginHorizontal: SynthTokens.spacing.sm,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
    gap: 8,
    alignItems: 'flex-start',
  },
  rail: {
    paddingHorizontal: SynthTokens.spacing.sm,
    gap: 12,
  },
  card: {
    width: 220,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  image: {
    height: 110,
    width: '100%',
  },
  imageFallback: {
    backgroundColor: '#fce8f3',
  },
  cardBody: {
    padding: 12,
    gap: 6,
  },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#fce8f3',
  },
  chipText: {
    color: SynthTokens.colors.brandPink600,
    fontWeight: '600',
    fontSize: 11,
  },
  cardTitle: {
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 19,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ctaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  ctaText: {
    color: PINK,
    fontWeight: '600',
  },
});

export default FeaturedThisWeekSection;
