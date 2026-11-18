import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProfileSetupStep, type ProfileSetupStepRef } from './ProfileSetupStep';
import { MusicTagsStep } from './MusicTagsStep';
import {
  DensityPreferenceStep,
  type DensityPreferenceValue,
} from './DensityPreferenceStep';
import { FollowArtistsModal, type FollowArtistOption } from './FollowArtistsModal';
import { OnboardingService, ProfileSetupData } from '@/services/onboardingService';
import { SceneRoomService } from '@/services/sceneRoomService';
import { UnifiedArtistSearchService } from '@/services/unifiedArtistSearchService';
import { useAuth } from '@/hooks/useAuth';
import { useViewTracking } from '@/hooks/useViewTracking';
import { trackInteraction } from '@/services/interactionTrackingService';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { withEventNamesList } from '@/lib/eventNames';
import {
  ACQUISITION_SOURCE_CANONICAL_ORDER,
  isDcCity,
  pickFeaturedShowForPreference,
  type AcquisitionSource,
  type FeaturedShowCandidate,
  needsContactEmail,
  describeProfileSaveError,
  isPlaceholderName,
} from '@synth/shared';

interface OnboardingFlowProps {
  onComplete: () => void;
  onExit: () => void;
}

const dedupeFavoriteArtists = (artists: FollowArtistOption[]): FollowArtistOption[] => {
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const deduped: FollowArtistOption[] = [];

  for (const artist of artists) {
    const trimmedName = artist.name?.trim();
    if (!trimmedName) {
      continue;
    }

    if (artist.id) {
      if (seenIds.has(artist.id)) {
        continue;
      }
      seenIds.add(artist.id);
    } else {
      const nameKey = trimmedName.toLowerCase();
      if (seenNames.has(nameKey)) {
        continue;
      }
      seenNames.add(nameKey);
    }

    deduped.push({
      ...artist,
      name: trimmedName,
    });
  }

  return deduped;
};

export const OnboardingFlow = ({ onComplete, onExit }: OnboardingFlowProps) => {
  const [loading, setLoading] = useState(false);
  const [musicData, setMusicData] = useState<{ genres: string[]; artists: string[] }>({ genres: [], artists: [] });
  const profileStepRef = useRef<ProfileSetupStepRef>(null);
  const { user, session } = useAuth();
  const showContactEmailField = needsContactEmail(user, null);
  const exitInProgressRef = useRef(false);

  const [showFollowArtistsModal, setShowFollowArtistsModal] = useState(false);
  const [favoriteArtistOptions, setFavoriteArtistOptions] = useState<FollowArtistOption[]>([]);
  const finishOnboardingRef = useRef(false);
  // The DC room join fails closed so Home never loads without membership, but failing
  // closed FOREVER strands a DC user in onboarding with no way into the app at all.
  // One retry, then let them through: the room can be joined from inside the app,
  // being locked out of the app cannot be fixed from anywhere. Mirrors mobile's
  // scene.tsx, which already had this fix; web never got it.
  const densityJoinAttemptsRef = useRef(0);

  // Onboarding only ever recorded SUCCESS (`onboarding_complete`), and the `interactions`
  // table has no metadata column - so a blocked submit left no trace anywhere and every
  // drop-off had to be reconstructed from signup timestamps. The reason goes in entity_id,
  // which IS persisted, so "where are people getting stuck" becomes one query.
  const trackBlock = useCallback((reason: string) => {
    trackInteraction.formSubmit('form', `onboarding_blocked_${reason}`, false);
  }, []);

  const [profileData, setProfileData] = useState<ProfileSetupData>({});
  const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource | null>(null);
  const [acquisitionSourceOther, setAcquisitionSourceOther] = useState('');
  const [acquisitionSourceError, setAcquisitionSourceError] = useState<string | null>(null);
  const [contactEmail, setContactEmail] = useState('');
  const [contactEmailError, setContactEmailError] = useState<string | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const completeButtonRef = useRef<HTMLDivElement>(null);
  const [densityPreference, setDensityPreference] = useState<DensityPreferenceValue>({
    preference: null,
    joinOptionalRoom2: false,
    markFeaturedInterested: false,
  });
  const [densityPreferenceError, setDensityPreferenceError] = useState<string | null>(null);
  const [suggestedShow, setSuggestedShow] = useState<FeaturedShowCandidate | null>(null);

  const beginExit = useCallback(() => {
    exitInProgressRef.current = true;
  }, []);

  // Errors render beside their fields; jump to the first one (it can be far above the button).
  const scrollToFirstFieldError = () => {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('.border-destructive');
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus?.({ preventScroll: true });
    });
  };

  const handleExit = useCallback(() => {
    if (exitInProgressRef.current) return;
    // Back signs the user out, so a stray tap must not silently throw away their setup.
    if (!window.confirm('Leave setup? You will be signed out, and you can sign back in to finish later.')) return;
    beginExit();
    // Sign out so "I accidentally signed up" can actually reach the sign-in
    // form. Staying authenticated would bounce them back into onboarding.
    void supabase.auth.signOut().finally(() => {
      onExit();
    });
  }, [beginExit, onExit]);

  const finishOnboarding = useCallback(async (bypassArtistMinimum = false) => {
    if (!user?.id || finishOnboardingRef.current) {
      return;
    }

    // Claim before the await below: the modal's onDone and onOpenChange(false) can both call
    // this, and the old ref was only set after the count query, so both ran the finish.
    finishOnboardingRef.current = true;

    if (!bypassArtistMinimum) {
      // Single choke point for the artist minimum. The modal's Done button, its X, and the
      // dialog's own dismiss all funnel through here, so the rule is enforced once rather
      // than re-implemented at each exit — which is how a requirement quietly gets a hole.
      try {
        const follows = await OnboardingService.countArtistFollows(user.id);
        if (follows < OnboardingService.MIN_ARTIST_FOLLOWS) {
          finishOnboardingRef.current = false;
          setShowFollowArtistsModal(true);
          return;
        }
      } catch (error) {
        // If the count cannot be verified, let them through. An unverifiable check must
        // never be the reason someone is stuck in onboarding.
        logger.warn('OnboardingFlow: could not verify artist follows, allowing finish:', error);
      }
    }

    setShowFollowArtistsModal(false);
    setFavoriteArtistOptions([]);

    try {
      // completeOnboarding catches its own errors and returns a boolean — it never
      // throws, so `await` alone can't tell success from failure. Ignoring the return
      // value sent people to the feed with onboarding_completed still false, and the
      // next page load dropped them straight back into onboarding. Same defect the
      // mobile flow had, reached a different way.
      const completed = await OnboardingService.completeOnboarding(user.id);
      if (!completed) {
        // The last gate. Anyone landing here did EVERYTHING and still has no account -
        // the most expensive failure in the funnel, and previously invisible.
        trackBlock('completion_write');
        finishOnboardingRef.current = false;
        setCompletionError('Could not finish setting up your account. Please try again.');
        return;
      }
      setCompletionError(null);
      trackInteraction.formSubmit('form', 'onboarding_complete', true, {
        completed: true,
        total_steps: 1,
      });
      beginExit();
      onComplete();
    } catch (error) {
      console.error('Error finishing onboarding:', error);
      // Without this the ref stays latched and the user cannot retry in this session.
      finishOnboardingRef.current = false;
      setCompletionError('Could not finish setting up your account. Please try again.');
    }
  }, [user?.id, beginExit, onComplete]);

  const handleFollowArtistsModalOpenChange = useCallback(
    (open: boolean) => {
      setShowFollowArtistsModal(open);
      if (!open) {
        void finishOnboarding();
      }
    },
    [finishOnboarding]
  );

  // No ESC-to-exit. Exiting onboarding now signs the user out (it previously dumped them
  // on a sign-in screen while still signed in, with no way back), and that is far too
  // destructive to hang off a stray keypress. The Back button is the deliberate way out.

  // Persist what has been typed so far. Web only wrote anything on final submit, so
  // abandoning it halfway left nothing behind and the same person starting again on mobile
  // retyped everything. Mobile's loadProfileDraft() already reads exactly these columns, so
  // this makes cross-platform resume work with no mobile change. Debounced to one write
  // after a pause rather than one per keystroke; username/name are excluded on purpose
  // (see saveProfileDraft).
  useEffect(() => {
    if (!user?.id) return;
    const timer = setTimeout(() => {
      const usernameOk = /^[a-z0-9_.]{3,30}$/i.test(profileData.username ?? '');
      void OnboardingService.saveProfileDraft(user.id, {
        name: profileData.name,
        username: usernameOk ? profileData.username : undefined,
        location_city: profileData.location_city,
        birthday: profileData.birthday,
        gender: profileData.gender,
        bio: profileData.bio,
        acquisition_source: acquisitionSource,
        other_acquisition_source:
          acquisitionSource === 'Other' ? acquisitionSourceOther : undefined,
        contact_email: showContactEmailField ? contactEmail : undefined,
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [
    user?.id,
    profileData,
    acquisitionSource,
    acquisitionSourceOther,
    contactEmail,
    showContactEmailField,
  ]);

  const handleProfileDraftChange = useCallback((draft: {
    name: string;
    username: string;
    location_city: string;
    birthday: string;
    gender: string;
    bio: string;
    avatar_url: string;
  }) => {
    setProfileData({
      name: draft.name || undefined,
      username: draft.username || undefined,
      location_city: draft.location_city || undefined,
      birthday: draft.birthday || undefined,
      gender: draft.gender || undefined,
      bio: draft.bio || undefined,
      avatar_url: draft.avatar_url || undefined,
    });
  }, []);

  const handleMusicDraftChange = useCallback((data: { genres: string[]; artists: string[] }) => {
    setMusicData(data);
  }, []);

  const handleDensityPreferenceChange = useCallback((next: DensityPreferenceValue) => {
    setDensityPreference(next);
    setDensityPreferenceError(null);
  }, []);

  // Suggest one featured show when preference changes (DC only).
  useEffect(() => {
    let cancelled = false;
    const preference = densityPreference.preference;
    const city = profileData.location_city;
    if (!preference || !isDcCity(city)) {
      setSuggestedShow(null);
      return;
    }

    (async () => {
      try {
        const now = new Date().toISOString();
        const { data, error } = await supabase
          .from('events')
          .select(
            'id, title, venue_city, event_date, is_promoted, promotion_tier, artists(name), venues(name)'
          )
          .gte('event_date', now)
          .order('event_date', { ascending: true })
          .limit(80);
        if (cancelled) return;
        if (error) {
          logger.warn('OnboardingFlow: featured show suggestion failed:', error);
          setSuggestedShow(null);
          return;
        }
        const picked = pickFeaturedShowForPreference(
          preference,
          withEventNamesList(data) as unknown as FeaturedShowCandidate[]
        );
        setSuggestedShow(picked);
      } catch (err) {
        if (!cancelled) {
          logger.warn('OnboardingFlow: featured show suggestion error:', err);
          setSuggestedShow(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [densityPreference.preference, profileData.location_city]);

  useViewTracking('view', 'onboarding_one_page', {
    step: 'onboarding_single_page',
  });

  // Prefill profile fields if a public.users row already exists.
  // IMPORTANT:
  // - Only query when a session exists (prevents 403).
  // - Use maybeSingle() so "no row yet" is treated as a new user (no noisy 406/PGRST116 logs).
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!session?.user?.id) {
        setPrefillLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('users')
          .select(
            'name, username, location_city, birthday, gender, bio, avatar_url, acquisition_source, other_acquisition_source'
          )
          .eq('user_id', session.user.id)
          .maybeSingle();

        if (cancelled) return;
        if (error) {
          logger.warn('OnboardingFlow: failed to prefill profile data (continuing):', error);
          setPrefillLoading(false);
          return;
        }

        if (data) {
          setProfileData({
            // Prefill name from the profile, else the sign-up account, so most people
            // just confirm it (it is required on both platforms now).
            // Skips what the signup trigger seeded ('Synth User', email prefix) so the
            // field starts blank instead of looking pre-filled with junk.
            name: [
              (data as any).name as string | null | undefined,
              session.user.user_metadata?.name as string | undefined,
              session.user.user_metadata?.full_name as string | undefined,
            ].find((n) => !isPlaceholderName(n, session.user.email)),
            username: data.username ?? undefined,
            location_city: (data as any).location_city ?? undefined,
            birthday: (data as any).birthday ?? undefined,
            gender: (data as any).gender ?? undefined,
            bio: (data as any).bio ?? undefined,
            avatar_url: (data as any).avatar_url ?? undefined,
          });
          setAcquisitionSource((data as any).acquisition_source ?? null);
          setAcquisitionSourceOther((data as any).other_acquisition_source ?? '');
        }
      } finally {
        if (!cancelled) {
          setPrefillLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);


  const completeSetupRunningRef = useRef(false);
  // setLoading(true) only runs after validation awaits, so a double-click started two runs.
  const handleCompleteSetup = async () => {
    if (completeSetupRunningRef.current) return;
    completeSetupRunningRef.current = true;
    try {
      await handleCompleteSetupInner();
    } finally {
      completeSetupRunningRef.current = false;
    }
  };
  const handleCompleteSetupInner = async () => {
    setCompletionError(null);

    // Never call /auth/v1/user or profile/account queries unless we have a session.
    if (!session || !user) {
      return;
    }

    const nameFromAuth =
      (user.user_metadata?.name as string | undefined) ??
      (user.user_metadata?.full_name as string | undefined) ??
      undefined;
    // Fall back to email prefix or 'User' so we never silently block submission
    const finalName =
      (nameFromAuth ?? '').trim() ||
      (user.email?.split('@')[0] ?? '') ||
      'User';

    // Validate profile via ref
    const profileResult = await profileStepRef.current?.validateAndGetData();
    if (!profileResult?.valid || !profileResult.data) {
      // Distinguish the username case: it is the field users cannot self-diagnose, since
      // it is prefilled for them and was until now reported as "already taken" on their
      // own row. If that ever regresses, this shows up in the data instead of in support.
      trackBlock(profileResult?.errors?.username ? 'username' : 'profile_fields');
      scrollToFirstFieldError();
      return;
    }

    const trimmedOtherSource = acquisitionSourceOther.trim();
    setAcquisitionSourceError(null);
    if (acquisitionSource === null) {
      trackBlock('acquisition_source');
      setAcquisitionSourceError('Please select where you heard about Synth');
      scrollToFirstFieldError();
      return;
    }

    const trimmedContactEmail = contactEmail.trim();
    setContactEmailError(null);
    if (showContactEmailField) {
      if (!trimmedContactEmail) {
        // Only Apple Hide My Email users ever see this field. If they pile up here, the
        // same trap mobile had (demanding an address from people who just hid theirs) is
        // costing signups on web too, and the fix is to defer to the post-onboarding gate.
        trackBlock('contact_email_missing');
        setContactEmailError('Please enter your email');
        completeButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedContactEmail)) {
        trackBlock('contact_email_invalid');
        setContactEmailError('Please enter a valid email');
        completeButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
    }

    // The DC "vibe" pick is no longer asked: DC users are joined to the DC room automatically
    // below (the pick only nudged which show was suggested and offered an optional second room).
    setDensityPreferenceError(null);

    setLoading(true);
    try {
      // Save profile
      const profilePayload: ProfileSetupData = {
        name: profileResult.data.name?.trim() || finalName,
        username: profileResult.data.username,
        location_city: profileResult.data.location_city,
        birthday: profileResult.data.birthday,
        gender: profileResult.data.gender || undefined,
        bio: profileResult.data.bio || undefined,
        avatar_url: profileResult.data.avatar_url || undefined,
      };
      if (acquisitionSource !== null) {
        profilePayload.acquisition_source = acquisitionSource;
        profilePayload.other_acquisition_source =
          acquisitionSource === 'Other' ? trimmedOtherSource || null : null;
      }
      if (showContactEmailField) {
        profilePayload.contact_email = trimmedContactEmail;
      }
      let profileSuccess = false;
      try {
        profileSuccess = await OnboardingService.saveProfileSetup(user.id, profilePayload);
      } catch (profileErr: unknown) {
        // The code in telemetry tells us WHY saves fail (users were retrying a generic error).
        const { code, message } = describeProfileSaveError(profileErr);
        console.error('Profile setup save failed:', profileErr);
        trackBlock(`profile_save_threw_${code}`);
        setCompletionError(message);
        completeButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if (!profileSuccess) {
        trackBlock('profile_save_failed');
        setCompletionError('Failed to save profile. Please try again.');
        completeButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }

      // DC room join runs in the background: it must never hold up the next step (the room
      // can be joined from inside the app). No-op for non-DC users.
      void (async () => {
        try {
          const joinResult = await SceneRoomService.applyOnboardingJoins({
            userId: user.id,
            locationCity: profileResult.data.location_city,
            preference: densityPreference.preference,
            joinOptionalRoom2: densityPreference.joinOptionalRoom2,
            markFeaturedInterested: densityPreference.markFeaturedInterested,
          });
          trackInteraction.formSubmit('form', 'onboarding_density_rooms', true, {
            is_dc: joinResult.plan.isDc,
            joined: joinResult.joinedRoomIds,
            optional_offered: joinResult.plan.offerOptionalRoom2,
            suggested_show_id: joinResult.suggestedShow?.id ?? null,
            marked_interested: joinResult.markedInterestedEventId,
            room_join_count: joinResult.plan.roomJoinCount,
            required_join_failed: joinResult.requiredJoinFailed,
          });
          if (joinResult.errors.length > 0) {
            logger.warn('OnboardingFlow: density room join warnings:', joinResult.errors);
          }
        } catch (joinErr) {
          logger.error('OnboardingFlow: density room join failed (continuing):', joinErr);
        }
      })();

      // Save music preferences (optional; same logic as former handleMusicTags)
      // Resolve typed artists in parallel (was one search at a time, which the user waited on).
      const artistData: FollowArtistOption[] = (
        await Promise.all(
          musicData.artists.map(async (artistName): Promise<FollowArtistOption | null> => {
            const normalizedArtistName = artistName.trim();
            if (!normalizedArtistName) return null;
            try {
              const searchResults = await UnifiedArtistSearchService.searchArtistsTrigram(normalizedArtistName, 1);
              if (
                searchResults.length > 0 &&
                searchResults[0].name.toLowerCase() === normalizedArtistName.toLowerCase()
              ) {
                return {
                  name: searchResults[0].name,
                  id: searchResults[0].id,
                  image_url: searchResults[0].image_url ?? undefined,
                };
              }
              void import('@/services/missingEntityRequestService')
                .then(({ MissingEntityRequestService }) =>
                  MissingEntityRequestService.submitRequest({
                    entity_type: 'artist',
                    entity_name: normalizedArtistName,
                  })
                )
                .catch((error) => {
                  logger.warn('Error submitting missing artist request:', error);
                });
              return { name: normalizedArtistName };
            } catch (error) {
              logger.warn(`Error searching for artist "${normalizedArtistName}":`, error);
              return { name: normalizedArtistName };
            }
          })
        )
      ).filter((x): x is FollowArtistOption => x !== null);

      // Music taste is optional: save it in the background so the follow step opens at once.
      void (async () => {
        try {
          await OnboardingService.saveMusicPreferences(user.id, musicData.genres, artistData);
        } catch (error: any) {
          // Music taste is OPTIONAL - the section carries no asterisk and nothing downstream
          // requires it. This used to abort the whole submit on any non-duplicate failure,
          // so a transient error saving data the user never had to enter locked them out of
          // an account they had otherwise finished setting up. Log and carry on.
          logger.error('Error saving music preferences (continuing anyway):', error);
          trackBlock('music_prefs_failed_nonfatal');
        }

      })();
      const dedupedArtists = dedupeFavoriteArtists(artistData);
      // Always open the follow step, even when nothing resolved from what they typed: the
      // modal loads suggestions and offers search of its own, and the 3-follow minimum now
      // applies on web exactly as it does on mobile. Skipping straight to finish here is
      // what let web accounts complete onboarding with zero artist signal.
      setFavoriteArtistOptions(dedupedArtists);
      setShowFollowArtistsModal(true);
      return;
    } catch (error) {
      logger.error('Error in handleCompleteSetup:', error);
      const msg = error instanceof Error ? error.message : 'Something went wrong. Please try again.';
      setCompletionError(msg);
      completeButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } finally {
      if (!exitInProgressRef.current) {
        setLoading(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 to-accent/10">
      <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col">
        <CardContent className="p-6 md:p-8 flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              aria-label="Back"
              onClick={handleExit}
              className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-muted/60 active:bg-muted/80 transition-colors text-muted-foreground"
            >
              ←
            </button>
            <h1 className="text-lg font-semibold text-center flex-1">Complete your profile</h1>
            <div className="w-11" />
          </div>

          {prefillLoading || !session ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-4">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
                <p className="text-muted-foreground">
                  Preparing your account...
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-10">
              {/* Overlay (not an unmount) while saving: unmounting the steps wiped the typed
                  music picks whenever a save failed and the form came back. */}
              {loading && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
                  <div className="text-center space-y-4">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
                    <p className="text-muted-foreground">Saving your information...</p>
                  </div>
                </div>
              )}
              <section>
                <h2 className="text-xl font-semibold mb-4">Your profile</h2>
                <ProfileSetupStep
                  ref={profileStepRef}
                  initialData={profileData}
                  onChange={handleProfileDraftChange}
                />
              </section>

              <section>
                <h2 className="text-xl font-semibold mb-4">How did you hear about Synth?</h2>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="acquisition_source_select">Acquisition source *</Label>
                    <Select
                      value={acquisitionSource ?? ''}
                      onValueChange={(value) => {
                        if (!value) {
                          setAcquisitionSource(null);
                          setAcquisitionSourceOther('');
                          return;
                        }

                        const selectedSource = value as AcquisitionSource;
                        setAcquisitionSource(selectedSource);
                        setAcquisitionSourceError(null);
                        if (selectedSource !== 'Other') {
                          setAcquisitionSourceOther('');
                        }
                      }}
                    >
                      <SelectTrigger
                        id="acquisition_source_select"
                        className="bg-white w-full"
                      >
                        <SelectValue placeholder="Select a source" />
                      </SelectTrigger>
                      <SelectContent className="bg-white">
                        {ACQUISITION_SOURCE_CANONICAL_ORDER.map((source) => (
                          <SelectItem key={source} value={source}>
                            {source}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[15px] font-medium leading-[1.5] text-muted-foreground">
                      This helps us understand which communities find Synth most often.
                    </p>
                    {acquisitionSourceError && acquisitionSource !== 'Other' && (
                      <p className="text-[15px] font-medium leading-[1.5] text-destructive">
                        {acquisitionSourceError}
                      </p>
                    )}
                  </div>
                  {acquisitionSource === 'Other' && (
                    <div className="space-y-2">
                      <Label htmlFor="acquisition_source_other">Tell us more (optional)</Label>
                      <Input
                        id="acquisition_source_other"
                        value={acquisitionSourceOther}
                        onChange={(event) => {
                          setAcquisitionSourceOther(event.target.value);
                          if (acquisitionSourceError) {
                            setAcquisitionSourceError(null);
                          }
                        }}
                        placeholder="e.g., referred by DJ Alex / saw Synth at Embarcadero Festival"
                        className={`bg-white ${acquisitionSourceError ? 'border-destructive' : ''}`}
                      />
                      {acquisitionSourceError ? (
                        <p className="text-[15px] font-medium leading-[1.5] text-destructive">
                          {acquisitionSourceError}
                        </p>
                      ) : (
                        <p className="text-[15px] font-medium leading-[1.5] text-muted-foreground">
                          Share any detail that helps us attribute this referral.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {showContactEmailField && (
                <section>
                  <h2 className="text-xl font-semibold mb-4">Contact email</h2>
                  <div className="space-y-2">
                    <Label htmlFor="contact_email_input">Email *</Label>
                    <Input
                      id="contact_email_input"
                      type="email"
                      value={contactEmail}
                      onChange={(event) => {
                        setContactEmail(event.target.value);
                        if (contactEmailError) {
                          setContactEmailError(null);
                        }
                      }}
                      placeholder="you@example.com"
                      className={`bg-white ${contactEmailError ? 'border-destructive' : ''}`}
                    />
                    {contactEmailError ? (
                      <p className="text-[15px] font-medium leading-[1.5] text-destructive">
                        {contactEmailError}
                      </p>
                    ) : (
                      <p className="text-[15px] font-medium leading-[1.5] text-muted-foreground">
                        We need a real contact email on file so we can reach you about your account and about reports of harassment or abuse.
                      </p>
                    )}
                  </div>
                </section>
              )}

              <section>
                <h2 className="text-xl font-semibold mb-4">Music taste</h2>
                <MusicTagsStep
                  onChange={handleMusicDraftChange}
                  showButtons={false}
                />
              </section>
            </div>
          )}

          {!loading && (
            <div ref={completeButtonRef} className="pt-6 mt-4 border-t">
              {completionError && (
                <p className="text-sm text-destructive mb-2">{completionError}</p>
              )}
              <Button
                onClick={handleCompleteSetup}
                className="w-full"
              >
                Complete setup
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      {user?.id && (
        <FollowArtistsModal
          open={showFollowArtistsModal}
          onOpenChange={handleFollowArtistsModalOpenChange}
          userId={user.id}
          artists={favoriteArtistOptions}
          onDone={finishOnboarding}
        />
      )}
    </div>
  );
};
