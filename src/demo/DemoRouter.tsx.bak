/**
 * Demo Router Component
 * 
 * Handles routing within demo mode only.
 * Used inside the mobile preview component-view page.
 */

import React, { useState } from 'react';
import { DemoHomePage } from './pages/DemoHomePage';
import { DemoDiscoverPage } from './pages/DemoDiscoverPage';
import { DemoProfilePage } from './pages/DemoProfilePage';
import { DemoMessagesPage } from './pages/DemoMessagesPage';
import { DemoCreatePostPage } from './pages/DemoCreatePostPage';

export type DemoPage = 'home' | 'discover' | 'profile' | 'messages' | 'create-post';

interface DemoRouterProps {
  initialPage?: DemoPage;
  menuOpen?: boolean;
  onMenuClick?: () => void;
}

export const DemoRouter: React.FC<DemoRouterProps> = ({
  initialPage = 'home',
  menuOpen = false,
  onMenuClick,
}) => {
  const [currentPage, setCurrentPage] = useState<DemoPage>(initialPage);

  const handleBack = () => {
    setCurrentPage('home');
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <DemoHomePage menuOpen={menuOpen} onMenuClick={onMenuClick} onNavigate={setCurrentPage} />;
      case 'discover':
        return <DemoDiscoverPage menuOpen={menuOpen} onMenuClick={onMenuClick} onNavigate={setCurrentPage} />;
      case 'profile':
        return <DemoProfilePage menuOpen={menuOpen} onMenuClick={onMenuClick} onNavigate={setCurrentPage} />;
      case 'messages':
        return <DemoMessagesPage menuOpen={menuOpen} onMenuClick={onMenuClick} onNavigate={setCurrentPage} />;
      case 'create-post':
        return <DemoCreatePostPage menuOpen={menuOpen} onMenuClick={onMenuClick} onNavigate={setCurrentPage} />;
      default:
        return <DemoHomePage menuOpen={menuOpen} onMenuClick={onMenuClick} onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div className="demo-router">
      {renderPage()}
    </div>
  );
};
