import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  Text,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, AtSign, Key, Info } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';
import { getExpoSiteUrl } from '../../src/utils/siteUrl';

const PINK = SynthTokens.colors.brandPink500;

export default function SettingsSecurityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [changingEmail, setChangingEmail] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email ?? null);
    });
  }, []);

  const handleChangeEmail = async () => {
    const trimmed = newEmail.trim();
    if (!trimmed || trimmed === email) return;
    setChangingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: trimmed });
      if (error) throw error;
      Alert.alert('Confirmation sent', `Check ${trimmed} for a confirmation link.`);
      setNewEmail('');
    } catch (e: any) {
      Alert.alert('Could not change email', e?.message || 'Please try again.');
    } finally {
      setChangingEmail(false);
    }
  };

  const handleResetPassword = async () => {
    if (!email) return;
    setResettingPassword(true);
    try {
      const redirectUrl = `${getExpoSiteUrl()}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
      if (error) throw error;
      Alert.alert('Email sent', `Password reset link sent to ${email}.`);
    } catch (e: any) {
      Alert.alert('Could not send reset email', e?.message || 'Please try again.');
    } finally {
      setResettingPassword(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </Pressable>
        <Text style={styles.title}>Security</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Current email */}
        {email ? (
          <View style={styles.emailDisplay}>
            <View style={styles.emailIcon}>
              <AtSign size={18} color="#6366f1" />
            </View>
            <View style={styles.emailTextWrap}>
              <SynthText variant="meta" color="secondary">Signed in as</SynthText>
              <Text style={styles.emailValue} numberOfLines={1}>{email}</Text>
            </View>
          </View>
        ) : null}

        {/* Change Email */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <View style={[styles.iconBubble, { backgroundColor: '#dbeafe' }]}>
              <AtSign size={18} color="#3b82f6" />
            </View>
            <View style={styles.sectionHeadText}>
              <Text style={styles.sectionTitle}>Change Email</Text>
              <SynthText variant="meta" color="secondary">You'll receive a confirmation at the new address</SynthText>
            </View>
          </View>
          <SynthText variant="meta" color="secondary" style={styles.inputLabel}>New Email Address</SynthText>
          <TextInput
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="Enter new email address"
            placeholderTextColor={SynthTokens.colors.neutral400}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!changingEmail}
            style={styles.input}
          />
          <Pressable
            style={[
              styles.actionBtn,
              (!newEmail.trim() || newEmail.trim() === email || changingEmail) && styles.actionBtnDisabled,
            ]}
            onPress={() => void handleChangeEmail()}
            disabled={!newEmail.trim() || newEmail.trim() === email || changingEmail}
          >
            {changingEmail ? (
              <ActivityIndicator color={SynthTokens.colors.neutral0} />
            ) : (
              <Text style={styles.actionBtnTxt}>Send Confirmation Email</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.divider} />

        {/* Reset Password */}
        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <View style={[styles.iconBubble, { backgroundColor: '#e0e7ff' }]}>
              <Key size={18} color="#6366f1" />
            </View>
            <View style={styles.sectionHeadText}>
              <Text style={styles.sectionTitle}>Reset Password</Text>
              <SynthText variant="meta" color="secondary">A reset link will be sent to your email</SynthText>
            </View>
          </View>
          <Pressable
            style={[styles.outlineBtn, resettingPassword && styles.actionBtnDisabled]}
            onPress={() => void handleResetPassword()}
            disabled={resettingPassword || !email}
          >
            {resettingPassword ? (
              <ActivityIndicator color={SynthTokens.colors.neutral900} />
            ) : (
              <Text style={styles.outlineBtnTxt}>Send Password Reset Link</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.divider} />

        {/* Security note */}
        <View style={styles.noteCard}>
          <Info size={16} color="#3b82f6" style={{ marginTop: 1, flexShrink: 0 }} />
          <View style={styles.noteText}>
            <Text style={styles.noteTitle}>Security emails can't be disabled</Text>
            <SynthText variant="meta" style={styles.noteBody}>
              Account confirmation, password resets, and security alerts are always sent for your protection.
              Check your spam folder if you don't see them.
            </SynthText>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50 },
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
  emailDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: SynthTokens.colors.neutral100,
    borderRadius: 12,
    padding: 12,
  },
  emailIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#e0e7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailTextWrap: { flex: 1, minWidth: 0 },
  emailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: SynthTokens.colors.neutral900,
    marginTop: 2,
  },
  card: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    gap: 12,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconBubble: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 2,
  },
  sectionHeadText: { flex: 1, minWidth: 0 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
    marginBottom: 2,
  },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: -4,
  },
  input: {
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: SynthTokens.colors.neutral900,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  actionBtn: {
    backgroundColor: PINK,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: SynthTokens.colors.neutral0,
  },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: SynthTokens.colors.neutral200,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
    backgroundColor: SynthTokens.colors.neutral0,
  },
  outlineBtnTxt: {
    fontSize: 15,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: SynthTokens.colors.neutral200,
  },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  noteText: { flex: 1 },
  noteTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e3a5f',
    marginBottom: 4,
  },
  noteBody: {
    color: '#1d4ed8',
    lineHeight: 18,
    fontSize: 12,
  },
});
