import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SynthSLogo } from '@/components/SynthSLogo';
import { ArrowLeft, Music, Users, Star, Heart, Linkedin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const About = () => {
  const navigate = useNavigate();

  const handleBackToHome = () => {
    navigate('/home');
  };

  const handleGetStarted = () => {
    navigate('/app');
  };

  return (
    <div className="min-h-screen synth-gradient-card p-4">
      <div className="max-w-6xl mx-auto pt-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <Button 
            onClick={handleBackToHome}
            variant="synth-secondary"
            size="sm"
            className="hover-button"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
          
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 animate-bounce-in synth-glow">
              <SynthSLogo size="lg" />
            </div>
            <h1 className="synth-heading text-4xl gradient-text">About Synth</h1>
          </div>
          
          <div className="w-20"></div> {/* Spacer for centering */}
        </div>

        {/* What is Synth Section */}
        <div className="text-center mb-16">
          <h2 className="synth-heading text-3xl mb-6">What is Synth?</h2>
          <p className="synth-text text-xl text-muted-foreground max-w-4xl mx-auto leading-relaxed mb-6">
            Synth is where music fans engage, catalog, and share their entire music life — from streaming to live shows — all in one place. 
            It's the social hub that turns concerts from a solo gamble into a shared experience.
          </p>
          <p className="synth-text text-lg text-muted-foreground max-w-4xl mx-auto leading-relaxed">
            We're the Letterboxd for live events, the Bumble for finding your +1, and the Yelp for artists and venues.
          </p>
        </div>

        {/* Founders Section */}
        <div className="mb-16">
          <h2 className="synth-heading text-3xl text-center mb-12">Meet Our Founders</h2>
          <div className="grid md:grid-cols-2 gap-8">
            {/* Sam Loiterstein */}
            <Card className="synth-card p-8 bg-card/80 backdrop-blur-sm border-border/50 hover-card">
              <div className="text-center">
                <div className="w-32 h-32 mx-auto mb-6 rounded-full overflow-hidden synth-glow">
                  <img 
                    src="/founders/Sam-Loiterstein.jpeg" 
                    alt="Sam Loiterstein" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="synth-heading text-2xl mb-2">Sam Loiterstein</h3>
                <p className="synth-text text-pink-600 font-semibold mb-4">Business Development, Strategic Growth</p>
                <p className="synth-text text-muted-foreground leading-relaxed mb-4">
                  Data-driven leader with robust entrepreneurial and sales experience. 3 years experience in Bootstrapped thru $60M+ B2B firms ranging intern to founder.
                </p>
                <p className="synth-text text-sm text-pink-500 font-medium mb-4">
                  Live music superfan • ~100 attended in 2024
                </p>
                <div className="flex justify-center">
                  <a 
                    href="https://www.linkedin.com/in/sam-loiterstein/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-pink-600 hover:text-pink-700 transition-colors"
                  >
                    <Linkedin className="w-6 h-6" />
                  </a>
                </div>
              </div>
            </Card>

            {/* Tej Patel */}
            <Card className="synth-card p-8 bg-card/80 backdrop-blur-sm border-border/50 hover-card">
              <div className="text-center">
                <div className="w-32 h-32 mx-auto mb-6 rounded-full overflow-hidden synth-glow">
                  <img 
                    src="/founders/Tej-Patel.JPG" 
                    alt="Tej Patel" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <h3 className="synth-heading text-2xl mb-2">Tej Patel</h3>
                <p className="synth-text text-pink-600 font-semibold mb-4">Technology, Data, and Back End Development</p>
                <p className="synth-text text-muted-foreground leading-relaxed mb-4">
                  Innovative technologist with deep expertise in building scalable systems. Experience spans designing robust back-end for high-growth SaaS platforms.
                </p>
                <p className="synth-text text-sm text-pink-500 font-medium mb-4">
                  Big venue concert lover • 20+ arena shows
                </p>
                <div className="flex justify-center">
                  <a 
                    href="https://www.linkedin.com/in/tej-patel-49740a28a/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-pink-600 hover:text-pink-700 transition-colors"
                  >
                    <Linkedin className="w-6 h-6" />
                  </a>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Values Section */}
        <div className="mb-16">
          <h2 className="synth-heading text-3xl text-center mb-12">Our Values</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="synth-card p-6 bg-card/60 backdrop-blur-sm border-border/50">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl flex items-center justify-center">
                  <Heart className="w-8 h-8 text-white" />
                </div>
                <h4 className="synth-heading text-xl mb-3">Authentic Connections</h4>
                <p className="synth-text text-sm text-muted-foreground">
                  We believe in fostering genuine relationships through shared musical experiences
                </p>
              </div>
            </Card>

            <Card className="synth-card p-6 bg-card/60 backdrop-blur-sm border-border/50">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl flex items-center justify-center">
                  <Music className="w-8 h-8 text-white" />
                </div>
                <h4 className="synth-heading text-xl mb-3">Music First</h4>
                <p className="synth-text text-sm text-muted-foreground">
                  Everything we build is designed to celebrate and enhance the live music experience
                </p>
              </div>
            </Card>

            <Card className="synth-card p-6 bg-card/60 backdrop-blur-sm border-border/50">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl flex items-center justify-center">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <h4 className="synth-heading text-xl mb-3">Community Driven</h4>
                <p className="synth-text text-sm text-muted-foreground">
                  Our platform grows and evolves based on the needs and feedback of our community
                </p>
              </div>
            </Card>
          </div>
        </div>

        {/* Story Section */}
        <div className="mb-16">
          <Card className="synth-card p-8 bg-card/80 backdrop-blur-sm border-border/50">
            <h2 className="synth-heading text-3xl text-center mb-8">Our Story</h2>
            <div className="max-w-4xl mx-auto">
              <p className="synth-text text-lg text-muted-foreground leading-relaxed mb-6">
                Synth was born from a simple observation: some of life's most meaningful connections happen 
                at concerts and music events. Yet, finding these events and the people who share your taste 
                was surprisingly difficult.
              </p>
              <p className="synth-text text-lg text-muted-foreground leading-relaxed mb-6">
                Tej and Sam met through their shared passion for live music, bonding over their love for discovering 
                new artists and the frustration of attending incredible shows alone. That conversation sparked 
                an idea: what if there was a platform that not only helped you find events but also connected 
                you with others who shared your musical journey?
              </p>
              <p className="synth-text text-lg text-muted-foreground leading-relaxed">
                Today, Synth is that platform. We're building the future of music community, where every 
                event is an opportunity to find your crew, share your experiences, and discover your next 
                favorite artist.
              </p>
            </div>
          </Card>
        </div>

        {/* CTA Section */}
        <div className="text-center">
          <Card className="synth-card p-8 bg-card/80 backdrop-blur-sm border-border/50 synth-glow">
            <h2 className="synth-heading text-3xl mb-4">Ready to Join the Community?</h2>
            <p className="synth-text text-lg text-muted-foreground mb-8">
              Start discovering events and connecting with fellow music lovers today
            </p>
            <Button 
              onClick={handleGetStarted}
              variant="synth"
              size="lg"
              className="hover-button animate-pulse-glow"
            >
              Get Started with Synth
              <Star className="w-5 h-5 ml-2" />
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default About;
