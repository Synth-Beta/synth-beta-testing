import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, Pressable, Dimensions, Text, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { Heart, MapPin, Calendar, Share2, Ticket, Music } from 'lucide-react-native';
import { supabase } from '../../integrations/supabase/client';
import { EventService } from '../../services/eventService';
import { resolveFeedImageUri } from '../../utils/eventImages';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - SynthTokens.spacing.screenMarginX * 2;
const ASPECT_RATIO = 16 / 10;
const IMAGE_HEIGHT = CARD_WIDTH / ASPECT_RATIO;
const CARD_RADIUS = SynthTokens.radius.corner;

const PINK = SynthTokens.colors.brandPink500;

const PLACEHOLDER = require('../../../assets/placeholder-event.png');

export interface EventCardProps {
  id: string;
  title: string;
  artist_name: string;
  venue_name: string;
  event_date: string;
  image_url?: string;
  /** City/region for subtitle, e.g. "Washington" */
  venue_city?: string;
  cornerLabel?: string;
  /** Navigate to event detail */
  onPress?: () => void;
  /** If known from feed, avoids wrong initial Interested state */
  initialInterested?: boolean;
  interested_count?: number;
  ticket_url?: string;
  artist_id?: string;
  venue_id?: string;
}

export const EventCard: React.FC<EventCardProps> = ({
  id,
  title,
  artist_name,
  venue_name,
  event_date,
  image_url,
  venue_city,
  cornerLabel,
  onPress,
  initialInterested = false,
  interested_count = 0,
  ticket_url: ticketUrlProp,
}) => {
  const router = useRouter();
  const [interested, setInterested] = useState(initialInterested);

  useEffect(() => {
    setInterested(initialInterested);
  }, [id, initialInterested]);

  const resolvedUri = resolveFeedImageUri(image_url);

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

  const venueName = venue_name?.trim();
  const venueCity = venue_city?.trim();
  const locationLine =
    venueName && venueCity ? `${venueName} · ${venueCity}` : venueName || venueCity || '';

  const artistLine = artist_name?.trim() || '';

  const onShare = useCallback(() => {
    void EventService.shareEventLink(id, { headline, formattedDate });
  }, [id, headline, formattedDate]);

  const onToggleInterested = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const ok = await EventService.toggleInteraction(user.id, id, 'interested');
    if (ok) setInterested(prev => !prev);
  }, [id]);

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

  const interestedLabel =
    interested_count > 0
      ? `${interested_count} ${interested_count === 1 ? 'person' : 'people'} interested`
      : null;

  return (
    <View style={styles.shadowShell}>
      <View style={styles.cardFace}>
        <Pressable onPress={handleOpen} style={({ pressed }) => [pressed && styles.pressed]}>
          <View style={styles.imageWrap}>
            <Image
              source={resolvedUri ? { uri: resolvedUri } : PLACEHOLDER}
              style={styles.image}
              contentFit="cover"
              transition={200}
            />
            {cornerLabel ? (
              <View style={styles.cornerLabelWrap} pointerEvents="none">
                <Text style={styles.cornerLabelText}>{cornerLabel.toUpperCase()}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.heroTextPad}>
            <SynthText variant="h2" numberOfLines={2} style={styles.headline}>
              {headline}
            </SynthText>
          </View>

          <View style={styles.detailsPad}>
            {artistLine ? (
              <View style={styles.metaRow}>
                <Music size={16} color={PINK} />
                <SynthText variant="meta" color="secondary" numberOfLines={1} style={styles.metaTxt}>
                  {artistLine}
                </SynthText>
              </View>
            ) : null}

            <View style={styles.metaRow}>
              <MapPin size={16} color={PINK} />
              <SynthText variant="meta" color="secondary" numberOfLines={2} style={styles.metaTxt}>
                {locationLine || 'Venue TBA'}
              </SynthText>
            </View>

            <View style={styles.metaRow}>
              <Calendar size={16} color={PINK} />
              <SynthText variant="meta" color="secondary" style={styles.metaTxt}>
                {formattedDate}
              </SynthText>
            </View>

            {interestedLabel ? (
              <SynthText variant="meta" color="secondary" style={styles.interestedLine}>
                {interestedLabel}
              </SynthText>
            ) : null}
          </View>
        </Pressable>

        <View style={styles.actions}>
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
            <Text style={styles.interestedBtnTxt}>Interested</Text>
          </Pressable>
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
