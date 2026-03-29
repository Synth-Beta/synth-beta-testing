import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import type { NetworkReview } from '../../services/homeFeedService';
import { Star } from 'lucide-react-native';

export interface NetworkReviewCardProps {
    review: NetworkReview;
    onPress?: () => void;
}

export const NetworkReviewCard: React.FC<NetworkReviewCardProps> = ({ review, onPress }) => {
    const artist = review.event_info?.artist_name || 'Artist';
    const venue = review.event_info?.venue_name || 'Venue';
    const rating = review.rating != null ? Number(review.rating).toFixed(1) : null;

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
            <View style={styles.top}>
                {review.author.avatar_url ? (
                    <Image source={{ uri: review.author.avatar_url }} style={styles.avatar} contentFit="cover" />
                ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                        <SynthText variant="meta" style={styles.avatarLetter}>
                            {review.author.name.charAt(0).toUpperCase()}
                        </SynthText>
                    </View>
                )}
                <View style={styles.meta}>
                    <SynthText variant="meta" style={styles.name}>
                        {review.author.name}
                    </SynthText>
                    <SynthText variant="meta" color="secondary" numberOfLines={1}>
                        {artist} · {venue}
                    </SynthText>
                </View>
                {rating ? (
                    <View style={styles.ratingRow}>
                        <Star size={16} color={SynthTokens.colors.brandPink500} fill={SynthTokens.colors.brandPink500} />
                        <SynthText variant="meta" style={styles.ratingNum}>
                            {rating}
                        </SynthText>
                    </View>
                ) : null}
            </View>
            {review.content ? (
                <SynthText variant="body" color="secondary" numberOfLines={4} style={styles.body}>
                    {review.content}
                </SynthText>
            ) : null}
        </Pressable>
    );
};

const styles = StyleSheet.create({
    card: {
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.corner,
        marginHorizontal: SynthTokens.spacing.screenMarginX,
        marginBottom: SynthTokens.spacing.md,
        padding: SynthTokens.spacing.md,
        borderWidth: 1,
        borderColor: SynthTokens.colors.neutral200,
    },
    pressed: { opacity: 0.92 },
    top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 44, height: 44, borderRadius: 22 },
    avatarFallback: {
        backgroundColor: SynthTokens.colors.neutral200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarLetter: { fontWeight: '700', fontSize: 18 },
    meta: { flex: 1, minWidth: 0 },
    name: { fontWeight: '700' },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    ratingNum: { fontWeight: '700' },
    body: { marginTop: 10 },
});
