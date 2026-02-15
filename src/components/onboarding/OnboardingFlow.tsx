import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ProfileSetupStep, type ProfileSetupStepRef } from './ProfileSetupStep';
import { MusicTagsStep } from './MusicTagsStep';
import { OnboardingService, ProfileSetupData } from '@/services/onboardingService';
import { ArtistFollowService } from '@/services/artistFollowService';
import { UnifiedArtistSearchService } from '@/services/unifiedArtistSearchService';
import { useAuth } from '@/hooks/useAuth';
import { useViewTracking } from '@/hooks/useViewTracking';
import { trackInteraction } from '@/services/interactionTrackingService';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

interface OnboardingFlowProps {
  onComplete: () => void;
  onExit: () => void;
}

export const OnboardingFlow = ({ onComplete, onExit }: OnboardingFlowProps) => {
  const [loading, setLoading] = useState(false);
  const [musicData, setMusicData] = useState<{ genres: string[]; artists: string[] }>({ genres: [], artists: [] });
  const profileStepRef = useRef<ProfileSetupStepRef>(null);
  const { user, session } = useAuth();
const exitInProgressRef = useRef(false);

  const [profileData, setProfileData] = useState<ProfileSetupData>({});
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
          .select('username, location_city, birthday, gender, bio, avatar_url')
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
    const finalName = (nameFromAuth ?? '').trim();
    if (!finalName) {
      return;
    }

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
      const artistData: { name: string; id?: string }[] = [];

      for (const artistName of musicData.artists) {
        try {
          const searchResults = await UnifiedArtistSearchService.searchArtistsTrigram(artistName, 1);

          if (searchResults.length > 0 && searchResults[0].name.toLowerCase() === artistName.toLowerCase()) {
            artistData.push({ name: searchResults[0].name, id: searchResults[0].id });
          } else {
            artistData.push({ name: artistName });
            try {
              void import('@/services/missingEntityRequestService')
                .then(({ MissingEntityRequestService }) =>
                  MissingEntityRequestService.submitRequest({
                    entity_type: 'artist',
                    entity_name: artistName,
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
          logger.warn(`Error searching for artist "${artistName}":`, error);
          artistData.push({ name: artistName });
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

      // Immediately follow selected artists so they appear in the home feed
      try {
        await ArtistFollowService.followArtists(user.id, artistData);
      } catch (followErr) {
        logger.warn('Onboarding: could not follow some artists (continuing):', followErr);
      }

      await OnboardingService.completeOnboarding(user.id);

      trackInteraction.formSubmit('form', 'onboarding_complete', true, {
        completed: true,
        total_steps: 1,
      });

      beginExit();
      onComplete();
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
    </div>
  );
};
