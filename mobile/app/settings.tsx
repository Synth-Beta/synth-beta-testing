import React from 'react';
import { View, StyleSheet, Pressable, ScrollView, Text } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ChevronLeft,
  User,
  Bell,
  Shield,
  CalendarDays,
  CircleHelp,
  Users,
  Music2,
  Heart,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.headerIcon} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerIcon} />
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <SynthText variant="meta" color="secondary" style={styles.groupLabel}>
          Menu
        </SynthText>
        <View style={styles.group}>
          <DrawerRow
            icon={<Users size={22} color={SynthTokens.colors.neutral900} />}
            label="Friends"
            onPress={() => router.push('/friend-requests')}
          />
          <DrawerRow
            icon={<Bell size={22} color={SynthTokens.colors.neutral900} />}
            label="Notifications"
            onPress={() => router.push('/notifications')}
          />
          <DrawerRow
            icon={<Music2 size={22} color={SynthTokens.colors.neutral900} />}
            label="Streaming Stats"
            onPress={() => router.push('/stats')}
          />
          <DrawerRow
            icon={<Heart size={22} color={SynthTokens.colors.neutral900} />}
            label="Interested"
            onPress={() => router.push('/my-events')}
          />
        </View>

        <SynthText variant="meta" color="secondary" style={styles.groupLabel}>
          Account
        </SynthText>
        <View style={styles.group}>
          <DrawerRow
            icon={<User size={22} color={SynthTokens.colors.neutral900} />}
            label="Edit profile"
            onPress={() => router.push('/profile-edit')}
          />
          <DrawerRow
            icon={<CalendarDays size={22} color={SynthTokens.colors.neutral900} />}
            label="My events"
            onPress={() => router.push('/my-events')}
          />
        </View>

        <SynthText variant="meta" color="secondary" style={styles.groupLabel}>
          Preferences
        </SynthText>
        <View style={styles.group}>
          <DrawerRow
            icon={<Bell size={22} color={SynthTokens.colors.neutral900} />}
            label="Notification preferences"
            onPress={() => router.push('/notifications')}
          />
          <DrawerRow icon={<Shield size={22} color={SynthTokens.colors.neutral900} />} label="Privacy & safety" />
        </View>

        <SynthText variant="meta" color="secondary" style={styles.groupLabel}>
          Support
        </SynthText>
        <View style={styles.group}>
          <DrawerRow icon={<CircleHelp size={22} color={SynthTokens.colors.neutral900} />} label="Help center" />
        </View>
      </ScrollView>
    </View>
  );
}

function DrawerRow({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={!onPress}>
      <View style={styles.rowLeft}>
        <View style={styles.rowIcon}>{icon}</View>
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      {onPress ? <Text style={styles.chevron}>{'>'}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  headerIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: SynthTokens.colors.neutral900 },
  body: { padding: SynthTokens.spacing.md, paddingBottom: 48, gap: 20 },
  groupLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: -8,
    marginTop: 4,
  },
  group: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
    overflow: 'hidden',
  },
  row: {
    minHeight: 56,
    paddingHorizontal: SynthTokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  rowIcon: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: SynthTokens.colors.neutral900,
  },
  chevron: {
    fontSize: 16,
    color: SynthTokens.colors.neutral400,
    fontWeight: '600',
  },
});
