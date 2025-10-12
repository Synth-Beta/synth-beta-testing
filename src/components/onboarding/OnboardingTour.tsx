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
          <h3 className="text-lg font-bold">Welcome to Synth!</h3>
          <p>
            Let's take a quick tour of the app to help you discover events and connect with
            other music lovers.
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
          <h3 className="text-lg font-bold">Event Feed</h3>
          <p>
            Discover events happening near you. Your feed is personalized based on your music
            preferences and the artists you follow.
          </p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: '[data-tour="search"]',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Search & Filters</h3>
          <p>
            Find specific events by artist, genre, or location. Use filters to narrow down
            results and find exactly what you're looking for.
          </p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: '[data-tour="event-card"]',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Event Details</h3>
          <p>
            Click on any event to see details, mark yourself as interested, share with
            friends, and see who else is going.
          </p>
        </div>
      ),
      placement: 'top',
    },
    {
      target: '[data-tour="profile"]',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Your Profile</h3>
          <p>
            View and edit your profile, connect your Spotify account, manage your music
            preferences, and see your event history.
          </p>
        </div>
      ),
      placement: 'top',
    },
    {
      target: '[data-tour="settings"]',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">Settings</h3>
          <p>
            Customize your experience, manage notifications, adjust your privacy settings,
            and more.
          </p>
        </div>
      ),
      placement: 'bottom',
    },
    {
      target: 'body',
      content: (
        <div className="space-y-2">
          <h3 className="text-lg font-bold">You're all set!</h3>
          <p>
            Start exploring events, following artists, and connecting with other music fans.
            Have fun and never go to shows alone!
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

