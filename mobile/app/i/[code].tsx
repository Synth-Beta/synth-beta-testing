import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, Heart } from 'lucide-react-native';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';
import { EventService } from '../../src/services/eventService';
import { InviteService, type InvitePreview } from '../../src/services/inviteService';

const PINK = SynthTokens.colors.brandPink500;

/**
 * join.getsynth.app/i/CODE, or the end of onboarding for someone who entered a code.
 * welcome=1 (from onboarding) redeems straight away; opening a link as an existing user
 * shows the invite and an Accept button first.
 */
export default function InviteScreen() {
  const { code, welcome } = useLocalSearchParams<{ code: string; welcome?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [state, setState] = useState<'loading' | 'missing' | 'own' | 'preview' | 'accepted'>('loading');
  const [interested, setInterested] = useState(false);
  const [busy, setBusy] = useState(false);

  const accept = async () => {
    setBusy(true);
    const result = await InviteService.redeem(String(code));
    await InviteService.clearPending();
    setBusy(false);
    if (result.ok) {
      setInterested(Boolean(result.event_id));
      setState('accepted');
    } else {
      setState(result.reason === 'own_invite' ? 'own' : 'missing');
    }
  };

  useEffect(() => {
    void (async () => {
      const preview = await InviteService.preview(String(code)).catch(() => null);
      if (!preview) {
        await InviteService.clearPending();
        setState('missing');
        return;
      }
      setInvite(preview);
      if (welcome === '1') await accept();
      else setState('preview');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, welcome]);

  const toggleInterested = async () => {
    if (!invite?.event_id || busy) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setBusy(true);
    const was = interested;
    setInterested(!was);
    const result = await EventService.toggleInteraction(user.id, invite.event_id, 'interested');
    if (result === null) setInterested(was);
    setBusy(false);
  };

  const done = () => router.replace('/(tabs)');
  const firstName = invite?.inviter_name?.split(' ')[0] || 'Your friend';
  const showLine = invite?.event_title
    ? `${invite.event_title}${invite.event_venue && !invite.event_title.includes(invite.event_venue) ? ` at ${invite.event_venue}` : ''}`
    : null;
  const dateLine = invite?.event_date
    ? new Date(invite.event_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  if (state === 'loading') {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={SynthTokens.colors.neutral400} />
      </View>
    );
  }

  if (state === 'missing' || state === 'own') {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.title}>{state === 'own' ? 'This is your own invite' : 'Invite not found'}</Text>
        <SynthText variant="meta" color="secondary" style={styles.body}>
          {state === 'own'
            ? 'Send it to a friend and they will join as your friend.'
            : 'The code may be mistyped. You can still find friends from your profile.'}
        </SynthText>
        <Pressable style={styles.primary} onPress={done}>
          <Text style={styles.primaryTxt}>Go to Synth</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.hero}>
        {invite?.inviter_avatar_url ? (
          <Image source={{ uri: invite.inviter_avatar_url }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarLetter}>{firstName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.title}>
          {showLine ? `${firstName} invited you to` : `${firstName} invited you to Synth`}
        </Text>
        {showLine ? <Text style={styles.show}>{showLine}</Text> : null}
        {dateLine ? <SynthText variant="meta" color="secondary">{dateLine}</SynthText> : null}

        {state === 'accepted' ? (
          <View style={styles.friendsPill}>
            <Check size={16} color={SynthTokens.colors.neutral900} />
            <Text style={styles.friendsTxt}>You and {firstName} are friends</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.actions}>
        {state === 'preview' ? (
          <Pressable style={[styles.primary, busy && styles.dim]} onPress={() => void accept()} disabled={busy}>
            {busy ? <ActivityIndicator color={SynthTokens.colors.neutral0} /> : null}
            <Text style={styles.primaryTxt}>Accept invite</Text>
          </Pressable>
        ) : invite?.event_id ? (
          <>
            <Pressable
              style={[styles.interest, interested && styles.interestOn]}
              onPress={() => void toggleInterested()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityState={{ selected: interested }}
            >
              <Heart size={20} color={interested ? SynthTokens.colors.neutral0 : PINK} fill={interested ? SynthTokens.colors.neutral0 : 'transparent'} />
              <Text style={[styles.interestTxt, interested && styles.interestTxtOn]}>
                {interested ? 'Interested' : "I'm interested"}
              </Text>
            </Pressable>
            <Pressable style={styles.secondary} onPress={() => router.replace(`/event/${invite.event_id}` as any)}>
              <Text style={styles.secondaryTxt}>See the show</Text>
            </Pressable>
          </>
        ) : null}
        {state === 'accepted' ? (
          <Pressable style={styles.link} onPress={done}>
            <Text style={styles.linkTxt}>Continue to Synth</Text>
          </Pressable>
        ) : (
          <Pressable style={styles.link} onPress={done}>
            <Text style={styles.linkTxt}>Not now</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SynthTokens.colors.neutral50, paddingHorizontal: 24, justifyContent: 'space-between' },
  center: { justifyContent: 'center', alignItems: 'stretch', gap: 16 },
  hero: { alignItems: 'center', gap: 8 },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 12 },
  avatarFallback: { backgroundColor: SynthTokens.colors.neutral100, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: 34, fontWeight: '700', color: SynthTokens.colors.neutral600 },
  title: { fontSize: 22, fontWeight: '700', color: SynthTokens.colors.neutral900, textAlign: 'center' },
  show: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, color: SynthTokens.colors.neutral900, textAlign: 'center' },
  body: { textAlign: 'center', fontSize: 15, lineHeight: 21 },
  friendsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: SynthTokens.colors.neutral100,
  },
  friendsTxt: { fontSize: 14, fontWeight: '600', color: SynthTokens.colors.neutral900 },
  actions: { gap: 12 },
  primary: {
    flexDirection: 'row',
    gap: 8,
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: PINK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryTxt: { color: SynthTokens.colors.neutral0, fontSize: 17, fontWeight: '700' },
  interest: {
    flexDirection: 'row',
    gap: 8,
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: PINK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  interestOn: { backgroundColor: PINK },
  interestTxt: { fontSize: 17, fontWeight: '700', color: PINK },
  interestTxtOn: { color: SynthTokens.colors.neutral0 },
  secondary: {
    minHeight: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    backgroundColor: SynthTokens.colors.neutral0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryTxt: { fontSize: 16, fontWeight: '600', color: SynthTokens.colors.neutral900 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkTxt: { fontSize: 15, fontWeight: '600', color: SynthTokens.colors.neutral600 },
  dim: { opacity: 0.6 },
});
