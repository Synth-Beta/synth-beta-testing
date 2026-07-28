import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import SynthSLogo from '../components/SynthSLogo';
import {
  ArrowLeft,
  Heart,
  Music,
  Users,
  Star,
  MapPin,
  MessageCircle,
  Code,
  Database,
  TrendingUp,
  Briefcase,
  Target,
  Zap
} from 'lucide-react';

interface AboutPageProps {
  onBack: () => void;
}

export const AboutPage = ({ onBack }: AboutPageProps) => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-synth-beige-light via-white to-synth-beige-light">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-synth-pink/5 via-transparent to-synth-pink/5"></div>
      
      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <header className="p-6">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <Button
              onClick={handleBack}
              variant="ghost"
              className="flex items-center gap-2 text-synth-black hover:text-synth-pink"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12">
                <SynthSLogo size="md" />
              </div>
              <h1 className="text-2xl font-bold text-synth-black">Synth</h1>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-6 pb-12">
          {/* Hero Section */}
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-synth-black mb-6">
              About Synth
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto leading-relaxed">
              We're building the future of music community, where every concert becomes a shared experience
            </p>
          </div>

          {/* Mission Section */}
          <Card className="p-8 mb-12 bg-white/80 backdrop-blur-sm border-2 border-synth-pink/20">
            <div className="text-center mb-8">
              <div className="w-16 h-16 mx-auto mb-4 bg-synth-pink/10 rounded-full flex items-center justify-center">
                <Heart className="w-8 h-8 text-synth-pink" />
              </div>
              <h3 className="text-3xl font-bold text-synth-black mb-4">Our Mission</h3>
              <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                To create meaningful connections between music lovers and transform every concert into a shared adventure. 
                We believe that music is better when experienced together, and we're here to make that happen.
              </p>
            </div>
          </Card>

          {/* Features Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            <Card className="p-6 bg-white/60 backdrop-blur-sm border border-synth-pink/20 hover:bg-white/80 transition-all duration-300">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 bg-synth-pink/10 rounded-full flex items-center justify-center">
                  <Star className="w-6 h-6 text-synth-pink" />
                </div>
                <h4 className="font-semibold text-synth-black mb-2">Event Reviews</h4>
                <p className="text-sm text-gray-600">Share your concert experiences and help others discover amazing events</p>
              </div>
            </Card>

            <Card className="p-6 bg-white/60 backdrop-blur-sm border border-synth-pink/20 hover:bg-white/80 transition-all duration-300">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 bg-synth-pink/10 rounded-full flex items-center justify-center">
                  <MapPin className="w-6 h-6 text-synth-pink" />
                </div>
                <h4 className="font-semibold text-synth-black mb-2">Local Discovery</h4>
                <p className="text-sm text-gray-600">Find concerts and events happening in your area with personalized recommendations</p>
              </div>
            </Card>

            <Card className="p-6 bg-white/60 backdrop-blur-sm border border-synth-pink/20 hover:bg-white/80 transition-all duration-300">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 bg-synth-pink/10 rounded-full flex items-center justify-center">
                  <MessageCircle className="w-6 h-6 text-synth-pink" />
                </div>
                <h4 className="font-semibold text-synth-black mb-2">Community Chat</h4>
                <p className="text-sm text-gray-600">Connect with fellow music lovers and plan your next concert adventure together</p>
              </div>
            </Card>

            <Card className="p-6 bg-white/60 backdrop-blur-sm border border-synth-pink/20 hover:bg-white/80 transition-all duration-300">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 bg-synth-pink/10 rounded-full flex items-center justify-center">
                  <Users className="w-6 h-6 text-synth-pink" />
                </div>
                <h4 className="font-semibold text-synth-black mb-2">Smart Matching</h4>
                <p className="text-sm text-gray-600">Our algorithm connects you with people who share your music taste and interests</p>
              </div>
            </Card>

            <Card className="p-6 bg-white/60 backdrop-blur-sm border border-synth-pink/20 hover:bg-white/80 transition-all duration-300">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 bg-synth-pink/10 rounded-full flex items-center justify-center">
                  <Music className="w-6 h-6 text-synth-pink" />
                </div>
                <h4 className="font-semibold text-synth-black mb-2">Music Integration</h4>
                <p className="text-sm text-gray-600">Connect your music preferences to discover events and people who love the same artists</p>
              </div>
            </Card>

            <Card className="p-6 bg-white/60 backdrop-blur-sm border border-synth-pink/20 hover:bg-white/80 transition-all duration-300">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 bg-synth-pink/10 rounded-full flex items-center justify-center">
                  <Heart className="w-6 h-6 text-synth-pink" />
                </div>
                <h4 className="font-semibold text-synth-black mb-2">Safe Community</h4>
                <p className="text-sm text-gray-600">We prioritize safety and create a welcoming environment for all music lovers</p>
              </div>
            </Card>
          </div>

          {/* Team Section */}
          <Card className="p-8 mb-12 bg-white/80 backdrop-blur-sm border-2 border-synth-pink/20">
            <div className="text-center">
              <h3 className="text-3xl font-bold text-synth-black mb-8">Meet the Team</h3>
              <div className="max-w-4xl mx-auto">
                <div className="grid md:grid-cols-2 gap-8">
                  {/* Tej Patel */}
                  <div className="flex flex-col items-center p-6 bg-white/60 rounded-2xl border border-synth-pink/20 hover:bg-white/80 transition-all duration-300">
                    <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-synth-pink/20 mb-4 bg-gradient-to-br from-synth-pink/20 to-synth-pink/10 flex items-center justify-center">
                      <img 
                        src="/Tej-Patel.jpg" 
                        alt="Tej Patel"
                        className="w-full h-full object-cover object-center"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const fallback = target.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                      <div className="text-synth-pink text-4xl font-bold" style={{ display: 'none' }}>TP</div>
                    </div>
                    <div className="text-center">
                      <h4 className="text-xl font-bold text-synth-black mb-2">Tej Patel</h4>
                      <div className="flex items-center justify-center gap-2 mb-3">
                        <Code className="w-4 h-4 text-synth-pink" />
                        <Database className="w-4 h-4 text-synth-pink" />
                        <Zap className="w-4 h-4 text-synth-pink" />
                      </div>
                      <p className="text-synth-pink font-semibold mb-3">Technology, Data, and Back End Development</p>
                      <p className="text-gray-600 mb-4 text-sm">
                        Innovative technologist with deep expertise in building scalable systems. 
                        Experience spans designing robust back-end for high-growth SaaS platforms.
                      </p>
                      <div className="flex items-center justify-center gap-2 text-sm text-synth-pink">
                        <Music className="w-4 h-4" />
                        <span className="font-medium">Big venue concert lover • 20+ arena shows</span>
                      </div>
                    </div>
                  </div>

                  {/* Sam Loiterstein */}
                  <div className="flex flex-col items-center p-6 bg-white/60 rounded-2xl border border-synth-pink/20 hover:bg-white/80 transition-all duration-300">
                    <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-synth-pink/20 mb-4 bg-gradient-to-br from-synth-pink/20 to-synth-pink/10 flex items-center justify-center">
                      <img 
                        src="/Sam-Loiterstein.jpg" 
                        alt="Sam Loiterstein"
                        className="w-full h-full object-cover object-center"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const fallback = target.nextElementSibling as HTMLElement;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                      <div className="text-synth-pink text-4xl font-bold" style={{ display: 'none' }}>SL</div>
                    </div>
                    <div className="text-center">
                      <h4 className="text-xl font-bold text-synth-black mb-2">Sam Loiterstein</h4>
                      <div className="flex items-center justify-center gap-2 mb-3">
                        <TrendingUp className="w-4 h-4 text-synth-pink" />
                        <Briefcase className="w-4 h-4 text-synth-pink" />
                        <Target className="w-4 h-4 text-synth-pink" />
                      </div>
                      <p className="text-synth-pink font-semibold mb-3">Business Development, Strategic Growth</p>
                      <p className="text-gray-600 mb-4 text-sm">
                        Data-driven leader with robust entrepreneurial and sales experience. 
                        3 years experience in Bootstrapped thru $60M+ B2B firms ranging intern to founder.
                      </p>
                      <div className="flex items-center justify-center gap-2 text-sm text-synth-pink">
                        <Star className="w-4 h-4" />
                        <span className="font-medium">Live music superfan • 67+ attended in 2024, far too many alone</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Story Section */}
          <Card className="p-8 bg-white/80 backdrop-blur-sm border-2 border-synth-pink/20">
            <div className="text-center">
              <h3 className="text-3xl font-bold text-synth-black mb-6">Our Story</h3>
              <div className="max-w-3xl mx-auto space-y-4 text-gray-600">
                <p>
                  Synth was born from a simple observation: some of the best concert experiences happen when you're sharing them with others. 
                  Whether it's discovering a new favorite artist together or having someone to dance with during your favorite song, 
                  music becomes more meaningful when it's shared.
                </p>
                <p>
                  We noticed that many music lovers were attending concerts alone, missing out on the social aspect that makes live music so special. 
                  That's when we decided to create a platform that would bring music lovers together, not just for the music, but for the community.
                </p>
              </div>
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
};
