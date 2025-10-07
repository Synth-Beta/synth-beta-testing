import React from 'react';
import { LandingPage } from '@/components/LandingPage';
import { MainApp } from '@/components/MainApp';

const Home = () => {
  console.log('🏠 Home component is rendering...');
  
  // For now, we'll show the landing page for unauthenticated users
  // and the main app for authenticated users
  // This logic will be handled by the MainApp component itself
  return <MainApp />;
};

export default Home;
