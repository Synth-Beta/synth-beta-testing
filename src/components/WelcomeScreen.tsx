import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowRight, Users, Heart, Music, Star } from 'lucide-react';
import heroImage from '@/assets/hero-events.jpg';

interface WelcomeScreenProps {
  onGetStarted: () => void;
  onLogin?: () => void;
}

export const WelcomeScreen = ({ onGetStarted, onLogin }: WelcomeScreenProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/10 p-4">
      <div className="max-w-md mx-auto pt-12">
        {/* Logo & Title */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary-light rounded-2xl mx-auto mb-4 flex items-center justify-center animate-bounce-in">
            <Heart className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary-light bg-clip-text text-transparent mb-2">
            PlusOne
          </h1>
          <p className="text-lg text-muted-foreground">
            Find friends for local events
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
          <Card className="p-4 bg-card/60 backdrop-blur-sm border-border/50">
            <div className="flex items-start gap-3">
              <Star className="w-6 h-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold text-card-foreground mb-1">Review Events You've Been</h3>
                <p className="text-sm text-muted-foreground">Rank and review your past concert experiences</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-card/60 backdrop-blur-sm border-border/50">
            <div className="flex items-start gap-3">
              <Music className="w-6 h-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold text-card-foreground mb-1">Discover Future Events</h3>
                <p className="text-sm text-muted-foreground">Find upcoming concerts and events in your area</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-card/60 backdrop-blur-sm border-border/50">
            <div className="flex items-start gap-3">
              <Users className="w-6 h-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold text-card-foreground mb-1">Match with New People</h3>
                <p className="text-sm text-muted-foreground">Connect with others who share your music taste</p>
              </div>
            </div>
          </Card>
        </div>

        {/* CTA Buttons */}
        <div className="space-y-3">
          <Button 
            onClick={onGetStarted}
            size="lg"
            className="w-full btn-swipe-like text-lg py-6 animate-pulse-glow"
          >
            I'm Ready to Go Into the App
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
          
          {onLogin && (
            <Button 
              onClick={onLogin}
              variant="outline"
              size="lg"
              className="w-full text-lg py-6"
            >
              Already have an account? Sign In
            </Button>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Start ranking concerts and finding your music crew
        </p>
      </div>
    </div>
  );
};