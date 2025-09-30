import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { userStatsService, type HolisticUserStats } from '@/services/userStatsService';

interface HolisticStatsCardProps {
  userId: string;
}

export function HolisticStatsCard({ userId }: HolisticStatsCardProps) {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<HolisticUserStats | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const s = await userStatsService.getHolisticStats(userId);
        setStats(s);
      } catch {
        setStats(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  return (
    <Card>
      <CardContent className="grid grid-cols-3 gap-4 p-3">
        {loading ? (
          <div className="col-span-3 text-sm text-muted-foreground">Loading your stats…</div>
        ) : !stats ? (
          <div className="col-span-3 text-sm text-muted-foreground">No stats available.</div>
        ) : (
          <>
            <div className="text-center">
              <div className="text-lg font-semibold">{stats.reviewsCount}</div>
              <div className="text-xs text-muted-foreground">Reviews</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold">{stats.interestedEventsCount}</div>
              <div className="text-xs text-muted-foreground">Interested</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold">{stats.upcomingInterestedCount}</div>
              <div className="text-xs text-muted-foreground">Upcoming</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold">{stats.artistsInteractedCount}</div>
              <div className="text-xs text-muted-foreground">Artists</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold">{stats.venuesInteractedCount}</div>
              <div className="text-xs text-muted-foreground">Venues</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-semibold">{stats.ticketsClickedCount}</div>
              <div className="text-xs text-muted-foreground">Tickets Clicked</div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}


