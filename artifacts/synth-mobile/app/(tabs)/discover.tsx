import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

interface Artist {
  id: string;
  name: string;
  genre: string;
  upcomingShows: number;
  followers: string;
  following: boolean;
}

const ARTISTS: Artist[] = [
  { id: "1", name: "The Midnight", genre: "Synth-pop", upcomingShows: 3, followers: "1.2M", following: true },
  { id: "2", name: "Bonobo", genre: "Electronic", upcomingShows: 5, followers: "890K", following: false },
  { id: "3", name: "Cigarettes After Sex", genre: "Dream pop", upcomingShows: 2, followers: "2.1M", following: false },
  { id: "4", name: "Parcels", genre: "Indie", upcomingShows: 4, followers: "450K", following: true },
  { id: "5", name: "FKA twigs", genre: "Art pop", upcomingShows: 1, followers: "1.8M", following: false },
  { id: "6", name: "Beach House", genre: "Dream pop", upcomingShows: 6, followers: "780K", following: false },
  { id: "7", name: "ODESZA", genre: "Electronic", upcomingShows: 4, followers: "3.2M", following: true },
  { id: "8", name: "Phoebe Bridgers", genre: "Indie Folk", upcomingShows: 7, followers: "1.5M", following: false },
];

const GENRES = ["All", "Electronic", "Indie", "Pop", "Synth-pop", "Dream pop", "Folk"];

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [query, setQuery] = useState("");
  const [selectedGenre, setSelectedGenre] = useState("All");
  const [artists, setArtists] = useState<Artist[]>(ARTISTS);

  const filtered = artists.filter((a) => {
    const matchesQuery =
      !query || a.name.toLowerCase().includes(query.toLowerCase());
    const matchesGenre =
      selectedGenre === "All" || a.genre === selectedGenre;
    return matchesQuery && matchesGenre;
  });

  const toggleFollow = (id: string) => {
    setArtists((prev) =>
      prev.map((a) => (a.id === id ? { ...a, following: !a.following } : a))
    );
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
          placeholder="Search artists & venues"
          placeholderTextColor={colors.mutedForeground}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </Pressable>
        )}
      </View>

      <FlatList
        data={GENRES}
        horizontal
        keyExtractor={(g) => g}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.genreList}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setSelectedGenre(item)}
            style={[
              s.genreChip,
              selectedGenre === item && s.genreChipActive,
            ]}
          >
            <Text
              style={[
                s.genreChipText,
                selectedGenre === item && s.genreChipTextActive,
              ]}
            >
              {item}
            </Text>
          </Pressable>
        )}
      />

      <FlatList
        data={filtered}
        keyExtractor={(a) => a.id}
        contentContainerStyle={s.artistList}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.empty}>
            <Feather name="search" size={36} color={colors.mutedForeground} />
            <Text style={s.emptyText}>No results</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={s.artistCard}>
            <View style={s.artistAvatar}>
              <Text style={s.avatarInitial}>
                {item.name[0]}
              </Text>
            </View>
            <View style={s.artistInfo}>
              <Text style={s.artistName}>{item.name}</Text>
              <Text style={s.artistMeta}>
                {item.genre} · {item.upcomingShows} upcoming · {item.followers}
              </Text>
            </View>
            <Pressable
              onPress={() => toggleFollow(item.id)}
              style={[
                s.followBtn,
                item.following && s.followingBtn,
              ]}
            >
              <Text
                style={[
                  s.followText,
                  item.following && s.followingText,
                ]}
              >
                {item.following ? "Following" : "Follow"}
              </Text>
            </Pressable>
          </View>
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
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    title: {
      fontSize: 26,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      letterSpacing: -0.5,
    },
    searchWrapper: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 14,
      marginHorizontal: 20,
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
    genreList: {
      paddingHorizontal: 20,
      gap: 8,
      paddingBottom: 12,
    },
    genreChip: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    genreChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    genreChipText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
    },
    genreChipTextActive: {
      color: "#FFFFFF",
    },
    artistList: {
      paddingHorizontal: 20,
      paddingBottom: 100,
      gap: 8,
    },
    artistCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    artistAvatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primary + "33",
      alignItems: "center",
      justifyContent: "center",
    },
    avatarInitial: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
    artistInfo: {
      flex: 1,
      gap: 3,
    },
    artistName: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
    },
    artistMeta: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    followBtn: {
      paddingHorizontal: 16,
      paddingVertical: 7,
      borderRadius: 20,
      backgroundColor: colors.primary,
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
    followingText: {
      color: colors.mutedForeground,
    },
    empty: {
      alignItems: "center",
      paddingTop: 60,
      gap: 12,
    },
    emptyText: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
  });
