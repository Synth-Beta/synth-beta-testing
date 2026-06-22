import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

interface ChatThread {
  id: string;
  other_user: {
    id: string;
    full_name?: string;
    avatar_url?: string;
  };
  last_message?: string;
  last_message_at?: string;
  unread?: number;
}

async function fetchChats(userId: string): Promise<ChatThread[]> {
  const { data, error } = await supabase
    .from("chats")
    .select(`
      id,
      last_message,
      last_message_at,
      user1_id,
      user2_id
    `)
    .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
    .order("last_message_at", { ascending: false })
    .limit(30);

  if (error) return [];
  if (!data) return [];

  const threads: ChatThread[] = await Promise.all(
    data.map(async (chat) => {
      const otherUserId = chat.user1_id === userId ? chat.user2_id : chat.user1_id;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("id", otherUserId)
        .single();

      return {
        id: chat.id,
        other_user: profile ?? { id: otherUserId },
        last_message: chat.last_message,
        last_message_at: chat.last_message_at,
      };
    })
  );

  return threads;
}

function TimeLabel({ iso }: { iso?: string }) {
  if (!iso) return null;
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const label = isToday
    ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return <Text style={{ fontSize: 12, color: "#8A8F98", fontFamily: "Inter_400Regular" }}>{label}</Text>;
}

function ThreadRow({ thread, colors }: { thread: ChatThread; colors: any }) {
  const initials = (thread.other_user.full_name ?? "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const styles = StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 14,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      overflow: "hidden",
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarImg: { width: 48, height: 48 },
    avatarGrad: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
    content: { flex: 1 },
    nameRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    name: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    preview: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 },
  });

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.7}>
      <View style={styles.avatar}>
        {thread.other_user.avatar_url ? (
          <Image source={{ uri: thread.other_user.avatar_url }} style={styles.avatarImg} resizeMode="cover" />
        ) : (
          <LinearGradient colors={["#CC2486", "#8D1FF4"]} style={styles.avatarGrad}>
            <Text style={styles.avatarText}>{initials}</Text>
          </LinearGradient>
        )}
      </View>
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{thread.other_user.full_name ?? "Synth User"}</Text>
          <TimeLabel iso={thread.last_message_at} />
        </View>
        {thread.last_message ? (
          <Text style={styles.preview} numberOfLines={1}>{thread.last_message}</Text>
        ) : (
          <Text style={styles.preview}>New conversation</Text>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : 0;
  const { user } = useAuth();

  const { data: threads, isLoading } = useQuery({
    queryKey: ["chats", user?.id],
    queryFn: () => (user ? fetchChats(user.id) : Promise.resolve([])),
    enabled: !!user,
  });

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 12,
      paddingBottom: 12,
      paddingHorizontal: 20,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
    listFooter: { height: botPad + 100 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", paddingHorizontal: 40 },
  });

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Chat</Text>
        </View>
        <View style={styles.center}>
          <Feather name="message-circle" size={44} color={colors.mutedForeground} />
          <Text style={styles.emptyTitle}>Your messages</Text>
          <Text style={styles.emptyText}>Sign in to chat with friends going to the same shows.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chat</Text>
        <Feather name="edit" size={22} color={colors.foreground} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={threads ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ThreadRow thread={item} colors={colors} />}
          ListFooterComponent={<View style={styles.listFooter} />}
          scrollEnabled={!!(threads && threads.length > 0)}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="message-circle" size={36} color={colors.mutedForeground} />
              <Text style={styles.emptyTitle}>No messages yet</Text>
              <Text style={styles.emptyText}>Connect with someone going to the same show to start chatting</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
