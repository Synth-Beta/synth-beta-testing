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
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import { Artist, fetchArtists, toggleArtistFollow } from "@/lib/queries";

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [query, setQuery] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: artists = [], isLoading } = useQuery({
    queryKey: ["artists", user?.id, query],
    queryFn: () => fetchArtists(user!.id, query),
    enabled: !!user,
    staleTime: 30_000,
  });

  const handleFollow = async (artist: Artist) => {
    if (!user || togglingId === artist.id) return;
    setTogglingId(artist.id);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await toggleArtistFollow(artist.id, !artist.following);
    await queryClient.invalidateQueries({ queryKey: ["artists"] });
    setTogglingId(null);
  };

  const s = styles(colors);

  return (
    <View style={[s.root, { paddingTop: topPad }]}>
      <View style={s.header}>
        <Text style={s.title}>Discover</Text>
      </View>

      <View style={s.searchWrapper}>
        <Feather name="search" size={16} color={colors.mutedForeground} />
        <TextInput
          style={s.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Search artists"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      {isLoading ? (
        <View style={s.loading}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={artists}
          keyExtractor={(a) => a.id}
          contentContainerStyle={s.artistList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.empty}>
              <Feather name="music" size={36} color={colors.mutedForeground} />
              <Text style={s.emptyText}>
                {query ? "No artists found" : "No artists yet"}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.artistCard}>
              <View style={s.artistAvatar}>
                {item.image_url ? null : (
                  <Text style={s.avatarInitial}>{item.name[0]}</Text>
                )}
              </View>
              <View style={s.artistInfo}>
                <Text style={s.artistName} numberOfLines={1}>
                  {item.name}
                </Text>
                {item.genre ? (
                  <Text style={s.artistGenre} numberOfLines={1}>
                    {item.genre}
                  </Text>
                ) : null}
              </View>
              <Pressable
                onPress={() => handleFollow(item)}
                disabled={togglingId === item.id}
                style={[s.followBtn, item.following && s.followingBtn]}
              >
                {togglingId === item.id ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text
                    style={[s.followText, item.following && s.followingText]}
                  >
                    {item.following ? "Following" : "Follow"}
                  </Text>
                )}
              </Pressable>
            </View>
          )}
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
    searchWrapper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      marginHorizontal: 20,
      marginTop: 12,
      marginBottom: 12,
      height: 44,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.text,
    },
    loading: { flex: 1, alignItems: "center", justifyContent: "center" },
    artistList: { paddingHorizontal: 20, paddingBottom: 112, gap: 8 },
    artistCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 10,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    artistAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.pink050,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarInitial: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
    artistInfo: { flex: 1, gap: 3 },
    artistName: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
    },
    artistGenre: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    followBtn: {
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: colors.primary,
      minWidth: 80,
      alignItems: "center",
    },
    followingBtn: {
      backgroundColor: "transparent",
      borderWidth: 1,
      borderColor: colors.border,
    },
    followText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: "#FFFFFF",
    },
    followingText: { color: colors.mutedForeground },
    empty: { alignItems: "center", paddingTop: 60, gap: 12 },
    emptyText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
  });
