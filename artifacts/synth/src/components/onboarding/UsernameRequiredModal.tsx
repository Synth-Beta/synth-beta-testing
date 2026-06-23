import { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { logger } from '@/utils/logger';

interface UsernameRequiredModalProps {
  currentUsername: string;
  onComplete: (newUsername: string) => void;
}

type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

export function UsernameRequiredModal({ currentUsername, onComplete }: UsernameRequiredModalProps) {
  const { user } = useAuth();
  const [value, setValue] = useState('');
  const [checkState, setCheckState] = useState<CheckState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!value.trim()) {
      setCheckState('idle');
      setErrorMsg('');
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setCheckState('checking');
    debounceRef.current = setTimeout(async () => {
      try {
        const { validateUsernameFormat, sanitizeUsername } = await import('@/utils/usernameUtils');
        const sanitized = sanitizeUsername(value);
        const format = validateUsernameFormat(sanitized);
        if (!format.valid) {
          setCheckState('invalid');
          setErrorMsg(format.error ?? 'Invalid username');
          return;
        }
        const { checkUsernameAvailability } = await import('@/services/usernameService');
        const result = await checkUsernameAvailability(sanitized, user?.id);
        if (result.available) {
          setCheckState('available');
          setErrorMsg('');
        } else {
          setCheckState('taken');
          setErrorMsg(result.error ?? 'Username already taken');
        }
      } catch (err) {
        logger.error('UsernameRequiredModal: check failed', err);
        setCheckState('idle');
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, user?.id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.toLowerCase();
    v = v.replace(/[^a-z0-9_.]/g, '');
    v = v.replace(/^[_.]+/, '');
    v = v.replace(/[_.]{2,}/g, (m) => m[0]);
    setValue(v);
  };

  const handleSave = async () => {
    if (!user?.id || checkState !== 'available') return;
    setSaving(true);
    try {
      const { sanitizeUsername } = await import('@/utils/usernameUtils');
      const { updateUsername } = await import('@/services/usernameService');
      const sanitized = sanitizeUsername(value);
      const result = await updateUsername(user.id, sanitized);
      if (result.success) {
        onComplete(sanitized);
      } else {
        setCheckState('taken');
        setErrorMsg(result.error ?? 'Could not save username');
      }
    } catch (err) {
      logger.error('UsernameRequiredModal: save failed', err);
      setErrorMsg('Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const canSave = checkState === 'available' && value.trim().length >= 3 && !saving;

  return (
    <div
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-background px-6"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center space-y-2">
          <div className="text-5xl mb-4">🎵</div>
          <h1 className="text-2xl font-bold">Choose your username</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your current username{' '}
            <span className="font-mono font-semibold text-foreground">@{currentUsername}</span>{' '}
            was auto-generated. Pick something that represents you.
          </p>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground select-none">@</span>
            <Input
              placeholder="your_username"
              value={value}
              onChange={handleChange}
              maxLength={30}
              autoComplete="username"
              autoFocus
              className="pl-8 pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2">
              {checkState === 'checking' && (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              )}
              {checkState === 'available' && (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              )}
              {(checkState === 'taken' || checkState === 'invalid') && (
                <XCircle className="w-4 h-4 text-destructive" />
              )}
            </span>
          </div>

          {checkState === 'available' && (
            <p className="text-sm text-green-600 font-medium">@{value} is available ✓</p>
          )}
          {(checkState === 'taken' || checkState === 'invalid') && errorMsg && (
            <p className="text-sm text-destructive">{errorMsg}</p>
          )}
          {checkState === 'idle' && !value && (
            <p className="text-xs text-muted-foreground">
              3–30 chars · lowercase letters, numbers, underscores, periods
            </p>
          )}
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
            'Set username'
          )}
        </Button>
      </div>
    </div>
  );
}
