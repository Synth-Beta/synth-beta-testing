import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface OnboardingReminderBannerProps {
  onComplete: () => void;
  onDismiss: () => void;
}

const DISMISSED_KEY = 'onboarding_reminder_dismissed';
export const OnboardingReminderBanner = ({ onComplete, onDismiss }: OnboardingReminderBannerProps) => {

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, Date.now().toString());
    onDismiss();
  };

  const handleComplete = () => {
    onComplete();
  };

  return (
    <Alert 
      className="rounded-none border-x-0 border-t-0 bg-gradient-to-r from-primary/10 to-accent/10"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 60,
        // Ensure safe area padding is always applied, with minimum spacing
        paddingTop: `calc(env(safe-area-inset-top, 0px) + var(--spacing-small, 12px))`,
        paddingBottom: 'var(--spacing-small, 12px)',
        paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
        paddingRight: 'var(--spacing-screen-margin-x, 20px)',
        marginTop: 0,
        marginBottom: 0,
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        // Set a CSS variable so other components can account for banner height
        minHeight: '60px',
      }}
      data-banner-visible="true"
    >
      <div className="flex items-center justify-between gap-4">
        <AlertDescription className="flex-1 text-sm">
          <strong className="font-semibold">Complete your profile</strong> to get
          personalized event recommendations and connect with people who share your music
          taste.
        </AlertDescription>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleComplete}>
            Complete Profile
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            className="h-8 w-8 p-0"
          >
            <X className="w-4 h-4" />
            <span className="sr-only">Dismiss</span>
          </Button>
        </div>
      </div>
    </Alert>
  );
};

