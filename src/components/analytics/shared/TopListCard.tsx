/**
 * TopListCard Component
 * 
 * Displays a ranked list (top artists, top venues, etc.)
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TopListItem {
  name: string;
  count: number;
  subtitle?: string;
  badge?: string;
  onClick?: () => void;
}

interface TopListCardProps {
  title: string;
  items: TopListItem[];
  maxItems?: number;
  icon?: React.ReactNode;
  emptyMessage?: string;
  className?: string;
}

export function TopListCard({
  title,
  items,
  maxItems = 5,
  icon,
  emptyMessage = 'No data yet',
  className
}: TopListCardProps) {
  const displayItems = items.slice(0, maxItems);

  return (
    <Card className={cn('glass-card inner-glow', className)}>
      <CardHeader>
        <div className="flex items-center gap-2">
          {icon && <div className="text-synth-pink">{icon}</div>}
          <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {displayItems.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">{emptyMessage}</p>
        ) : (
          <div className="space-y-3">
            {displayItems.map((item, index) => (
              <div
                key={`${item.name}-${index}`}
                className={cn(
                  'flex items-center justify-between p-3 rounded-lg transition-all',
                  'bg-gradient-to-r from-gray-50 to-white hover:from-synth-pink/5 hover:to-synth-beige/5',
                  item.onClick && 'cursor-pointer hover:shadow-sm'
                )}
                onClick={item.onClick}
              >
                <div className="flex items-center gap-3 flex-1">
                  {/* Rank badge */}
                  <div
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm',
                      index === 0 && 'bg-gradient-to-br from-yellow-400 to-yellow-600 text-white shadow-lg',
                      index === 1 && 'bg-gradient-to-br from-gray-300 to-gray-500 text-white shadow-md',
                      index === 2 && 'bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-md',
                      index >= 3 && 'bg-gray-100 text-gray-600'
                    )}
                  >
                    {index + 1}
                  </div>

                  {/* Name and subtitle */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-gray-900 truncate">
                      {item.name}
                    </p>
                    {item.subtitle && (
                      <p className="text-xs text-gray-500">{item.subtitle}</p>
                    )}
                  </div>
                </div>

                {/* Count and optional badge */}
                <div className="flex items-center gap-2">
                  {item.badge && (
                    <Badge variant="secondary" className="text-xs bg-synth-pink/10 text-synth-pink">
                      {item.badge}
                    </Badge>
                  )}
                  <div className="text-right">
                    <div className="font-bold text-lg text-gray-900">
                      {item.count}
                    </div>
                    <div className="text-xs text-gray-500">
                      {item.count === 1 ? 'event' : 'events'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {items.length > maxItems && (
          <div className="mt-3 text-center">
            <p className="text-xs text-gray-500">
              +{items.length - maxItems} more
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

