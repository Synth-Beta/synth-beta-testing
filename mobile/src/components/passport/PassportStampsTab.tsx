import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { PassportService, type NextToUnlock, type PassportEntry } from '../../services/passportService';
import { PassportAchievementService, type AchievementDisplay } from '../../services/passportAchievementService';
import { EmptyState, SectionError, TabSkeleton } from './PassportPrimitives';

const PINK = SynthTokens.colors.brandPink500;
const PAGE = 24;

type StampTypeFilter = 'all' | 'city' | 'venue' | 'artist' | 'scene' | 'completed_achievements';
type RarityFilter = 'all' | 'common' | 'uncommon' | 'legendary';

const RARITY_ORDER: Exclude<RarityFilter, 'all'>[] = ['legendary', 'uncommon', 'common'];

function rarityLabel(r: string): string {
    if (r === 'legendary') return 'Legendary';
    if (r === 'uncommon') return 'Uncommon';
    if (r === 'common') return 'Common';
    return 'Other';
}

function rarityAccent(r?: string | null): string {
    if (r === 'legendary') return '#CA8A04';
    if (r === 'uncommon') return '#9333EA';
    if (r === 'common') return SynthTokens.colors.neutral600;
    return SynthTokens.colors.neutral400;
}

export function PassportStampsTab({ userId }: { userId: string }) {
    const router = useRouter();
    const [stamps, setStamps] = useState<PassportEntry[]>([]);
    const [nextToUnlock, setNextToUnlock] = useState<NextToUnlock[]>([]);
    const [achievements, setAchievements] = useState<AchievementDisplay[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [stampType, setStampType] = useState<StampTypeFilter>('all');
    const [stampRarity, setStampRarity] = useState<RarityFilter>('all');
    const [visibleCount, setVisibleCount] = useState(PAGE);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [stampList, hints, ach] = await Promise.all([
                PassportService.getStampsByRarity(userId),
                PassportService.getNextToUnlock(userId),
                PassportAchievementService.getBehavioralAchievements(userId),
            ]);
            setStamps(stampList);
            setNextToUnlock(hints);
            setAchievements(ach);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }, [userId]);

    useEffect(() => {
        void load();
    }, [load]);

    const completedAchievements = useMemo(() => achievements.filter(a => a.unlocked), [achievements]);

    const filteredStamps = useMemo(() => {
        if (stampType === 'completed_achievements') return [];
        return stamps.filter(s => {
            if (stampType !== 'all') {
                if (stampType === 'artist' && s.type !== 'artist' && s.type !== 'artist_milestone') return false;
                if (stampType !== 'artist' && s.type !== stampType) return false;
            }
            if (stampRarity !== 'all' && s.rarity !== stampRarity) return false;
            return true;
        });
    }, [stamps, stampType, stampRarity]);

    const groupedByRarity = useMemo(() => {
        if (stampType === 'completed_achievements' || stampRarity !== 'all') return null;
        const capped = filteredStamps.slice(0, visibleCount);
        const map = new Map<string, PassportEntry[]>();
        for (const r of RARITY_ORDER) map.set(r, []);
        map.set('other', []);
        for (const s of capped) {
            const k = s.rarity === 'legendary' || s.rarity === 'uncommon' || s.rarity === 'common' ? s.rarity : 'other';
            map.get(k)!.push(s);
        }
        return map;
    }, [filteredStamps, stampType, stampRarity, visibleCount]);

    const openStamp = useCallback(
        (s: PassportEntry) => {
            if (!s.entity_uuid) return;
            if (s.type === 'artist' || s.type === 'artist_milestone') {
                router.push(`/artist/${s.entity_uuid}`);
            } else if (s.type === 'venue') {
                router.push(`/venue/${s.entity_uuid}`);
            }
        },
        [router]
    );

    if (loading) return <TabSkeleton cards={4} />;
    if (error) return <SectionError message={error} onRetry={() => void load()} />;

    const renderStampCard = (s: PassportEntry) => {
        const tappable = !!s.entity_uuid && (s.type === 'artist' || s.type === 'artist_milestone' || s.type === 'venue');
        return (
            <Pressable
                key={s.id}
                style={[styles.stampCard, { borderLeftColor: rarityAccent(s.rarity), borderLeftWidth: 4 }]}
                onPress={tappable ? () => openStamp(s) : undefined}
                disabled={!tappable}
                accessibilityRole={tappable ? 'button' : undefined}
            >
                <View style={{ flex: 1 }}>
                    <SynthText variant="meta" style={styles.stampType}>
                        {String(s.type).replace(/_/g, ' ')}
                    </SynthText>
                    <SynthText variant="body" numberOfLines={2} style={styles.stampName}>
                        {s.entity_name}
                    </SynthText>
                    <SynthText variant="meta" color="secondary">
                        {s.rarity ? `${s.rarity} · ` : ''}
                        {new Date(s.unlocked_at).toLocaleDateString()}
                    </SynthText>
                </View>
                {tappable ? <ChevronRight size={17} color={SynthTokens.colors.neutral400} style={styles.chevron} /> : null}
            </Pressable>
        );
    };

    const filterChip = (label: string, active: boolean, onPress: () => void) => (
        <Pressable key={label} onPress={onPress} style={[styles.filterChip, active && styles.filterChipOn]} accessibilityRole="button">
            <SynthText variant="meta" style={[styles.filterChipTxt, active && styles.filterChipTxtOn]} numberOfLines={1}>
                {label}
            </SynthText>
        </Pressable>
    );

    const visibleFlat = filteredStamps.slice(0, visibleCount);
    const hasMore = stampType !== 'completed_achievements' && filteredStamps.length > visibleCount;

    return (
        <View>
            {nextToUnlock.length > 0 ? (
                <View style={styles.nextSection}>
                    <SynthText variant="meta" style={styles.sectionLabel}>
                        Next to unlock
                    </SynthText>
                    {nextToUnlock.map((h, i) => (
                        <View key={`${h.type}-${i}`} style={styles.nextCard}>
                            <SynthText variant="meta" style={styles.nextType}>
                                {h.type}
                            </SynthText>
                            <SynthText variant="body" style={styles.bold}>
                                {h.entity_name}
                            </SynthText>
                            <SynthText variant="meta" color="secondary">
                                {h.hint}
                            </SynthText>
                            {h.progress != null && h.goal != null ? (
                                <View style={styles.mt8}>
                                    <View style={styles.barTrack}>
                                        <View
                                            style={[
                                                styles.barFill,
                                                { width: `${Math.min(100, (h.progress / Math.max(h.goal, 1)) * 100)}%` },
                                            ]}
                                        />
                                    </View>
                                </View>
                            ) : null}
                        </View>
                    ))}
                </View>
            ) : null}

            <SynthText variant="meta" style={styles.sectionLabel}>
                Filter stamps
            </SynthText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {filterChip('All types', stampType === 'all', () => setStampType('all'))}
                {filterChip('City', stampType === 'city', () => setStampType('city'))}
                {filterChip('Venue', stampType === 'venue', () => setStampType('venue'))}
                {filterChip('Artist', stampType === 'artist', () => setStampType('artist'))}
                {filterChip('Scene', stampType === 'scene', () => setStampType('scene'))}
                {filterChip(`Done (${completedAchievements.length})`, stampType === 'completed_achievements', () =>
                    setStampType('completed_achievements')
                )}
            </ScrollView>
            {stampType !== 'completed_achievements' ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                    {filterChip('All rarities', stampRarity === 'all', () => setStampRarity('all'))}
                    {filterChip('Legendary', stampRarity === 'legendary', () => setStampRarity('legendary'))}
                    {filterChip('Uncommon', stampRarity === 'uncommon', () => setStampRarity('uncommon'))}
                    {filterChip('Common', stampRarity === 'common', () => setStampRarity('common'))}
                </ScrollView>
            ) : null}

            {stampType === 'completed_achievements' ? (
                completedAchievements.length === 0 ? (
                    <EmptyState title="No completed achievements yet" hint="Keep attending shows and writing reviews." />
                ) : (
                    completedAchievements.map(a => (
                        <View key={a.id ?? a.type} style={[styles.stampCard, { borderColor: SynthTokens.colors.neutral200 }]}>
                            <SynthText variant="meta" style={styles.achBig}>
                                {a.icon}
                            </SynthText>
                            <View style={{ flex: 1 }}>
                                <SynthText variant="body" style={styles.bold}>
                                    {a.name.replace(/\s+\([^)]+\)$/, '')}
                                </SynthText>
                                <SynthText variant="meta" color="secondary" numberOfLines={3}>
                                    {a.description}
                                </SynthText>
                                {a.unlocked_at ? (
                                    <SynthText variant="meta" color="secondary" style={styles.mt4}>
                                        Unlocked {new Date(a.unlocked_at).toLocaleDateString()}
                                    </SynthText>
                                ) : null}
                            </View>
                        </View>
                    ))
                )
            ) : groupedByRarity && stampRarity === 'all' ? (
                [...RARITY_ORDER, 'other'].map(rKey => {
                    const list = groupedByRarity.get(rKey) ?? [];
                    if (list.length === 0) return null;
                    return (
                        <View key={rKey} style={styles.rarityBlock}>
                            <SynthText variant="meta" style={[styles.rarityHeader, { color: rarityAccent(rKey) }]}>
                                {rarityLabel(rKey)} ({list.length})
                            </SynthText>
                            {list.map(s => renderStampCard(s))}
                        </View>
                    );
                })
            ) : visibleFlat.length === 0 ? (
                <EmptyState title="No stamps match these filters" />
            ) : (
                visibleFlat.map(s => renderStampCard(s))
            )}

            {hasMore ? (
                <Pressable style={styles.showMore} onPress={() => setVisibleCount(c => c + PAGE)} accessibilityRole="button">
                    <SynthText variant="meta" style={styles.showMoreTxt}>
                        Show more ({filteredStamps.length - visibleCount} left)
                    </SynthText>
                </Pressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    sectionLabel: { fontWeight: '800', marginBottom: 8, marginTop: 4, color: SynthTokens.colors.neutral900 },
    nextSection: { marginBottom: 16 },
    nextCard: {
        padding: 12,
        borderRadius: 12,
        backgroundColor: SynthTokens.colors.brandPink050,
        borderWidth: 1,
        borderColor: PINK,
        marginBottom: 10,
    },
    nextType: { textTransform: 'capitalize', color: PINK, marginBottom: 4 },
    filterRow: { flexDirection: 'row', gap: 8, marginBottom: 10, paddingRight: 8 },
    filterChip: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: SynthTokens.colors.neutral100,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    filterChipOn: { backgroundColor: SynthTokens.colors.brandPink050, borderColor: PINK },
    filterChipTxt: { fontSize: 12, fontWeight: '600', color: SynthTokens.colors.neutral600 },
    filterChipTxtOn: { color: PINK },
    rarityBlock: { marginBottom: 16 },
    rarityHeader: { fontWeight: '800', marginBottom: 8, fontSize: 14 },
    stampCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        marginBottom: 10,
        borderRadius: 12,
        backgroundColor: SynthTokens.colors.neutral0,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    stampType: { textTransform: 'capitalize', color: PINK, marginBottom: 4 },
    stampName: { fontWeight: '600' },
    chevron: { marginLeft: 6 },
    achBig: { fontSize: 28, marginRight: 10, width: 40 },
    barTrack: { height: 10, borderRadius: 8, backgroundColor: SynthTokens.colors.neutral200, overflow: 'hidden' },
    barFill: { height: '100%', borderRadius: 8, backgroundColor: PINK },
    bold: { fontWeight: '700' },
    mt8: { marginTop: 8 },
    mt4: { marginTop: 4 },
    showMore: { alignItems: 'center', paddingVertical: 12 },
    showMoreTxt: { color: PINK, fontWeight: '700' },
});
