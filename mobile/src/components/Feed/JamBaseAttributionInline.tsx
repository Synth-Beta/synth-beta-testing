import React from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { SynthTokens } from '../../tokens/SynthTokens';

/**
 * Mirrors web {@link src/components/attribution/JamBaseAttribution.tsx} (inline variant).
 * Required attribution for JamBase-sourced event data.
 */
export const JamBaseAttributionInline: React.FC = () => {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <Text style={styles.text} numberOfLines={2}>
        Powered by{' '}
        <Text
          style={styles.link}
          onPress={() => {
            void Linking.openURL('https://www.jambase.com');
          }}
        >
          JamBase
        </Text>
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SynthTokens.spacing.xs,
    minWidth: 0,
  },
  text: {
    fontSize: 11,
    fontWeight: '500',
    color: SynthTokens.colors.neutral600,
    textAlign: 'center',
  },
  link: {
    fontSize: 11,
    fontWeight: '500',
    color: SynthTokens.colors.neutral600,
    textDecorationLine: 'underline',
    textDecorationColor: SynthTokens.colors.neutral400,
  },
});
