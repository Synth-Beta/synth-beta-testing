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
import { EventService } from '../../src/services/eventService';
import { isUuid } from '../../src/utils/isUuid';
import { SynthMap } from '../../src/components/maps/SynthMap';
import { todayLocalYmd } from '../../src/utils/localYmd';
import { pickFeedImageUrlFromPayload, resolveFeedImageUri } from '../../src/utils/eventImages';
import { getCompliantEventLinkFromPayload } from '../../src/utils/eventTicketUrl';

export default function VenueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [city, setCity] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [latLng, setLatLng] = useState<{ latitude: number; longitude: number } | null>(null);
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
    }>
  >([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const raw = String(id);
      let resolvedId: string | null = null;
      let venue: any = null;

      if (isUuid(raw)) {
        resolvedId = raw;
        const { data } = await supabase
          .from('venues')
          .select('id, name, city, image_url, latitude, longitude')
          .eq('id', raw)
          .maybeSingle();
        venue = data;
      } else {
        const { data } = await supabase
          .from('venues')
          .select('id, name, city, image_url, latitude, longitude')
          .ilike('name', raw)
          .maybeSingle();
        venue = data;
        resolvedId = data?.id ?? null;
      }
      const venueName =
        venue != null
          ? ((venue as { name?: string }).name?.trim() || 'Venue')
          : 'Venue';
      if (venue) {
        setName(venueName);
        setCity((venue as { city?: string }).city || null);
        setImageUrl((venue as { image_url?: string }).image_url || null);
        setVenueId(resolvedId);
        const lat = (venue as any).latitude;
        const lng = (venue as any).longitude;
        setLatLng(typeof lat === 'number' && typeof lng === 'number' ? { latitude: lat, longitude: lng } : null);
      } else {
        setName('Venue');
        setCity(null);
        setImageUrl(null);
        setVenueId(null);
        setLatLng(null);
      }
      const { data: evs } = await supabase
        .from('events')
        .select(
          'id, title, artist_name, artist_id, venue_id, venue_name, venue_city, event_date, images, ticket_urls'
        )
        .eq('venue_id', resolvedId ?? raw)
        .gte('event_date', todayLocalYmd())
        .order('event_date', { ascending: true })
        .limit(25);
      const mapped =
        (evs || []).map((e: any) => {
          const rawImg = pickFeedImageUrlFromPayload(e) ?? e.images?.[0]?.url;
          return {
            id: e.id,
            title: e.title || 'Event',
            artist_name: e.artist_name || '',
            venue_name: e.venue_name || venueName,
            venue_city: e.venue_city ?? undefined,
            event_date: e.event_date,
            image_url: resolveFeedImageUri(rawImg) ?? undefined,
            artist_id: e.artist_id != null ? String(e.artist_id) : undefined,
            venue_id: e.venue_id != null ? String(e.venue_id) : resolvedId ?? undefined,
            ticket_url: getCompliantEventLinkFromPayload(e) ?? undefined,
          };
        }) ?? [];
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
          <View style={{ flex: 1 }}>
            <SynthText variant="h2" numberOfLines={1}>
              {name || 'Venue'}
            </SynthText>
            {city ? (
              <SynthText variant="meta" color="secondary">
                {city}
              </SynthText>
            ) : null}
          </View>
          <View style={styles.iconBtn} />
        </View>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={SynthTokens.colors.brandPink500} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={styles.hero} resizeMode="cover" />
            ) : null}
            {latLng ? (
              <SynthMap
                latitude={latLng.latitude}
                longitude={latLng.longitude}
                title={name || 'Venue'}
                subtitle={city || undefined}
              />
            ) : null}
            <SynthText variant="meta" color="secondary" style={styles.sub}>
              Upcoming shows
            </SynthText>
            {events.length === 0 ? (
              <SynthText variant="body" color="secondary">
                No upcoming events at this venue.
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
  hero: { width: '100%', height: 180, borderRadius: 16, marginBottom: 8 },
  sub: { marginBottom: 4 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
});
