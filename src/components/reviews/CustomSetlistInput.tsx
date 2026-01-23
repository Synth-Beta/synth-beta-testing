import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Music, Trash2, X, PenSquare, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReviewCustomSetlist } from '@/hooks/useReviewForm';

interface CustomSetlistInputProps {
  setlists: ReviewCustomSetlist[];
  onChange: (setlists: ReviewCustomSetlist[]) => void;
  className?: string;
  disabled?: boolean;
}

// One-off purple for this flow only
const SETLIST_PURPLE = '#6b21a8';
const SETLIST_PURPLE_HOVER = 'rgba(107, 33, 168, 0.9)';

export function CustomSetlistInput({ setlists, onChange, className, disabled = false }: CustomSetlistInputProps) {
  const reactId = useId();
  const fieldId = (suffix: string) => `custom-setlist-${reactId}-${suffix}`;
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'add' | 'edit'>('add');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newSong, setNewSong] = useState<Omit<ReviewCustomSetlist['songs'][number], 'position'>>({
    song_name: '',
    cover_artist: '',
    notes: ''
  });
  const [activeSetlistId, setActiveSetlistId] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleInput, setTitleInput] = useState('');

  const activeSetlist = useMemo(
    () => setlists.find((s) => s.id === activeSetlistId) || setlists[0],
    [setlists, activeSetlistId]
  );

  // Track previous length so we can detect when a new setlist has been added
  const prevLengthRef = useRef(setlists.length);

  useEffect(() => {
    if (!activeSetlistId && setlists.length > 0) {
      setActiveSetlistId(setlists[0].id);
      setTitleInput(setlists[0].title);
    } else if (activeSetlist) {
      setTitleInput(activeSetlist.title);
    }
  }, [activeSetlistId, setlists, activeSetlist]);

  // When a new setlist is added (length increases), automatically open the editor
  // on the newest setlist in Add mode.
  useEffect(() => {
    if (setlists.length > prevLengthRef.current) {
      const newSetlist = setlists[setlists.length - 1];
      if (newSetlist) {
        setActiveSetlistId(newSetlist.id);
        setTitleInput(newSetlist.title);
        setIsExpanded(true);
        setActiveTab('add');
        setEditingIndex(null);
      }
    }
    prevLengthRef.current = setlists.length;
  }, [setlists, setlists.length]);

  const handleEnsureActiveSetlist = () => {
    if (!activeSetlist && setlists.length === 0) {
      const firstSetlist: ReviewCustomSetlist = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: 'Setlist 1',
        isAutoTitle: true,
        songs: [],
      };
      onChange([firstSetlist]);
      setActiveSetlistId(firstSetlist.id);
      setTitleInput(firstSetlist.title);
    } else if (!activeSetlist && setlists.length > 0) {
      setActiveSetlistId(setlists[0].id);
    }
  };

  const handleAddSong = () => {
    if (!activeSetlist) {
      handleEnsureActiveSetlist();
    }
    const target = activeSetlist || setlists[0];
    if (!newSong.song_name.trim()) return;

    const song: ReviewCustomSetlist['songs'][number] = {
      song_name: newSong.song_name.trim(),
      cover_artist: newSong.cover_artist?.trim() || undefined,
      notes: newSong.notes?.trim() || undefined,
      position: (target?.songs.length || 0) + 1
    };

    const updated = setlists.map((s) =>
      s.id === target.id ? { ...s, songs: [...s.songs, song] } : s
    );
    onChange(updated);
    setNewSong({ song_name: '', cover_artist: '', notes: '' });
    // Stay in add mode, don't close form
  };

  const handleEditSongFromList = (index: number) => {
    if (!activeSetlist) return;
    const song = activeSetlist.songs[index];
    setNewSong({
      song_name: song.song_name,
      cover_artist: song.cover_artist || '',
      notes: song.notes || ''
    });
    setEditingIndex(index);
    setActiveTab('add'); // Switch to Add Song tab
  };

  const handleSaveEdit = () => {
    if (editingIndex === null || !newSong.song_name.trim()) return;

    if (!activeSetlist) return;

    const updatedSongs = [...activeSetlist.songs];
    updatedSongs[editingIndex] = {
      song_name: newSong.song_name.trim(),
      cover_artist: newSong.cover_artist?.trim() || undefined,
      notes: newSong.notes?.trim() || undefined,
      position: editingIndex + 1
    };

    const updated = setlists.map((s) =>
      s.id === activeSetlist.id ? { ...s, songs: updatedSongs } : s
    );
    onChange(updated);
    setNewSong({ song_name: '', cover_artist: '', notes: '' });
    setEditingIndex(null);
    setActiveTab('edit'); // Switch back to Edit Setlist tab after saving
  };

  const handleCancelEdit = () => {
    setNewSong({ song_name: '', cover_artist: '', notes: '' });
    setEditingIndex(null);
    setActiveTab('edit'); // Switch back to Edit Setlist tab after canceling
  };

  const handleDeleteSong = (index: number) => {
    if (!activeSetlist) return;
    const updatedSongs = activeSetlist.songs.filter((_, i) => i !== index);
    // Reorder positions
    const reorderedSongs = updatedSongs.map((song, i) => ({
      ...song,
      position: i + 1
    }));
    const updated = setlists.map((s) =>
      s.id === activeSetlist.id ? { ...s, songs: reorderedSongs } : s
    );
    onChange(updated);
  };

  const handleDeleteSetlist = (targetId?: string) => {
    const idToDelete = targetId || activeSetlist?.id;
    if (!idToDelete) return;
    const remaining = setlists.filter((s) => s.id !== idToDelete);

    // Renumber only auto-titled setlists based on new order
    let autoIndex = 1;
    const renumbered = remaining.map((s) => {
      if (!s.isAutoTitle) return s;
      const updatedTitle = `Setlist ${autoIndex}`;
      autoIndex += 1;
      return { ...s, title: updatedTitle };
    });

    onChange(renumbered);

    if (renumbered.length > 0) {
      setActiveSetlistId(renumbered[0].id);
      setTitleInput(renumbered[0].title);
    } else {
      setActiveSetlistId(null);
      setTitleInput('');
    }
    setIsExpanded(false);
  };

  const handleSaveSetlist = () => {
    setIsExpanded(false);
    setEditingIndex(null);
    setActiveTab('edit');
  };

  const handleCloseEditor = () => {
    setIsExpanded(false);
    setActiveTab('add');
    setEditingIndex(null);
    setNewSong({ song_name: '', cover_artist: '', notes: '' });
  };

  const handleOpenEditor = () => {
    handleEnsureActiveSetlist();
    setIsExpanded(true);
    setActiveTab('edit');
    setEditingIndex(null);
  };

  const handleAddSetlist = () => {
    const autoTitled = setlists.filter((s) => s.isAutoTitle);
    const nextNumber = autoTitled.length + 1;
    const newSetlist: ReviewCustomSetlist = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: `Setlist ${nextNumber}`,
      isAutoTitle: true,
      songs: [],
    };
    const updated = [...setlists, newSetlist];
    onChange(updated);
    setActiveSetlistId(newSetlist.id);
    setTitleInput(newSetlist.title);
    setIsExpanded(true);
    setActiveTab('add');
    setEditingIndex(null);
  };

  const handleStartEditingTitle = () => {
    if (!activeSetlist) return;
    setIsEditingTitle(true);
    setTitleInput(activeSetlist.title);
  };

  const handleCancelTitleEdit = () => {
    if (!activeSetlist) return;
    setTitleInput(activeSetlist.title);
    setIsEditingTitle(false);
  };

  const handleSaveTitle = () => {
    if (!activeSetlist) return;
    const trimmed = titleInput.trim();
    if (!trimmed) return;

    const updated = setlists.map((s) => {
      if (s.id !== activeSetlist.id) return s;

      // If nothing actually changed, leave the setlist exactly as-is
      if (trimmed === s.title) {
        return s;
      }

      const wasAuto = s.isAutoTitle;
      return {
        ...s,
        title: trimmed,
        // Only flip isAutoTitle from true -> false when the title actually changes
        isAutoTitle: wasAuto ? false : s.isAutoTitle,
      };
    });

    onChange(updated);
    setIsEditingTitle(false);
  };

  const canSaveTitle = titleInput.trim().length > 0;

  // Collapsed state - show summary cards for each saved setlist
  if (!isExpanded && setlists.length > 0) {
  return (
    <div className={cn("space-y-3", className, disabled && "opacity-50 pointer-events-none")}>
        <div className="flex-1 space-y-3">
          {setlists.map((setlist) => (
            <Card key={setlist.id} className="border-pink-200 bg-pink-50">
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Music className="w-4 h-4 sm:w-5 sm:h-5 text-pink-600 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                      {setlist.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (disabled) return;
                      handleDeleteSetlist(setlist.id);
                    }}
                    disabled={disabled}
                    className="h-11 w-11 flex items-center justify-center rounded-md"
                    aria-label="Delete setlist"
                  >
                    <Trash2 className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 mb-3">
                  {setlist.songs.length} {setlist.songs.length === 1 ? 'song' : 'songs'}
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (disabled) return;
                    setActiveSetlistId(setlist.id);
                    setIsExpanded(true);
                    setActiveTab('edit');
                    setEditingIndex(null);
                  }}
                  disabled={disabled}
                  className="btn-synth-secondary w-full"
                >
                  Edit Setlist
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Expanded state - show editor with tabs
  if (isExpanded && activeSetlist) {
    return (
      <div className={cn("space-y-3", className, disabled && "opacity-50 pointer-events-none")}>
        <Card className="border-purple-300 bg-purple-50" style={{ borderColor: SETLIST_PURPLE }}>
          <CardContent className="p-5" style={{ paddingLeft: '20px', paddingRight: '20px' }}>
            {/* X icon row */}
            <div className="flex items-center justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCloseEditor}
                disabled={disabled}
                className="h-8 w-8 p-0 flex-shrink-0"
              >
                <X style={{ width: 24, height: 24, color: SETLIST_PURPLE }} />
              </Button>
            </div>
            {/* Title row - 12px below X icon */}
            <div className="flex items-center mb-4" style={{ marginTop: '12px', gap: '6px' }}>
              {/* Title container hugs text width up to available space before the icon */}
              <div className="min-w-0" style={{ maxWidth: 'calc(100% - 56px)' }}>
                {isEditingTitle ? (
                  <Input
                    value={titleInput}
                    onChange={(e) => setTitleInput(e.target.value)}
                    onBlur={handleCancelTitleEdit}
                    disabled={disabled}
                    className="text-base sm:text-lg font-semibold"
                    style={{
                      maxWidth: '100%',
                    }}
                    autoFocus
                  />
                ) : (
                  <h3
                    className="text-base sm:text-lg font-semibold"
                    style={{
                      color: SETLIST_PURPLE,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {activeSetlist.title}
                  </h3>
                )}
              </div>
              <button
                type="button"
                onClick={isEditingTitle ? handleSaveTitle : handleStartEditingTitle}
                onMouseDown={(e) => {
                  // Prevent blur from firing when clicking the check button
                  if (isEditingTitle) {
                    e.preventDefault();
                  }
                }}
                disabled={disabled || (isEditingTitle && !canSaveTitle)}
                className="flex items-center justify-center rounded-full flex-shrink-0"
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  width: 44,
                  height: 44,
                }}
                aria-label={isEditingTitle ? 'Save setlist title' : 'Edit setlist title'}
              >
                {isEditingTitle ? (
                  <Check
                    style={{
                      width: 24,
                      height: 24,
                      color: SETLIST_PURPLE,
                    }}
                  />
                ) : (
                  <PenSquare
                    style={{
                      width: 24,
                      height: 24,
                      color: SETLIST_PURPLE,
                    }}
                  />
                )}
              </button>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'add' | 'edit')} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4" style={{ backgroundColor: 'rgba(107, 33, 168, 0.08)' }}>
                <TabsTrigger 
                  value="add"
                  className="data-[state=active]:bg-white data-[state=active]:text-purple-900"
                  style={{ 
                    color: activeTab === 'add' ? SETLIST_PURPLE : 'var(--neutral-600)',
                  }}
                >
                  Add Song
                </TabsTrigger>
                <TabsTrigger 
                  value="edit"
                  className="data-[state=active]:bg-white data-[state=active]:text-purple-900"
                  style={{ 
                    color: activeTab === 'edit' ? SETLIST_PURPLE : 'var(--neutral-600)',
                  }}
                >
                  Edit Setlist
                </TabsTrigger>
              </TabsList>

              {/* Add Song Tab */}
              <TabsContent value="add" className="space-y-4 mt-0">
                <div className="space-y-3">
            <div className="space-y-2">
                    <Label htmlFor={fieldId('song_name')} className="text-xs font-medium" style={{ color: SETLIST_PURPLE }}>
                Song Name *
              </Label>
              <Input
                id={fieldId('song_name')}
                value={newSong.song_name}
                onChange={(e) => setNewSong({ ...newSong, song_name: e.target.value })}
                placeholder="Enter song name..."
                maxLength={200}
                      style={{ borderColor: 'rgba(147, 51, 234, 0.3)' }}
              />
            </div>

            <div className="space-y-2">
                    <Label htmlFor={fieldId('cover_artist')} className="text-xs font-medium" style={{ color: SETLIST_PURPLE }}>
                Cover Artist (Optional)
              </Label>
              <Input
                id={fieldId('cover_artist')}
                value={newSong.cover_artist}
                onChange={(e) => setNewSong({ ...newSong, cover_artist: e.target.value })}
                placeholder="If this was a cover, enter original artist..."
                maxLength={100}
                      style={{ borderColor: 'rgba(147, 51, 234, 0.3)' }}
              />
                    <p className="text-xs" style={{ color: SETLIST_PURPLE }}>
                Leave blank if it's an original by the performing artist
              </p>
            </div>

            <div className="space-y-2">
                    <Label htmlFor={fieldId('notes')} className="text-xs font-medium" style={{ color: SETLIST_PURPLE }}>
                Special Notes (Optional)
              </Label>
              <Textarea
                id={fieldId('notes')}
                value={newSong.notes}
                onChange={(e) => setNewSong({ ...newSong, notes: e.target.value })}
                placeholder="Any special notes about this performance..."
                maxLength={300}
                rows={2}
                      className="resize-none"
                      style={{ borderColor: 'rgba(147, 51, 234, 0.3)' }}
              />
                    <p className="text-xs" style={{ color: SETLIST_PURPLE }}>
                E.g., "Extended guitar solo", "First time played live", "Crowd favorite"
              </p>
            </div>

            <div className="flex gap-2 pt-2">
                    {editingIndex !== null && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={handleCancelEdit}
                        className="flex-1"
                        style={{ 
                          borderColor: 'var(--neutral-300)',
                          color: 'var(--neutral-700)'
                        }}
                      >
                        Cancel
                      </Button>
                    )}
              <Button
                type="button"
                onClick={editingIndex !== null ? handleSaveEdit : handleAddSong}
                disabled={!newSong.song_name.trim()}
                      className={editingIndex !== null ? "flex-1" : "w-full"}
                      style={{ 
                        backgroundColor: SETLIST_PURPLE,
                        color: 'white'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = SETLIST_PURPLE_HOVER;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = SETLIST_PURPLE;
                      }}
                    >
                {editingIndex !== null ? 'Save Changes' : 'Add Song'}
              </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Edit Setlist Tab */}
              <TabsContent value="edit" className="space-y-4 mt-0">
                <h3 className="text-base font-semibold mb-4" style={{ color: SETLIST_PURPLE }}>
                  Your Set List
                </h3>

                {activeSetlist.songs.length === 0 ? (
                  <div className="text-center py-8">
                    <Music className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(107, 33, 168, 0.3)' }} />
                    <p className="text-sm" style={{ color: SETLIST_PURPLE }}>No songs added yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {activeSetlist.songs.map((song, index) => (
                      <div key={index} className="border-b border-purple-200 pb-3 last:border-b-0">
                        <div className="flex items-start gap-3">
                          <span className="text-base font-semibold flex-shrink-0" style={{ color: SETLIST_PURPLE }}>
                            {index + 1}.
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900">{song.song_name}</div>
                            {song.cover_artist && (
                              <div className="text-xs text-gray-600 mt-1">Cover: {song.cover_artist}</div>
                            )}
                            {song.notes && (
                              <div className="text-xs text-gray-600 mt-1 italic">"{song.notes}"</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center justify-between mt-2 ml-6">
                          <button
                            type="button"
                            onClick={() => handleEditSongFromList(index)}
                            className="text-sm underline"
                            style={{ color: 'var(--neutral-600)' }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSong(index)}
                            className="p-1"
                            style={{ color: 'var(--neutral-600)' }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              <Button
                type="button"
                  onClick={handleSaveSetlist}
                  disabled={activeSetlist.songs.length === 0}
                  className="w-full mt-6"
                  style={{ 
                    backgroundColor: SETLIST_PURPLE,
                    color: 'white'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = SETLIST_PURPLE_HOVER;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = SETLIST_PURPLE;
                  }}
                >
                  Save Setlist
              </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Empty state - show "No setlists added yet" (button is now in parent component)
  return (
    <div className={cn("space-y-3", className, disabled && "opacity-50 pointer-events-none")}>
      <div className="text-center py-6 border-2 border-dashed rounded-lg" style={{ 
        borderColor: 'rgba(107, 33, 168, 0.3)',
        backgroundColor: 'rgba(107, 33, 168, 0.05)'
      }}>
        <Music className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(107, 33, 168, 0.3)' }} />
        <p className="text-sm" style={{ color: SETLIST_PURPLE }}>No setlists added yet</p>
      </div>
    </div>
  );
}
