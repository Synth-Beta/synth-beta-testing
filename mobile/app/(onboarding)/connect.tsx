import React, { useState } from 'react';
import { StyleSheet, View, Pressable, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft, CheckCircle2 } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthButton } from '../../src/components/SynthButton';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { OnboardingProgress } from '../../src/components/OnboardingProgress';
import { supabase } from '../../src/integrations/supabase/client';
import { OnboardingService } from '../../src/services/onboardingService';

export default function ConnectScreen() {
    const router = useRouter();
    const [connectedServices, setConnectedServices] = useState<string[]>([]);

    const handleConnect = async (service: string) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setConnectedServices(prev => [...new Set([...prev, service])]);
    };

    const handleFinish = async () => {
        try {
            // AsyncStorage for local routing
            await AsyncStorage.setItem('HAS_COMPLETED_ONBOARDING', 'true');

            // Supabase for backend state
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await OnboardingService.completeOnboarding(user.id);
            }

            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.replace('/(tabs)');
        } catch (e) {
            console.error('Failed to save onboarding status', e);
            // Still navigate to tabs even if write fails
            router.replace('/(tabs)');
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft color={SynthTokens.colors.neutral900} size={28} />
                </Pressable>
                <OnboardingProgress totalSteps={5} currentStep={5} />
                <Pressable onPress={handleFinish} style={styles.skipButton}>
                    <SynthText variant="meta" color="secondary">Skip</SynthText>
                </Pressable>
            </View>

            <View style={styles.content}>
                <SynthText variant="h1" style={styles.title}>Connect your music</SynthText>
                <SynthText variant="meta" color="secondary" style={styles.subtitle}>
                    We'll build your personal concert passport based on your library
                </SynthText>

                <View style={styles.cardsContainer}>
                    <ServiceCard
                        name="Spotify"
                        color="#1DB954"
                        isConnected={connectedServices.includes('Spotify')}
                        onConnect={() => handleConnect('Spotify')}
                    />
                    <ServiceCard
                        name="Apple Music"
                        color="#FA243C"
                        isConnected={connectedServices.includes('Apple Music')}
                        onConnect={() => handleConnect('Apple Music')}
                    />
                </View>
            </View>

            <View style={styles.footer}>
                <SynthButton
                    title={connectedServices.length > 0 ? "Finish" : "Skip for now"}
                    onPress={handleFinish}
                    variant={connectedServices.length > 0 ? "primary" : "secondary"}
                />
            </View>
        </SafeAreaView>
    );
}

function ServiceCard({ name, color, isConnected, onConnect }: any) {
    return (
        <Pressable onPress={isConnected ? undefined : onConnect} style={styles.cardPressable}>
            <View
                style={[
                    styles.serviceCard,
                    { borderColor: isConnected ? color : SynthTokens.colors.neutral200 }
                ]}
            >
                <View style={styles.cardHeader}>
                    <SynthText variant="accent">{name}</SynthText>
                    {isConnected ? <CheckCircle2 color={color} size={24} /> : null}
                </View>

                <SynthText variant="meta" color="secondary">
                    {isConnected ? 'Connected' : 'Tap to connect'}
                </SynthText>
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
    content: {
        padding: SynthTokens.spacing.xl,
        flex: 1,
    },
    title: {
        marginBottom: 8,
    },
    subtitle: {
        marginBottom: 40,
        opacity: 0.8,
    },
    cardsContainer: {
        gap: 14,
    },
    cardPressable: {
        width: '100%',
    },
    serviceCard: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.large,
        padding: 18,
        borderWidth: 1,
        borderStyle: 'solid',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    footer: {
        padding: SynthTokens.spacing.xl,
        paddingBottom: SynthTokens.spacing.xl + 20,
    },
});
