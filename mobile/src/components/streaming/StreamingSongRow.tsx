import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { SynthTokens } from '../../tokens/SynthTokens';

interface StreamingSongRowProps {
  track: {
    name?: string;
    artist?: string;
    artists?: Array<{ name?: string }>;
    album?: { images?: Array<{ url?: string }> };
  };
  rank: number;
  accentColor: string;
}

export function StreamingSongRow({ track, rank, accentColor }: StreamingSongRowProps) {
  const name = String(track.name || 'Unknown Track').trim();
  const artistName =
    track.artists?.[0]?.name || track.artist || 'Unknown Artist';
  const imageUrl = track.album?.images?.[0]?.url || track.album?.images?.[1]?.url;

  return (
    <View style={styles.row}>
      {imageUrl ? (
        <Image source={{ uri: imageUrl }} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={[styles.coverFallback, { backgroundColor: accentColor }]}>
          <Text style={styles.coverFallbackText}>{rank}</Text>
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {artistName}
        </Text>
      </View>
      <Text style={[styles.rank, { color: accentColor + 'CC' }]}>#{rank}</Text>
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
  cover: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: SynthTokens.colors.neutral200,
  },
  coverFallback: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverFallbackText: {
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
  },
  rank: {
    fontSize: 12,
    fontWeight: '800',
    width: 28,
    textAlign: 'right',
  },
});
