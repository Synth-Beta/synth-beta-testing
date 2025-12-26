import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, Lock } from 'lucide-react';
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

export const PassportBadge: React.FC<PassportBadgeProps> = ({
  entry,
  onClick,
  className,
  showProgress = false,
  progress,
  goal,
}) => {
  const isUnlocked = !!entry.unlocked_at;
  const progressPercent = progress && goal ? Math.min((progress / goal) * 100, 100) : 0;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-md relative overflow-hidden',
        isUnlocked
          ? 'border-2 border-yellow-300 bg-gradient-to-br from-yellow-50/80 to-amber-50/80'
          : 'border-gray-200 bg-gray-50 opacity-75',
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-semibold text-sm">{entry.entity_name}</h4>
              {isUnlocked ? (
                <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs">
                  <Check className="w-3 h-3 mr-1" />
                  Unlocked
                </Badge>
              ) : (
                <Lock className="w-4 h-4 text-gray-400" />
              )}
            </div>
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
          <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-yellow-400 rounded-tl-lg" />
          <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-yellow-400 rounded-tr-lg" />
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-yellow-400 rounded-bl-lg" />
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-yellow-400 rounded-br-lg" />
        </div>
      )}
    </Card>
  );
};



