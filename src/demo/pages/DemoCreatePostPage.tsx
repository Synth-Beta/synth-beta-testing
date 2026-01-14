/**
 * Demo Create Post Page - Uses EXACT production EventReviewModal component
 * 
 * Only difference: uses mock event data
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MobileHeader } from '@/components/Header/MobileHeader';
import { EventReviewModal } from '@/components/reviews/EventReviewModal';
import { DEMO_USER, DEMO_EVENTS } from '../data/mockData';

interface DemoCreatePostPageProps {
  menuOpen?: boolean;
  onMenuClick?: () => void;
  onNavigate?: (page: 'home' | 'discover' | 'profile' | 'messages' | 'create-post') => void;
}

export const DemoCreatePostPage: React.FC<DemoCreatePostPageProps> = ({
  menuOpen = false,
  onMenuClick,
  onNavigate,
}) => {
  const navigate = useNavigate();
  const [reviewModalOpen, setReviewModalOpen] = useState(true);
  
  // Use first demo event as default
  const defaultEvent = DEMO_EVENTS[0];

  const handleBack = () => {
    if (onNavigate) {
      onNavigate('home');
    } else {
      navigate('/mobile-preview/component-view');
    }
  };

  const handleClose = () => {
    setReviewModalOpen(false);
    handleBack();
  };

  const handleSubmitted = () => {
    console.log('Demo: Review submitted (no-op in demo mode)');
    handleClose();
  };

  // Use EXACT production EventReviewModal component
  // Note: This will make API calls for search, but the UI is identical to production
  return (
    <div className="min-h-screen bg-[#fcfcfc]">
      <MobileHeader menuOpen={menuOpen} onMenuClick={onMenuClick}>
        <h1 className="font-bold text-[24px] text-[#0e0e0e] leading-[normal]">Create Review</h1>
      </MobileHeader>

      <EventReviewModal
        event={defaultEvent as any}
        userId={DEMO_USER.id}
        isOpen={reviewModalOpen}
        onClose={handleClose}
        onReviewSubmitted={handleSubmitted}
      />
    </div>
  );
};
