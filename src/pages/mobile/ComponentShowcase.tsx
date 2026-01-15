import React from 'react';
import { Icon } from '@/components/Icon';
import { SynthButton } from '@/components/Button/SynthButton';
import { Button } from '@/components/ui/button';
import { ProfilePicture } from '@/components/profile/ProfilePicture';
import { UserInfo } from '@/components/profile/UserInfo';
import { IconText } from '@/components/IconText';
import { MenuCategory } from '@/components/MenuCategory';
import { SearchBar } from '@/components/SearchBar';
import { EmptyState } from '@/components/EmptyState/EmptyState';
import { StarRating } from '@/components/StarRating/StarRating';
import { ChatListItem } from '@/components/chat/ChatListItem';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useNavigate } from 'react-router-dom';
import './ComponentShowcase.css';

/**
 * Component Showcase Page
 * 
 * Displays all design system components with all their variants.
 * Used for visual testing and reference during development.
 * 
 * Spacing:
 * - 60px between component groups
 * - 6px between variants within the same component group
 * 
 * Note: Header is provided by parent MobilePreview component
 */
const ComponentShowcase: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="component-showcase">
      
      <main className="component-showcase__content">
        <div className="component-showcase__header">
          <h1 className="component-showcase__title">Component Showcase</h1>
          <p className="component-showcase__subtitle">All design system components and variants</p>
        </div>

        {/* Color Palette */}
        <section className="component-group" style={{ marginTop: '60px' }}>
          <h2 className="component-group__title">Color Palette</h2>
          
          {/* Neutrals */}
          <div className="component-subgroup">
            <h3 className="component-subgroup__title">Neutrals</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
              gap: 'var(--spacing-small, 12px)',
              marginBottom: 'var(--spacing-grouped, 24px)'
            }}>
              {[
                { name: 'neutral-0', value: '#FFFFFF', label: 'Neutral 0' },
                { name: 'neutral-50', value: '#FCFCFC', label: 'Neutral 50' },
                { name: 'neutral-100', value: '#F5F5F5', label: 'Neutral 100' },
                { name: 'neutral-200', value: '#E6E6E6', label: 'Neutral 200' },
                { name: 'neutral-400', value: '#8A8F98', label: 'Neutral 400' },
                { name: 'neutral-600', value: '#5D646F', label: 'Neutral 600' },
                { name: 'neutral-900', value: '#0E0E0E', label: 'Neutral 900' },
              ].map((color) => (
                <div key={color.name} style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center',
                  gap: 'var(--spacing-inline, 6px)'
                }}>
                  <div 
                    style={{ 
                      width: '80px', 
                      height: '80px', 
                      backgroundColor: color.value,
                      border: color.name === 'neutral-0' || color.name === 'neutral-50' || color.name === 'neutral-100' ? '1px solid var(--neutral-200)' : 'none',
                      borderRadius: 'var(--radius-corner, 10px)',
                      boxShadow: '0 2px 4px 0 var(--shadow-color)'
                    }}
                  />
                  <span style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    color: 'var(--neutral-900)',
                    textAlign: 'center'
                  }}>
                    {color.label}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: '12px',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    color: 'var(--neutral-600)',
                    textAlign: 'center'
                  }}>
                    {color.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Brand Pinks */}
          <div className="component-subgroup">
            <h3 className="component-subgroup__title">Brand Pinks</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
              gap: 'var(--spacing-small, 12px)',
              marginBottom: 'var(--spacing-grouped, 24px)'
            }}>
              {[
                { name: 'brand-pink-050', value: '#FDF2F7', label: 'Brand Pink 050' },
                { name: 'brand-pink-500', value: '#CC2486', label: 'Brand Pink 500' },
                { name: 'brand-pink-600', value: '#951A6D', label: 'Brand Pink 600' },
                { name: 'brand-pink-700', value: '#7B1559', label: 'Brand Pink 700' },
              ].map((color) => (
                <div key={color.name} style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center',
                  gap: 'var(--spacing-inline, 6px)'
                }}>
                  <div 
                    style={{ 
                      width: '80px', 
                      height: '80px', 
                      backgroundColor: color.value,
                      border: color.name === 'brand-pink-050' ? '1px solid var(--neutral-200)' : 'none',
                      borderRadius: 'var(--radius-corner, 10px)',
                      boxShadow: '0 2px 4px 0 var(--shadow-color)'
                    }}
                  />
                  <span style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    color: 'var(--neutral-900)',
                    textAlign: 'center'
                  }}>
                    {color.label}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: '12px',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    color: 'var(--neutral-600)',
                    textAlign: 'center'
                  }}>
                    {color.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Status Colors */}
          <div className="component-subgroup">
            <h3 className="component-subgroup__title">Status</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
              gap: 'var(--spacing-small, 12px)',
              marginBottom: 'var(--spacing-grouped, 24px)'
            }}>
              {[
                { name: 'status-success-050', value: '#E6F4ED', label: 'Success 050' },
                { name: 'status-success-500', value: '#2E8B63', label: 'Success 500' },
                { name: 'status-warning-050', value: '#FFF6D6', label: 'Warning 050' },
                { name: 'status-warning-500', value: '#B88900', label: 'Warning 500' },
                { name: 'status-error-050', value: '#FDECEA', label: 'Error 050' },
                { name: 'status-error-500', value: '#C62828', label: 'Error 500' },
              ].map((color) => (
                <div key={color.name} style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center',
                  gap: 'var(--spacing-inline, 6px)'
                }}>
                  <div 
                    style={{ 
                      width: '80px', 
                      height: '80px', 
                      backgroundColor: color.value,
                      border: color.name.includes('050') ? '1px solid var(--neutral-200)' : 'none',
                      borderRadius: 'var(--radius-corner, 10px)',
                      boxShadow: '0 2px 4px 0 var(--shadow-color)'
                    }}
                  />
                  <span style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    color: 'var(--neutral-900)',
                    textAlign: 'center'
                  }}>
                    {color.label}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: '12px',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    color: 'var(--neutral-600)',
                    textAlign: 'center'
                  }}>
                    {color.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Info Colors */}
          <div className="component-subgroup">
            <h3 className="component-subgroup__title">Info</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
              gap: 'var(--spacing-small, 12px)',
              marginBottom: 'var(--spacing-grouped, 24px)'
            }}>
              {[
                { name: 'info-blue-050', value: '#F0F6FE', label: 'Info Blue 050' },
                { name: 'info-blue-500', value: '#1F66EA', label: 'Info Blue 500' },
              ].map((color) => (
                <div key={color.name} style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center',
                  gap: 'var(--spacing-inline, 6px)'
                }}>
                  <div 
                    style={{ 
                      width: '80px', 
                      height: '80px', 
                      backgroundColor: color.value,
                      border: color.name === 'info-blue-050' ? '1px solid var(--neutral-200)' : 'none',
                      borderRadius: 'var(--radius-corner, 10px)',
                      boxShadow: '0 2px 4px 0 var(--shadow-color)'
                    }}
                  />
                  <span style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    color: 'var(--neutral-900)',
                    textAlign: 'center'
                  }}>
                    {color.label}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: '12px',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    color: 'var(--neutral-600)',
                    textAlign: 'center'
                  }}>
                    {color.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* States / Overlays */}
          <div className="component-subgroup">
            <h3 className="component-subgroup__title">States / Overlays</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
              gap: 'var(--spacing-small, 12px)',
              marginBottom: 'var(--spacing-grouped, 24px)'
            }}>
              {[
                { name: 'state-disabled-bg', value: '#E6E6E6', label: 'Disabled BG' },
                { name: 'state-disabled-text', value: '#8A8F98', label: 'Disabled Text' },
                { name: 'overlay-50', value: 'rgba(14, 14, 14, 0.5)', label: 'Overlay 50%' },
                { name: 'overlay-20', value: 'rgba(14, 14, 14, 0.2)', label: 'Overlay 20%' },
              ].map((color) => (
                <div key={color.name} style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center',
                  gap: 'var(--spacing-inline, 6px)'
                }}>
                  <div 
                    style={{ 
                      width: '80px', 
                      height: '80px', 
                      backgroundColor: color.value,
                      border: color.name === 'state-disabled-bg' ? '1px solid var(--neutral-200)' : 'none',
                      borderRadius: 'var(--radius-corner, 10px)',
                      boxShadow: '0 2px 4px 0 var(--shadow-color)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Show checkerboard pattern for overlays */}
                    {(color.name === 'overlay-50' || color.name === 'overlay-20') && (
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage: `
                          linear-gradient(45deg, #ccc 25%, transparent 25%),
                          linear-gradient(-45deg, #ccc 25%, transparent 25%),
                          linear-gradient(45deg, transparent 75%, #ccc 75%),
                          linear-gradient(-45deg, transparent 75%, #ccc 75%)
                        `,
                        backgroundSize: '8px 8px',
                        backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                        opacity: 0.3
                      }} />
                    )}
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    color: 'var(--neutral-900)',
                    textAlign: 'center'
                  }}>
                    {color.label}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: '12px',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    color: 'var(--neutral-600)',
                    textAlign: 'center'
                  }}>
                    {color.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Rating Star */}
          <div className="component-subgroup">
            <h3 className="component-subgroup__title">Rating</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', 
              gap: 'var(--spacing-small, 12px)',
              marginBottom: 'var(--spacing-grouped, 24px)'
            }}>
              {[
                { name: 'rating-star', value: '#FCDC5F', label: 'Rating Star' },
              ].map((color) => (
                <div key={color.name} style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center',
                  gap: 'var(--spacing-inline, 6px)'
                }}>
                  <div 
                    style={{ 
                      width: '80px', 
                      height: '80px', 
                      backgroundColor: color.value,
                      borderRadius: 'var(--radius-corner, 10px)',
                      boxShadow: '0 2px 4px 0 var(--shadow-color)'
                    }}
                  />
                  <span style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    color: 'var(--neutral-900)',
                    textAlign: 'center'
                  }}>
                    {color.label}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: '12px',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    color: 'var(--neutral-600)',
                    textAlign: 'center'
                  }}>
                    {color.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Gradients */}
          <div className="component-subgroup">
            <h3 className="component-subgroup__title">Gradients</h3>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', 
              gap: 'var(--spacing-small, 12px)',
              marginBottom: 'var(--spacing-grouped, 24px)'
            }}>
              {[
                { name: 'gradient-brand', value: 'linear-gradient(135deg, #CC2486 0%, #8D1FF4 100%)', label: 'Brand Gradient' },
                { name: 'gradient-soft', value: 'linear-gradient(180deg, #FFFFFF 0%, #FDF2F7 100%)', label: 'Soft Gradient' },
              ].map((gradient) => (
                <div key={gradient.name} style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  alignItems: 'center',
                  gap: 'var(--spacing-inline, 6px)'
                }}>
                  <div 
                    style={{ 
                      width: '160px', 
                      height: '80px', 
                      background: gradient.value,
                      border: gradient.name === 'gradient-soft' ? '1px solid var(--neutral-200)' : 'none',
                      borderRadius: 'var(--radius-corner, 10px)',
                      boxShadow: '0 2px 4px 0 var(--shadow-color)'
                    }}
                  />
                  <span style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    color: 'var(--neutral-900)',
                    textAlign: 'center'
                  }}>
                    {gradient.label}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-family)',
                    fontSize: '11px',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    color: 'var(--neutral-600)',
                    textAlign: 'center',
                    wordBreak: 'break-word',
                    maxWidth: '160px'
                  }}>
                    {gradient.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Demo Mode Navigation */}
        <section className="component-group" style={{ marginTop: '60px' }}>
          <h2 className="component-group__title">Demo Mode</h2>
          <p style={{ 
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-meta-size, 16px)',
            color: 'var(--neutral-600)',
            marginBottom: '24px',
            lineHeight: '1.5'
          }}>
            Preview fully populated pages with realistic mock data. No login or network calls required.
          </p>
          <div className="component-variants" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <SynthButton
              variant="secondary"
              size="standard"
              fullWidth
              onClick={() => navigate('/mobile-preview/demo/home')}
            >
              Home Feed
            </SynthButton>
            <SynthButton
              variant="secondary"
              size="standard"
              fullWidth
              onClick={() => navigate('/mobile-preview/demo/discover')}
            >
              Discover
            </SynthButton>
            <SynthButton
              variant="secondary"
              size="standard"
              fullWidth
              onClick={() => navigate('/mobile-preview/demo/profile')}
            >
              Profile
            </SynthButton>
            <SynthButton
              variant="secondary"
              size="standard"
              fullWidth
              onClick={() => navigate('/mobile-preview/demo/messages')}
            >
              Messages
            </SynthButton>
            <SynthButton
              variant="secondary"
              size="standard"
              fullWidth
              onClick={() => navigate('/mobile-preview/demo/create-post')}
            >
              Create Post
            </SynthButton>
          </div>
        </section>

        {/* Icons */}
        <section className="component-group">
          <h2 className="component-group__title">Icons</h2>
          <div className="component-variants">
            <div className="component-variant">
              <p className="component-variant__label">Default (24px)</p>
              <Icon name="house" size={24} alt="Home" />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Small (17px)</p>
              <Icon name="heart" size={17} alt="Heart" />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Medium (35px)</p>
              <Icon name="heart" size={35} alt="Heart" />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Large (60px)</p>
              <Icon name="heart" size={60} alt="Heart" />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Selected Variants (24px)</p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Icon name="houseSelected" size={24} alt="Home Selected" />
                <Icon name="discoverSelected" size={24} alt="Discover Selected" />
                <Icon name="circleCommentSelected" size={24} alt="Messages Selected" />
                <Icon name="userSelected" size={24} alt="Profile Selected" />
              </div>
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Size Variants - Small (17px)</p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Icon name="smallMusic" size={17} alt="Small Music" />
                <Icon name="smallLocation" size={17} alt="Small Location" />
                <Icon name="smallCheck" size={17} alt="Small Check" />
              </div>
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Size Variants - Medium (35px)</p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Icon name="mediumStar" size={35} alt="Medium Star" />
                <Icon name="mediumMusic" size={35} alt="Medium Music" />
                <Icon name="mediumLocation" size={35} alt="Medium Location" />
                <Icon name="mediumSend" size={35} alt="Medium Send" />
                <Icon name="mediumDollar" size={35} alt="Medium Dollar" />
                <Icon name="mediumBuildings" size={35} alt="Medium Buildings" />
                <Icon name="mediumShootingStar" size={35} alt="Medium Shooting Star" />
                <Icon name="mediumMicrophone" size={35} alt="Medium Microphone" />
                <Icon name="mediumEdit" size={35} alt="Medium Edit" />
              </div>
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Size Variants - Large (60px)</p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <Icon name="largeHeart" size={60} alt="Large Heart" />
                <Icon name="largeStar" size={60} alt="Large Star" />
                <Icon name="largeVideo" size={60} alt="Large Video" />
                <Icon name="largeCamera" size={60} alt="Large Camera" />
                <Icon name="largeMusic" size={60} alt="Large Music" />
                <Icon name="largeMessaging" size={60} alt="Large Messaging" />
              </div>
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Various Icons (All Normal Size)</p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {/* Navigation - Using lucide-react icons */}
                <Icon name="house" size={24} alt="Home" />
                <Icon name="discover" size={24} alt="Discover" />
                <Icon name="circleComment" size={24} alt="Messages" />
                <Icon name="user" size={24} alt="Profile" />
                
                {/* Action */}
                <Icon name="plus" size={24} alt="Post" />
                <Icon name="plusBox" size={24} alt="Plus Box" />
                <Icon name="search" size={24} alt="Search" />
                <Icon name="send" size={24} alt="Send" />
                <Icon name="share" size={24} alt="Share" />
                <Icon name="upload" size={24} alt="Upload" />
                <Icon name="download" size={24} alt="Download" />
                <Icon name="edit" size={24} alt="Edit" />
                <Icon name="trash" size={24} alt="Delete" />
                <Icon name="refresh" size={24} alt="Refresh" />
                <Icon name="repeat" size={24} alt="Repeat" />
                
                {/* UI */}
                <Icon name="hamburgerMenu" size={24} alt="Menu" />
                <Icon name="bell" size={24} alt="Notifications" />
                <Icon name="settings" size={24} alt="Settings" />
                <Icon name="filter" size={24} alt="Filter" />
                <Icon name="sort" size={24} alt="Sort" />
                <Icon name="sortFilter" size={24} alt="Sort Filter" />
                <Icon name="x" size={24} alt="Close" />
                <Icon name="check" size={24} alt="Check" />
                <Icon name="checkMark" size={24} alt="Check Mark" />
                <Icon name="circleCheck" size={24} alt="Circle Check" />
                <Icon name="smallCheck" size={24} alt="Small Check" />
                <Icon name="minus" size={24} alt="Minus" />
                <Icon name="questionMark" size={24} alt="Question" />
                <Icon name="infoCircle" size={24} alt="Info" />
                <Icon name="exclamationTriangle" size={24} alt="Warning" />
                
                {/* Arrows & Navigation */}
                <Icon name="arrowDown" size={24} alt="Arrow Down" />
                <Icon name="arrowUp" size={24} alt="Arrow Up" />
                <Icon name="left" size={24} alt="Left" />
                <Icon name="leftArrow" size={24} alt="Left Arrow" />
                <Icon name="right" size={24} alt="Right" />
                <Icon name="up" size={24} alt="Up" />
                <Icon name="upArrow" size={24} alt="Up Arrow" />
                <Icon name="down" size={24} alt="Down" />
                
                {/* Social & Engagement */}
                <Icon name="heart" size={24} alt="Like" />
                <Icon name="thumbsUp" size={24} alt="Thumbs Up" />
                <Icon name="star" size={24} alt="Star" />
                
                {/* Media */}
                <Icon name="image" size={24} alt="Image" />
                <Icon name="photo" size={24} alt="Photo" />
                <Icon name="video" size={24} alt="Video" />
                <Icon name="music" size={24} alt="Music" />
                
                {/* Location & Events */}
                <Icon name="location" size={24} alt="Location" />
                <Icon name="calendar" size={24} alt="Calendar" />
                <Icon name="ticket" size={24} alt="Ticket" />
                <Icon name="clock" size={24} alt="Clock" />
                
                {/* Communication */}
                <Icon name="envelope" size={24} alt="Message" />
                <Icon name="squareComment" size={24} alt="Comment" />
                <Icon name="atSymbol" size={24} alt="Mention" />
                
                {/* User & Profile */}
                <Icon name="userPlus" size={24} alt="Add User" />
                <Icon name="twoUsers" size={24} alt="Users" />
                
                {/* Business & Commerce */}
                <Icon name="dollar" size={24} alt="Dollar" />
                <Icon name="building" size={24} alt="Building" />
                
                {/* Security & Verification */}
                <Icon name="lock" size={24} alt="Lock" />
                <Icon name="key" size={24} alt="Key" />
                <Icon name="shield" size={24} alt="Shield" />
                <Icon name="ban" size={24} alt="Ban" />
                <Icon name="flag" size={24} alt="Flag" />
                
                {/* Analytics & Data */}
                <Icon name="barChart" size={24} alt="Bar Chart" />
                <Icon name="pieChart" size={24} alt="Pie Chart" />
                <Icon name="trendingUp" size={24} alt="Trending" />
                
                {/* Other */}
                <Icon name="globe" size={24} alt="Globe" />
                <Icon name="eye" size={24} alt="View" />
                <Icon name="externalLink" size={24} alt="External Link" />
                <Icon name="maximize" size={24} alt="Maximize" />
                <Icon name="mousePointer" size={24} alt="Pointer" />
                <Icon name="target" size={24} alt="Target" />
                <Icon name="ribbonAward" size={24} alt="Award" />
                <Icon name="logOut" size={24} alt="Log Out" />
                
                {/* Brand Logos */}
                <Icon name="music" size={24} alt="Spotify" />
                <Icon name="music" size={24} alt="Apple Music" />
                <Icon name="instagram" size={24} alt="Instagram" />
              </div>
            </div>
          </div>
        </section>

        {/* SynthButton */}
        <section className="component-group">
          <h2 className="component-group__title">SynthButton</h2>
          
          {/* Primary Variant */}
          <div className="component-subgroup">
            <h3 className="component-subgroup__title">Primary</h3>
            <div className="component-variants">
              <div className="component-variant">
                <p className="component-variant__label">Text Only (Content-hugging)</p>
                <SynthButton variant="primary">Primary Button</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Text Only (Full-width)</p>
                <SynthButton variant="primary" fullWidth>Full Width Primary</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Icon + Text Left (Content-hugging)</p>
                <SynthButton variant="primary" icon="heart" iconPosition="left">Like</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Icon + Text Left (Full-width)</p>
                <SynthButton variant="primary" icon="heart" iconPosition="left" fullWidth>Like</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Text + Icon Right (Content-hugging)</p>
                <SynthButton variant="primary" icon="right" iconPosition="right">Next</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Text + Icon Right (Full-width)</p>
                <SynthButton variant="primary" icon="right" iconPosition="right" fullWidth>Next</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Icon Only (44x44)</p>
                <SynthButton variant="primary" size="iconOnly" icon="house" aria-label="Home" />
              </div>
            </div>
          </div>

          {/* Secondary Variant */}
          <div className="component-subgroup">
            <h3 className="component-subgroup__title">Secondary</h3>
            <div className="component-variants">
              <div className="component-variant">
                <p className="component-variant__label">Text Only (Content-hugging)</p>
                <SynthButton variant="secondary">Secondary Button</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Text Only (Full-width)</p>
                <SynthButton variant="secondary" fullWidth>Full Width Secondary</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Icon + Text Left (Content-hugging)</p>
                <SynthButton variant="secondary" icon="heart" iconPosition="left">Like</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Icon + Text Left (Full-width)</p>
                <SynthButton variant="secondary" icon="heart" iconPosition="left" fullWidth>Like</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Text + Icon Right (Content-hugging)</p>
                <SynthButton variant="secondary" icon="right" iconPosition="right">Next</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Text + Icon Right (Full-width)</p>
                <SynthButton variant="secondary" icon="right" iconPosition="right" fullWidth>Next</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Icon Only (44x44)</p>
                <SynthButton variant="secondary" size="iconOnly" icon="house" aria-label="Home" />
              </div>
            </div>
          </div>

          {/* Tertiary Variant */}
          <div className="component-subgroup">
            <h3 className="component-subgroup__title">Tertiary (22px height, labels only, no full-width)</h3>
            <div className="component-variants">
              <div className="component-variant">
                <p className="component-variant__label">Text Only</p>
                <SynthButton variant="tertiary">Tertiary Label</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Icon + Text Left (small icon)</p>
                <SynthButton variant="tertiary" icon="star" iconPosition="left">Starred</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Text + Icon Right (small icon)</p>
                <SynthButton variant="tertiary" icon="check" iconPosition="right">Verified</SynthButton>
              </div>
            </div>
          </div>

          {/* Disabled Variant */}
          <div className="component-subgroup">
            <h3 className="component-subgroup__title">Disabled</h3>
            <div className="component-variants">
              <div className="component-variant">
                <p className="component-variant__label">Text Only (Content-hugging)</p>
                <SynthButton variant="disabled">Disabled Button</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Text Only (Full-width)</p>
                <SynthButton variant="disabled" fullWidth>Full Width Disabled</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Icon + Text Left (Content-hugging)</p>
                <SynthButton variant="disabled" icon="heart" iconPosition="left">Like</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Icon + Text Left (Full-width)</p>
                <SynthButton variant="disabled" icon="heart" iconPosition="left" fullWidth>Like</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Text + Icon Right (Content-hugging)</p>
                <SynthButton variant="disabled" icon="right" iconPosition="right">Next</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Text + Icon Right (Full-width)</p>
                <SynthButton variant="disabled" icon="right" iconPosition="right" fullWidth>Next</SynthButton>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Icon Only (44x44)</p>
                <SynthButton variant="disabled" size="iconOnly" icon="house" aria-label="Home" />
              </div>
            </div>
          </div>

          {/* Small Button (28px height) - Interested Toggle Pattern */}
          <div className="component-subgroup">
            <h3 className="component-subgroup__title">Small Button (28px height) - Toggle Pattern</h3>
            <div className="component-variants">
              <div className="component-variant">
                <p className="component-variant__label">Unselected State (Neutral surface + brand-pink border/text)</p>
                <button
                  style={{
                    height: 'var(--size-button-height-sm, 28px)',
                    paddingLeft: 'var(--spacing-small, 12px)',
                    paddingRight: 'var(--spacing-small, 12px)',
                    borderRadius: 'var(--radius-corner, 10px)',
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    border: '2px solid var(--brand-pink-500)',
                    backgroundColor: 'var(--neutral-50)',
                    color: 'var(--brand-pink-500)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 4px 0 var(--shadow-color)',
                    marginTop: 'var(--spacing-small, 12px)',
                    marginBottom: 'var(--spacing-small, 12px)'
                  }}
                >
                  Interested
                </button>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Selected State (Brand-pink background + inverse text)</p>
                <button
                  style={{
                    height: 'var(--size-button-height-sm, 28px)',
                    paddingLeft: 'var(--spacing-small, 12px)',
                    paddingRight: 'var(--spacing-small, 12px)',
                    borderRadius: 'var(--radius-corner, 10px)',
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    border: 'none',
                    backgroundColor: 'var(--brand-pink-500)',
                    color: 'var(--neutral-50)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 4px 0 var(--shadow-color)',
                    marginTop: 'var(--spacing-small, 12px)',
                    marginBottom: 'var(--spacing-small, 12px)'
                  }}
                >
                  Interested
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* UI Button Component (shadcn/ui) */}
        <section className="component-group">
          <h2 className="component-group__title">UI Button (shadcn/ui variants)</h2>
          <p style={{ 
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-meta-size, 16px)',
            color: 'var(--neutral-600)',
            marginBottom: '24px',
            lineHeight: '1.5'
          }}>
            Additional button variants from the UI component library. Use SynthButton for primary actions.
          </p>
          
          <div className="component-subgroup">
            <h3 className="component-subgroup__title">Variants</h3>
            <div className="component-variants">
              <div className="component-variant">
                <p className="component-variant__label">Default (Synth Primary)</p>
                <Button variant="default">Default Button</Button>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Secondary (Synth Secondary)</p>
                <Button variant="secondary">Secondary Button</Button>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Outline</p>
                <Button variant="outline">Outline Button</Button>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Ghost</p>
                <Button variant="ghost">Ghost Button</Button>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Link</p>
                <Button variant="link">Link Button</Button>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Destructive</p>
                <Button variant="destructive">Destructive Button</Button>
              </div>
            </div>
          </div>

          <div className="component-subgroup">
            <h3 className="component-subgroup__title">Sizes</h3>
            <div className="component-variants">
              <div className="component-variant">
                <p className="component-variant__label">Small (sm)</p>
                <Button variant="default" size="sm">Small Button</Button>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Default</p>
                <Button variant="default" size="default">Default Size</Button>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Large (lg)</p>
                <Button variant="default" size="lg">Large Button</Button>
              </div>
              <div className="component-variant">
                <p className="component-variant__label">Icon</p>
                <Button variant="default" size="icon">
                  <Icon name="house" size={16} alt="Home" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ProfilePicture */}
        <section className="component-group">
          <h2 className="component-group__title">ProfilePicture</h2>
          <div className="component-variants">
            <div className="component-variant">
              <p className="component-variant__label">45px - Music Icon (centered)</p>
              <ProfilePicture size={45} variant="musicIcon" alt="Music" />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">45px - Initial (body typography, bolded)</p>
              <ProfilePicture size={45} variant="initial" initial="F" alt="User" />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">75px - Initial (h1 typography, for user profile)</p>
              <ProfilePicture size={75} variant="initial" initial="F" alt="User Profile" />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">32px - Initial (meta typography, bolded, for chat)</p>
              <ProfilePicture size={32} variant="initial" initial="F" alt="Chat User" />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">45px - Image (replaces design, keeps size)</p>
              <ProfilePicture 
                size={45} 
                variant="image" 
                initial="F" 
                imageUrl={null}
                alt="User with Image" 
              />
            </div>
          </div>
        </section>

        {/* UserInfo */}
        <section className="component-group">
          <h2 className="component-group__title">UserInfo</h2>
          <div className="component-variants">
            <div className="component-variant">
              <p className="component-variant__label">User Variant</p>
              <UserInfo 
                variant="user" 
                name="First Last" 
                username="username" 
                initial="F" 
              />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Artist Variant</p>
              <UserInfo 
                variant="artist" 
                name="First Last" 
                initial="F" 
              />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Chat Variant</p>
              <UserInfo 
                variant="chat" 
                name="First Last" 
                initial="F" 
              />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">UserProfile Variant</p>
              <UserInfo 
                variant="userProfile" 
                name="First Last" 
                username="username" 
                initial="F"
                followers={1234}
                following={567}
                events={89}
              />
            </div>
          </div>
        </section>

        {/* IconText */}
        <section className="component-group">
          <h2 className="component-group__title">IconText</h2>
          <div className="component-variants">
            <div className="component-variant">
              <p className="component-variant__label">Left Icon</p>
              <IconText text="Home" icon="house" iconPosition="left" />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Right Icon</p>
              <IconText text="Next" icon="right" iconPosition="right" />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Clickable Left Icon</p>
              <IconText 
                text="Click Me" 
                icon="heart" 
                iconPosition="left" 
                onClick={() => alert('Clicked!')} 
              />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Clickable Right Icon</p>
              <IconText 
                text="Continue" 
                icon="right" 
                iconPosition="right" 
                onClick={() => alert('Clicked!')} 
              />
            </div>
          </div>
        </section>

        {/* MenuCategory */}
        <section className="component-group">
          <h2 className="component-group__title">MenuCategory</h2>
          <div className="component-variants">
            <div className="component-variant">
              <p className="component-variant__label">Clickable Menu Item</p>
              <MenuCategory 
                label="Activity" 
                icon="bell" 
                onPress={() => alert('Activity clicked')} 
              />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Another Menu Item</p>
              <MenuCategory 
                label="Settings" 
                icon="settings" 
                onPress={() => alert('Settings clicked')} 
              />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Non-clickable</p>
              <MenuCategory 
                label="Info" 
                icon="infoCircle" 
              />
            </div>
          </div>
        </section>

        {/* EmptyState */}
        <section className="component-group">
          <h2 className="component-group__title">EmptyState</h2>
          <div className="component-variants">
            <div className="component-variant">
              <p className="component-variant__label">Empty State Example</p>
              <EmptyState 
                icon="music" 
                heading="No events yet" 
                description="Check back later for upcoming events" 
              />
            </div>
          </div>
        </section>

        {/* StarRating */}
        <section className="component-group">
          <h2 className="component-group__title">StarRating</h2>
          <div className="component-variants">
            <div className="component-variant">
              <p className="component-variant__label">Display-only - 0 stars</p>
              <StarRating value={0} />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Display-only - 1 star</p>
              <StarRating value={1} />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Display-only - 2.5 stars</p>
              <StarRating value={2.5} />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Display-only - 3.5 stars</p>
              <StarRating value={3.5} />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Display-only - 5 stars</p>
              <StarRating value={5} />
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Interactive - Tap to rate</p>
              <p style={{ fontSize: 'var(--typography-meta-size, 16px)', color: 'var(--color-dark-grey, #5D646F)', marginBottom: '6px', fontFamily: 'var(--font-family)' }}>tap or swipe/drag to rate</p>
              <StarRating 
                value={0} 
                interactive 
                onChange={(value) => console.log('Rating changed:', value)} 
              />
            </div>
          </div>
        </section>

        {/* SearchBar */}
        <section className="component-group">
          <h2 className="component-group__title">SearchBar</h2>
          <div className="component-variants">
            <div className="component-variant component-variant--search-bar">
              <p className="component-variant__label">Default (Full-width)</p>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <SearchBar placeholder="Search…" />
              </div>
            </div>
            <div className="component-variant component-variant--search-bar">
              <p className="component-variant__label">With Value (shows X icon)</p>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <SearchBar value="Sample search query" onChange={() => {}} />
              </div>
            </div>
            <div className="component-variant component-variant--search-bar">
              <p className="component-variant__label">Popup Variant</p>
              <div className="popup-container" style={{ padding: '20px', backgroundColor: 'var(--neutral-50)', width: '100%', maxWidth: '100%' }}>
                <SearchBar widthVariant="popup" placeholder="Search in popup…" />
              </div>
            </div>
            <div className="component-variant component-variant--search-bar">
              <p className="component-variant__label">Flex Variant (for Discover header)</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', width: '100%', maxWidth: '100%' }}>
                <SearchBar widthVariant="flex" placeholder="Search…" />
                <button style={{ width: '44px', height: '44px', border: '1px solid var(--color-light-grey)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--color-off-white)' }} aria-label="Menu">
                  <Icon name="hamburgerMenu" size={24} alt="" />
                </button>
              </div>
            </div>
            <div className="component-variant component-variant--search-bar">
              <p className="component-variant__label">Disabled</p>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
                <SearchBar placeholder="Search…" disabled />
              </div>
            </div>
          </div>
        </section>

        {/* Chat Messages */}
        <section className="component-group">
          <h2 className="component-group__title">Chat Messages</h2>
          <div className="component-variants">
            <div className="component-variant">
              <p className="component-variant__label">Message Layout (393px container example)</p>
              <div style={{ 
                maxWidth: '353px', 
                width: '100%', 
                margin: '0 auto',
                padding: '24px 0',
                backgroundColor: 'var(--color-off-white, #FCFCFC)',
                borderRadius: '10px',
                paddingLeft: '20px',
                paddingRight: '20px'
              }}>
                {/* Session timestamp */}
                <div className="flex justify-center w-full" style={{ marginBottom: '24px' }}>
                  <p style={{ 
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    color: '#5D646F',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)'
                  }}>
                    <span style={{ fontWeight: 'var(--typography-meta-weight, 700)' }}>Monday</span>
                    <span style={{ fontWeight: 'var(--typography-meta-weight, 500)' }}> at 8:03 PM</span>
                  </p>
                </div>
                
                {/* Incoming message group */}
                <div className="flex flex-col" style={{ alignItems: 'flex-start', marginBottom: '24px' }}>
                  <div className="flex flex-col" style={{ gap: '6px' }}>
                    <div style={{
                      maxWidth: '172px',
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid var(--neutral-200)',
                      backgroundColor: 'var(--state-disabled-bg)',
                      color: 'var(--neutral-900)',
                      wordWrap: 'break-word',
                      whiteSpace: 'pre-wrap'
                    }}>
                      <p style={{
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-body-size, 20px)',
                        fontWeight: 'var(--typography-body-weight, 500)',
                        lineHeight: 'var(--typography-body-line-height, 1.5)',
                        margin: 0
                      }}>
                        Hey! How are you doing?
                      </p>
                    </div>
                    <div style={{
                      maxWidth: '172px',
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid var(--neutral-200)',
                      backgroundColor: 'var(--state-disabled-bg)',
                      color: 'var(--neutral-900)',
                      wordWrap: 'break-word',
                      whiteSpace: 'pre-wrap'
                    }}>
                      <p style={{
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-body-size, 20px)',
                        fontWeight: 'var(--typography-body-weight, 500)',
                        lineHeight: 'var(--typography-body-line-height, 1.5)',
                        margin: 0
                      }}>
                        Want to grab coffee later?
                      </p>
                    </div>
                    <p style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      color: 'var(--neutral-600)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      textAlign: 'left',
                      margin: 0
                    }}>
                      8:05 PM
                    </p>
                  </div>
                </div>
                
                {/* Outgoing message group */}
                <div className="flex flex-col" style={{ alignItems: 'flex-end', marginBottom: '24px' }}>
                  <div className="flex flex-col" style={{ gap: '6px' }}>
                    <div style={{
                      maxWidth: '172px',
                      padding: '12px',
                      borderRadius: '10px',
                      border: 'none',
                      backgroundColor: 'var(--brand-pink-500)',
                      wordWrap: 'break-word',
                      whiteSpace: 'pre-wrap'
                    }}>
                      <p style={{
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-body-size, 20px)',
                        fontWeight: 'var(--typography-body-weight, 500)',
                        lineHeight: 'var(--typography-body-line-height, 1.5)',
                        margin: 0,
                        color: 'var(--neutral-50)'
                      }}>
                        I'm doing great! Coffee sounds perfect.
                      </p>
                    </div>
                    <p style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      color: 'var(--neutral-600)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      textAlign: 'right',
                      margin: 0
                    }}>
                      8:07 PM
                    </p>
                  </div>
                </div>
                
                {/* Group chat example with user info */}
                <div className="flex flex-col" style={{ alignItems: 'flex-start' }}>
                  <div style={{ marginBottom: '6px' }}>
                    <UserInfo
                      variant="chat"
                      name="John Doe"
                      initial="J"
                    />
                  </div>
                  <div className="flex flex-col" style={{ gap: '6px' }}>
                    <div style={{
                      maxWidth: '172px',
                      padding: '12px',
                      borderRadius: '10px',
                      border: '1px solid var(--neutral-200)',
                      backgroundColor: 'var(--state-disabled-bg)',
                      color: 'var(--neutral-900)',
                      wordWrap: 'break-word',
                      whiteSpace: 'pre-wrap'
                    }}>
                      <p style={{
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-body-size, 20px)',
                        fontWeight: 'var(--typography-body-weight, 500)',
                        lineHeight: 'var(--typography-body-line-height, 1.5)',
                        margin: 0
                      }}>
                        This is a group chat message with user info above
                      </p>
                    </div>
                    <p style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      color: 'var(--neutral-600)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      textAlign: 'left',
                      margin: 0
                    }}>
                      8:10 PM
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Spacing Rules</p>
              <ul style={{ 
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                color: 'var(--neutral-600)',
                paddingLeft: '20px',
                lineHeight: '1.6'
              }}>
                <li>6px between messages from same sender</li>
                <li>24px between different senders</li>
                <li>24px below session timestamp</li>
                <li>6px above group chat user info</li>
                <li>6px below last message for timestamp</li>
              </ul>
            </div>
          </div>
        </section>

        {/* BottomNav */}
        <section className="component-group">
          <h2 className="component-group__title">BottomNav</h2>
          <div className="component-variants">
            <div className="component-variant">
              <p className="component-variant__label">Bottom Navigation (fixed at bottom)</p>
              <p className="component-variant__note">See bottom of screen - this is a fixed component</p>
            </div>
          </div>
        </section>

        {/* MobileHeader */}
        <section className="component-group">
          <h2 className="component-group__title">MobileHeader</h2>
          <div className="component-variants">
            <div className="component-variant">
              <p className="component-variant__label">Header with Hamburger Menu</p>
              <p className="component-variant__note">See top of page - hamburger icon is in the header (no button styling)</p>
            </div>
          </div>
        </section>

        {/* SideMenu */}
        <section className="component-group">
          <h2 className="component-group__title">SideMenu</h2>
          <div className="component-variants">
            <div className="component-variant">
              <p className="component-variant__label">Side Menu Drawer</p>
              <p className="component-variant__note">Click hamburger icon in header to open - this is a modal/drawer component</p>
            </div>
          </div>
        </section>

        {/* ChatListItem */}
        <section className="component-group">
          <h2 className="component-group__title">ChatListItem</h2>
          <div className="component-variants">
            <div className="component-variant">
              <p className="component-variant__label">Individual Chat</p>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                <ChatListItem
                  name="First Last"
                  lastMessage="Last Message"
                  lastMessageTimestamp={new Date()}
                  initial="F"
                  onClick={() => console.log('Chat clicked')}
                  onDelete={(e) => {
                    e.stopPropagation();
                    console.log('Delete clicked');
                  }}
                />
              </div>
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Group Chat</p>
              <div style={{ width: '100%', display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                <ChatListItem
                  name="Group Chat Name"
                  lastMessage="Last Message"
                  lastMessageTimestamp={new Date()}
                  isGroupChat
                  groupTag="User Group"
                  initial="G"
                  onClick={() => console.log('Group chat clicked')}
                  onDelete={(e) => {
                    e.stopPropagation();
                    console.log('Delete clicked');
                  }}
                />
              </div>
            </div>
            <div className="component-variant">
              <p className="component-variant__label">Timestamp Examples</p>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px', padding: '20px 0' }}>
                <ChatListItem
                  name="Recent (2 hours ago)"
                  lastMessage="This message was sent 2 hours ago"
                  lastMessageTimestamp={new Date(Date.now() - 2 * 60 * 60 * 1000)}
                  initial="R"
                />
                <ChatListItem
                  name="Yesterday"
                  lastMessage="This message was sent yesterday"
                  lastMessageTimestamp={new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)}
                  initial="Y"
                />
                <ChatListItem
                  name="Last Week"
                  lastMessage="This message was sent last week"
                  lastMessageTimestamp={new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)}
                  initial="L"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Spacer for bottom nav */}
        <div style={{ height: '112px' }} />
      </main>
    </div>
  );
};

export default ComponentShowcase;

