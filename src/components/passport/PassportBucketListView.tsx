import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Music, Building2, X, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { BucketListService, type BucketListItem } from '@/services/bucketListService';
import { SearchBar } from '@/components/SearchBar';
import { UnifiedArtistSearchService } from '@/services/unifiedArtistSearchService';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

interface PassportBucketListViewProps {
  userId: string;
  /**
   * Whether the viewer is allowed to edit this user's bucket list.
   * On other users' profiles this should be false.
   */
  canEdit?: boolean;
}

interface ArtistHit {
  id: string;
  name: string;
  imageUrl?: string;
}

export const PassportBucketListView: React.FC<PassportBucketListViewProps> = ({ userId, canEdit = true }) => {
  const [bucketList, setBucketList] = useState<BucketListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddArtist, setShowAddArtist] = useState(false);
  const [reordering, setReordering] = useState(false);

  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<ArtistHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadBucketList();
  }, [userId]);

  // Debounced search, inline results — mirrors the mobile bucket-list tab
  // (PassportBucketTab.tsx) instead of a floating dropdown, so nothing gets
  // hidden or repositioned out from under the user while they type.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!canEdit || q.length < 2) {
      setHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      void (async () => {
        try {
          const results = await UnifiedArtistSearchService.searchArtists(q, 8);
          setHits(results.map(r => ({ id: r.id, name: r.name, imageUrl: r.image_url })));
        } finally {
          setSearching(false);
        }
      })();
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, canEdit]);

  const inList = useMemo(() => {
    const set = new Set<string>();
    for (const item of bucketList) {
      if (item.entity_id) set.add(item.entity_id);
    }
    return set;
  }, [bucketList]);

  const loadBucketList = async () => {
    setLoading(true);
    try {
      const items = await BucketListService.getBucketList(userId);
      setBucketList(items);
    } catch (error) {
      console.error('Error loading bucket list:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddHit = async (hit: ArtistHit) => {
    if (!canEdit) return;
    setAddingId(hit.id);
    try {
      const success = await BucketListService.addArtist(userId, hit.id, hit.name);
      if (success) {
        setQuery('');
        setHits([]);
        await loadBucketList();
      }
    } catch (error) {
      console.error('Error adding artist:', error);
    } finally {
      setAddingId(null);
    }
  };

  const handleRemove = async (itemId: string) => {
    if (!canEdit) return;
    try {
      const success = await BucketListService.removeItem(userId, itemId);
      if (success) {
        await loadBucketList();
      }
    } catch (error) {
      console.error('Error removing item:', error);
    }
  };

  const handleReorder = async (index: number, direction: 'up' | 'down') => {
    if (!canEdit || reordering) return;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= bucketList.length) return;

    const reordered = bucketList.slice();
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setBucketList(reordered);

    setReordering(true);
    try {
      await BucketListService.reorderBucketList(userId, reordered.map((i) => i.id));
    } catch (error) {
      console.error('Error reordering bucket list:', error);
      await loadBucketList();
    } finally {
      setReordering(false);
    }
  };

  const handleItemClick = (item: BucketListItem) => {
    // Use entity_name from bucket_list - that's all we need!
    // The existing card opening mechanism (used in feeds/searches) will handle the lookup
    const entityType = item.entity_type || (item.artist ? 'artist' : item.venue ? 'venue' : null);
    
    if (!entityType) {
      console.error('Cannot determine entity type for item:', item);
      return;
    }
    
    if (entityType === 'artist' || item.artist) {
      // Dispatch the same event that feeds/searches use
      const event = new CustomEvent('open-artist-card', {
        detail: {
          artistId: item.entity_id,
          artistName: item.entity_name,
        },
        bubbles: true,
      });
      document.dispatchEvent(event);
    } else if (entityType === 'venue' || item.venue) {
      // Dispatch the same event that feeds/searches use
      const event = new CustomEvent('open-venue-card', {
        detail: {
          venueId: item.entity_id,
          venueName: item.entity_name,
        },
        bubbles: true,
      });
      document.dispatchEvent(event);
    } else {
      console.error('Unknown entity type:', entityType, item);
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4 overflow-visible">
      {/* Add Items Section - only for own profile */}
      {canEdit && (
        <Card style={{ overflow: 'visible' }}>
          <CardContent className="p-4" style={{ overflow: 'visible' }}>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddArtist(!showAddArtist);
                  setQuery('');
                  setHits([]);
                }}
                className="flex-1"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Artist
              </Button>
            </div>

            {showAddArtist && (
              <div className="mt-4">
                <SearchBar
                  value={query}
                  onChange={setQuery}
                  placeholder="Search for an artist to add..."
                  widthVariant="full"
                  spellCheck={false}
                />

                {searching ? (
                  <div className="flex items-center justify-center mt-3">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mr-2" />
                    <span className="text-sm text-muted-foreground">Searching...</span>
                  </div>
                ) : hits.length > 0 ? (
                  <div className="mt-3 space-y-1">
                    {hits.map(hit => {
                      const already = inList.has(hit.id);
                      return (
                        <div key={hit.id} className="flex items-center gap-3 py-2 border-b last:border-b-0">
                          <Avatar className="h-9 w-9 flex-shrink-0">
                            {hit.imageUrl ? (
                              <AvatarImage src={hit.imageUrl} alt={hit.name} />
                            ) : (
                              <AvatarFallback className="text-xs">
                                <Music className="w-4 h-4" />
                              </AvatarFallback>
                            )}
                          </Avatar>
                          <span className="flex-1 min-w-0 font-semibold text-sm truncate">{hit.name}</span>
                          {already ? (
                            <span className="text-xs text-muted-foreground flex-shrink-0">Added</span>
                          ) : (
                            <Button
                              size="sm"
                              className="flex-shrink-0"
                              disabled={addingId != null}
                              onClick={() => handleAddHit(hit)}
                            >
                              {addingId === hit.id ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5 mr-1" />
                                  Add
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : query.trim().length >= 2 ? (
                  <p className="text-sm text-muted-foreground mt-3">
                    No artists found for &quot;{query.trim()}&quot;.
                  </p>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {bucketList.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground mb-2">
              {canEdit ? 'Your bucket list is empty' : 'No bucket list items yet'}
            </p>
            <p className="text-sm text-muted-foreground">
              {canEdit
                ? 'Add artists to get notified when new shows are announced!'
                : 'Follow this fan to see more of their live music plans.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {bucketList.map((item, index) => (
            <Card
              key={item.id}
              className="cursor-pointer hover:shadow-md transition-shadow border-2 hover:border-synth-pink/50"
              onClick={() => handleItemClick(item)}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  {canEdit && (
                    <div className="flex flex-col flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-6 p-0"
                        disabled={index === 0 || reordering}
                        onClick={() => handleReorder(index, 'up')}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-5 w-6 p-0"
                        disabled={index === bucketList.length - 1 || reordering}
                        onClick={() => handleReorder(index, 'down')}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  <div className="h-6 w-6 rounded-full flex items-center justify-center border text-xs font-semibold text-muted-foreground flex-shrink-0">
                    {index + 1}
                  </div>
                  <Avatar className="h-10 w-10 flex-shrink-0">
                    {(item.entity_type === 'artist' && item.artist?.image_url) ||
                     (item.entity_type === 'venue' && item.venue?.image_url) ? (
                      <AvatarImage
                        src={
                          item.entity_type === 'artist'
                            ? item.artist?.image_url
                            : item.venue?.image_url
                        }
                        alt={item.entity_name}
                      />
                    ) : (
                      <AvatarFallback className="text-xs">
                        {item.entity_type === 'artist' ? (
                          <Music className="w-5 h-5" />
                        ) : (
                          <Building2 className="w-5 h-5" />
                        )}
                      </AvatarFallback>
                    )}
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      {/* Just show the name - no "Artist" or "Venue" label */}
                      <h4 className="font-semibold text-sm truncate">{item.entity_name}</h4>
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 flex-shrink-0 hover:bg-red-100 hover:text-red-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemove(item.id);
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        Added {new Date(item.added_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

