import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, User, Bell, Shield, CalendarDays, CircleHelp } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </TouchableOpacity>
        <SynthText variant="h2">Settings</SynthText>
        <View style={styles.back} />
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.section}>
          <SynthText variant="meta" color="secondary" style={styles.sectionTitle}>Account</SynthText>
          <SettingsRow icon={<User size={18} color={SynthTokens.colors.neutral900} />} label="Edit profile" onPress={() => router.push('/profile-edit')} />
          <SettingsRow icon={<CalendarDays size={18} color={SynthTokens.colors.neutral900} />} label="My events" onPress={() => router.push('/my-events')} />
        </View>

        <View style={styles.section}>
          <SynthText variant="meta" color="secondary" style={styles.sectionTitle}>Preferences</SynthText>
          <SettingsRow icon={<Bell size={18} color={SynthTokens.colors.neutral900} />} label="Notifications" onPress={() => router.push('/notifications')} />
          <SettingsRow icon={<Shield size={18} color={SynthTokens.colors.neutral900} />} label="Privacy & safety" />
        </View>

        <View style={styles.section}>
          <SynthText variant="meta" color="secondary" style={styles.sectionTitle}>Support</SynthText>
          <SettingsRow icon={<CircleHelp size={18} color={SynthTokens.colors.neutral900} />} label="Help center" />
        </View>
      </ScrollView>
    </View>
  );
}

function SettingsRow({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress?: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowLeft}>
        <View style={styles.rowIcon}>{icon}</View>
        <SynthText variant="meta">{label}</SynthText>
      </View>
      <SynthText variant="meta" color="secondary">{'>'}</SynthText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingVertical: SynthTokens.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  body: { padding: SynthTokens.spacing.lg, paddingBottom: 48, gap: SynthTokens.spacing.lg },
  section: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: SynthTokens.radius.large,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    overflow: 'hidden',
  },
  sectionTitle: {
    padding: SynthTokens.spacing.md,
    paddingBottom: 8,
  },
  row: {
    minHeight: 52,
    paddingHorizontal: SynthTokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: SynthTokens.colors.neutral100,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowIcon: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
