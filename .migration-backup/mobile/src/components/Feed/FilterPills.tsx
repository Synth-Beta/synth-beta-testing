import React from 'react';
import { StyleSheet, ScrollView, Pressable, View } from 'react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

export type FeedFilter = 'For You' | 'Following' | 'Trending';

interface FilterPillsProps {
    activeFilter: FeedFilter;
    onFilterChange: (filter: FeedFilter) => void;
}

const filters: FeedFilter[] = ['For You', 'Following', 'Trending'];

export const FilterPills: React.FC<FilterPillsProps> = ({ activeFilter, onFilterChange }) => {
    return (
        <View style={styles.container}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {filters.map((filter) => {
                    const isActive = activeFilter === filter;

                    return (
                        <Pressable
                            key={filter}
                            onPress={() => onFilterChange(filter)}
                            style={({ pressed }) => [
                                styles.pill,
                                isActive ? styles.activePill : styles.inactivePill,
                                pressed && styles.pressedPill
                            ]}
                        >
                            <SynthText
                                variant="meta"
                                color={isActive ? 'white' : 'secondary'}
                                style={isActive ? styles.activeText : undefined}
                            >
                                {filter}
                            </SynthText>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingVertical: SynthTokens.spacing.md,
        backgroundColor: SynthTokens.colors.neutral50,
    },
    scrollContent: {
        paddingHorizontal: SynthTokens.spacing.md,
        gap: SynthTokens.spacing.sm,
    },
    pill: {
        paddingHorizontal: SynthTokens.spacing.md,
        paddingVertical: 8,
        borderRadius: SynthTokens.radius.full,
        borderWidth: 1,
    },
    activePill: {
        backgroundColor: SynthTokens.colors.brandPink500,
        borderColor: SynthTokens.colors.brandPink500,
    },
    inactivePill: {
        backgroundColor: SynthTokens.colors.neutral100,
        borderColor: SynthTokens.colors.neutral200,
    },
    pressedPill: {
        opacity: 0.8,
        transform: [{ scale: 0.98 }],
    },
    activeText: {
        fontWeight: 'bold',
    }
});
