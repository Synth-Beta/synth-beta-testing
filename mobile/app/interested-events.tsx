import React, { useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, FlatList, RefreshControl, Text } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { supabase } from '../src/integrations/supabase/client';
import { InterestedEventItem, MyEventsService } from '../src/services/myEventsService';
import { EventCard } from '../src/components/Feed/EventCard';
import { filterInterestedRowsForSegment } from '../src/utils/eventStatusUtils';
import { useInterested } from '../src/contexts/InterestedContext';

export default function InterestedEventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomPadding = SynthTokens.spacing.bottomNav + insets.bottom;
  const [items, setItems] = useState<InterestedEventItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showPastSegment, setShowPastSegment] = useState(false);
  const { isInterested } = useInterested();

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

  const segmented = filterInterestedRowsForSegment(
    items.filter(i => isInterested(i.event_id)),
    !showPastSegment
  );

  const listEmptyCopy = useMemo(() => {
    if (items.length === 0) {
      return { title: '', body: 'No interested events yet.\nTap Interested on shows to save them here.' };
    }
    return {
      title: showPastSegment ? 'No past events' : 'No upcoming events',
      body: showPastSegment
        ? 'You haven’t marked any past shows as Interested.'
        : 'You don’t have any upcoming shows marked as Interested.',
    };
  }, [items.length, showPastSegment]);

  const segmentToggle =
    items.length > 0 ? (
      <View style={styles.segmentOuter}>
        <Pressable
          onPress={() => setShowPastSegment(false)}
          style={[styles.segmentBtn, !showPastSegment && styles.segmentBtnActive]}
        >
          <Text style={[styles.segmentLabel, !showPastSegment && styles.segmentLabelActive]}>Upcoming</Text>
        </Pressable>
        <Pressable
          onPress={() => setShowPastSegment(true)}
          style={[styles.segmentBtn, showPastSegment && styles.segmentBtnActive]}
        >
          <Text style={[styles.segmentLabel, showPastSegment && styles.segmentLabelActive]}>Past</Text>
        </Pressable>
      </View>
    ) : null;

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
        data={segmented}
        keyExtractor={i => i.event_id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); void load(); }}
            tintColor={SynthTokens.colors.brandPink500}
          />
        }
        ListHeaderComponent={<View style={styles.listHeader}>{segmentToggle}</View>}
        contentContainerStyle={{ paddingBottom: bottomPadding, paddingTop: SynthTokens.spacing.sm }}
        ListEmptyComponent={
          <View style={styles.emptyBlock}>
            {listEmptyCopy.title ? (
              <SynthText variant="body" style={styles.emptyTitle}>
                {listEmptyCopy.title}
              </SynthText>
            ) : null}
            <SynthText variant="body" color="secondary" style={styles.empty}>
              {listEmptyCopy.body}
            </SynthText>
          </View>
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
            cornerLabel={showPastSegment ? 'Past' : undefined}
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
  listHeader: { paddingHorizontal: SynthTokens.spacing.screenMarginX },
  segmentOuter: {
    flexDirection: 'row',
    borderRadius: 10,
    backgroundColor: SynthTokens.colors.neutral100,
    padding: 4,
    marginBottom: SynthTokens.spacing.sm,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: SynthTokens.colors.neutral0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: SynthTokens.colors.neutral600,
  },
  segmentLabelActive: {
    color: SynthTokens.colors.neutral900,
  },
  emptyBlock: { marginTop: 48, paddingHorizontal: SynthTokens.spacing.md },
  emptyTitle: {
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  empty: { textAlign: 'center' },
});
