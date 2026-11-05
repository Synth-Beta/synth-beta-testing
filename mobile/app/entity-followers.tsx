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
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { ArtistFollowService, type ArtistFollower } from '../src/services/artistFollowService';
import { VenueFollowService, type VenueFollower } from '../src/services/venueFollowService';

const PINK = SynthTokens.colors.brandPink500;

type FollowerRow = ArtistFollower | VenueFollower;

export default function EntityFollowersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    type?: string;
    id?: string;
    name?: string;
  }>();

  const entityType = params.type === 'venue' ? 'venue' : 'artist';
  const entityId = typeof params.id === 'string' ? params.id : '';
  const entityName =
    typeof params.name === 'string' && params.name.trim()
      ? params.name
      : entityType === 'venue'
        ? 'Venue'
        : 'Artist';

  const [followers, setFollowers] = useState<FollowerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!entityId) {
      setFollowers([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const list =
      entityType === 'venue'
        ? await VenueFollowService.getVenueFollowers(entityId)
        : await ArtistFollowService.getArtistFollowers(entityId);

    setFollowers(list);
    setLoading(false);
    setRefreshing(false);
  }, [entityId, entityType]);

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
        <View style={styles.headerTitle}>
          <SynthText variant="h2" numberOfLines={1}>
            Followers
          </SynthText>
          <SynthText variant="meta" color="secondary" numberOfLines={1}>
            {entityName}
          </SynthText>
        </View>
        <View style={styles.back} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={PINK} />
        </View>
      ) : (
        <FlatList
          data={followers}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={PINK}
            />
          }
          ListEmptyComponent={
            <SynthText variant="body" color="secondary" style={styles.empty}>
              No followers yet.
            </SynthText>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => router.push(`/user/${item.user_id}`)}
              accessibilityRole="button"
              accessibilityLabel={`View profile: ${item.name}`}
            >
              <Image
                source={
                  item.avatar_url
                    ? { uri: item.avatar_url }
                    : require('../assets/placeholder-user.png')
                }
                style={styles.avatar}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.username ? (
                  <SynthText variant="meta" color="secondary" numberOfLines={1}>
                    @{item.username}
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
  headerTitle: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  list: { padding: SynthTokens.spacing.md, paddingBottom: 40 },
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
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SynthTokens.colors.neutral200,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: SynthTokens.colors.neutral900,
    marginBottom: 2,
  },
});
