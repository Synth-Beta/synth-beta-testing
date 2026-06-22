import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

interface Event {
  id: string;
  title: string;
  artist_name?: string;
  venue_name?: string;
  event_date?: string;
  image_url?: string;
  genre?: string;
  going_count?: number;
}

async function fetchFeed(): Promise<Event[]> {
  const { data, error } = await supabase
    .from("events")
    .select("id, title, artist_name, venue_name, event_date, image_url, genre")
    .order("event_date", { ascending: true })
    .limit(40);
  if (error) throw error;
  return data ?? [];
}

function EventCard({ event }: { event: Event }) {
  const colors = useColors();
  const [liked, setLiked] = useState(false);

  const handleLike = () => {
    setLiked(!liked);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const dateStr = event.event_date
    ? new Date(event.event_date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 2,
      marginBottom: 16,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 3,
    },
    imageContainer: { width: "100%", height: 200, backgroundColor: colors.muted },
    image: { width: "100%", height: "100%" },
    imagePlaceholder: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    gradient: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: 80,
    },
    dateBadge: {
      position: "absolute",
      top: 12,
      left: 12,
      backgroundColor: colors.primary,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    dateBadgeText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: "#FFFFFF",
    },
    likeBtn: {
      position: "absolute",
      top: 12,
      right: 12,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(0,0,0,0.4)",
      alignItems: "center",
      justifyContent: "center",
    },
    body: { padding: 14 },
    title: {
      fontSize: 17,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 4,
    },
    meta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    metaText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    genreChip: {
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 3,
      backgroundColor: colors.secondary,
      marginLeft: "auto",
    },
    genreText: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
  });

  return (
    <View style={styles.card}>
      <View style={styles.imageContainer}>
        {event.image_url ? (
          <Image source={{ uri: event.image_url }} style={styles.image} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={["#CC2486", "#8D1FF4"]}
            style={[styles.image, styles.imagePlaceholder]}
          >
            <Feather name="music" size={40} color="rgba(255,255,255,0.6)" />
          </LinearGradient>
        )}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.3)"]}
          style={styles.gradient}
        />
        {dateStr && (
          <View style={styles.dateBadge}>
            <Text style={styles.dateBadgeText}>{dateStr}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.likeBtn} onPress={handleLike}>
          <Feather name="heart" size={16} color={liked ? "#FF5B8D" : "#FFFFFF"} />
        </TouchableOpacity>
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
        <View style={styles.meta}>
          {event.venue_name ? (
            <>
              <Feather name="map-pin" size={12} color={colors.mutedForeground} />
              <Text style={styles.metaText} numberOfLines={1}>{event.venue_name}</Text>
            </>
          ) : null}
          {event.genre ? (
            <View style={styles.genreChip}>
              <Text style={styles.genreText}>{event.genre}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

export default function FeedScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : 0;

  const { data: events, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["events-feed"],
    queryFn: fetchFeed,
  });

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 12,
      paddingBottom: 12,
      paddingHorizontal: 20,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
    },
    headerRight: { flexDirection: "row", gap: 12 },
    list: { paddingHorizontal: 16, paddingTop: 16 },
    listFooter: { height: botPad + 100 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    errorText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.destructive },
    retryBtn: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: colors.primary,
      borderRadius: colors.radius,
    },
    retryText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: "#FFFFFF" },
  });

  const renderEmpty = () => {
    if (isLoading) return null;
    if (error) {
      return (
        <View style={styles.center}>
          <Feather name="wifi-off" size={36} color={colors.mutedForeground} />
          <Text style={styles.errorText}>Couldn't load events</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.center}>
        <Feather name="calendar" size={36} color={colors.mutedForeground} />
        <Text style={styles.emptyTitle}>No events yet</Text>
        <Text style={styles.emptyText}>Check back soon for concerts near you</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Synth</Text>
        <View style={styles.headerRight}>
          <Feather name="bell" size={22} color={colors.foreground} />
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={events ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EventCard event={item} />}
          contentContainerStyle={styles.list}
          ListFooterComponent={<View style={styles.listFooter} />}
          ListEmptyComponent={renderEmpty()}
          scrollEnabled={!!(events && events.length > 0)}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}
