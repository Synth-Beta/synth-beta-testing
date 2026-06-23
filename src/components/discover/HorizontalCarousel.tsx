import React from 'react';
import { Icon } from '@/components/Icon/Icon';
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
            <h3
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-h2-size, 24px)',
                fontWeight: 'var(--typography-h2-weight, 700)',
                lineHeight: 'var(--typography-h2-line-height, 1.3)',
                color: 'var(--neutral-900)'
              }}
            >
              {title}
            </h3>
            {description && (
              <p
                style={{
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  color: 'var(--neutral-600)'
                }}
              >
                {description}
              </p>
            )}
          </div>
        )}
        <div className="flex items-center justify-center py-8">
          <Icon name="refresh" size={24} className="animate-spin" color="var(--neutral-600)" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={cn('space-y-2', className)}>
        {showTitle && title && (
          <div>
            <h3
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-h2-size, 24px)',
                fontWeight: 'var(--typography-h2-weight, 700)',
                lineHeight: 'var(--typography-h2-line-height, 1.3)',
                color: 'var(--neutral-900)'
              }}
            >
              {title}
            </h3>
            {description && (
              <p
                style={{
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  color: 'var(--neutral-600)'
                }}
              >
                {description}
              </p>
            )}
          </div>
        )}
        <div
          className="py-8"
          style={{
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-meta-size, 16px)',
            fontWeight: 'var(--typography-meta-weight, 500)',
            lineHeight: 'var(--typography-meta-line-height, 1.5)',
            color: 'var(--neutral-600)',
            textAlign: 'center'
          }}
        >
          <p>{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {showTitle && title && (
        <div>
          <h3
            style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-h2-size, 24px)',
              fontWeight: 'var(--typography-h2-weight, 700)',
              lineHeight: 'var(--typography-h2-line-height, 1.3)',
              color: 'var(--neutral-900)'
            }}
          >
            {title}
          </h3>
          {description && (
            <p
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--neutral-600)'
              }}
            >
              {description}
            </p>
          )}
        </div>
      )}
      <div className="overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        <div className="flex gap-4 items-stretch" style={{ 
          width: 'max-content',
          minWidth: '100%',
          justifyContent: 'center'
        }}>
          {items.map((item, index) => (
            <div key={index} className={cn('flex-shrink-0 h-full', itemClassName)}>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

