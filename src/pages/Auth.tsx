import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { handleAppleSignInFromNative, setupAppleSignInListeners } from '@/services/appleAuthService';
import { Capacitor } from '@capacitor/core';

// Add the elegant-shift animation keyframes
const styles = `
  @keyframes elegant-shift {
    0% { background-position: 0% 50%; }
    25% { background-position: 100% 50%; }
    50% { background-position: 100% 100%; }
    75% { background-position: 0% 100%; }
    100% { background-position: 0% 50%; }
  }
`;

// Inject styles into the document head
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = styles;
  document.head.appendChild(styleSheet);
}

interface AuthProps {
  onAuthSuccess: () => void;
}

export default function Auth({ onAuthSuccess }: AuthProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [appleSignInLoading, setAppleSignInLoading] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const { toast } = useToast();

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

  // Helper function to get redirect URL based on platform
  const getRedirectUrl = (path: string): string => {
    const isMobile = Capacitor.isNativePlatform();
    if (isMobile) {
      // Use custom URL scheme for mobile deep links
      // Remove leading slash and hash for mobile URLs
      // Supabase will append #access_token=... so we need synth://onboarding not synth://#onboarding
      let mobilePath = path.startsWith('/') ? path.substring(1) : path;
      mobilePath = mobilePath.startsWith('#') ? mobilePath.substring(1) : mobilePath;
      return `synth://${mobilePath}`;
    }
    // Use current origin for web (works in dev, staging, production)
    // Fallback to production URL if window is not available (SSR)
    const baseUrl = typeof window !== 'undefined' 
      ? window.location.origin 
      : 'https://synth-beta-testing.vercel.app';
    return `${baseUrl}${path}`;
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
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

      toast({
        title: "Check your email!",
        description: "We sent you a confirmation link.",
      });
    } catch (error: any) {
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (import.meta.env.DEV) {
        console.log('🔐 Attempting sign in...');
        console.log('Email:', email ? `${email.substring(0, 3)}***` : 'empty');
        console.log('Platform:', Capacitor.isNativePlatform() ? 'Mobile' : 'Web');
      }
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (import.meta.env.DEV) {
          console.error('❌ Sign in error:', error);
          console.error('Error code:', error.status);
          console.error('Error message:', error.message);
          console.error('Full error object:', JSON.stringify(error, null, 2));
        } else {
          // In production, log minimal error info
          console.error('Sign in failed:', error.message);
        }
        
        // Provide more helpful error messages
        let userMessage = error.message;
        if (error.status === 400) {
          userMessage = 'Invalid email or password. Please check your credentials.';
        } else if (error.status === 0 || error.message?.includes('fetch')) {
          userMessage = 'Network error. Please check your internet connection.';
        } else if (error.message?.includes('Invalid login credentials')) {
          userMessage = 'Invalid email or password.';
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
      toast({
        title: "Welcome back!",
        description: "You're now signed in.",
      });
      onAuthSuccess();
    } catch (error: any) {
      if (import.meta.env.DEV) {
        console.error('❌ Sign in failed:', error);
      }
      const errorMessage = error?.message || error?.msg || 'Unknown error occurred. Please try again.';
      toast({
        title: "Sign in failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({
        title: 'Email required',
        description: 'Please enter your email address first.',
        variant: 'destructive',
      });
      return;
    }

    setIsResettingPassword(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: getRedirectUrl('/reset-password'),
      });

      if (error) {
        throw error;
      }

      toast({
        title: 'Password reset email sent',
        description: 'Check your email for instructions to reset your password.',
      });
    } catch (error: any) {
      console.error('Error sending password reset:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to send password reset email.',
        variant: 'destructive',
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (!isIOS) {
      toast({
        title: "Not available",
        description: "Apple Sign In is only available on iOS devices.",
        variant: "destructive",
      });
      return;
    }

    setAppleSignInLoading(true);

    try {
      const result = await handleAppleSignInFromNative();
      
      if (result.success) {
        toast({
          title: "Welcome!",
          description: "You're now signed in with Apple.",
        });
        onAuthSuccess();
      } else {
        toast({
          title: "Sign in failed",
          description: result.error || "Failed to sign in with Apple",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Sign in failed",
        description: error.message || "Failed to sign in with Apple",
        variant: "destructive",
      });
    } finally {
      setAppleSignInLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{
      background: 'linear-gradient(45deg, #fdf2f8 0%, #ffffff 25%, #fce7f3 50%, #ffffff 75%, #fdf2f8 100%)',
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
          <CardTitle className="text-3xl font-bold text-black mb-2" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
            Synth
          </CardTitle>
          <CardDescription className="text-[#666666] text-base" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
            Connect with people at events you love
          </CardDescription>
        </CardHeader>
        <CardContent className="px-10 pb-10">
          <Tabs defaultValue="signin">
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
              <form onSubmit={handleSignIn} className="space-y-6">
                <div>
                  <Input
                    id="signin-email"
                    name="signinEmail"
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:border-[#FF3399] focus:ring-2 focus:ring-[#FF3399]/20 transition-all"
                    style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                  />
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
                    className="text-sm text-[#FF3399] hover:text-[#E6007A] transition-colors disabled:opacity-50"
                    style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                  >
                    {isResettingPassword ? 'Sending...' : 'Forgot password?'}
                  </button>
                </div>
                <Button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full bg-[#FF3399] hover:bg-[#E6007A] text-white font-semibold py-3 px-6 rounded-lg transition-all"
                  style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="signup" className="mt-6">
              <form onSubmit={handleSignUp} className="space-y-6">
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
                    onChange={(e) => setEmail(e.target.value)}
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
                <Button 
                  type="submit" 
                  disabled={loading} 
                  className="w-full bg-[#FF3399] hover:bg-[#E6007A] text-white font-semibold py-3 px-6 rounded-lg transition-all"
                  style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
                >
                  {loading ? 'Creating account...' : 'Sign Up'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
          
          {/* Apple Sign In Button - Only show on iOS */}
          {isIOS && (
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-gray-300" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white/90 text-gray-500" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}>
                    Or continue with
                  </span>
                </div>
              </div>
              <Button
                onClick={handleAppleSignIn}
                disabled={appleSignInLoading || loading}
                className="w-full mt-4 bg-black hover:bg-gray-800 text-white font-semibold py-3 px-6 rounded-lg transition-all flex items-center justify-center gap-2"
                style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif' }}
              >
                {appleSignInLoading ? (
                  'Signing in...'
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                    </svg>
                    Sign in with Apple
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}