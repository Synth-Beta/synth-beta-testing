import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  Text,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft, Music, MapPin } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { supabase } from '../src/integrations/supabase/client';
import {
  getUserFollowedArtistsForProfile,
  getUserFollowedVenuesForProfile,
  type FollowedArtistRow,
  type FollowedVenueRow,
} from '../src/services/profileFollowingService';

const PINK = SynthTokens.colors.brandPink500;

type FollowingTab = 'artists' | 'venues';

export default function ProfileFollowingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<FollowingTab>('artists');
  const [artists, setArtists] = useState<FollowedArtistRow[]>([]);
  const [venues, setVenues] = useState<FollowedVenueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setArtists([]);
      setVenues([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    const [a, v] = await Promise.all([
      getUserFollowedArtistsForProfile(user.id),
      getUserFollowedVenuesForProfile(user.id),
    ]);
    setArtists(a);
    setVenues(v);
    setLoading(false);
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
        <SynthText variant="h2">Following</SynthText>
        <View style={styles.back} />
      </View>

      <View style={styles.segment}>
        <Pressable
          style={[styles.segBtn, tab === 'artists' && styles.segBtnOn]}
          onPress={() => setTab('artists')}
        >
          <Music size={16} color={tab === 'artists' ? SynthTokens.colors.neutral0 : SynthTokens.colors.neutral600} />
          <Text style={[styles.segTxt, tab === 'artists' && styles.segTxtOn]}>Artists</Text>
        </Pressable>
        <Pressable
          style={[styles.segBtn, tab === 'venues' && styles.segBtnOn]}
          onPress={() => setTab('venues')}
        >
          <MapPin size={16} color={tab === 'venues' ? SynthTokens.colors.neutral0 : SynthTokens.colors.neutral600} />
          <Text style={[styles.segTxt, tab === 'venues' && styles.segTxtOn]}>Venues</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={PINK} />
        </View>
      ) : tab === 'artists' ? (
        <FlatList
          data={artists}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={PINK} />
          }
          ListEmptyComponent={
            <SynthText variant="body" color="secondary" style={styles.empty}>
              You are not following any artists yet.
            </SynthText>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/artist/${item.artist_id}`)}>
              <Image
                source={
                  item.artist_image_url
                    ? { uri: item.artist_image_url }
                    : require('../assets/placeholder-event.png')
                }
                style={styles.thumb}
              />
              <Text style={styles.title} numberOfLines={2}>
                {item.artist_name || 'Artist'}
              </Text>
            </Pressable>
          )}
        />
      ) : (
        <FlatList
          data={venues}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={PINK} />
          }
          ListEmptyComponent={
            <SynthText variant="body" color="secondary" style={styles.empty}>
              You are not following any venues yet.
            </SynthText>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => router.push(`/venue/${item.venue_id}`)}>
              <View style={styles.venueIcon}>
                <MapPin size={22} color={SynthTokens.colors.neutral600} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={2}>
                  {item.venue_name || 'Venue'}
                </Text>
                {item.venue_state ? (
                  <SynthText variant="meta" color="secondary" numberOfLines={1}>
                    {item.venue_state}
                  </SynthText>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}
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
  segment: {
    flexDirection: 'row',
    margin: SynthTokens.spacing.md,
    gap: 8,
    backgroundColor: SynthTokens.colors.neutral100,
    borderRadius: 12,
    padding: 4,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  segBtnOn: { backgroundColor: SynthTokens.colors.neutral900 },
  segTxt: { fontWeight: '700', fontSize: 14, color: SynthTokens.colors.neutral600 },
  segTxtOn: { color: SynthTokens.colors.neutral0 },
  list: { paddingHorizontal: SynthTokens.spacing.md, paddingBottom: 40 },
  empty: { paddingTop: 24, textAlign: 'center' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  thumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: SynthTokens.colors.neutral200 },
  venueIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: SynthTokens.colors.neutral100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '600', color: SynthTokens.colors.neutral900, flex: 1 },
});
