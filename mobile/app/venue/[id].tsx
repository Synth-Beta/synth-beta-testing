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

export default function VenueDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [city, setCity] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
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
      const { data: venue } = await supabase
        .from('venues')
        .select('name, city, image_url')
        .eq('id', id)
        .maybeSingle();
      const venueName =
        venue != null
          ? ((venue as { name?: string }).name?.trim() || 'Venue')
          : 'Venue';
      if (venue) {
        setName(venueName);
        setCity((venue as { city?: string }).city || null);
        setImageUrl((venue as { image_url?: string }).image_url || null);
      } else {
        setName('Venue');
        setCity(null);
        setImageUrl(null);
      }
      const { data: evs } = await supabase
        .from('events')
        .select('id, title, artist_name, venue_name, event_date, images')
        .eq('venue_id', id)
        .gte('event_date', new Date().toISOString().split('T')[0])
        .order('event_date', { ascending: true })
        .limit(25);
      const mapped =
        (evs || []).map((e: any) => ({
          id: e.id,
          title: e.title || 'Event',
          artist_name: e.artist_name || '',
          venue_name: e.venue_name || venueName,
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
                  event_date={e.event_date}
                  image_url={e.image_url}
                  onPress={() => router.push(`/event/${e.id}`)}
                  onGoingPress={() => router.push(`/event/${e.id}`)}
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
