import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SynthSLogo } from '@/components/SynthSLogo';
import { ArrowLeft, Music, Calendar, User, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { InviteCodeModal } from '@/components/InviteCodeModal';
import { JuicerEmbed } from '@/components/JuicerEmbed';

const Preview = () => {
  const navigate = useNavigate();
  const [showInviteModal, setShowInviteModal] = useState(false);

  const handleBackToHome = () => {
    navigate('/home');
  };

  const handleRequestAccess = () => {
    setShowInviteModal(true);
  };

  return (
    <div className="min-h-screen synth-gradient-card p-4">
      <div className="max-w-6xl mx-auto pt-16">
        {/* Header Section */}
        <div className="text-center mb-16">
          <Button
            variant="ghost"
            onClick={handleBackToHome}
            className="mb-8 hover-button"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
          
          <div className="w-64 h-64 mx-auto mb-8">
            <img
              src="/Logos/Main logo black background.png"
              alt="Synth Logo"
              className="w-full h-full object-contain"
            />
          </div>
          
          <h1 className="synth-heading text-4xl mb-4 gradient-text">
            See Synth in Action
          </h1>
          <p className="synth-text text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            Take a peek at what makes Synth the ultimate platform for music lovers. Discover events, share experiences, and connect with your music crew.
          </p>
        </div>

        {/* App Screenshots Section */}
        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {/* Main Feed Screenshot */}
          <Card className="synth-card p-6 bg-card/80 backdrop-blur-sm border-border/50 hover-card">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl flex items-center justify-center">
                <Music className="w-8 h-8 text-white" />
              </div>
              <h3 className="synth-heading text-xl mb-4">Discover Events</h3>
              <div className="mb-6">
                <img
                  src="/screenshots/main-feed.png"
                  alt="Main Feed Screenshot"
                  className="w-full h-64 object-cover rounded-lg border border-border/30"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder.svg';
                  }}
                />
              </div>
              <p className="synth-text text-muted-foreground mb-6">
                Browse upcoming concerts and events in your area. See personalized recommendations based on your music taste and discover new artists.
              </p>
            </div>
          </Card>

          {/* Event Details Screenshot */}
          <Card className="synth-card p-6 bg-card/80 backdrop-blur-sm border-border/50 hover-card">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl flex items-center justify-center">
                <Calendar className="w-8 h-8 text-white" />
              </div>
              <h3 className="synth-heading text-xl mb-4">Event Details</h3>
              <div className="mb-6">
                <img
                  src="/screenshots/event-details.png"
                  alt="Event Details Screenshot"
                  className="w-full h-64 object-cover rounded-lg border border-border/30"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder.svg';
                  }}
                />
              </div>
              <p className="synth-text text-muted-foreground mb-6">
                Get detailed information about events including venue details, artist information, and reviews from other music lovers.
              </p>
            </div>
          </Card>

          {/* Profile Page Screenshot */}
          <Card className="synth-card p-6 bg-card/80 backdrop-blur-sm border-border/50 hover-card">
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-pink-500 to-pink-600 rounded-2xl flex items-center justify-center">
                <User className="w-8 h-8 text-white" />
              </div>
              <h3 className="synth-heading text-xl mb-4">Your Profile</h3>
              <div className="mb-6">
                <img
                  src="/screenshots/profile.png"
                  alt="Profile Page Screenshot"
                  className="w-full h-64 object-cover rounded-lg border border-border/30"
                  onError={(e) => {
                    e.currentTarget.src = '/placeholder.svg';
                  }}
                />
              </div>
              <p className="synth-text text-muted-foreground mb-6">
                Track your music journey, share reviews, and connect with friends who share your passion for live music experiences.
              </p>
            </div>
          </Card>
        </div>

        {/* Juicer Social Feed */}
        <div className="mb-16">
          <JuicerEmbed className="max-w-6xl" />
        </div>

        {/* Call to Action */}
        <div className="text-center mb-16">
          <Card className="synth-card p-12 bg-card/60 backdrop-blur-sm border-border/50 max-w-2xl mx-auto">
            <div className="w-20 h-20 mx-auto mb-8 bg-gradient-to-br from-pink-500 to-pink-600 rounded-3xl flex items-center justify-center">
              <Eye className="w-10 h-10 text-white" />
            </div>
            <h2 className="synth-heading text-3xl mb-6 gradient-text">
              Ready to Experience Synth?
            </h2>
            <p className="synth-text text-lg text-muted-foreground mb-8 leading-relaxed">
              Join the music community that's revolutionizing how we discover, share, and connect through live events.
            </p>
            <Button 
              onClick={handleRequestAccess}
              variant="synth"
              size="lg"
              className="hover-button px-8 py-6 text-lg"
            >
              Request Access
              <ArrowLeft className="w-5 h-5 ml-2 rotate-180" />
            </Button>
          </Card>
        </div>

        {/* Footer */}
        <div className="text-center py-8 border-t border-border/30">
          <p className="synth-text text-sm text-muted-foreground">
            Limited access during our beta launch. Get your invite code to join the community.
          </p>
        </div>
      </div>

      {/* Invite Code Modal */}
      <InviteCodeModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
      />
    </div>
  );
};

export default Preview;
