import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Music, ExternalLink, Calendar, MapPin } from 'lucide-react';

interface Song {
  name: string;
  position: number;
  setNumber: number;
  setName: string;
  cover?: {
    artist: string;
    mbid: string;
  };
  info?: string;
  tape: boolean;
}

interface SetlistData {
  setlistFmId: string;
  versionId: string;
  eventDate: string;
  artist: {
    name: string;
    mbid: string;
  };
  venue: {
    name: string;
    city: string;
    state: string;
    country: string;
  };
  tour?: string;
  info?: string;
  url: string;
  songs: Song[];
  songCount: number;
  lastUpdated: string;
}

interface SetlistDisplayProps {
  setlist: SetlistData;
  className?: string;
}

export const SetlistDisplay: React.FC<SetlistDisplayProps> = ({ setlist, className = '' }) => {
  if (!setlist || !setlist.songs || setlist.songs.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="p-6 text-center text-muted-foreground">
          <Music className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>No setlist available for this event</p>
        </CardContent>
      </Card>
    );
  }

  // Group songs by set
  const sets = setlist.songs.reduce((acc, song) => {
    const setName = song.setName || `Set ${song.setNumber}`;
    if (!acc[setName]) {
      acc[setName] = [];
    }
    acc[setName].push(song);
    return acc;
  }, {} as Record<string, Song[]>);

  const formatDate = (dateStr: string) => {
    try {
      const [day, month, year] = dateStr.split('-');
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-2">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Music className="h-5 w-5" />
              Setlist
            </CardTitle>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {formatDate(setlist.eventDate)}
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="h-4 w-4" />
                {setlist.venue.name}, {setlist.venue.city}, {setlist.venue.state}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              {setlist.songCount} songs
            </Badge>
            {setlist.url && (
              <a
                href={setlist.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
        {setlist.tour && (
          <Badge variant="outline" className="w-fit">
            {setlist.tour}
          </Badge>
        )}
        {setlist.info && (
          <p className="text-sm text-muted-foreground italic">{setlist.info}</p>
        )}
      </CardHeader>
      
      <CardContent className="space-y-6">
        {Object.entries(sets).map(([setName, songs], setIndex) => (
          <div key={setName} className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg">{setName}</h3>
              <Badge variant="outline" className="text-xs">
                {songs.length} songs
              </Badge>
            </div>
            
            <div className="grid gap-2">
              {songs.map((song, songIndex) => (
                <div
                  key={`${setIndex}-${songIndex}`}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <span className="text-sm font-mono text-muted-foreground w-8 text-right">
                    {song.position}
                  </span>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{song.name}</span>
                      {song.cover && (
                        <Badge variant="secondary" className="text-xs">
                          {song.cover.artist}
                        </Badge>
                      )}
                      {song.tape && (
                        <Badge variant="outline" className="text-xs">
                          Tape
                        </Badge>
                      )}
                    </div>
                    {song.info && (
                      <p className="text-xs text-muted-foreground italic mt-1">
                        {song.info}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            
            {setIndex < Object.keys(sets).length - 1 && (
              <Separator className="my-4" />
            )}
          </div>
        ))}
        
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Setlist data from{' '}
            <a
              href="https://www.setlist.fm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800"
            >
              setlist.fm
            </a>
            {' '}• Last updated: {new Date(setlist.lastUpdated).toLocaleDateString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
};

export default SetlistDisplay;
