import React from 'react';
import {
  Modal,
  View,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { bottomSafeContentPadding } from '../navigation/SynthTabBar';

export type VibeType =
  | 'similar-artists'
  | 'last-5-attended'
  | 'similar-taste-users'
  | 'this-weekend'
  | 'under-25'
  | 'small-venues'
  | 'late-shows'
  | 'up-and-coming'
  | 'less-than-10-reviews'
  | 'highest-rated-month'
  | 'best-venues'
  | 'best-value';

const VIBES: Array<{
  id: VibeType;
  title: string;
  description: string;
}> = [
  {
    id: 'similar-artists',
    title: 'Similar to Artists You Love',
    description: 'Events by artists you already know and love.',
  },
  {
    id: 'last-5-attended',
    title: 'Based on Your Last 5 Shows',
    description: 'Pick up where your recent concerts left off.',
  },
  {
    id: 'similar-taste-users',
    title: 'Highly Rated by Similar Tastes',
    description: 'Events loved by people who rate the same music as you.',
  },
  {
    id: 'this-weekend',
    title: 'This Weekend',
    description: 'Plan your weekend with curated upcoming shows.',
  },
  {
    id: 'under-25',
    title: 'Under $25',
    description: 'Affordable gigs with a price tag under $25.',
  },
  {
    id: 'small-venues',
    title: 'Small Venues',
    description: 'Intimate stages with limited space and curated vibes.',
  },
  {
    id: 'late-shows',
    title: 'Late Shows',
    description: 'Events kicking off after 10 PM for night owls.',
  },
  {
    id: 'up-and-coming',
    title: 'Up-and-Coming Artists',
    description: 'Catch fresh talent before they blow up.',
  },
  {
    id: 'less-than-10-reviews',
    title: 'Events with <10 Reviews',
    description: 'Be among the first to review these new shows.',
  },
  {
    id: 'highest-rated-month',
    title: 'Highest-Rated This Month',
    description: 'The most celebrated events of the month.',
  },
  {
    id: 'best-venues',
    title: 'Best Venues',
    description: 'Venues with 4+ star reputations.',
  },
  {
    id: 'best-value',
    title: 'Best Value',
    description: 'Great shows that stretch your dollar further.',
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: VibeType) => void;
}

export function VibeSelectorSheet({ visible, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  const sheetMarginBottom = bottomSafeContentPadding(insets.bottom);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, { marginBottom: sheetMarginBottom }]}>
          <View style={styles.handle} />
          <SynthText variant="h2" style={styles.title}>
            Browse Vibes
          </SynthText>
          <SynthText variant="meta" color="secondary" style={styles.subtitle}>
            Tap a curated vibe to start exploring events from a fresh perspective.
          </SynthText>
          <ScrollView contentContainerStyle={styles.list}>
            {VIBES.map(vibe => (
              <Pressable
                key={vibe.id}
                style={({ pressed }) => [
                  styles.card,
                  pressed ? styles.cardPressed : null,
                ]}
                onPress={() => {
                  onSelect(vibe.id);
                  onClose();
                }}
              >
                <View style={styles.badge} />
                <View style={styles.cardText}>
                  <SynthText variant="meta" style={styles.cardTitle}>
                    {vibe.title}
                  </SynthText>
                  <SynthText variant="meta" color="secondary" style={styles.cardDescription}>
                    {vibe.description}
                  </SynthText>
                </View>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <SynthText variant="meta" color="secondary">
              Close
            </SynthText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderTopLeftRadius: SynthTokens.radius.lg,
    borderTopRightRadius: SynthTokens.radius.lg,
    paddingHorizontal: SynthTokens.spacing.md,
    paddingTop: SynthTokens.spacing.sm,
    paddingBottom: SynthTokens.spacing.lg,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: SynthTokens.colors.neutral200,
    alignSelf: 'center',
    marginBottom: SynthTokens.spacing.sm,
  },
  title: {
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 2,
  },
  list: {
    gap: SynthTokens.spacing.sm,
    marginTop: SynthTokens.spacing.md,
    paddingBottom: SynthTokens.spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SynthTokens.spacing.md,
    padding: SynthTokens.spacing.md,
    borderRadius: SynthTokens.radius.lg,
    backgroundColor: SynthTokens.colors.neutral0,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  cardPressed: {
    backgroundColor: SynthTokens.colors.neutral50,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: SynthTokens.radius.full,
    backgroundColor: SynthTokens.colors.brandPink500,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardDescription: {
    marginTop: 4,
    fontSize: 13,
  },
  closeButton: {
    alignSelf: 'center',
    marginTop: SynthTokens.spacing.sm,
  },
});
