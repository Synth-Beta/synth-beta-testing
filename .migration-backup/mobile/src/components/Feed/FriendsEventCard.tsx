import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { SynthTokens } from '../../tokens/SynthTokens';
import { EventCard } from './EventCard';
import type { NetworkEvent } from '../../services/homeFeedService';

const PINK = SynthTokens.colors.brandPink500;
const AVATAR_SIZE = 28;
const MAX_AVATARS = 3;

interface FriendsEventCardProps {
    event: NetworkEvent;
    currentUserId?: string | null;
    onPress: () => void;
}

function FriendAvatarRow({ friends }: { friends: NonNullable<NetworkEvent['friends_all']> }) {
    const shown = friends.slice(0, MAX_AVATARS);
    const overflow = friends.length - MAX_AVATARS;

    const label = (() => {
        if (friends.length === 1) return `${friends[0].name} is interested`;
        if (friends.length === 2) return `${friends[0].name} & ${friends[1].name} are interested`;
        return `${friends[0].name} + ${friends.length - 1} others are interested`;
    })();

    return (
        <View style={styles.friendRow}>
            <View style={styles.avatarStack}>
                {shown.map((f, i) => (
                    <View
                        key={f.id}
                        style={[styles.avatarWrap, { marginLeft: i === 0 ? 0 : -8, zIndex: MAX_AVATARS - i }]}
                    >
                        {f.avatar_url ? (
                            <Image source={{ uri: f.avatar_url }} style={styles.avatar} contentFit="cover" />
                        ) : (
                            <View style={[styles.avatar, styles.avatarFallback]}>
                                <Text style={styles.avatarLetter}>
                                    {(f.name || '?').charAt(0).toUpperCase()}
                                </Text>
                            </View>
                        )}
                    </View>
                ))}
                {overflow > 0 ? (
                    <View style={[styles.avatar, styles.avatarOverflow, { marginLeft: -8, zIndex: 0 }]}>
                        <Text style={styles.avatarOverflowText}>+{overflow}</Text>
                    </View>
                ) : null}
            </View>
            <Text style={styles.friendLabel} numberOfLines={1}>
                {label}
            </Text>
        </View>
    );
}

export function FriendsEventCard({ event, currentUserId, onPress }: FriendsEventCardProps) {
    return (
        <View>
            <EventCard
                id={event.id}
                title={event.title}
                artist_name={event.artist_name}
                venue_name={event.venue_name}
                venue_city={event.venue_city}
                event_date={event.event_date}
                image_url={event.image_url}
                cornerLabel="FRIENDS"
                currentUserId={currentUserId}
                onPress={onPress}
            />
            {event.friends_all && event.friends_all.length > 0 ? (
                <FriendAvatarRow friends={event.friends_all} />
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    friendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginHorizontal: SynthTokens.spacing.screenMarginX ?? 16,
        marginTop: -6,
        marginBottom: 12,
        backgroundColor: SynthTokens.colors.brandPink050,
        borderWidth: 1,
        borderTopWidth: 0,
        borderColor: '#FBCFE8',
        borderBottomLeftRadius: SynthTokens.radius.corner,
        borderBottomRightRadius: SynthTokens.radius.corner,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    avatarStack: {
        flexDirection: 'row',
        alignItems: 'center',
        flexShrink: 0,
    },
    avatarWrap: {},
    avatar: {
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: AVATAR_SIZE / 2,
        borderWidth: 2,
        borderColor: SynthTokens.colors.brandPink050,
    },
    avatarFallback: {
        backgroundColor: PINK,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarLetter: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 11,
    },
    avatarOverflow: {
        backgroundColor: SynthTokens.colors.neutral200,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarOverflowText: {
        fontSize: 10,
        fontWeight: '700',
        color: SynthTokens.colors.neutral600,
    },
    friendLabel: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
        color: PINK,
    },
});
