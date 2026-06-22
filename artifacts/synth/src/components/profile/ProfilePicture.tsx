import React from 'react';
import { Icon } from '@/components/Icon';
import './ProfilePicture.css';

export type ProfilePictureSize = 32 | 45 | 75;

export type ProfilePictureVariant = 'musicIcon' | 'initial' | 'image';

export interface ProfilePictureProps {
  /**
   * Visual size of the avatar in pixels.
   * - 32: small
   * - 45: default
   * - 75: large
   */
  size: ProfilePictureSize;

  /**
   * Visual variant:
   * - musicIcon: shows the music icon centered on gradient
   * - initial: shows the initial letter on gradient
   * - image: shows an image clipped to a circle, falls back to initial when no imageUrl
   */
  variant: ProfilePictureVariant;

  /**
   * Single-character initial to display for "initial" and "image" fallback.
   */
  initial?: string;

  /**
   * Image URL for the "image" variant. When not provided, falls back to initial.
   */
  imageUrl?: string | null;

  /**
   * Optional accessible label for the avatar.
   */
  alt?: string;

  /**
   * Optional additional CSS classes for the root element.
   */
  className?: string;
}

export const ProfilePicture: React.FC<ProfilePictureProps> = ({
  size,
  variant,
  initial,
  imageUrl,
  alt,
  className,
}) => {
  const baseClass = 'profile-picture';
  const sizeClass = `${baseClass}--${size}`;
  const variantClass = `${baseClass}--${variant}`;

  const classes = [baseClass, sizeClass, variantClass, className]
    .filter(Boolean)
    .join(' ');

  const renderContent = () => {
    if (variant === 'image' && imageUrl) {
      return (
        <img
          src={imageUrl}
          alt={alt || ''}
          className="profile-picture__image"
        />
      );
    }

    if ((variant === 'image' || variant === 'initial') && initial) {
      return (
        <span
          className="profile-picture__initial"
          aria-hidden={alt ? undefined : true}
        >
          {initial.charAt(0).toUpperCase()}
        </span>
      );
    }

    // Default to music icon (used for musicIcon variant or when no initial is provided)
    return (
      <Icon
        name="music"
        size={24}
        alt={alt || 'Music'}
        className="profile-picture__icon"
      />
    );
  };

  return (
    <div
      className={classes}
      role={alt ? 'img' : undefined}
      aria-label={alt}
    >
      {renderContent()}
    </div>
  );
};

export default ProfilePicture;


