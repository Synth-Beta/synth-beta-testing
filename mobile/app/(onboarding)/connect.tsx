import React, { useState, useCallback } from 'react';
import { StyleSheet, View, Pressable, SafeAreaView, Text, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { ChevronLeft, CheckCircle2, RefreshCw } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthButton } from '../../src/components/SynthButton';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { OnboardingProgress } from '../../src/components/OnboardingProgress';
import { supabase } from '../../src/integrations/supabase/client';
import { getStreamingLinkStatus } from '../../src/services/streamingConnectionService';
import { getExpoSiteUrl } from '../../src/utils/siteUrl';
import { authenticateSpotifyInApp } from '../../src/services/spotifyAuthService';
import { syncStreamingProfile, withSessionHash } from '../../src/services/streamingSyncActions';

export default function ConnectScreen() {
    const router = useRouter();
    const [isLinked, setIsLinked] = useState(false);
    const [checking, setChecking] = useState(false);

    const openConnectAppleMusic = useCallback(async () => {
        const url = `${getExpoSiteUrl()}/streaming-stats?connect=apple-music&source=expo`;
        await WebBrowser.openBrowserAsync(await withSessionHash(url));
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

    const handleConnectSpotify = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        setChecking(true);
        try {
            const authResult = await authenticateSpotifyInApp();
            if (!authResult.ok) {
                // Silently ignore cancellation; show an alert for real errors.
                if (!authResult.cancelled) {
                    Alert.alert('Connect failed', authResult.error);
                }
                return;
            }

            // Token persisted — trigger first server sync.
            await syncStreamingProfile(user.id, 'spotify', { manual: true });
            const status = await getStreamingLinkStatus(user.id);
            if (status.linked) {
                setIsLinked(true);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        } catch {
            // ignore transient errors in onboarding
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

    // Connecting music is optional. Next: density room preference, then artists.
    const handleContinue = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/(onboarding)/scene');
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft color={SynthTokens.colors.neutral900} size={28} />
                </Pressable>
                <OnboardingProgress totalSteps={5} currentStep={3} />
                <Pressable onPress={handleContinue} style={styles.skipButton}>
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
                        connecting={checking}
                        onConnect={() => void handleConnectSpotify()}
                        subtitle={checking ? 'Connecting…' : 'Stay in app · takes 30 seconds'}
                    />
                    <ServiceCard
                        name="Apple Music"
                        color="#FA243C"
                        isConnected={isLinked}
                        onConnect={() => void openConnectAppleMusic()}
                        subtitle="Opens on web · same quick flow"
                    />
                </View>

                <Pressable onPress={() => void checkStatus()} style={styles.refreshRow} disabled={checking}>
                    <RefreshCw size={14} color={SynthTokens.colors.neutral600} />
                    <Text style={styles.refreshTxt}>
                        {checking ? 'Checking…' : 'Refresh status'}
                    </Text>
                </Pressable>
            </View>

            <View style={styles.footer}>
                <SynthButton
                    title={isLinked ? 'Continue' : 'Skip for now'}
                    onPress={handleContinue}
                    variant={isLinked ? 'primary' : 'secondary'}
                />
            </View>
        </SafeAreaView>
    );
}

function ServiceCard({ name, color, isConnected, connecting, onConnect, subtitle }: {
    name: string;
    color: string;
    isConnected: boolean;
    connecting?: boolean;
    onConnect: () => void;
    subtitle?: string;
}) {
    const sub = isConnected ? 'Connected ✓' : (subtitle ?? 'Tap to connect');
    return (
        <Pressable
            onPress={isConnected || connecting ? undefined : onConnect}
            style={[styles.cardPressable, connecting && { opacity: 0.7 }]}
        >
            <View style={[styles.serviceCard, { borderColor: isConnected ? color : SynthTokens.colors.neutral200 }]}>
                <View style={styles.cardHeader}>
                    <SynthText variant="accent">{name}</SynthText>
                    {isConnected ? <CheckCircle2 color={color} size={24} /> : null}
                </View>
                <SynthText variant="meta" color="secondary">{sub}</SynthText>
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
