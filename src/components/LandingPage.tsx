import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SynthSLogo } from '@/components/SynthSLogo';
import { ArrowRight, ExternalLink, Users, Music, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface LandingPageProps {
  onGetStarted: () => void;
}

export const LandingPage = ({ onGetStarted }: LandingPageProps) => {
  const navigate = useNavigate();

  const handleMarketValidation = () => {
    window.open('https://forms.gle/E1r1KUSBu2Txnyxr7', '_blank');
  };

  const handleAboutUs = () => {
    navigate('/about');
  };

  return (
    <div className="min-h-screen synth-gradient-card p-4">
      <div className="max-w-4xl mx-auto pt-16">
        {/* Header Section */}
        <div className="text-center mb-16">
          <div className="w-80 h-80 mx-auto mb-8">
            <img
              src="/Logos/Backup Logo - with crowd (BLACK BACKGROUND).png"
              alt="Synth Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <p className="synth-text text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Discover, review, and connect through music events. Your ultimate platform for concert experiences and finding your music crew.
          </p>
        </div>

        {/* Main Action Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {/* Market Validation Form */}
          <Card className="synth-card p-8 bg-card/80 backdrop-blur-sm border-border/50 hover-card h-full flex flex-col">
            <div className="text-center flex flex-col h-full">
              <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl flex items-center justify-center">
                <Star className="w-8 h-8 text-white" />
              </div>
              <h3 className="synth-heading text-xl mb-4">Take Our Survey</h3>
              <p className="synth-text text-muted-foreground mb-6 flex-grow">
                Help us understand what you're looking for in a music community platform
              </p>
              <Button 
                onClick={handleMarketValidation}
                variant="synth"
                size="lg"
                className="w-full hover-button"
              >
                Take Survey
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>

          {/* About Us */}
          <Card className="synth-card p-8 bg-card/80 backdrop-blur-sm border-border/50 hover-card h-full flex flex-col">
            <div className="text-center flex flex-col h-full">
              <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl flex items-center justify-center">
                <Users className="w-8 h-8 text-white" />
              </div>
              <h3 className="synth-heading text-xl mb-4">About Us</h3>
              <p className="synth-text text-muted-foreground mb-6 flex-grow">
                Learn about our mission to connect music lovers and create unforgettable experiences
              </p>
              <Button 
                onClick={handleAboutUs}
                variant="synth"
                size="lg"
                className="w-full hover-button"
              >
                Learn More
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>

          {/* Demo Access */}
          <Card className="synth-card p-8 bg-card/80 backdrop-blur-sm border-border/50 hover-card h-full flex flex-col">
            <div className="text-center flex flex-col h-full">
              <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl flex items-center justify-center">
                <Music className="w-8 h-8 text-white" />
              </div>
              <h3 className="synth-heading text-xl mb-4">Try Demo</h3>
              <p className="synth-text text-muted-foreground mb-6 flex-grow">
                Experience the full Synth platform - discover events, connect with others, and share your music journey
              </p>
              <Button 
                onClick={onGetStarted}
                variant="synth"
                size="lg"
                className="w-full hover-button"
              >
                Get Started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </Card>
        </div>

        {/* Feature Highlights */}
        <div className="text-center mb-12">
          <h2 className="synth-heading text-3xl mb-8 gradient-text">
            What Makes Synth Special
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="synth-card p-6 bg-card/60 backdrop-blur-sm border-border/50">
              <Star className="w-8 h-8 text-synth-pink mx-auto mb-4" />
              <h4 className="synth-heading text-lg mb-2">Review & Rank</h4>
              <p className="synth-text text-sm text-muted-foreground">
                Share your concert experiences and help others discover amazing events
              </p>
            </div>
            <div className="synth-card p-6 bg-card/60 backdrop-blur-sm border-border/50">
              <Music className="w-8 h-8 text-synth-pink mx-auto mb-4" />
              <h4 className="synth-heading text-lg mb-2">Discover Events</h4>
              <p className="synth-text text-sm text-muted-foreground">
                Find upcoming concerts and events tailored to your music taste
              </p>
            </div>
            <div className="synth-card p-6 bg-card/60 backdrop-blur-sm border-border/50">
              <Users className="w-8 h-8 text-synth-pink mx-auto mb-4" />
              <h4 className="synth-heading text-lg mb-2">Connect & Match</h4>
              <p className="synth-text text-sm text-muted-foreground">
                Meet people who share your passion for music and live experiences
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center py-8 border-t border-border/30">
          <p className="synth-text text-sm text-muted-foreground">
            Join thousands of music lovers already discovering their next favorite event
          </p>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;