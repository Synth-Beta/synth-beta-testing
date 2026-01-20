import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/Icon/Icon';
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
  
  // Calculate engaged participants
  const engagedCount = progress ? 
    (progress.artists_experienced || 0) +
    (progress.venues_experienced || 0) +
    (progress.cities_experienced || 0) +
    (progress.genres_experienced || 0) : 0;
  
  // Display total participants (not capped at 10)
  const displayTotal = totalParticipants;
  const displayEngaged = engagedCount;
  
  // Calculate progress percentage for color gradient
  // Use completion_threshold for progress calculation, but cap at 100%
  const progressPercent = displayTotal > 0 ? Math.min((displayEngaged / displayTotal) * 100, 100) : 0;

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all hover:shadow-lg flex flex-col h-full min-h-[400px] w-[320px] flex-shrink-0 swift-ui-card',
        className
      )}
      onClick={onClick}
    >
      <div className="swift-ui-card-content flex flex-col h-full">
      <CardHeader className="pb-2">
        <CardTitle
          style={{
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-body-size, 20px)',
            fontWeight: 'var(--typography-body-weight, 500)',
            lineHeight: 'var(--typography-body-line-height, 1.5)',
            color: 'var(--neutral-900)'
          }}
        >
          {scene.name}
        </CardTitle>
        {scene.short_description && (
          <p
            className="mt-1 line-clamp-2"
            style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              fontWeight: 'var(--typography-meta-weight, 500)',
              lineHeight: 'var(--typography-meta-line-height, 1.5)',
              color: 'var(--neutral-600)'
            }}
          >
            {scene.short_description}
          </p>
        )}
      </CardHeader>

      <CardContent
        className="flex-1 flex flex-col space-y-3"
        style={{
          fontFamily: 'var(--font-family)',
          fontSize: 'var(--typography-meta-size, 16px)',
          fontWeight: 'var(--typography-meta-weight, 500)',
          lineHeight: 'var(--typography-meta-line-height, 1.5)',
          color: 'var(--neutral-600)'
        }}
      >
        {/* Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--neutral-600)'
              }}
            >
              Progress
            </span>
            <span
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--neutral-600)'
              }}
            >
              {displayEngaged}/{displayTotal} participants
            </span>
          </div>
          <div 
            className="w-full overflow-hidden"
            style={{
              height: '8px',
              backgroundColor: 'var(--neutral-100)',
              borderRadius: 'var(--radius-corner, 10px)'
            }}
          >
            <div
              className="h-full transition-all duration-300"
              style={{ 
                width: `${progressPercent}%`,
                background: 'var(--gradient-brand)',
                borderRadius: progressPercent >= 100 
                  ? 'var(--radius-corner, 10px)' 
                  : 'var(--radius-corner, 10px) 0 0 var(--radius-corner, 10px)',
                minWidth: progressPercent > 0 ? '4px' : '0'
              }}
            />
          </div>
        </div>

        {/* Participants Section - Compact */}
        <div className="space-y-2">
          <h4
            style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              fontWeight: 'var(--typography-meta-weight, 500)',
              lineHeight: 'var(--typography-meta-line-height, 1.5)',
              color: 'var(--neutral-600)'
            }}
          >
            Participants
          </h4>
          
          {/* Get participants from normalized data or fallback to legacy arrays */}
          {scene.participants && scene.participants.length > 0 ? (
            <>
              {/* Artists */}
              {(() => {
                const artists = scene.participants.filter(p => p.participant_type === 'artist' && p.artist_name);
                return artists.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Icon name="music" size={16} color="var(--neutral-600)" />
                      <span
                        style={{
                          fontFamily: 'var(--font-family)',
                          fontSize: 'var(--typography-meta-size, 16px)',
                          fontWeight: 'var(--typography-meta-weight, 500)',
                          lineHeight: 'var(--typography-meta-line-height, 1.5)',
                          color: 'var(--neutral-600)'
                        }}
                      >
                        Artists ({artists.length})
                      </span>
                    </div>
                    <p
                      className="line-clamp-1"
                      style={{
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)',
                        color: 'var(--neutral-600)'
                      }}
                    >
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
                    <div className="flex items-center gap-1.5">
                      <Icon name="location" size={16} color="var(--neutral-600)" />
                      <span
                        style={{
                          fontFamily: 'var(--font-family)',
                          fontSize: 'var(--typography-meta-size, 16px)',
                          fontWeight: 'var(--typography-meta-weight, 500)',
                          lineHeight: 'var(--typography-meta-line-height, 1.5)',
                          color: 'var(--neutral-600)'
                        }}
                      >
                        Venues ({venues.length})
                      </span>
                    </div>
                    <p
                      className="line-clamp-1"
                      style={{
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)',
                        color: 'var(--neutral-600)'
                      }}
                    >
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
                  <div className="flex items-center gap-1.5">
                    <Icon name="location" size={16} color="var(--neutral-600)" />
                    <span
                      style={{
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)',
                        color: 'var(--neutral-600)'
                      }}
                    >
                      Venues ({scene.participating_venues.length})
                    </span>
                  </div>
                  <p
                    className="line-clamp-1"
                    style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      color: 'var(--neutral-600)'
                    }}
                  >
                    {scene.participating_venues.slice(0, 3).join(', ')}
                    {scene.participating_venues.length > 3 && ` +${scene.participating_venues.length - 3}`}
                  </p>
                </div>
              )}
              {scene.participating_artists && scene.participating_artists.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Icon name="music" size={16} color="var(--neutral-600)" />
                    <span
                      style={{
                        fontFamily: 'var(--font-family)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)',
                        color: 'var(--neutral-600)'
                      }}
                    >
                      Artists ({scene.participating_artists.length})
                    </span>
                  </div>
                  <p
                    className="line-clamp-1"
                    style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      color: 'var(--neutral-600)'
                    }}
                  >
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
          <div className="flex items-center gap-1">
            <Icon name="calendar" size={16} color="var(--neutral-600)" />
            <span
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--neutral-600)'
              }}
            >
              {scene.upcomingEventsCount || 0} upcoming
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Icon name="twoUsers" size={16} color="var(--neutral-600)" />
            <span
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--neutral-600)'
              }}
            >
              {scene.activeReviewersCount || 0} reviewers
            </span>
          </div>
        </div>
      </CardContent>
      </div>
    </Card>
  );
};

