import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ProfileSetupStep } from './ProfileSetupStep';
import { MusicTagsStep } from './MusicTagsStep';
import { OnboardingSkipModal } from './OnboardingSkipModal';
import { OnboardingService, ProfileSetupData } from '@/services/onboardingService';
import { UnifiedArtistSearchService } from '@/services/unifiedArtistSearchService';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { useViewTracking } from '@/hooks/useViewTracking';
import { trackInteraction } from '@/services/interactionTrackingService';

interface OnboardingFlowProps {
  onComplete: () => void;
}

export const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Step data
  const [profileData, setProfileData] = useState<ProfileSetupData>({});

  const totalSteps = 2;
  const progress = (currentStep / totalSteps) * 100;

  // Track onboarding step views
  useViewTracking('view', `onboarding_step_${currentStep}`, {
    step: currentStep === 1 ? 'profile_setup' : 'music_tags',
    step_number: currentStep,
    total_steps: totalSteps
  });

  // Track onboarding completion
  useEffect(() => {
    if (currentStep === totalSteps) {
      trackInteraction.formSubmit('onboarding', 'onboarding_complete', true, {
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
        setProfileData(data);
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
      setLoading(false);
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
              const { MissingEntityRequestService } = await import('@/services/missingEntityRequestService');
              await MissingEntityRequestService.submitRequest({
                entity_type: 'artist',
                entity_name: artistName,
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

      // Save preferences to user_preference_signals
      const success = await OnboardingService.saveMusicPreferences(
        user.id,
        data.genres,
        artistData
      );

      if (!success) {
        toast({
          title: 'Error',
          description: 'Failed to save music preferences.',
          variant: 'destructive',
        });
        setLoading(false);
        return;
      }

      // Mark onboarding as completed
      await OnboardingService.completeOnboarding(user.id);

      toast({
        title: 'Welcome to Synth!',
        description: 'Your profile is all set up. Let\'s explore the app!',
      });

      onComplete();
    } catch (error) {
      console.error('Error in handleMusicTags:', error);
      toast({
        title: 'Error',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    setShowSkipModal(true);
  };

  const handleConfirmSkip = async () => {
    if (!user) return;

    setLoading(true);
    try {
      await OnboardingService.skipOnboarding(user.id);
      toast({
        title: 'Onboarding Skipped',
        description: 'You can complete your profile anytime from settings.',
      });
      onComplete();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setShowSkipModal(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-primary/10 to-accent/10">
      <Card className="w-full max-w-2xl">
        <CardContent className="p-6 md:p-8">
          {/* Progress Bar */}
          <div className="mb-8 space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Step {currentStep} of {totalSteps}</span>
              <span>{Math.round(progress)}% complete</span>
            </div>
            <Progress value={progress} />
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

