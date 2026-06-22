import React from 'react';

/**
 * Skeleton placeholder for a single FriendSuggestionsRail card (148 × ~200px).
 * Mirrors the card layout: avatar circle → 2 text lines → button.
 */
export const SkeletonFriendCard: React.FC = () => {
  return (
    <div className="flex flex-col items-center min-w-[148px] max-w-[148px] rounded-2xl bg-gradient-to-b from-pink-50/80 to-pink-100/40 border border-pink-100/50 shadow-sm px-3 pt-3 pb-2 flex-shrink-0">
      {/* Avatar circle */}
      <div className="h-20 w-20 rounded-full animate-shimmer mb-2 mt-1" />
      {/* Name line */}
      <div className="h-3.5 w-24 rounded-full animate-shimmer mb-1.5" />
      {/* Meta line 1 */}
      <div className="h-3 w-20 rounded-full animate-shimmer mb-1" />
      {/* Meta line 2 */}
      <div className="h-3 w-16 rounded-full animate-shimmer mb-2" />
      {/* Button placeholder */}
      <div className="h-7 w-full rounded-md animate-shimmer mt-1" />
    </div>
  );
};
