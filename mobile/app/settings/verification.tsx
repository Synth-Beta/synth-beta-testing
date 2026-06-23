import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Text,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronLeft, CheckCircle, Circle, Sparkles, RefreshCw } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SynthText } from '../../src/components/SynthText';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { supabase } from '../../src/integrations/supabase/client';

const PINK = SynthTokens.colors.brandPink500;
const GREEN = SynthTokens.colors.success ?? '#10b981';

interface TrustCriteria {
  profileComplete: boolean;
  streamingConnected: boolean;
  hasReviews: boolean;
  hasFriends: boolean;
  hasEvents: boolean;
  accountAge: boolean;
  emailVerified: boolean;
  hasAttended: boolean;
}

interface Breakdown {
  score: number;
  criteriaMet: number;
  totalCriteria: number;
  criteria: TrustCriteria;
  isVerified: boolean;
  verified: boolean;
}

const CRITERIA_META: Record<keyof TrustCriteria, { label: string; description: string; target: string }> = {
  profileComplete:      { label: 'Complete Profile',    description: 'Name, bio, avatar, birthday, and gender',   target: 'All fields filled' },
  streamingConnected:   { label: 'Streaming Account',   description: 'Connect Spotify or Apple Music',            target: 'Connected' },
  hasReviews:           { label: 'Event Reviews',       description: 'Share your concert experiences',             target: '3+ reviews' },
  hasFriends:           { label: 'Friend Network',      description: 'Connect with other users',                   target: '10+ friends' },
  hasEvents:            { label: 'Event Interests',     description: 'Mark events as interested or going',         target: '10+ events' },
  accountAge:           { label: 'Account Age',         description: 'Be an active community member',              target: '30+ days' },
  emailVerified:        { label: 'Email Verified',      description: 'Verify your email address',                  target: 'Verified' },
  hasAttended:          { label: 'Event Attendance',    description: 'Attend and review concerts',                 target: '3+ attended' },
};

async function fetchBreakdown(userId: string, emailConfirmedAt: string | null): Promise<Breakdown> {
  const [profileResult, reviewResult, friendResult, eventResult, attendedResult] = await Promise.all([
    supabase.from('users_complete').select('verified, account_type, name, bio, avatar_url, birthday, gender, music_streaming_profile, created_at').eq('user_id', userId).maybeSingle(),
    supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('user_relationships').select('*', { count: 'exact', head: true }).eq('relationship_type', 'friend').eq('status', 'accepted').or(`user_id.eq.${userId},related_user_id.eq.${userId}`),
    supabase.from('user_event_relationships').select('*', { count: 'exact', head: true }).eq('user_id', userId).in('relationship_type', ['interested', 'going', 'maybe']),
    supabase.from('reviews').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('was_there', true),
  ]);

  const profile = profileResult.data;
  const reviewCount = reviewResult.count ?? 0;
  const friendCount = friendResult.count ?? 0;
  const eventCount = eventResult.count ?? 0;
  const attendedCount = attendedResult.count ?? 0;

  const criteria: TrustCriteria = {
    profileComplete: Boolean(profile?.name && profile?.bio && profile?.avatar_url && profile?.birthday && profile?.gender),
    streamingConnected: Boolean(profile?.music_streaming_profile),
    hasReviews: reviewCount >= 3,
    hasFriends: friendCount >= 10,
    hasEvents: eventCount >= 10,
    accountAge: profile?.created_at
      ? Date.now() - new Date(profile.created_at).getTime() >= 30 * 24 * 60 * 60 * 1000
      : false,
    emailVerified: emailConfirmedAt != null,
    hasAttended: attendedCount >= 3,
  };

  const criteriaMet = Object.values(criteria).filter(Boolean).length;
  const totalCriteria = Object.keys(criteria).length;
  const score = Math.round((criteriaMet / totalCriteria) * 100);

  return {
    score,
    criteriaMet,
    totalCriteria,
    criteria,
    isVerified: criteriaMet >= 4,
    verified: Boolean(profile?.verified),
  };
}

export default function VerificationSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [breakdown, setBreakdown] = useState<Breakdown | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (uid: string, emailConfirmedAt: string | null, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const result = await fetchBreakdown(uid, emailConfirmedAt);
      setBreakdown(result);
    } catch (e: any) {
      setError(e?.message || 'Could not load verification status.');
    } finally {
      if (isRefresh) setRefreshing(false); else setLoading(false);
    }
  }, []);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUserId(user.id);
        void load(user.id, user.email_confirmed_at ?? null);
      } else {
        setLoading(false);
      }
    });
  }, [load]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} accessibilityLabel="Back">
          <ChevronLeft size={28} color={SynthTokens.colors.neutral900} />
        </Pressable>
        <Text style={styles.title}>Verification</Text>
        <Pressable
          style={styles.iconBtn}
          onPress={() => {
            if (!userId) return;
            void supabase.auth.getUser().then(({ data: { user } }) => {
              void load(userId, user?.email_confirmed_at ?? null, true);
            });
          }}
          disabled={refreshing || loading}
          accessibilityLabel="Refresh"
        >
          {refreshing
            ? <ActivityIndicator size="small" color={PINK} />
            : <RefreshCw size={20} color={SynthTokens.colors.neutral600} />}
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator color={PINK} size="large" /></View>
      ) : error ? (
        <View style={styles.centered}>
          <SynthText variant="body" color="secondary" style={{ textAlign: 'center', padding: 24 }}>{error}</SynthText>
        </View>
      ) : !breakdown ? null : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          {/* Status banner */}
          {breakdown.verified || breakdown.isVerified ? (
            <View style={styles.verifiedBanner}>
              <Sparkles size={22} color={GREEN} />
              <View style={styles.bannerText}>
                <Text style={[styles.bannerTitle, { color: '#065f46' }]}>Verified Account</Text>
                <SynthText variant="meta" style={{ color: '#047857' }}>
                  You've met the trust criteria for Synth verification.
                </SynthText>
              </View>
            </View>
          ) : (
            <View style={styles.pendingBanner}>
              <View style={styles.bannerText}>
                <Text style={[styles.bannerTitle, { color: SynthTokens.colors.neutral900 }]}>
                  Verification Progress
                </Text>
                <SynthText variant="meta" color="secondary">
                  Meet {Math.max(0, 4 - breakdown.criteriaMet)} more criteria to become verified.
                </SynthText>
              </View>
            </View>
          )}

          {/* Score ring / progress */}
          <View style={styles.scoreCard}>
            <View style={styles.scoreRow}>
              <View style={styles.scoreCircle}>
                <Text style={styles.scoreNumber}>{breakdown.score}</Text>
                <Text style={styles.scoreLabel}>/ 100</Text>
              </View>
              <View style={styles.scoreRight}>
                <Text style={styles.scoreTitle}>Trust Score</Text>
                <SynthText variant="meta" color="secondary">
                  {breakdown.criteriaMet} of {breakdown.totalCriteria} criteria met
                </SynthText>
                {/* Progress bar */}
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${breakdown.score}%` as any }]} />
                </View>
              </View>
            </View>
          </View>

          {/* Criteria list */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Criteria Checklist</Text>
            {(Object.keys(CRITERIA_META) as (keyof TrustCriteria)[]).map((key, i, arr) => {
              const met = breakdown.criteria[key];
              const meta = CRITERIA_META[key];
              return (
                <View key={key}>
                  <View style={styles.criterionRow}>
                    {met
                      ? <CheckCircle size={20} color={GREEN} />
                      : <Circle size={20} color={SynthTokens.colors.neutral400} />}
                    <View style={styles.criterionText}>
                      <Text style={[styles.criterionLabel, !met && styles.criterionLabelUnmet]}>
                        {meta.label}
                      </Text>
                      <SynthText variant="meta" color="secondary" style={styles.criterionDesc}>
                        {meta.description} · <Text style={{ fontWeight: '600' }}>{meta.target}</Text>
                      </SynthText>
                    </View>
                  </View>
                  {i < arr.length - 1 ? <View style={styles.itemDivider} /> : null}
                </View>
              );
            })}
          </View>

          {/* Threshold note */}
          <View style={styles.noteCard}>
            <SynthText variant="meta" style={styles.noteText}>
              Verification is automatically granted when you meet 4 or more criteria. Your status updates
              automatically as you use Synth.
            </SynthText>
          </View>
        </ScrollView>
      )}
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
  verifiedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#ecfdf5',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#6ee7b7',
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  scoreCard: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  scoreCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(204,36,134,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: { fontSize: 24, fontWeight: '800', color: PINK, lineHeight: 28 },
  scoreLabel: { fontSize: 11, fontWeight: '600', color: SynthTokens.colors.neutral600 },
  scoreRight: { flex: 1, gap: 4 },
  scoreTitle: { fontSize: 15, fontWeight: '700', color: SynthTokens.colors.neutral900 },
  progressBar: {
    height: 6,
    borderRadius: 3,
    backgroundColor: SynthTokens.colors.neutral200,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: PINK,
  },
  card: {
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
    gap: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: SynthTokens.colors.neutral900,
    marginBottom: 8,
  },
  criterionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 8,
  },
  criterionText: { flex: 1 },
  criterionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: SynthTokens.colors.neutral900,
    marginBottom: 2,
  },
  criterionLabelUnmet: { color: SynthTokens.colors.neutral600 },
  criterionDesc: { fontSize: 12, lineHeight: 17 },
  itemDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: SynthTokens.colors.neutral200,
    marginLeft: 32,
  },
  noteCard: {
    backgroundColor: SynthTokens.colors.neutral100,
    borderRadius: 12,
    padding: 14,
  },
  noteText: { lineHeight: 18, color: SynthTokens.colors.neutral600 },
});
