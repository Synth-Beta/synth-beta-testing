import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { getUpcomingEventsForGenreChat } from '@synth/shared';
import { SynthText } from '../../../src/components/SynthText';
import { SynthTokens } from '../../../src/tokens/SynthTokens';
import { supabase } from '../../../src/integrations/supabase/client';
import { EventCard } from '../../../src/components/Feed/EventCard';
import { GENRE_CONFIGS } from '../../../src/services/genreChatService';
import { resolveApproxUserLocation } from '../../../src/hooks/useApproxUserLocation';
import { pickFeedImageUrlFromPayload, resolveFeedImageUri } from '../../../src/utils/eventImages';
import { getCompliantEventLinkFromPayload } from '../../../src/utils/eventTicketUrl';

const EVENTS_LIMIT = 50;

export default function GenreEventsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<
    Array<{
      id: string;
      title: string;
      artist_name: string;
      venue_name: string;
      venue_city?: string;
      event_date: string;
      image_url?: string;
      artist_id?: string;
      venue_id?: string;
      ticket_url?: string;
      interested_count?: number;
      distanceMiles: number | null;
    }>
  >([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const genre = GENRE_CONFIGS.find(g => g.id === id);
  const title = genre ? `${genre.emoji} ${genre.name} Shows` : 'Upcoming Shows';

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      setCurrentUserId(session?.user?.id ?? null);

      const near = await resolveApproxUserLocation();
      const rows: any[] = await getUpcomingEventsForGenreChat(
        supabase,
        id,
        EVENTS_LIMIT,
        near ? { latitude: near.latitude, longitude: near.longitude, radiusMiles: 40 } : undefined
      );
      const mapped = (rows || []).map((e: any) => {
        const rawImg =
          pickFeedImageUrlFromPayload(e) ??
          e.images?.[0]?.url ??
          (typeof e.image_url === 'string' ? e.image_url : undefined);
        return {
          id: e.id,
          title: e.title || 'Event',
          artist_name: e.artist_name || '',
          venue_name: e.venue_name || '',
          venue_city: e.venue_city ?? undefined,
          event_date: e.event_date,
          image_url: resolveFeedImageUri(rawImg) ?? undefined,
          artist_id: e.artist_id != null ? String(e.artist_id) : undefined,
          venue_id: e.venue_id != null ? String(e.venue_id) : undefined,
          ticket_url: getCompliantEventLinkFromPayload(e) ?? undefined,
          interested_count: typeof e.interested_count === 'number' ? e.interested_count : undefined,
          distanceMiles: typeof e.distanceMiles === 'number' ? e.distanceMiles : null,
        };
      });
      setEvents(mapped);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
            <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
          </Pressable>
          <SynthText variant="h2" numberOfLines={2} style={{ flex: 1 }}>
            {title}
          </SynthText>
          <View style={styles.iconBtn} />
        </View>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={SynthTokens.colors.brandPink500} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            {events.length === 0 ? (
              <SynthText variant="body" color="secondary">
                No upcoming shows right now.
              </SynthText>
            ) : (
              events.map(e => (
                <EventCard
                  key={e.id}
                  id={e.id}
                  title={e.title}
                  artist_name={e.artist_name}
                  venue_name={e.venue_name}
                  venue_city={e.venue_city}
                  event_date={e.event_date}
                  image_url={e.image_url}
                  ticket_url={e.ticket_url}
                  artist_id={e.artist_id}
                  venue_id={e.venue_id}
                  interested_count={e.interested_count}
                  currentUserId={currentUserId}
                  cornerLabel={typeof e.distanceMiles === 'number' ? `${Math.round(e.distanceMiles)} mi` : undefined}
                />
              ))
            )}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  body: { padding: 16, paddingBottom: 48, gap: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
