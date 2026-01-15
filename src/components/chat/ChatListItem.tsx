import React from 'react';
import { ProfilePicture } from '@/components/profile/ProfilePicture';
import { Icon } from '@/components/Icon';
import './ChatListItem.css';

export interface ChatListItemProps {
  /** Chat name (user name for individual, group name for group) */
  name: string;
  /** Last message preview text */
  lastMessage?: string;
  /** Timestamp of the last message (ISO string or Date) */
  lastMessageTimestamp?: string | Date;
  /** Whether this is a group chat */
  isGroupChat?: boolean;
  /** Group tag text (only shown for group chats) */
  groupTag?: string;
  /** Avatar image URL (optional) */
  avatarUrl?: string | null;
  /** Initial for avatar fallback */
  initial?: string;
  /** Click handler */
  onClick?: () => void;
  /** Delete handler */
  onDelete?: (e: React.MouseEvent) => void;
}

/**
 * Formats a timestamp based on how recent it is:
 * - Within 23h 59m: show time (e.g., "8:03 PM")
 * - Within 7 days: show day abbreviation (Mon, Tues, Wed, Thurs, Fri, Sat, Sun)
 * - Older: show date (e.g., "1/12/26" or "12/23/23")
 */
const formatTimestamp = (timestamp: string | Date): string => {
  const now = new Date();
  const messageDate = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  
  if (isNaN(messageDate.getTime())) {
    return '';
  }

  const diffMs = now.getTime() - messageDate.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Within 23 hours and 59 minutes
  if (diffMinutes < 24 * 60) {
    // Format as time (e.g., "8:03 PM")
    const hours = messageDate.getHours();
    const minutes = messageDate.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
  }

  // Within 7 days
  if (diffDays < 7) {
    const dayNames = ['Sun', 'Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat'];
    return dayNames[messageDate.getDay()];
  }

  // Older than 7 days: show date (M/D/YY)
  const month = messageDate.getMonth() + 1;
  const day = messageDate.getDate();
  const year = messageDate.getFullYear().toString().slice(-2);
  return `${month}/${day}/${year}`;
};

export const ChatListItem: React.FC<ChatListItemProps> = ({
  name,
  lastMessage,
  lastMessageTimestamp,
  isGroupChat = false,
  groupTag,
  avatarUrl,
  initial,
  onClick,
  onDelete
}) => {
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(e);
    }
  };

  const formattedTimestamp = lastMessageTimestamp 
    ? formatTimestamp(lastMessageTimestamp)
    : '';

  return (
    <div 
      className="chat-list-item"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
    >
      {/* Avatar */}
      <div className="chat-list-item__avatar">
        <ProfilePicture 
          size={45} 
          variant={avatarUrl ? "image" : "musicIcon"} 
          imageUrl={avatarUrl || undefined}
          initial={initial}
          alt={name}
        />
      </div>

      {/* Middle Content */}
      <div className="chat-list-item__content">
        <div className="chat-list-item__name">{name}</div>
        {lastMessage && (
          <div className="chat-list-item__message">{lastMessage}</div>
        )}
        {isGroupChat && groupTag && (
          <div className="chat-list-item__tag">{groupTag}</div>
        )}
      </div>

      {/* Right Side (Delete + Timestamp) */}
      <div className="chat-list-item__right">
        {onDelete && (
          <button
            className="chat-list-item__delete"
            onClick={handleDelete}
            aria-label="Delete chat"
            type="button"
          >
            <Icon name="trash" size={24} alt="Delete" />
          </button>
        )}
        {formattedTimestamp && (
          <div className="chat-list-item__timestamp">{formattedTimestamp}</div>
        )}
      </div>
    </div>
  );
};

export default ChatListItem;
