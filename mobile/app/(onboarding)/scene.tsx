import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Pressable,
  ScrollView,
  SafeAreaView,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronLeft, Check } from 'lucide-react-native';
import {
  OPTIONAL_SCENE_ROOM,
  OPTIONAL_SCENE_ROOM_2_ENABLED,
  ONBOARDING_PREFERENCE_OPTIONS,
  REQUIRED_SCENE_ROOM,
  isDcCity,
  pickFeaturedShowForPreference,
  type FeaturedShowCandidate,
  type OnboardingPreferenceId,
} from '@synth/shared';
import { SynthText } from '../../src/components/SynthText';
import { SynthButton } from '../../src/components/SynthButton';
import { SynthTokens } from '../../src/tokens/SynthTokens';
import { OnboardingProgress } from '../../src/components/OnboardingProgress';
import { supabase } from '../../src/integrations/supabase/client';
import { SceneRoomService } from '../../src/services/sceneRoomService';

const PINK = SynthTokens.colors.brandPink500;

/**
 * Density onboarding step (LOI-612): one preference + optional room 2.
 * Replaces the old genre grid. Room 1 auto-joins for DC before Home.
 */
export default function SceneScreen() {
  const router = useRouter();
  const [locationCity, setLocationCity] = useState<string | null>(null);
  const [cityLoading, setCityLoading] = useState(true);
  const [preference, setPreference] = useState<OnboardingPreferenceId | null>(null);
  const [joinOptionalRoom2, setJoinOptionalRoom2] = useState(false);
  const [markFeaturedInterested, setMarkFeaturedInterested] = useState(false);
  const [suggestedShow, setSuggestedShow] = useState<FeaturedShowCandidate | null>(null);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const isDc = isDcCity(locationCity);
  const offerRoom2 = OPTIONAL_SCENE_ROOM_2_ENABLED && isDc && !!preference;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || cancelled) {
          if (!cancelled) setCityLoading(false);
          return;
        }
        const { data } = await supabase
          .from('users')
          .select('location_city')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!cancelled) {
          setLocationCity(data?.location_city ?? null);
        }
      } catch (err) {
        console.warn('[onboarding/scene] failed to load city:', err);
      } finally {
        if (!cancelled) setCityLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Suggest one featured show when preference changes (DC only).
  useEffect(() => {
    let cancelled = false;
    if (!preference || !isDc) {
      setSuggestedShow(null);
      return;
    }

    (async () => {
      try {
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from('events')
          .select(
            'id, title, artist_name, venue_name, venue_city, event_date, is_promoted, promotion_tier'
          )
          .gte('event_date', now)
          .order('event_date', { ascending: true })
          .limit(80);
        if (cancelled) return;
        if (error) {
          console.warn('[onboarding/scene] featured show suggestion failed:', error);
          setSuggestedShow(null);
          return;
        }
        setSuggestedShow(
          pickFeaturedShowForPreference(preference, (data || []) as FeaturedShowCandidate[])
        );
      } catch (err) {
        if (!cancelled) {
          console.warn('[onboarding/scene] featured show suggestion error:', err);
          setSuggestedShow(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [preference, isDc]);

  const selectPreference = useCallback((id: OnboardingPreferenceId) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPreference(id);
    setPreferenceError(null);
    // Reset opt-ins when preference changes so room 2 / interest stay intentional.
    setJoinOptionalRoom2(false);
    setMarkFeaturedInterested(false);
  }, []);

  const handleContinue = async () => {
    if (isDc && !preference) {
      setPreferenceError('Pick one preference to land in the right room');
      return;
    }

    setSaving(true);
    setPreferenceError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        try {
          // Density membership: auto-join room 1 (DC); optional room 2 only if opted in.
          // Fail closed for required room 1 so Home never lands without membership.
          const joinResult = await SceneRoomService.applyOnboardingJoins({
            userId: user.id,
            locationCity,
            preference,
            joinOptionalRoom2,
            markFeaturedInterested,
          });
          if (joinResult.requiredJoinFailed) {
            setPreferenceError(
              'Could not join This week in DC. Check your connection and try again.'
            );
            return;
          }
          if (joinResult.errors.length > 0) {
            console.warn('[onboarding/scene] density room join warnings:', joinResult.errors);
          }
        } catch (joinErr) {
          // Non-DC soft-gate: no forced joins, so hiccups do not block continue.
          if (isDc) {
            console.warn('[onboarding/scene] density room join failed:', joinErr);
            setPreferenceError(
              'Could not join This week in DC. Check your connection and try again.'
            );
            return;
          }
          console.warn('[onboarding/scene] density room join failed (continuing):', joinErr);
        }
      }
    } finally {
      setSaving(false);
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/(onboarding)/artists');
  };

  if (cityLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={PINK} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color={SynthTokens.colors.neutral900} size={28} />
        </Pressable>
        <OnboardingProgress totalSteps={5} currentStep={4} />
        <View style={styles.skipButton} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!isDc ? (
          <>
            <SynthText variant="h1" style={styles.title}>DC scene rooms</SynthText>
            <SynthText variant="meta" color="secondary" style={styles.subtitle}>
              Density rooms are tuned for Washington, DC right now. You can keep going.
              We will skip auto-join until your city is DC.
            </SynthText>
          </>
        ) : (
          <>
            <SynthText variant="h1" style={styles.title}>Land in tonight's rooms</SynthText>
            <SynthText variant="meta" color="secondary" style={styles.subtitle}>
              You will join {REQUIRED_SCENE_ROOM.name} before Home. Pick one vibe so we can
              suggest a show or an optional second room. Two rooms max.
            </SynthText>

            <View style={styles.options}>
              {ONBOARDING_PREFERENCE_OPTIONS.map((opt) => {
                const selected = preference === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => selectPreference(opt.id)}
                    style={[styles.optionCard, selected && styles.optionCardSelected]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                  >
                    <View style={styles.optionTextWrap}>
                      <SynthText variant="accent" style={styles.optionLabel}>
                        {opt.label}
                      </SynthText>
                      <SynthText variant="meta" color="secondary">
                        {opt.description}
                      </SynthText>
                    </View>
                    <View style={[styles.radio, selected && styles.radioSelected]}>
                      {selected ? <Check color="white" size={14} strokeWidth={3} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {preferenceError ? (
              <SynthText variant="meta" style={styles.errorText}>
                {preferenceError}
              </SynthText>
            ) : null}

            {preference && suggestedShow ? (
              <View style={styles.suggestCard}>
                <SynthText variant="meta" color="secondary" style={styles.suggestEyebrow}>
                  Suggested show
                </SynthText>
                <SynthText variant="accent" style={styles.suggestTitle}>
                  {suggestedShow.artist_name || suggestedShow.title || 'Featured show'}
                </SynthText>
                <SynthText variant="meta" color="secondary" style={styles.suggestMeta}>
                  {[suggestedShow.venue_name, suggestedShow.venue_city].filter(Boolean).join(' · ')}
                </SynthText>
                <View style={styles.switchRow}>
                  <SynthText variant="meta" style={styles.switchLabel}>
                    Mark me interested in this show
                  </SynthText>
                  <Switch
                    value={markFeaturedInterested}
                    onValueChange={setMarkFeaturedInterested}
                    trackColor={{ false: SynthTokens.colors.neutral200, true: PINK }}
                    thumbColor={SynthTokens.colors.neutral0}
                  />
                </View>
              </View>
            ) : null}

            {offerRoom2 ? (
              <View style={styles.suggestCard}>
                <SynthText variant="meta" color="secondary" style={styles.suggestEyebrow}>
                  Optional room
                </SynthText>
                <SynthText variant="accent" style={styles.suggestTitle}>
                  {OPTIONAL_SCENE_ROOM.name}
                </SynthText>
                <SynthText variant="meta" color="secondary" style={styles.suggestMeta}>
                  Opt in only. You stay in two rooms max.
                </SynthText>
                <View style={styles.switchRow}>
                  <SynthText variant="meta" style={styles.switchLabel}>
                    Join this room too
                  </SynthText>
                  <Switch
                    value={joinOptionalRoom2}
                    onValueChange={setJoinOptionalRoom2}
                    trackColor={{ false: SynthTokens.colors.neutral200, true: PINK }}
                    thumbColor={SynthTokens.colors.neutral0}
                  />
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {saving ? (
          <ActivityIndicator color={PINK} />
        ) : (
          <SynthButton
            title="Continue"
            onPress={() => void handleContinue()}
            disabled={isDc && !preference}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SynthTokens.colors.neutral50,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SynthTokens.spacing.md,
  },
  backButton: {
    padding: 8,
  },
  skipButton: {
    padding: 8,
  },
  content: {
    padding: SynthTokens.spacing.xl,
    paddingBottom: 24,
  },
  title: {
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 28,
    lineHeight: 22,
  },
  options: {
    gap: 12,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: SynthTokens.radius.large,
    padding: 16,
    borderWidth: 1.5,
    borderColor: SynthTokens.colors.neutral200,
    gap: 12,
  },
  optionCardSelected: {
    borderColor: PINK,
    backgroundColor: 'rgba(204,36,134,0.06)',
  },
  optionTextWrap: {
    flex: 1,
    gap: 4,
  },
  optionLabel: {
    fontWeight: '700',
  },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: SynthTokens.colors.neutral200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    backgroundColor: PINK,
    borderColor: PINK,
  },
  errorText: {
    color: '#dc2626',
    marginTop: 12,
    fontWeight: '600',
  },
  suggestCard: {
    marginTop: 20,
    backgroundColor: SynthTokens.colors.neutral0,
    borderRadius: SynthTokens.radius.large,
    padding: 16,
    borderWidth: 1,
    borderColor: SynthTokens.colors.neutral200,
  },
  suggestEyebrow: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 12,
    marginBottom: 6,
  },
  suggestTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  suggestMeta: {
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  switchLabel: {
    flex: 1,
    fontWeight: '600',
    color: SynthTokens.colors.neutral900,
  },
  footer: {
    padding: SynthTokens.spacing.xl,
    paddingBottom: SynthTokens.spacing.xl + 20,
  },
});
