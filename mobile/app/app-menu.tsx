import React, { useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Text,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  X,
  Users,
  Bell,
  Music2,
  Heart,
  Settings,
  Sparkles,
  Check,
} from 'lucide-react-native';
import { supabase } from '../src/integrations/supabase/client';
import { SynthTokens } from '../src/tokens/SynthTokens';

export default function AppMenuScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<string | null>(null);
  const [friendReqUnread, setFriendReqUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);

  useEffect(() => {
    const load = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      if (!user) return;

      const { data: row } = await supabase
        .from('users')
        .select('name, username, avatar_url, account_type')
        .eq('user_id', user.id)
        .maybeSingle();

      setName(row?.name || 'User');
      setUsername(row?.username ? `@${row.username}` : user.email?.split('@')[0] || '');
      setAvatarUrl(row?.avatar_url ?? null);
      setAccountType((row as { account_type?: string } | null)?.account_type ?? null);

      const { count: frCount } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
        .eq('type', 'friend_request');

      const { count: notifCount } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
        .neq('type', 'friend_request');

      setFriendReqUnread(frCount ?? 0);
      setNotifUnread(notifCount ?? 0);
    };
    void load();
  }, []);

  const close = () => router.back();

  const isVerifiedAdmin = accountType === 'admin';

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <View style={{ width: 40 }} />
        <Pressable onPress={close} style={styles.closeBtn} accessibilityLabel="Close menu">
          <X size={26} color={SynthTokens.colors.neutral900} />
        </Pressable>
      </View>

      <View style={styles.profileBlock}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.profileText}>
          <Text style={styles.profileName}>{name}</Text>
          <Text style={styles.profileHandle}>{username}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <MenuRow
          icon={<Users size={22} color={SynthTokens.colors.neutral900} />}
          label="Friend Requests"
          badge={friendReqUnread}
          onPress={() => {
            close();
            router.push('/friend-requests');
          }}
        />
        <MenuRow
          icon={<Bell size={22} color={SynthTokens.colors.neutral900} />}
          label="Notifications"
          badge={notifUnread}
          onPress={() => {
            close();
            router.push('/notifications');
          }}
        />
        <MenuRow
          icon={<Music2 size={22} color={SynthTokens.colors.neutral900} />}
          label="Streaming Stats"
          onPress={() => {
            close();
            router.push('/stats');
          }}
        />
        <MenuRow
          icon={<Heart size={22} color={SynthTokens.colors.neutral900} />}
          label="Interested"
          onPress={() => {
            close();
            router.push('/interested-events');
          }}
        />
        <MenuRow
          icon={<Settings size={22} color={SynthTokens.colors.neutral900} />}
          label="Settings"
          onPress={() => {
            close();
            router.push('/settings');
          }}
        />

        {isVerifiedAdmin ? (
          <View style={styles.verifiedCard}>
            <View style={styles.verifiedHeader}>
              <Sparkles size={18} color={SynthTokens.colors.brandPink500} />
              <Text style={styles.verifiedTitle}>Verified Account</Text>
            </View>
            <Text style={styles.verifiedBody}>
              Your admin account is verified and trusted by the Synth community.
            </Text>
            <View style={styles.verifiedCheck}>
              <Check size={28} color="#fff" strokeWidth={3} />
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function MenuRow({
  icon,
  label,
  badge,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.menuRow} onPress={onPress}>
      <View style={styles.menuIconWrap}>
        {icon}
        {badge != null && badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: SynthTokens.spacing.md,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SynthTokens.spacing.lg,
    paddingBottom: SynthTokens.spacing.xl,
    gap: 14,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: SynthTokens.colors.neutral100,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 22,
    fontWeight: '700',
    color: SynthTokens.colors.brandPink500,
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  profileHandle: {
    fontSize: 15,
    fontWeight: '500',
    color: SynthTokens.colors.neutral600,
    marginTop: 2,
  },
  scroll: {
    paddingHorizontal: SynthTokens.spacing.md,
    paddingBottom: 48,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
  },
  menuIconWrap: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: SynthTokens.colors.neutral0,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  menuLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: SynthTokens.colors.neutral900,
  },
  verifiedCard: {
    marginTop: SynthTokens.spacing.xl,
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 16,
    padding: SynthTokens.spacing.lg,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  verifiedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  verifiedTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  verifiedBody: {
    fontSize: 14,
    fontWeight: '500',
    color: SynthTokens.colors.neutral600,
    lineHeight: 20,
    marginBottom: SynthTokens.spacing.lg,
  },
  verifiedCheck: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#22C55E',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
