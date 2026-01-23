import React, { useId, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Star, ArrowUp, ArrowDown, Plus, Trash2, MapPin, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ShowEntry {
  id: string;
  show_name?: string; // optional free text
  show_date?: string; // yyyy-mm-dd
  venue_name?: string; // optional
  rating: number; // 1-5
  order: number; // tie-break order within same rating (lower is higher rank)
}

interface ShowRankingProps {
  shows: ShowEntry[];
  onChange: (shows: ShowEntry[]) => void;
}

export function ShowRanking({ shows, onChange }: ShowRankingProps) {
  const reactId = useId();
  const showFieldId = (showId: string, field: 'show_name' | 'show_date' | 'venue_name') =>
    `show-ranking-${reactId}-${showId}-${field}`;
  const groupedByRating = useMemo(() => {
    const map = new Map<number, ShowEntry[]>();
    for (const s of shows) {
      const arr = map.get(s.rating) || [];
      arr.push(s);
      map.set(s.rating, arr);
    }
    for (const [r, arr] of map.entries()) {
      arr.sort((a, b) => a.order - b.order);
      map.set(r, arr);
    }
    return map;
  }, [shows]);

  const hasTies = Array.from(groupedByRating.values()).some(arr => arr.length > 1);

  const setField = (id: string, field: keyof ShowEntry, value: any) => {
    onChange(shows.map(s => (s.id === id ? { ...s, [field]: value } : s)));
  };

  const setRating = (id: string, rating: number) => {
    const target = shows.find(s => s.id === id);
    if (!target) return;
    const newShows = shows.map(s => (s.id === id ? { ...s, rating } : s));
    // Re-normalize order within the rating group
    const sameRating = newShows
      .filter(s => s.rating === rating)
      .sort((a, b) => a.order - b.order)
      .map((s, idx) => ({ ...s, order: idx + 1 }));
    const updated = newShows.map(s => (s.rating === rating ? sameRating.find(x => x.id === s.id)! : s));
    onChange(updated);
  };

  const moveWithinTie = (rating: number, id: string, direction: 'up' | 'down') => {
    const arr = shows.filter(s => s.rating === rating).sort((a, b) => a.order - b.order);
    const idx = arr.findIndex(s => s.id === id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= arr.length) return;
    const tmp = arr[idx].order;
    arr[idx].order = arr[swapIdx].order;
    arr[swapIdx].order = tmp;
    const updated = shows.map(s => (s.rating === rating ? arr.find(x => x.id === s.id)! : s));
    onChange(updated);
  };

  const addShow = () => {
    const maxOrderInFive = Math.max(0, ...shows.filter(s => s.rating === 5).map(s => s.order));
    onChange([
      ...shows,
      {
        id: `show-${Date.now()}`,
        show_name: '',
        show_date: '',
        venue_name: '',
        rating: 5,
        order: maxOrderInFive + 1,
      },
    ]);
  };

  const removeShow = (id: string) => {
    onChange(shows.filter(s => s.id !== id));
  };

  return (
    <Card className="border-gray-200">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Rank Multiple Shows (Optional)</h3>
            <p className="text-sm text-gray-600">Add other shows you attended and rate them. If any share the same star rating, order those tied shows.</p>
          </div>
          <Button type="button" variant="outline" onClick={addShow} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add show
          </Button>
        </div>

        {shows.length === 0 ? (
          <p className="text-sm text-gray-500">No additional shows added.</p>) : (
          <div className="space-y-3">
            {shows
              .slice()
              .sort((a, b) => (b.rating - a.rating) || (a.order - b.order))
              .map((s) => (
                <div key={s.id} className="p-3 rounded-lg border bg-white">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                    <div className="md:col-span-2 space-y-2">
                      <Label className="text-xs" htmlFor={showFieldId(s.id, 'show_name')}>Show name (optional)</Label>
                      <Input
                        id={showFieldId(s.id, 'show_name')}
                        value={s.show_name || ''}
                        onChange={(e) => setField(s.id, 'show_name', e.target.value)}
                        placeholder="e.g., Night 2, Tour Opener"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs flex items-center gap-1" htmlFor={showFieldId(s.id, 'show_date')}><Calendar className="w-3 h-3" /> Date</Label>
                          <Input
                            id={showFieldId(s.id, 'show_date')}
                            type="date"
                            value={s.show_date || ''}
                            onChange={(e) => setField(s.id, 'show_date', e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs flex items-center gap-1" htmlFor={showFieldId(s.id, 'venue_name')}><MapPin className="w-3 h-3" /> Venue (optional)</Label>
                          <Input
                            id={showFieldId(s.id, 'venue_name')}
                            value={s.venue_name || ''}
                            onChange={(e) => setField(s.id, 'venue_name', e.target.value)}
                            placeholder="Venue name"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-2">
                      <Label className="text-xs">Artist rating</Label>
                      <div className="flex items-center gap-1 mt-1">
                        {Array.from({ length: 5 }, (_, i) => {
                          const starVal = i + 1;
                          const active = s.rating >= starVal;
                          return (
                            <button key={i} type="button" onClick={() => setRating(s.id, starVal)} className="p-0.5 rounded focus:outline-none focus:ring-2 focus:ring-blue-500">
                              <Star className={cn('w-6 h-6', active ? 'text-yellow-400 fill-current' : 'text-gray-300')} />
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="md:col-span-1 flex items-center justify-end gap-2">
                      <Button type="button" variant="ghost" onClick={() => removeShow(s.id)} className="h-8 w-8 p-0 text-red-600 hover:text-red-700">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {groupedByRating.get(s.rating)?.length! > 1 && (
                    <div className="mt-3 flex items-center justify-between bg-gray-50 border rounded p-2">
                      <p className="text-xs text-gray-600">Tied at {s.rating}★. Order within tie:</p>
                      <div className="flex items-center gap-2">
                        <Button type="button" variant="outline" onClick={() => moveWithinTie(s.rating, s.id, 'up')} style={{
                          width: 'var(--size-input-height, 44px)',
                          height: 'var(--size-input-height, 44px)',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderColor: 'var(--neutral-200)',
                          color: 'var(--neutral-900)'
                        }}>
                          <ArrowUp size={24} />
                        </Button>
                        <span className="text-xs text-gray-700">#{s.order}</span>
                        <Button type="button" variant="outline" onClick={() => moveWithinTie(s.rating, s.id, 'down')} style={{
                          width: 'var(--size-input-height, 44px)',
                          height: 'var(--size-input-height, 44px)',
                          padding: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderColor: 'var(--neutral-200)',
                          color: 'var(--neutral-900)'
                        }}>
                          <ArrowDown size={24} />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}

        {hasTies && (
          <div className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">You have ties at the same rating. You must order tied shows using the arrows before submitting.</div>
        )}
      </CardContent>
    </Card>
  );
}


