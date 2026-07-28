import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';

interface LaunchHeroProps {
  onSignUpClick: () => void;
}

export const LaunchHero = ({ onSignUpClick }: LaunchHeroProps) => {
  return (
    <section className="pt-32 pb-32 px-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-pink-100/40 via-white to-pink-50/30" />
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-pink-200/30 rounded-full blur-3xl" />
      <div className="absolute bottom-1/4 left-1/4 w-96 h-96 bg-pink-100/40 rounded-full blur-3xl" />

      <div className="container mx-auto max-w-5xl relative z-10">
        <div className="text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full glass text-foreground text-sm font-medium">
            <Sparkles className="w-4 h-4 text-pink-600" />
            <span>Now in Beta - Join the Community</span>
          </div>

          <h1 className="text-6xl md:text-8xl font-bold tracking-tight text-balance leading-tight">
            Discover concerts.
            <br />
            <span className="text-pink-600">Connect with music.</span>
          </h1>

          <p className="text-xl md:text-2xl text-gray-600 max-w-2xl mx-auto text-balance leading-relaxed">
            Your social hub for live music. Find concerts, share reviews, and connect with fellow music lovers.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Button
              size="lg"
              onClick={onSignUpClick}
              className="bg-pink-600 text-white hover:bg-pink-700 text-lg px-10 h-14 rounded-full shadow-lg shadow-pink-600/20"
            >
              Sign Up
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default LaunchHero;
