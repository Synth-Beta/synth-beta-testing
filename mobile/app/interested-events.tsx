import React, { useCallback, useState } from 'react';
import { View, StyleSheet, Pressable, FlatList, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { supabase } from '../src/integrations/supabase/client';
import { InterestedEventItem, MyEventsService } from '../src/services/myEventsService';

export default function InterestedEventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPadding = SynthTokens.spacing.bottomNav + insets.bottom;
  const [items, setItems] = useState<InterestedEventItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setItems([]);
      setRefreshing(false);
      return;
    }
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
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />
        }
        contentContainerStyle={[styles.list, { paddingBottom: bottomPadding }]}
        ListEmptyComponent={
          <SynthText variant="body" color="secondary" style={styles.empty}>
            No interested events yet.
          </SynthText>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/event/${item.event_id}`)}>
            <SynthText variant="meta" style={styles.title} numberOfLines={1}>
              {item.artist_name || item.title}
            </SynthText>
            <SynthText variant="meta" color="secondary" numberOfLines={1}>
              {item.venue_name}
            </SynthText>
          </Pressable>
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
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  list: { padding: SynthTokens.spacing.md },
  row: {
    padding: 14,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  title: { fontWeight: '800' },
  empty: { marginTop: 40, textAlign: 'center' },
});
