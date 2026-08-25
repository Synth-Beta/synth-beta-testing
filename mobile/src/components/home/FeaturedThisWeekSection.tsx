/**
 * Synth 2.0 Home hero: this week's featured / promoted DC shows (Expo).
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Calendar, MapPin } from 'lucide-react-native';
import { supabase } from '../../integrations/supabase/client';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { EventService } from '../../services/eventService';
import {
  SYNTH_20_DEMO,
  SYNTH_20_DC,
  SYNTH_20_HOME,
  promotionRank,
} from '../../config/synth20Demo';

type FeaturedWeekEvent = {
  id: string;
  title: string | null;
  artist_name: string | null;
  venue_name: string | null;
  venue_city: string | null;
  event_date: string;
  image_url?: string | null;
  is_promoted?: boolean | null;
  promotion_tier?: string | null;
};

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

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function FeaturedThisWeekSection() {
  const router = useRouter();
  const [events, setEvents] = useState<FeaturedWeekEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!SYNTH_20_DEMO) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
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
        if (!cancelled) setEvents([]);
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
    <View style={styles.section}>
      <SynthText variant="h2" style={styles.title}>
        {SYNTH_20_HOME.title}
      </SynthText>
      <SynthText variant="meta" color="secondary" style={styles.sub}>
        {SYNTH_20_HOME.subtitle}
      </SynthText>
      <Text style={styles.meta}>
        {SYNTH_20_DC.name} · within ~{SYNTH_20_DC.radiusMiles} mi
      </Text>

      {loading ? (
        <ActivityIndicator color={SynthTokens.colors.brandPink500} style={{ marginTop: 12 }} />
      ) : events.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No upcoming DC shows in the feed yet. Pin promotions in admin to fill this week.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          {events.map((event) => {
            const label = event.artist_name || event.title || 'Show';
            return (
              <Pressable
                key={event.id}
                style={styles.card}
                onPress={() => {
                  void EventService.toEventRouteId(event.id).then((rid) => {
                    router.push(`/event/${rid}` as any);
                  });
                }}
              >
                {event.image_url ? (
                  <Image source={{ uri: event.image_url }} style={styles.image} />
                ) : (
                  <View style={[styles.image, styles.imageFallback]} />
                )}
                <View style={styles.cardBody}>
                  {(event.is_promoted || event.promotion_tier) && (
                    <Text style={styles.badge}>Promoted</Text>
                  )}
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {label}
                  </Text>
                  <View style={styles.row}>
                    <Calendar size={12} color={SynthTokens.colors.neutral600} />
                    <Text style={styles.rowText}>{formatWhen(event.event_date)}</Text>
                  </View>
                  <View style={styles.row}>
                    <MapPin size={12} color={SynthTokens.colors.neutral600} />
                    <Text style={styles.rowText} numberOfLines={1}>
                      {[event.venue_name, event.venue_city].filter(Boolean).join(' · ')}
                    </Text>
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
  section: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  title: {
    marginBottom: 4,
  },
  sub: {
    marginBottom: 4,
    lineHeight: 18,
  },
  meta: {
    fontSize: 12,
    color: SynthTokens.colors.neutral400,
    marginBottom: 10,
  },
  empty: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: '#fff',
  },
  emptyText: {
    fontSize: 13,
    color: SynthTokens.colors.neutral600,
  },
  rail: {
    gap: 12,
    paddingRight: 8,
  },
  card: {
    width: 220,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  image: {
    height: 110,
    width: '100%',
  },
  imageFallback: {
    backgroundColor: SynthTokens.colors.neutral100,
  },
  cardBody: {
    padding: 12,
    gap: 6,
  },
  badge: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '700',
    color: SynthTokens.colors.brandPink500,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowText: {
    fontSize: 12,
    color: SynthTokens.colors.neutral600,
    flex: 1,
  },
});

export default FeaturedThisWeekSection;
