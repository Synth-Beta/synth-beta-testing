import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { handleAppleSignInFromNative, setupAppleSignInListeners } from '@/services/appleAuthService';
import { Capacitor } from '@capacitor/core';
import { getCanonicalSiteUrl } from '@/utils/canonicalSiteUrl';


interface AuthProps {
  onAuthSuccess: () => void;
}

export default function Auth({ onAuthSuccess }: AuthProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [activeTab, setActiveTab] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [appleSignInLoading, setAppleSignInLoading] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [signupEmailAlreadyRegistered, setSignupEmailAlreadyRegistered] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [resetPasswordSent, setResetPasswordSent] = useState(false);
  const signInEmailInputRef = useRef<HTMLInputElement | null>(null);

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (emailError) setEmailError(null);
    if (signupEmailAlreadyRegistered) setSignupEmailAlreadyRegistered(false);
  };

  useEffect(() => {
    const checkIOS = () => {
      const userAgent = window.navigator.userAgent || window.navigator.vendor || (window as any).opera;
      const isIOSDevice = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
      
      const Capacitor = (window as any).Capacitor;
      if (Capacitor && typeof Capacitor.getPlatform === 'function') {
        try {
          setIsIOS(Capacitor.getPlatform() === 'ios' || isIOSDevice);
        } catch (error) {
          console.warn('Error checking Capacitor platform:', error);
          setIsIOS(isIOSDevice);
        }
      } else {
        setIsIOS(isIOSDevice);
      }
    };
    
    checkIOS();
  }, []);

  useEffect(() => {
    setEmailError(null);
    setSignupEmailAlreadyRegistered(false);
    setAuthError(null);
    setResetPasswordSent(false);
  }, [activeTab]);

  useEffect(() => {
    let cleanup: (() => void) | null = null;
    
    if (isIOS) {
      cleanup = setupAppleSignInListeners();
    }
    
    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [isIOS]);

  const getSiteOrigin = (): string => {
    const envUrlRaw = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();
    const envUrl = envUrlRaw
      ? /^https?:\/\//i.test(envUrlRaw)
        ? envUrlRaw
        : `https://${envUrlRaw}`
      : null;

    const fallback = getCanonicalSiteUrl();
    const candidate = envUrl ?? fallback;
    try {
      return new URL(candidate).origin;
    } catch {
      return fallback;
    }
  };

  const getRedirectUrl = (path: string): string => {
    const origin = getSiteOrigin();
    try {
      return new URL(path, origin).toString();
    } catch {
      return origin;
    }
  };

  const logSupabaseAuthError = (context: string, error: any) => {
    console.error(`❌ Supabase auth error (${context}):`, {
      name: error?.name,
      status: error?.status,
      message: error?.message,
      error_description: error?.error_description,
    });
  };

  const getSupabaseAuthErrorDescription = (error: any): string | null => {
    const desc = error?.error_description ?? error?.description ?? null;
    if (typeof desc === 'string' && desc.trim().length > 0) return desc.trim();
    return null;
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setSignupEmailAlreadyRegistered(false);
    setAuthError(null);

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: getRedirectUrl('/#onboarding'),
          data: {
            name: name,
          }
        }
      });

      if (error) throw error;

      if (data?.user && (!data.user.identities || data.user.identities.length === 0)) {
        setSignupEmailAlreadyRegistered(true);
        setLoading(false);
        return;
      }

      if (import.meta.env.DEV && data?.user) {
        console.log("Sign-up success: user id:", data.user.id, "email confirmed:", !!data.user.email_confirmed_at);
      }

      let session = data?.session ?? null;
      if (!session) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        session = signInData?.session ?? null;
      }

      if (!session) {
        return;
      }

      onAuthSuccess();
    } catch (error: any) {
      logSupabaseAuthError('signUp', error);

      const isUserAlreadyRegisteredError =
        error?.status === 422 &&
        typeof error?.message === 'string' &&
        error.message.toLowerCase().includes('user already registered');

      if (isUserAlreadyRegisteredError) {
        setSignupEmailAlreadyRegistered(true);
        return;
      }

      setAuthError(error?.message || 'Sign up failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthError(null);

    try {
      console.log('🔐 Attempting sign in...');
      console.log('Email:', email ? `${email.substring(0, 3)}***` : 'empty');
      console.log('Platform:', Capacitor.isNativePlatform() ? 'Mobile' : 'Web');
      console.log('Supabase client initialized:', !!supabase);
      
      const supabaseUrl = (supabase as any).supabaseUrl;
      if (!supabaseUrl || supabaseUrl.includes('your-project.supabase.co')) {
        throw new Error('Supabase not configured. Environment variables missing at build time. Check build settings.');
      }
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logSupabaseAuthError('signInWithPassword', error);
        if (import.meta.env.DEV) {
          console.error('Full error object:', JSON.stringify(error, null, 2));
        }
        
        let userMessage =
          getSupabaseAuthErrorDescription(error) ||
          error.message ||
          'Sign in failed. Please try again.';
        
        const isNetworkError = error.status === 0 && (
          error.message?.includes('Failed to fetch') || 
          error.message?.includes('NetworkError') ||
          error.message?.includes('Network request failed')
        );
        
        if (error.status === 400 || error.message?.includes('Invalid login credentials')) {
          userMessage = 'Invalid email or password. Please check your credentials.';
        } else if (isNetworkError) {
          userMessage = 'Network error. Please check your internet connection.';
        } else if (error.status === 429) {
          userMessage = 'Too many attempts. Please wait a moment and try again.';
        } else if (error.status === 500 || error.status === 502 || error.status === 503) {
          userMessage = 'Server error. Please try again in a moment.';
        }
        
        throw new Error(userMessage);
      }

      if (!data.session) {
        if (import.meta.env.DEV) {
          console.error('❌ No session returned after sign in');
        }
        throw new Error('Sign in succeeded but no session was created');
      }

      if (import.meta.env.DEV) {
        console.log('✅ Sign in successful, session created');
        console.log('User ID:', data.user?.id);
      }
      onAuthSuccess();
    } catch (error: any) {
      console.error('❌ Sign in failed:', error);
      setAuthError(error?.message || 'Sign in failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      setEmailError('Please enter your email address.');
      requestAnimationFrame(() => {
        signInEmailInputRef.current?.focus();
      });
      return;
    }

    setIsResettingPassword(true);
    setAuthError(null);
    setResetPasswordSent(false);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getRedirectUrl('/reset-password'),
      });

      if (error) {
        logSupabaseAuthError('resetPasswordForEmail', error);

        let errorMessage =
          getSupabaseAuthErrorDescription(error) ||
          error.message ||
          'Failed to send password reset email.';
        if (error.status === 429) {
          errorMessage = 'Too many attempts. Please wait a moment and try again.';
        } else if (error.status === 0) {
          errorMessage = 'Network error. Please check your internet connection.';
        }

        throw new Error(errorMessage);
      }

      setResetPasswordSent(true);
    } catch (error: any) {
      console.error('❌ Password reset failed:', error);
      setAuthError(error?.message || 'Failed to send password reset email.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (!isIOS) {
      return;
    }

    setAppleSignInLoading(true);

    try {
      if (import.meta.env.DEV) {
        console.log('🍎 Starting Apple Sign In...');
      }
      
      const result = await handleAppleSignInFromNative();
      
      if (result.success) {
        if (import.meta.env.DEV) {
          console.log('✅ Apple Sign In successful');
        }
        onAuthSuccess();
      }
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error('❌ Apple Sign In exception:', error);
      }
    } finally {
      setAppleSignInLoading(false);
    }
  };

  const isAppleDisabled = !isIOS || appleSignInLoading || loading;

  const inputStyle: React.CSSProperties = {
    height: 'var(--size-input-height, 44px)',
    paddingLeft: 'var(--spacing-small, 12px)',
    paddingRight: 'var(--spacing-small, 12px)',
    border: 'var(--border-default)',
    borderRadius: 'var(--radius-corner, 10px)',
    backgroundColor: 'var(--neutral-50)',
    color: 'var(--neutral-900)',
    fontFamily: 'var(--font-family)',
    fontSize: 'var(--typography-meta-size, 16px)',
    fontWeight: 'var(--typography-meta-weight, 500)',
    lineHeight: 'var(--typography-meta-line-height, 1.5)',
    outline: 'none',
    boxSizing: 'border-box',
  };

  const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
    width: '100%',
    height: 'var(--size-button-height, 36px)',
    backgroundColor: disabled ? 'var(--state-disabled-bg)' : 'var(--brand-pink-500)',
    color: disabled ? 'var(--state-disabled-text)' : 'var(--neutral-50)',
    border: 'none',
    borderRadius: 'var(--radius-corner, 10px)',
    boxShadow: disabled ? 'none' : 'var(--shadow-default)',
    fontFamily: 'var(--font-family)',
    fontSize: 'var(--typography-meta-size, 16px)',
    fontWeight: 'var(--typography-meta-weight, 500)',
    lineHeight: 'var(--typography-meta-line-height, 1.5)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  });

  const metaTextStyle: React.CSSProperties = {
    fontFamily: 'var(--font-family)',
    fontSize: 'var(--typography-meta-size, 16px)',
    fontWeight: 'var(--typography-meta-weight, 500)',
    lineHeight: 'var(--typography-meta-line-height, 1.5)',
    margin: 0,
  };

  const AppleAuthButton = () => (
    <button
      type="button"
      onClick={handleAppleSignIn}
      disabled={isAppleDisabled}
      style={{
        ...primaryButtonStyle(isAppleDisabled),
        backgroundColor: isAppleDisabled ? 'var(--state-disabled-bg)' : '#000000',
        color: isAppleDisabled ? 'var(--state-disabled-text)' : '#ffffff',
        gap: 'var(--spacing-inline, 6px)',
      }}
    >
      {appleSignInLoading ? (
        'Signing in...'
      ) : (
        <>
          <svg style={{ width: '20px', height: '20px', flexShrink: 0 }} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          Continue with Apple
        </>
      )}
    </button>
  );

  const Divider = () => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-small, 12px)' }}>
      <div style={{ height: '1px', flex: 1, backgroundColor: 'var(--neutral-200)' }} />
      <span style={{ ...metaTextStyle, color: 'var(--neutral-600)' }}>or</span>
      <div style={{ height: '1px', flex: 1, backgroundColor: 'var(--neutral-200)' }} />
    </div>
  );

  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--spacing-screen-margin-x, 20px)',
        backgroundColor: 'var(--neutral-50)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          backgroundColor: 'var(--neutral-50)',
          border: 'var(--border-default)',
          borderRadius: 'var(--radius-corner, 10px)',
          boxShadow: 'var(--shadow-modal)',
          padding: 'var(--spacing-grouped, 24px)',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--spacing-grouped, 24px)' }}>
          <img
            src="/Logos/Main logo black background.png"
            alt="Synth Logo"
            style={{
              width: '80px',
              height: '80px',
              borderRadius: 'var(--radius-corner, 10px)',
              display: 'block',
              margin: '0 auto',
              marginBottom: 'var(--spacing-small, 12px)',
            }}
          />
          <h1
            style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-h1-size, 35px)',
              fontWeight: 'var(--typography-h1-weight, 700)',
              lineHeight: 'var(--typography-h1-line-height, 1.2)',
              color: 'var(--neutral-900)',
              margin: '0 0 var(--spacing-inline, 6px)',
            }}
          >
            Synth
          </h1>
          <p
            style={{
              ...metaTextStyle,
              fontSize: 'var(--typography-body-size, 20px)',
              fontWeight: 'var(--typography-body-weight, 500)',
              lineHeight: 'var(--typography-body-line-height, 1.5)',
              color: 'var(--neutral-600)',
            }}
          >
            Connect with people at events you love
          </p>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'signin' | 'signup')}>
          <TabsList
            className="grid w-full grid-cols-2"
            style={{
              backgroundColor: 'var(--neutral-100)',
              borderRadius: 'var(--radius-corner, 10px)',
              padding: '4px',
              height: 'auto',
              border: 'none',
            }}
          >
            <TabsTrigger
              value="signin"
              style={{ fontFamily: 'var(--font-family)', borderRadius: 'var(--radius-corner, 10px)' }}
              className="data-[state=active]:bg-[var(--neutral-50)] data-[state=active]:text-[var(--neutral-900)] data-[state=active]:shadow-none text-[var(--neutral-600)] transition-all"
            >
              Sign In
            </TabsTrigger>
            <TabsTrigger
              value="signup"
              style={{ fontFamily: 'var(--font-family)', borderRadius: 'var(--radius-corner, 10px)' }}
              className="data-[state=active]:bg-[var(--neutral-50)] data-[state=active]:text-[var(--neutral-900)] data-[state=active]:shadow-none text-[var(--neutral-600)] transition-all"
            >
              Sign Up
            </TabsTrigger>
          </TabsList>

          {/* Sign In Tab */}
          <TabsContent value="signin" style={{ marginTop: 'var(--spacing-grouped, 24px)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-small, 12px)' }}>
              <AppleAuthButton />
              {!isIOS && (
                <p style={{ ...metaTextStyle, color: 'var(--neutral-600)', textAlign: 'center' }}>
                  Apple Sign In is available on iOS devices.
                </p>
              )}
              <Divider />
              <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-small, 12px)' }}>
                <div>
                  <Input
                    ref={signInEmailInputRef}
                    id="signin-email"
                    name="signinEmail"
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => handleEmailChange(e.target.value)}
                    required
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? 'signin-email-error' : undefined}
                    className="w-full"
                    style={{
                      ...inputStyle,
                      border: emailError ? '1px solid var(--status-error-500)' : 'var(--border-default)',
                    }}
                  />
                  {emailError && (
                    <p
                      id="signin-email-error"
                      style={{ ...metaTextStyle, marginTop: 'var(--spacing-inline, 6px)', color: 'var(--status-error-500)' }}
                    >
                      {emailError}
                    </p>
                  )}
                </div>

                <Input
                  id="signin-password"
                  name="signinPassword"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full"
                  style={inputStyle}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={isResettingPassword}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: isResettingPassword ? 'not-allowed' : 'pointer',
                      ...metaTextStyle,
                      color: 'var(--brand-pink-500)',
                      opacity: isResettingPassword ? 0.5 : 1,
                    }}
                  >
                    {isResettingPassword ? 'Sending...' : 'Forgot password?'}
                  </button>
                </div>

                {authError && (
                  <p
                    style={{
                      ...metaTextStyle,
                      color: 'var(--status-error-500)',
                      textAlign: 'center',
                      backgroundColor: 'var(--status-error-050)',
                      borderRadius: 'var(--radius-corner, 10px)',
                      padding: 'var(--spacing-small, 12px)',
                    }}
                  >
                    {authError}
                  </p>
                )}

                {resetPasswordSent && (
                  <p
                    style={{
                      ...metaTextStyle,
                      color: 'var(--status-success-500)',
                      textAlign: 'center',
                      backgroundColor: 'var(--status-success-050)',
                      borderRadius: 'var(--radius-corner, 10px)',
                      padding: 'var(--spacing-small, 12px)',
                    }}
                  >
                    Password reset email sent. Check your inbox.
                  </p>
                )}

                <button type="submit" disabled={loading} style={primaryButtonStyle(loading)}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>

                <p style={{ ...metaTextStyle, color: 'var(--neutral-600)', textAlign: 'center' }}>
                  Trouble signing in? Double-check your email and password, or use "Forgot password".
                </p>
              </form>
            </div>
          </TabsContent>

          {/* Sign Up Tab */}
          <TabsContent value="signup" style={{ marginTop: 'var(--spacing-grouped, 24px)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-small, 12px)' }}>
              <AppleAuthButton />
              {!isIOS && (
                <p style={{ ...metaTextStyle, color: 'var(--neutral-600)', textAlign: 'center' }}>
                  Apple Sign In is available on iOS devices.
                </p>
              )}
              <Divider />
              <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-small, 12px)' }}>
                {signupEmailAlreadyRegistered && (
                  <p style={{ ...metaTextStyle, color: 'var(--status-error-500)' }}>
                    Email already associated with an account
                  </p>
                )}

                <Input
                  id="signup-name"
                  name="signupName"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full"
                  style={inputStyle}
                />

                <Input
                  id="signup-email"
                  name="signupEmail"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  required
                  className="w-full"
                  style={inputStyle}
                />

                <Input
                  id="signup-password"
                  name="signupPassword"
                  type="password"
                  placeholder="Password (min 6 characters)"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full"
                  style={inputStyle}
                />

                {authError && (
                  <p
                    style={{
                      ...metaTextStyle,
                      color: 'var(--status-error-500)',
                      textAlign: 'center',
                      backgroundColor: 'var(--status-error-050)',
                      borderRadius: 'var(--radius-corner, 10px)',
                      padding: 'var(--spacing-small, 12px)',
                    }}
                  >
                    {authError}
                  </p>
                )}

                <button type="submit" disabled={loading} style={primaryButtonStyle(loading)}>
                  {loading ? 'Creating account...' : 'Sign Up'}
                </button>
              </form>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
