import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Pressable, SafeAreaView, TextInput, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft, Search, Check } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthButton } from '../../src/components/SynthButton';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { OnboardingProgress } from '../../src/components/OnboardingProgress';
import { ArtistService, Artist } from '../../src/services/artistService';
import { supabase } from '../../src/integrations/supabase/client';
import { OnboardingService } from '../../src/services/onboardingService';

const ONBOARDING_STORAGE_KEY_PREFIX = 'HAS_COMPLETED_ONBOARDING:';
const getOnboardingStorageKey = (userId: string) => `${ONBOARDING_STORAGE_KEY_PREFIX}${userId}`;

export default function ArtistsScreen() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');
    const [artists, setArtists] = useState<Artist[]>([]);
    const [selectedArtistIds, setSelectedArtistIds] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadSuggestedArtists();
    }, []);

    const loadSuggestedArtists = async () => {
        setIsLoading(true);
        const data = await ArtistService.getSuggestedArtists();
        setArtists(data);
        setIsLoading(false);
    };

    const handleSearch = async (text: string) => {
        setSearchQuery(text);
        if (text.length > 2) {
            const results = await ArtistService.searchArtists(text);
            setArtists(results);
        } else if (text.length === 0) {
            loadSuggestedArtists();
        }
    };

    const toggleArtist = (id: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelectedArtistIds(prev =>
            prev.includes(id)
                ? prev.filter(artistId => artistId !== id)
                : [...prev, id]
        );
    };

    const MIN_ARTISTS = 3;
    const enoughArtists = selectedArtistIds.length >= MIN_ARTISTS;

    const handleContinue = async () => {
        // Require a minimum so the personalized feed has real signal to work with.
        if (!enoughArtists) return;
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await OnboardingService.followArtists(user.id, selectedArtistIds);
                // Final onboarding step — mark complete (local per-user flag + server).
                await AsyncStorage.setItem(getOnboardingStorageKey(user.id), 'true');
                await OnboardingService.completeOnboarding(user.id);
            }
        } catch (error) {
            console.warn('Artist follow / onboarding-complete write failed:', error);
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        // End onboarding on Home (feed), not Discover.
        // No trailing slash — '/(tabs)/' is not a valid typed route and every other
        // call site in the app uses this form (_layout, share, email-required, post).
        router.replace('/(tabs)');
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft color={SynthTokens.colors.neutral900} size={28} />
                </Pressable>
                <OnboardingProgress totalSteps={5} currentStep={5} />
                {/* No skip — at least 3 artists is required so the feed has real signal. */}
                <View style={styles.skipButton} />
            </View>

            <View style={styles.searchContainer}>
                <Search color={SynthTokens.colors.neutral400} size={20} style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search artists..."
                    placeholderTextColor={SynthTokens.colors.neutral400}
                    value={searchQuery}
                    onChangeText={handleSearch}
                />
            </View>

            <FlatList
                data={artists}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                    <ArtistCard
                        artist={item}
                        selected={selectedArtistIds.includes(item.id)}
                        onPress={() => toggleArtist(item.id)}
                    />
                )}
                ListHeaderComponent={
                    <View style={styles.textContent}>
                        <SynthText variant="h1" style={styles.title}>Follow your favorites</SynthText>
                        <SynthText variant="meta" color="secondary" style={styles.subtitle}>
                            Pick at least 3 — this powers your personalized feed
                        </SynthText>
                    </View>
                }
            />

            <View style={styles.footer}>
                <SynthButton
                    title={enoughArtists ? `Follow ${selectedArtistIds.length} Artists` : `Pick at least 3 (${selectedArtistIds.length}/3)`}
                    onPress={handleContinue}
                    disabled={!enoughArtists}
                />
            </View>
        </SafeAreaView>
    );
}

function ArtistCard({ artist, selected, onPress }: { artist: Artist, selected: boolean, onPress: () => void }) {
    return (
        <Pressable onPress={onPress}>
            <View style={[styles.artistRow, selected && styles.artistRowSelected]}>
                <View style={styles.artistTextWrap}>
                    <SynthText variant="accent" style={styles.artistName} numberOfLines={1}>
                        {artist.name}
                    </SynthText>
                    <SynthText variant="meta" color="secondary" numberOfLines={1}>
                        {artist.genres?.[0] || 'Artist'}
                    </SynthText>
                </View>
                <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected ? <Check color="white" size={16} strokeWidth={3} /> : null}
                </View>
            </View>
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
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: SynthTokens.colors.neutral100,
        marginHorizontal: SynthTokens.spacing.xl,
        marginTop: SynthTokens.spacing.md,
        marginBottom: SynthTokens.spacing.lg,
        paddingHorizontal: SynthTokens.spacing.md,
        borderRadius: SynthTokens.radius.medium,
        height: 48,
    },
    searchIcon: {
        marginRight: 8,
    },
    searchInput: {
        flex: 1,
        color: SynthTokens.colors.neutral900,
        fontSize: 16,
        fontFamily: 'Inter-Medium',
    },
    listContent: {
        paddingHorizontal: SynthTokens.spacing.xl,
        paddingBottom: 20,
    },
    textContent: {
        marginBottom: 24,
    },
    title: {
        marginBottom: 4,
    },
    subtitle: {
        opacity: 0.8,
    },
    artistRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.large,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    artistRowSelected: {
        borderColor: SynthTokens.colors.brandPink500,
    },
    artistTextWrap: {
        flex: 1,
        gap: 2,
    },
    artistName: {
        fontWeight: '600',
    },
    checkbox: {
        width: 26,
        height: 26,
        borderRadius: 13,
        borderWidth: 2,
        borderColor: SynthTokens.colors.neutral200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: SynthTokens.colors.brandPink500,
        borderColor: SynthTokens.colors.brandPink500,
    },
    footer: {
        padding: SynthTokens.spacing.xl,
        paddingBottom: SynthTokens.spacing.xl + 20,
        backgroundColor: SynthTokens.colors.neutral50,
    },
});
