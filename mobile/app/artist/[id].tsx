import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';
import { EventCard } from '../../src/components/Feed/EventCard';
import { ArtistScreenSkeleton } from '../../src/components/skeletons/ArtistScreenSkeleton';
import { EventService } from '../../src/services/eventService';
import { isUuid } from '../../src/utils/isUuid';
import { todayLocalYmd } from '../../src/utils/localYmd';

export default function ArtistDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [events, setEvents] = useState<
    Array<{
      id: string;
      title: string;
      artist_name: string;
      venue_name: string;
      event_date: string;
      image_url?: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const raw = String(id);
      let resolvedId: string | null = null;
      let artist: any = null;

      if (isUuid(raw)) {
        resolvedId = raw;
        const { data } = await supabase
          .from('artists')
          .select('id, name, image_url')
          .eq('id', raw)
          .maybeSingle();
        artist = data;
      } else {
        const { data } = await supabase
          .from('artists')
          .select('id, name, image_url')
          .ilike('name', raw)
          .maybeSingle();
        artist = data;
        resolvedId = data?.id ?? null;
      }
      const artistName =
        artist != null
          ? ((artist as { name?: string }).name?.trim() || 'Artist')
          : 'Artist';
      if (artist) {
        setName(artistName);
        setImageUrl((artist as { image_url?: string }).image_url || null);
        setArtistId(resolvedId);
      } else {
        setName('Artist');
        setImageUrl(null);
        setArtistId(null);
      }
      const { data: evs } = await supabase
        .from('events')
        .select('id, title, artist_name, venue_name, event_date, images')
        .eq('artist_id', resolvedId ?? raw)
        .gte('event_date', todayLocalYmd())
        .order('event_date', { ascending: true })
        .limit(25);
      const mapped =
        (evs || []).map((e: any) => ({
          id: e.id,
          title: e.title || 'Event',
          artist_name: e.artist_name || artistName,
          venue_name: e.venue_name || '',
          event_date: e.event_date,
          image_url: e.images?.[0]?.url,
        })) ?? [];
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
          <SynthText variant="h2" numberOfLines={1} style={{ flex: 1 }}>
            {name || 'Artist'}
          </SynthText>
          <View style={styles.iconBtn} />
        </View>
        {loading ? (
          <ArtistScreenSkeleton />
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.hero} resizeMode="cover" />
            ) : null}
            <SynthText variant="meta" color="secondary" style={styles.sub}>
              Upcoming shows
            </SynthText>
            {events.length === 0 ? (
              <SynthText variant="body" color="secondary">
                No upcoming events in the catalog for this artist.
              </SynthText>
            ) : (
              events.map(e => (
                <EventCard
                  key={e.id}
                  id={e.id}
                  title={e.title}
                  artist_name={e.artist_name}
                  venue_name={e.venue_name}
                  event_date={e.event_date}
                  image_url={e.image_url}
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
  hero: { width: '100%', height: 180, borderRadius: 16, marginBottom: 8 },
  sub: { marginBottom: 4 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
