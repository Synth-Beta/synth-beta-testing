import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import './PagesModal.css';

export interface PagesModalProps {
  /**
   * Whether the modal is open
   */
  isOpen: boolean;
  
  /**
   * Callback to close the modal
   */
  onClose: () => void;
}

/**
 * Pages Modal Component
 * 
 * Displays all pages organized by category.
 * Clicking on a page name navigates to that page.
 */
export const PagesModal: React.FC<PagesModalProps> = ({
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate();

  if (!isOpen) {
    return null;
  }

  const handlePageClick = (path: string) => {
    navigate(path);
    onClose();
  };

  // Define pages by category
  const pageCategories = [
    {
      title: 'Onboarding & Login',
      pages: [
        { name: 'Sign In', path: '/' },
        { name: 'Sign Up', path: '/' },
        { name: 'Onboarding Flow', path: '/' },
      ],
    },
    {
      title: 'Home',
      pages: [
        { name: 'Home Feed', path: '/mobile-preview/home' },
        { name: 'Unified Feed', path: '/' },
      ],
    },
    {
      title: 'Discover',
      pages: [
        { name: 'Discover', path: '/mobile-preview/discover' },
        { name: 'Search', path: '/' },
        { name: 'Map View', path: '/' },
      ],
    },
    {
      title: 'Post',
      pages: [
        { name: 'Create Post', path: '/mobile-preview/post' },
        { name: 'Event Review', path: '/' },
      ],
    },
    {
      title: 'Messages',
      pages: [
        { name: 'Messages', path: '/mobile-preview/messages' },
        { name: 'Chat', path: '/' },
      ],
    },
    {
      title: 'Profile',
      pages: [
        { name: 'Profile', path: '/mobile-preview/profile' },
        { name: 'Edit Profile', path: '/' },
        { name: 'Settings', path: '/' },
        { name: 'Following', path: '/' },
        { name: 'Followers', path: '/' },
      ],
    },
    {
      title: 'Side Menu',
      pages: [
        { name: 'Activity', path: '/' },
        { name: 'Profile & Preferences', path: '/' },
        { name: 'Event Timeline', path: '/' },
        { name: 'Help & Support', path: '/' },
        { name: 'About', path: '/' },
        { name: 'Settings', path: '/' },
      ],
    },
    {
      title: 'Detail Pages',
      pages: [
        { name: 'Event Details', path: '/' },
        { name: 'Artist Profile', path: '/' },
        { name: 'Venue Profile', path: '/' },
        { name: 'Notifications', path: '/' },
        { name: 'Analytics', path: '/' },
      ],
    },
  ];

  return (
    <>
      {/* Overlay */}
      <div
        className="pages-modal__overlay"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div className="pages-modal" role="dialog" aria-modal="true" aria-label="All Pages">
        {/* Header with X button */}
        <div className="pages-modal__header">
          <button
            className="pages-modal__close-button"
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            <Icon name="x" size={24} alt="" />
          </button>
        </div>

        {/* Content */}
        <div className="pages-modal__content">
          {pageCategories.map((category, categoryIndex) => (
            <div key={categoryIndex} className="pages-modal__category">
              <h1 className="pages-modal__category-title">{category.title}</h1>
              <ul className="pages-modal__page-list">
                {category.pages.map((page, pageIndex) => (
                  <li key={pageIndex} className="pages-modal__page-item">
                    <button
                      className="pages-modal__page-button"
                      onClick={() => handlePageClick(page.path)}
                      type="button"
                    >
                      {page.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default PagesModal;

