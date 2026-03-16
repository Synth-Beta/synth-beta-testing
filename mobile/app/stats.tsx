import React, { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { StatsService, StreamingStats } from '../src/services/statsService';
import { supabase } from '../src/integrations/supabase/client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Music, Mic2, BarChart3, TrendingUp } from 'lucide-react-native';

export default function LoadingStatsScreen() {
    const [stats, setStats] = useState<StreamingStats | null>(null);
    const [loading, setLoading] = useState(true);
    const insets = useSafeAreaInsets();

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const data = await StatsService.getStats(user.id);
        setStats(data);
        setLoading(false);
    };

    return (
        <View style={styles.container}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 100 }}
            >
                <View style={styles.header}>
                    <SynthText variant="h1">Streaming Stats</SynthText>
                    <SynthText variant="body" color="secondary">Your music journey this year</SynthText>
                </View>

                <View style={styles.statsGrid}>
                    <View style={styles.statCard}>
                        <TrendingUp size={24} color={SynthTokens.colors.brandPink500} />
                        <SynthText variant="h2" style={styles.statValue}>{stats?.total_listening_hours || 0}</SynthText>
                        <SynthText variant="meta" color="secondary">Hours Played</SynthText>
                    </View>
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Mic2 size={20} color={SynthTokens.colors.neutral900} />
                        <SynthText variant="h2" style={styles.sectionTitle}>Top Artists</SynthText>
                    </View>
                    {stats?.top_artists.map((artist: any, index: number) => (
                        <View key={artist.name} style={styles.artistRow}>
                            <SynthText variant="meta" style={styles.rankText}>{index + 1}</SynthText>
                            <View style={styles.artistInfo}>
                                <SynthText variant="meta" style={styles.bold}>{artist.name}</SynthText>
                                <View style={styles.popularityBarContainer}>
                                    <View style={[styles.popularityBar, { width: `${artist.popularity || 0}%` }]} />
                                </View>
                            </View>
                        </View>
                    ))}
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <BarChart3 size={20} color={SynthTokens.colors.neutral900} />
                        <SynthText variant="h2" style={styles.sectionTitle}>Top Genres</SynthText>
                    </View>
                    <View style={styles.genresContainer}>
                        {stats?.top_genres.map((genre: any) => (
                            <View key={genre.genre} style={styles.genrePill}>
                                <SynthText variant="meta" style={styles.bold}>{genre.genre}</SynthText>
                                <SynthText variant="meta" color="secondary">{genre.count} plays</SynthText>
                            </View>
                        ))}
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: SynthTokens.colors.neutral50,
    },
    header: {
        paddingHorizontal: SynthTokens.spacing.md,
        marginBottom: SynthTokens.spacing.xl,
    },
    statsGrid: {
        paddingHorizontal: SynthTokens.spacing.md,
        marginBottom: SynthTokens.spacing.xl,
    },
    statCard: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.large,
        padding: SynthTokens.spacing.xl,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    statValue: {
        fontSize: 48,
        fontWeight: 'bold',
        marginVertical: 8,
    },
    section: {
        paddingHorizontal: SynthTokens.spacing.md,
        marginBottom: SynthTokens.spacing.xxl,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SynthTokens.spacing.sm,
        marginBottom: SynthTokens.spacing.lg,
    },
    sectionTitle: {
        fontSize: 22,
        fontWeight: 'bold',
    },
    artistRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SynthTokens.spacing.md,
        gap: SynthTokens.spacing.md,
    },
    rankText: {
        width: 24,
        fontSize: 18,
        fontWeight: 'bold',
        color: SynthTokens.colors.neutral400,
    },
    artistInfo: {
        flex: 1,
    },
    popularityBarContainer: {
        height: 6,
        backgroundColor: SynthTokens.colors.neutral100,
        borderRadius: 3,
        marginTop: 8,
    },
    popularityBar: {
        height: '100%',
        backgroundColor: SynthTokens.colors.brandPink500,
        borderRadius: 3,
    },
    bold: {
        fontWeight: 'bold',
    },
    genresContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: SynthTokens.spacing.sm,
    },
    genrePill: {
        backgroundColor: SynthTokens.colors.neutral0,
        paddingHorizontal: SynthTokens.spacing.md,
        paddingVertical: 12,
        borderRadius: SynthTokens.radius.medium,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        minWidth: '45%',
    }
});
