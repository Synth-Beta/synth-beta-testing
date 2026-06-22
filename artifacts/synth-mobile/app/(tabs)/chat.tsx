import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { FlatList } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

interface Conversation {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
  unread: number;
  event: string;
}

const CONVERSATIONS: Conversation[] = [
  { id: "1", name: "The Midnight crew", lastMessage: "Anyone need a +1?", time: "2m", unread: 3, event: "The Midnight @ Brooklyn Steel" },
  { id: "2", name: "Sam K.", lastMessage: "See you at ODESZA!", time: "14m", unread: 0, event: "ODESZA @ Barclays" },
  { id: "3", name: "ODESZA group", lastMessage: "Front row secured 🎉", time: "1h", unread: 7, event: "ODESZA @ Barclays" },
  { id: "4", name: "Alex R.", lastMessage: "Want to meet before the show?", time: "3h", unread: 1, event: "Bonobo @ Terminal 5" },
  { id: "5", name: "Phoebe fans", lastMessage: "Setlist predictions?", time: "1d", unread: 0, event: "Phoebe Bridgers @ Forest Hills" },
];

const AVATAR_COLORS = ["#CC2486", "#8D1FF4", "#0EA5E9", "#22C55E", "#F59E0B"];

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const s = styles(colors);

  return (
    <View style={[s.root, { paddingTop: topPad }]}>
      <View style={s.header}>
        <Text style={s.title}>Messages</Text>
        <Pressable hitSlop={8}>
          <Feather name="edit" size={20} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <FlatList
        data={CONVERSATIONS}
        keyExtractor={(c) => c.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={s.separator} />}
        ListEmptyComponent={
          <View style={s.empty}>
            <Feather name="message-circle" size={40} color={colors.mutedForeground} />
            <Text style={s.emptyText}>No messages yet</Text>
            <Text style={s.emptySubtext}>Connect with people going to the same events</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <Pressable
            style={({ pressed }) => [s.convoRow, pressed && { opacity: 0.7 }]}
          >
            <View
              style={[
                s.avatar,
                { backgroundColor: AVATAR_COLORS[index % AVATAR_COLORS.length] + "33" },
              ]}
            >
              <Text
                style={[
                  s.avatarInitial,
                  { color: AVATAR_COLORS[index % AVATAR_COLORS.length] },
                ]}
              >
                {item.name[0]}
              </Text>
            </View>

            <View style={s.convoBody}>
              <View style={s.convoTop}>
                <Text style={s.convoName}>{item.name}</Text>
                <Text style={s.convoTime}>{item.time}</Text>
              </View>
              <Text style={s.eventTag} numberOfLines={1}>
                {item.event}
              </Text>
              <Text
                style={[s.lastMsg, item.unread > 0 && s.lastMsgUnread]}
                numberOfLines={1}
              >
                {item.lastMessage}
              </Text>
            </View>

            {item.unread > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeText}>{item.unread}</Text>
              </View>
            )}
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = (colors: ReturnType<typeof import("@/hooks/useColors").useColors>) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    title: {
      fontSize: 26,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      letterSpacing: -0.5,
    },
    list: {
      paddingBottom: 100,
    },
    separator: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: 80,
    },
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
    avatarInitial: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
    },
    convoBody: {
      flex: 1,
      gap: 3,
    },
    convoTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    convoName: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
    },
    convoTime: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    eventTag: {
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
    emptyText: {
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
