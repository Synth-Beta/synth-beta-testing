import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";

interface Profile {
  id: string;
  full_name?: string;
  username?: string;
  avatar_url?: string;
  bio?: string;
  location?: string;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, username, avatar_url, bio, location")
    .eq("id", userId)
    .single();
  return data ?? null;
}

function StatBox({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground }}>{value}</Text>
      <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : 0;
  const { user, signOut } = useAuth();

  const { data: profile, isLoading } = useQuery({
    queryKey: ["my-profile", user?.id],
    queryFn: () => (user ? fetchProfile(user.id) : Promise.resolve(null)),
    enabled: !!user,
  });

  const handleSignOut = () => {
    Alert.alert("Sign Out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          await signOut();
        },
      },
    ]);
  };

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
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
    scroll: { flex: 1 },
    heroGradient: {
      height: 140,
      width: "100%",
    },
    avatarContainer: {
      alignItems: "center",
      marginTop: -40,
      marginBottom: 12,
    },
    avatarRing: {
      width: 84,
      height: 84,
      borderRadius: 42,
      borderWidth: 3,
      borderColor: colors.background,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 4,
    },
    avatarImg: { width: 80, height: 80 },
    avatarGrad: { width: 80, height: 80, alignItems: "center", justifyContent: "center" },
    avatarInitial: { fontSize: 32, fontFamily: "Inter_700Bold", color: "#FFFFFF" },
    name: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, textAlign: "center" },
    handle: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginTop: 2 },
    bio: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      paddingHorizontal: 32,
      lineHeight: 20,
      marginTop: 8,
    },
    statsRow: {
      flexDirection: "row",
      backgroundColor: colors.card,
      marginHorizontal: 20,
      borderRadius: colors.radius + 2,
      paddingVertical: 16,
      marginTop: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    divider: { width: 1, backgroundColor: colors.border },
    section: { marginHorizontal: 20, marginTop: 24 },
    sectionTitle: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 12,
    },
    menuRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 14,
    },
    menuLabel: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.foreground },
    signOutBtn: {
      marginHorizontal: 20,
      marginTop: 32,
      marginBottom: botPad + 100,
      borderWidth: 1,
      borderColor: colors.destructive,
      borderRadius: colors.radius,
      paddingVertical: 14,
      alignItems: "center",
    },
    signOutText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.destructive },
    signInPrompt: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      paddingHorizontal: 40,
    },
    emptyTitle: { fontSize: 18, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center" },
  });

  if (!user) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <View style={styles.signInPrompt}>
          <Feather name="user" size={44} color={colors.mutedForeground} />
          <Text style={styles.emptyTitle}>Your profile</Text>
          <Text style={styles.emptyText}>Sign in to see your concert history, friends, and more.</Text>
        </View>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  const displayName = profile?.full_name ?? user.email ?? "Synth User";
  const initials = displayName.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <Feather name="settings" size={22} color={colors.foreground} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={["#CC2486", "#8D1FF4"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.heroGradient}
        />
        <View style={styles.avatarContainer}>
          <View style={styles.avatarRing}>
            {profile?.avatar_url ? (
              <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} resizeMode="cover" />
            ) : (
              <LinearGradient colors={["#CC2486", "#8D1FF4"]} style={styles.avatarGrad}>
                <Text style={styles.avatarInitial}>{initials}</Text>
              </LinearGradient>
            )}
          </View>
        </View>

        <Text style={styles.name}>{displayName}</Text>
        {profile?.username ? <Text style={styles.handle}>@{profile.username}</Text> : null}
        {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

        <View style={styles.statsRow}>
          <StatBox label="Events" value="0" colors={colors} />
          <View style={styles.divider} />
          <StatBox label="Friends" value="0" colors={colors} />
          <View style={styles.divider} />
          <StatBox label="Artists" value="0" colors={colors} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          {[
            { icon: "user" as const, label: "Edit Profile" },
            { icon: "heart" as const, label: "Liked Events" },
            { icon: "music" as const, label: "Followed Artists" },
            { icon: "map-pin" as const, label: "Followed Venues" },
          ].map((item) => (
            <TouchableOpacity key={item.label} style={styles.menuRow} activeOpacity={0.7}>
              <Feather name={item.icon} size={20} color={colors.foreground} />
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
