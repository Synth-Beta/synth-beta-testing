import React from 'react';
import { Music2 } from 'lucide-react';

export const LaunchHeader = () => {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-border/50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-pink-600 rounded-lg flex items-center justify-center">
            <Music2 className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-xl text-gray-900">Synth</span>
        </div>
        <nav className="flex items-center gap-8">
          <a href="#features" className="text-sm font-medium text-gray-600 hover:text-pink-600 transition-colors">
            Features
          </a>
          <a href="#preview" className="text-sm font-medium text-gray-600 hover:text-pink-600 transition-colors">
            Preview
          </a>
        </nav>
      </div>
    </header>
  );
};

export default LaunchHeader;
