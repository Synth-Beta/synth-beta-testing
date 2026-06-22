import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
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
import { ConnectUser, fetchConnectUsers, sendFriendRequest } from "@/lib/queries";

const AVATAR_COLORS = [
  "#CC2486",
  "#8D1FF4",
  "#0EA5E9",
  "#22C55E",
  "#F59E0B",
  "#EF4444",
];

export default function ConnectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [sendingId, setSendingId] = useState<string | null>(null);

  const { data: people = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["connect-users", user?.id],
    queryFn: () => fetchConnectUsers(user!.id),
    enabled: !!user,
    staleTime: 60_000,
  });

  const handleConnect = async (person: ConnectUser) => {
    if (!user || sendingId === person.user_id || person.connected) return;
    setSendingId(person.user_id);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await sendFriendRequest(user.id, person.user_id);
    await queryClient.invalidateQueries({ queryKey: ["connect-users"] });
    setSendingId(null);
  };

  const s = styles(colors);

  return (
    <View style={[s.root, { paddingTop: topPad }]}>
      <View style={s.header}>
        <Text style={s.title}>Connect</Text>
        <Text style={s.subtitle}>People going to the same events</Text>
      </View>

      {isLoading ? (
        <View style={s.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={people}
          keyExtractor={(p) => p.user_id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="users" size={40} color={colors.mutedForeground} />
              <Text style={s.emptyTitle}>No one found yet</Text>
              <Text style={s.emptySubtext}>
                Save events you're going to and we'll find people with the same taste
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
            const isSending = sendingId === item.user_id;
            return (
              <View style={s.card}>
                <View
                  style={[
                    s.avatar,
                    { backgroundColor: avatarColor + "22" },
                  ]}
                >
                  <Text style={[s.avatarInitial, { color: avatarColor }]}>
                    {(item.name ?? "?")[0].toUpperCase()}
                  </Text>
                </View>

                <View style={s.info}>
                  <Text style={s.name} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <View style={s.statsRow}>
                    <Feather
                      name="calendar"
                      size={12}
                      color={colors.primary}
                    />
                    <Text style={s.statText}>
                      {item.shared_events}{" "}
                      {item.shared_events === 1
                        ? "shared event"
                        : "shared events"}
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={() => handleConnect(item)}
                  disabled={isSending || item.connected}
                  style={({ pressed }) => [
                    s.connectBtn,
                    item.connected && s.connectedBtn,
                    pressed && !item.connected && { opacity: 0.8 },
                  ]}
                >
                  {isSending ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Feather
                      name={item.connected ? "user-check" : "user-plus"}
                      size={16}
                      color={
                        item.connected ? colors.mutedForeground : "#FFFFFF"
                      }
                    />
                  )}
                </Pressable>
              </View>
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
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 16,
      gap: 4,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 28,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    loading: { flex: 1, alignItems: "center", justifyContent: "center" },
    list: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 112, gap: 10 },
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarInitial: { fontSize: 20, fontFamily: "Inter_700Bold" },
    info: { flex: 1, gap: 4 },
    name: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
    },
    statsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    statText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    connectBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    connectedBtn: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    empty: {
      alignItems: "center",
      paddingTop: 80,
      gap: 12,
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
