import React, { useState } from 'react';
import { StyleSheet, View, Pressable, ScrollView, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { ChevronLeft } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthButton } from '../../src/components/SynthButton';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { OnboardingProgress } from '../../src/components/OnboardingProgress';
import { supabase } from '../../src/services/supabase';
import { OnboardingService } from '../../src/services/onboardingService';

const GENRES = [
    'Indie', 'Hip-Hop', 'Electronic', 'Jazz', 'Classical', 'Rock',
    'Pop', 'R&B', 'Country', 'Metal', 'Folk', 'Latin'
];

export default function SceneScreen() {
    const router = useRouter();
    const [selectedGenres, setSelectedGenres] = useState<string[]>([]);

    const toggleGenre = (genre: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelectedGenres(prev =>
            prev.includes(genre)
                ? prev.filter(g => g !== genre)
                : [...prev, genre]
        );
    };

    const handleContinue = async () => {
        // Silent background write
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                OnboardingService.saveGenres(user.id, selectedGenres);
            }
        } catch (error) {
            console.warn('Genre write failed:', error);
        }

        router.push('/(onboarding)/artists');
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft color={SynthTokens.colors.neutral900} size={28} />
                </Pressable>
                <OnboardingProgress totalSteps={5} currentStep={2} />
                <Pressable onPress={handleContinue} style={styles.skipButton}>
                    <SynthText variant="meta" color="secondary">Skip</SynthText>
                </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <SynthText variant="h1" style={styles.title}>What's your scene?</SynthText>
                <SynthText variant="meta" color="secondary" style={styles.subtitle}>
                    Pick the genres you love
                </SynthText>

                <View style={styles.grid}>
                    {GENRES.map(genre => (
                        <GenrePill
                            key={genre}
                            label={genre}
                            selected={selectedGenres.includes(genre)}
                            onPress={() => toggleGenre(genre)}
                        />
                    ))}
                </View>
            </ScrollView>

            <View style={styles.footer}>
                <SynthButton
                    title="Continue"
                    onPress={handleContinue}
                    disabled={selectedGenres.length === 0}
                />
            </View>
        </SafeAreaView>
    );
}

function GenrePill({ label, selected, onPress }: { label: string, selected: boolean, onPress: () => void }) {
    const scale = withSpring(selected ? 1.03 : 1, { damping: 15 });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale }],
    }));

    return (
        <Pressable onPress={onPress}>
            <Animated.View style={[
                styles.pill,
                selected ? styles.pillSelected : styles.pillUnselected,
                animatedStyle
            ]}>
                <SynthText
                    variant="meta"
                    style={[styles.pillText, selected ? styles.pillTextSelected : styles.pillTextUnselected]}
                >
                    {label}
                </SynthText>
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: SynthTokens.colors.neutral50,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SynthTokens.spacing.md,
    },
    backButton: {
        padding: 8,
    },
    skipButton: {
        padding: 8,
    },
    content: {
        padding: SynthTokens.spacing.xl,
    },
    title: {
        marginBottom: 8,
    },
    subtitle: {
        marginBottom: 32,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    pill: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 99,
        borderWidth: 1,
    },
    pillSelected: {
        backgroundColor: SynthTokens.colors.brandPink500,
        borderColor: SynthTokens.colors.brandPink500,
    },
    pillUnselected: {
        backgroundColor: SynthTokens.colors.neutral100,
        borderColor: SynthTokens.colors.neutral200,
    },
    pillText: {
        fontWeight: '600',
    },
    pillTextSelected: {
        color: SynthTokens.colors.neutral0,
    },
    pillTextUnselected: {
        color: SynthTokens.colors.neutral900,
    },
    footer: {
        padding: SynthTokens.spacing.xl,
        paddingBottom: SynthTokens.spacing.xl + 20,
    },
});
