import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Valid when the URL still carries the recovery hash, OR a session already exists:
    // DeepLinkHandler consumes the hash, sets the session and navigates here without it,
    // so a hash-only check flipped the page to "Invalid Reset Link" right after it loaded.
    const hashParams = new URLSearchParams(location.hash.substring(1));
    if (hashParams.get('access_token') && hashParams.get('type') === 'recovery') {
      setIsValidToken(true);
      return;
    }
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setIsValidToken(prev => (prev === true ? true : Boolean(data.session)));
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setIsValidToken(true);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [location]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setMessage({ kind: 'error', text: 'Passwords do not match.' });
      return;
    }

    if (password.length < 6) {
      setMessage({ kind: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }

    setMessage(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        throw error;
      }

      setMessage({ kind: 'success', text: 'Password updated. Redirecting to sign in…' });
      // Sign out so they log in fresh with the new password, then redirect.
      await supabase.auth.signOut();
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (error: any) {
      console.error('Error resetting password:', error);
      setMessage({ kind: 'error', text: error?.message || 'Could not reset password. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  if (isValidToken === null) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-6">
            <div className="text-center">Checking reset link...</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isValidToken === false) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Reset Link</CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/')} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Reset Your Password</CardTitle>
          <CardDescription>
            Enter your new password below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div>
              <Input
                type="password"
                placeholder="New Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full"
              />
            </div>
            {message && (
              <p
                role={message.kind === 'error' ? 'alert' : 'status'}
                className={message.kind === 'error' ? 'text-sm text-red-600' : 'text-sm text-green-600'}
              >
                {message.text}
              </p>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#FF3399] hover:bg-[#E6007A] text-white"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
