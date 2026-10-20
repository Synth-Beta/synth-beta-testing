import React, { useCallback, useState } from 'react';
import { StyleSheet, View, Pressable, Dimensions, Text, Linking, Alert, Image } from 'react-native';
import { findPick5Band, pick5BandUrl } from '@synth/shared';
import { SafeImage } from '../SafeImage';
import { useRouter } from 'expo-router';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { Heart, MapPin, Share2, Ticket, Music, Star, Building2 as BuildingComplex, MoreHorizontal, ArrowUpRight } from 'lucide-react-native';
import { EventService } from '../../services/eventService';
import { isEventPast } from '../../utils/eventStatusUtils';
import { useInterested } from '../../contexts/InterestedContext';
import { ShareToChatModal } from '../share/ShareToChatModal';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - SynthTokens.spacing.screenMarginX * 2;
const ASPECT_RATIO = 16 / 10;
const IMAGE_HEIGHT = CARD_WIDTH / ASPECT_RATIO;
const CARD_RADIUS = SynthTokens.radius.corner;

const PINK = SynthTokens.colors.brandPink500;
const PICK5_PURPLE = '#8b2ff0';
const PICK5_LOGO = require('../../../assets/images/pick5-logo-mark.png');

/** One rating line under the card (same rules as web: average + one good quote, no counts). */
export interface CardRatingLine {
  name: string;
  avgRating: number;
  quote: string | null;
}

export interface EventCardProps {
  id: string;
  title: string;
  artist_name: string;
  venue_name: string;
  event_date: string;
  image_url?: string;
  /** City/region for location row, e.g. "Washington" */
  venue_city?: string;
  /** State code for location row, e.g. "DC" */
  venue_state?: string;
  cornerLabel?: string;
  /** Navigate to event detail */
  onPress?: () => void;
  /** If known from feed, avoids wrong initial Interested state */
  initialInterested?: boolean;
  interested_count?: number;
  ticket_url?: string;
  artist_id?: string;
  venue_id?: string;
  /** When provided, the Share button opens the in-app ShareToChatModal */
  currentUserId?: string | null;
  /** Friends interested (FRIENDS-labeled events only) */
  friendsInterested?: Array<{ id: string; name: string; avatar_url?: string | null }>;
  /** Artist / venue average rating lines (home feed). */
  ratings?: { artist?: CardRatingLine; venue?: CardRatingLine };
  /** Home feed: "Don't recommend {artist}" from the ⋯ button. */
  onHideArtist?: () => void;
}

export const EventCard: React.FC<EventCardProps> = ({
  id,
  title,
  artist_name,
  venue_name,
  event_date,
  image_url,
  venue_city,
  venue_state,
  cornerLabel,
  onPress,
  initialInterested = false,
  interested_count = 0,
  ticket_url: ticketUrlProp,
  artist_id,
  venue_id,
  currentUserId,
  friendsInterested,
  ratings,
  onHideArtist,
}) => {
  const router = useRouter();
  const { isInterested, toggle, loading: interestedLoading } = useInterested();
  const interested = interestedLoading
    ? isInterested(id) || initialInterested
    : isInterested(id);
  const [shareToChatOpen, setShareToChatOpen] = useState(false);

  const headline =
    title?.trim() ||
    (artist_name && venue_name ? `${artist_name} at ${venue_name}` : artist_name || venue_name || 'Event');

  const formattedDate = (() => {
    if (!event_date) return 'Date TBA';
    const d = new Date(event_date);
    const t = d.getTime();
    if (!Number.isFinite(t)) return 'Date TBA';
    return d.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  })();

  // Web-style date badge on the image: MON / day / weekday.
  const dateBadge = (() => {
    const d = event_date ? new Date(event_date) : null;
    if (!d || !Number.isFinite(d.getTime())) return null;
    return {
      month: d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: String(d.getDate()),
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    };
  })();

  const pick5Band = findPick5Band(artist_name);
  const ratingLines = [ratings?.artist, ratings?.venue].filter(Boolean) as CardRatingLine[];

  const confirmHideArtist = useCallback(() => {
    if (!onHideArtist || !artist_name) return;
    Alert.alert(`Don't recommend ${artist_name}?`, 'Their shows will stop showing up in your feed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Hide', style: 'destructive', onPress: onHideArtist },
    ]);
  }, [onHideArtist, artist_name]);

  const venueName = venue_name?.trim();
  const cityState = [venue_city?.trim(), venue_state?.trim()].filter(Boolean).join(', ');

  const artistLine = artist_name?.trim() || '';

  const onShare = useCallback(() => {
    if (currentUserId) {
      setShareToChatOpen(true);
    } else {
      void EventService.shareEventLink(id, { headline, formattedDate });
    }
  }, [currentUserId, id, headline, formattedDate]);

  const onToggleInterested = useCallback(async () => {
    await toggle(id);
  }, [id, toggle]);

  const openTickets = useCallback(async () => {
    const u = ticketUrlProp?.trim();
    if (!u) return;
    const ok = await Linking.canOpenURL(u);
    if (ok) await Linking.openURL(u);
  }, [ticketUrlProp]);

  const openEventDetail = useCallback(() => {
    void EventService.resolveEventQueryId(id).then((resolved) => {
      router.push(`/event/${resolved ?? id}` as any);
    });
  }, [id, router]);


  const handleOpen = onPress ?? openEventDetail;

  const isPast = !!event_date && isEventPast(event_date);

  const onWriteReview = useCallback(() => {
    const params = new URLSearchParams();
    if (artist_id) params.set('prefillArtistId', artist_id);
    if (venue_id) params.set('prefillVenueId', venue_id);
    if (event_date) params.set('prefillDate', event_date.split('T')[0]);
    router.push(`/review-compose?${params.toString()}` as any);
  }, [artist_id, venue_id, event_date, router]);

  // For FRIENDS events: build a "Sam and +2 friends interested" label
  const friendsLabel = (() => {
    if (!friendsInterested || friendsInterested.length === 0) return null;
    const names = friendsInterested.map(f => f.name).filter(Boolean);
    if (names.length === 1) return `${names[0]} is interested`;
    if (names.length === 2) return `${names[0]} and ${names[1]} are interested`;
    return `${names[0]} and ${names.length - 1} others are interested`;
  })();

  const interestedLabel = friendsLabel
    ?? (interested_count > 0
      ? `${interested_count} ${interested_count === 1 ? 'person' : 'people'} interested`
      : null);

  return (
    <View style={styles.shadowShell}>
      <View style={[styles.cardFace, pick5Band && styles.cardFacePick5]}>
        {pick5Band ? (
          <Pressable
            onPress={() => void Linking.openURL(pick5BandUrl(pick5Band.slug))}
            style={styles.pick5Strip}
            accessibilityRole="link"
            accessibilityLabel={`Predict the ${pick5Band.name} setlist on Pick5`}
          >
            <Image source={PICK5_LOGO} style={styles.pick5Logo} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.pick5Title}>Pick5</Text>
              <Text style={styles.pick5Sub} numberOfLines={1}>Predict the {pick5Band.name} setlist</Text>
            </View>
            <Text style={styles.pick5Cta}>Make picks</Text>
            <ArrowUpRight size={14} color={PICK5_PURPLE} />
          </Pressable>
        ) : null}
        <Pressable onPress={handleOpen} style={({ pressed }) => [pressed && styles.pressed]}>
          <View style={[styles.imageWrap, pick5Band && styles.imageWrapFlat]}>
            <SafeImage uri={image_url} style={styles.image} contentFit="cover" transition={200} />
            {cornerLabel ? (
              <View style={styles.cornerLabelWrap} pointerEvents="none">
                <Text style={styles.cornerLabelText}>{cornerLabel.toUpperCase()}</Text>
              </View>
            ) : null}
            {dateBadge ? (
              <View style={styles.dateBadge} pointerEvents="none" accessibilityLabel={formattedDate}>
                <Text style={[styles.dateBadgeSmall, { color: pick5Band ? PICK5_PURPLE : PINK }]}>{dateBadge.month}</Text>
                <Text style={styles.dateBadgeDay}>{dateBadge.day}</Text>
                <Text style={styles.dateBadgeSmall}>{dateBadge.weekday}</Text>
              </View>
            ) : null}
          </View>

          <View style={[styles.heroTextPad, styles.headingRow]}>
            <SynthText variant="h2" numberOfLines={2} style={[styles.headline, styles.headlineFlex]}>
              {headline}
            </SynthText>
            {onHideArtist && artist_name ? (
              <Pressable onPress={confirmHideArtist} hitSlop={10} style={styles.moreBtn} accessibilityLabel="More options">
                <MoreHorizontal size={20} color={SynthTokens.colors.neutral600} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.detailsPad}>
            {artistLine ? (
              <View style={styles.metaRow}>
                <Music size={16} color={PINK} />
                <SynthText
                  variant="meta"
                  color="secondary"
                  numberOfLines={1}
                  style={styles.metaTxt}
                >
                  {artistLine}
                </SynthText>
              </View>
            ) : null}

            {cityState ? (
              <View style={styles.metaRow}>
                <MapPin size={16} color={PINK} />
                <SynthText
                  variant="meta"
                  color="secondary"
                  numberOfLines={1}
                  style={styles.metaTxt}
                >
                  {cityState}
                </SynthText>
              </View>
            ) : null}

            <View style={styles.metaRow}>
              <BuildingComplex size={16} color={PINK} />
              <SynthText
                variant="meta"
                color="secondary"
                numberOfLines={1}
                style={styles.metaTxt}
              >
                {venueName || 'Venue TBA'}
              </SynthText>
            </View>

            {ratingLines.length > 0 ? (
              <View style={styles.ratingBox}>
                {ratingLines.map((line, i) => (
                  <View key={line.name + i} style={i > 0 ? styles.ratingDivider : undefined}>
                    <View style={styles.ratingMeta}>
                      <Star size={14} color="#f59e0b" fill="#f59e0b" />
                      <Text style={styles.ratingAvg}>{line.avgRating.toFixed(1)}</Text>
                      <Text style={styles.ratingName} numberOfLines={1}>{line.name}</Text>
                    </View>
                    {line.quote ? <Text style={styles.ratingQuote}>“{line.quote}”</Text> : null}
                  </View>
                ))}
              </View>
            ) : null}

            {interestedLabel ? (
              <SynthText variant="meta" color="secondary" style={styles.interestedLine}>
                {interestedLabel}
              </SynthText>
            ) : null}
          </View>
        </Pressable>

        <View style={styles.actions}>
          {isPast ? (
            <Pressable onPress={onWriteReview} style={styles.writeReviewBtn}>
              <Star size={18} color={SynthTokens.colors.neutral0} fill={SynthTokens.colors.neutral0} />
              <Text style={styles.writeReviewBtnTxt}>Write Review</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void onToggleInterested()}
              style={[styles.interestedBtn, interested && styles.interestedBtnOn]}
            >
              <Heart
                size={18}
                color={PINK}
                fill={interested ? PINK : 'transparent'}
                strokeWidth={2}
              />
              <Text style={styles.interestedBtnTxt}>{interested ? 'Interested' : "I'm interested"}</Text>
            </Pressable>
          )}
          {ticketUrlProp?.trim() ? (
            <Pressable onPress={() => void openTickets()} style={styles.ticketBtn} accessibilityLabel="Tickets">
              <Ticket size={20} color={PINK} />
            </Pressable>
          ) : null}
          <Pressable onPress={onShare} style={styles.shareBtn} accessibilityLabel="Share event">
            <Share2 size={20} color={PINK} />
          </Pressable>
        </View>
      </View>
      {currentUserId ? (
        <ShareToChatModal
          visible={shareToChatOpen}
          onClose={() => setShareToChatOpen(false)}
          type="event"
          entityId={id}
          title={headline}
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
  pressed: {
    opacity: 0.96,
  },
  cardFacePick5: {
    borderColor: PICK5_PURPLE,
    borderWidth: 1.5,
  },
  pick5Strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5edff',
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
  },
  pick5Logo: { width: 26, height: 26, borderRadius: 7 },
  pick5Title: { fontSize: 13, fontWeight: '800', color: SynthTokens.colors.neutral900 },
  pick5Sub: { fontSize: 12, color: SynthTokens.colors.neutral600 },
  pick5Cta: { fontSize: 13, fontWeight: '700', color: PICK5_PURPLE },
  imageWrapFlat: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
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
  dateBadgeSmall: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: SynthTokens.colors.neutral600,
  },
  dateBadgeDay: {
    fontSize: 22,
    fontWeight: '800',
    color: SynthTokens.colors.neutral900,
    marginTop: 1,
    marginBottom: 1,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  headlineFlex: { flex: 1 },
  moreBtn: {
    paddingTop: 2,
  },
  ratingBox: {
    marginTop: 6,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  ratingDivider: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: '#fde68a',
  },
  ratingMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingAvg: { fontSize: 13, fontWeight: '800', color: '#78350f' },
  ratingName: { flexShrink: 1, fontSize: 13, color: '#92400e' },
  ratingQuote: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 19,
    fontStyle: 'italic',
    color: '#57534e',
  },
  imageWrap: {
    width: '100%',
    height: IMAGE_HEIGHT,
    backgroundColor: SynthTokens.colors.neutral100,
    position: 'relative',
    borderTopLeftRadius: CARD_RADIUS,
    borderTopRightRadius: CARD_RADIUS,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
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
    // Match web CompactEventCard reason badge (tokens.css --neutral-50 on --brand-pink-500).
    color: SynthTokens.colors.neutral50,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.6,
  },
  heroTextPad: {
    paddingHorizontal: SynthTokens.spacing.md,
    paddingTop: SynthTokens.spacing.md,
    paddingBottom: SynthTokens.spacing.sm,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  detailsPad: {
    paddingHorizontal: SynthTokens.spacing.md,
    paddingBottom: SynthTokens.spacing.sm,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  headline: {
    fontSize: 18,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  inlineLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  linkMeta: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
  },
  venueLine: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaTxt: {
    flexShrink: 1,
    fontSize: 15,
  },
  metaSubLine: {
    fontSize: 13,
    marginTop: 1,
  },
  metaLink: {
    color: SynthTokens.colors.brandPink500,
    fontWeight: '600',
  },
  interestedLine: {
    marginTop: 4,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SynthTokens.spacing.md,
    paddingBottom: SynthTokens.spacing.md,
    paddingTop: 2,
    backgroundColor: SynthTokens.colors.neutral0,
    borderBottomLeftRadius: CARD_RADIUS,
    borderBottomRightRadius: CARD_RADIUS,
  },
  writeReviewBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: SynthTokens.radius.corner,
    backgroundColor: PINK,
  },
  writeReviewBtnTxt: {
    fontSize: 16,
    fontWeight: '700',
    color: SynthTokens.colors.neutral0,
  },
  interestedBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: SynthTokens.radius.corner,
    borderWidth: 2,
    borderColor: PINK,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  interestedBtnOn: {
    backgroundColor: SynthTokens.colors.brandPink050,
  },
  interestedBtnTxt: {
    fontSize: 16,
    fontWeight: '700',
    color: PINK,
  },
  ticketBtn: {
    width: 48,
    height: 48,
    borderRadius: SynthTokens.radius.corner,
    borderWidth: 2,
    borderColor: PINK,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SynthTokens.colors.neutral0,
  },
  shareBtn: {
    width: 48,
    height: 48,
    borderRadius: SynthTokens.radius.corner,
    borderWidth: 2,
    borderColor: PINK,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SynthTokens.colors.neutral0,
  },
});
