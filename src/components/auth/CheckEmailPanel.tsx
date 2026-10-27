import { useCallback, useEffect, useRef, useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import {
  isEmailNotConfirmedError,
  EMAIL_CONFIRM_POLL_MAX_MS,
  EMAIL_CONFIRM_POLL_MS,
  EMAIL_CONFIRM_RESEND_COOLDOWN_SEC,
} from '@synth/shared';

interface Props {
  email: string;
  password: string;
  /** Where the confirmation link should land (same as sign-up's emailRedirectTo). */
  redirectTo: string;
  onConfirmed: () => void;
  onBack: () => void;
}

/**
 * Shown after email sign-up while the address is unconfirmed. The link usually opens in
 * another tab, so this one retries sign-in every 15s and whenever the tab regains focus.
 */
export function CheckEmailPanel({ email, password, redirectTo, onConfirmed, onBack }: Props) {
  const [cooldown, setCooldown] = useState(EMAIL_CONFIRM_RESEND_COOLDOWN_SEC);
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const startedAt = useRef(Date.now());
  const done = useRef(false);

  const trySignIn = useCallback(async (manual: boolean) => {
    if (done.current) return;
    if (manual) setChecking(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (manual) setChecking(false);
    if (data?.session) {
      done.current = true;
      onConfirmed();
      return;
    }
    if (manual && error) {
      setNote(isEmailNotConfirmedError(error)
        ? 'Not confirmed yet. Click the link in the email, then come back.'
        : "Couldn't check right now. Try again in a moment.");
    }
  }, [email, password, onConfirmed]);

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (Date.now() - startedAt.current > EMAIL_CONFIRM_POLL_MAX_MS) return;
      void trySignIn(false);
    }, EMAIL_CONFIRM_POLL_MS);
    const onFocus = () => void trySignIn(false);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(poll);
      window.removeEventListener('focus', onFocus);
    };
  }, [trySignIn]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const resend = async () => {
    setResending(true);
    setNote(null);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectTo },
    });
    setResending(false);
    setCooldown(EMAIL_CONFIRM_RESEND_COOLDOWN_SEC);
    setNote(error ? "Couldn't resend right now. Try again in a minute." : 'Sent again. Check Spam too.');
  };

  return (
    <div className="mt-6 space-y-4 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-pink-100">
        <Mail className="h-8 w-8 text-[#FF3399]" />
      </div>
      <h2 className="text-2xl font-bold">Check your email</h2>
      <p className="text-muted-foreground">
        We sent a confirmation link to <span className="font-semibold text-foreground">{email}</span>.
      </p>
      <p className="text-muted-foreground">
        Click the link, then come back to this tab. We'll sign you in automatically.
      </p>
      <p className="text-sm text-muted-foreground">Not there? Check your Spam or Junk folder.</p>

      <Button className="w-full" onClick={() => void trySignIn(true)} disabled={checking}>
        {checking ? 'Checking…' : "I've confirmed, continue"}
      </Button>
      <Button
        variant="outline"
        className="w-full"
        onClick={() => void resend()}
        disabled={cooldown > 0 || resending}
      >
        {resending ? 'Sending…' : cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend email'}
      </Button>
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
      <button type="button" className="text-sm text-muted-foreground underline" onClick={onBack}>
        Wrong email? Go back
      </button>
    </div>
  );
}
