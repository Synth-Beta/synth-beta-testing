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
  const progress = scene.userProgress;
  
  // Calculate total participants
  const totalParticipants = scene.participants?.length || 
    ((scene.participating_artists?.length || 0) +
     (scene.participating_venues?.length || 0) +
     (scene.participating_cities?.length || 0) +
     (scene.participating_genres?.length || 0));
  
  // Calculate engaged participants (max 10 for display)
  const engagedCount = progress ? 
    (progress.artists_experienced || 0) +
    (progress.venues_experienced || 0) +
    (progress.cities_experienced || 0) +
    (progress.genres_experienced || 0) : 0;
  
  const displayEngaged = Math.min(engagedCount, 10);
  const displayTotal = Math.min(totalParticipants, 10);
  
  // Calculate progress percentage for color gradient
  const progressPercent = displayTotal > 0 ? (displayEngaged / displayTotal) * 100 : 0;
  
  // Determine color based on progress: red (0-30%) -> yellow (30-70%) -> green (70-100%)
  const getProgressColor = () => {
    if (progressPercent < 30) {
      // Red to yellow gradient
      const ratio = progressPercent / 30;
      return `linear-gradient(90deg, rgb(239, 68, 68) 0%, rgb(${239 - Math.round(ratio * 100)}, ${68 + Math.round(ratio * 100)}, ${68 - Math.round(ratio * 50)}) 100%)`;
    } else if (progressPercent < 70) {
      // Yellow to green gradient
      const ratio = (progressPercent - 30) / 40;
      return `linear-gradient(90deg, rgb(234, 179, 8) 0%, rgb(${234 - Math.round(ratio * 100)}, ${179 + Math.round(ratio * 50)}, ${8 + Math.round(ratio * 50)}) 100%)`;
    } else {
      // Green
      return `linear-gradient(90deg, rgb(34, 197, 94) 0%, rgb(22, 163, 74) 100%)`;
    }
  };

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-lg flex flex-col h-full w-[320px] flex-shrink-0',
        className
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-bold leading-tight">{scene.name}</CardTitle>
        {scene.short_description && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{scene.short_description}</p>
        )}
      </CardHeader>

      <CardContent className="flex-1 flex flex-col space-y-3">
        {/* Progress Bar - Red to Yellow to Green */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground font-medium">Progress</span>
            <span className="font-semibold">{displayEngaged}/{displayTotal} participants</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ 
                width: `${progressPercent}%`,
                background: getProgressColor()
              }}
            />
          </div>
        </div>

        {/* Participants Section - Compact */}
        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Participants</h4>
          
          {/* Get participants from normalized data or fallback to legacy arrays */}
          {scene.participants && scene.participants.length > 0 ? (
            <>
              {/* Artists */}
              {(() => {
                const artists = scene.participants.filter(p => p.participant_type === 'artist' && p.artist_name);
                return artists.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Music className="w-3 h-3" />
                      <span className="font-medium">Artists ({artists.length})</span>
                    </div>
                    <p className="text-xs font-medium line-clamp-1 text-foreground">
                      {artists.slice(0, 3).map(p => p.artist_name).filter(Boolean).join(', ')}
                      {artists.length > 3 && ` +${artists.length - 3}`}
                    </p>
                  </div>
                );
              })()}

              {/* Venues */}
              {(() => {
                const venues = scene.participants.filter(p => p.participant_type === 'venue' && p.venue_name);
                return venues.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      <span className="font-medium">Venues ({venues.length})</span>
                    </div>
                    <p className="text-xs font-medium line-clamp-1 text-foreground">
                      {venues.slice(0, 3).map(p => p.venue_name).filter(Boolean).join(', ')}
                      {venues.length > 3 && ` +${venues.length - 3}`}
                    </p>
                  </div>
                );
              })()}

            </>
          ) : (
            <>
              {/* Fallback to legacy arrays if participants not loaded */}
              {scene.participating_venues && scene.participating_venues.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3" />
                    <span className="font-medium">Venues ({scene.participating_venues.length})</span>
                  </div>
                  <p className="text-xs font-medium line-clamp-1 text-foreground">
                    {scene.participating_venues.slice(0, 3).join(', ')}
                    {scene.participating_venues.length > 3 && ` +${scene.participating_venues.length - 3}`}
                  </p>
                </div>
              )}
              {scene.participating_artists && scene.participating_artists.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Music className="w-3 h-3" />
                    <span className="font-medium">Artists ({scene.participating_artists.length})</span>
                  </div>
                  <p className="text-xs font-medium line-clamp-1 text-foreground">
                    {scene.participating_artists.slice(0, 3).join(', ')}
                    {scene.participating_artists.length > 3 && ` +${scene.participating_artists.length - 3}`}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Stats Footer - Compact */}
        <div className="flex items-center justify-between pt-2 border-t mt-auto">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <span>{scene.upcomingEventsCount || 0} upcoming</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3 h-3" />
            <span>{scene.activeReviewersCount || 0} reviewers</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

