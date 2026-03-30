import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { ChevronLeft, Star, MapPin, Calendar } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';

const PINK = SynthTokens.colors.brandPink500;

type EventSummary = {
    id: string;
    title: string | null;
    event_date: string | null;
    artist_name: string | null;
    venue_name: string | null;
    images?: { url?: string }[] | null;
};

type ReviewRow = {
    id: string;
    user_id: string;
    event_id: string | null;
    rating: number | null;
    review_text: string | null;
    photos: string[] | null;
    created_at: string;
    is_public: boolean;
    events: EventSummary | null;
};

export default function ReviewDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [review, setReview] = useState<ReviewRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            setLoading(true);
            if (!id) {
                setReview(null);
                setLoading(false);
                return;
            }
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) {
                setReview(null);
                setLoading(false);
                return;
            }

            const { data, error } = await supabase
                .from('reviews')
                .select(
                    `
          id,
          user_id,
          event_id,
          rating,
          review_text,
          photos,
          created_at,
          is_public,
          events (
            id,
            title,
            event_date,
            artist_name,
            venue_name,
            images
          )
        `
                )
                .eq('id', id)
                .maybeSingle();

            if (cancelled) return;

            if (error || !data) {
                setReview(null);
                setLoading(false);
                return;
            }

            const row = data as Record<string, unknown>;
            const evRaw = row.events;
            let evOne: EventSummary | null = null;
            if (Array.isArray(evRaw) && evRaw[0] && typeof evRaw[0] === 'object') {
                evOne = evRaw[0] as EventSummary;
            } else if (evRaw && typeof evRaw === 'object' && !Array.isArray(evRaw)) {
                evOne = evRaw as EventSummary;
            }

            const normalized: ReviewRow = {
                id: String(row.id),
                user_id: String(row.user_id),
                event_id: row.event_id != null ? String(row.event_id) : null,
                rating: row.rating != null ? Number(row.rating) : null,
                review_text: row.review_text != null ? String(row.review_text) : null,
                photos: (row.photos as string[] | null) ?? null,
                created_at: String(row.created_at),
                is_public: Boolean(row.is_public),
                events: evOne,
            };

            const isOwner = normalized.user_id === user.id;
            if (!normalized.is_public && !isOwner) {
                setForbidden(true);
                setReview(null);
                setLoading(false);
                return;
            }

            setForbidden(false);
            setReview(normalized);
            setLoading(false);
        })();
        return () => {
            cancelled = true;
        };
    }, [id]);

    if (loading) {
        return (
            <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
                <ActivityIndicator size="large" color={PINK} />
            </View>
        );
    }

    if (!review || forbidden) {
        return (
            <View style={[styles.root, { paddingTop: insets.top }]}>
                <View style={styles.topBar}>
                    <Pressable onPress={() => router.back()} style={styles.back}>
                        <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
                    </Pressable>
                </View>
                <View style={styles.center}>
                    <SynthText variant="h2" style={styles.mb}>
                        {forbidden ? 'Private review' : 'Review not found'}
                    </SynthText>
                    <SynthText variant="body" color="secondary" style={styles.centerText}>
                        {forbidden
                            ? 'You do not have access to this review.'
                            : 'This review may have been removed or the link is invalid.'}
                    </SynthText>
                </View>
            </View>
        );
    }

    const ev = review.events;
    const headline =
        ev?.title?.trim() ||
        (ev?.artist_name && ev?.venue_name ? `${ev.artist_name} at ${ev.venue_name}` : ev?.artist_name || ev?.venue_name || 'Review');
    const imageUrl = ev?.images?.[0]?.url;

    return (
        <View style={styles.root}>
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
                <Pressable onPress={() => router.back()} style={styles.back}>
                    <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
                </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.hero} contentFit="cover" />
                ) : (
                    <View style={[styles.hero, styles.heroPlaceholder]} />
                )}

                <View style={styles.body}>
                    <SynthText variant="h1" style={styles.title}>
                        {headline}
                    </SynthText>

                    {review.rating != null ? (
                        <View style={styles.ratingRow}>
                            <Star size={20} color={PINK} fill={PINK} />
                            <SynthText variant="h2" style={styles.ratingNum}>
                                {review.rating.toFixed(1)}
                            </SynthText>
                        </View>
                    ) : null}

                    {ev?.venue_name ? (
                        <View style={styles.metaRow}>
                            <MapPin size={18} color={PINK} />
                            <SynthText variant="body" color="secondary" style={styles.metaTxt}>
                                {ev.venue_name}
                            </SynthText>
                        </View>
                    ) : null}
                    {ev?.event_date ? (
                        <View style={styles.metaRow}>
                            <Calendar size={18} color={PINK} />
                            <SynthText variant="body" color="secondary" style={styles.metaTxt}>
                                {new Date(ev.event_date).toLocaleDateString(undefined, {
                                    weekday: 'long',
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric',
                                })}
                            </SynthText>
                        </View>
                    ) : null}

                    {review.review_text && review.review_text !== 'ATTENDANCE_ONLY' ? (
                        <SynthText variant="body" color="primary" style={styles.reviewBody}>
                            {review.review_text}
                        </SynthText>
                    ) : (
                        <SynthText variant="meta" color="secondary">
                            No written review.
                        </SynthText>
                    )}

                    {review.event_id ? (
                        <Pressable style={styles.eventBtn} onPress={() => router.push(`/event/${review.event_id}`)}>
                            <SynthText variant="meta" style={styles.eventBtnTxt}>
                                View event
                            </SynthText>
                        </Pressable>
                    ) : null}
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    centerText: { textAlign: 'center', lineHeight: 22 },
    mb: { marginBottom: 8 },
    topBar: {
        paddingHorizontal: 8,
        paddingBottom: 4,
        backgroundColor: SynthTokens.colors.neutral0,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    back: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    scroll: { paddingBottom: 40 },
    hero: { width: '100%', height: 220, backgroundColor: SynthTokens.colors.neutral200 },
    heroPlaceholder: {},
    body: { padding: SynthTokens.spacing.lg },
    title: { fontSize: 24, fontWeight: '800', marginBottom: 12 },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
    ratingNum: { fontWeight: '800' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
    metaTxt: { flex: 1 },
    reviewBody: { marginTop: 16, lineHeight: 26 },
    eventBtn: {
        marginTop: 24,
        alignSelf: 'flex-start',
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: PINK,
    },
    eventBtnTxt: { color: PINK, fontWeight: '800' },
});
