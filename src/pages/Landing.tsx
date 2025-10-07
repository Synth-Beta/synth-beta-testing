import React from 'react';
import { LandingPage } from '@/components/LandingPage';

const Landing = () => {
  console.log('🏠 Landing component is rendering...');
  
  const handleGetStarted = () => {
    // Navigate to the app
    window.location.href = '/app';
  };

  return <LandingPage onGetStarted={handleGetStarted} />;
};

export default Landing;
