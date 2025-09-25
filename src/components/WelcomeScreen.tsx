import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SynthSLogo } from '@/components/SynthSLogo';
import { ArrowRight, Users, Heart, Music, Star } from 'lucide-react';
import heroImage from '@/assets/hero-events.jpg';

interface WelcomeScreenProps {
  onGetStarted: () => void;
  onLogin?: () => void;
}

export const WelcomeScreen = ({ onGetStarted, onLogin }: WelcomeScreenProps) => {
  return (
    <div className="min-h-screen synth-gradient-card p-4">
      <div className="max-w-md mx-auto pt-12">
        {/* Synth Logo & Title */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 mx-auto mb-6 animate-bounce-in synth-glow">
            <SynthSLogo size="xl" />
          </div>
          <h1 className="synth-heading text-4xl mb-2">
            Welcome to Synth
          </h1>
          <p className="synth-text text-lg text-muted-foreground">
            Your music community awaits
          </p>
        </div>

        {/* Hero Image */}
        <div className="mb-8 rounded-2xl overflow-hidden shadow-lg">
          <img 
            src={heroImage} 
            alt="People enjoying events together"
            className="w-full h-64 object-cover"
          />
        </div>

        {/* Features */}
        <div className="space-y-4 mb-8">
          <Card className="synth-card p-4 bg-card/60 backdrop-blur-sm border-border/50">
            <div className="flex items-start gap-3">
              <Star className="w-6 h-6 text-synth-pink mt-1" />
              <div>
                <h3 className="synth-heading font-semibold mb-1">Review Events You've Been</h3>
                <p className="synth-text text-sm text-muted-foreground">Rank and review your past concert experiences</p>
              </div>
            </div>
          </Card>

          <Card className="synth-card p-4 bg-card/60 backdrop-blur-sm border-border/50">
            <div className="flex items-start gap-3">
              <Music className="w-6 h-6 text-synth-pink mt-1" />
              <div>
                <h3 className="synth-heading font-semibold mb-1">Discover Future Events</h3>
                <p className="synth-text text-sm text-muted-foreground">Find upcoming concerts and events in your area</p>
              </div>
            </div>
          </Card>

          <Card className="synth-card p-4 bg-card/60 backdrop-blur-sm border-border/50">
            <div className="flex items-start gap-3">
              <Users className="w-6 h-6 text-synth-pink mt-1" />
              <div>
                <h3 className="synth-heading font-semibold mb-1">Match with New People</h3>
                <p className="synth-text text-sm text-muted-foreground">Connect with others who share your music taste</p>
              </div>
            </div>
          </Card>
        </div>

        {/* CTA Buttons */}
        <div className="space-y-3">
          <Button 
            onClick={onGetStarted}
            size="lg"
            variant="synth"
            className="w-full text-lg py-6 animate-pulse-glow"
          >
            Join the Synth Community
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          
          {onLogin && (
            <Button 
              onClick={onLogin}
              variant="synth-secondary"
              size="lg"
              className="w-full text-lg py-6"
            >
              Already have an account? Sign In
            </Button>
          )}
        </div>

        <p className="synth-text text-center text-xs text-muted-foreground mt-4">
          Start discovering music and connecting with your crew
        </p>
      </div>
    </div>
  );
};