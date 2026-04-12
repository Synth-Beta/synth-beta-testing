import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    StyleSheet,
    Pressable,
    Dimensions,
    Text,
    Platform,
    ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { BlurView } from 'expo-blur';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import type { NetworkReview } from '../../services/homeFeedService';
import { Star, ThumbsUp, MessageCircle, Share2, Calendar } from 'lucide-react-native';
import { ReviewEngagementService } from '../../services/reviewEngagementService';
import { EventService } from '../../services/eventService';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - SynthTokens.spacing.screenMarginX * 2;
const ASPECT_RATIO = 16 / 10;
const IMAGE_HEIGHT = CARD_WIDTH / ASPECT_RATIO;
const CARD_RADIUS = SynthTokens.radius.corner;
const PINK = SynthTokens.colors.brandPink500;
const RATING_BADGE_BG = '#F5A623';

/** Inner media scale (matches web compact card image overfill). */
const MEDIA_SCALE = 1.2;

export interface NetworkReviewCardProps {
    review: NetworkReview;
    currentUserId?: string | null;
    onPress?: () => void;
}

function formatEventDate(iso: string | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export const NetworkReviewCard: React.FC<NetworkReviewCardProps> = ({
    review,
    currentUserId,
    onPress,
}) => {
    const router = useRouter();
    const artist = review.event_info?.artist_name || 'Artist';
    const venue = review.event_info?.venue_name || 'Venue';
    const reviewTitle =
        review.event_info?.artist_name != null
            ? `${artist}${review.event_info?.venue_name ? ` at ${venue}` : ''}`
            : review.event_info?.venue_name || 'Concert Review';

    const photos = Array.isArray(review.photos) ? review.photos : [];
    const thumbIdxRaw = review.thumbnail_index;
    const thumbIdx =
        typeof thumbIdxRaw === 'number' && Number.isFinite(thumbIdxRaw)
            ? Math.max(0, Math.min(photos.length - 1, Math.floor(thumbIdxRaw)))
            : 0;
    const displayPhoto = photos.length > 0 ? (photos[thumbIdx] ?? photos[0] ?? null) : null;
    const displayImageUrl = displayPhoto || review.artist_image_url || null;
    const isUserPhoto = photos.length > 0;

    const crop = review.thumbnail_crop;
    const validCrop =
        isUserPhoto &&
        photos.length === 1 &&
        crop &&
        typeof crop.xPct === 'number' &&
        typeof crop.yPct === 'number' &&
        typeof crop.zoom === 'number' &&
        Number.isFinite(crop.xPct) &&
        Number.isFinite(crop.yPct) &&
        Number.isFinite(crop.zoom) &&
        crop.zoom > 0
            ? {
                  xPct: Math.max(0, Math.min(100, crop.xPct)),
                  yPct: Math.max(0, Math.min(100, crop.yPct)),
                  zoom: Math.max(0.1, Math.min(10, crop.zoom)),
              }
            : null;

    const innerW = CARD_WIDTH * MEDIA_SCALE;
    const innerH = IMAGE_HEIGHT * MEDIA_SCALE;
    const cropTransform = validCrop
        ? {
              transform: [
                  { translateX: (innerW * (50 - validCrop.xPct)) / 100 },
                  { translateY: (innerH * (50 - validCrop.yPct)) / 100 },
                  { scale: validCrop.zoom },
              ],
          }
        : undefined;

    const overallRating = typeof review.rating === 'number' && !Number.isNaN(review.rating) ? review.rating : null;
    const eventDateLine = formatEventDate(review.event_info?.event_date);
    const showPreview =
        Boolean(review.content) && review.content !== 'ATTENDANCE_ONLY';

    const [likesCount, setLikesCount] = useState(review.likes_count ?? 0);
    const [commentsCount, setCommentsCount] = useState(review.comments_count ?? 0);
    const [isLiked, setIsLiked] = useState(review.is_liked_by_user ?? false);
    const [liking, setLiking] = useState(false);

    useEffect(() => {
        setLikesCount(review.likes_count ?? 0);
        setCommentsCount(review.comments_count ?? 0);
        setIsLiked(review.is_liked_by_user ?? false);
    }, [review.id, review.likes_count, review.comments_count, review.is_liked_by_user]);

    const openDetail = useCallback(() => {
        if (onPress) {
            onPress();
            return;
        }
        router.push(`/review/${review.id}` as any);
    }, [onPress, review.id, router]);

    const onHelpful = useCallback(async () => {
        if (!currentUserId || liking) return;
        setLiking(true);
        const wasLiked = isLiked;
        setIsLiked(!wasLiked);
        setLikesCount(c => Math.max(0, wasLiked ? c - 1 : c + 1));
        try {
            await ReviewEngagementService.toggleHelpful(currentUserId, review.id, wasLiked);
        } catch {
            setIsLiked(wasLiked);
            setLikesCount(c => Math.max(0, wasLiked ? c + 1 : c - 1));
        } finally {
            setLiking(false);
        }
    }, [currentUserId, isLiked, liking, review.id]);

    const onShare = useCallback(() => {
        const snippet =
            showPreview && review.content && review.content.length > 200
                ? `${review.content.slice(0, 200)}…`
                : review.content;
        void EventService.shareReviewLink(review.id, { headline: reviewTitle, snippet });
    }, [review.id, review.content, reviewTitle, showPreview]);

    const engagementSummary = useMemo(() => {
        const parts: string[] = [];
        if (likesCount > 0) {
            parts.push(`${likesCount} ${likesCount === 1 ? 'person' : 'people'} found helpful`);
        }
        if (commentsCount > 0) {
            parts.push(`${commentsCount} ${commentsCount === 1 ? 'comment' : 'comments'}`);
        }
        if (!parts.length) return null;
        return parts.join(' · ');
    }, [likesCount, commentsCount]);

    return (
        <View style={styles.shadowShell}>
            <View style={styles.cardFace}>
                <Pressable onPress={openDetail} style={({ pressed }) => [pressed && styles.pressedMain]}>
                    <View style={styles.imageWrap}>
                        {displayImageUrl ? (
                            <>
                                <View style={styles.imageOverflowCenter}>
                                    <View style={[styles.scaledMediaBox, { width: innerW, height: innerH }]}>
                                        <Image
                                            source={{ uri: displayImageUrl }}
                                            style={[styles.scaledImage, cropTransform]}
                                            contentFit="cover"
                                            transition={200}
                                        />
                                    </View>
                                </View>
                                <LinearGradient
                                    colors={['rgba(14,14,14,0)', 'rgba(14,14,14,0.35)', 'rgba(14,14,14,0.82)']}
                                    locations={[0, 0.45, 1]}
                                    style={StyleSheet.absoluteFill}
                                    pointerEvents="none"
                                />
                                {overallRating != null ? (
                                    <View style={styles.ratingBadge} pointerEvents="none">
                                        <Star size={16} color={SynthTokens.colors.neutral0} fill={SynthTokens.colors.neutral0} />
                                        <Text style={styles.ratingBadgeText}>{overallRating.toFixed(1)}</Text>
                                    </View>
                                ) : null}
                                {isUserPhoto ? (
                                    <View style={styles.userPhotoBadge} pointerEvents="none">
                                        <Text style={styles.userPhotoBadgeText}>User Photo</Text>
                                    </View>
                                ) : null}
                            </>
                        ) : (
                            <LinearGradient
                                colors={[SynthTokens.colors.brandPink600, SynthTokens.colors.brandPink700]}
                                style={styles.fallbackGradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                            >
                                <SynthText variant="h2" numberOfLines={2} style={styles.fallbackTitle}>
                                    {reviewTitle}
                                </SynthText>
                            </LinearGradient>
                        )}
                    </View>

                    <View style={styles.bottomOverlay}>
                        <BlurView intensity={Platform.OS === 'ios' ? 48 : 32} tint="light" style={StyleSheet.absoluteFill} />
                        <LinearGradient
                            colors={[
                                'rgba(255,255,255,0.72)',
                                'rgba(255,255,255,0.92)',
                                'rgba(251,251,251,0.98)',
                            ]}
                            style={StyleSheet.absoluteFill}
                            pointerEvents="none"
                        />
                        <View style={styles.bottomContent}>
                            <SynthText variant="h2" numberOfLines={2} style={styles.cardTitle}>
                                {reviewTitle}
                            </SynthText>

                            <View style={styles.reviewerRow}>
                                {review.author.avatar_url ? (
                                    <Image
                                        source={{ uri: review.author.avatar_url }}
                                        style={styles.reviewerAvatar}
                                        contentFit="cover"
                                    />
                                ) : (
                                    <View style={[styles.reviewerAvatar, styles.avatarFallback]}>
                                        <SynthText variant="meta" style={styles.avatarLetter}>
                                            {review.author.name.charAt(0).toUpperCase()}
                                        </SynthText>
                                    </View>
                                )}
                                <SynthText variant="meta" color="secondary" style={styles.reviewerName}>
                                    Reviewed by {review.author.name}
                                </SynthText>
                            </View>

                            {eventDateLine ? (
                                <View style={styles.metaRow}>
                                    <Calendar size={18} color={PINK} />
                                    <SynthText variant="meta" color="secondary">
                                        {eventDateLine}
                                    </SynthText>
                                </View>
                            ) : null}

                            {showPreview ? (
                                <SynthText variant="meta" color="secondary" numberOfLines={2} style={styles.previewQuote}>
                                    "{review.content}"
                                </SynthText>
                            ) : null}

                            {engagementSummary ? (
                                <SynthText variant="meta" color="secondary" style={styles.engagementSummary}>
                                    {engagementSummary}
                                </SynthText>
                            ) : null}
                        </View>
                    </View>
                </Pressable>

                <View style={styles.actions}>
                    <Pressable
                        onPress={() => void onHelpful()}
                        style={[styles.actionBtn, styles.actionBtnFlex]}
                        disabled={!currentUserId || liking}
                    >
                        {liking ? (
                            <ActivityIndicator size="small" color={PINK} />
                        ) : (
                            <>
                                <ThumbsUp
                                    size={18}
                                    color={SynthTokens.colors.neutral600}
                                    fill={isLiked ? SynthTokens.colors.neutral600 : 'transparent'}
                                />
                                <Text style={styles.actionCount}>{likesCount}</Text>
                                <Text style={styles.actionLabel}>Helpful</Text>
                            </>
                        )}
                    </Pressable>

                    <Pressable onPress={openDetail} style={styles.actionBtn}>
                        <MessageCircle size={18} color={SynthTokens.colors.neutral600} />
                        <Text style={styles.actionCount}>{commentsCount}</Text>
                    </Pressable>

                    <Pressable onPress={onShare} style={styles.shareBtn} accessibilityLabel="Share review">
                        <Share2 size={20} color={SynthTokens.colors.neutral0} />
                    </Pressable>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    shadowShell: {
        marginHorizontal: SynthTokens.spacing.screenMarginX,
        marginBottom: SynthTokens.spacing.lg,
        shadowColor: SynthTokens.shadow.color,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 2,
    },
    cardFace: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: CARD_RADIUS,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        overflow: 'hidden',
    },
    pressedMain: {
        opacity: 0.97,
    },
    imageWrap: {
        width: '100%',
        height: IMAGE_HEIGHT,
        backgroundColor: SynthTokens.colors.neutral100,
        position: 'relative',
    },
    imageOverflowCenter: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    scaledMediaBox: {
        overflow: 'hidden',
    },
    scaledImage: {
        width: '100%',
        height: '100%',
    },
    fallbackGradient: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SynthTokens.spacing.md,
    },
    fallbackTitle: {
        color: SynthTokens.colors.neutral0,
        textAlign: 'center',
    },
    ratingBadge: {
        position: 'absolute',
        left: SynthTokens.spacing.md,
        top: SynthTokens.spacing.grouped,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: RATING_BADGE_BG,
        zIndex: 10,
    },
    ratingBadgeText: {
        color: SynthTokens.colors.neutral0,
        fontWeight: '600',
        fontSize: 16,
    },
    userPhotoBadge: {
        position: 'absolute',
        top: SynthTokens.spacing.md,
        right: SynthTokens.spacing.md,
        backgroundColor: 'rgba(255,255,255,0.92)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        zIndex: 10,
    },
    userPhotoBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: SynthTokens.colors.neutral900,
    },
    bottomOverlay: {
        position: 'relative',
        overflow: 'hidden',
    },
    bottomContent: {
        position: 'relative',
        paddingHorizontal: SynthTokens.spacing.grouped,
        paddingVertical: SynthTokens.spacing.small,
        gap: SynthTokens.spacing.small,
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: SynthTokens.colors.neutral900,
    },
    reviewerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SynthTokens.spacing.inline,
    },
    reviewerAvatar: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 1.5,
        borderColor: PINK,
    },
    avatarFallback: {
        backgroundColor: PINK,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarLetter: {
        fontSize: 11,
        fontWeight: '700',
        color: SynthTokens.colors.neutral0,
    },
    reviewerName: {
        flex: 1,
        fontWeight: '500',
    },
    metaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SynthTokens.spacing.inline,
    },
    previewQuote: {
        fontStyle: 'italic',
        lineHeight: 22,
    },
    engagementSummary: {
        fontWeight: '500',
    },
    actions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: SynthTokens.spacing.inline,
        paddingHorizontal: SynthTokens.spacing.md,
        paddingVertical: SynthTokens.spacing.small,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: SynthTokens.colors.neutral200,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        height: SynthTokens.sizing.inputHeight,
        paddingHorizontal: 14,
        borderRadius: SynthTokens.radius.corner,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
        backgroundColor: SynthTokens.colors.neutral100,
    },
    actionBtnFlex: {
        flex: 1,
    },
    actionCount: {
        fontSize: 16,
        fontWeight: '500',
        color: SynthTokens.colors.neutral600,
    },
    actionLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: SynthTokens.colors.neutral900,
    },
    shareBtn: {
        width: SynthTokens.sizing.inputHeight,
        height: SynthTokens.sizing.inputHeight,
        borderRadius: SynthTokens.radius.corner,
        backgroundColor: PINK,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
