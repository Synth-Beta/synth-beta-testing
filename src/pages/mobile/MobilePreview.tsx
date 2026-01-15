import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MobileHeader } from '@/components/Header/MobileHeader';
import { BottomNav } from '@/components/BottomNav/BottomNav';
import { SideMenu } from '@/components/SideMenu/SideMenu';
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll';
import ComponentShowcase from './ComponentShowcase';
import { DemoHomePage } from '@/demo/pages/DemoHomePage';
import { DemoDiscoverPage } from '@/demo/pages/DemoDiscoverPage';
import { DemoProfilePage } from '@/demo/pages/DemoProfilePage';
import { DemoMessagesPage } from '@/demo/pages/DemoMessagesPage';
import { DemoCreatePostPage } from '@/demo/pages/DemoCreatePostPage';
import './MobilePreview.css';

/**
 * Mobile Preview Page
 * 
 * Preview route for mobile UI matching Figma design.
 * Accessible only via /mobile-preview route.
 * 
 * Layout:
 * - MobileHeader (fixed top)
 * - Main content area (with bottom padding for BottomNav)
 * - BottomNav (fixed bottom)
 */
const MobilePreview: React.FC = () => {
  const [menuOpen, setMenuOpen] = React.useState(false);

  // Lock body scroll when menu is open
  useLockBodyScroll(menuOpen);

  const handleMenuToggle = () => {
    setMenuOpen(!menuOpen);
  };

  const handleMenuClose = () => {
    setMenuOpen(false);
  };

  return (
    <div className="mobile-preview">
      <MobileHeader menuOpen={menuOpen} onMenuClick={handleMenuToggle} />
      
      <main className="mobile-preview__content">
        <Routes>
          <Route index element={<Navigate to="component-view" replace />} />
          <Route path="component-view" element={<ComponentShowcase />} />
          {/* Demo Mode Routes */}
          <Route path="demo/home" element={<DemoHomePage menuOpen={menuOpen} onMenuClick={handleMenuToggle} />} />
          <Route path="demo/discover" element={<DemoDiscoverPage menuOpen={menuOpen} onMenuClick={handleMenuToggle} />} />
          <Route path="demo/profile" element={<DemoProfilePage menuOpen={menuOpen} onMenuClick={handleMenuToggle} />} />
          <Route path="demo/messages" element={<DemoMessagesPage menuOpen={menuOpen} onMenuClick={handleMenuToggle} />} />
          <Route path="demo/create-post" element={<DemoCreatePostPage menuOpen={menuOpen} onMenuClick={handleMenuToggle} />} />
        </Routes>
      </main>

      <BottomNav />

      {/* Side Menu */}
      <SideMenu
        isOpen={menuOpen}
        onClose={handleMenuClose}
        onToggle={handleMenuToggle}
      />
    </div>
  );
};

export default MobilePreview;

