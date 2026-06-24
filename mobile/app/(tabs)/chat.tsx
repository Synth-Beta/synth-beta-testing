import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { Image } from 'expo-image';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { ChatService, ChatThread } from '../../src/services/chatService';
import { supabase } from '../../src/integrations/supabase/client';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Menu, Trash2 } from 'lucide-react-native';
import { bottomSafeContentPadding } from '../../src/components/navigation/SynthTabBar';

const PINK = SynthTokens.colors.brandPink500;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function ChatListScreen() {
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const loadChats = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const data = await ChatService.getChats(user.id);
    setChats(data);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadChats();
  }, [loadChats]);

  useFocusEffect(
    useCallback(() => {
      void loadChats();
    }, [loadChats])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void loadChats();
  };

  const confirmDelete = (item: ChatThread) => {
    Alert.alert('Remove chat', `Remove "${item.chat_name}" from your list?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const {
            data: { session: leaveSession },
          } = await supabase.auth.getSession();
          const user = leaveSession?.user ?? null;
          if (!user) return;
          const ok = await ChatService.leaveChat(item.id, user.id);
          if (ok) setChats(prev => prev.filter(c => c.id !== item.id));
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: ChatThread }) => {
    const preview =
      item.latest_message && item.latest_message !== 'No messages yet'
        ? item.latest_message
        : 'No messages yet';

    return (
      <Pressable
        onPress={() =>
            router.push({
                pathname: '/chat/[id]',
                params: { id: item.id, title: item.chat_name },
            })
        }
        style={({ pressed }) => [styles.chatItem, pressed && styles.pressed]}
      >
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <View style={[styles.avatarImg, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitials}>{initials(item.chat_name)}</Text>
          </View>
        )}
        <View style={styles.chatInfo}>
          <SynthText variant="meta" style={styles.name}>
            {item.chat_name}
          </SynthText>
          <SynthText variant="meta" color="secondary" numberOfLines={1} style={styles.preview}>
            {preview}
          </SynthText>
        </View>
        <Pressable
          onPress={e => {
            e.stopPropagation();
            confirmDelete(item);
          }}
          style={styles.trashBtn}
          hitSlop={8}
        >
          <Trash2 size={20} color={SynthTokens.colors.neutral400} />
        </Pressable>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <SynthText variant="h1" style={styles.title}>
          Messages
        </SynthText>
        <Pressable
          style={styles.menuBtn}
          onPress={() => router.push('/app-menu')}
          accessibilityRole="button"
          accessibilityLabel="Open app menu"
        >
          <Menu size={24} color={SynthTokens.colors.neutral900} />
        </Pressable>
      </View>

      <TouchableOpacity
        style={styles.newChat}
        activeOpacity={0.9}
        onPress={() => router.push('/new-chat' as any)}
      >
        <SynthText variant="meta" style={styles.newChatText}>
          New Chat +
        </SynthText>
      </TouchableOpacity>

      <FlatList
        data={chats}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: bottomSafeContentPadding(insets.bottom) },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={PINK} />
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <SynthText variant="body" color="secondary">
                No conversations yet.
              </SynthText>
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
    backgroundColor: SynthTokens.colors.neutral0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.md,
    paddingVertical: SynthTokens.spacing.sm,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  menuBtn: {
    padding: 8,
  },
  newChat: {
    marginHorizontal: SynthTokens.spacing.md,
    marginBottom: SynthTokens.spacing.md,
    backgroundColor: PINK,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PINK,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  newChatText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 17,
  },
  listContent: {},
  chatItem: {
    flexDirection: 'row',
    paddingHorizontal: SynthTokens.spacing.md,
    paddingVertical: 14,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  pressed: {
    backgroundColor: SynthTokens.colors.neutral50,
  },
  avatarImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: SynthTokens.colors.neutral100,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(204, 36, 134, 0.12)',
  },
  avatarInitials: {
    fontSize: 18,
    fontWeight: '700',
    color: PINK,
  },
  chatInfo: {
    flex: 1,
    marginLeft: SynthTokens.spacing.md,
  },
  name: {
    fontWeight: '700',
    fontSize: 16,
    color: SynthTokens.colors.neutral900,
    marginBottom: 4,
  },
  preview: {
    fontSize: 14,
  },
  trashBtn: {
    padding: 8,
  },
  empty: {
    padding: SynthTokens.spacing.xl,
    alignItems: 'center',
  },
});
