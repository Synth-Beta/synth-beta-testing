import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { Mic2, Music, BarChart3 } from 'lucide-react-native';
import { SynthTokens } from '../../tokens/SynthTokens';

export type StreamingStatsTab = 'artists' | 'songs' | 'genres';

interface StreamingStatsTabBarProps {
  value: StreamingStatsTab;
  onChange: (tab: StreamingStatsTab) => void;
  accentColor: string;
}

const TABS: { id: StreamingStatsTab; label: string; Icon: typeof Mic2 }[] = [
  { id: 'artists', label: 'Artists', Icon: Mic2 },
  { id: 'songs', label: 'Songs', Icon: Music },
  { id: 'genres', label: 'Genres', Icon: BarChart3 },
];

export function StreamingStatsTabBar({ value, onChange, accentColor }: StreamingStatsTabBarProps) {
  return (
    <View style={styles.segment}>
      {TABS.map(({ id, label, Icon }) => {
        const selected = value === id;
        return (
          <Pressable
            key={id}
            style={[styles.segBtn, selected && { backgroundColor: accentColor }]}
            onPress={() => onChange(id)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
          >
            <Icon
              size={15}
              color={selected ? SynthTokens.colors.neutral0 : SynthTokens.colors.neutral600}
            />
            <Text style={[styles.segTxt, selected && styles.segTxtOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  segment: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: SynthTokens.colors.neutral100,
    borderRadius: 14,
    padding: 4,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 10,
  },
  segTxt: {
    fontWeight: '700',
    fontSize: 13,
    color: SynthTokens.colors.neutral600,
  },
  segTxtOn: {
    color: SynthTokens.colors.neutral0,
  },
});
