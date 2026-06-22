import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { SynthTokens } from '../../tokens/SynthTokens';

const MEDAL_GOLD = '#F5A623';
const MEDAL_SILVER = '#8E8E93';
const MEDAL_BRONZE = '#C86A1E';

function medalColor(index: number): string {
  if (index === 0) return MEDAL_GOLD;
  if (index === 1) return MEDAL_SILVER;
  if (index === 2) return MEDAL_BRONZE;
  return SynthTokens.colors.neutral400;
}

interface StreamingArtistRowProps {
  artist: {
    name?: string;
    genres?: string[];
    images?: Array<{ url?: string }>;
    attributes?: { name?: string };
  };
  rank: number;
  accentColor: string;
}

export function StreamingArtistRow({ artist, rank, accentColor }: StreamingArtistRowProps) {
  const name = String(artist.name || artist.attributes?.name || 'Unknown Artist').trim();
  const imageUrl = artist.images?.[0]?.url || artist.images?.[1]?.url;
  const topGenre = artist.genres?.[0];
  const rankColor = rank <= 3 ? medalColor(rank - 1) : accentColor;

  return (
    <View style={styles.row}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatarFallback, { backgroundColor: accentColor }]}>
          <Text style={styles.avatarFallbackText}>{rank}</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {topGenre ? (
          <Text style={styles.sub} numberOfLines={1}>
            {topGenre}
          </Text>
        ) : null}
      </View>
      <Text style={[styles.rank, { color: rankColor + 'CC' }]}>#{rank}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral100,
    padding: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SynthTokens.colors.neutral200,
  },
  avatarFallback: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: SynthTokens.colors.neutral0,
    fontWeight: '800',
    fontSize: 15,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  sub: {
    fontSize: 12,
    color: SynthTokens.colors.neutral600,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  rank: {
    fontSize: 12,
    fontWeight: '800',
    width: 28,
    textAlign: 'right',
  },
});
