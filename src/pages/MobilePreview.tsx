import React, { useState } from 'react';
import { MobileHeader } from '@/components/mobile/MobileHeader';
import { MobileNavigation } from '@/components/mobile/MobileNavigation';
import { HomeFeed } from '@/components/home/HomeFeed';
import { DiscoverView } from '@/components/discover/DiscoverView';
import { ProfileView } from '@/components/profile/ProfileView';
import { UnifiedChatView } from '@/components/UnifiedChatView';
import { useAuth } from '@/hooks/useAuth';
import Auth from '@/pages/Auth';
/* Design tokens are imported globally via index.css */

type ViewType = 'feed' | 'search' | 'profile' | 'chat';

/**
 * Mobile Preview Page
 * 
 * Preview route for mobile UI matching Figma design.
 * Accessible only via /mobile-preview route.
 * 
 * Features:
 * - MobileHeader with hamburger menu and notification bell
 * - MobileNavigation with SVG icons and selected states
 * - Main content views (feed, search, profile, chat)
 * 
 * This is a preview route for beta testing and should not affect production routes.
 */
const MobilePreview: React.FC = () => {
  const { user, loading } = useAuth();
  const [currentView, setCurrentView] = useState<ViewType>('feed');
  const [showEventReviewModal, setShowEventReviewModal] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | undefined>(undefined);

  // Show auth if no user
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fdf2f7]">
        <div className="text-center space-y-6">
          <div className="w-32 h-32 mx-auto">
            <img
              src="/Logos/Main logo black background.png"
              alt="Synth Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#cc2486] mx-auto"></div>
          <p className="text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user?.id) {
    return <Auth onAuthSuccess={() => {}} />;
  }

  const handleViewChange = (view: ViewType) => {
    setCurrentView(view);
    // Clear profileUserId when navigating away from profile
    if (view !== 'profile') {
      setProfileUserId(undefined);
    }
  };

  const handleNavigateToNotifications = () => {
    // Navigate to notifications - can be implemented later
    console.log('Navigate to notifications');
  };

  const handleMenuClick = () => {
    // Handle hamburger menu click - can be implemented later
    console.log('Menu clicked');
  };

  const handleNavigateToProfile = (userId: string) => {
    setProfileUserId(userId);
    setCurrentView('profile');
  };

  const handleNavigateToChat = (userIdOrChatId: string) => {
    setCurrentView('chat');
  };

  const handleBack = () => {
    // Use browser history navigation if available, otherwise fallback to feed
    // This allows back button to return to previous screen instead of always going to feed
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setCurrentView('feed');
    }
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'feed':
        return (
          <HomeFeed
            currentUserId={user.id}
            onNavigateToNotifications={handleNavigateToNotifications}
            onNavigateToProfile={handleNavigateToProfile}
            onNavigateToChat={handleNavigateToChat}
            onViewChange={handleViewChange}
          />
        );
      case 'search':
        return (
          <DiscoverView
            currentUserId={user.id}
            onBack={handleBack}
            onNavigateToProfile={handleNavigateToProfile}
            onNavigateToChat={handleNavigateToChat}
            onNavigateToNotifications={handleNavigateToNotifications}
            onViewChange={handleViewChange}
          />
        );
      case 'profile':
        return (
          <ProfileView
            currentUserId={user.id}
            profileUserId={profileUserId}
            onBack={handleBack}
            onEdit={() => {}}
            onSettings={() => {}}
            onSignOut={() => {}}
            onNavigateToProfile={handleNavigateToProfile}
            onNavigateToChat={handleNavigateToChat}
            onNavigateToNotifications={handleNavigateToNotifications}
            onViewChange={handleViewChange}
          />
        );
      case 'chat':
        return (
          <UnifiedChatView
            currentUserId={user.id}
            onBack={handleBack}
          />
        );
      default:
        return (
          <HomeFeed
            currentUserId={user.id}
            onNavigateToNotifications={handleNavigateToNotifications}
            onNavigateToProfile={handleNavigateToProfile}
            onNavigateToChat={handleNavigateToChat}
            onViewChange={handleViewChange}
          />
        );
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: 'var(--off-white, #fcfcfc)',
        paddingTop: 'calc(59px + env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(100px, calc(100px + env(safe-area-inset-bottom, 0px)))',
      }}
    >
      {/* Mobile Header */}
      <MobileHeader
        currentUserId={user.id}
        onNavigateToNotifications={handleNavigateToNotifications}
        onMenuClick={handleMenuClick}
      />

      {/* Main Content */}
      <div className="w-full max-w-full">
        {renderCurrentView()}
      </div>

      {/* Mobile Navigation */}
      <MobileNavigation
        currentView={currentView}
        onViewChange={handleViewChange}
        onOpenEventReview={() => setShowEventReviewModal(true)}
      />
    </div>
  );
};

export default MobilePreview;

