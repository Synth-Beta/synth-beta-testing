import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, Pressable, Dimensions, Text } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Heart, MessageCircle, Share2, Star } from 'lucide-react-native';
import { SafeImage } from '../SafeImage';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { resolveFeedImageUri } from '../../utils/eventImages';
import type { NetworkReview } from '../../services/homeFeedService';
import { ReviewEngagementService } from '../../services/reviewEngagementService';
import { EventService } from '../../services/eventService';
import { ShareToChatModal } from '../share/ShareToChatModal';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - SynthTokens.spacing.screenMarginX * 2;
const IMAGE_HEIGHT = CARD_WIDTH / (16 / 10);
const CARD_RADIUS = SynthTokens.radius.corner;
const PINK = SynthTokens.colors.brandPink500;

export interface ThreadReviewCardProps {
  review: NetworkReview;
  currentUserId?: string | null;
  /** Corner label, e.g. "Friend review" on Home, "Review" on Community. */
  label?: string;
  onPress?: () => void;
}

/**
 * Review in the home thread / Community: same shell as EventCard (image, corner label,
 * date badge, title, actions) so reviews sit naturally between shows. Mirrors web
 * ThreadReviewCard.
 */
export const ThreadReviewCard: React.FC<ThreadReviewCardProps> = ({ review, currentUserId, label, onPress }) => {
  const router = useRouter();
  const artist = review.event_info?.artist_name;
  const venue = review.event_info?.venue_name;
  const title = artist && venue ? `${artist} at ${venue}` : artist || venue || 'Concert review';

  const photos = Array.isArray(review.photos) ? review.photos : [];
  const imageUri = photos[review.thumbnail_index ?? 0] ?? photos[0] ?? resolveFeedImageUri(review.artist_image_url ?? null) ?? undefined;
  const text = review.content && review.content !== 'ATTENDANCE_ONLY' ? review.content.trim() : '';
  const rating = typeof review.rating === 'number' && Number.isFinite(review.rating) ? review.rating : null;
  const chip = label ?? (review.connection_degree === 1 ? 'Friend review' : 'Review');

  const dateBadge = (() => {
    const iso = review.event_info?.event_date;
    const d = iso ? new Date(iso) : null;
    if (!d || !Number.isFinite(d.getTime())) return null;
    return {
      month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: String(d.getDate()),
      year: String(d.getFullYear()),
    };
  })();

  const [likesCount, setLikesCount] = useState(review.likes_count ?? 0);
  const [isLiked, setIsLiked] = useState(review.is_liked_by_user ?? false);
  const [liking, setLiking] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const commentsCount = review.comments_count ?? 0;

  useEffect(() => {
    setLikesCount(review.likes_count ?? 0);
    setIsLiked(review.is_liked_by_user ?? false);
  }, [review.id, review.likes_count, review.is_liked_by_user]);

  const open = useCallback(() => {
    if (onPress) onPress();
    else router.push(`/review/${review.id}` as any);
  }, [onPress, review.id, router]);

  const onLike = useCallback(async () => {
    if (!currentUserId || liking) return;
    setLiking(true);
    const was = isLiked;
    setIsLiked(!was);
    setLikesCount((c) => Math.max(0, was ? c - 1 : c + 1));
    try {
      await ReviewEngagementService.toggleHelpful(currentUserId, review.id, was);
    } catch {
      setIsLiked(was);
      setLikesCount((c) => Math.max(0, was ? c + 1 : c - 1));
    } finally {
      setLiking(false);
    }
  }, [currentUserId, isLiked, liking, review.id]);

  const onShare = useCallback(() => {
    if (currentUserId) setShareOpen(true);
    else void EventService.shareReviewLink(review.id, { headline: title, snippet: text.slice(0, 200) });
  }, [currentUserId, review.id, title, text]);

  return (
    <View style={styles.shadowShell}>
      <View style={styles.cardFace}>
        <Pressable onPress={open} style={({ pressed }) => [pressed && styles.pressed]}>
          <View style={styles.imageWrap}>
            <SafeImage uri={imageUri} style={styles.image} contentFit="cover" transition={200} />
            <View style={styles.cornerLabelWrap} pointerEvents="none">
              <Text style={styles.cornerLabelText}>{chip.toUpperCase()}</Text>
            </View>
            {dateBadge ? (
              <View style={styles.dateBadge} pointerEvents="none">
                <Text style={[styles.dateBadgeSmall, { color: PINK }]}>{dateBadge.month}</Text>
                <Text style={styles.dateBadgeDay}>{dateBadge.day}</Text>
                <Text style={styles.dateBadgeSmall}>{dateBadge.year}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.body}>
            <SynthText variant="h2" numberOfLines={2} style={styles.headline}>
              {title}
            </SynthText>
            <View style={styles.authorRow}>
              {review.author.avatar_url ? (
                <Image source={{ uri: review.author.avatar_url }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>{review.author.name.charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.authorName} numberOfLines={1}>{review.author.name}</Text>
              {rating != null ? (
                <View style={styles.stars} accessibilityLabel={`${rating} out of 5 stars`}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Star
                      key={n}
                      size={14}
                      color={n <= Math.round(rating) ? '#f59e0b' : SynthTokens.colors.neutral200}
                      fill={n <= Math.round(rating) ? '#f59e0b' : 'transparent'}
                    />
                  ))}
                </View>
              ) : null}
            </View>
            {text ? (
              <SynthText variant="meta" color="secondary" numberOfLines={3} style={styles.quote}>
                “{text}”
              </SynthText>
            ) : null}
          </View>
        </Pressable>

        <View style={styles.actions}>
          <Pressable
            onPress={() => void onLike()}
            disabled={!currentUserId || liking}
            style={[styles.likeBtn, isLiked && styles.likeBtnOn]}
            accessibilityLabel={isLiked ? 'Unlike review' : 'Like review'}
          >
            <Heart size={18} color={PINK} fill={isLiked ? PINK : 'transparent'} />
            <Text style={styles.likeTxt}>{likesCount > 0 ? likesCount : 'Like'}</Text>
          </Pressable>
          <Pressable onPress={open} style={styles.commentBtn} accessibilityLabel={`Comments (${commentsCount})`}>
            <MessageCircle size={18} color={SynthTokens.colors.neutral900} />
            <Text style={styles.commentTxt}>{commentsCount > 0 ? commentsCount : 'Comment'}</Text>
          </Pressable>
          <Pressable onPress={onShare} style={styles.iconBtn} accessibilityLabel="Share review">
            <Share2 size={20} color={PINK} />
          </Pressable>
        </View>
      </View>
      {currentUserId ? (
        <ShareToChatModal
          visible={shareOpen}
          onClose={() => setShareOpen(false)}
          type="review"
          entityId={review.id}
          title={title}
          currentUserId={currentUserId}
        />
      ) : null}
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
  },
  pressed: { opacity: 0.96 },
  imageWrap: {
    width: '100%',
    height: IMAGE_HEIGHT,
    backgroundColor: SynthTokens.colors.neutral100,
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  image: { width: '100%', height: '100%' },
  cornerLabelWrap: {
    position: 'absolute',
    top: SynthTokens.spacing.sm,
    left: SynthTokens.spacing.sm,
    backgroundColor: PINK,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  cornerLabelText: {
    color: SynthTokens.colors.neutral50,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.6,
  },
  dateBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 58,
    paddingTop: 7,
    paddingBottom: 6,
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
  },
  dateBadgeSmall: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: SynthTokens.colors.neutral600 },
  dateBadgeDay: { fontSize: 22, fontWeight: '800', color: SynthTokens.colors.neutral900, marginVertical: 1 },
  body: {
    paddingHorizontal: SynthTokens.spacing.md,
    paddingTop: SynthTokens.spacing.md,
    paddingBottom: SynthTokens.spacing.sm,
    gap: 8,
  },
  headline: { fontSize: 18, fontWeight: '700', color: SynthTokens.colors.neutral900 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 26, height: 26, borderRadius: 13 },
  avatarFallback: { backgroundColor: SynthTokens.colors.brandPink050, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 12, fontWeight: '700', color: PINK },
  authorName: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: SynthTokens.colors.neutral900 },
  stars: { flexDirection: 'row', gap: 1, marginLeft: 'auto' },
  quote: { fontSize: 15, lineHeight: 21 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SynthTokens.spacing.md,
    paddingBottom: SynthTokens.spacing.md,
    paddingTop: 2,
  },
  likeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: CARD_RADIUS,
    borderWidth: 2,
    borderColor: PINK,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  likeBtnOn: { backgroundColor: SynthTokens.colors.brandPink050 },
  likeTxt: { fontSize: 16, fontWeight: '700', color: PINK },
  commentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: CARD_RADIUS,
    borderWidth: 2,
    borderColor: SynthTokens.colors.neutral200,
  },
  commentTxt: { fontSize: 16, fontWeight: '700', color: SynthTokens.colors.neutral900 },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: CARD_RADIUS,
    borderWidth: 2,
    borderColor: PINK,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
