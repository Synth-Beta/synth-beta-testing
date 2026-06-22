import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

interface Event {
  id: string;
  artist: string;
  venue: string;
  date: string;
  genre: string;
  friendsGoing: number;
  liked: boolean;
}

const MOCK_FEED: Event[] = [
  { id: "1", artist: "The Midnight", venue: "Brooklyn Steel", date: "Jul 12", genre: "Synth-pop", friendsGoing: 4, liked: false },
  { id: "2", artist: "Parcels", venue: "Music Hall of Williamsburg", date: "Jul 18", genre: "Indie", friendsGoing: 2, liked: true },
  { id: "3", artist: "Chrome Sparks", venue: "Elsewhere", date: "Jul 22", genre: "Electronic", friendsGoing: 6, liked: false },
  { id: "4", artist: "Phoebe Bridgers", venue: "Forest Hills Stadium", date: "Aug 3", genre: "Indie Folk", friendsGoing: 9, liked: false },
  { id: "5", artist: "ODESZA", venue: "Barclays Center", date: "Aug 10", genre: "Electronic", friendsGoing: 12, liked: true },
];

const GENRE_COLORS: Record<string, string> = {
  "Synth-pop": "#CC2486",
  "Indie": "#8D1FF4",
  "Electronic": "#0EA5E9",
  "Indie Folk": "#22C55E",
  "default": "#666666",
};

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<Event[]>(MOCK_FEED);
  const [refreshing, setRefreshing] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const onRefresh = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 800));
    setRefreshing(false);
  };

  const toggleLike = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, liked: !e.liked } : e))
    );
  };

  const genreColor = (genre: string) =>
    GENRE_COLORS[genre] ?? GENRE_COLORS.default;

  const s = styles(colors);

  return (
    <View style={[s.root, { paddingTop: topPad }]}>
      <View style={s.header}>
        <Text style={s.wordmark}>Synth</Text>
        <Pressable hitSlop={8}>
          <Feather name="bell" size={22} color={colors.mutedForeground} />
        </Pressable>
      </View>

      <FlatList
        data={events}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!!events.length}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <Text style={s.sectionTitle}>Upcoming near you</Text>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Feather name="calendar" size={40} color={colors.mutedForeground} />
            <Text style={s.emptyText}>No events yet</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [s.card, pressed && s.cardPressed]}
          >
            <View style={s.cardTop}>
              <View style={[s.genrePill, { backgroundColor: genreColor(item.genre) + "22" }]}>
                <Text style={[s.genreText, { color: genreColor(item.genre) }]}>
                  {item.genre}
                </Text>
              </View>
              <Pressable onPress={() => toggleLike(item.id)} hitSlop={8}>
                <Feather
                  name="heart"
                  size={20}
                  color={item.liked ? colors.primary : colors.mutedForeground}
                />
              </Pressable>
            </View>

            <Text style={s.artistName}>{item.artist}</Text>
            <Text style={s.venueName}>{item.venue}</Text>

            <View style={s.cardBottom}>
              <View style={s.dateRow}>
                <Feather name="calendar" size={13} color={colors.mutedForeground} />
                <Text style={s.dateText}>{item.date}</Text>
              </View>
              <View style={s.friendsRow}>
                <Feather name="users" size={13} color={colors.primary} />
                <Text style={s.friendsText}>{item.friendsGoing} going</Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

import { Platform } from "react-native";

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
    wordmark: {
      fontSize: 26,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      letterSpacing: -0.5,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      marginBottom: 12,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    list: {
      paddingHorizontal: 20,
      paddingBottom: 100,
      gap: 12,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 6,
    },
    cardPressed: {
      opacity: 0.8,
    },
    cardTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    genrePill: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
    },
    genreText: {
      fontSize: 12,
      fontFamily: "Inter_500Medium",
    },
    artistName: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.text,
    },
    venueName: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    cardBottom: {
      flexDirection: "row",
      gap: 16,
      marginTop: 8,
    },
    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    dateText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    friendsRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    friendsText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    empty: {
      alignItems: "center",
      paddingTop: 80,
      gap: 12,
    },
    emptyText: {
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
  });
