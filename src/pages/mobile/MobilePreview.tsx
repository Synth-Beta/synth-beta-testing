import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { MobileHeader } from '@/components/Header/MobileHeader';
import { BottomNav } from '@/components/BottomNav/BottomNav';
import { SideMenu } from '@/components/SideMenu/SideMenu';
import { useLockBodyScroll } from '@/hooks/useLockBodyScroll';
import HomePage from './HomePage';
import DiscoverPage from './DiscoverPage';
import PostPage from './PostPage';
import MessagesPage from './MessagesPage';
import ProfilePage from './ProfilePage';
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
          <Route index element={<Navigate to="home" replace />} />
          <Route path="home" element={<HomePage />} />
          <Route path="discover" element={<DiscoverPage />} />
          <Route path="post" element={<PostPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="profile" element={<ProfilePage />} />
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

