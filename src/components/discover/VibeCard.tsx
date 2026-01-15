import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/Icon/Icon';
import type { IconName } from '@/config/iconMapping';

interface VibeCardProps {
  title: string;
  description: string;
  icon: IconName;
  onClick: () => void;
  className?: string;
}

export const VibeCard: React.FC<VibeCardProps> = ({
  title,
  description,
  icon: Icon,
  onClick,
  className,
}) => {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md hover:scale-[1.02]',
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div
            className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--brand-pink-050)' }}
          >
            <Icon name={icon} size={16} color="var(--brand-pink-500)" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-semibold text-sm mb-1">{title}</h4>
            <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

