import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Pressable, SafeAreaView, TextInput, FlatList } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Search, Check } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthButton } from '../../src/components/SynthButton';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { OnboardingProgress } from '../../src/components/OnboardingProgress';
import { ArtistService, Artist } from '../../src/services/artistService';
import { supabase } from '../../src/integrations/supabase/client';
import { OnboardingService } from '../../src/services/onboardingService';

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

    const handleContinue = async () => {
        // Silent background write
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                OnboardingService.followArtists(user.id, selectedArtistIds);
            }
        } catch (error) {
            console.warn('Artist follow write failed:', error);
        }

        router.push('/(onboarding)/venues');
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft color={SynthTokens.colors.neutral900} size={28} />
                </Pressable>
                <OnboardingProgress totalSteps={6} currentStep={4} />
                <Pressable onPress={handleContinue} style={styles.skipButton}>
                    <SynthText variant="meta" color="secondary">Skip</SynthText>
                </Pressable>
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
                            We'll notify you when they play nearby
                        </SynthText>
                    </View>
                }
            />

            <View style={styles.footer}>
                <SynthButton
                    title={selectedArtistIds.length > 0 ? `Follow ${selectedArtistIds.length} Artists` : "Continue"}
                    onPress={handleContinue}
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
