import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ProfileSetupStep } from './ProfileSetupStep';
import { MusicTagsStep } from './MusicTagsStep';
import { OnboardingSkipModal } from './OnboardingSkipModal';
import { OnboardingService, ProfileSetupData } from '@/services/onboardingService';
import { UnifiedArtistSearchService } from '@/services/unifiedArtistSearchService';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useViewTracking } from '@/hooks/useViewTracking';
import { trackInteraction } from '@/services/interactionTrackingService';
import { ChevronLeft } from 'lucide-react';

interface OnboardingFlowProps {
  onComplete: () => void;
  onExit: () => void;
}

export const OnboardingFlow = ({ onComplete, onExit }: OnboardingFlowProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const exitInProgressRef = useRef(false);

  // Step data
  const [profileData, setProfileData] = useState<ProfileSetupData>({});

  const totalSteps = 2;
  const progress = (currentStep / totalSteps) * 100;

  const beginExit = useCallback(() => {
    exitInProgressRef.current = true;
  }, []);

  const handleExit = useCallback(() => {
    if (exitInProgressRef.current) return;
    beginExit();
    onExit();
  }, [beginExit, onExit]);

  // Close onboarding on ESC (but don't override skip modal's own ESC behavior)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (showSkipModal) return;
      event.preventDefault();
      handleExit();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleExit, showSkipModal]);

  const handleProfileDraftChange = useCallback((draft: {
    username: string;
    location_city: string;
    birthday: string;
    gender: string;
    bio: string;
    avatar_url: string;
  }) => {
    // Keep the latest in-progress profile draft in parent state so it survives
    // step unmounts (loading UI) and skip/complete flows.
    setProfileData(draft);
  }, []);

  // Track onboarding step views
  useViewTracking('view', `onboarding_step_${currentStep}`, {
    step: currentStep === 1 ? 'profile_setup' : 'music_tags',
    step_number: currentStep,
    total_steps: totalSteps
  });

  // Track onboarding completion
  useEffect(() => {
    if (currentStep === totalSteps) {
      trackInteraction.formSubmit('form', 'onboarding_complete', true, {
        completed: true,
        total_steps: totalSteps
      });
    }
  }, [currentStep, totalSteps]);

  const handleProfileSetup = async (data: ProfileSetupData) => {
    if (!user) return;

    setLoading(true);
    try {
      const success = await OnboardingService.saveProfileSetup(user.id, data);
      if (success) {
        // Merge submitted data back into the persisted draft (sanitized username, etc.)
        setProfileData((prev) => ({ ...prev, ...data }));
        setCurrentStep(2);
      } else {
        toast({
          title: 'Error',
          description: 'Failed to save profile data. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'An error occurred. Please try again.';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      if (!exitInProgressRef.current) {
        setLoading(false);
      }
    }
  };

  const handleMusicTags = async (data: { genres: string[]; artists: string[] }) => {
    if (!user) return;

    setLoading(true);
    try {
      // For artists, we need to find or create them in the database
      // Use trigram search to find existing artists
      const artistData: { name: string; id?: string }[] = [];
      
      for (const artistName of data.artists) {
        try {
          // Search for existing artist using trigram search
          const searchResults = await UnifiedArtistSearchService.searchArtistsTrigram(artistName, 1);
          
          if (searchResults.length > 0 && searchResults[0].name.toLowerCase() === artistName.toLowerCase()) {
            // Found exact match
            artistData.push({ name: searchResults[0].name, id: searchResults[0].id });
          } else {
            // No exact match found - artist will be created via missing entity request
            // For now, save with just the name (entity_id will be null)
            artistData.push({ name: artistName });
            
            // Submit missing entity request
            try {
              // IMPORTANT: do not block saving preference signals on this request
              void import('@/services/missingEntityRequestService')
                .then(({ MissingEntityRequestService }) =>
                  MissingEntityRequestService.submitRequest({
                    entity_type: 'artist',
                    entity_name: artistName,
                  })
                )
                .catch((error) => {
                  console.warn('Error submitting missing artist request:', error);
                });
            } catch (error) {
              console.warn('Error submitting missing artist request:', error);
            }
          }
        } catch (error) {
          console.warn(`Error searching for artist "${artistName}":`, error);
          // Continue with just the name if search fails
          artistData.push({ name: artistName });
        }
      }

      // Save preferences to user_preferences
      try {
        await OnboardingService.saveMusicPreferences(
          user.id,
          data.genres,
          artistData
        );
      } catch (error: any) {
        console.error('Error saving music preferences:', error);
        // Handle duplicate preferences gracefully (they're okay)
        if (error?.message?.includes('already exist') || error?.code === '23505') {
          console.warn('Some preferences already exist, continuing...');
        } else {
          // Show the actual error message from the service
          const errorMessage = error?.message || 'Failed to save music preferences. Please try again.';
          toast({
            title: 'Error',
            description: errorMessage,
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }
      }

      // Mark onboarding as completed
      await OnboardingService.completeOnboarding(user.id);

      toast({
        title: 'Welcome to Synth!',
        description: 'Your profile is all set up. Let\'s explore the app!',
      });

      // Prevent any further state updates/rerenders here; parent will navigate away.
      beginExit();
      onComplete();
    } catch (error) {
      console.error('Error in handleMusicTags:', error);
      toast({
        title: 'Error',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      if (!exitInProgressRef.current) {
        setLoading(false);
      }
    }
  };

  const handleSkip = () => {
    // Show skip modal - allows skipping from any step
    if (!exitInProgressRef.current) {
      setShowSkipModal(true);
    }
  };

  const handleConfirmSkip = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Save any profile data that was entered before skipping
      if (Object.keys(profileData).length > 0) {
        try {
          await OnboardingService.saveProfileSetup(user.id, profileData);
        } catch (error) {
          console.warn('Error saving profile data before skip:', error);
          // Continue with skip even if profile save fails
        }
      }

      const skipSuccess = await OnboardingService.skipOnboarding(user.id);
      if (!skipSuccess) {
        toast({
          title: 'Error',
          description: 'Failed to skip onboarding. Please try again.',
          variant: 'destructive',
        });
        if (!exitInProgressRef.current) {
          setLoading(false);
          setShowSkipModal(false);
        }
        return;
      }
      
      toast({
        title: 'Onboarding Skipped',
        description: 'You can complete your profile anytime from settings.',
      });
      // Prevent any further state updates/rerenders here; parent will navigate away.
      beginExit();
      onComplete();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      if (!exitInProgressRef.current) {
        setLoading(false);
        setShowSkipModal(false);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 to-accent/10">
      <Card className="w-full max-w-2xl">
        <CardContent className="p-6 md:p-8">
          {/* Progress Bar */}
          <div className="mb-8 space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <button
                type="button"
                aria-label="Back"
                onClick={handleExit}
                className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-muted/60 active:bg-muted/80 transition-colors"
              >
                <ChevronLeft size={24} aria-hidden="true" />
              </button>
              <div className="flex-1 flex items-center justify-between">
                <span>Step {currentStep} of {totalSteps}</span>
                <span>{Math.round(progress)}% complete</span>
              </div>
            </div>
            <div
              className="w-full h-2 overflow-hidden"
              style={{
                backgroundColor: 'var(--neutral-100)',
                borderRadius: 'var(--radius-corner, 10px)'
              }}
            >
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${progress}%`,
                  backgroundColor: 'var(--brand-pink-500)',
                  borderRadius: 'var(--radius-corner, 10px)'
                }}
              />
            </div>
          </div>

          {/* Step Content */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-4">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto" />
                <p className="text-muted-foreground">Saving your information...</p>
              </div>
            </div>
          ) : (
            <>
              {currentStep === 1 && (
                <ProfileSetupStep
                  initialData={profileData}
                  onChange={handleProfileDraftChange}
                  onNext={handleProfileSetup}
                  onSkip={handleSkip}
                />
              )}

              {currentStep === 2 && (
                <MusicTagsStep
                  onNext={handleMusicTags}
                  onBack={() => setCurrentStep(1)}
                  onSkip={handleSkip}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <OnboardingSkipModal
        open={showSkipModal}
        onOpenChange={setShowSkipModal}
        onConfirmSkip={handleConfirmSkip}
      />
    </div>
  );
};

