import { useState, useEffect } from 'react';
import Joyride, { Step, CallBackProps, STATUS, ACTIONS, EVENTS } from 'react-joyride';
import { OnboardingService } from '@/services/onboardingService';
import { useAuth } from '@/hooks/useAuth';

interface OnboardingTourProps {
  run: boolean;
  onFinish: () => void;
}

export const OnboardingTour = ({ run, onFinish }: OnboardingTourProps) => {
  const { user } = useAuth();
  const [stepIndex, setStepIndex] = useState(0);

  const steps: Step[] = [
    {
      target: 'body',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Discover • Connect • Share</h3>
          <p>
            Synth is built around seeing what&apos;s happening, meeting people who love the
            same shows, and sharing your take. Let&apos;s take the tour!
          </p>
        </div>
      ),
      placement: 'center',
      disableBeacon: true,
    },
    {
      target: '[data-tour="feed"]',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Discover your feed</h3>
          <p>
            This feed mixes upcoming events with reviews from people you follow so you always
            know what&apos;s worth attending.
          </p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: '[data-tour="event-card"]',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Share your review</h3>
          <p>
            Tap an event to RSVP, drop photos, and leave a review so friends see your take in
            their Discover feed.
          </p>
        </div>
      ),
      placement: 'top',
    },
    {
      target: '[data-tour="search"]',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Connect with people</h3>
          <p>
            The Connect tab helps you find friends, hosts, and fans going to the same shows so
            you never go alone.
          </p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: '[data-tour="profile"]',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Share your story</h3>
          <p>
            Your Share page highlights your reviews, music tags, and who you follow—making it
            easy for others to vibe with your taste.
          </p>
        </div>
      ),
      placement: 'top',
    },
    {
      target: 'body',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">You&apos;re ready!</h3>
          <p>
            Discover new shows, connect with the community, and share the nights that matter.
            We&apos;ll see you in the crowd.
          </p>
        </div>
      ),
      placement: 'center',
    },
  ];

  const handleJoyrideCallback = async (data: CallBackProps) => {
    const { status, action, index, type, lifecycle } = data;

    // Handle tour completion
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      if (user) {
        await OnboardingService.completeTour(user.id);
      }
      onFinish();
      return;
    }

    // If target not found, skip to next step automatically
    if (type === EVENTS.TARGET_NOT_FOUND) {
      setStepIndex(index + 1);
      return;
    }

    // Update step index on step completion
    if (type === EVENTS.STEP_AFTER) {
      setStepIndex(index + (action === ACTIONS.PREV ? -1 : 1));
    }
  };

  useEffect(() => {
    if (run) {
      setStepIndex(0);
    }
  }, [run]);

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      continuous
      showProgress
      showSkipButton
      disableScrolling={false}
      spotlightClicks={true}
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: 'hsl(var(--primary))',
          textColor: 'hsl(var(--foreground))',
          backgroundColor: 'hsl(var(--background))',
          arrowColor: 'hsl(var(--background))',
          overlayColor: 'rgba(0, 0, 0, 0.5)',
          zIndex: 10000,
        },
        tooltip: {
          borderRadius: 8,
          padding: 20,
        },
        buttonNext: {
          backgroundColor: 'hsl(var(--primary))',
          borderRadius: 6,
          fontSize: 14,
          padding: '8px 16px',
        },
        buttonBack: {
          color: 'hsl(var(--muted-foreground))',
          fontSize: 14,
          marginRight: 10,
        },
        buttonSkip: {
          color: 'hsl(var(--muted-foreground))',
          fontSize: 14,
        },
      }}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Finish',
        next: 'Next',
        skip: 'Skip Tour',
      }}
    />
  );
};

