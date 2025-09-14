import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Music, Star, Calendar, X, Heart, HeartOff } from 'lucide-react';
import type { Artist } from '@/types/concertSearch';
import { cn } from '@/lib/utils';

interface ArtistSelectorProps {
  artist: Artist;
  onViewEvents: () => void;
  onRemove: () => void;
  onToggleFavorite?: (artistId: string) => void;
  isFavorite?: boolean;
  className?: string;
}

export function ArtistSelector({ 
  artist, 
  onViewEvents, 
  onRemove, 
  onToggleFavorite,
  isFavorite = false,
  className 
}: ArtistSelectorProps) {
  const formatGenres = (genres: string[] = []) => {
    if (genres.length === 0) return null;
    return genres.slice(0, 4).join(', ');
  };

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleFavorite) {
      onToggleFavorite(artist.id);
    }
  };

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="w-12 h-12">
              <AvatarImage src={artist.image_url || undefined} />
              <AvatarFallback>
                <Music className="w-6 h-6" />
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-lg flex items-center gap-2">
                {artist.name}
                {artist.popularity_score && artist.popularity_score > 0 && (
                  <div className="flex items-center gap-1">
                    <Star className="w-4 h-4 text-yellow-400 fill-current" />
                    <span className="text-sm text-gray-500">
                      {artist.popularity_score}
                    </span>
                  </div>
                )}
              </CardTitle>
              {artist.jambase_artist_id && (
                <Badge variant="outline" className="text-xs mt-1">
                  JamBase Verified
                </Badge>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {onToggleFavorite && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleFavorite}
                className={cn(
                  "h-8 w-8 p-0",
                  isFavorite 
                    ? "text-red-500 hover:text-red-600" 
                    : "text-gray-400 hover:text-red-500"
                )}
              >
                {isFavorite ? (
                  <Heart className="w-4 h-4 fill-current" />
                ) : (
                  <HeartOff className="w-4 h-4" />
                )}
              </Button>
            )}
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onRemove}
              className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-0">
        {artist.description && (
          <div className="mb-4">
            <p className="text-sm text-gray-600 leading-relaxed">
              {artist.description}
            </p>
          </div>
        )}
        
        {artist.genres && artist.genres.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-1">
              {artist.genres.map((genre, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="text-xs px-2 py-1"
                >
                  {genre}
                </Badge>
              ))}
            </div>
          </div>
        )}
        
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>View Events</span>
            </div>
          </div>
          
          <Button 
            onClick={onViewEvents}
            className="bg-blue-500 hover:bg-blue-600 text-white"
          >
            <Calendar className="w-4 h-4 mr-2" />
            Browse Events
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
