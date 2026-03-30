import React, { useCallback, useState } from 'react';
import { StyleSheet, View, Pressable, Dimensions, Share, Text } from 'react-native';
import { Image } from 'expo-image';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { Heart, MapPin, Calendar, Share2 } from 'lucide-react-native';
import { supabase } from '../../integrations/supabase/client';
import { EventService } from '../../services/eventService';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - SynthTokens.spacing.screenMarginX * 2;
const ASPECT_RATIO = 16 / 10;
const IMAGE_HEIGHT = CARD_WIDTH / ASPECT_RATIO;

const PINK = SynthTokens.colors.brandPink500;

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
}) => {
  const [interested, setInterested] = useState(initialInterested);

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

  const onShare = useCallback(async () => {
    try {
      await Share.share({
        message: `${headline} — ${formattedDate}`,
        title: headline,
      });
    } catch {
      /* user dismissed */
    }
  }, [headline, formattedDate]);

  const onToggleInterested = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const ok = await EventService.toggleInteraction(user.id, id, 'interested');
    if (ok) setInterested(prev => !prev);
  }, [id]);

  return (
    <View style={styles.container}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.cardPress, pressed && styles.pressed]}>
        <View style={styles.imageWrap}>
          <Image
            source={image_url ? { uri: image_url } : require('../../../assets/placeholder-event.png')}
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

        <View style={styles.body}>
          <SynthText variant="h2" numberOfLines={2} style={styles.headline}>
            {headline}
          </SynthText>
          <View style={styles.metaRow}>
            <MapPin size={16} color={PINK} />
            <SynthText variant="meta" color="secondary" numberOfLines={1} style={styles.metaTxt}>
              {locationLine}
            </SynthText>
          </View>
          <View style={styles.metaRow}>
            <Calendar size={16} color={PINK} />
            <SynthText variant="meta" color="secondary" style={styles.metaTxt}>
              {formattedDate}
            </SynthText>
          </View>
        </View>
      </Pressable>

      <View style={styles.actions}>
        <Pressable onPress={() => void onToggleInterested()} style={[styles.interestedBtn, interested && styles.interestedBtnOn]}>
          <Heart
            size={18}
            color={PINK}
            fill={interested ? PINK : 'transparent'}
            strokeWidth={2}
          />
          <Text style={styles.interestedBtnTxt}>Interested</Text>
        </Pressable>
        <Pressable onPress={onShare} style={styles.shareBtn} accessibilityLabel="Share event">
          <Share2 size={20} color={PINK} />
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: SynthTokens.radius.corner,
    marginHorizontal: SynthTokens.spacing.screenMarginX,
    marginBottom: SynthTokens.spacing.lg,
    overflow: 'hidden',
    shadowColor: SynthTokens.shadow.color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  cardPress: {},
  pressed: {
    opacity: 0.96,
  },
  imageWrap: {
    width: '100%',
    height: IMAGE_HEIGHT,
    backgroundColor: SynthTokens.colors.neutral100,
    position: 'relative',
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
    color: SynthTokens.colors.neutral0,
    fontWeight: '800',
    fontSize: 10,
    letterSpacing: 0.6,
  },
  body: {
    paddingHorizontal: SynthTokens.spacing.md,
    paddingTop: SynthTokens.spacing.md,
    paddingBottom: SynthTokens.spacing.sm,
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
  metaTxt: {
    flex: 1,
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SynthTokens.spacing.md,
    paddingBottom: SynthTokens.spacing.md,
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
