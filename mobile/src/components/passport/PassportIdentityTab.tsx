import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Calendar, MapPin, Music } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { PassportIdentityService, type PassportIdentity } from '../../services/passportIdentityService';
import { PassportTravelMap } from './PassportTravelMap';
import { SectionError, SkeletonBlock } from './PassportPrimitives';

const PINK = SynthTokens.colors.brandPink500;

export function PassportIdentityTab({ userId, displayName }: { userId: string; displayName?: string }) {
    const [identity, setIdentity] = useState<PassportIdentity | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            let id = await PassportIdentityService.getIdentity(userId);
            if (!id) {
                await PassportIdentityService.calculateIdentity(userId);
                id = await PassportIdentityService.getIdentity(userId);
            }
            setIdentity(id);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading) {
        return (
            <View>
                <SkeletonBlock height={150} radius={16} style={{ marginBottom: 12 }} />
                <SkeletonBlock height={340} radius={18} />
            </View>
        );
    }

    if (error) {
        return <SectionError message={error} onRetry={() => void load()} />;
    }

    const fanLabel = identity ? PassportIdentityService.getFanTypeDisplay(identity.fan_type) : null;

    return (
        <View>
            <View style={styles.card}>
                <View style={styles.headerRow}>
                    <Music size={20} color={PINK} />
                    <SynthText variant="h2" style={styles.title}>
                        {displayName ? `${displayName}'s passport` : 'Your passport'}
                    </SynthText>
                </View>

                {fanLabel ? (
                    <>
                        <View style={styles.fanPill}>
                            <SynthText variant="meta" style={styles.fanPillTxt}>
                                {fanLabel.name}
                            </SynthText>
                        </View>
                        <SynthText variant="meta" color="secondary" style={styles.fanDesc}>
                            {fanLabel.description}
                        </SynthText>
                    </>
                ) : (
                    <SynthText variant="meta" color="secondary" style={styles.fanDesc}>
                        Identity is still calculating — check back after your next review.
                    </SynthText>
                )}

                {identity?.join_year ? (
                    <View style={styles.metaRow}>
                        <Calendar size={15} color={SynthTokens.colors.neutral600} />
                        <SynthText variant="meta" color="secondary">
                            Live since {identity.join_year}
                        </SynthText>
                    </View>
                ) : null}
                {identity?.home_city ? (
                    <View style={styles.metaRow}>
                        <MapPin size={15} color={SynthTokens.colors.neutral600} />
                        <SynthText variant="meta" color="secondary">
                            Home scene: {identity.home_city}
                        </SynthText>
                    </View>
                ) : null}
            </View>

            <PassportTravelMap userId={userId} />
        </View>
    );
}

const styles = StyleSheet.create({
    card: {
        padding: 16,
        borderRadius: 16,
        backgroundColor: SynthTokens.colors.neutral0,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    title: { fontSize: 20, flex: 1 },
    fanPill: {
        alignSelf: 'flex-start',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 999,
        backgroundColor: SynthTokens.colors.brandPink050,
        borderWidth: 1.5,
        borderColor: PINK,
        marginBottom: 8,
    },
    fanPillTxt: { color: PINK, fontWeight: '800' },
    fanDesc: { lineHeight: 21, marginBottom: 10 },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
});
