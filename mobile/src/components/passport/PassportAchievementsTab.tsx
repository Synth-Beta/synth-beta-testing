import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { PassportAchievementService, type AchievementDisplay } from '../../services/passportAchievementService';
import { EmptyState, SectionError, TabSkeleton } from './PassportPrimitives';

const PINK = SynthTokens.colors.brandPink500;

export function PassportAchievementsTab({ userId }: { userId: string }) {
    const [achievements, setAchievements] = useState<AchievementDisplay[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            setAchievements(await PassportAchievementService.getBehavioralAchievements(userId));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading) return <TabSkeleton cards={4} />;
    if (error) return <SectionError message={error} onRetry={() => void load()} />;
    if (achievements.length === 0) {
        return (
            <EmptyState
                title="No achievements yet"
                hint="Keep attending events and writing reviews to unlock achievements."
            />
        );
    }

    return (
        <View>
            {achievements.map(a => {
                const pct = a.goal > 0 ? Math.min(100, (a.progress / a.goal) * 100) : 0;
                return (
                    <View key={a.id ?? a.type} style={[styles.achCard, a.unlocked ? styles.achCardUnlocked : styles.achCardLocked]}>
                        <SynthText variant="meta" style={styles.achBig}>
                            {a.icon}
                        </SynthText>
                        <View style={{ flex: 1 }}>
                            <SynthText variant="body" style={styles.achTitle}>
                                {a.name}
                            </SynthText>
                            <SynthText variant="meta" color="secondary" style={styles.achDesc}>
                                {a.description}
                            </SynthText>
                            {a.unlocked ? (
                                <View style={styles.unlockedPill}>
                                    <SynthText variant="meta" style={styles.unlockedPillTxt}>
                                        Unlocked{a.tier ? ` · ${a.tier}` : ''}
                                    </SynthText>
                                </View>
                            ) : (
                                <View style={styles.mt8}>
                                    <View style={styles.barTrack}>
                                        <View style={[styles.barFill, { width: `${pct}%` }]} />
                                    </View>
                                    <SynthText variant="meta" color="secondary" style={styles.progressTxt}>
                                        {a.progress}/{a.goal}
                                    </SynthText>
                                </View>
                            )}
                        </View>
                    </View>
                );
            })}
        </View>
    );
}

const styles = StyleSheet.create({
    achBig: { fontSize: 28, marginRight: 10, width: 40 },
    achCard: { flexDirection: 'row', padding: 14, marginBottom: 10, borderRadius: 12, borderWidth: 1 },
    achCardUnlocked: { backgroundColor: SynthTokens.colors.neutral0, borderColor: SynthTokens.colors.neutral400 },
    achCardLocked: { backgroundColor: 'rgba(201,201,201,0.35)', borderColor: SynthTokens.colors.neutral400 },
    achTitle: { fontWeight: '800', fontSize: 16 },
    achDesc: { marginTop: 4, lineHeight: 20 },
    unlockedPill: {
        marginTop: 8,
        alignSelf: 'flex-start',
        backgroundColor: SynthTokens.colors.brandPink050,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
    },
    unlockedPillTxt: { color: PINK, fontWeight: '700' },
    barTrack: { height: 10, borderRadius: 8, backgroundColor: SynthTokens.colors.neutral200, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 8, backgroundColor: PINK },
    progressTxt: { textAlign: 'right', marginTop: 4 },
    mt8: { marginTop: 8 },
});
