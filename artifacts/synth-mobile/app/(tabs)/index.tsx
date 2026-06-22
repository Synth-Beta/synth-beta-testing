import { Feather } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  FeedEvent,
  fetchFeedEvents,
  setEventRelationship,
} from "@/lib/queries";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [savingId, setSavingId] = useState<string | null>(null);

  const {
    data: events = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["feed-events", user?.id],
    queryFn: () => fetchFeedEvents(user!.id),
    enabled: !!user,
  });

  const handleInterest = async (event: FeedEvent) => {
    if (!user || savingId === event.event_id) return;
    setSavingId(event.event_id);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next =
      event.my_relationship === "interested" ? null : "interested";
    await setEventRelationship(user.id, event.event_id, next);
    await queryClient.invalidateQueries({ queryKey: ["feed-events"] });
    setSavingId(null);
  };

  const s = styles(colors);

  return (
    <View style={[s.root, { paddingTop: topPad }]}>
      <View style={s.header}>
        <Text style={s.wordmark}>Synth</Text>
        <Pressable hitSlop={8}>
          <Feather name="bell" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {isLoading ? (
        <View style={s.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.event_id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!!events.length}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            events.length > 0 ? (
              <Text style={s.sectionTitle}>Upcoming events</Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="calendar" size={40} color={colors.mutedForeground} />
              <Text style={s.emptyTitle}>No upcoming events</Text>
              <Text style={s.emptySubtext}>
                Events from your network will appear here
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const interested = item.my_relationship === "interested";
            return (
              <Pressable
                style={({ pressed }) => [
                  s.card,
                  pressed && s.cardPressed,
                ]}
              >
                <View style={s.cardTop}>
                  <View style={s.artistRow}>
                    <View style={s.artistDot} />
                    <Text style={s.artistName} numberOfLines={1}>
                      {item.artist_name}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => handleInterest(item)}
                    hitSlop={8}
                    disabled={savingId === item.event_id}
                  >
                    <Feather
                      name="heart"
                      size={20}
                      color={
                        interested ? colors.primary : colors.mutedForeground
                      }
                    />
                  </Pressable>
                </View>

                <Text style={s.eventTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Text style={s.venueName} numberOfLines={1}>
                  {item.venue_name}
                  {item.venue_city ? ` · ${item.venue_city}` : ""}
                </Text>

                <View style={s.cardBottom}>
                  <View style={s.dateRow}>
                    <Feather
                      name="calendar"
                      size={13}
                      color={colors.mutedForeground}
                    />
                    <Text style={s.dateText}>
                      {formatDate(item.event_date)}
                    </Text>
                  </View>
                  {item.friends_going > 0 && (
                    <View style={s.friendsRow}>
                      <Feather name="users" size={13} color={colors.primary} />
                      <Text style={s.friendsText}>
                        {item.friends_going}{" "}
                        {item.friends_going === 1 ? "going" : "going"}
                      </Text>
                    </View>
                  )}
                </View>
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
    },
    wordmark: {
      fontSize: 26,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      letterSpacing: -0.5,
    },
    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginBottom: 12,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    list: { paddingHorizontal: 20, paddingBottom: 100, gap: 12 },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    cardPressed: { opacity: 0.8 },
    cardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    artistRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
    artistDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    artistName: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
      flex: 1,
    },
    eventTitle: {
      fontSize: 19,
      fontFamily: "Inter_700Bold",
      color: colors.text,
    },
    venueName: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    cardBottom: { flexDirection: "row", gap: 16, marginTop: 8 },
    dateRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    dateText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    friendsRow: { flexDirection: "row", alignItems: "center", gap: 4 },
    friendsText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    empty: { alignItems: "center", paddingTop: 80, gap: 12, paddingHorizontal: 40 },
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
