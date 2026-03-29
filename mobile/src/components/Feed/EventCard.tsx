import React from 'react';
import { StyleSheet, View, Pressable, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { SynthButton } from '../SynthButton';
import { Heart, MapPin, Calendar } from 'lucide-react-native';

const { width } = Dimensions.get('window');
const CARD_WIDTH = width - (SynthTokens.spacing.screenMarginX * 2);
const ASPECT_RATIO = 4 / 3;
const CARD_HEIGHT = CARD_WIDTH / ASPECT_RATIO;

interface EventCardProps {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    image_url?: string;
    /** Optional top-left badge (e.g. RECOMMENDED) matching web feed */
    cornerLabel?: string;
    onPress?: () => void;
    onGoingPress?: () => void;
}

export const EventCard: React.FC<EventCardProps> = ({
    title,
    artist_name,
    venue_name,
    event_date,
    image_url,
    cornerLabel,
    onPress,
    onGoingPress
}) => {
    const formattedDate = new Date(event_date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
    });

    return (
        <Pressable onPress={onPress} style={({ pressed }) => [styles.container, pressed && styles.pressed]}>
            <View style={styles.imageContainer}>
                <Image
                    source={image_url ? { uri: image_url } : require('../../../assets/placeholder-event.png')}
                    style={styles.image}
                    contentFit="cover"
                    transition={200}
                />

                <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.8)']}
                    style={styles.gradient}
                />

                <View style={styles.content}>
                    {cornerLabel ? (
                        <View style={styles.cornerLabelWrap} pointerEvents="none">
                            <SynthText variant="meta" style={styles.cornerLabelText}>
                                {cornerLabel}
                            </SynthText>
                        </View>
                    ) : null}
                    <View style={styles.topRow}>
                        <View style={styles.dateBadge}>
                            <SynthText variant="meta" color="white" style={styles.dateText}>
                                {formattedDate}
                            </SynthText>
                        </View>
                        <Pressable style={styles.likeButton}>
                            <Heart size={20} color="white" />
                        </Pressable>
                    </View>

                    <View style={styles.bottomContent}>
                        <SynthText variant="h2" color="white" numberOfLines={1}>
                            {artist_name}
                        </SynthText>
                        <SynthText variant="body" color="white" numberOfLines={1} style={styles.eventTitle}>
                            {title}
                        </SynthText>

                        <View style={styles.venueRow}>
                            <MapPin size={14} color="rgba(255,255,255,0.8)" />
                            <SynthText variant="meta" color="white" style={styles.venueText} numberOfLines={1}>
                                {venue_name}
                            </SynthText>
                        </View>
                    </View>
                </View>
            </View>

            <View style={styles.actionRow}>
                <SynthButton
                    variant="primary"
                    title="Going"
                    onPress={onGoingPress}
                    style={styles.goingButton}
                />
            </View>
        </Pressable>
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
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
    },
    pressed: {
        transform: [{ scale: 0.98 }],
    },
    cornerLabelWrap: {
        position: 'absolute',
        top: SynthTokens.spacing.sm,
        left: SynthTokens.spacing.sm,
        zIndex: 4,
        backgroundColor: SynthTokens.colors.brandPink500,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    cornerLabelText: {
        color: SynthTokens.colors.neutral0,
        fontWeight: '800',
        fontSize: 11,
        letterSpacing: 0.5,
    },
    imageContainer: {
        width: '100%',
        height: CARD_HEIGHT,
        position: 'relative',
    },
    image: {
        ...StyleSheet.absoluteFillObject,
    },
    gradient: {
        ...StyleSheet.absoluteFillObject,
    },
    content: {
        ...StyleSheet.absoluteFillObject,
        padding: SynthTokens.spacing.md,
        justifyContent: 'space-between',
    },
    topRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    dateBadge: {
        backgroundColor: 'rgba(0,0,0,0.5)',
        paddingHorizontal: SynthTokens.spacing.sm,
        paddingVertical: 4,
        borderRadius: SynthTokens.radius.small,
        // backdropFilter is for web, removed for native compatibility
    },
    dateText: {
        fontWeight: 'bold',
    },
    likeButton: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(0,0,0,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    bottomContent: {
        gap: 4,
    },
    eventTitle: {
        opacity: 0.9,
    },
    venueRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginTop: 4,
    },
    venueText: {
        opacity: 0.8,
        fontSize: 14,
    },
    actionRow: {
        padding: SynthTokens.spacing.sm,
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    goingButton: {
        minWidth: 100,
    }
});
