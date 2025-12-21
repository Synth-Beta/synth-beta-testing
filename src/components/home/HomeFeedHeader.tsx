import React from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export type DateWindow = 'today' | 'this_week' | 'weekend' | 'next_30_days';

interface HomeFeedHeaderProps {
  onSearchClick?: () => void;
  className?: string;
}

export const HomeFeedHeader: React.FC<HomeFeedHeaderProps> = ({
  onSearchClick,
  className,
}) => {

  return (
    <div
      className={cn(
        'sticky top-0 z-50 bg-white border-b border-gray-100',
        'pt-[env(safe-area-inset-top)]',
        className
      )}
    >
      {/* Search Bar Only */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
        <button
          onClick={onSearchClick}
          className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-xl transition-colors text-left"
        >
          <Search className="h-5 w-5 text-gray-400" />
          <span className="text-gray-500 text-sm">Search events, artists, venues</span>
        </button>
      </div>
    </div>
  );
};

