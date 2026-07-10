import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pencil, Pin, PinOff, Plus, Sparkles } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { PassportService, type ProfileTimelineItem } from '../../services/passportService';
import { PassportTimelineService, type TimelineMeta } from '../../services/passportTimelineService';
import { TimelineMilestoneSheet } from './TimelineMilestoneSheet';
import { EmptyState, SectionError, TabSkeleton } from './PassportPrimitives';

const PINK = SynthTokens.colors.brandPink500;
const PAGE = 20;

export function PassportTimelineTab({
    userId,
    canEdit,
    timeline: timelineProp,
}: {
    userId: string;
    canEdit: boolean;
    timeline?: ProfileTimelineItem[];
}) {
    const router = useRouter();
    const [timeline, setTimeline] = useState<ProfileTimelineItem[]>(timelineProp ?? []);
    const [meta, setMeta] = useState<Map<string, TimelineMeta>>(new Map());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [visibleCount, setVisibleCount] = useState(PAGE);
    const [sheetItem, setSheetItem] = useState<ProfileTimelineItem | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [tl, m] = await Promise.all([
                timelineProp?.length ? Promise.resolve(timelineProp) : PassportService.getTimeline(userId),
                PassportTimelineService.getMetaByReview(userId),
            ]);
            setTimeline(tl);
            setMeta(m);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Something went wrong');
        } finally {
            setLoading(false);
        }
    }, [userId, timelineProp]);

    useEffect(() => {
        void load();
    }, [load]);

    const refreshMeta = useCallback(async () => {
        setMeta(await PassportTimelineService.getMetaByReview(userId));
    }, [userId]);

    const pinned = useMemo(
        () => timeline.filter(t => meta.get(t.id)?.isPinned),
        [timeline, meta]
    );

    const togglePin = useCallback(
        (item: ProfileTimelineItem) => {
            const m = meta.get(item.id);
            void (async () => {
                try {
                    if (m?.isPinned) {
                        await PassportTimelineService.unpin(userId, m.timelineId);
                    } else {
                        await PassportTimelineService.pin(userId, item.id);
                    }
                    await refreshMeta();
                } catch (e) {
                    Alert.alert('Pin', e instanceof Error ? e.message : 'Could not update pin.');
                }
            })();
        },
        [meta, userId, refreshMeta]
    );

    if (loading) return <TabSkeleton cards={4} />;
    if (error) return <SectionError message={error} onRetry={() => void load()} />;
    if (timeline.length === 0) {
        return (
            <EmptyState
                title="No shows yet"
                hint="Concerts you review show up here as your live-music timeline."
            />
        );
    }

    const renderItem = (item: ProfileTimelineItem, index: number, count: number, inPinnedSection: boolean) => {
        const m = meta.get(item.id);
        const isPinned = !!m?.isPinned;
        const date = new Date(item.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

        return (
            <View key={`${inPinnedSection ? 'pin-' : ''}${item.id}`} style={styles.item}>
                <View style={styles.rail}>
                    <SynthText variant="meta" color="secondary" style={styles.railDate}>
                        {date}
                    </SynthText>
                    <View style={[styles.dot, (index === 0 || isPinned) && styles.dotActive]} />
                    {index !== count - 1 ? <View style={styles.line} /> : null}
                </View>

                <View style={[styles.card, isPinned && styles.cardPinned]}>
                    <Pressable
                        style={styles.cardBody}
                        onPress={() => {
                            if (item.event_id) router.push(`/event/${item.event_id}`);
                        }}
                        accessibilityRole="button"
                    >
                        <View style={styles.cardContent}>
                            {m?.significance ? (
                                <View style={styles.milestoneRow}>
                                    <Sparkles size={13} color={PINK} />
                                    <SynthText variant="meta" style={styles.milestoneTxt} numberOfLines={1}>
                                        {m.significance}
                                    </SynthText>
                                </View>
                            ) : null}
                            <SynthText variant="meta" style={styles.cardTitle}>
                                {item.title}
                            </SynthText>
                            <SynthText variant="meta" color="secondary" numberOfLines={1}>
                                {item.subtitle}
                            </SynthText>
                            {m?.description ? (
                                <SynthText variant="meta" color="secondary" numberOfLines={2} style={styles.milestoneDesc}>
                                    {m.description}
                                </SynthText>
                            ) : null}
                        </View>
                        {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.cardImage} /> : null}
                    </Pressable>

                    {canEdit ? (
                        <View style={styles.actionsRow}>
                            <Pressable
                                style={styles.actionBtn}
                                onPress={() => togglePin(item)}
                                accessibilityRole="button"
                                accessibilityLabel={isPinned ? 'Unpin show' : 'Pin show'}
                            >
                                {isPinned ? <PinOff size={14} color={PINK} /> : <Pin size={14} color={SynthTokens.colors.neutral600} />}
                                <SynthText variant="meta" style={[styles.actionTxt, isPinned && styles.actionTxtOn]}>
                                    {isPinned ? 'Unpin' : 'Pin'}
                                </SynthText>
                            </Pressable>
                            <Pressable
                                style={styles.actionBtn}
                                onPress={() => setSheetItem(item)}
                                accessibilityRole="button"
                                accessibilityLabel={m?.significance ? 'Edit milestone' : 'Add milestone'}
                            >
                                {m?.significance ? (
                                    <Pencil size={13} color={SynthTokens.colors.neutral600} />
                                ) : (
                                    <Plus size={14} color={SynthTokens.colors.neutral600} />
                                )}
                                <SynthText variant="meta" style={styles.actionTxt}>
                                    {m?.significance ? 'Edit milestone' : 'Milestone'}
                                </SynthText>
                            </Pressable>
                        </View>
                    ) : null}
                </View>
            </View>
        );
    };

    const visible = timeline.slice(0, visibleCount);

    return (
        <View>
            {pinned.length > 0 ? (
                <View style={styles.pinnedSection}>
                    <View style={styles.pinnedHeader}>
                        <Pin size={14} color={PINK} />
                        <SynthText variant="meta" style={styles.pinnedHeaderTxt}>
                            Pinned highlights
                        </SynthText>
                    </View>
                    {pinned.map((item, i) => renderItem(item, i, pinned.length, true))}
                </View>
            ) : null}

            {pinned.length > 0 ? (
                <SynthText variant="meta" style={styles.allHeader}>
                    All shows
                </SynthText>
            ) : null}
            {visible.map((item, i) => renderItem(item, i, visible.length, false))}

            {timeline.length > visibleCount ? (
                <Pressable style={styles.showMore} onPress={() => setVisibleCount(c => c + PAGE)} accessibilityRole="button">
                    <SynthText variant="meta" style={styles.showMoreTxt}>
                        Show more ({timeline.length - visibleCount} left)
                    </SynthText>
                </Pressable>
            ) : null}

            <TimelineMilestoneSheet
                visible={sheetItem != null}
                userId={userId}
                item={sheetItem}
                existingMeta={sheetItem ? meta.get(sheetItem.id) ?? null : null}
                onClose={() => setSheetItem(null)}
                onSaved={() => void refreshMeta()}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    pinnedSection: { marginBottom: 8 },
    pinnedHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    pinnedHeaderTxt: { color: PINK, fontWeight: '800' },
    allHeader: { fontWeight: '800', marginBottom: 10, marginTop: 6, color: SynthTokens.colors.neutral900 },

    item: { flexDirection: 'row', marginBottom: 4 },
    rail: { width: 56, alignItems: 'center' },
    railDate: { fontSize: 11, marginBottom: 4 },
    dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: SynthTokens.colors.neutral400, zIndex: 1 },
    dotActive: { backgroundColor: PINK },
    line: { width: 2, flex: 1, backgroundColor: SynthTokens.colors.neutral200, marginTop: -2 },

    card: {
        flex: 1,
        backgroundColor: SynthTokens.colors.neutral50,
        borderRadius: 12,
        marginBottom: 12,
        marginLeft: 8,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    cardPinned: { borderColor: PINK, backgroundColor: SynthTokens.colors.brandPink050 },
    cardBody: { flexDirection: 'row' },
    cardContent: { flex: 1, padding: 12 },
    cardTitle: { fontWeight: '700' },
    cardImage: { width: 88, height: '100%', minHeight: 72 },
    milestoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
    milestoneTxt: { color: PINK, fontWeight: '800', fontSize: 13, flex: 1 },
    milestoneDesc: { marginTop: 4, fontSize: 13, lineHeight: 18 },

    actionsRow: {
        flexDirection: 'row',
        gap: 18,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: SynthTokens.colors.neutral200,
    },
    actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    actionTxt: { fontSize: 13, fontWeight: '700', color: SynthTokens.colors.neutral600 },
    actionTxtOn: { color: PINK },

    showMore: { alignItems: 'center', paddingVertical: 12 },
    showMoreTxt: { color: PINK, fontWeight: '700' },
});
