import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ProfileSetupStep } from './ProfileSetupStep';
import { AccountTypeStep } from './AccountTypeStep';
import { MusicTagsStep } from './MusicTagsStep';
import { OnboardingSkipModal } from './OnboardingSkipModal';
import { OnboardingService, ProfileSetupData } from '@/services/onboardingService';
import { MusicTagsService } from '@/services/musicTagsService';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

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
  const [accountData, setAccountData] = useState<{
    accountType: 'user' | 'creator' | 'business';
    businessInfo?: Record<string, any>;
  }>({ accountType: 'user' });

  const totalSteps = 3;
  const progress = (currentStep / totalSteps) * 100;

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
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAccountType = async (data: {
    accountType: 'user' | 'creator' | 'business';
    businessInfo?: Record<string, any>;
  }) => {
    if (!user) return;

    setLoading(true);
    try {
      // If user selected creator or business, submit upgrade request
      if (data.accountType !== 'user' && data.businessInfo) {
        const success = await OnboardingService.requestAccountUpgrade(
          user.id,
          data.accountType,
          data.businessInfo
        );

        if (!success) {
          toast({
            title: 'Error',
            description: 'Failed to submit account upgrade request.',
            variant: 'destructive',
          });
          setLoading(false);
          return;
        }

        toast({
          title: 'Request Submitted',
          description: 'Your account upgrade request has been sent for review.',
        });
      }

      setAccountData(data);
      setCurrentStep(3);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An error occurred. Please try again.',
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
      // Save music tags
      const genreTags = data.genres.map((genre, index) => ({
        tag_type: 'genre' as const,
        tag_value: genre,
        tag_source: 'manual' as const,
        weight: Math.max(10 - index, 1),
      }));

      const artistTags = data.artists.map((artist, index) => ({
        tag_type: 'artist' as const,
        tag_value: artist,
        tag_source: 'manual' as const,
        weight: Math.max(10 - index, 1),
      }));

      const allTags = [...genreTags, ...artistTags];
      const success = await MusicTagsService.bulkUpdateMusicTags(user.id, allTags);

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
                <AccountTypeStep
                  onNext={handleAccountType}
                  onBack={() => setCurrentStep(1)}
                  onSkip={handleSkip}
                />
              )}

              {currentStep === 3 && (
                <MusicTagsStep
                  onNext={handleMusicTags}
                  onBack={() => setCurrentStep(2)}
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

