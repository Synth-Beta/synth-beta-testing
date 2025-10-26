import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
  const { toast } = useToast();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: 'https://synth-beta-testing.vercel.app/#onboarding',
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
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast({
        title: "Welcome back!",
        description: "You're now signed in.",
      });
      onAuthSuccess();
    } catch (error: any) {
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
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
        </CardContent>
      </Card>
    </div>
  );
}