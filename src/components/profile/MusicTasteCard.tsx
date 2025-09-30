import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Music } from 'lucide-react';
import { musicTasteService, type MusicTasteSummary } from '@/services/musicTasteService';

interface MusicTasteCardProps {
  userId: string;
}

export function MusicTasteCard({ userId }: MusicTasteCardProps) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<MusicTasteSummary | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const s = await musicTasteService.getUserMusicTaste(userId);
        setSummary(s);
      } catch {
        setSummary(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Music className="w-4 h-4" />
          Music Taste
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading music preferences…</div>
        ) : !summary ? (
          <div className="text-sm text-muted-foreground">No listening data available.</div>
        ) : (
          <>
            {summary.description && (
              <p className="text-sm">{summary.description}</p>
            )}

            {summary.topArtists && summary.topArtists.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Top Artists</div>
                <div className="flex flex-wrap gap-1">
                  {summary.topArtists.slice(0, 5).map((a, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">{a.name}</Badge>
                  ))}
                </div>
              </div>
            )}

            {summary.topGenres && summary.topGenres.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Top Genres</div>
                <div className="flex flex-wrap gap-1">
                  {summary.topGenres.slice(0, 6).map((g, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">{g.genre}</Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}


