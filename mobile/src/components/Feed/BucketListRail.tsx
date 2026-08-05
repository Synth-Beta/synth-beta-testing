import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Music } from 'lucide-react-native';
import { SynthTokens } from '../../tokens/SynthTokens';
import type { BucketListFeedItem } from '../../services/homeFeedService';

interface BucketListRailProps {
  events: BucketListFeedItem[];
}

function formatRailDate(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';
}

export const BucketListRail: React.FC<BucketListRailProps> = ({ events }) => {
  const router = useRouter();

  if (events.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.titleBlock}>
        <Text style={styles.title}>From Your Bucket List</Text>
        <Text style={styles.subtitle}>Shows from artists you want to see</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {events.map(e => (
          <TouchableOpacity
            key={e.id}
            style={styles.card}
            onPress={() => router.push(`/event/${e.id}` as any)}
          >
            <View style={styles.rankBadge}>
              <Text style={styles.rankBadgeTxt}>{e.bucket_reason}</Text>
            </View>
            <View style={styles.iconWrap}>
              <Music size={22} color={SynthTokens.colors.brandPink500} />
            </View>
            <Text style={styles.name} numberOfLines={1}>
              {e.artist_name}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {e.venue_name}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {formatRailDate(e.event_date)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
};

const CARD_W = 148;

const styles = StyleSheet.create({
  section: {
    marginBottom: SynthTokens.spacing.md,
    marginTop: SynthTokens.spacing.xs,
  },
  titleBlock: {
    alignItems: 'center',
    marginBottom: SynthTokens.spacing.sm,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: SynthTokens.colors.neutral600,
    marginTop: 2,
  },
  row: {
    paddingHorizontal: SynthTokens.spacing.md,
    gap: 12,
    paddingBottom: 8,
  },
  card: {
    width: CARD_W,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.25)',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  rankBadge: {
    alignSelf: 'flex-start',
    backgroundColor: SynthTokens.colors.brandPink050,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 8,
  },
  rankBadgeTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: SynthTokens.colors.brandPink500,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(236, 72, 153, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: SynthTokens.colors.neutral900,
    textAlign: 'center',
    width: '100%',
    marginBottom: 2,
  },
  meta: {
    fontSize: 11,
    color: SynthTokens.colors.neutral600,
    textAlign: 'center',
    width: '100%',
  },
});
