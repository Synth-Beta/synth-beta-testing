import React from 'react';
import { HomeFeed } from '@/components/home/HomeFeed';

interface DiscoverViewProps {
  currentUserId: string;
  onBack: () => void;
  onNavigateToNotifications?: () => void;
  onNavigateToProfile?: (userId: string) => void;
  onNavigateToChat?: (userId: string) => void;
  onViewChange?: (view: 'feed' | 'search' | 'profile') => void;
}

export const DiscoverView: React.FC<DiscoverViewProps> = ({
  currentUserId,
  onBack,
  onNavigateToNotifications,
  onNavigateToProfile,
  onNavigateToChat,
  onViewChange,
}) => {
  return (
    <HomeFeed
      currentUserId={currentUserId}
      onNavigateToNotifications={onNavigateToNotifications}
      onNavigateToProfile={onNavigateToProfile}
      onNavigateToChat={onNavigateToChat}
      onViewChange={onViewChange}
    />
  );
};
