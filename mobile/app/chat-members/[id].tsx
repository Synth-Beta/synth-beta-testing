import React, { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Pressable,
  Text,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createFriendRequest } from '@synth/shared';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';

const PINK = SynthTokens.colors.brandPink500;

type FriendStatus = 'none' | 'pending' | 'friends';

type MemberRow = {
  user_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
};

type FriendStatusMaps = {
  statusByUserId: Record<string, FriendStatus>;
  pendingRequestIdByUserId: Record<string, string>;
};

async function loadFriendStatuses(
  currentUserId: string,
  memberIds: string[]
): Promise<FriendStatusMaps> {
  const others = memberIds.filter((id) => id && id !== currentUserId);
  const statusByUserId: Record<string, FriendStatus> = {};
  const pendingRequestIdByUserId: Record<string, string> = {};
  others.forEach((id) => {
    statusByUserId[id] = 'none';
  });
  if (others.length === 0) return { statusByUserId, pendingRequestIdByUserId };

  const [{ data: sent }, { data: received }] = await Promise.all([
    supabase
      .from('user_relationships')
      .select('id, related_user_id, status')
      .eq('user_id', currentUserId)
      .eq('relationship_type', 'friend')
      .in('status', ['pending', 'accepted'])
      .in('related_user_id', others),
    supabase
      .from('user_relationships')
      .select('id, user_id, status')
      .eq('related_user_id', currentUserId)
      .eq('relationship_type', 'friend')
      .in('status', ['pending', 'accepted'])
      .in('user_id', others),
  ]);

  sent?.forEach((row: { id: string; related_user_id: string; status: string }) => {
    const id = String(row.related_user_id);
    if (!(id in statusByUserId)) return;
    if (row.status === 'accepted') {
      statusByUserId[id] = 'friends';
      return;
    }
    statusByUserId[id] = 'pending';
    if (row.id) pendingRequestIdByUserId[id] = String(row.id);
  });
  received?.forEach((row: { id: string; user_id: string; status: string }) => {
    const id = String(row.user_id);
    if (!(id in statusByUserId)) return;
    if (statusByUserId[id] === 'friends') return;
    if (row.status === 'accepted') {
      statusByUserId[id] = 'friends';
      return;
    }
    // Incoming pending still shows "Pending", but only outgoing requests are cancelable.
    statusByUserId[id] = 'pending';
  });

  return { statusByUserId, pendingRequestIdByUserId };
}

export default function ChatMembersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const chatId = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';

  const [selfId, setSelfId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [friendStatusByUserId, setFriendStatusByUserId] = useState<Record<string, FriendStatus>>({});
  const [pendingRequestIdByUserId, setPendingRequestIdByUserId] = useState<Record<string, string>>(
    {}
  );
  const [sendingUserIds, setSendingUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!chatId) {
      setMembers([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    setSelfId(user?.id ?? null);

    try {
      const { data: participants, error: participantsError } = await supabase
        .from('chat_participants')
        .select('user_id, joined_at')
        .eq('chat_id', chatId)
        .order('joined_at', { ascending: true });

      if (participantsError) {
        setMembers([]);
        return;
      }

      const participantIds = (participants || [])
        .map((p: { user_id: string }) => p.user_id)
        .filter(Boolean);

      if (participantIds.length === 0) {
        setMembers([]);
        setFriendStatusByUserId({});
        setPendingRequestIdByUserId({});
        return;
      }

      const { data: userRows } = await supabase
        .from('users')
        .select('user_id, name, username, avatar_url')
        .in('user_id', participantIds);

      const byId = new Map((userRows || []).map((u: any) => [u.user_id, u]));
      const list: MemberRow[] = participantIds.map((pid: string) => {
        const row = byId.get(pid);
        const name =
          (typeof row?.name === 'string' && row.name.trim()) ||
          (typeof row?.username === 'string' && row.username.trim()
            ? row.username.trim()
            : 'User');
        return {
          user_id: pid,
          name,
          username: typeof row?.username === 'string' ? row.username : null,
          avatar_url: typeof row?.avatar_url === 'string' ? row.avatar_url : null,
        };
      });

      setMembers(list);
      if (user?.id) {
        const maps = await loadFriendStatuses(user.id, participantIds);
        setFriendStatusByUserId(maps.statusByUserId);
        setPendingRequestIdByUserId(maps.pendingRequestIdByUserId);
      } else {
        setFriendStatusByUserId({});
        setPendingRequestIdByUserId({});
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [chatId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const handleAddFriend = useCallback(
    async (userId: string) => {
      if (!selfId || !userId || userId === selfId) return;
      if (friendStatusByUserId[userId] && friendStatusByUserId[userId] !== 'none') return;
      if (sendingUserIds.has(userId)) return;

      setSendingUserIds((prev) => new Set(prev).add(userId));
      try {
        const result = await createFriendRequest(supabase as any, userId);
        if (result.ok || result.kind === 'business') {
          let requestId = result.ok ? result.requestId ?? null : null;
          if (!requestId && selfId) {
            const { data } = await supabase
              .from('user_relationships')
              .select('id')
              .eq('user_id', selfId)
              .eq('related_user_id', userId)
              .eq('relationship_type', 'friend')
              .eq('status', 'pending')
              .maybeSingle();
            requestId = data?.id ? String(data.id) : null;
          }
          setFriendStatusByUserId((prev) => ({ ...prev, [userId]: 'pending' }));
          if (requestId) {
            setPendingRequestIdByUserId((prev) => ({ ...prev, [userId]: requestId! }));
          }
        }
      } catch (e) {
        console.warn('[chat-members] add friend failed', e);
      } finally {
        setSendingUserIds((prev) => {
          const next = new Set(prev);
          next.delete(userId);
          return next;
        });
      }
    },
    [selfId, friendStatusByUserId, sendingUserIds]
  );

  const confirmAndCancelPending = useCallback(
    (userId: string, displayName: string) => {
      const requestId = pendingRequestIdByUserId[userId];
      if (!requestId) return;

      Alert.alert(
        `Are you sure you want to cancel your friend request to ${displayName}?`,
        undefined,
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  const { error } = await supabase.rpc('cancel_friend_request', {
                    request_id: requestId,
                  });
                  if (!error) {
                    setFriendStatusByUserId((prev) => ({ ...prev, [userId]: 'none' }));
                    setPendingRequestIdByUserId((prev) => {
                      const next = { ...prev };
                      delete next[userId];
                      return next;
                    });
                  }
                } catch (e) {
                  console.warn('[chat-members] cancel friend request failed', e);
                }
              })();
            },
          },
        ]
      );
    },
    [pendingRequestIdByUserId]
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </Pressable>
        <SynthText variant="h2">Members</SynthText>
        <View style={styles.back} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={PINK} />
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.list}
          style={styles.listFill}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={PINK}
            />
          }
          ListEmptyComponent={
            <SynthText variant="body" color="secondary" style={styles.empty}>
              No members found.
            </SynthText>
          }
          renderItem={({ item }) => {
            const isSelf = !!selfId && item.user_id === selfId;
            const status = isSelf ? 'friends' : friendStatusByUserId[item.user_id] || 'none';
            const sending = sendingUserIds.has(item.user_id);
            const usernameLabel = item.username
              ? item.username.startsWith('@')
                ? item.username
                : `@${item.username}`
              : null;

            return (
              <Pressable
                style={styles.row}
                onPress={() => router.push(`/user/${item.user_id}` as any)}
                accessibilityLabel={`Open ${item.name}'s profile`}
              >
                {item.avatar_url ? (
                  <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarInitials}>
                      {item.name
                        .split(' ')
                        .map((n) => n[0])
                        .join('')
                        .slice(0, 2)
                        .toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.textCol}>
                  <Text style={styles.name} numberOfLines={1}>
                    {item.name}
                    {isSelf ? <Text style={styles.you}> (You)</Text> : null}
                  </Text>
                  {usernameLabel ? (
                    <Text style={styles.username} numberOfLines={1}>
                      {usernameLabel}
                    </Text>
                  ) : null}
                </View>

                {!isSelf && status === 'none' ? (
                  <Pressable
                    onPress={() => void handleAddFriend(item.user_id)}
                    disabled={sending}
                    style={[styles.addBtn, sending && styles.addBtnDisabled]}
                    accessibilityLabel={`Add ${item.name} as a friend`}
                  >
                    {sending ? (
                      <ActivityIndicator size="small" color="#FFFDFA" />
                    ) : (
                      <Text style={styles.addBtnTxt}>Add Friend</Text>
                    )}
                  </Pressable>
                ) : null}

                {!isSelf && status === 'pending' ? (
                  pendingRequestIdByUserId[item.user_id] ? (
                    <Pressable
                      onPress={() => confirmAndCancelPending(item.user_id, item.name)}
                      style={styles.pendingBtn}
                      accessibilityLabel={`Cancel pending friend request to ${item.name}`}
                    >
                      <Text style={styles.pendingTxt}>Pending</Text>
                    </Pressable>
                  ) : (
                    <View style={styles.pendingBtn} pointerEvents="none">
                      <Text style={styles.pendingTxt}>Pending</Text>
                    </View>
                  )
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingVertical: SynthTokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: SynthTokens.colors.neutral200,
    backgroundColor: '#FFFFFF',
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  listFill: { flex: 1, backgroundColor: '#FFFFFF' },
  list: { paddingBottom: 40, backgroundColor: '#FFFFFF' },
  empty: { paddingTop: 24, textAlign: 'center', paddingHorizontal: 20 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: SynthTokens.spacing.screenMarginX,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
    backgroundColor: '#FFFFFF',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: SynthTokens.colors.neutral200,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: PINK,
  },
  avatarInitials: {
    color: '#FFFDFA',
    fontWeight: '700',
    fontSize: 14,
  },
  textCol: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 2,
  },
  you: { color: SynthTokens.colors.neutral600, fontWeight: '500' },
  username: {
    fontSize: 14,
    fontWeight: '500',
    color: SynthTokens.colors.neutral600,
  },
  addBtn: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: PINK,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 96,
  },
  addBtnDisabled: { opacity: 0.7 },
  addBtnTxt: { color: '#FFFDFA', fontWeight: '700', fontSize: 13 },
  pendingBtn: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingTxt: {
    color: SynthTokens.colors.neutral600,
    fontWeight: '600',
    fontSize: 13,
  },
});
