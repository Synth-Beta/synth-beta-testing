import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
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
import { FollowArtistsModal, type FollowArtistOption } from './FollowArtistsModal';
import { OnboardingService, ProfileSetupData } from '@/services/onboardingService';
import { MusicTagsService, type MusicTagInput } from '@/services/musicTagsService';
import { UnifiedArtistSearchService } from '@/services/unifiedArtistSearchService';
import { useAuth } from '@/hooks/useAuth';
import { useViewTracking } from '@/hooks/useViewTracking';
import { trackInteraction } from '@/services/interactionTrackingService';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import {
  ACQUISITION_SOURCE_CANONICAL_ORDER,
  type AcquisitionSource,
} from '@/constants/acquisitionSources';

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
  // Only use the native Swift onboarding on iOS. Web and Android use this React flow.
  const USE_NATIVE_ONBOARDING =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

  useEffect(() => {
    if (USE_NATIVE_ONBOARDING) {
      onComplete();
    }
  }, [onComplete, USE_NATIVE_ONBOARDING]);

  const [loading, setLoading] = useState(false);
  const [musicData, setMusicData] = useState<{ genres: string[]; artists: string[] }>({ genres: [], artists: [] });
  const profileStepRef = useRef<ProfileSetupStepRef>(null);
  const { user, session } = useAuth();
  const exitInProgressRef = useRef(false);
  const [prefilledMusicData, setPrefilledMusicData] = useState<{ genres: string[]; artists: string[] } | null>(null);
  const musicPrefillAppliedRef = useRef(false);

  const [showFollowArtistsModal, setShowFollowArtistsModal] = useState(false);
  const [favoriteArtistOptions, setFavoriteArtistOptions] = useState<FollowArtistOption[]>([]);
  const finishOnboardingRef = useRef(false);

  const [profileData, setProfileData] = useState<ProfileSetupData>({});
  const [acquisitionSource, setAcquisitionSource] = useState<AcquisitionSource | null>(null);
  const [acquisitionSourceOther, setAcquisitionSourceOther] = useState('');
  const [acquisitionSourceError, setAcquisitionSourceError] = useState<string | null>(null);
  const [prefillLoading, setPrefillLoading] = useState(true);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const completeButtonRef = useRef<HTMLDivElement>(null);

  const beginExit = useCallback(() => {
    exitInProgressRef.current = true;
  }, []);

  const handleExit = useCallback(() => {
    if (exitInProgressRef.current) return;
    beginExit();
    onExit();
  }, [beginExit, onExit]);

  const finishOnboarding = useCallback(async () => {
    if (!user?.id || finishOnboardingRef.current) {
      return;
    }

    finishOnboardingRef.current = true;
    setShowFollowArtistsModal(false);
    setFavoriteArtistOptions([]);

    try {
      await OnboardingService.completeOnboarding(user.id);
      trackInteraction.formSubmit('form', 'onboarding_complete', true, {
        completed: true,
        total_steps: 1,
      });
      beginExit();
      onComplete();
    } catch (error) {
      console.error('Error finishing onboarding:', error);
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

  // Close onboarding on ESC
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      handleExit();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleExit]);

  const handleProfileDraftChange = useCallback((draft: {
    username: string;
    location_city: string;
    birthday: string;
    gender: string;
    bio: string;
    avatar_url: string;
  }) => {
    setProfileData({
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
            'username, location_city, birthday, gender, bio, avatar_url, acquisition_source, other_acquisition_source'
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

  useEffect(() => {
    if (!session?.user?.id) return;
    let cancelled = false;

    const loadMusicPreferences = async () => {
      try {
        const tags = await MusicTagsService.getUserMusicTags(session.user.id);
        if (cancelled) return;

        const genres = tags.filter((tag) => tag.tag_type === 'genre').map((tag) => tag.tag_value);
        const artists = tags.filter((tag) => tag.tag_type === 'artist').map((tag) => tag.tag_value);
        const initialData = { genres, artists };

        if (!musicPrefillAppliedRef.current) {
          setPrefilledMusicData(initialData);
          setMusicData(initialData);
          musicPrefillAppliedRef.current = true;
        }
      } catch (error) {
        logger.error('OnboardingFlow: failed to prefill music preferences:', error);
      }
    };

    void loadMusicPreferences();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const handleCompleteSetup = async () => {
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
      if (profileResult?.errors && Object.keys(profileResult.errors).length > 0) {
        const firstError = Object.values(profileResult.errors)[0] as string;
        setCompletionError(firstError);
        completeButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      return;
    }

    const trimmedOtherSource = acquisitionSourceOther.trim();
    setAcquisitionSourceError(null);
    if (acquisitionSource === 'Other' && !trimmedOtherSource) {
      setAcquisitionSourceError('Please describe where you heard about Synth');
      completeButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    setLoading(true);
    try {
      // Save profile
      const profilePayload: ProfileSetupData = {
        name: finalName,
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
          acquisitionSource === 'Other' ? trimmedOtherSource : null;
      }
      let profileSuccess = false;
      try {
        profileSuccess = await OnboardingService.saveProfileSetup(user.id, profilePayload);
      } catch (profileErr: any) {
        const msg = profileErr?.message || 'Failed to save profile. Please try again.';
        setCompletionError(msg);
        completeButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if (!profileSuccess) {
        setCompletionError('Failed to save profile. Please try again.');
        completeButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }

      // Save music preferences (optional; same logic as former handleMusicTags)
      const artistData: FollowArtistOption[] = [];

      for (const artistName of musicData.artists) {
        const normalizedArtistName = artistName.trim();
        if (!normalizedArtistName) {
          continue;
        }

        try {
          const searchResults = await UnifiedArtistSearchService.searchArtistsTrigram(normalizedArtistName, 1);

          if (
            searchResults.length > 0 &&
            searchResults[0].name.toLowerCase() === normalizedArtistName.toLowerCase()
          ) {
            artistData.push({
              name: searchResults[0].name,
              id: searchResults[0].id,
              image_url: searchResults[0].image_url ?? undefined,
            });
          } else {
            artistData.push({ name: normalizedArtistName });
            try {
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
            } catch (error) {
              logger.warn('Error submitting missing artist request:', error);
            }
          }
        } catch (error) {
          logger.warn(`Error searching for artist "${normalizedArtistName}":`, error);
          artistData.push({ name: normalizedArtistName });
        }
      }

      try {
        await OnboardingService.saveMusicPreferences(user.id, musicData.genres, artistData);
      } catch (error: any) {
        logger.error('Error saving music preferences:', error);
        if (error?.message?.includes('already exist') || error?.code === '23505') {
          logger.warn('Some preferences already exist, continuing...');
        } else {
          const errorMessage = error?.message || 'Failed to save music preferences. Please try again.';
          setCompletionError(errorMessage);
          completeButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return;
        }
      }

      const genreTags: MusicTagInput[] = musicData.genres.map((genre) => ({
        tag_type: 'genre',
        tag_value: genre,
      }));
      const artistTags: MusicTagInput[] = musicData.artists.map((artist) => ({
        tag_type: 'artist',
        tag_value: artist,
      }));
      const manualMusicTags = [...genreTags, ...artistTags];

      if (manualMusicTags.length > 0) {
        try {
          const success = await MusicTagsService.bulkUpdateMusicTags(user.id, manualMusicTags);
          if (!success) {
            logger.warn('OnboardingFlow: failed to sync manual music tags.');
          }
        } catch (error) {
          logger.error('OnboardingFlow: error syncing manual music tags:', error);
        }
      }
      const dedupedArtists = dedupeFavoriteArtists(artistData);
      //If there's no artists, don't show the pop-up
      if (dedupedArtists.length === 0) {
        await finishOnboarding();
        return;
      }
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

  if (USE_NATIVE_ONBOARDING) {
    return null;
  }

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

          {loading || prefillLoading || !session ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-4">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
                <p className="text-muted-foreground">
                  {loading ? 'Saving your information...' : 'Preparing your account...'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-10">
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
                    <Label htmlFor="acquisition_source_select">Acquisition source</Label>
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
                  </div>
                  {acquisitionSource === 'Other' && (
                    <div className="space-y-2">
                      <Label htmlFor="acquisition_source_other">Tell us more</Label>
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

              <section>
                <h2 className="text-xl font-semibold mb-4">Music taste</h2>
                <MusicTagsStep
                  onChange={handleMusicDraftChange}
                  showButtons={false}
                  initialGenres={prefilledMusicData?.genres}
                  initialArtists={prefilledMusicData?.artists}
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
