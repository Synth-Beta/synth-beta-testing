import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Pressable, SafeAreaView, FlatList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { ChevronLeft, MapPin, Check } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthButton } from '../../src/components/SynthButton';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { OnboardingProgress } from '../../src/components/OnboardingProgress';
import { VenueService, Venue } from '../../src/services/venueService';
import { supabase } from '../../src/integrations/supabase/client';
import { OnboardingService } from '../../src/services/onboardingService';

export default function VenuesScreen() {
    const router = useRouter();
    const [venues, setVenues] = useState<Venue[]>([]);
    const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        initLocationAndVenues();
    }, []);

    const initLocationAndVenues = async () => {
        setIsLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status === 'granted') {
                const location = await Location.getCurrentPositionAsync({});
                const nearby = await VenueService.getNearbyVenues(location.coords.latitude, location.coords.longitude);
                setVenues(nearby);
            } else {
                const popular = await VenueService.getPopularVenues();
                setVenues(popular);
            }
        } catch (error) {
            const popular = await VenueService.getPopularVenues();
            setVenues(popular);
        }
        setIsLoading(false);
    };

    const toggleVenue = (id: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelectedVenueIds(prev =>
            prev.includes(id)
                ? prev.filter(vId => vId !== id)
                : [...prev, id]
        );
    };

    const handleContinue = async () => {
        // Silent background write
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                OnboardingService.followVenues(user.id, selectedVenueIds);
            }
        } catch (error) {
            console.warn('Venue follow write failed:', error);
        }

        router.push('/(onboarding)/connect');
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft color={SynthTokens.colors.neutral900} size={28} />
                </Pressable>
                <OnboardingProgress totalSteps={6} currentStep={5} />
                <Pressable onPress={handleContinue} style={styles.skipButton}>
                    <SynthText variant="meta" color="secondary">Skip</SynthText>
                </Pressable>
            </View>

            <View style={styles.textContent}>
                <SynthText variant="h1" style={styles.title}>Follow local venues</SynthText>
                <SynthText variant="meta" color="secondary" style={styles.subtitle}>
                    Get alerts for new shows at your favorite spots
                </SynthText>
            </View>

            {isLoading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator color={SynthTokens.colors.brandPink500} size="large" />
                </View>
            ) : (
                <FlatList
                    data={venues}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    renderItem={({ item }) => (
                        <VenueRow
                            venue={item}
                            selected={selectedVenueIds.includes(item.id)}
                            onPress={() => toggleVenue(item.id)}
                        />
                    )}
                    ListEmptyComponent={
                        <View style={styles.emptyContent}>
                            <SynthText variant="body" color="secondary">No venues found nearby.</SynthText>
                        </View>
                    }
                />
            )}

            <View style={styles.footer}>
                <SynthButton
                    title={selectedVenueIds.length > 0 ? `Follow ${selectedVenueIds.length} Venues` : "Continue"}
                    onPress={handleContinue}
                />
            </View>
        </SafeAreaView>
    );
}

function VenueRow({ venue, selected, onPress }: { venue: Venue, selected: boolean, onPress: () => void }) {
    return (
        <Pressable onPress={onPress}>
            <View style={[styles.venueRow, selected && styles.venueRowSelected]}>
                <Image
                    source={{ uri: venue.image_url || 'https://via.placeholder.com/150' }}
                    style={styles.venueImage}
                    contentFit="cover"
                />
                <View style={styles.venueInfo}>
                    <SynthText variant="accent" style={styles.venueName} numberOfLines={1}>
                        {venue.name}
                    </SynthText>
                    <View style={styles.locationContainer}>
                        <MapPin size={14} color={SynthTokens.colors.neutral600} />
                        <SynthText variant="meta" color="secondary" style={styles.cityText}>
                            {venue.city || 'Unknown Location'}
                        </SynthText>
                    </View>
                </View>
                <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                    {selected && <Check color="white" size={16} strokeWidth={3} />}
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
    textContent: {
        paddingHorizontal: SynthTokens.spacing.xl,
        marginTop: SynthTokens.spacing.md,
        marginBottom: SynthTokens.spacing.lg,
    },
    title: {
        marginBottom: 4,
    },
    subtitle: {
        opacity: 0.8,
    },
    listContent: {
        paddingHorizontal: SynthTokens.spacing.xl,
        paddingBottom: 20,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    venueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.large,
        padding: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    venueRowSelected: {
        borderColor: SynthTokens.colors.brandPink500,
    },
    venueImage: {
        width: 64,
        height: 64,
        borderRadius: SynthTokens.radius.medium,
    },
    venueInfo: {
        flex: 1,
        marginLeft: 16,
    },
    venueName: {
        fontWeight: '700',
        marginBottom: 4,
    },
    locationContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    cityText: {
        fontSize: 14,
    },
    checkbox: {
        width: 28,
        height: 28,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: SynthTokens.colors.neutral200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: SynthTokens.colors.brandPink500,
        borderColor: SynthTokens.colors.brandPink500,
    },
    emptyContent: {
        alignItems: 'center',
        marginTop: 40,
    },
    footer: {
        padding: SynthTokens.spacing.xl,
        paddingBottom: SynthTokens.spacing.xl + 20,
        backgroundColor: SynthTokens.colors.neutral50,
    },
});
