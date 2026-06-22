import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

interface Profile {
  id: string;
  full_name?: string;
  username?: string;
  avatar_url?: string;
  favorite_genres?: string[];
  bio?: string;
}

async function fetchSuggestedUsers(userId: string): Promise<Profile[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url, bio")
    .neq("id", userId)
    .limit(20);
  if (error) throw error;
  return data ?? [];
}

function UserCard({ profile, colors }: { profile: Profile; colors: any }) {
  const [connected, setConnected] = useState(false);

  const handleConnect = () => {
    setConnected(!connected);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const styles = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radius + 2,
      padding: 16,
      marginBottom: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 6,
      elevation: 2,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 14 },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      overflow: "hidden",
      backgroundColor: colors.muted,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarImg: { width: 52, height: 52 },
    avatarGrad: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
    avatarInitial: {
      fontSize: 20,
      fontFamily: "Inter_600SemiBold",
      color: "#FFFFFF",
    },
    info: { flex: 1 },
    name: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    handle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
    connectBtn: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      overflow: "hidden",
    },
    connectBtnConnected: {
      backgroundColor: colors.secondary,
    },
    connectBtnText: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: connected ? colors.primary : "#FFFFFF",
    },
    bio: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 10,
      lineHeight: 19,
    },
  });

  const initials = (profile.full_name ?? "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          {profile.avatar_url ? (
            <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} resizeMode="cover" />
          ) : (
            <LinearGradient colors={["#CC2486", "#8D1FF4"]} style={styles.avatarGrad}>
              <Text style={styles.avatarInitial}>{initials}</Text>
            </LinearGradient>
          )}
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={1}>{profile.full_name ?? "Synth User"}</Text>
          {profile.username ? (
            <Text style={styles.handle}>@{profile.username}</Text>
          ) : null}
        </View>
        <TouchableOpacity style={[styles.connectBtn, connected && styles.connectBtnConnected]} onPress={handleConnect}>
          {connected ? (
            <Text style={styles.connectBtnText}>Following</Text>
          ) : (
            <LinearGradient
              colors={["#CC2486", "#8D1FF4"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}
            >
              <Text style={[styles.connectBtnText, { color: "#FFFFFF" }]}>Follow</Text>
            </LinearGradient>
          )}
        </TouchableOpacity>
      </View>
      {profile.bio ? (
        <Text style={styles.bio} numberOfLines={2}>{profile.bio}</Text>
      ) : null}
    </View>
  );
}

export default function ConnectScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : 0;
  const { user } = useAuth();

  const { data: profiles, isLoading, error, refetch } = useQuery({
    queryKey: ["suggested-users", user?.id],
    queryFn: () => (user ? fetchSuggestedUsers(user.id) : Promise.resolve([])),
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
    },
    headerTitle: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
    subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 },
    list: { paddingHorizontal: 16, paddingTop: 14 },
    listFooter: { height: botPad + 100 },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" },
    signInPrompt: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      paddingHorizontal: 40,
    },
  });

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Connect</Text>
        </View>
        <View style={styles.signInPrompt}>
          <Feather name="users" size={44} color={colors.mutedForeground} />
          <Text style={styles.emptyTitle}>Find your people</Text>
          <Text style={styles.emptyText}>Sign in to connect with others going to the same shows.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Connect</Text>
        <Text style={styles.subtitle}>People who share your taste</Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={profiles ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <UserCard profile={item} colors={colors} />}
          contentContainerStyle={styles.list}
          ListFooterComponent={<View style={styles.listFooter} />}
          scrollEnabled={!!(profiles && profiles.length > 0)}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            error ? (
              <View style={styles.center}>
                <Feather name="wifi-off" size={36} color={colors.mutedForeground} />
                <Text style={styles.emptyText}>Couldn't load suggestions</Text>
              </View>
            ) : (
              <View style={styles.center}>
                <Feather name="users" size={36} color={colors.mutedForeground} />
                <Text style={styles.emptyTitle}>No suggestions yet</Text>
                <Text style={styles.emptyText}>Check back once more users join</Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}
