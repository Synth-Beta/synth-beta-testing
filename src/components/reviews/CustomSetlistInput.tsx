import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Music, Plus, Trash2, GripVertical, Edit2, Save, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CustomSetlistSong {
  song_name: string;
  cover_artist?: string;
  notes?: string;
  position: number;
}

interface CustomSetlistInputProps {
  songs: CustomSetlistSong[];
  onChange: (songs: CustomSetlistSong[]) => void;
  className?: string;
  disabled?: boolean;
}

export function CustomSetlistInput({ songs, onChange, className, disabled = false }: CustomSetlistInputProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newSong, setNewSong] = useState<Omit<CustomSetlistSong, 'position'>>({
    song_name: '',
    cover_artist: '',
    notes: ''
  });

  const handleAddSong = () => {
    if (!newSong.song_name.trim()) return;

    const song: CustomSetlistSong = {
      song_name: newSong.song_name.trim(),
      cover_artist: newSong.cover_artist?.trim() || undefined,
      notes: newSong.notes?.trim() || undefined,
      position: songs.length + 1
    };

    onChange([...songs, song]);
    setNewSong({ song_name: '', cover_artist: '', notes: '' });
    setIsAdding(false);
  };

  const handleEditSong = (index: number) => {
    const song = songs[index];
    setNewSong({
      song_name: song.song_name,
      cover_artist: song.cover_artist || '',
      notes: song.notes || ''
    });
    setEditingIndex(index);
    setIsAdding(true);
  };

  const handleSaveEdit = () => {
    if (editingIndex === null || !newSong.song_name.trim()) return;

    const updatedSongs = [...songs];
    updatedSongs[editingIndex] = {
      song_name: newSong.song_name.trim(),
      cover_artist: newSong.cover_artist?.trim() || undefined,
      notes: newSong.notes?.trim() || undefined,
      position: editingIndex + 1
    };

    onChange(updatedSongs);
    setNewSong({ song_name: '', cover_artist: '', notes: '' });
    setEditingIndex(null);
    setIsAdding(false);
  };

  const handleCancelEdit = () => {
    setNewSong({ song_name: '', cover_artist: '', notes: '' });
    setEditingIndex(null);
    setIsAdding(false);
  };

  const handleDeleteSong = (index: number) => {
    const updatedSongs = songs.filter((_, i) => i !== index);
    // Reorder positions
    const reorderedSongs = updatedSongs.map((song, i) => ({
      ...song,
      position: i + 1
    }));
    onChange(reorderedSongs);
  };

  const handleMoveSong = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === songs.length - 1)
    ) {
      return;
    }

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const updatedSongs = [...songs];
    [updatedSongs[index], updatedSongs[newIndex]] = [updatedSongs[newIndex], updatedSongs[index]];
    
    // Update positions
    const reorderedSongs = updatedSongs.map((song, i) => ({
      ...song,
      position: i + 1
    }));
    
    onChange(reorderedSongs);
  };

  return (
    <div className={cn("space-y-3", className, disabled && "opacity-50 pointer-events-none")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Music className={cn("w-5 h-5", disabled ? "text-gray-400" : "text-purple-600")} />
          <Label className={cn("text-sm font-medium", disabled && "text-gray-500")}>
            {disabled ? "Custom Setlist (Disabled)" : "Custom Setlist (Optional)"}
          </Label>
          {songs.length > 0 && (
            <Badge variant="secondary" className={cn(
              disabled ? "bg-gray-100 text-gray-600" : "bg-purple-100 text-purple-800"
            )}>
              {songs.length} song{songs.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        {!isAdding && !disabled && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(true)}
            className="text-purple-600 border-purple-300 hover:bg-purple-50"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Song
          </Button>
        )}
      </div>

      <p className={cn("text-xs", disabled ? "text-gray-400" : "text-gray-500")}>
        {disabled 
          ? "Custom setlist creation is disabled because an API setlist was selected."
          : "Create your own setlist for this show. Add songs in the order they were played."
        }
      </p>

      {/* Song List */}
      {songs.length > 0 && (
        <div className="space-y-2">
          {songs.map((song, index) => (
            <Card key={index} className="border-purple-200 bg-purple-50/30">
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="flex flex-col gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => handleMoveSong(index, 'up')}
                      disabled={index === 0}
                      className="text-purple-400 hover:text-purple-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Move up"
                    >
                      <GripVertical className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveSong(index, 'down')}
                      disabled={index === songs.length - 1}
                      className="text-purple-400 hover:text-purple-600 disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label="Move down"
                    >
                      <GripVertical className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-700 font-semibold text-sm flex-shrink-0">
                    {index + 1}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-purple-900">{song.song_name}</div>
                    {song.cover_artist && (
                      <div className="text-xs text-purple-600 mt-1">
                        <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                          Cover: {song.cover_artist}
                        </Badge>
                      </div>
                    )}
                    {song.notes && (
                      <div className="text-xs text-purple-700 mt-1 italic">
                        "{song.notes}"
                      </div>
                    )}
                  </div>
                  
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditSong(index)}
                      className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteSong(index)}
                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Song Form */}
      {isAdding && (
        <Card className="border-purple-300 bg-purple-50">
          <CardHeader className="pb-3">
            <h4 className="text-sm font-semibold text-purple-900">
              {editingIndex !== null ? 'Edit Song' : 'Add Song'}
            </h4>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="song_name" className="text-xs font-medium text-purple-900">
                Song Name *
              </Label>
              <Input
                id="song_name"
                value={newSong.song_name}
                onChange={(e) => setNewSong({ ...newSong, song_name: e.target.value })}
                placeholder="Enter song name..."
                maxLength={200}
                className="border-purple-200"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cover_artist" className="text-xs font-medium text-purple-900">
                Cover Artist (Optional)
              </Label>
              <Input
                id="cover_artist"
                value={newSong.cover_artist}
                onChange={(e) => setNewSong({ ...newSong, cover_artist: e.target.value })}
                placeholder="If this was a cover, enter original artist..."
                maxLength={100}
                className="border-purple-200"
              />
              <p className="text-xs text-purple-600">
                Leave blank if it's an original by the performing artist
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes" className="text-xs font-medium text-purple-900">
                Special Notes (Optional)
              </Label>
              <Textarea
                id="notes"
                value={newSong.notes}
                onChange={(e) => setNewSong({ ...newSong, notes: e.target.value })}
                placeholder="Any special notes about this performance..."
                maxLength={300}
                rows={2}
                className="border-purple-200 resize-none"
              />
              <p className="text-xs text-purple-600">
                E.g., "Extended guitar solo", "First time played live", "Crowd favorite"
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                onClick={editingIndex !== null ? handleSaveEdit : handleAddSong}
                disabled={!newSong.song_name.trim()}
                className="bg-purple-600 hover:bg-purple-700"
              >
                <Save className="w-4 h-4 mr-1" />
                {editingIndex !== null ? 'Save Changes' : 'Add Song'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCancelEdit}
                className="border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {songs.length === 0 && !isAdding && (
        <div className="text-center py-6 border-2 border-dashed border-purple-200 rounded-lg bg-purple-50/30">
          <Music className="w-8 h-8 text-purple-300 mx-auto mb-2" />
          <p className="text-sm text-purple-600 mb-2">No songs added yet</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsAdding(true)}
            className="text-purple-600 border-purple-300 hover:bg-purple-50"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Your First Song
          </Button>
        </div>
      )}
    </div>
  );
}
