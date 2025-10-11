/**
 * AchievementCard Component
 * 
 * Displays an achievement with progress bar and unlock status
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Lock, Check } from 'lucide-react';

interface AchievementCardProps {
  name: string;
  description: string;
  icon: string;
  progress: number;
  goal: number;
  unlocked: boolean;
  unlockedAt?: string;
  className?: string;
  compact?: boolean;
}

export function AchievementCard({
  name,
  description,
  icon,
  progress,
  goal,
  unlocked,
  unlockedAt,
  className,
  compact = false
}: AchievementCardProps) {
  const progressPercent = Math.min((progress / goal) * 100, 100);

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg border transition-all',
          unlocked
            ? 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200'
            : 'bg-gray-50 border-gray-200 opacity-60',
          className
        )}
      >
        <div className="text-3xl">{icon}</div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-900">{name}</span>
            {unlocked && (
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 text-xs">
                <Check className="w-3 h-3 mr-1" />
                Unlocked
              </Badge>
            )}
            {!unlocked && (
              <Lock className="w-3 h-3 text-gray-400" />
            )}
          </div>
          <p className="text-xs text-gray-600">{description}</p>
          {!unlocked && (
            <div className="mt-1">
              <Progress value={progressPercent} className="h-1" />
              <span className="text-xs text-gray-500">{progress}/{goal}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card
      className={cn(
        'overflow-hidden transition-all hover:shadow-md',
        unlocked
          ? 'glass-card border-2 border-yellow-300 bg-gradient-to-br from-yellow-50/80 to-amber-50/80'
          : 'bg-white border-gray-200 opacity-75',
        className
      )}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              'text-5xl',
              unlocked ? 'animate-bounce' : 'grayscale'
            )}>
              {icon}
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{name}</h3>
              <p className="text-sm text-gray-600">{description}</p>
            </div>
          </div>
          
          {unlocked ? (
            <Badge className="bg-yellow-500 text-white border-0">
              <Check className="w-4 h-4 mr-1" />
              Unlocked!
            </Badge>
          ) : (
            <div className="flex items-center gap-1 text-gray-400">
              <Lock className="w-4 h-4" />
              <span className="text-sm">Locked</span>
            </div>
          )}
        </div>

        {!unlocked && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Progress</span>
              <span className="font-semibold text-gray-900">
                {progress}/{goal} ({Math.round(progressPercent)}%)
              </span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </div>
        )}

        {unlocked && unlockedAt && (
          <div className="mt-3 text-xs text-gray-500">
            Unlocked on {new Date(unlockedAt).toLocaleDateString()}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

