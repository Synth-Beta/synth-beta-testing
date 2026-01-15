/**
 * Demo Mode Provider
 * 
 * Provides mock data context for demo mode.
 * Components can check if demo mode is active and use mock data instead of API calls.
 */

import React, { createContext, useContext, ReactNode } from 'react';
import { DEMO_USER, DEMO_EVENTS, DEMO_REVIEWS, DEMO_CHATS, DEMO_MESSAGES } from './data/mockData';

interface DemoModeContextType {
  isDemoMode: boolean;
  demoUser: typeof DEMO_USER;
  demoEvents: typeof DEMO_EVENTS;
  demoReviews: typeof DEMO_REVIEWS;
  demoChats: typeof DEMO_CHATS;
  demoMessages: typeof DEMO_MESSAGES;
}

const DemoModeContext = createContext<DemoModeContextType | null>(null);

export const useDemoMode = () => {
  const context = useContext(DemoModeContext);
  return context;
};

interface DemoModeProviderProps {
  children: ReactNode;
}

export const DemoModeProvider: React.FC<DemoModeProviderProps> = ({ children }) => {
  const value: DemoModeContextType = {
    isDemoMode: true,
    demoUser: DEMO_USER,
    demoEvents: DEMO_EVENTS,
    demoReviews: DEMO_REVIEWS,
    demoChats: DEMO_CHATS,
    demoMessages: DEMO_MESSAGES,
  };

  return (
    <DemoModeContext.Provider value={value}>
      {children}
    </DemoModeContext.Provider>
  );
};
