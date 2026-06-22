import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import React from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";
import {
  fetchProfile,
  fetchProfileStats,
} from "@/lib/queries";

interface SettingRow {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  action?: () => void;
  danger?: boolean;
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => fetchProfile(user!.id),
    enabled: !!user,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["profile-stats", user?.id],
    queryFn: () => fetchProfileStats(user!.id),
    enabled: !!user,
  });

  const displayName =
    profile?.name ??
    user?.user_metadata?.full_name ??
    user?.email?.split("@")[0] ??
    "Synth User";
  const email = user?.email ?? "";
  const initial = displayName[0]?.toUpperCase() ?? "S";

  const handleSignOut = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await signOut();
  };

  const settings: SettingRow[] = [
    { icon: "bell", label: "Notifications" },
    { icon: "map-pin", label: "Location & Radius" },
    { icon: "music", label: "Music Taste" },
    { icon: "shield", label: "Privacy" },
    { icon: "help-circle", label: "Help & Feedback" },
    { icon: "log-out", label: "Sign Out", action: handleSignOut, danger: true },
  ];

  const statItems = [
    { label: "Reviews", value: stats?.reviews ?? 0 },
    { label: "Events", value: stats?.events ?? 0 },
    { label: "Friends", value: stats?.friends ?? 0 },
  ];

  const s = styles(colors);

  return (
    <ScrollView
      style={[s.root, { paddingTop: topPad }]}
      contentContainerStyle={s.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.header}>
        <Text style={s.title}>Profile</Text>
      </View>

      {profileLoading ? (
        <View style={s.loadingSection}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <View style={s.avatarSection}>
          <View style={s.avatarLarge}>
            <Text style={s.avatarLargeInitial}>{initial}</Text>
          </View>
          <Text style={s.displayName}>{displayName}</Text>
          {email ? <Text style={s.emailText}>{email}</Text> : null}
          {profile?.bio ? (
            <Text style={s.bioText} numberOfLines={2}>
              {profile.bio}
            </Text>
          ) : null}
          <Pressable style={s.editBtn}>
            <Text style={s.editBtnText}>Edit Profile</Text>
          </Pressable>
        </View>
      )}

      {statsLoading ? (
        <View style={[s.statsRow, { justifyContent: "center" }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <View style={s.statsRow}>
          {statItems.map((stat) => (
            <View key={stat.label} style={s.statItem}>
              <Text style={s.statValue}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={s.section}>
        <Text style={s.sectionTitle}>Settings</Text>
        <View style={s.settingsCard}>
          {settings.map((row, i) => (
            <React.Fragment key={row.label}>
              <Pressable
                onPress={row.action}
                style={({ pressed }) => [
                  s.settingRow,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View
                  style={[
                    s.settingIcon,
                    row.danger && s.settingIconDanger,
                  ]}
                >
                  <Feather
                    name={row.icon}
                    size={16}
                    color={
                      row.danger ? colors.destructive : colors.primary
                    }
                  />
                </View>
                <Text
                  style={[
                    s.settingLabel,
                    row.danger && s.settingLabelDanger,
                  ]}
                >
                  {row.label}
                </Text>
                {!row.danger && (
                  <Feather
                    name="chevron-right"
                    size={16}
                    color={colors.mutedForeground}
                  />
                )}
              </Pressable>
              {i < settings.length - 1 && <View style={s.divider} />}
            </React.Fragment>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = (
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>
) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    scroll: { paddingBottom: 112 },
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
    loadingSection: {
      height: 180,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarSection: {
      alignItems: "center",
      paddingVertical: 24,
      gap: 8,
    },
    avatarLarge: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.pink050,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 2,
      borderColor: colors.primary,
    },
    avatarLargeInitial: {
      fontSize: 36,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
    displayName: {
      fontSize: 20,
      fontFamily: "Inter_700Bold",
      color: colors.text,
      marginTop: 4,
    },
    emailText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    bioText: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      paddingHorizontal: 32,
    },
    editBtn: {
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primary,
      marginTop: 4,
    },
    editBtnText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    statsRow: {
      flexDirection: "row",
      marginHorizontal: 20,
      backgroundColor: colors.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      justifyContent: "space-around",
      marginBottom: 24,
      minHeight: 70,
      alignItems: "center",
    },
    statItem: { alignItems: "center", gap: 4 },
    statValue: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
    },
    statLabel: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    section: { paddingHorizontal: 20, gap: 12 },
    sectionTitle: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    settingsCard: {
      backgroundColor: colors.card,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      height: 48,
      gap: 14,
    },
    settingIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.pink050,
      alignItems: "center",
      justifyContent: "center",
    },
    settingIconDanger: { backgroundColor: "#FDECEA" },
    settingLabel: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.text,
    },
    settingLabelDanger: { color: colors.destructive },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: 62,
    },
  });
