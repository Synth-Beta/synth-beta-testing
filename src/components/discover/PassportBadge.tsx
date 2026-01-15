import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Icon } from '@/components/Icon/Icon';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { PassportEntry } from '@/services/passportService';

interface PassportBadgeProps {
  entry: PassportEntry;
  onClick?: () => void;
  className?: string;
  showProgress?: boolean;
  progress?: number;
  goal?: number;
}

const getRarityStyles = (rarity?: string) => {
  switch (rarity) {
    case 'legendary':
      return {
        border: 'border-purple-400',
        bg: 'bg-gradient-to-br from-purple-50/90 to-pink-50/90',
        badge: 'bg-purple-100 text-purple-800 border-purple-300',
        icon: <Icon name="ribbonAward" size={16} />,
      };
    case 'uncommon':
      return {
        border: 'border-blue-400',
        bg: 'bg-gradient-to-br from-blue-50/90 to-cyan-50/90',
        badge: 'bg-blue-100 text-blue-800 border-blue-300',
        icon: <Icon name="mediumShootingStar" size={16} />,
      };
    default:
      return {
        border: 'border-yellow-300',
        bg: 'bg-gradient-to-br from-yellow-50/80 to-amber-50/80',
        badge: 'bg-yellow-100 text-yellow-800 border-yellow-300',
        icon: <Icon name="check" size={16} />,
      };
  }
};

export const PassportBadge: React.FC<PassportBadgeProps> = ({
  entry,
  onClick,
  className,
  showProgress = false,
  progress,
  goal,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const isUnlocked = !!entry.unlocked_at;
  const progressPercent = progress && goal ? Math.min((progress / goal) * 100, 100) : 0;
  const rarityStyles = getRarityStyles(entry.rarity);

  const renderMetadata = () => {
    if (!entry.metadata) return null;

    // Festival years
    if (entry.type === 'festival' && entry.metadata.years_attended) {
      const years = entry.metadata.years_attended as number[];
      return (
        <p className="text-xs text-muted-foreground mb-1">
          Attended {years.length} {years.length === 1 ? 'time' : 'times'} ({years.join(', ')})
        </p>
      );
    }

    // Artist milestone
    if (entry.type === 'artist_milestone' && entry.metadata.show_count) {
      return (
        <p className="text-xs text-muted-foreground mb-1">
          {entry.metadata.show_count} shows
          {entry.metadata.year_span >= 3 && ` • ${entry.metadata.year_span} years`}
        </p>
      );
    }

    // Era metadata
    if (entry.type === 'era' && entry.metadata.event_count) {
      return (
        <p className="text-xs text-muted-foreground mb-1">
          {entry.metadata.event_count} events • {entry.metadata.year_span} years
        </p>
      );
    }

    return null;
  };

  const badgeContent = (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md relative overflow-hidden',
        isUnlocked
          ? `border-2 ${rarityStyles.border} ${rarityStyles.bg}`
          : 'border-gray-200 bg-gray-50 opacity-75',
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h4 className="font-semibold text-sm">{entry.entity_name}</h4>
              {isUnlocked && entry.rarity && (
                <Badge variant="outline" className={cn('text-xs', rarityStyles.badge)}>
                  {rarityStyles.icon}
                  <span className="ml-1 capitalize">{entry.rarity}</span>
                </Badge>
              )}
              {isUnlocked && !entry.rarity && (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs">
                  <Icon name="check" size={16} className="mr-1" />
                  Unlocked
                </Badge>
              )}
              {!isUnlocked && (
                <Icon name="lock" size={16} color="var(--neutral-400)" />
              )}
            </div>
            {renderMetadata()}
            {entry.metadata?.description && (
              <p className="text-xs text-muted-foreground mb-2">{entry.metadata.description}</p>
            )}
            {isUnlocked && entry.unlocked_at && (
              <p className="text-xs text-muted-foreground">
                Unlocked {format(new Date(entry.unlocked_at), 'MMM d, yyyy')}
              </p>
            )}
          </div>
        </div>

        {showProgress && !isUnlocked && progress !== undefined && goal !== undefined && (
          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold">{progress}/{goal}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-synth-pink h-1.5 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>

      {/* Stamp-style border effect */}
      {isUnlocked && (
        <div className="absolute inset-0 pointer-events-none">
          <div className={cn('absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 rounded-tl-lg', rarityStyles.border)} />
          <div className={cn('absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 rounded-tr-lg', rarityStyles.border)} />
          <div className={cn('absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 rounded-bl-lg', rarityStyles.border)} />
          <div className={cn('absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 rounded-br-lg', rarityStyles.border)} />
        </div>
      )}
    </Card>
  );

  // Show tooltip with cultural context if available
  if (entry.cultural_context && isUnlocked) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {badgeContent}
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <p className="text-sm">{entry.cultural_context}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badgeContent;
};










