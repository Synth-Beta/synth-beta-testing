import React from 'react';
import { StyleSheet, View, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { NetworkEvent } from '../../services/homeFeedService';

interface FriendActivityCardProps {
    activity: NetworkEvent;
    onPress?: () => void;
}

export const FriendActivityCard: React.FC<FriendActivityCardProps> = ({ activity, onPress }) => {
    const getActionText = () => {
        switch (activity.action_type) {
            case 'going': return 'is going to';
            case 'interested': return 'is interested in';
            case 'reviewed': return 'reviewed';
            default: return 'is attending';
        }
    };

    return (
        <Pressable onPress={onPress} style={styles.container}>
            <View style={styles.header}>
                <Image
                    source={activity.friend_avatar ? { uri: activity.friend_avatar } : require('../../../assets/placeholder-user.png')}
                    style={styles.avatar}
                />
                <View style={styles.textContainer}>
                    <SynthText variant="meta" style={styles.activityText}>
                        <SynthText variant="meta" style={styles.bold}>{activity.friend_name}</SynthText>
                        {` ${getActionText()} `}
                        <SynthText variant="meta" style={styles.bold}>{activity.artist_name}</SynthText>
                    </SynthText>
                </View>
            </View>

            <View style={styles.eventPreview}>
                <Image
                    source={activity.image_url ? { uri: activity.image_url } : require('../../../assets/placeholder-event.png')}
                    style={styles.eventImage}
                />
                <View style={styles.eventInfo}>
                    <SynthText variant="meta" style={styles.bold} numberOfLines={1}>{activity.title}</SynthText>
                    <SynthText variant="meta" color="secondary" numberOfLines={1}>{activity.venue_name}</SynthText>
                </View>
            </View>
        </Pressable>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: SynthTokens.colors.neutral100,
        borderRadius: SynthTokens.radius.medium,
        padding: SynthTokens.spacing.md,
        marginHorizontal: SynthTokens.spacing.md,
        marginBottom: SynthTokens.spacing.lg,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SynthTokens.spacing.md,
    },
    avatar: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: SynthTokens.colors.neutral200,
    },
    textContainer: {
        marginLeft: SynthTokens.spacing.sm,
        flex: 1,
    },
    activityText: {
        lineHeight: 20,
    },
    bold: {
        fontWeight: 'bold',
    },
    eventPreview: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: SynthTokens.colors.neutral0,
        borderRadius: SynthTokens.radius.small,
        padding: SynthTokens.spacing.sm,
    },
    eventImage: {
        width: 48,
        height: 48,
        borderRadius: SynthTokens.radius.small,
    },
    eventInfo: {
        marginLeft: SynthTokens.spacing.sm,
        flex: 1,
    }
});
