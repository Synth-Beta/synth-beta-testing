import React from 'react';
import { cn } from '@/lib/utils';

interface SynthSLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export const SynthSLogo: React.FC<SynthSLogoProps> = ({ 
  size = 'md', 
  className 
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  };

  return (
    <div className={cn('inline-block', sizeClasses[size], className)}>
      <img
        src="/Logos/Main logo black background.png"
        alt="Synth Logo"
        className="w-full h-full object-contain"
      />
    </div>
  );
};

export default SynthSLogo;
