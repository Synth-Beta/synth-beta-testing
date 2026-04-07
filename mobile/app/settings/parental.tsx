import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, Shield, MessageSquare, Eye, EyeOff, Info } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';

const PINK = SynthTokens.colors.brandPink500;

interface Controls {
  parental_controls_enabled: boolean;
  dm_restricted: boolean;
  is_public_profile: boolean;
}

export default function ParentalControlsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [isMinor, setIsMinor] = useState(false);
  const [controls, setControls] = useState<Controls>({
    parental_controls_enabled: false,
    dm_restricted: false,
    is_public_profile: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data } = await supabase
        .from('users')
        .select('is_minor, parental_controls_enabled, dm_restricted, is_public_profile')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setIsMinor(Boolean(data.is_minor));
        setControls({
          parental_controls_enabled: Boolean(data.parental_controls_enabled),
          dm_restricted: Boolean(data.dm_restricted),
          is_public_profile: data.is_public_profile !== false,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggle = async (field: keyof Controls, value: boolean) => {
    if (!userId) return;
    const prev = controls[field];
    setControls(c => ({ ...c, [field]: value }));
    setSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ [field]: value, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error;
    } catch (e: any) {
      setControls(c => ({ ...c, [field]: prev }));
      Alert.alert('Could not save', e?.message || 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.iconBtn}>
            <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
          </Pressable>
          <Text style={styles.title}>Parental Controls</Text>
          <View style={styles.iconBtn} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={PINK} />
        </View>
      </View>
    );
  }

  const showControls = controls.parental_controls_enabled || isMinor;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </Pressable>
        <Text style={styles.title}>Parental Controls</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.topRow}>
          <Shield size={22} color={PINK} />
          <View style={styles.topText}>
            <Text style={styles.pageTitle}>Parental Controls</Text>
            <SynthText variant="meta" color="secondary">
              Manage safety settings and content restrictions for your account
            </SynthText>
          </View>
        </View>

        {showControls ? (
          <>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Shield size={18} color={PINK} />
                <Text style={styles.cardTitle}>Safety Controls</Text>
              </View>
              <SynthText variant="meta" color="secondary" style={styles.cardDesc}>
                {isMinor
                  ? 'These controls are automatically enabled for accounts under 18. You can adjust them below.'
                  : 'Enable these controls to restrict content and interactions on your account.'}
              </SynthText>

              {/* DM Restriction */}
              <View style={styles.toggleItem}>
                <View style={[styles.itemIconWrap, { backgroundColor: '#f3e8ff' }]}>
                  <MessageSquare size={18} color="#9333ea" />
                </View>
                <View style={styles.itemText}>
                  <Text style={styles.itemLabel}>Restrict Direct Messages</Text>
                  <SynthText variant="meta" color="secondary" style={styles.itemDesc}>
                    Only allow DMs from users you follow back
                  </SynthText>
                </View>
                <Switch
                  value={controls.dm_restricted}
                  onValueChange={v => void handleToggle('dm_restricted', v)}
                  disabled={saving}
                  trackColor={{ false: SynthTokens.colors.neutral200, true: 'rgba(204,36,134,0.25)' }}
                  thumbColor={controls.dm_restricted ? PINK : SynthTokens.colors.neutral0}
                  ios_backgroundColor={SynthTokens.colors.neutral200}
                />
              </View>

              <View style={styles.itemDivider} />

              {/* Private Account */}
              <View style={styles.toggleItem}>
                <View style={[styles.itemIconWrap, { backgroundColor: '#fef9c3' }]}>
                  {controls.is_public_profile
                    ? <Eye size={18} color="#ca8a04" />
                    : <EyeOff size={18} color="#ca8a04" />}
                </View>
                <View style={styles.itemText}>
                  <Text style={styles.itemLabel}>Private Account</Text>
                  <SynthText variant="meta" color="secondary" style={styles.itemDesc}>
                    Only approved followers can view your profile
                  </SynthText>
                </View>
                <Switch
                  value={!controls.is_public_profile}
                  onValueChange={v => void handleToggle('is_public_profile', !v)}
                  disabled={saving}
                  trackColor={{ false: SynthTokens.colors.neutral200, true: 'rgba(204,36,134,0.25)' }}
                  thumbColor={!controls.is_public_profile ? PINK : SynthTokens.colors.neutral0}
                  ios_backgroundColor={SynthTokens.colors.neutral200}
                />
              </View>
            </View>

            {/* Info banner */}
            <View style={styles.infoCard}>
              <Info size={16} color="#3b82f6" style={{ marginTop: 1, flexShrink: 0 }} />
              <View style={styles.infoText}>
                <Text style={styles.infoTitle}>About Parental Controls</Text>
                <SynthText variant="meta" style={styles.infoBody}>
                  These controls help protect your account by restricting who can contact you and what content you see.
                  {isMinor ? ' As an account under 18, these controls are automatically enabled for your safety.' : ''}
                </SynthText>
              </View>
            </View>
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Shield size={44} color={SynthTokens.colors.neutral400} />
            <Text style={styles.emptyTitle}>Parental Controls Not Enabled</Text>
            <SynthText variant="meta" color="secondary" style={styles.emptyDesc}>
              Parental controls are available for accounts under 18 or can be manually enabled to restrict DMs and make your profile private.
            </SynthText>
            <Pressable
              style={[styles.enableBtn, saving && styles.btnDisabled]}
              onPress={() => void handleToggle('parental_controls_enabled', true)}
              disabled={saving}
            >
              <Text style={styles.enableBtnTxt}>Enable Parental Controls</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SynthTokens.spacing.sm,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  iconBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  body: { padding: SynthTokens.spacing.md, gap: 16, paddingBottom: 48 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 4,
  },
  topText: { flex: 1 },
  pageTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
    marginBottom: 4,
  },
  card: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  cardDesc: { lineHeight: 18 },
  toggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  itemIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemText: { flex: 1, minWidth: 0 },
  itemLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: SynthTokens.colors.neutral900,
    marginBottom: 2,
  },
  itemDesc: { lineHeight: 17 },
  itemDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: SynthTokens.colors.neutral200,
    marginLeft: 50,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  infoText: { flex: 1 },
  infoTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e3a5f',
    marginBottom: 4,
  },
  infoBody: {
    color: '#1d4ed8',
    lineHeight: 18,
    fontSize: 12,
  },
  emptyCard: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
    textAlign: 'center',
  },
  emptyDesc: {
    textAlign: 'center',
    lineHeight: 20,
  },
  enableBtn: {
    marginTop: 4,
    borderWidth: 1.5,
    borderColor: SynthTokens.colors.neutral200,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  enableBtnTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  btnDisabled: { opacity: 0.5 },
});
