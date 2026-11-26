import React, { useState, useCallback, useEffect } from 'react';
import { StyleSheet, View, Pressable, SafeAreaView, Text, Alert, ScrollView } from 'react-native';
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
import { withSessionHash } from '../../src/services/streamingSyncActions';
import { trackOnboardingStep } from '../../src/services/onboardingTelemetry';
import { MusicImportOptions } from '../../src/components/streaming/MusicImportOptions';

export default function ConnectScreen() {
    const router = useRouter();
    // No Spotify login here, even for admins: Spotify's Development Mode only serves
    // allowlisted accounts. Everyone gets Apple Music, Last.fm, or the Spotify data upload.
    const [isLinked, setIsLinked] = useState(false);
    const [checking, setChecking] = useState(false);
    // Shown when a connection attempt didn't take, so nobody waits on a silent failure.
    const [connectNote, setConnectNote] = useState<string | null>(null);

    useEffect(() => {
        trackOnboardingStep('connect');
    }, []);

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
                    setConnectNote(null);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                } else {
                    setConnectNote("Apple Music didn't connect. You can try again or skip for now.");
                }
            }
        } catch {
            setConnectNote("Apple Music didn't connect. You can try again or skip for now.");
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

    // Connecting music is optional. Next: artists (the DC room is joined automatically there).
    const handleContinue = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/(onboarding)/artists');
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft color={SynthTokens.colors.neutral900} size={28} />
                </Pressable>
                <OnboardingProgress totalSteps={3} currentStep={2} />
                <Pressable onPress={handleContinue} style={styles.skipButton}>
                    <SynthText variant="meta" color="secondary">Skip</SynthText>
                </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
                <SynthText variant="h1" style={styles.title}>Connect your music</SynthText>
                <SynthText variant="meta" color="secondary" style={styles.subtitle}>
                    Recommended: we'll pick artists and shows for you from your library. Optional, you can skip.
                </SynthText>

                <View style={styles.cardsContainer}>
                    <ServiceCard
                        name="Apple Music"
                        color="#FA243C"
                        isConnected={isLinked}
                        onConnect={() => void openConnectAppleMusic()}
                        subtitle="Opens on web · same quick flow"
                    />
                    {isLinked ? null : (
                        // Last.fm + the Spotify data upload. The export email takes days, so it is
                        // shown for users who already have it; anyone else can skip and upload later.
                        <MusicImportOptions
                            showExport
                            onImported={() => {
                                setIsLinked(true);
                                setConnectNote(null);
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            }}
                        />
                    )}
                </View>

                <Pressable onPress={() => void checkStatus()} style={styles.refreshRow} disabled={checking}>
                    <RefreshCw size={14} color={SynthTokens.colors.neutral600} />
                    <Text style={styles.refreshTxt}>
                        {checking ? 'Checking…' : 'Refresh status'}
                    </Text>
                </Pressable>
            </ScrollView>

            <View style={styles.footer}>
                {connectNote && !isLinked ? (
                    <Text style={styles.connectNote} accessibilityLiveRegion="polite">{connectNote}</Text>
                ) : null}
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
    const sub = isConnected ? 'Connected' : (subtitle ?? 'Tap to connect');
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
    connectNote: {
        fontSize: 14,
        lineHeight: 20,
        color: SynthTokens.colors.neutral600,
        textAlign: 'center',
        marginBottom: 12,
    },
    container: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SynthTokens.spacing.md,
    },
    backButton: { padding: 8 },
    skipButton: { padding: 8 },
    content: { padding: SynthTokens.spacing.xl, flexGrow: 1 },
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
