import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { OnboardingService } from '@/services/onboardingService';
import { logger } from '@/utils/logger';

interface EmailRequiredModalProps {
  onComplete: (email: string) => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function EmailRequiredModal({ onComplete }: EmailRequiredModalProps) {
  const { user } = useAuth();
  const [value, setValue] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const canSave = EMAIL_RE.test(value.trim()) && !saving;

  const handleSave = async () => {
    if (!user?.id || !canSave) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const trimmed = value.trim();
      const success = await OnboardingService.updateContactEmail(user.id, trimmed);
      if (success) {
        onComplete(trimmed);
      } else {
        setErrorMsg('Could not save your email. Please try again.');
      }
    } catch (err) {
      logger.error('EmailRequiredModal: save failed', err);
      setErrorMsg('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background px-6"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="text-5xl mb-4">📧</div>
          <h1 className="text-2xl font-bold">We need a contact email</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            We now require a real contact email on every account to help protect our community — so we can reach you about your account and follow up on reports of harassment or bullying.
          </p>
          <p className="text-muted-foreground text-xs">
            <a
              href="https://getsynth.app/privacy-policy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              Read our Privacy Policy
            </a>
          </p>
        </div>

        <div className="space-y-3">
          <Input
            type="email"
            placeholder="you@example.com"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (errorMsg) setErrorMsg('');
            }}
            autoComplete="email"
            autoFocus
          />
          {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
        </div>

        <Button
          className="w-full"
          onClick={handleSave}
          disabled={!canSave}
        >
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving…
            </>
          ) : (
            'Save email'
          )}
        </Button>
      </div>
    </div>
  );
}
