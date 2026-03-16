import React, { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { ChatService, ChatThread } from '../../src/services/chatService';
import { supabase } from '../../src/integrations/supabase/client';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MessageSquare, Plus } from 'lucide-react-native';

export default function ChatListScreen() {
  const [chats, setChats] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    loadChats();
  }, []);

  const loadChats = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const data = await ChatService.getChats(user.id);
    setChats(data);
    setLoading(false);
  };

  const renderItem = ({ item }: { item: ChatThread }) => {
    const time = new Date(item.latest_message_at || '').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return (
      <Pressable
        onPress={() => router.push(`/chat/${item.id}`)}
        style={({ pressed }) => [styles.chatItem, pressed && styles.pressed]}
      >
        <View style={styles.avatarPlaceholder}>
          <MessageSquare size={24} color={SynthTokens.colors.neutral400} />
        </View>
        <View style={styles.chatInfo}>
          <View style={styles.titleRow}>
            <SynthText variant="meta" style={styles.bold}>{item.chat_name}</SynthText>
            <SynthText variant="meta" color="secondary" style={styles.timeText}>{time}</SynthText>
          </View>
          <SynthText variant="meta" color="secondary" numberOfLines={1}>{item.latest_message}</SynthText>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <SynthText variant="h1">Messages</SynthText>
        <Pressable style={styles.addButton}>
          <Plus size={24} color={SynthTokens.colors.neutral900} />
        </Pressable>
      </View>

      <FlatList
        data={chats}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <SynthText variant="body" color="secondary">No conversations yet.</SynthText>
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
    paddingVertical: SynthTokens.spacing.sm,
  },
  addButton: {
    padding: 8,
  },
  listContent: {
    paddingVertical: SynthTokens.spacing.md,
  },
  chatItem: {
    flexDirection: 'row',
    paddingHorizontal: SynthTokens.spacing.md,
    paddingVertical: SynthTokens.spacing.md,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: SynthTokens.colors.neutral100,
  },
  pressed: {
    backgroundColor: SynthTokens.colors.neutral100,
  },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: SynthTokens.colors.neutral100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatInfo: {
    flex: 1,
    marginLeft: SynthTokens.spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  bold: {
    fontWeight: 'bold',
  },
  timeText: {
    fontSize: 12,
  },
  empty: {
    padding: SynthTokens.spacing.xl,
    alignItems: 'center',
  }
});
