import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

interface Person {
  id: string;
  name: string;
  mutualEvents: number;
  sharedArtists: string[];
  connected: boolean;
}

const PEOPLE: Person[] = [
  { id: "1", name: "Alex R.", mutualEvents: 3, sharedArtists: ["The Midnight", "Bonobo"], connected: false },
  { id: "2", name: "Sam K.", mutualEvents: 5, sharedArtists: ["ODESZA", "Parcels", "FKA twigs"], connected: true },
  { id: "3", name: "Jordan M.", mutualEvents: 2, sharedArtists: ["Beach House"], connected: false },
  { id: "4", name: "Casey L.", mutualEvents: 7, sharedArtists: ["Phoebe Bridgers", "Cigarettes After Sex"], connected: false },
  { id: "5", name: "Riley B.", mutualEvents: 4, sharedArtists: ["The Midnight", "Chrome Sparks"], connected: true },
  { id: "6", name: "Morgan T.", mutualEvents: 1, sharedArtists: ["Bonobo"], connected: false },
];

const AVATAR_COLORS = ["#CC2486", "#8D1FF4", "#0EA5E9", "#22C55E", "#F59E0B", "#EF4444"];

export default function ConnectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [people, setPeople] = useState<Person[]>(PEOPLE);

  const toggleConnect = (id: string) => {
    setPeople((prev) =>
      prev.map((p) => (p.id === id ? { ...p, connected: !p.connected } : p))
    );
  };

  const s = styles(colors);

  return (
    <View style={[s.root, { paddingTop: topPad }]}>
      <View style={s.header}>
        <Text style={s.title}>Connect</Text>
        <Text style={s.subtitle}>People going to the same events</Text>
      </View>

      <FlatList
        data={people}
        keyExtractor={(p) => p.id}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={s.empty}>
            <Feather name="users" size={40} color={colors.mutedForeground} />
            <Text style={s.emptyText}>No one found nearby</Text>
          </View>
        }
        renderItem={({ item, index }) => (
          <View style={s.card}>
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

            <View style={s.info}>
              <Text style={s.name}>{item.name}</Text>
              <View style={s.statsRow}>
                <View style={s.stat}>
                  <Feather name="calendar" size={12} color={colors.primary} />
                  <Text style={s.statText}>{item.mutualEvents} mutual events</Text>
                </View>
              </View>
              <Text style={s.artists} numberOfLines={1}>
                {item.sharedArtists.join(" · ")}
              </Text>
            </View>

            <Pressable
              onPress={() => toggleConnect(item.id)}
              style={({ pressed }) => [
                s.connectBtn,
                item.connected && s.connectedBtn,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Feather
                name={item.connected ? "user-check" : "user-plus"}
                size={16}
                color={item.connected ? colors.mutedForeground : "#FFFFFF"}
              />
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
      paddingTop: 12,
      paddingBottom: 16,
      gap: 4,
    },
    title: {
      fontSize: 26,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      letterSpacing: -0.5,
    },
    subtitle: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    list: {
      paddingHorizontal: 20,
      paddingBottom: 100,
      gap: 10,
    },
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 16,
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
    avatarInitial: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
    },
    info: {
      flex: 1,
      gap: 3,
    },
    name: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.text,
    },
    statsRow: {
      flexDirection: "row",
      gap: 12,
    },
    stat: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    statText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    artists: {
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
    },
    emptyText: {
      fontSize: 16,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
  });
