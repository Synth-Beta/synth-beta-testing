import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
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
    // Check if iOS
    const checkIOS = () => {
      const userAgent = window.navigator.userAgent || window.navigator.vendor || (window as any).opera;
      const isIOSDevice = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
      
      // Safely check for Capacitor
      const Capacitor = (window as any).Capacitor;
      if (Capacitor && typeof Capacitor.getPlatform === 'function') {
        try {
          setIsIOS(Capacitor.getPlatform() === 'ios' || isIOSDevice);
        } catch (error) {
          // Fallback to user agent detection if Capacitor fails
          console.warn('Error checking Capacitor platform:', error);
          setIsIOS(isIOSDevice);
        }
      } else {
        setIsIOS(isIOSDevice);
      }
    };
    
    checkIOS();
    
    // Set up Apple Sign In listeners only if iOS is detected
    // We'll check isIOS state in a separate effect to avoid dependency issues
  }, []);

  useEffect(() => {
    // Don't carry errors across tabs
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
    
    // Cleanup function: remove listeners when component unmounts or isIOS changes
    return () => {
      if (cleanup) {
        cleanup();
      }
    };
  }, [isIOS]);

  const getSiteOrigin = (): string => {
    // Prefer an explicit deploy-time URL that is also allowlisted in Supabase Auth redirect URLs.
    const envUrlRaw = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim();
    const envUrl = envUrlRaw
      ? /^https?:\/\//i.test(envUrlRaw)
        ? envUrlRaw
        : `https://${envUrlRaw}`
      : null;

    const fallback = getCanonicalSiteUrl();

    const candidate = envUrl ?? fallback;
    try {
      // Ensure we always return a clean origin (no path/query/hash).
      return new URL(candidate).origin;
    } catch {
      return fallback;
    }
  };

  // Helper function to get redirect URLs for Supabase emails.
  // IMPORTANT: Supabase rejects redirectTo/emailRedirectTo that isn't allowlisted.
  const getRedirectUrl = (path: string): string => {
    const origin = getSiteOrigin();
    try {
      return new URL(path, origin).toString();
    } catch {
      // Last-resort fallback to just the origin.
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

      // Supabase may return success with empty identities when the email already exists.
      if (data?.user && (!data.user.identities || data.user.identities.length === 0)) {
        setSignupEmailAlreadyRegistered(true);
        setLoading(false);
        return;
      }

      if (import.meta.env.DEV && data?.user) {
        console.log("Sign-up success: user id:", data.user.id, "email confirmed:", !!data.user.email_confirmed_at);
      }

      // Confirmations are OFF in this app: we must have a real session before proceeding.
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

      // Inline error for "email already registered" (Supabase AuthApiError 422)
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
      // Always log for debugging
      console.log('🔐 Attempting sign in...');
      console.log('Email:', email ? `${email.substring(0, 3)}***` : 'empty');
      console.log('Platform:', Capacitor.isNativePlatform() ? 'Mobile' : 'Web');
      console.log('Supabase client initialized:', !!supabase);
      
      // Check if Supabase credentials are configured
      const supabaseUrl = (supabase as any).supabaseUrl;
      if (!supabaseUrl || supabaseUrl.includes('your-project.supabase.co')) {
        throw new Error('Supabase not configured. Environment variables missing at build time. Check build settings.');
      }
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Always log errors in production for debugging
        logSupabaseAuthError('signInWithPassword', error);
        if (import.meta.env.DEV) {
          console.error('Full error object:', JSON.stringify(error, null, 2));
        }
        
        // Provide more helpful error messages
        let userMessage =
          getSupabaseAuthErrorDescription(error) ||
          error.message ||
          'Sign in failed. Please try again.';
        
        // Only show network error for actual network failures (no response from server)
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
      // Focus the email field for quick correction
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

        // Provide better error messages
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

  const AppleAuthButton = () => (
    <Button
      onClick={handleAppleSignIn}
      disabled={!isIOS || appleSignInLoading || loading}
      className="w-full bg-black hover:bg-gray-800 text-white font-semibold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
    >
      {appleSignInLoading ? (
        'Signing in...'
      ) : (
        <>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
          </svg>
          Continue with Apple
        </>
      )}
    </Button>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{
      background: 'linear-gradient(45deg, #fdf2f8 0%, var(--neutral-0) 25%, #fce7f3 50%, var(--neutral-0) 75%, #fdf2f8 100%)',
      backgroundSize: '400% 400%',
      animation: 'elegant-shift 20s ease infinite'
    }}>
      <Card className="w-full max-w-md bg-white/90 backdrop-blur-lg rounded-3xl shadow-xl border-0">
        <CardHeader className="text-center pb-8">
          <div className="flex justify-center mb-6">
            <img 
              src="/Logos/Main logo black background.png" 
              alt="Synth Logo" 
              className="w-20 h-20 rounded-2xl"
            />
          </div>
          <CardTitle className="text-[35px] font-bold leading-[1.2] text-black mb-2" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
            Synth
          </CardTitle>
          <CardDescription className="text-[#666666] text-[20px] font-medium leading-[1.5]" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
            Connect with people at events you love
          </CardDescription>
        </CardHeader>
        <CardContent className="px-10 pb-10">
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'signin' | 'signup')}>
            <TabsList className="grid w-full grid-cols-2 bg-[#F5F5DC] rounded-xl p-1">
              <TabsTrigger 
                value="signin" 
                className="data-[state=active]:bg-white data-[state=active]:text-black text-[#666666] font-medium rounded-lg transition-all"
                style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
              >
                Sign In
              </TabsTrigger>
              <TabsTrigger 
                value="signup" 
                className="data-[state=active]:bg-white data-[state=active]:text-black text-[#666666] font-medium rounded-lg transition-all"
                style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
              >
                Sign Up
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin" className="mt-6">
              <div className="space-y-4">
                <AppleAuthButton />
                {!isIOS && (
                  <p className="text-[16px] font-medium leading-[1.5] text-[#666666] text-center" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
                    Apple Sign In is available on iOS devices.
                  </p>
                )}
              </div>

              <div className="py-4">
                <div className="flex items-center gap-3 pb-4">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-[16px] font-medium leading-[1.5] text-[#666666]" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
                    or
                  </span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
                <form onSubmit={handleSignIn} className="space-y-6">
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
                      className={`w-full px-4 py-3 border rounded-lg focus:border-[#FF3399] focus:ring-2 focus:ring-[#FF3399]/20 transition-all ${
                        emailError ? 'border-red-500' : 'border-gray-300'
                      }`}
                      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                    />
                    {emailError && (
                      <p
                        id="signin-email-error"
                        className="mt-2 text-[16px] font-medium leading-[1.5] text-red-600"
                        style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                      >
                        {emailError}
                      </p>
                    )}
                  </div>
                  <div>
                    <Input
                      id="signin-password"
                      name="signinPassword"
                      type="password"
                      placeholder="Password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-[#FF3399] focus:ring-2 focus:ring-[#FF3399]/20 transition-all"
                      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleForgotPassword}
                      disabled={isResettingPassword}
                      className="text-[16px] font-medium leading-[1.5] text-[#FF3399] hover:text-[#E6007A] transition-colors disabled:opacity-50"
                      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                    >
                      {isResettingPassword ? 'Sending...' : 'Forgot password?'}
                    </button>
                  </div>
                  {authError && (
                    <p
                      className="text-[15px] font-medium leading-[1.5] text-red-600 text-center bg-red-50 rounded-lg px-3 py-2"
                      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                    >
                      {authError}
                    </p>
                  )}
                  {resetPasswordSent && (
                    <p
                      className="text-[15px] font-medium leading-[1.5] text-green-700 text-center bg-green-50 rounded-lg px-3 py-2"
                      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                    >
                      Password reset email sent. Check your inbox.
                    </p>
                  )}
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#FF3399] hover:bg-[#E6007A] text-white font-semibold py-3 px-6 rounded-lg transition-all"
                    style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                  >
                    {loading ? 'Signing in...' : 'Sign In'}
                  </Button>
                  <p
                    className="text-[16px] font-medium leading-[1.5] text-[#666666] text-center"
                    style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                  >
                    Trouble signing in? Double-check your email and password, or use "Forgot password".
                  </p>
                </form>
              </div>
            </TabsContent>
            
            <TabsContent value="signup" className="mt-6">
              <div className="space-y-4">
                <AppleAuthButton />
                {!isIOS && (
                  <p className="text-[16px] font-medium leading-[1.5] text-[#666666] text-center" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
                    Apple Sign In is available on iOS devices.
                  </p>
                )}
              </div>

              <div className="py-4">
                <div className="flex items-center gap-3 pb-4">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-[16px] font-medium leading-[1.5] text-[#666666]" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
                    or
                  </span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
                <form onSubmit={handleSignUp} className="space-y-6">
                  {signupEmailAlreadyRegistered && (
                    <p
                      style={{
                        color: 'var(--status-error-500)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)',
                        fontFamily: 'var(--font-family)',
                      }}
                    >
                      Email already associated with an account
                    </p>
                  )}
                  <div>
                    <Input
                      id="signup-name"
                      name="signupName"
                      type="text"
                      placeholder="Your name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-[#FF3399] focus:ring-2 focus:ring-[#FF3399]/20 transition-all"
                      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                    />
                  </div>
                  <div>
                    <Input
                      id="signup-email"
                      name="signupEmail"
                      type="email"
                      placeholder="Email"
                      value={email}
                      onChange={(e) => handleEmailChange(e.target.value)}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-[#FF3399] focus:ring-2 focus:ring-[#FF3399]/20 transition-all"
                      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                    />
                  </div>
                  <div>
                    <Input
                      id="signup-password"
                      name="signupPassword"
                      type="password"
                      placeholder="Password (min 6 characters)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-[#FF3399] focus:ring-2 focus:ring-[#FF3399]/20 transition-all"
                      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                    />
                  </div>
                  {authError && (
                    <p
                      className="text-[15px] font-medium leading-[1.5] text-red-600 text-center bg-red-50 rounded-lg px-3 py-2"
                      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                    >
                      {authError}
                    </p>
                  )}
                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#FF3399] hover:bg-[#E6007A] text-white font-semibold py-3 px-6 rounded-lg transition-all"
                    style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                  >
                    {loading ? 'Creating account...' : 'Sign Up'}
                  </Button>
                </form>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
