import React, { useEffect, useState } from 'react';
import {
    View,
    StyleSheet,
    ScrollView,
    Pressable,
    ActivityIndicator,
    Text,
    Dimensions,
    Modal,
    KeyboardAvoidingView,
    Platform,
    TextInput,
    Alert,
    FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ShareToChatModal } from '../../src/components/share/ShareToChatModal';
import { Image } from 'expo-image';
import {
    ChevronLeft,
    Star,
    MapPin,
    Calendar,
    Music,
    Mic2,
    Lightbulb,
    Navigation,
    DollarSign,
    Share2,
    ThumbsUp,
    MessageCircle,
    MoreVertical,
    X,
    Send,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';
import { EventService } from '../../src/services/eventService';
import { ReviewEngagementService } from '../../src/services/reviewEngagementService';

/*
 * Review detail (Expo) — behavioral parity with web `ReviewDetailView` as of 2026-05-01:
 * separate queries for review / author / event / artist+venue names, category breakdown,
 * photos, attendees, setlist, helpful, comments (entity + RPC), share-to-chat, delete/block.
 * No major sections intentionally omitted vs web.
 */

const PINK = SynthTokens.colors.brandPink500;
const SCREEN_W = Dimensions.get('window').width;
const PHOTO_SIZE = (SCREEN_W - 32 - 8) / 3;

/** Matches web [ReviewDetailView](src/components/reviews/ReviewDetailView.tsx) — avoids optional columns missing on some DBs. */
const REVIEW_SELECT_WEB_PARITY = `
            id,
            user_id,
            review_text,
            rating,
            photos,
            created_at,
            artist_performance_rating,
            production_rating,
            venue_rating,
            location_rating,
            value_rating,
            artist_performance_feedback,
            production_feedback,
            venue_feedback,
            location_feedback,
            value_feedback,
            setlist,
            likes_count,
            comments_count,
            event_id,
            artist_id,
            venue_id,
            attendees,
            is_public,
            custom_setlist
        `;

/** Last resort when web-parity list still hits undefined_column (e.g. feedback columns missing). */
const REVIEW_SELECT_MINIMAL = `
            id,
            user_id,
            review_text,
            rating,
            photos,
            created_at,
            setlist,
            likes_count,
            comments_count,
            event_id,
            artist_id,
            venue_id
        `;

function isUndefinedColumnPostgrestError(e: unknown): boolean {
    const code = (e as { code?: string })?.code;
    const msg = String((e as { message?: string })?.message ?? '');
    return code === '42703' || /column .* does not exist/i.test(msg);
}

// ─── Types ────────────────────────────────────────────────────────────────────

type EventSummary = {
    id: string;
    title: string | null;
    event_date: string | null;
    artist_name: string | null;
    venue_name: string | null;
    artist_id?: string | null;
    venue_id?: string | null;
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
    // Category ratings
    artist_performance_rating: number | null;
    production_rating: number | null;
    venue_rating: number | null;
    location_rating: number | null;
    value_rating: number | null;
    // Category feedback
    artist_performance_feedback: string | null;
    production_feedback: string | null;
    venue_feedback: string | null;
    location_feedback: string | null;
    value_feedback: string | null;
    // Direct artist/venue FKs on the review itself
    artist_id?: string | null;
    venue_id?: string | null;
    // Author
    author: { user_id: string; name: string; avatar_url: string | null } | null;
    // Event
    events: EventSummary | null;
    // Engagement
    likes_count: number;
    comments_count: number;
    is_liked_by_user: boolean;
    // Attendees & extras
    attendees?: any[] | null;
    met_on_synth?: boolean | null;
    setlist?: any | null;
    custom_setlist?: any[] | null;
};

type CommentRow = {
    id: string;
    user_id: string;
    comment_text: string;
    created_at: string;
    author_name?: string;
    author_avatar?: string | null;
};

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryRatingRow({
    icon,
    label,
    rating,
    feedback,
}: {
    icon: React.ReactNode;
    label: string;
    rating: number | null;
    feedback: string | null;
}) {
    if (!rating && !feedback) return null;
    return (
        <View style={catStyles.card}>
            <View style={catStyles.topRow}>
                <View style={catStyles.labelRow}>
                    {icon}
                    <SynthText variant="meta" style={catStyles.label}>{label}</SynthText>
                </View>
                {rating != null ? (
                    <View style={catStyles.ratingRight}>
                        <Text style={catStyles.ratingNum}>{rating.toFixed(1)}</Text>
                        <View style={catStyles.starsRow}>
                            {[1, 2, 3, 4, 5].map(n => (
                                <Star
                                    key={n}
                                    size={14}
                                    color="#FCDC5F"
                                    fill={rating >= n ? '#FCDC5F' : 'transparent'}
                                />
                            ))}
                        </View>
                    </View>
                ) : null}
            </View>
            {feedback?.trim() ? (
                <SynthText variant="meta" color="secondary" style={catStyles.feedback}>
                    "{feedback.trim()}"
                </SynthText>
            ) : null}
        </View>
    );
}

const catStyles = StyleSheet.create({
    card: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.corner,
        borderWidth: 2,
        borderColor: SynthTokens.colors.neutral200,
        padding: 12,
        gap: 8,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    labelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flex: 1,
    },
    label: {
        fontWeight: '700',
        color: SynthTokens.colors.neutral900,
        fontSize: 15,
    },
    ratingRight: {
        alignItems: 'flex-end',
        gap: 4,
        minWidth: 80,
    },
    ratingNum: {
        fontSize: 17,
        fontWeight: '700',
        color: SynthTokens.colors.neutral900,
    },
    starsRow: {
        flexDirection: 'row',
        gap: 1,
    },
    feedback: {
        fontStyle: 'italic',
        lineHeight: 20,
        color: SynthTokens.colors.neutral600,
    },
});

// ─── Comments Sheet ────────────────────────────────────────────────────────────

function CommentsSheet({
    reviewId,
    sessionUserId,
    visible,
    onClose,
    onCommentAdded,
}: {
    reviewId: string;
    sessionUserId: string | null;
    visible: boolean;
    onClose: () => void;
    onCommentAdded: () => void;
}) {
    const insets = useSafeAreaInsets();
    const [comments, setComments] = useState<CommentRow[]>([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [posting, setPosting] = useState(false);

    useEffect(() => {
        if (!visible) return;
        void fetchComments();
    }, [visible, reviewId]);

    const fetchComments = async () => {
        setLoadingComments(true);
        try {
            // Get entity_id for this review
            const { data: entityData } = await supabase
                .from('entities')
                .select('id')
                .eq('entity_type', 'review')
                .eq('entity_uuid', reviewId)
                .maybeSingle();

            if (!entityData?.id) {
                setComments([]);
                return;
            }

            const { data: commentsData } = await supabase
                .from('comments')
                .select('id, user_id, comment_text, created_at')
                .eq('entity_id', entityData.id)
                .order('created_at', { ascending: true });

            if (!commentsData?.length) {
                setComments([]);
                return;
            }

            const userIds = [...new Set(commentsData.map(c => c.user_id))];
            const { data: profiles } = await supabase
                .from('users')
                .select('user_id, name, avatar_url')
                .in('user_id', userIds);

            const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

            setComments(commentsData.map(c => ({
                id: c.id,
                user_id: c.user_id,
                comment_text: c.comment_text,
                created_at: c.created_at,
                author_name: profileMap.get(c.user_id)?.name || 'User',
                author_avatar: profileMap.get(c.user_id)?.avatar_url || null,
            })));
        } catch (err) {
            console.error('Error fetching comments:', err);
        } finally {
            setLoadingComments(false);
        }
    };

    const postComment = async () => {
        if (!sessionUserId || !newComment.trim() || posting) return;
        setPosting(true);
        const text = newComment.trim();
        setNewComment('');
        try {
            // Get or create entity
            const { data: entityId } = await supabase.rpc('get_or_create_entity', {
                p_entity_type: 'review',
                p_entity_uuid: reviewId,
                p_entity_text_id: null,
            });

            await supabase
                .from('comments')
                .insert({ user_id: sessionUserId, entity_id: entityId, comment_text: text });

            // Update comments_count
            try {
                await supabase.rpc('increment_review_count', {
                    p_review_id: reviewId,
                    p_field: 'comments_count',
                    p_delta: 1,
                });
            } catch {
                // RPC may not exist — ignore and just refresh
            }

            onCommentAdded();
            await fetchComments();
        } catch (err) {
            console.error('Error posting comment:', err);
        } finally {
            setPosting(false);
        }
    };

    const formatTime = (iso: string) => {
        const d = new Date(iso);
        const now = new Date();
        const diffMs = now.getTime() - d.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'just now';
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffH = Math.floor(diffMin / 60);
        if (diffH < 24) return `${diffH}h ago`;
        const diffD = Math.floor(diffH / 24);
        return `${diffD}d ago`;
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent
            onRequestClose={onClose}
        >
            <Pressable style={cmtStyles.overlay} onPress={onClose} />
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={cmtStyles.sheetWrapper}
            >
                <View style={[cmtStyles.sheet, { paddingBottom: insets.bottom + 8 }]}>
                    {/* Handle + header */}
                    <View style={cmtStyles.handle} />
                    <View style={cmtStyles.header}>
                        <SynthText variant="h2" style={cmtStyles.headerTitle}>Comments</SynthText>
                        <Pressable onPress={onClose} style={cmtStyles.closeBtn}>
                            <X size={22} color={SynthTokens.colors.neutral600} />
                        </Pressable>
                    </View>

                    {/* Comments list */}
                    {loadingComments ? (
                        <View style={cmtStyles.centered}>
                            <ActivityIndicator size="small" color={PINK} />
                        </View>
                    ) : comments.length === 0 ? (
                        <View style={cmtStyles.centered}>
                            <SynthText variant="meta" color="secondary">No comments yet. Be the first!</SynthText>
                        </View>
                    ) : (
                        <FlatList
                            data={comments}
                            keyExtractor={item => item.id}
                            style={cmtStyles.list}
                            contentContainerStyle={{ padding: 16 }}
                            ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
                            renderItem={({ item }) => (
                                <View style={cmtStyles.commentRow}>
                                    {item.author_avatar ? (
                                        <Image source={{ uri: item.author_avatar }} style={cmtStyles.cmtAvatar} contentFit="cover" />
                                    ) : (
                                        <View style={[cmtStyles.cmtAvatar, cmtStyles.cmtAvatarFallback]}>
                                            <Text style={cmtStyles.cmtAvatarLetter}>
                                                {(item.author_name || '?').charAt(0).toUpperCase()}
                                            </Text>
                                        </View>
                                    )}
                                    <View style={cmtStyles.commentBubble}>
                                        <View style={cmtStyles.cmtNameRow}>
                                            <Text style={cmtStyles.cmtAuthor}>{item.author_name}</Text>
                                            <Text style={cmtStyles.cmtTime}>{formatTime(item.created_at)}</Text>
                                        </View>
                                        <Text style={cmtStyles.cmtText}>{item.comment_text}</Text>
                                    </View>
                                </View>
                            )}
                        />
                    )}

                    {/* Input row */}
                    {sessionUserId ? (
                        <View style={cmtStyles.inputRow}>
                            <TextInput
                                style={cmtStyles.input}
                                placeholder="Add a comment…"
                                placeholderTextColor={SynthTokens.colors.neutral400}
                                value={newComment}
                                onChangeText={setNewComment}
                                multiline
                                returnKeyType="send"
                                onSubmitEditing={postComment}
                            />
                            <Pressable
                                onPress={postComment}
                                disabled={!newComment.trim() || posting}
                                style={[cmtStyles.sendBtn, (!newComment.trim() || posting) && cmtStyles.sendBtnDisabled]}
                            >
                                {posting ? (
                                    <ActivityIndicator size="small" color={SynthTokens.colors.neutral0} />
                                ) : (
                                    <Send size={18} color={SynthTokens.colors.neutral0} />
                                )}
                            </Pressable>
                        </View>
                    ) : null}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const cmtStyles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheetWrapper: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: '75%',
    },
    sheet: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: 'hidden',
        maxHeight: '100%',
    },
    handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: SynthTokens.colors.neutral200,
        alignSelf: 'center',
        marginTop: 10,
        marginBottom: 4,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    headerTitle: { fontWeight: '700' },
    closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    centered: { padding: 32, alignItems: 'center' },
    list: { flexGrow: 0, maxHeight: 380 },
    commentRow: {
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
    },
    cmtAvatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: SynthTokens.colors.neutral200,
        flexShrink: 0,
    },
    cmtAvatarFallback: {
        backgroundColor: PINK,
        alignItems: 'center',
        justifyContent: 'center',
    },
    cmtAvatarLetter: {
        color: SynthTokens.colors.neutral0,
        fontWeight: '700',
        fontSize: 13,
    },
    commentBubble: {
        flex: 1,
        backgroundColor: SynthTokens.colors.neutral50,
        borderRadius: 12,
        padding: 10,
        gap: 4,
    },
    cmtNameRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cmtAuthor: {
        fontWeight: '700',
        fontSize: 13,
        color: SynthTokens.colors.neutral900,
    },
    cmtTime: {
        fontSize: 11,
        color: SynthTokens.colors.neutral400,
    },
    cmtText: {
        fontSize: 14,
        color: SynthTokens.colors.neutral900,
        lineHeight: 20,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: 8,
        paddingHorizontal: 16,
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: SynthTokens.colors.neutral200,
    },
    input: {
        flex: 1,
        backgroundColor: SynthTokens.colors.neutral100,
        borderRadius: 20,
        paddingHorizontal: 14,
        paddingVertical: 10,
        fontSize: 15,
        color: SynthTokens.colors.neutral900,
        maxHeight: 100,
    },
    sendBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: PINK,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    sendBtnDisabled: {
        backgroundColor: SynthTokens.colors.neutral400,
    },
});

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ReviewDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [review, setReview] = useState<ReviewRow | null>(null);
    const [loading, setLoading] = useState(true);
    const [forbidden, setForbidden] = useState(false);
    const [sessionUserId, setSessionUserId] = useState<string | null>(null);
    const [likesCount, setLikesCount] = useState(0);
    const [commentsCount, setCommentsCount] = useState(0);
    const [isLiked, setIsLiked] = useState(false);
    const [liking, setLiking] = useState(false);
    const [commentsOpen, setCommentsOpen] = useState(false);
    const [shareToChatOpen, setShareToChatOpen] = useState(false);
    const [lastError, setLastError] = useState<{ code?: string; message?: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            setLoading(true);
            setLastError(null);
            try {
                if (!id) {
                    if (__DEV__) setLastError({ message: 'Missing review id in route' });
                    setLoading(false);
                    return;
                }
                // On React Native, getSession() may return null on cold launch while
                // AsyncStorage is still hydrating. Refresh the token if needed so
                // RLS sees an authenticated request and doesn't hide public reviews.
                let { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    const { data: refreshed } = await supabase.auth.refreshSession();
                    session = refreshed.session;
                }
                const user = session?.user ?? null;
                if (user) setSessionUserId(user.id);

                // Query the review itself — NO inline joins. Column list matches web ReviewDetailView first;
                // on 42703 (missing column) fall back to minimal select (see reviewService.ts ~672).
                const fetchReview = (selectList: string) =>
                    supabase.from('reviews').select(selectList).eq('id', id).maybeSingle();

                let { data, error } = await fetchReview(REVIEW_SELECT_WEB_PARITY);

                // Cold launch: session can hydrate after first tick — one retry after refresh
                if (!data && !error) {
                    await supabase.auth.refreshSession();
                    const second = await fetchReview(REVIEW_SELECT_WEB_PARITY);
                    data = second.data;
                    error = second.error;
                }

                if (error && isUndefinedColumnPostgrestError(error)) {
                    const fb = await fetchReview(REVIEW_SELECT_MINIMAL);
                    data = fb.data;
                    error = fb.error;
                }

                if (cancelled) return;

                if (error || !data) {
                    const errObj = error as { code?: string; message?: string } | null;
                    setLastError({
                        code: errObj?.code,
                        message:
                            errObj?.message ??
                            (!data && !error ? 'No row returned (check RLS or id)' : undefined),
                    });
                    if (__DEV__) {
                        console.warn('[review detail] query returned null', {
                            id,
                            message: errObj?.message,
                            code: errObj?.code,
                            details: (error as { details?: string } | null)?.details,
                            hint: (error as { hint?: string } | null)?.hint,
                            error,
                        });
                    } else {
                        console.warn('[review detail] query returned null', { id, error });
                    }
                    setReview(null);
                    setLoading(false);
                    return;
                }

                const row = data as unknown as Record<string, unknown>;

                // Fetch author separately (avoids inner-join exclusion if user row missing)
                let author: ReviewRow['author'] = null;
                try {
                    const { data: authorData } = await supabase
                        .from('users')
                        .select('user_id, name, avatar_url')
                        .eq('user_id', String(row.user_id))
                        .maybeSingle();
                    if (authorData) author = authorData as ReviewRow['author'];
                } catch { /* non-fatal */ }

                // Fetch event separately (avoids inner-join exclusion if event deleted)
                let evOne: EventSummary | null = null;
                if (row.event_id != null) {
                    try {
                        const { data: evData } = await supabase
                            .from('events')
                            .select('id, title, event_date, artist_id, venue_id, images')
                            .eq('id', String(row.event_id))
                            .maybeSingle();
                        if (evData) evOne = evData as EventSummary;
                    } catch { /* non-fatal */ }
                }

                if (cancelled) return;

                // Check helpful status for current user (errors are non-fatal, skip if not logged in)
                let likedSet = new Set<string>();
                if (user) {
                    try {
                        likedSet = await ReviewEngagementService.getReviewIdsLikedByUser(user.id, [String(id)]);
                    } catch {
                        // not critical — continue with unliked state
                    }
                }

                if (cancelled) return;

                // Resolve artist/venue names from direct FKs if the event lookup returned nothing
                let resolvedArtistName: string | null = evOne?.artist_name ?? null;
                let resolvedVenueName: string | null = evOne?.venue_name ?? null;
                const directArtistId = row.artist_id != null ? String(row.artist_id) : evOne?.artist_id ?? null;
                const directVenueId = row.venue_id != null ? String(row.venue_id) : evOne?.venue_id ?? null;
                if (!resolvedArtistName && directArtistId) {
                    try {
                        const { data: a } = await supabase.from('artists').select('name').eq('id', directArtistId).maybeSingle();
                        if (a?.name) resolvedArtistName = a.name;
                    } catch { /* non-fatal */ }
                }
                if (!resolvedVenueName && directVenueId) {
                    try {
                        const { data: v } = await supabase.from('venues').select('name').eq('id', directVenueId).maybeSingle();
                        if (v?.name) resolvedVenueName = v.name;
                    } catch { /* non-fatal */ }
                }
                // Inject resolved names back into evOne so existing render code uses them
                if (evOne) {
                    evOne = { ...evOne, artist_name: resolvedArtistName, venue_name: resolvedVenueName, artist_id: directArtistId, venue_id: directVenueId };
                } else if (resolvedArtistName || resolvedVenueName) {
                    evOne = { id: '', title: null, event_date: null, artist_name: resolvedArtistName, venue_name: resolvedVenueName, artist_id: directArtistId, venue_id: directVenueId };
                }

                const normalized: ReviewRow = {
                    id: String(row.id),
                    user_id: String(row.user_id),
                    event_id: row.event_id != null ? String(row.event_id) : null,
                    artist_id: directArtistId,
                    venue_id: directVenueId,
                    rating: row.rating != null ? Number(row.rating) : null,
                    review_text: row.review_text != null ? String(row.review_text) : null,
                    photos: Array.isArray(row.photos) ? (row.photos as string[]) : null,
                    created_at: String(row.created_at),
                    // Treat null/undefined is_public as public (only block explicit false)
                    is_public: row.is_public !== false,
                    artist_performance_rating: row.artist_performance_rating != null ? Number(row.artist_performance_rating) : null,
                    production_rating: row.production_rating != null ? Number(row.production_rating) : null,
                    venue_rating: row.venue_rating != null ? Number(row.venue_rating) : null,
                    location_rating: row.location_rating != null ? Number(row.location_rating) : null,
                    value_rating: row.value_rating != null ? Number(row.value_rating) : null,
                    artist_performance_feedback: row.artist_performance_feedback != null ? String(row.artist_performance_feedback) : null,
                    production_feedback: row.production_feedback != null ? String(row.production_feedback) : null,
                    venue_feedback: row.venue_feedback != null ? String(row.venue_feedback) : null,
                    location_feedback: row.location_feedback != null ? String(row.location_feedback) : null,
                    value_feedback: row.value_feedback != null ? String(row.value_feedback) : null,
                    author,
                    events: evOne,
                    likes_count: typeof row.likes_count === 'number' ? row.likes_count : 0,
                    comments_count: typeof row.comments_count === 'number' ? row.comments_count : 0,
                    is_liked_by_user: likedSet.has(String(id)),
                    attendees: Array.isArray(row.attendees) ? row.attendees : null,
                    met_on_synth: null,
                    setlist: row.setlist ?? null,
                    custom_setlist: Array.isArray(row.custom_setlist) ? row.custom_setlist : null,
                };

                // No client-side is_public gate: the reviews_select RLS policy already
                // only returns this row if the viewer is allowed to see it (owner,
                // public, a direct friend of the author, or admin) - if the query
                // above returned a row at all, it's visible to this viewer.
                setForbidden(false);
                setLastError(null);
                setReview(normalized);
                setLikesCount(normalized.likes_count);
                setCommentsCount(normalized.comments_count);
                setIsLiked(normalized.is_liked_by_user);
                setLoading(false);
            } catch (err) {
                console.error('[review] load error', err);
                if (!cancelled) {
                    setLastError({
                        message: err instanceof Error ? err.message : String(err),
                    });
                    setReview(null);
                    setLoading(false);
                }
            }
        })();
        return () => { cancelled = true; };
    }, [id]);

    const onHelpful = async () => {
        if (!sessionUserId || !review || liking) return;
        setLiking(true);
        const wasLiked = isLiked;
        setIsLiked(!wasLiked);
        setLikesCount(c => Math.max(0, wasLiked ? c - 1 : c + 1));
        try {
            await ReviewEngagementService.toggleHelpful(sessionUserId, review.id, wasLiked);
        } catch {
            setIsLiked(wasLiked);
            setLikesCount(c => Math.max(0, wasLiked ? c + 1 : c - 1));
        } finally {
            setLiking(false);
        }
    };

    const onShare = () => {
        if (!review) return;
        if (sessionUserId) {
            setShareToChatOpen(true);
        } else {
            const ev = review.events;
            const headline = ev?.artist_name
                ? `${ev.artist_name}${ev.venue_name ? ` at ${ev.venue_name}` : ''}`
                : 'Concert Review';
            void EventService.shareReviewLink(review.id, { headline, snippet: review.review_text ?? undefined });
        }
    };

    const onOptions = () => {
        if (!review || !sessionUserId) return;
        const isOwner = review.user_id === sessionUserId;
        if (isOwner) {
            Alert.alert(
                'Review Options',
                undefined,
                [
                    {
                        text: 'Delete Review',
                        style: 'destructive',
                        onPress: () => {
                            Alert.alert('Delete Review', 'Are you sure you want to delete this review?', [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Delete',
                                    style: 'destructive',
                                    onPress: async () => {
                                        try {
                                            await supabase.from('reviews').delete().eq('id', review.id);
                                            router.back();
                                        } catch (err) {
                                            console.error('Delete failed:', err);
                                        }
                                    },
                                },
                            ]);
                        },
                    },
                    { text: 'Cancel', style: 'cancel' },
                ]
            );
        } else {
            Alert.alert(
                'Review Options',
                undefined,
                [
                    {
                        text: 'Report Review',
                        onPress: () => Alert.alert('Reported', 'Thank you for your report. We will review it shortly.'),
                    },
                    {
                        text: 'Block User',
                        style: 'destructive',
                        onPress: () => {
                            Alert.alert('Block User', 'Are you sure you want to block this user?', [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Block',
                                    style: 'destructive',
                                    onPress: async () => {
                                        try {
                                            await supabase.from('user_blocks').insert({
                                                blocker_id: sessionUserId,
                                                blocked_id: review.user_id,
                                            });
                                            router.back();
                                        } catch (err) {
                                            console.error('Block failed:', err);
                                        }
                                    },
                                },
                            ]);
                        },
                    },
                    { text: 'Cancel', style: 'cancel' },
                ]
            );
        }
    };

    // ─── Loading / error states ───────────────────────────────────────────────

    if (loading) {
        return (
            <>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
                    <ActivityIndicator size="large" color={PINK} />
                </View>
            </>
        );
    }

    if (!review || forbidden) {
        return (
            <>
                <Stack.Screen options={{ headerShown: false }} />
                <View style={[styles.root, { paddingTop: insets.top }]}>
                    <View style={styles.topBar}>
                        <Pressable onPress={() => router.back()} style={styles.back}>
                            <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
                        </Pressable>
                    </View>
                    <View style={styles.centered}>
                        <SynthText variant="h2" style={{ marginBottom: 8 }}>
                            {forbidden ? 'Private review' : 'Review not found'}
                        </SynthText>
                        <SynthText variant="body" color="secondary" style={{ textAlign: 'center' }}>
                            {forbidden
                                ? 'You do not have access to this review.'
                                : 'This review may have been removed or the link is invalid.'}
                        </SynthText>
                        {__DEV__ && lastError && (lastError.code || lastError.message) ? (
                            <SynthText
                                variant="meta"
                                color="secondary"
                                style={{ marginTop: 16, textAlign: 'center', paddingHorizontal: 16 }}
                            >
                                DEBUG: {lastError.code ? `${lastError.code} — ` : ''}
                                {lastError.message ?? '(no message)'}
                            </SynthText>
                        ) : null}
                    </View>
                </View>
            </>
        );
    }

    // ─── Derived data ─────────────────────────────────────────────────────────

    const ev = review.events;
    const headline =
        ev?.title?.trim() ||
        (ev?.artist_name && ev?.venue_name
            ? `${ev.artist_name} at ${ev.venue_name}`
            : ev?.artist_name || ev?.venue_name || 'Concert Review');

    const heroImageUrl =
        (review.photos && review.photos.length > 0 ? review.photos[0] : null) ||
        ev?.images?.[0]?.url ||
        null;

    const hasCategoryBreakdown =
        review.artist_performance_rating != null ||
        review.production_rating != null ||
        review.venue_rating != null ||
        review.location_rating != null ||
        review.value_rating != null ||
        review.artist_performance_feedback?.trim() ||
        review.production_feedback?.trim() ||
        review.venue_feedback?.trim() ||
        review.location_feedback?.trim() ||
        review.value_feedback?.trim();

    const photos = review.photos ?? [];

    // Attendees may be stored as TEXT[] of JSON strings — normalize first
    const attendeesNormalized: any[] = (review.attendees || []).map((a: any) => {
        if (typeof a === 'string') {
            try { return JSON.parse(a); } catch { return null; }
        }
        return a;
    }).filter(Boolean);
    const taggedAttendees = attendeesNormalized.filter(
        (a: any) => a?.type === 'user' && (a?.name || a?.user_id)
    );

    const firstName = review.author?.name?.split(' ')[0] || 'Review';

    return (
        <>
            <Stack.Screen options={{ headerShown: false }} />
            <View style={[styles.root, { paddingTop: insets.top }]}>
                {/* Sticky header: back + avatar + author name + options */}
                <View style={styles.topBar}>
                    <Pressable onPress={() => router.back()} style={styles.back}>
                        <ChevronLeft size={35} color={SynthTokens.colors.neutral900} />
                    </Pressable>
                    <Pressable style={styles.authorHeaderRow} onPress={() => {}}>
                        {review.author?.avatar_url ? (
                            <Image source={{ uri: review.author.avatar_url }} style={styles.headerAvatar} contentFit="cover" />
                        ) : (
                            <View style={[styles.headerAvatar, styles.avatarFallback]}>
                                <Text style={styles.avatarLetter}>
                                    {(review.author?.name || '?').charAt(0).toUpperCase()}
                                </Text>
                            </View>
                        )}
                        <SynthText variant="body" style={styles.headerAuthorName} numberOfLines={1}>
                            {review.author?.name || 'User'}
                        </SynthText>
                    </Pressable>
                    <Pressable onPress={onOptions} style={styles.topActionBtn} accessibilityLabel="More options">
                        <MoreVertical size={24} color={SynthTokens.colors.neutral900} />
                    </Pressable>
                </View>

                {/* Artist + Venue pills row (below sticky header) */}
                {(ev?.artist_name || ev?.venue_name) ? (
                    <View style={styles.pillsRow}>
                        {ev?.artist_name ? (
                            <Pressable
                                style={styles.artistPill}
                                onPress={ev.artist_id ? () => router.push(`/artist/${ev.artist_id}` as any) : undefined}
                            >
                                <Music size={16} color="#FDF2F8" />
                                <Text style={styles.artistPillText} numberOfLines={1}>{ev.artist_name}</Text>
                            </Pressable>
                        ) : null}
                        {ev?.venue_name ? (
                            <Pressable
                                style={styles.venuePill}
                                onPress={ev.venue_id ? () => router.push(`/venue/${ev.venue_id}` as any) : undefined}
                            >
                                <MapPin size={16} color={PINK} />
                                <Text style={styles.venuePillText} numberOfLines={1}>{ev.venue_name}</Text>
                            </Pressable>
                        ) : null}
                    </View>
                ) : null}

                <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 40 }]} showsVerticalScrollIndicator={false}>
                    {/* Hero image */}
                    {heroImageUrl ? (
                        <Image
                            source={{ uri: heroImageUrl }}
                            style={styles.hero}
                            contentFit="cover"
                        />
                    ) : null}
                    <View style={styles.body}>
                        {/* Event headline */}
                        {headline !== 'Concert Review' ? (
                            <SynthText variant="h2" style={styles.eventHeadline} numberOfLines={2}>
                                {headline}
                            </SynthText>
                        ) : null}
                        {/* {FirstName}'s Review heading */}
                        <SynthText variant="h1" style={styles.title}>
                            {firstName}'s Review
                        </SynthText>
                        {/* Event date */}
                        {ev?.event_date ? (
                            <View style={styles.metaRow}>
                                <Calendar size={16} color={PINK} />
                                <SynthText variant="meta" color="secondary" style={styles.metaTxt}>
                                    {new Date(ev.event_date).toLocaleDateString('en-US', {
                                        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                                    })}
                                </SynthText>
                            </View>
                        ) : null}

                        {/* Overall rating */}
                        {review.rating != null ? (
                            <View style={styles.overallRatingRow}>
                                {[1, 2, 3, 4, 5].map(n => {
                                    const filled = review.rating! >= n;
                                    const half = !filled && review.rating! >= n - 0.5;
                                    return (
                                        <Star
                                            key={n}
                                            size={26}
                                            color="#F5A623"
                                            fill={filled || half ? '#F5A623' : 'transparent'}
                                        />
                                    );
                                })}
                                <SynthText variant="h2" style={styles.overallRatingNum}>
                                    {review.rating.toFixed(1)}
                                </SynthText>
                            </View>
                        ) : null}

                        {/* Review text */}
                        {review.review_text && review.review_text !== 'ATTENDANCE_ONLY' ? (
                            <View style={styles.reviewTextBox}>
                                <SynthText variant="body" style={styles.reviewBody}>
                                    {review.review_text}
                                </SynthText>
                            </View>
                        ) : null}

                        {/* Category breakdown */}
                        {hasCategoryBreakdown ? (
                            <View style={{ gap: 12 }}>
                                <SynthText variant="h2" style={styles.sectionHeading}>
                                    View Rating Details
                                </SynthText>
                                <CategoryRatingRow
                                    icon={<Mic2 size={16} color={PINK} />}
                                    label="Artist Performance"
                                    rating={review.artist_performance_rating}
                                    feedback={review.artist_performance_feedback}
                                />
                                <CategoryRatingRow
                                    icon={<Lightbulb size={16} color={PINK} />}
                                    label="Production"
                                    rating={review.production_rating}
                                    feedback={review.production_feedback}
                                />
                                <CategoryRatingRow
                                    icon={<MapPin size={16} color={PINK} />}
                                    label="Venue Experience"
                                    rating={review.venue_rating}
                                    feedback={review.venue_feedback}
                                />
                                <CategoryRatingRow
                                    icon={<Navigation size={16} color={PINK} />}
                                    label="Location & Logistics"
                                    rating={review.location_rating}
                                    feedback={review.location_feedback}
                                />
                                <CategoryRatingRow
                                    icon={<DollarSign size={16} color={PINK} />}
                                    label="Value"
                                    rating={review.value_rating}
                                    feedback={review.value_feedback}
                                />
                            </View>
                        ) : null}

                        {/* Photos grid */}
                        {photos.length > 0 ? (
                            <View style={styles.card}>
                                <SynthText variant="meta" style={styles.sectionLabel}>
                                    PHOTOS ({photos.length})
                                </SynthText>
                                <View style={styles.photoGrid}>
                                    {photos.map((uri, i) => (
                                        <Image
                                            key={i}
                                            source={{ uri }}
                                            style={styles.photo}
                                            contentFit="cover"
                                        />
                                    ))}
                                </View>
                            </View>
                        ) : null}

                        {/* Attendees */}
                        {taggedAttendees.length > 0 ? (
                            <View style={styles.card}>
                                <SynthText variant="meta" style={styles.sectionLabel}>
                                    ATTENDED WITH
                                </SynthText>
                                <View style={styles.attendeesRow}>
                                    {taggedAttendees.map((a: any, i: number) => (
                                        <View key={i} style={styles.attendeeChip}>
                                            {a.avatar_url ? (
                                                <Image source={{ uri: a.avatar_url }} style={styles.attendeeAvatar} contentFit="cover" />
                                            ) : (
                                                <View style={[styles.attendeeAvatar, styles.attendeeAvatarFallback]}>
                                                    <Text style={styles.attendeeAvatarLetter}>
                                                        {(a.name || '?').charAt(0).toUpperCase()}
                                                    </Text>
                                                </View>
                                            )}
                                            <SynthText variant="meta" style={styles.attendeeName}>
                                                {a.name || 'User'}
                                            </SynthText>
                                            {review.met_on_synth && (
                                                <SynthText variant="meta" color="brand" style={styles.metBadge}> · met on Synth</SynthText>
                                            )}
                                        </View>
                                    ))}
                                </View>
                            </View>
                        ) : null}

                        {/* Setlist */}
                        {(() => {
                            const songs: any[] = (() => {
                                if (review.custom_setlist?.length) {
                                    const first = review.custom_setlist[0];
                                    return Array.isArray(first?.songs) ? first.songs : [];
                                }
                                if (review.setlist?.sets?.set) {
                                    const sets = review.setlist.sets.set;
                                    return Array.isArray(sets)
                                        ? sets.flatMap((s: any) => Array.isArray(s.song) ? s.song : [])
                                        : [];
                                }
                                return [];
                            })();
                            if (!songs.length) return null;
                            return (
                                <View style={styles.card}>
                                    <SynthText variant="meta" style={styles.sectionLabel}>
                                        SETLIST ({songs.length} songs)
                                    </SynthText>
                                    {songs.map((song: any, i: number) => (
                                        <View key={i} style={styles.setlistRow}>
                                            <Text style={styles.setlistNum}>{i + 1}</Text>
                                            <SynthText variant="meta" style={styles.setlistSong} numberOfLines={1}>
                                                {song.name || song.song_name || 'Unknown'}
                                                {song.cover_artist ? ` (${song.cover_artist})` : ''}
                                            </SynthText>
                                        </View>
                                    ))}
                                </View>
                            );
                        })()}

                        {/* Engagement */}
                        <View style={styles.engagementRow}>
                            {/* Helpful */}
                            <Pressable
                                onPress={() => void onHelpful()}
                                style={[styles.engagementBtn, isLiked && styles.engagementBtnOn]}
                                disabled={!sessionUserId || liking}
                            >
                                {liking ? (
                                    <ActivityIndicator size="small" color={PINK} />
                                ) : (
                                    <>
                                        <ThumbsUp
                                            size={16}
                                            color={isLiked ? PINK : SynthTokens.colors.neutral600}
                                            fill={isLiked ? PINK : 'transparent'}
                                        />
                                        <Text style={[styles.engagementBtnTxt, isLiked && styles.engagementBtnTxtOn]}>
                                            {likesCount > 0 ? `${likesCount} ` : ''}Helpful
                                        </Text>
                                    </>
                                )}
                            </Pressable>

                            {/* Comments */}
                            <Pressable
                                onPress={() => setCommentsOpen(true)}
                                style={styles.engagementBtn}
                            >
                                <MessageCircle
                                    size={16}
                                    color={SynthTokens.colors.neutral600}
                                />
                                <Text style={styles.engagementBtnTxt}>
                                    {commentsCount > 0 ? `${commentsCount} ` : ''}Comments
                                </Text>
                            </Pressable>

                            {/* Share */}
                            <Pressable
                                onPress={onShare}
                                style={styles.shareBtn}
                                accessibilityLabel="Share review"
                            >
                                <Share2 size={18} color={SynthTokens.colors.neutral0} />
                            </Pressable>
                        </View>

                        {/* View event link */}
                        {ev?.id ? (
                            <Pressable
                                style={styles.eventLink}
                                onPress={() => router.push(`/event/${ev.id}` as any)}
                            >
                                <SynthText variant="meta" style={styles.eventLinkTxt}>
                                    View event page →
                                </SynthText>
                            </Pressable>
                        ) : null}
                    </View>
                </ScrollView>
            </View>

            {/* Comments Sheet */}
            <CommentsSheet
                reviewId={review.id}
                sessionUserId={sessionUserId}
                visible={commentsOpen}
                onClose={() => setCommentsOpen(false)}
                onCommentAdded={() => setCommentsCount(c => c + 1)}
            />

            {/* Share to Chat */}
            {sessionUserId ? (
                <ShareToChatModal
                    visible={shareToChatOpen}
                    onClose={() => setShareToChatOpen(false)}
                    type="review"
                    entityId={review.id}
                    title={headline}
                    currentUserId={sessionUserId}
                />
            ) : null}
        </>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 8,
        paddingBottom: 4,
        backgroundColor: SynthTokens.colors.neutral0,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    back: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    topBarActions: { flexDirection: 'row', alignItems: 'center' },
    topActionBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    authorHeaderRow: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minWidth: 0,
        marginHorizontal: 4,
    },
    headerAvatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 2,
        borderColor: PINK,
        flexShrink: 0,
    },
    headerAuthorName: {
        flex: 1,
        fontSize: 17,
        fontWeight: '700',
        color: SynthTokens.colors.neutral900,
    },
    pillsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: SynthTokens.colors.neutral0,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    artistPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: PINK,
        borderRadius: 14,
        paddingVertical: 10,
        paddingHorizontal: 16,
        maxWidth: '60%',
    },
    artistPillText: {
        color: SynthTokens.colors.neutral0,
        fontWeight: '600',
        fontSize: 15,
        flexShrink: 1,
    },
    venuePill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: SynthTokens.colors.brandPink050,
        borderRadius: 14,
        borderWidth: 2,
        borderColor: '#FBCFE8',
        paddingVertical: 10,
        paddingHorizontal: 16,
        maxWidth: '60%',
    },
    venuePillText: {
        color: PINK,
        fontWeight: '600',
        fontSize: 15,
        flexShrink: 1,
    },
    scroll: {},
    hero: { width: '100%', height: 240, backgroundColor: SynthTokens.colors.neutral200 },
    heroPlaceholder: { height: 0 },
    body: { padding: 16, gap: 12 },
    eventHeadline: { fontSize: 20, fontWeight: '700', color: SynthTokens.colors.neutral900, lineHeight: 26 },
    title: { fontSize: 22, fontWeight: '800', lineHeight: 28 },
    authorRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    avatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: PINK },
    avatarFallback: { backgroundColor: PINK, alignItems: 'center', justifyContent: 'center' },
    avatarLetter: { color: SynthTokens.colors.neutral0, fontWeight: '700', fontSize: 13 },
    authorName: { fontWeight: '700', color: SynthTokens.colors.neutral900 },
    overallRatingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    overallRatingNum: {
        marginLeft: 8,
        fontSize: 22,
        fontWeight: '800',
        color: '#F5A623',
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    metaTxt: { flex: 1, fontSize: 15 },
    metaLink: { color: PINK, fontWeight: '600' },
    reviewTextBox: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.corner,
        borderWidth: 2,
        borderColor: SynthTokens.colors.neutral200,
        padding: 16,
    },
    reviewBody: { lineHeight: 26 },
    sectionHeading: {
        fontSize: 20,
        fontWeight: '700',
        color: SynthTokens.colors.neutral900,
    },
    card: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.corner,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        padding: 16,
        gap: 0,
    },
    sectionLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.6,
        color: SynthTokens.colors.neutral600,
        marginBottom: 8,
    },
    photoGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
        marginTop: 4,
    },
    photo: {
        width: PHOTO_SIZE,
        height: PHOTO_SIZE,
        borderRadius: 8,
        backgroundColor: SynthTokens.colors.neutral100,
    },
    engagementRow: {
        flexDirection: 'row',
        gap: 8,
        marginTop: 4,
        alignItems: 'center',
    },
    engagementBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: SynthTokens.radius.corner,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    engagementBtnOn: {
        borderColor: PINK,
        backgroundColor: SynthTokens.colors.brandPink050,
    },
    engagementBtnTxt: {
        fontSize: 14,
        fontWeight: '600',
        color: SynthTokens.colors.neutral600,
    },
    engagementBtnTxtOn: { color: PINK },
    shareBtn: {
        width: 44,
        height: 44,
        borderRadius: SynthTokens.radius.corner,
        backgroundColor: PINK,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
    },
    eventLink: {
        alignSelf: 'flex-start',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: SynthTokens.radius.corner,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    eventLinkTxt: { color: PINK, fontWeight: '700' },
    attendeesRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 4,
    },
    attendeeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: SynthTokens.colors.neutral100,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1.5,
        borderColor: PINK,
    },
    attendeeAvatar: {
        width: 20,
        height: 20,
        borderRadius: 10,
    },
    attendeeAvatarFallback: {
        backgroundColor: PINK,
        alignItems: 'center',
        justifyContent: 'center',
    },
    attendeeAvatarLetter: {
        color: SynthTokens.colors.neutral0,
        fontWeight: '700',
        fontSize: 10,
    },
    attendeeName: {
        fontWeight: '600',
        color: SynthTokens.colors.neutral900,
    },
    metBadge: {
        fontSize: 11,
    },
    setlistRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SynthTokens.colors.neutral200,
    },
    setlistNum: {
        width: 22,
        fontSize: 12,
        fontWeight: '700',
        color: SynthTokens.colors.neutral400,
        textAlign: 'right',
    },
    setlistSong: {
        flex: 1,
        fontWeight: '500',
        color: SynthTokens.colors.neutral900,
    },
});
