import React from 'react';
import { ProfilePicture, type ProfilePictureVariant } from './ProfilePicture';
import './UserInfo.css';

export type UserInfoVariant = 'user' | 'artist' | 'userProfile' | 'chat';

export interface UserInfoProps {
  /**
   * Display name of the user or artist.
   */
  name: string;

  /**
   * Optional username without the leading '@'.
   */
  username?: string;

  /**
   * Initial character to use for ProfilePicture when needed.
   */
  initial?: string;

  /**
   * Variant that controls layout and ProfilePicture configuration.
   */
  variant: UserInfoVariant;

  /**
   * Optional stats for userProfile variant.
   */
  followers?: number;
  following?: number;
  events?: number;

  /**
   * Optional image URL for ProfilePicture image variant (if used in future).
   */
  imageUrl?: string | null;

  /**
   * Optional additional classes for root container.
   */
  className?: string;
}

export const UserInfo: React.FC<UserInfoProps> = ({
  name,
  username,
  initial,
  variant,
  followers,
  following,
  events,
  imageUrl,
  className,
}) => {
  // Determine avatar configuration based on variant
  let pictureSize: 32 | 45 | 75 = 45;
  let pictureVariant: ProfilePictureVariant = 'initial';

  if (variant === 'artist') {
    pictureSize = 45;
    pictureVariant = 'musicIcon';
  } else if (variant === 'chat') {
    pictureSize = 32;
    pictureVariant = imageUrl ? 'image' : 'initial';
  } else if (variant === 'userProfile') {
    pictureSize = 75;
    pictureVariant = imageUrl ? 'image' : 'initial';
  } else {
    pictureSize = 45;
    // Use image variant if imageUrl is provided, otherwise use initial
    pictureVariant = imageUrl ? 'image' : 'initial';
  }

  const rootClasses = ['user-info', `user-info--${variant}`, className]
    .filter(Boolean)
    .join(' ');

  const showUsername =
    (variant === 'user' || variant === 'userProfile') && username;

  const showStats = variant === 'userProfile';

  const stats = [
    { key: 'followers', label: 'Followers', value: followers },
    { key: 'following', label: 'Following', value: following },
    { key: 'events', label: 'Events', value: events },
  ];

  return (
    <div className={rootClasses}>
      <div className="user-info__avatar">
        <ProfilePicture
          size={pictureSize}
          variant={pictureVariant}
          initial={initial}
          imageUrl={imageUrl}
          alt={name}
        />
      </div>

      <div className="user-info__content">
        <p className="user-info__name">{name}</p>

        {showUsername && (
          <p className="user-info__username">@{username}</p>
        )}

        {showStats && (
          <div className="user-info__stats" aria-label="User statistics">
            {stats.map((stat) => (
              <div key={stat.key} className="user-info__stat">
                <span className="user-info__stat-value">
                  {stat.value ?? 0}
                </span>
                <span className="user-info__stat-label">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserInfo;


