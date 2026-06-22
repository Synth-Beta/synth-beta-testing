import React, { useEffect, useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';
import { SceneService } from '../../src/services/sceneService';
import { EventCard } from '../../src/components/Feed/EventCard';
import { EventService } from '../../src/services/eventService';
import { pickFeedImageUrlFromPayload, resolveFeedImageUri } from '../../src/utils/eventImages';
import { getCompliantEventLinkFromPayload } from '../../src/utils/eventTicketUrl';

export default function SceneDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState<string | null>(null);
  const [events, setEvents] = useState<
    Array<{
      id: string;
      title: string;
      artist_name: string;
      venue_name: string;
      event_date: string;
      image_url?: string;
      venue_city?: string;
      artist_id?: string;
      venue_id?: string;
      ticket_url?: string;
    }>
  >([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      const detail = await SceneService.getSceneDetails(id, user?.id);
      if (detail) {
        setTitle(detail.name || 'Scene');
        setDescription(detail.description || null);
      }
      const raw = await SceneService.getSceneEvents(id, 20);
      const mapped = (raw || []).map((e: any) => {
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
            {title || 'Scene'}
          </SynthText>
          <View style={styles.iconBtn} />
        </View>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={SynthTokens.colors.brandPink500} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            {description ? (
              <SynthText variant="body" color="secondary" style={styles.desc}>
                {description}
              </SynthText>
            ) : null}
            <SynthText variant="meta" color="secondary" style={styles.sub}>
              Related events
            </SynthText>
            {events.length === 0 ? (
              <SynthText variant="body" color="secondary">
                No upcoming events linked to this scene.
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
                  onPress={() => {
                    void EventService.toEventRouteId(e.id).then(rid => {
                      router.push(`/event/${rid}` as any);
                    });
                  }}
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
  desc: { marginBottom: 8 },
  sub: { marginBottom: 4 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
