import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PassportService } from '@/services/passportService';
import { Music, MapPin, Zap, Clock } from 'lucide-react';

interface TasteMapData {
  user_id: string;
  core_genres: Record<string, number>;
  venue_affinity: Record<string, number>;
  energy_preference: Record<string, number>;
  era_bias: Record<string, number>;
  calculated_at: string;
}

interface PassportTasteMapViewProps {
  userId: string;
}

export const PassportTasteMapView: React.FC<PassportTasteMapViewProps> = ({ userId }) => {
  const [tasteMap, setTasteMap] = useState<TasteMapData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasteMap();
  }, [userId]);

  const loadTasteMap = async () => {
    setLoading(true);
    try {
      const data = await PassportService.getTasteMap(userId);
      setTasteMap(data as TasteMapData | null);
    } catch (error) {
      console.error('Error loading taste map:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(0)}%`;
  };

  const getTopItems = (items: Record<string, number>, limit: number = 5) => {
    return Object.entries(items || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!tasteMap) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Taste map being calculated...</p>
        <p className="text-xs mt-1">Your preferences will appear here as you attend more events.</p>
      </div>
    );
  }

  const topGenres = getTopItems(tasteMap.core_genres, 5);
  const venueTypes = Object.entries(tasteMap.venue_affinity || {});
  const energyTypes = Object.entries(tasteMap.energy_preference || {});
  const eraTypes = Object.entries(tasteMap.era_bias || {});

  return (
    <div className="space-y-4">
      {/* Core Genres */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Music className="w-5 h-5 text-synth-pink" />
            Core Genres
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topGenres.length > 0 ? (
            <div className="space-y-3">
              {topGenres.map(([genre, weight]) => (
                <div key={genre} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize font-medium">{genre.replace('_', ' ')}</span>
                    <span className="text-muted-foreground">{formatPercentage(weight)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-synth-pink h-2 rounded-full transition-all"
                      style={{ width: formatPercentage(weight) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No genre preferences yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Venue Affinity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin className="w-5 h-5 text-synth-pink" />
            Venue Affinity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {venueTypes.length > 0 ? (
            <div className="space-y-3">
              {venueTypes.map(([type, weight]) => (
                <div key={type} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize font-medium">{type.replace('_', ' ')}</span>
                    <span className="text-muted-foreground">{formatPercentage(weight)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-synth-pink h-2 rounded-full transition-all"
                      style={{ width: formatPercentage(weight) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No venue preferences yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Energy Preference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Zap className="w-5 h-5 text-synth-pink" />
            Energy Preference
          </CardTitle>
        </CardHeader>
        <CardContent>
          {energyTypes.length > 0 ? (
            <div className="space-y-3">
              {energyTypes.map(([energy, weight]) => (
                <div key={energy} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize font-medium">{energy}</span>
                    <span className="text-muted-foreground">{formatPercentage(weight)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-synth-pink h-2 rounded-full transition-all"
                      style={{ width: formatPercentage(weight) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No energy preferences yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Era Bias */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Clock className="w-5 h-5 text-synth-pink" />
            Era Bias
          </CardTitle>
        </CardHeader>
        <CardContent>
          {eraTypes.length > 0 ? (
            <div className="space-y-3">
              {eraTypes.map(([era, weight]) => (
                <div key={era} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="capitalize font-medium">{era.replace('_', ' ')}</span>
                    <span className="text-muted-foreground">{formatPercentage(weight)}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-synth-pink h-2 rounded-full transition-all"
                      style={{ width: formatPercentage(weight) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No era preferences yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

