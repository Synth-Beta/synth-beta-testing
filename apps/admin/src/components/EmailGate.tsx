import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SynthSLogo } from '@/components/SynthSLogo';
import { Loader2, Mail } from 'lucide-react';
import { EmailGateService } from '@/services/emailGateService';
import { useToast } from '@/hooks/use-toast';

interface EmailGateProps {
  onComplete: () => void;
}

export const EmailGate: React.FC<EmailGateProps> = ({ onComplete }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [userIP, setUserIP] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    checkEmailGate();
  }, []);

  const checkEmailGate = async () => {
    try {
      // Get user's IP address
      const ip = await EmailGateService.getUserIP();
      setUserIP(ip);

      // Check if IP has already submitted email
      const exists = await EmailGateService.checkIPExists(ip);

      if (exists) {
        // IP already submitted, allow access
        onComplete();
      } else {
        // Show email gate
        setIsOpen(true);
      }
    } catch (error) {
      console.error('Error checking email gate:', error);
      // On error, allow access to not block users
      onComplete();
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: 'Invalid Email',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const success = await EmailGateService.submitEmail(email, userIP);

      if (success) {
        toast({
          title: 'Welcome!',
          description: 'Thank you for your interest. Enjoy exploring Synth!',
        });
        setIsOpen(false);
        onComplete();
      } else {
        toast({
          title: 'Error',
          description: 'Failed to submit email. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error submitting email:', error);
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state while checking IP
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10">
        <div className="text-center space-y-6">
          <div className="w-32 h-32 mx-auto">
            <img
              src="/Logos/Main logo black background.png"
              alt="Synth Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-pink-900 to-blue-900 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-pink-500/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl p-8 shadow-2xl">
          <div className="text-center space-y-6">
            <div className="w-20 h-20 mx-auto relative">
              <img
                src="/Logos/Main logo black background.png"
                alt="Synth Logo"
                className="w-full h-full object-contain"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-pink-400 to-blue-400 rounded-full blur-xl opacity-30 animate-pulse"></div>
            </div>
            
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                Welcome to Synth
              </h1>
              <p className="text-white/80">
                Your ultimate music community platform. Enter your email to get started.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-white/60" />
                <Input
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-12 bg-white/10 backdrop-blur-md border-white/20 text-white placeholder:text-white/60 focus:ring-2 focus:ring-pink-400 h-12"
                  required
                  autoFocus
                  disabled={isSubmitting}
                />
              </div>
              
              <p className="text-xs text-white/60 text-center">
                We respect your privacy. Your email will only be used to keep you updated about Synth.
              </p>

              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-pink-500 to-blue-500 hover:from-pink-600 hover:to-blue-600 text-white h-12 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105"
                disabled={isSubmitting || !email}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Joining...
                  </>
                ) : (
                  'Join the Community'
                )}
              </Button>
            </form>

            <div className="text-center">
              <p className="text-xs text-white/60">
                By continuing, you agree to our{' '}
                <a href="#" className="underline hover:text-white transition-colors">
                  Terms of Service
                </a>{' '}
                and{' '}
                <a href="#" className="underline hover:text-white transition-colors">
                  Privacy Policy
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

