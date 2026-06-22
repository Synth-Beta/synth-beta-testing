import React, { useState, useEffect, useCallback } from 'react';
import {
    Modal,
    View,
    Pressable,
    StyleSheet,
    ActivityIndicator,
    ScrollView,
    Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Star, Music, MapPin, Calendar, ChevronUp, ChevronDown } from 'lucide-react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import {
    getReviewsForRating,
    setRankOrder,
    type ReviewForRanking,
} from '../../services/mobileReviewRankingService';

interface Props {
    visible: boolean;
    onClose: () => void;
    userId: string;
    newReviewId: string;
    rating: number;
}

export function MobileRankingModal({ visible, onClose, userId, newReviewId, rating }: Props) {
    const insets = useSafeAreaInsets();
    const [reviews, setReviews] = useState<ReviewForRanking[]>([]);
    const [orderedIds, setOrderedIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const displayRating = Math.round(rating * 10) / 10;

    useEffect(() => {
        if (!visible || !userId) return;
        setLoading(true);
        getReviewsForRating(userId, rating).then((rows) => {
            setReviews(rows);
            setOrderedIds(rows.map((r) => r.id));
            setLoading(false);
            // Auto-close if only 1 review (nothing to rank)
            if (rows.length <= 1) {
                setTimeout(() => onClose(), 150);
            }
        });
    }, [visible, userId, rating, onClose]);

    const move = useCallback((index: number, dir: 'up' | 'down') => {
        const newIndex = dir === 'up' ? index - 1 : index + 1;
        if (newIndex < 0 || newIndex >= orderedIds.length) return;
        const next = [...orderedIds];
        [next[index], next[newIndex]] = [next[newIndex], next[index]];
        setOrderedIds(next);
    }, [orderedIds]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await setRankOrder(userId, orderedIds);
        } finally {
            setSaving(false);
            onClose();
        }
    };

    const getReview = (id: string) => reviews.find((r) => r.id === id);

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={[styles.root, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.headerText}>
                        <View style={styles.titleRow}>
                            <Star size={18} color="#EAB308" fill="#EAB308" />
                            <SynthText variant="accent">Rank Your {displayRating.toFixed(1)}★ Reviews</SynthText>
                        </View>
                        <SynthText variant="meta" color="secondary" style={styles.desc}>
                            You have {reviews.length} reviews rated {displayRating.toFixed(1)}★. Use the arrows to rank them from your favourite (top) to least favourite (bottom).
                        </SynthText>
                    </View>
                </View>

                {loading ? (
                    <View style={styles.center}>
                        <ActivityIndicator color={SynthTokens.colors.brandPink500} size="large" />
                        <SynthText variant="meta" color="secondary" style={{ marginTop: 12 }}>Loading your reviews…</SynthText>
                    </View>
                ) : reviews.length <= 1 ? (
                    <View style={styles.center}>
                        <SynthText variant="meta" color="secondary">No other reviews to rank.</SynthText>
                    </View>
                ) : (
                    <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
                        {orderedIds.map((id, index) => {
                            const r = getReview(id);
                            if (!r) return null;
                            const isNew = r.id === newReviewId;
                            return (
                                <View key={r.id} style={[styles.card, isNew && styles.cardNew]}>
                                    {/* Position + move buttons */}
                                    <View style={styles.rankCol}>
                                        <Pressable
                                            style={[styles.arrowBtn, index === 0 && styles.arrowBtnDisabled]}
                                            onPress={() => move(index, 'up')}
                                            disabled={index === 0}
                                        >
                                            <ChevronUp size={18} color={index === 0 ? SynthTokens.colors.neutral400 : SynthTokens.colors.neutral900} />
                                        </Pressable>
                                        <View style={[styles.rankBadge, isNew && styles.rankBadgeNew]}>
                                            <SynthText variant="accent" style={styles.rankNum}>{index + 1}</SynthText>
                                        </View>
                                        <Pressable
                                            style={[styles.arrowBtn, index === orderedIds.length - 1 && styles.arrowBtnDisabled]}
                                            onPress={() => move(index, 'down')}
                                            disabled={index === orderedIds.length - 1}
                                        >
                                            <ChevronDown size={18} color={index === orderedIds.length - 1 ? SynthTokens.colors.neutral400 : SynthTokens.colors.neutral900} />
                                        </Pressable>
                                    </View>

                                    {/* Review info */}
                                    <View style={styles.reviewInfo}>
                                        {isNew && (
                                            <View style={styles.newBadge}>
                                                <SynthText variant="meta" style={styles.newBadgeText}>New</SynthText>
                                            </View>
                                        )}
                                        {r.artist_name ? (
                                            <View style={styles.metaRow}>
                                                <Music size={13} color={SynthTokens.colors.neutral600} />
                                                <SynthText variant="meta" numberOfLines={1} style={styles.metaText}>{r.artist_name}</SynthText>
                                            </View>
                                        ) : null}
                                        {r.venue_name ? (
                                            <View style={styles.metaRow}>
                                                <MapPin size={13} color={SynthTokens.colors.neutral600} />
                                                <SynthText variant="meta" numberOfLines={1} style={styles.metaText}>{r.venue_name}</SynthText>
                                            </View>
                                        ) : null}
                                        {r.event_date ? (
                                            <View style={styles.metaRow}>
                                                <Calendar size={13} color={SynthTokens.colors.neutral600} />
                                                <SynthText variant="meta" style={styles.metaText}>
                                                    {new Date(r.event_date).toLocaleDateString()}
                                                </SynthText>
                                            </View>
                                        ) : null}
                                        {r.review_text ? (
                                            <SynthText variant="meta" color="secondary" numberOfLines={2} style={styles.reviewSnippet}>
                                                {r.review_text}
                                            </SynthText>
                                        ) : null}
                                    </View>

                                    {/* Rating pill */}
                                    <View style={styles.ratingPill}>
                                        <SynthText variant="meta" style={styles.ratingText}>{displayRating.toFixed(1)}★</SynthText>
                                    </View>
                                </View>
                            );
                        })}
                    </ScrollView>
                )}

                {/* Footer */}
                {!loading && reviews.length > 1 && (
                    <View style={styles.footer}>
                        <Pressable style={styles.skipBtn} onPress={onClose} disabled={saving}>
                            <SynthText variant="meta" color="secondary">Skip for Now</SynthText>
                        </Pressable>
                        <Pressable style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
                            {saving ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <SynthText variant="meta" style={styles.saveBtnText}>Save Rankings</SynthText>
                            )}
                        </Pressable>
                    </View>
                )}
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: SynthTokens.colors.neutral50,
        paddingHorizontal: 20,
    },
    header: {
        marginBottom: 16,
    },
    headerText: { gap: 6 },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    desc: {
        lineHeight: 20,
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    list: { flex: 1 },
    listContent: { gap: 10, paddingBottom: 8 },
    card: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        padding: 12,
        gap: 12,
    },
    cardNew: {
        borderColor: SynthTokens.colors.brandPink500,
        borderWidth: 2,
        backgroundColor: SynthTokens.colors.brandPink050,
    },
    rankCol: {
        alignItems: 'center',
        gap: 4,
    },
    arrowBtn: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: SynthTokens.colors.neutral100,
        alignItems: 'center',
        justifyContent: 'center',
    },
    arrowBtnDisabled: {
        backgroundColor: SynthTokens.colors.neutral50,
    },
    rankBadge: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: SynthTokens.colors.neutral200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rankBadgeNew: {
        backgroundColor: SynthTokens.colors.brandPink500,
    },
    rankNum: {
        color: SynthTokens.colors.neutral900,
        fontWeight: '700',
    },
    reviewInfo: {
        flex: 1,
        gap: 4,
    },
    newBadge: {
        alignSelf: 'flex-start',
        backgroundColor: SynthTokens.colors.brandPink500,
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 2,
        marginBottom: 2,
    },
    newBadgeText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '600',
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    metaText: {
        flex: 1,
        color: SynthTokens.colors.neutral900,
    },
    reviewSnippet: {
        marginTop: 4,
        lineHeight: 18,
    },
    ratingPill: {
        backgroundColor: '#EAB30820',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
        alignSelf: 'center',
    },
    ratingText: {
        color: '#B45309',
        fontWeight: '600',
    },
    footer: {
        flexDirection: 'row',
        gap: 12,
        paddingTop: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: SynthTokens.colors.neutral200,
    },
    skipBtn: {
        flex: 1,
        height: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: SynthTokens.colors.neutral0,
    },
    saveBtn: {
        flex: 2,
        height: 48,
        borderRadius: 12,
        backgroundColor: SynthTokens.colors.brandPink500,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveBtnDisabled: { opacity: 0.7 },
    saveBtnText: {
        color: '#fff',
        fontWeight: '600',
    },
});
