import React, { useState, useCallback } from 'react';
import { StyleSheet, View, Pressable, SafeAreaView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronLeft, CheckCircle2, RefreshCw } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthButton } from '../../src/components/SynthButton';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { OnboardingProgress } from '../../src/components/OnboardingProgress';
import { supabase } from '../../src/integrations/supabase/client';
import { OnboardingService } from '../../src/services/onboardingService';
import { getStreamingLinkStatus } from '../../src/services/streamingConnectionService';
import { buildExpoSpotifyConnectUrl } from '../../src/services/streamingSyncActions';
import { getExpoSiteUrl } from '../../src/utils/siteUrl';

export default function ConnectScreen() {
    const router = useRouter();
    const [isLinked, setIsLinked] = useState(false);
    const [checking, setChecking] = useState(false);

    const openConnect = useCallback(async (provider: 'spotify' | 'apple-music') => {
        const url =
            provider === 'spotify'
                ? buildExpoSpotifyConnectUrl()
                : `${getExpoSiteUrl()}/streaming-stats?connect=${encodeURIComponent(provider)}&source=expo`;
        await WebBrowser.openBrowserAsync(url);
        // After browser closes, check if they connected
        setChecking(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const status = await getStreamingLinkStatus(user.id);
                if (status.linked) {
                    setIsLinked(true);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }
            }
        } catch {
            // ignore
        } finally {
            setChecking(false);
        }
    }, []);

    const checkStatus = useCallback(async () => {
        setChecking(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const status = await getStreamingLinkStatus(user.id);
                setIsLinked(status.linked);
            }
        } finally {
            setChecking(false);
        }
    }, []);

    const handleFinish = async () => {
        try {
            await AsyncStorage.setItem('HAS_COMPLETED_ONBOARDING', 'true');
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                await OnboardingService.completeOnboarding(user.id);
            }
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.replace('/(tabs)');
        } catch (e) {
            console.error('Failed to save onboarding status', e);
            router.replace('/(tabs)');
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft color={SynthTokens.colors.neutral900} size={28} />
                </Pressable>
                <OnboardingProgress totalSteps={6} currentStep={6} />
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
                        isConnected={isLinked}
                        onConnect={() => void openConnect('spotify')}
                    />
                    <ServiceCard
                        name="Apple Music"
                        color="#FA243C"
                        isConnected={isLinked}
                        onConnect={() => void openConnect('apple-music')}
                    />
                </View>

                <Pressable onPress={() => void checkStatus()} style={styles.refreshRow} disabled={checking}>
                    <RefreshCw size={14} color={SynthTokens.colors.neutral600} />
                    <Text style={styles.refreshTxt}>
                        {checking ? 'Checking…' : 'Refresh status after connecting'}
                    </Text>
                </Pressable>

                <SynthText variant="meta" color="secondary" style={styles.note}>
                    OAuth happens on the web — tap a button above, sign in, then tap Refresh status.
                </SynthText>
            </View>

            <View style={styles.footer}>
                <SynthButton
                    title={isLinked ? 'Finish' : 'Skip for now'}
                    onPress={handleFinish}
                    variant={isLinked ? 'primary' : 'secondary'}
                />
            </View>
        </SafeAreaView>
    );
}

function ServiceCard({ name, color, isConnected, onConnect }: {
    name: string; color: string; isConnected: boolean; onConnect: () => void;
}) {
    return (
        <Pressable onPress={isConnected ? undefined : onConnect} style={styles.cardPressable}>
            <View style={[styles.serviceCard, { borderColor: isConnected ? color : SynthTokens.colors.neutral200 }]}>
                <View style={styles.cardHeader}>
                    <SynthText variant="accent">{name}</SynthText>
                    {isConnected ? <CheckCircle2 color={color} size={24} /> : null}
                </View>
                <SynthText variant="meta" color="secondary">
                    {isConnected ? 'Connected ✓' : 'Tap to connect'}
                </SynthText>
            </View>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SynthTokens.spacing.md,
    },
    backButton: { padding: 8 },
    skipButton: { padding: 8 },
    content: { padding: SynthTokens.spacing.xl, flex: 1 },
    title: { marginBottom: 8 },
    subtitle: { marginBottom: 40, opacity: 0.8 },
    cardsContainer: { gap: 14 },
    cardPressable: { width: '100%' },
    serviceCard: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.large,
        padding: 18,
        borderWidth: 1,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    refreshRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 20,
        alignSelf: 'flex-start',
    },
    refreshTxt: {
        fontSize: 13,
        color: SynthTokens.colors.neutral600,
        fontWeight: '500',
    },
    note: {
        marginTop: 12,
        fontSize: 12,
        lineHeight: 18,
        opacity: 0.7,
    },
    footer: {
        padding: SynthTokens.spacing.xl,
        paddingBottom: SynthTokens.spacing.xl + 20,
    },
});
