import React, { useMemo } from 'react';
import { View, StyleSheet, Pressable, Linking, Platform } from 'react-native';
import { Image } from 'expo-image';
import { SynthTokens } from '../../tokens/SynthTokens';
import { SynthText } from '../SynthText';
import { MapPin } from 'lucide-react-native';

type Props = {
  latitude: number;
  longitude: number;
  title?: string;
  subtitle?: string;
  height?: number;
  zoom?: number; // 0-22
  onPress?: () => void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function SynthMap({ latitude, longitude, title, subtitle, height = 180, zoom = 13, onPress }: Props) {
  const token = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN;

  const url = useMemo(() => {
    if (!token) return null;
    const z = clamp(zoom, 0, 22);
    const pin = `pin-s+CC2486(${longitude},${latitude})`;
    // 2x for sharper image on high-density screens
    return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${pin}/${longitude},${latitude},${z}/800x400@2x?access_token=${token}`;
  }, [latitude, longitude, token, zoom]);

  // Default action: open the coordinates in the OS maps app.
  const openInMaps = () => {
    const label = encodeURIComponent(title || 'Location');
    const url = Platform.select({
      ios: `http://maps.apple.com/?ll=${latitude},${longitude}&q=${label}`,
      default: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`,
    })!;
    void Linking.openURL(url).catch(() => {});
  };

  return (
    <Pressable
      onPress={onPress ?? openInMaps}
      accessibilityRole="button"
      accessibilityLabel={title ? `Open ${title} in Maps` : 'Open in Maps'}
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null, { height }]}
    >
      {url ? (
        <Image source={{ uri: url }} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFillObject, styles.noToken]}>
          <MapPin size={18} color={SynthTokens.colors.brandPink500} />
          <SynthText variant="meta" color="secondary" style={{ textAlign: 'center' }}>
            Map preview unavailable.
          </SynthText>
          <SynthText variant="meta" color="secondary" style={{ textAlign: 'center' }}>
            Set `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` to enable.
          </SynthText>
        </View>
      )}
      <View style={styles.footer}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {title ? (
            <SynthText variant="meta" color="primary" numberOfLines={1} style={styles.footerTitle}>
              {title}
            </SynthText>
          ) : null}
          {subtitle ? (
            <SynthText variant="meta" color="secondary" numberOfLines={1}>
              {subtitle}
            </SynthText>
          ) : null}
        </View>
        <View style={styles.pill}>
          <MapPin size={14} color={SynthTokens.colors.neutral900} />
          <SynthText variant="meta" color="primary" style={styles.pillText}>
            Map
          </SynthText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: SynthTokens.radius.corner,
    overflow: 'hidden',
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  pressed: { opacity: 0.93 },
  noToken: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: SynthTokens.colors.neutral50,
    paddingHorizontal: 18,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  footerTitle: { fontWeight: '700', color: 'white' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  pillText: { fontWeight: '700' },
});

