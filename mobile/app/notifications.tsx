import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList, Pressable, RefreshControl } from 'react-native';
import { Image } from 'expo-image';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { NotificationService, Notification } from '../src/services/notificationService';
import { supabase } from '../src/integrations/supabase/client';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, ChevronLeft, UserPlus, Heart, MessageSquare } from 'lucide-react-native';

export default function NotificationsScreen() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const router = useRouter();
    const insets = useSafeAreaInsets();

    useEffect(() => {
        loadNotifications();
    }, []);

    const loadNotifications = async () => {
        setRefreshing(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            setNotifications([]);
            setLoading(false);
            setRefreshing(false);
            return;
        }

        const data = await NotificationService.getNotifications(user.id);
        setNotifications(data);
        setLoading(false);
        setRefreshing(false);
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'friend_request': return <UserPlus size={18} color={SynthTokens.colors.brandPink500} />;
            case 'review_liked': return <Heart size={18} color={SynthTokens.colors.error} />;
            case 'message': return <MessageSquare size={18} color={SynthTokens.colors.brandPink500} />;
            default: return <Bell size={18} color={SynthTokens.colors.neutral400} />;
        }
    };

    const renderItem = ({ item }: { item: Notification }) => {
        const time = new Date(item.created_at).toLocaleDateString();

        return (
            <Pressable
                onPress={async () => {
                    await NotificationService.markAsRead(item.id);
                    setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: true } : n)));
                }}
                style={[styles.notificationItem, !item.is_read && styles.unreadItem]}
            >
                <View style={styles.iconContainer}>
                    {getIcon(item.type)}
                </View>
                <View style={styles.content}>
                    <SynthText variant="meta" style={styles.notificationText}>
                        <SynthText variant="meta" style={styles.bold}>{item.actor_name || 'Someone'}</SynthText>
                        {` ${item.type === 'friend_request' ? 'wants to be friends' : 'interacted with your post'}`}
                    </SynthText>
                    <SynthText variant="meta" color="secondary" style={styles.timeText}>{time}</SynthText>
                </View>
            </Pressable>
        );
    };

    return (
        <View style={styles.container}>
            <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <ChevronLeft size={24} color={SynthTokens.colors.neutral900} />
                </Pressable>
                <SynthText variant="h2" style={styles.headerTitle}>Notifications</SynthText>
                <View style={{ width: 40 }} />
            </View>

            <FlatList
                data={notifications}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                refreshControl={
                    <RefreshControl refreshing={refreshing} onRefresh={loadNotifications} tintColor={SynthTokens.colors.brandPink500} />
                }
                ListEmptyComponent={
                    !loading ? (
                        <View style={styles.empty}>
                            <SynthText variant="body" color="secondary">No new notifications.</SynthText>
                        </View>
                    ) : null
                }
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: SynthTokens.colors.neutral50,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SynthTokens.spacing.md,
        backgroundColor: SynthTokens.colors.neutral0,
        borderBottomWidth: 1,
        borderBottomColor: SynthTokens.colors.neutral200,
        paddingBottom: 8,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    listContent: {
        paddingVertical: SynthTokens.spacing.sm,
    },
    notificationItem: {
        flexDirection: 'row',
        padding: SynthTokens.spacing.md,
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: SynthTokens.colors.neutral100,
        backgroundColor: SynthTokens.colors.neutral0,
    },
    unreadItem: {
        backgroundColor: SynthTokens.colors.brandPink050,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: SynthTokens.colors.neutral100,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        flex: 1,
        marginLeft: SynthTokens.spacing.md,
    },
    notificationText: {
        lineHeight: 20,
    },
    bold: {
        fontWeight: 'bold',
    },
    timeText: {
        fontSize: 12,
        marginTop: 2,
    },
    empty: {
        padding: SynthTokens.spacing.xl,
        alignItems: 'center',
    }
});
