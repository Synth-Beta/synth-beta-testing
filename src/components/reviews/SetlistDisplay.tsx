import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Music, ChevronDown, ChevronUp, ExternalLink, Calendar, MapPin, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CustomSetlistSong } from '@/services/reviewService';

interface SetlistDisplayProps {
  setlist?: any; // SetlistData from setlistService (API verified)
  customSetlist?: CustomSetlistSong[]; // User-created custom setlist
  className?: string;
  compact?: boolean;
  type?: 'api' | 'custom'; // Type of setlist
}

export function SetlistDisplay({ setlist, customSetlist, className, compact = false, type }: SetlistDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Determine type if not explicitly provided
  const actualType = type || (customSetlist ? 'custom' : 'api');
  const displayData = actualType === 'custom' ? customSetlist : setlist;

  if (!displayData) return null;
  
  // For custom setlists, we have a simpler structure
  if (actualType === 'custom') {
    const songs = customSetlist || [];
    const totalSongs = songs.length;

    if (totalSongs === 0) return null;

    if (compact) {
      return (
        <div>
          <button
            className={cn("flex items-center justify-between gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200 hover:bg-purple-100 transition-colors w-full", className)}
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-purple-800">
                Custom Setlist • {totalSongs} song{totalSongs !== 1 ? 's' : ''}
              </span>
            </div>
            {isExpanded ? <ChevronUp className="w-4 h-4 text-purple-600" /> : <ChevronDown className="w-4 h-4 text-purple-600" />}
          </button>
          {isExpanded && (
            <div className="mt-2 p-4 bg-white rounded-lg border border-purple-200">
              <div className="space-y-2">
                {songs.map((song, index) => (
                  <div key={index} className="flex items-start gap-3 p-2 bg-purple-50/30 rounded">
                    <span className="text-sm font-medium text-purple-500 w-8 text-right flex-shrink-0">
                      {song.position}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900 block">
                        {song.song_name}
                      </span>
                      {song.cover_artist && (
                        <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700 mt-1">
                          Cover: {song.cover_artist}
                        </Badge>
                      )}
                      {song.notes && (
                        <p className="text-xs text-gray-600 mt-1 italic">
                          "{song.notes}"
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    return (
      <Card className={cn("border-purple-300 bg-gradient-to-br from-purple-50 to-pink-50", className)}>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <User className="w-5 h-5 text-purple-600" />
                <h4 className="font-semibold text-purple-900">Custom Setlist</h4>
                <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                  {totalSongs} song{totalSongs !== 1 ? 's' : ''}
                </Badge>
              </div>
              <p className="text-xs text-purple-600">User-created setlist for this show</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-purple-600 border-purple-300 hover:bg-purple-100"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
              {isExpanded ? 'Hide' : 'Show'} Setlist
            </Button>
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="pt-0">
            <div className="space-y-2">
              {songs.map((song, index) => (
                <div key={index} className="flex items-start gap-3 p-3 bg-white/60 rounded border border-purple-100">
                  <span className="text-sm font-medium text-purple-500 w-8 text-right flex-shrink-0">
                    {song.position}.
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-purple-900 block">
                      {song.song_name}
                    </span>
                    {song.cover_artist && (
                      <div className="mt-1">
                        <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                          Cover: {song.cover_artist}
                        </Badge>
                      </div>
                    )}
                    {song.notes && (
                      <p className="text-xs text-purple-700 mt-1 italic">
                        "{song.notes}"
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    );
  }

  // Original API setlist display logic below
  if (!setlist) return null;

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  };

  const groupSongsBySet = (songs: any[]) => {
    const sets: { [key: number]: any[] } = {};
    songs.forEach(song => {
      if (!sets[song.setNumber]) {
        sets[song.setNumber] = [];
      }
      sets[song.setNumber].push(song);
    });
    return sets;
  };

  const sets = groupSongsBySet(setlist.songs || []);
  const totalSongs = setlist.songs?.length || 0;

  if (compact) {
    return (
      <div>
        <button
          className={cn("flex items-center justify-between gap-2 p-3 bg-purple-50 rounded-lg border border-purple-200 hover:bg-purple-100 transition-colors w-full", className)}
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
        >
          <div className="flex items-center gap-2">
            <Music className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-purple-800">
              {totalSongs} songs • {Object.keys(sets).length} set{Object.keys(sets).length !== 1 ? 's' : ''}
            </span>
          </div>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-purple-600" /> : <ChevronDown className="w-4 h-4 text-purple-600" />}
        </button>
        {isExpanded && (
          <div className="mt-2 p-4 bg-white rounded-lg border border-purple-200">
            {Object.entries(sets).map(([setNum, songs]) => (
              <div key={setNum} className="mb-4 last:mb-0">
                <h5 className="text-sm font-bold text-purple-900 mb-2">
                  Set {setNum} ({songs.length} songs)
                </h5>
                <div className="space-y-1">
                  {songs.map((song: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-sm">
                      <span className="text-purple-400 font-medium w-6 text-right flex-shrink-0">
                        {idx + 1}.
                      </span>
                      <div className="flex-1">
                        <span className="text-gray-900">{song.name}</span>
                        {song.info && <span className="text-gray-500 ml-2 text-xs">({song.info})</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card className={cn("border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Music className="w-5 h-5 text-purple-600" />
              <h4 className="font-semibold text-purple-900">Setlist</h4>
              <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                {totalSongs} songs
              </Badge>
            </div>
            <div className="space-y-1 text-sm text-purple-700">
              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                {formatDate(setlist.eventDate)}
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3" />
                {setlist.venue?.name}, {setlist.venue?.city}
                {setlist.venue?.state && `, ${setlist.venue.state}`}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-purple-600 border-purple-300 hover:bg-purple-100"
            >
              {isExpanded ? <ChevronUp className="w-4 h-4 mr-1" /> : <ChevronDown className="w-4 h-4 mr-1" />}
              {isExpanded ? 'Hide' : 'Show'} Setlist
            </Button>
            {setlist.url && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(setlist.url, '_blank')}
                className="text-purple-600 border-purple-300 hover:bg-purple-100"
              >
                <ExternalLink className="w-4 h-4 mr-1" />
                Setlist.fm
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {setlist.info && (
            <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
              {setlist.info}
            </div>
          )}
          
          <div className="space-y-4">
            {Object.entries(sets).map(([setNumber, songs]) => (
              <div key={setNumber} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-medium border-purple-300 text-purple-700">
                    {songs[0]?.setName || `Set ${setNumber}`}
                  </Badge>
                  <span className="text-sm text-purple-600">
                    {songs.length} song{songs.length !== 1 ? 's' : ''}
                  </span>
                </div>
                
                <div className="space-y-1">
                  {songs.map((song, songIndex) => (
                    <div key={songIndex} className="flex items-center gap-3 p-2 bg-white/60 rounded border border-purple-100">
                      <span className="text-sm font-medium text-purple-500 w-8 text-right">
                        {song.position}.
                      </span>
                      <span className="text-sm flex-1 text-purple-900">
                        {song.name}
                      </span>
                      {song.cover && (
                        <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                          {song.cover.artist}
                        </Badge>
                      )}
                      {song.tape && (
                        <Badge variant="outline" className="text-xs border-purple-300 text-purple-600">
                          Tape
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
