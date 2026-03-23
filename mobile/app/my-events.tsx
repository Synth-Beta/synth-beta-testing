import React from 'react';
import { View, StyleSheet, TouchableOpacity, FlatList, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { supabase } from '../src/integrations/supabase/client';

export default function MyEventsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = React.useState(true);
  const [events, setEvents] = React.useState<any[]>([]);

  React.useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('events')
          .select('id, title, artist_name, venue_name, event_date')
          .eq('created_by_user_id', user.id)
          .order('event_date', { ascending: true });
        setEvents(data || []);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </TouchableOpacity>
        <SynthText variant="h2">My events</SynthText>
        <View style={styles.back} />
      </View>
      <FlatList
        contentContainerStyle={styles.body}
        data={events}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <SynthText variant="body" color="secondary">No created events yet.</SynthText>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row}>
            <View style={styles.rowMain}>
              <SynthText variant="meta" style={styles.rowTitle}>{item.title || item.artist_name || 'Untitled event'}</SynthText>
              <SynthText variant="meta" color="secondary">{item.venue_name || 'Venue TBD'}</SynthText>
            </View>
            <SynthText variant="meta" color="secondary">
              {item.event_date ? new Date(item.event_date).toLocaleDateString() : 'TBD'}
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
    paddingVertical: SynthTokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  body: { padding: SynthTokens.spacing.lg, paddingBottom: 48, gap: 10 },
  row: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    borderRadius: SynthTokens.radius.medium,
    minHeight: 64,
    paddingHorizontal: SynthTokens.spacing.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  rowMain: {
    flex: 1,
    paddingRight: 8,
  },
  rowTitle: { fontWeight: '700' },
  empty: {
    alignItems: 'center',
    marginTop: 30,
  },
});
