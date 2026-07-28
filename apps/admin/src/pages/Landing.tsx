import React from 'react';
import { LandingPage } from '@/components/LandingPage';

const Landing = () => {
  console.log('🏠 Landing component is rendering...');
  
  const handleGetStarted = () => {
    // Navigate to the preview page
    window.location.href = '/preview';
  };

  return <LandingPage onGetStarted={handleGetStarted} />;
};

export default Landing;
