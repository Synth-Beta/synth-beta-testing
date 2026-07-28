import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowRight } from 'lucide-react';

interface LaunchCTAProps {
  onSignUpClick: () => void;
}

export const LaunchCTA = ({ onSignUpClick }: LaunchCTAProps) => {
  return (
    <section id="download" className="py-32 px-4 relative">
      <div className="absolute inset-0 bg-gradient-to-t from-pink-50/40 via-transparent to-transparent" />

      <div className="container mx-auto max-w-4xl relative z-10">
        <div className="glass p-12 md:p-16 text-center space-y-8 rounded-3xl shadow-2xl shadow-pink-600/10">
          <div className="space-y-6">
            <h2 className="text-5xl md:text-6xl font-bold text-balance leading-tight text-gray-900">
              Ready to discover your next concert?
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto text-balance leading-relaxed">
              Join the community of music lovers. Get early access and be part of something special.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto pt-4">
            <Button
              size="lg"
              onClick={onSignUpClick}
              className="bg-pink-600 text-white hover:bg-pink-700 h-14 px-10 whitespace-nowrap rounded-full shadow-lg shadow-pink-600/20"
            >
              Sign Up
              <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </div>

          <p className="text-sm text-gray-600 pt-2">Available on iOS and Android. No credit card required.</p>
        </div>
      </div>

      <footer className="container mx-auto max-w-6xl mt-24 pt-8 border-t border-gray-200/50">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-600">© 2025 Synth. All rights reserved.</p>
          <div className="flex items-center gap-8">
            <a href="#" className="text-sm text-gray-600 hover:text-pink-600 transition-colors">
              Privacy
            </a>
            <a href="#" className="text-sm text-gray-600 hover:text-pink-600 transition-colors">
              Terms
            </a>
            <a href="#" className="text-sm text-gray-600 hover:text-pink-600 transition-colors">
              Contact
            </a>
          </div>
        </div>
      </footer>
    </section>
  );
};

export default LaunchCTA;
