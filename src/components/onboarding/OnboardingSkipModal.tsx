import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface OnboardingSkipModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmSkip: () => void;
}

export const OnboardingSkipModal = ({
  open,
  onOpenChange,
  onConfirmSkip,
}: OnboardingSkipModalProps) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Skip profile setup?</AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              Completing your profile helps us personalize your experience:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Discover events that match your music taste</li>
              <li>Connect with people who share your interests</li>
              <li>Get better recommendations based on your preferences</li>
            </ul>
            <p className="text-sm font-medium">
              You can always complete this later from your profile settings.
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continue Setup</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirmSkip}>
            Skip for Now
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

