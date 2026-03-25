import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { StatsService, StreamingStats } from '../src/services/statsService';
import { supabase } from '../src/integrations/supabase/client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Music, Mic2, BarChart3, TrendingUp, ChevronLeft } from 'lucide-react-native';

const PINK = SynthTokens.colors.brandPink500;

export default function StreamingStatsScreen() {
  const [stats, setStats] = useState<StreamingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const data = await StatsService.getStats(user.id);
    setStats(data);
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </Pressable>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: SynthTokens.spacing.md }}
      >
        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <Music size={28} color={PINK} />
            <Text style={styles.pageTitle}>Streaming Stats</Text>
          </View>
          <SynthText variant="body" color="secondary" style={styles.subtitle}>
            Your music journey this year
          </SynthText>
        </View>

        <View style={styles.statCard}>
          <TrendingUp size={28} color={PINK} />
          <Text style={styles.bigNumber}>{stats?.total_listening_hours ?? 0}</Text>
          <SynthText variant="meta" color="secondary">
            Hours played
          </SynthText>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Mic2 size={22} color={SynthTokens.colors.neutral900} />
            <Text style={styles.sectionTitle}>Top Artists</Text>
          </View>
          {(stats?.top_artists ?? []).map((artist: { name: string; popularity?: number }, index: number) => (
            <View key={artist.name} style={styles.artistRow}>
              <Text style={styles.rankText}>{index + 1}</Text>
              <View style={styles.artistInfo}>
                <Text style={styles.artistName}>{artist.name}</Text>
                <View style={styles.popularityBarContainer}>
                  <View style={[styles.popularityBar, { width: `${artist.popularity || 0}%` }]} />
                </View>
              </View>
            </View>
          ))}
          {!loading && (!stats?.top_artists || stats.top_artists.length === 0) ? (
            <SynthText variant="meta" color="secondary">
              Connect streaming to see your top artists.
            </SynthText>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <BarChart3 size={22} color={SynthTokens.colors.neutral900} />
            <Text style={styles.sectionTitle}>Top Genres</Text>
          </View>
          <View style={styles.genresContainer}>
            {(stats?.top_genres ?? []).map((genre: { genre: string; count: number }) => (
              <View key={genre.genre} style={styles.genrePill}>
                <Text style={styles.genreName}>{genre.genre}</Text>
                <SynthText variant="meta" color="secondary">
                  {genre.count} plays
                </SynthText>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  topBar: {
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingBottom: 4,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    marginBottom: SynthTokens.spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: SynthTokens.colors.neutral900,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 22,
  },
  statCard: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 20,
    padding: SynthTokens.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    marginBottom: SynthTokens.spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  bigNumber: {
    fontSize: 52,
    fontWeight: '800',
    color: SynthTokens.colors.neutral900,
    marginVertical: 8,
  },
  section: {
    marginBottom: SynthTokens.spacing.xxl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: SynthTokens.spacing.lg,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  artistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SynthTokens.spacing.md,
    gap: SynthTokens.spacing.md,
  },
  rankText: {
    width: 28,
    fontSize: 18,
    fontWeight: '800',
    color: SynthTokens.colors.neutral400,
  },
  artistInfo: {
    flex: 1,
  },
  artistName: {
    fontSize: 16,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  popularityBarContainer: {
    height: 6,
    backgroundColor: SynthTokens.colors.neutral100,
    borderRadius: 3,
    marginTop: 8,
  },
  popularityBar: {
    height: '100%',
    backgroundColor: PINK,
    borderRadius: 3,
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SynthTokens.spacing.sm,
  },
  genrePill: {
    backgroundColor: SynthTokens.colors.neutral50,
    paddingHorizontal: SynthTokens.spacing.md,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    minWidth: '45%',
  },
  genreName: {
    fontSize: 15,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
    marginBottom: 4,
  },
});
