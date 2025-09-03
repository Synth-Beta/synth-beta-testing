import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowRight, Users, Heart, Calendar } from 'lucide-react';
import heroImage from '@/assets/hero-events.jpg';

interface WelcomeScreenProps {
  onGetStarted: () => void;
}

export const WelcomeScreen = ({ onGetStarted }: WelcomeScreenProps) => {
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
            Never go to events alone again
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
              <Calendar className="w-6 h-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold text-card-foreground mb-1">Discover Events</h3>
                <p className="text-sm text-muted-foreground">Swipe through local events that match your interests</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-card/60 backdrop-blur-sm border-border/50">
            <div className="flex items-start gap-3">
              <Users className="w-6 h-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold text-card-foreground mb-1">Find Your Crew</h3>
                <p className="text-sm text-muted-foreground">Match with others who want to attend the same events</p>
              </div>
            </div>
          </Card>

          <Card className="p-4 bg-card/60 backdrop-blur-sm border-border/50">
            <div className="flex items-start gap-3">
              <Heart className="w-6 h-6 text-primary mt-1" />
              <div>
                <h3 className="font-semibold text-card-foreground mb-1">Go Together</h3>
                <p className="text-sm text-muted-foreground">Chat, plan, and experience amazing events with new friends</p>
              </div>
            </div>
          </Card>
        </div>

        {/* CTA Button */}
        <Button 
          onClick={onGetStarted}
          size="lg"
          className="w-full btn-swipe-like text-lg py-6 animate-pulse-glow"
        >
          Get Started
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Join the community and never miss out on great events
        </p>
      </div>
    </div>
  );
};