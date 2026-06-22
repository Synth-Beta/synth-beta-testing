import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { ChatItem, fetchChats } from "@/lib/queries";

const AVATAR_COLORS = [
  "#CC2486",
  "#8D1FF4",
  "#0EA5E9",
  "#22C55E",
  "#F59E0B",
];

function timeAgo(dateStr?: string): string {
  if (!dateStr) return "";
  const now = Date.now();
  const d = new Date(dateStr).getTime();
  const diff = Math.floor((now - d) / 1000);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const {
    data: chats = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ["chats", user?.id],
    queryFn: () => fetchChats(user!.id),
    enabled: !!user,
    refetchInterval: 30_000,
  });

  const s = styles(colors);

  return (
    <View style={[s.root, { paddingTop: topPad }]}>
      <View style={s.header}>
        <Text style={s.title}>Messages</Text>
        <Pressable hitSlop={8}>
          <Feather name="edit" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={s.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={chats}
          keyExtractor={(c) => c.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isRefetching}
          ItemSeparatorComponent={() => <View style={s.separator} />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather
                name="message-circle"
                size={40}
                color={colors.mutedForeground}
              />
              <Text style={s.emptyTitle}>No messages yet</Text>
              <Text style={s.emptySubtext}>
                Connect with people going to the same events
              </Text>
            </View>
          }
          renderItem={({ item, index }: { item: ChatItem; index: number }) => {
            const color = AVATAR_COLORS[index % AVATAR_COLORS.length];
            const hasUnread = item.unread > 0;
            return (
              <Pressable
                style={({ pressed }) => [
                  s.convoRow,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View
                  style={[s.avatar, { backgroundColor: color + "22" }]}
                >
                  <Text style={[s.avatarInitial, { color }]}>
                    {(item.chat_name ?? "?")[0].toUpperCase()}
                  </Text>
                </View>

                <View style={s.convoBody}>
                  <View style={s.convoTop}>
                    <Text style={s.convoName} numberOfLines={1}>
                      {item.chat_name}
                    </Text>
                    <Text style={s.convoTime}>
                      {timeAgo(item.latest_message_at)}
                    </Text>
                  </View>
                  {item.entity_type ? (
                    <Text style={s.entityTag} numberOfLines={1}>
                      {item.entity_type === "event"
                        ? "Event chat"
                        : item.entity_type === "artist"
                        ? "Artist chat"
                        : "Venue chat"}
                    </Text>
                  ) : null}
                  {item.latest_message ? (
                    <Text
                      style={[s.lastMsg, hasUnread && s.lastMsgUnread]}
                      numberOfLines={1}
                    >
                      {item.latest_sender
                        ? `${item.latest_sender}: ${item.latest_message}`
                        : item.latest_message}
                    </Text>
                  ) : (
                    <Text style={s.lastMsg}>No messages yet</Text>
                  )}
                </View>

                {hasUnread && (
                  <View style={s.badge}>
                    <Text style={s.badgeText}>{item.unread}</Text>
                  </View>
                )}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = (
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>
) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      letterSpacing: -0.5,
    },
    loading: { flex: 1, alignItems: "center", justifyContent: "center" },
    list: { paddingBottom: 112 },
    separator: { height: 1, backgroundColor: colors.border, marginLeft: 80 },
    convoRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 14,
      gap: 14,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarInitial: { fontSize: 20, fontFamily: "Inter_700Bold" },
    convoBody: { flex: 1, gap: 3 },
    convoTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    convoName: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
      flex: 1,
    },
    convoTime: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginLeft: 4,
    },
    entityTag: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    lastMsg: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    lastMsgUnread: {
      color: colors.text,
      fontFamily: "Inter_500Medium",
    },
    badge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    badgeText: {
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      color: "#FFFFFF",
    },
    empty: {
      alignItems: "center",
      paddingTop: 80,
      gap: 10,
      paddingHorizontal: 40,
    },
    emptyTitle: {
      fontSize: 16,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    emptySubtext: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
    },
  });
