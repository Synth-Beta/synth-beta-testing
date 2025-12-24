import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HorizontalCarouselProps {
  title?: string;
  description?: string;
  items: React.ReactNode[];
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
  itemClassName?: string;
  showTitle?: boolean;
}

export const HorizontalCarousel: React.FC<HorizontalCarouselProps> = ({
  title,
  description,
  items,
  loading = false,
  emptyMessage = 'No items to display',
  className,
  itemClassName,
  showTitle = true,
}) => {
  if (loading) {
    return (
      <div className={cn('space-y-2', className)}>
        {showTitle && title && (
          <div>
            <h3 className="text-lg font-bold">{title}</h3>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        )}
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={cn('space-y-2', className)}>
        {showTitle && title && (
          <div>
            <h3 className="text-lg font-bold">{title}</h3>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        )}
        <div className="text-center py-8 text-muted-foreground">
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {showTitle && title && (
        <div>
          <h3 className="text-lg font-bold">{title}</h3>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
      )}
      <div className="overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        <div className="flex gap-3" style={{ width: 'max-content' }}>
          {items.map((item, index) => (
            <div key={index} className={cn('flex-shrink-0', itemClassName)}>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

