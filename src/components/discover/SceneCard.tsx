import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Music, Calendar, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Scene } from '@/services/sceneService';

interface SceneCardProps {
  scene: Scene;
  onClick: () => void;
  className?: string;
}

export const SceneCard: React.FC<SceneCardProps> = ({
  scene,
  onClick,
  className,
}) => {
  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-lg',
        className
      )}
      onClick={onClick}
    >
      <CardHeader>
        <CardTitle className="text-lg">{scene.name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{scene.description}</p>

        {/* Scene Image */}
        {(scene.image_url || scene.scene_url) && (
          <div className="w-full h-32 rounded-md overflow-hidden mb-2">
            <img
              src={scene.image_url || scene.scene_url || ''}
              alt={scene.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Description */}
        {scene.short_description && (
          <p className="text-sm text-muted-foreground line-clamp-2">{scene.short_description}</p>
        )}

        {/* Genres */}
        {scene.participating_genres && scene.participating_genres.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {scene.participating_genres.slice(0, 3).map((genre) => (
              <Badge key={genre} variant="secondary" className="text-xs">
                {genre}
              </Badge>
            ))}
            {scene.participating_genres.length > 3 && (
              <Badge variant="secondary" className="text-xs">
                +{scene.participating_genres.length - 3} more
              </Badge>
            )}
          </div>
        )}

        {/* Participating Venues */}
        {scene.participating_venues && scene.participating_venues.length > 0 && (
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-1">Venues</p>
              <p className="line-clamp-2">
                {scene.participating_venues.slice(0, 2).join(', ')}
                {scene.participating_venues.length > 2 && ` +${scene.participating_venues.length - 2} more`}
              </p>
            </div>
          </div>
        )}

        {/* Participating Artists */}
        {scene.participating_artists && scene.participating_artists.length > 0 && (
          <div className="flex items-start gap-2 text-sm">
            <Music className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground mb-1">Artists</p>
              <p className="line-clamp-2">
                {scene.participating_artists.slice(0, 2).join(', ')}
                {scene.participating_artists.length > 2 && ` +${scene.participating_artists.length - 2} more`}
              </p>
            </div>
          </div>
        )}

        {/* User Progress */}
        {scene.userProgress && scene.userProgress.discovery_state !== 'undiscovered' && (
          <div className="pt-2 border-t">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{scene.userProgress.progress_percentage}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5 mt-1">
              <div
                className="bg-primary h-1.5 rounded-full transition-all"
                style={{ width: `${scene.userProgress.progress_percentage}%` }}
              />
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-xs">
                {scene.userProgress.discovery_state.replace('_', ' ')}
              </Badge>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="flex items-center gap-4 pt-2 border-t">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span>{scene.upcomingEventsCount} upcoming</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3 h-3" />
            <span>{scene.activeReviewersCount} reviewers</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

