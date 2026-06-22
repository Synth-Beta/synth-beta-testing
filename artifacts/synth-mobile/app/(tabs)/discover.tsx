import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";

interface SearchResult {
  id: string;
  name: string;
  type: "artist" | "venue" | "event";
  subtitle?: string;
  image_url?: string;
}

async function searchAll(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const q = `%${query}%`;
  const [artists, venues, events] = await Promise.all([
    supabase
      .from("artists")
      .select("id, name, genre, image_url")
      .ilike("name", q)
      .limit(8),
    supabase
      .from("venues")
      .select("id, name, city, image_url")
      .ilike("name", q)
      .limit(6),
    supabase
      .from("events")
      .select("id, title, venue_name, image_url")
      .ilike("title", q)
      .limit(10),
  ]);

  const results: SearchResult[] = [
    ...(artists.data ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      type: "artist" as const,
      subtitle: a.genre,
      image_url: a.image_url,
    })),
    ...(venues.data ?? []).map((v) => ({
      id: v.id,
      name: v.name,
      type: "venue" as const,
      subtitle: v.city,
      image_url: v.image_url,
    })),
    ...(events.data ?? []).map((e) => ({
      id: e.id,
      name: e.title,
      type: "event" as const,
      subtitle: e.venue_name,
      image_url: e.image_url,
    })),
  ];
  return results;
}

const TYPE_ICON: Record<string, string> = {
  artist: "user",
  venue: "map-pin",
  event: "calendar",
};

function ResultRow({ item, colors }: { item: SearchResult; colors: any }) {
  const styles = StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 14,
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 22,
      overflow: "hidden",
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarImg: { width: 44, height: 44 },
    avatarGrad: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
    info: { flex: 1 },
    name: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    sub: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
    badge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 12,
      backgroundColor: colors.secondary,
    },
    badgeText: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.primary },
  });

  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.7}>
      <View style={styles.avatar}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.avatarImg} resizeMode="cover" />
        ) : (
          <LinearGradient colors={["#CC2486", "#8D1FF4"]} style={styles.avatarGrad}>
            <Feather name={TYPE_ICON[item.type] as any} size={18} color="rgba(255,255,255,0.8)" />
          </LinearGradient>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        {item.subtitle ? <Text style={styles.sub} numberOfLines={1}>{item.subtitle}</Text> : null}
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{item.type}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function DiscoverScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : 0;
  const [query, setQuery] = useState("");

  const { data: results, isLoading } = useQuery({
    queryKey: ["search", query],
    queryFn: () => searchAll(query),
    enabled: query.trim().length > 0,
  });

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: topPad + 12,
      paddingBottom: 16,
      paddingHorizontal: 20,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: {
      fontSize: 24,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      marginBottom: 14,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.muted,
      borderRadius: colors.radius + 4,
      paddingHorizontal: 14,
      gap: 10,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    hint: { fontSize: 15, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    listFooter: { height: botPad + 100 },
  });

  const renderEmpty = () => {
    if (query.trim().length === 0) {
      return (
        <View style={styles.center}>
          <Feather name="search" size={40} color={colors.mutedForeground} />
          <Text style={styles.hint}>Search artists, venues & events</Text>
        </View>
      );
    }
    if (isLoading) return null;
    return (
      <View style={styles.center}>
        <Feather name="frown" size={36} color={colors.mutedForeground} />
        <Text style={styles.hint}>No results for "{query}"</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discover</Text>
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color={colors.mutedForeground} />
          <TextInput
            style={styles.searchInput}
            placeholder="Artists, venues, events..."
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")}>
              <Feather name="x" size={18} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {isLoading && query.trim().length > 0 ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={results ?? []}
          keyExtractor={(item) => `${item.type}-${item.id}`}
          renderItem={({ item }) => <ResultRow item={item} colors={colors} />}
          ListEmptyComponent={renderEmpty()}
          ListFooterComponent={<View style={styles.listFooter} />}
          scrollEnabled={!!(results && results.length > 0)}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}
