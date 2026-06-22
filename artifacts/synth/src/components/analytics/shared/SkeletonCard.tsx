import React from 'react';

export function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm animate-pulse">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-8 w-8 bg-gray-200 rounded-full"></div>
        </div>

        {/* Content Lines */}
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          <div className="h-4 bg-gray-200 rounded w-4/6"></div>
        </div>

        {/* Bottom Section */}
        <div className="flex items-center gap-2 pt-4">
          <div className="h-10 bg-gray-200 rounded w-1/4"></div>
          <div className="h-10 bg-gray-200 rounded w-1/4"></div>
        </div>
      </div>
    </div>
  );
}

export default SkeletonCard;

