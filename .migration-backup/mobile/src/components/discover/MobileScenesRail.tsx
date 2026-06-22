import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { SceneService, type Scene } from '../../services/sceneService';

interface MobileScenesRailProps {
    userId: string | null;
}

export const MobileScenesRail: React.FC<MobileScenesRailProps> = ({ userId }) => {
    const router = useRouter();
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            setLoading(true);
            try {
                if (userId) {
                    await SceneService.refreshAllSceneProgress(userId);
                }
                const data = await SceneService.getScenes(10, userId ?? undefined);
                if (!cancelled) setScenes(data);
            } catch {
                if (!cancelled) setScenes([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [userId]);

    if (loading) {
        return (
            <View style={styles.loadingWrap}>
                <ActivityIndicator color={SynthTokens.colors.brandPink500} />
            </View>
        );
    }

    if (scenes.length === 0) return null;

    return (
        <View style={styles.section}>
            <SynthText variant="h2" style={styles.title}>
                Scenes & Signals
            </SynthText>
            <SynthText variant="meta" color="secondary" style={styles.sub}>
                Music scenes defined by genre overlap, venue clusters, and co-attendance patterns.
            </SynthText>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.rail}
            >
                {scenes.map(scene => {
                    const progress = scene.userProgress;
                    const totalParticipants =
                        scene.participants?.length ||
                        (scene.participating_artists?.length || 0) +
                            (scene.participating_venues?.length || 0) +
                            (scene.participating_cities?.length || 0) +
                            (scene.participating_genres?.length || 0);
                    const engagedCount = progress
                        ? (progress.artists_experienced || 0) +
                          (progress.venues_experienced || 0) +
                          (progress.cities_experienced || 0) +
                          (progress.genres_experienced || 0)
                        : 0;
                    const progressPercent =
                        totalParticipants > 0
                            ? Math.min((engagedCount / totalParticipants) * 100, 100)
                            : 0;
                    return (
                        <Pressable
                            key={scene.id}
                            style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                            onPress={() => router.push(`/scene/${scene.id}`)}
                            accessibilityRole="button"
                            accessibilityLabel={`Open scene ${scene.name}`}
                        >
                            <SynthText variant="meta" style={styles.cardTitle} numberOfLines={2}>
                                {scene.name}
                            </SynthText>
                            {scene.short_description ? (
                                <SynthText variant="meta" color="secondary" numberOfLines={3} style={styles.cardDesc}>
                                    {scene.short_description}
                                </SynthText>
                            ) : null}
                            <View style={styles.barTrack}>
                                <View style={[styles.barFill, { width: `${progressPercent}%` }]} />
                            </View>
                            <SynthText variant="meta" color="secondary" style={styles.progressMeta}>
                                Progress: {engagedCount}/{totalParticipants || 1}
                            </SynthText>
                        </Pressable>
                    );
                })}
            </ScrollView>
        </View>
    );
};

const PINK = SynthTokens.colors.brandPink500;

const styles = StyleSheet.create({
    section: { marginTop: 8, gap: 8 },
    title: { fontSize: 18, fontWeight: '700', color: SynthTokens.colors.neutral900 },
    sub: { fontSize: 13, lineHeight: 18 },
    rail: { gap: 12, paddingVertical: 8 },
    card: {
        width: 280,
        padding: 14,
        borderRadius: 16,
        backgroundColor: SynthTokens.colors.neutral0,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    cardPressed: { opacity: 0.92 },
    cardTitle: { fontWeight: '700', fontSize: 15, minHeight: 40 },
    cardDesc: { marginTop: 6, fontSize: 13 },
    barTrack: {
        marginTop: 10,
        height: 6,
        borderRadius: 3,
        backgroundColor: SynthTokens.colors.neutral200,
        overflow: 'hidden',
    },
    barFill: { height: '100%', backgroundColor: PINK },
    progressMeta: { marginTop: 6, fontSize: 12 },
    loadingWrap: { paddingVertical: 24, alignItems: 'center' },
});
