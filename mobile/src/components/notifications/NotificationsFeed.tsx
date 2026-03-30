import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SynthText } from '../SynthText';
import { SynthTokens } from '../../tokens/SynthTokens';
import { isFriendsHubNotificationType, resolveNotificationExpoPath } from '@synth/shared';
import { NotificationService, Notification } from '../../services/notificationService';
import { supabase } from '../../integrations/supabase/client';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, ChevronLeft, UserPlus, Heart, MessageSquare, Menu, Music2, MapPin } from 'lucide-react-native';

const PINK = SynthTokens.colors.brandPink500;

function formatTimeAgo(createdAt: string | null | undefined): string {
  if (!createdAt) return '—';

  const date = new Date(createdAt);
  const time = date.getTime();
  if (Number.isNaN(time)) return '—';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export type NotificationsFeedProps = {
  /** When true, this is the dedicated Friend Requests screen (filtered list + title). */
  friendsOnly: boolean;
};

export function NotificationsFeed({ friendsOnly }: NotificationsFeedProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyNotificationId, setBusyNotificationId] = useState<string | null>(null);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const title = friendsOnly ? 'Friends' : 'Notifications';

  const loadNotifications = useCallback(async (userRefresh: boolean) => {
    if (userRefresh) {
      setRefreshing(true);
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setNotifications([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const data = await NotificationService.getNotifications(user.id);
    const pruned = await NotificationService.pruneStaleFriendRequestNotifications(user.id, data);
    setNotifications(pruned);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadNotifications(false);
  }, [loadNotifications]);

  const onUserRefresh = useCallback(() => {
    void loadNotifications(true);
  }, [loadNotifications]);

  const listData = friendsOnly
    ? notifications.filter(n => isFriendsHubNotificationType(n.type))
    : notifications;

  const getIcon = (type: string) => {
    switch (type) {
      case 'friend_request':
        return <UserPlus size={20} color={PINK} />;
      case 'friend_accepted':
        return <UserPlus size={20} color={PINK} />;
      case 'review_liked':
        return <Heart size={20} color={SynthTokens.colors.error} />;
      case 'review_commented':
      case 'comment_replied':
        return <MessageSquare size={20} color={PINK} />;
      case 'message':
      case 'chat_message':
        return <MessageSquare size={20} color={PINK} />;
      case 'artist_new_event':
      case 'venue_new_event':
      case 'follows_new_events_summary':
      case 'bucket_list_new_events_summary':
      case 'friends_event_interest_summary':
        return <Music2 size={20} color={PINK} />;
      case 'event_interest':
      case 'friend_rsvp_going':
      case 'friend_rsvp_changed':
      case 'friend_review_posted':
      case 'friend_attended_same_event':
      case 'event_attendance_reminder':
      case 'event_reminder':
        return <MapPin size={20} color={PINK} />;
      default:
        return <Bell size={20} color={SynthTokens.colors.neutral600} />;
    }
  };

  const friendRequestId = (item: Notification): string | null => {
    const rid = item.data?.request_id;
    if (rid == null || rid === '') return null;
    return String(rid);
  };

  const removeFriendRequestFromList = (requestId: string) => {
    setNotifications(prev =>
      prev.filter(n => {
        if (n.type !== 'friend_request') return true;
        const rid = n.data?.request_id;
        return String(rid ?? '') !== String(requestId);
      })
    );
  };

  const handleAcceptFriendRequest = async (item: Notification) => {
    const requestId = friendRequestId(item);
    if (!requestId) {
      Alert.alert('Friend request', 'This notification is missing request details.');
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setBusyNotificationId(item.id);
    try {
      const res = await NotificationService.acceptFriendRequest(requestId);
      if (!res.ok) {
        Alert.alert('Could not accept', res.error ?? 'Please try again.');
        return;
      }
      await NotificationService.deleteFriendRequestNotification(user.id, requestId);
      removeFriendRequestFromList(requestId);
    } finally {
      setBusyNotificationId(null);
    }
  };

  const handleDeclineFriendRequest = async (item: Notification) => {
    const requestId = friendRequestId(item);
    if (!requestId) {
      Alert.alert('Friend request', 'This notification is missing request details.');
      return;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setBusyNotificationId(item.id);
    try {
      const res = await NotificationService.declineFriendRequest(requestId);
      if (!res.ok) {
        Alert.alert('Could not decline', res.error ?? 'Please try again.');
        return;
      }
      await NotificationService.deleteFriendRequestNotification(user.id, requestId);
      removeFriendRequestFromList(requestId);
    } finally {
      setBusyNotificationId(null);
    }
  };

  const renderItem = ({ item }: { item: Notification }) => {
    const time = formatTimeAgo(item.created_at);

    const requestId = friendRequestId(item);
    const showFriendActions = item.type === 'friend_request' && requestId;
    const busyHere = busyNotificationId === item.id;

    return (
      <View style={[styles.row, !item.is_read && styles.rowUnread]}>
        <Pressable
          onPress={async () => {
            if (item.type === 'friend_request') {
              await NotificationService.markAsRead(item.id);
              setNotifications(prev => prev.map(n => (n.id === item.id ? { ...n, is_read: true } : n)));
              const actorId =
                item.actor_user_id ||
                (item.data?.actor_user_id != null ? String(item.data.actor_user_id) : '');
              if (actorId) {
                router.push(`/user/${actorId}`);
              } else {
                router.push('/friend-requests');
              }
              return;
            }
            await NotificationService.markAsRead(item.id);
            setNotifications(prev => prev.map(n => (n.id === item.id ? { ...n, is_read: true } : n)));

            let dest = resolveNotificationExpoPath(item.type, item.data, {
              actorUserId: item.actor_user_id,
            });
            if (
              !dest &&
              (item.type === 'review_liked' ||
                item.type === 'review_commented' ||
                item.type === 'comment_replied')
            ) {
              const reviewId = item.data?.review_id;
              if (reviewId) dest = { path: `/review/${String(reviewId)}` };
            }
            if (dest?.path) {
              router.push(dest.path);
            }
          }}
          style={styles.rowMain}
        >
          <View style={styles.iconCircle}>{getIcon(item.type)}</View>
          <View style={styles.content}>
            <Text style={styles.rowTitle} numberOfLines={2}>
              {item.title || 'Notification'}
            </Text>
            {item.message ? (
              <Text style={styles.rowBody} numberOfLines={3}>
                {item.message}
              </Text>
            ) : null}
            <SynthText variant="meta" color="secondary" style={styles.timeText}>
              {time}
            </SynthText>
          </View>
        </Pressable>
        {showFriendActions ? (
          <View style={styles.friendActions}>
            <Pressable
              style={[styles.actionBtn, styles.acceptBtn]}
              disabled={busyHere}
              onPress={() => void handleAcceptFriendRequest(item)}
            >
              {busyHere ? (
                <ActivityIndicator color={SynthTokens.colors.neutral0} size="small" />
              ) : (
                <Text style={styles.acceptBtnText}>Accept</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.actionBtn, styles.declineBtn]}
              disabled={busyHere}
              onPress={() => void handleDeclineFriendRequest(item)}
            >
              <Text style={styles.declineBtnText}>Decline</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    );
  };

  const emptyMessage = friendsOnly ? 'No friend activity' : 'No notifications yet.';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBtn} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <Pressable style={styles.headerBtn} onPress={() => router.push('/app-menu')}>
          <Menu size={24} color={SynthTokens.colors.neutral900} />
        </Pressable>
      </View>

      <FlatList
        data={listData}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onUserRefresh} tintColor={PINK} />
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.empty}>
              <ActivityIndicator color={PINK} size="large" />
            </View>
          ) : (
            <View style={styles.empty}>
              <SynthText variant="body" color="secondary">
                {emptyMessage}
              </SynthText>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  listContent: {
    paddingBottom: 32,
  },
  row: {
    paddingVertical: 16,
    paddingHorizontal: SynthTokens.spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  rowMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  friendActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    marginLeft: 62,
  },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    backgroundColor: PINK,
  },
  acceptBtnText: {
    color: SynthTokens.colors.neutral0,
    fontWeight: '700',
    fontSize: 15,
  },
  declineBtn: {
    backgroundColor: SynthTokens.colors.neutral100,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  declineBtnText: {
    color: SynthTokens.colors.neutral900,
    fontWeight: '600',
    fontSize: 15,
  },
  rowUnread: {
    backgroundColor: SynthTokens.colors.brandPink050,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SynthTokens.colors.neutral50,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  content: {
    flex: 1,
    marginLeft: 14,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
    lineHeight: 22,
  },
  rowBody: {
    fontSize: 15,
    fontWeight: '500',
    color: SynthTokens.colors.neutral600,
    lineHeight: 21,
    marginTop: 4,
  },
  timeText: {
    fontSize: 13,
    marginTop: 4,
  },
  empty: {
    padding: SynthTokens.spacing.xl,
    alignItems: 'center',
  },
});
