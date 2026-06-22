import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React from "react";
import {
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

interface StatItem {
  label: string;
  value: string;
}

const STATS: StatItem[] = [
  { label: "Events", value: "23" },
  { label: "Friends", value: "48" },
  { label: "Artists", value: "12" },
];

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

  const displayName = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? "Synth User";
  const email = user?.email ?? "";

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

      <View style={s.avatarSection}>
        <View style={s.avatarLarge}>
          <Text style={s.avatarLargeInitial}>
            {displayName[0]?.toUpperCase() ?? "S"}
          </Text>
        </View>
        <Text style={s.displayName}>{displayName}</Text>
        {email ? <Text style={s.emailText}>{email}</Text> : null}
        <Pressable style={s.editBtn}>
          <Text style={s.editBtnText}>Edit Profile</Text>
        </Pressable>
      </View>

      <View style={s.statsRow}>
        {STATS.map((stat) => (
          <View key={stat.label} style={s.statItem}>
            <Text style={s.statValue}>{stat.value}</Text>
            <Text style={s.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={s.section}>
        <Text style={s.sectionTitle}>Settings</Text>
        <View style={s.settingsCard}>
          {settings.map((row, i) => (
            <React.Fragment key={row.label}>
              <Pressable
                onPress={row.action}
                style={({ pressed }) => [s.settingRow, pressed && { opacity: 0.7 }]}
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
                    color={row.danger ? colors.destructive : colors.primary}
                  />
                </View>
                <Text
                  style={[s.settingLabel, row.danger && s.settingLabelDanger]}
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

const styles = (colors: ReturnType<typeof import("@/hooks/useColors").useColors>) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      paddingBottom: 120,
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
    avatarSection: {
      alignItems: "center",
      paddingVertical: 24,
      gap: 8,
    },
    avatarLarge: {
      width: 88,
      height: 88,
      borderRadius: 44,
      backgroundColor: colors.primary + "33",
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
    editBtn: {
      paddingHorizontal: 20,
      paddingVertical: 8,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      marginTop: 4,
    },
    editBtnText: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.text,
    },
    statsRow: {
      flexDirection: "row",
      marginHorizontal: 20,
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      justifyContent: "space-around",
      marginBottom: 24,
    },
    statItem: {
      alignItems: "center",
      gap: 4,
    },
    statValue: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.text,
    },
    statLabel: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    section: {
      paddingHorizontal: 20,
      gap: 12,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      letterSpacing: 0.5,
      textTransform: "uppercase",
    },
    settingsCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    settingRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 14,
    },
    settingIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.primary + "22",
      alignItems: "center",
      justifyContent: "center",
    },
    settingIconDanger: {
      backgroundColor: colors.destructive + "22",
    },
    settingLabel: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.text,
    },
    settingLabelDanger: {
      color: colors.destructive,
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginLeft: 62,
    },
  });
