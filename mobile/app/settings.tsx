import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Text,
  Switch,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import {
  ChevronLeft,
  CheckCircle,
  Bell,
  Mail,
  Eye,
  EyeOff,
  User,
  Lock,
  Shield,
  UserX,
  LogOut,
  ChevronRight,
  Users,
  Music2,
  Heart,
  CalendarDays,
  CircleHelp,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { SynthText } from '../src/components/SynthText';
import { SynthTokens } from '../src/tokens/SynthTokens';
import { supabase } from '../src/integrations/supabase/client';
import { UserVisibilityService } from '../src/services/userVisibilityService';
import {
  getCurrentUserSettingsPreferences,
  updateCurrentUserSettingsPreferences,
} from '../src/services/userSettingsPreferencesService';
import { getExpoSiteUrl } from '../src/utils/siteUrl';

const PINK = SynthTokens.colors.brandPink500;

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const [isPublicProfile, setIsPublicProfile] = useState(true);
  const [hasProfilePicture, setHasProfilePicture] = useState(true);
  const [loadingVisibility, setLoadingVisibility] = useState(false);

  const [enablePush, setEnablePush] = useState(true);
  const [enableEmails, setEnableEmails] = useState(true);
  const [loadingPreferences, setLoadingPreferences] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setUserId(null);
      setLoading(false);
      return;
    }
    setUserId(user.id);
    setEmail(user.email ?? null);

    const vis = await UserVisibilityService.getUserVisibilitySettings(user.id);
    if (vis) {
      setIsPublicProfile(vis.is_public_profile);
      setHasProfilePicture(vis.has_avatar);
    }

    setLoadingPreferences(true);
    const prefs = await getCurrentUserSettingsPreferences();
    if (prefs) {
      setEnablePush(prefs.enable_push_notifications);
      setEnableEmails(prefs.enable_emails);
    }
    setLoadingPreferences(false);

    const { data: row } = await supabase
      .from('users')
      .select('name, avatar_url, verified')
      .eq('user_id', user.id)
      .maybeSingle();

    if (row) {
      setDisplayName(row.name || '');
      setAvatarUrl(row.avatar_url || null);
      setVerified(Boolean(row.verified));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const nameInitial = (displayName || email || 'U').trim().charAt(0).toUpperCase();

  const onTogglePublic = async (checked: boolean) => {
    if (!userId) return;
    const previous = isPublicProfile;
    setLoadingVisibility(true);
    try {
      if (checked) {
        const hasPic = await UserVisibilityService.hasProfilePicture(userId);
        if (!hasPic) {
          setHasProfilePicture(false);
          Alert.alert(
            'Profile photo required',
            'Add a profile photo before making your profile public.'
          );
          return;
        }
      }
      const ok = await UserVisibilityService.setProfileVisibility(userId, checked);
      if (!ok) {
        Alert.alert('Could not save', 'We could not update your profile visibility. Please try again.');
        return;
      }
      const prefs = await updateCurrentUserSettingsPreferences({ is_public_profile: checked });
      if (prefs) {
        setIsPublicProfile(checked);
      } else {
        await UserVisibilityService.setProfileVisibility(userId, previous);
        setIsPublicProfile(previous);
        Alert.alert(
          'Could not save',
          'Your account settings could not be synced. Visibility was reverted — please try again.'
        );
      }
    } catch (e) {
      console.error(e);
      try {
        await UserVisibilityService.setProfileVisibility(userId, previous);
      } catch {
        /* best-effort revert */
      }
      setIsPublicProfile(previous);
      Alert.alert('Could not save', 'Something went wrong. Please try again.');
    } finally {
      setLoadingVisibility(false);
    }
  };

  const onTogglePush = async (checked: boolean) => {
    if (!userId) return;
    const previous = enablePush;
    setLoadingPreferences(true);
    try {
      const updated = await updateCurrentUserSettingsPreferences({ enable_push_notifications: checked });
      if (updated) {
        setEnablePush(checked);
      } else {
        setEnablePush(previous);
        Alert.alert('Could not save', 'Push notification preference was not updated. Please try again.');
      }
    } catch (e) {
      console.error(e);
      setEnablePush(previous);
      Alert.alert('Could not save', 'Something went wrong. Please try again.');
    } finally {
      setLoadingPreferences(false);
    }
  };

  const onToggleEmails = async (checked: boolean) => {
    if (!userId) return;
    const previous = enableEmails;
    setLoadingPreferences(true);
    try {
      const updated = await updateCurrentUserSettingsPreferences({ enable_emails: checked });
      if (updated) {
        setEnableEmails(checked);
      } else {
        setEnableEmails(previous);
        Alert.alert('Could not save', 'Email preference was not updated. Please try again.');
      }
    } catch (e) {
      console.error(e);
      setEnableEmails(previous);
      Alert.alert('Could not save', 'Something went wrong. Please try again.');
    } finally {
      setLoadingPreferences(false);
    }
  };

  const onSignOut = async () => {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
    } finally {
      setSigningOut(false);
    }
  };

  const openHelp = () => {
    void WebBrowser.openBrowserAsync(getExpoSiteUrl());
  };

  if (loading) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={PINK} />
      </View>
    );
  }

  if (!userId) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.headerIcon} accessibilityLabel="Back">
            <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
          </Pressable>
          <Text style={styles.headerTitle}>Settings</Text>
          <View style={styles.headerIcon} />
        </View>
        <View style={styles.centered}>
          <SynthText variant="body" color="secondary">
            Sign in to manage settings.
          </SynthText>
        </View>
      </View>
    );
  }

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
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{nameInitial}</Text>
              </View>
            )}
          </View>
          <View style={styles.profileText}>
            <Text style={styles.profileName} numberOfLines={1}>
              {displayName || 'My Account'}
            </Text>
            {email ? (
              <SynthText variant="meta" color="secondary" numberOfLines={1}>
                {email}
              </SynthText>
            ) : null}
            {verified ? (
              <View style={styles.verifiedRow}>
                <CheckCircle size={14} color={SynthTokens.colors.success} />
                <Text style={styles.verifiedTxt}>Verified</Text>
              </View>
            ) : null}
          </View>
        </View>

        <SettingsSection title="Privacy & notifications" />
        <View style={styles.card}>
          <ToggleRow
            icon={isPublicProfile ? Eye : EyeOff}
            label="Public profile"
            description={isPublicProfile ? 'Visible to all users' : 'Only visible to friends'}
            value={isPublicProfile}
            onValueChange={onTogglePublic}
            disabled={loadingVisibility}
          />
          {!hasProfilePicture ? (
            <SynthText variant="meta" color="secondary" style={styles.warningNote}>
              Profile picture required to go public.
            </SynthText>
          ) : null}
          <RowDivider />
          <ToggleRow
            icon={Bell}
            label="Push notifications"
            description={enablePush ? 'Enabled' : 'Disabled'}
            value={enablePush}
            onValueChange={onTogglePush}
            disabled={loadingPreferences}
          />
          <RowDivider />
          <ToggleRow
            icon={Mail}
            label="Email notifications"
            description={enableEmails ? 'Enabled' : 'Disabled'}
            value={enableEmails}
            onValueChange={onToggleEmails}
            disabled={loadingPreferences}
          />
          <RowDivider />
          <NavRow
            icon={Shield}
            label="More privacy & safety"
            onPress={() => router.push('/settings/privacy')}
          />
        </View>

        <SettingsSection title="Shortcuts" />
        <View style={styles.card}>
          <NavRow icon={Users} label="Friends" onPress={() => router.push('/friend-requests')} />
          <RowDivider />
          <NavRow icon={Bell} label="Notifications" onPress={() => router.push('/notifications')} />
          <RowDivider />
          <NavRow icon={Music2} label="Streaming stats" onPress={() => router.push('/stats')} />
          <RowDivider />
          <NavRow icon={Heart} label="Interested" onPress={() => router.push('/interested-events')} />
          <RowDivider />
          <NavRow icon={CalendarDays} label="My events" onPress={() => router.push('/my-events')} />
        </View>

        <SettingsSection title="Account" />
        <View style={styles.card}>
          <NavRow icon={User} label="Edit profile" onPress={() => router.push('/profile-edit')} />
          <RowDivider />
          <NavRow icon={Lock} label="Security" onPress={() => router.push('/settings/security')} />
          <RowDivider />
          <NavRow
            icon={CheckCircle}
            label="Verification status"
            rightBadge={verified ? 'Verified' : undefined}
            onPress={() => router.push('/settings/verification')}
          />
          <RowDivider />
          <NavRow icon={Shield} label="Parental controls" onPress={() => router.push('/settings/parental')} />
        </View>

        <SettingsSection title="Support" />
        <View style={styles.card}>
          <NavRow icon={CircleHelp} label="Help center" onPress={openHelp} />
        </View>

        <SettingsSection title="Danger zone" />
        <View style={styles.card}>
          <NavRow
            icon={UserX}
            label="Delete account"
            danger
            onPress={() => router.push('/settings/delete-account')}
          />
        </View>

        <Pressable
          style={[styles.signOutBtn, signingOut && styles.signOutDisabled]}
          onPress={() => {
            Alert.alert('Sign out', 'Are you sure you want to sign out?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Sign out', style: 'destructive', onPress: () => void onSignOut() },
            ]);
          }}
          disabled={signingOut}
        >
          <LogOut size={20} color={SynthTokens.colors.neutral0} />
          <Text style={styles.signOutTxt}>{signingOut ? 'Signing out…' : 'Sign out'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function SettingsSection({ title }: { title: string }) {
  return (
    <SynthText variant="meta" color="secondary" style={styles.sectionLabel}>
      {title}
    </SynthText>
  );
}

function RowDivider() {
  return <View style={styles.divider} />;
}

function ToggleRow({
  icon: Icon,
  label,
  description,
  value,
  onValueChange,
  disabled,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  description: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.iconBubble}>
        <Icon size={20} color={PINK} />
      </View>
      <View style={styles.toggleMid}>
        <Text style={styles.rowTitle}>{label}</Text>
        <SynthText variant="meta" color="secondary">
          {description}
        </SynthText>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        trackColor={{ false: SynthTokens.colors.neutral200, true: SynthTokens.colors.brandPink050 }}
        thumbColor={value ? PINK : SynthTokens.colors.neutral0}
        ios_backgroundColor={SynthTokens.colors.neutral200}
      />
    </View>
  );
}

function NavRow({
  icon: Icon,
  label,
  onPress,
  danger,
  rightBadge,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  onPress: () => void;
  danger?: boolean;
  rightBadge?: string;
}) {
  return (
    <Pressable style={styles.navRow} onPress={onPress}>
      <View style={styles.iconBubble}>
        <Icon size={20} color={danger ? SynthTokens.colors.error : PINK} />
      </View>
      <Text style={[styles.rowTitle, danger && styles.dangerText]}>{label}</Text>
      {rightBadge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeTxt}>{rightBadge}</Text>
        </View>
      ) : null}
      <ChevronRight size={20} color={SynthTokens.colors.neutral400} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  headerIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: SynthTokens.colors.neutral900 },
  body: { padding: SynthTokens.spacing.md, paddingBottom: 48, gap: 12 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: SynthTokens.colors.brandPink050,
    borderWidth: 1,
    borderColor: 'rgba(204, 36, 134, 0.15)',
    marginBottom: 4,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: SynthTokens.colors.neutral0,
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarFallback: {
    flex: 1,
    backgroundColor: PINK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: { fontSize: 22, fontWeight: '800', color: SynthTokens.colors.neutral0 },
  profileText: { flex: 1, minWidth: 0 },
  profileName: { fontSize: 17, fontWeight: '700', color: SynthTokens.colors.neutral900 },
  verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  verifiedTxt: { fontSize: 12, fontWeight: '600', color: SynthTokens.colors.success },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: -4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: SynthTokens.colors.neutral200,
    marginLeft: 56,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  iconBubble: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: SynthTokens.colors.brandPink050,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleMid: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: SynthTokens.colors.neutral900, marginBottom: 2 },
  dangerText: { color: SynthTokens.colors.error },
  warningNote: { paddingHorizontal: 14, paddingBottom: 10, marginTop: -4 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#ecfdf5',
    marginRight: 4,
  },
  badgeTxt: { fontSize: 11, fontWeight: '700', color: '#047857' },
  signOutBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: PINK,
    paddingVertical: 14,
    borderRadius: 14,
  },
  signOutDisabled: { opacity: 0.6 },
  signOutTxt: { fontSize: 16, fontWeight: '700', color: SynthTokens.colors.neutral0 },
});
