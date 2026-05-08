import React, { useCallback, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { supabase } from '../src/integrations/supabase/client';
import { InterestedEventItem, MyEventsService } from '../src/services/myEventsService';
import { EventCard } from '../src/components/Feed/EventCard';

export default function InterestedEventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPadding = SynthTokens.spacing.bottomNav + insets.bottom;
  const [items, setItems] = useState<InterestedEventItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) {
      setItems([]);
      setRefreshing(false);
      return;
    }
    setCurrentUserId(user.id);
    const rows = await MyEventsService.getInterestedEvents(user.id);
    setItems(rows);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </Pressable>
        <SynthText variant="h2">Interested</SynthText>
        <View style={styles.back} />
      </View>
      <FlatList
        data={items}
        keyExtractor={i => i.event_id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(); }}
            tintColor={SynthTokens.colors.brandPink500}
          />
        }
        contentContainerStyle={{ paddingBottom: bottomPadding, paddingTop: SynthTokens.spacing.md }}
        ListEmptyComponent={
          <SynthText variant="body" color="secondary" style={styles.empty}>
            No interested events yet.
          </SynthText>
        }
        renderItem={({ item }) => (
          <EventCard
            id={item.event_id}
            title={item.title}
            artist_name={item.artist_name}
            venue_name={item.venue_name}
            event_date={item.event_date}
            image_url={item.image_url}
            venue_city={item.venue_city}
            ticket_url={item.ticket_url}
            initialInterested={true}
            currentUserId={currentUserId}
            onPress={() => router.push(`/event/${item.event_id}`)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  empty: { marginTop: 40, textAlign: 'center', paddingHorizontal: SynthTokens.spacing.md },
});
