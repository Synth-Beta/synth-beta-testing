import React, { useState } from 'react';
import { PassportBadge } from '@/components/discover/PassportBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { PassportEntry } from '@/services/passportService';

interface PassportStampsViewProps {
  stamps: PassportEntry[];
  loading?: boolean;
}

export const PassportStampsView: React.FC<PassportStampsViewProps> = ({ stamps, loading = false }) => {
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');

  // Group stamps by type
  const stampsByType = stamps.reduce((acc, stamp) => {
    if (!acc[stamp.type]) acc[stamp.type] = [];
    acc[stamp.type].push(stamp);
    return acc;
  }, {} as Record<string, PassportEntry[]>);

  // Filter stamps
  const filteredStamps = stamps.filter(stamp => {
    if (selectedType !== 'all' && stamp.type !== selectedType) return false;
    if (selectedRarity !== 'all' && stamp.rarity !== selectedRarity) return false;
    return true;
  });

  const typeCounts = {
    all: stamps.length,
    city: stampsByType.city?.length || 0,
    venue: stampsByType.venue?.length || 0,
    artist: stampsByType.artist?.length || 0,
    scene: stampsByType.scene?.length || 0,
    era: stampsByType.era?.length || 0,
    festival: stampsByType.festival?.length || 0,
    artist_milestone: stampsByType.artist_milestone?.length || 0,
  };

  const rarityCounts = {
    all: stamps.length,
    common: stamps.filter(s => s.rarity === 'common').length,
    uncommon: stamps.filter(s => s.rarity === 'uncommon').length,
    legendary: stamps.filter(s => s.rarity === 'legendary').length,
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading stamps...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4">
        <Select value={selectedType} onValueChange={setSelectedType}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types ({typeCounts.all})</SelectItem>
            <SelectItem value="city">Cities ({typeCounts.city})</SelectItem>
            <SelectItem value="venue">Venues ({typeCounts.venue})</SelectItem>
            <SelectItem value="artist">Artists ({typeCounts.artist})</SelectItem>
            <SelectItem value="scene">Scenes ({typeCounts.scene})</SelectItem>
            <SelectItem value="era">Eras ({typeCounts.era})</SelectItem>
            <SelectItem value="festival">Festivals ({typeCounts.festival})</SelectItem>
            <SelectItem value="artist_milestone">Milestones ({typeCounts.artist_milestone})</SelectItem>
          </SelectContent>
        </Select>

        <Select value={selectedRarity} onValueChange={setSelectedRarity}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by rarity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Rarities ({rarityCounts.all})</SelectItem>
            <SelectItem value="common">Common ({rarityCounts.common})</SelectItem>
            <SelectItem value="uncommon">Uncommon ({rarityCounts.uncommon})</SelectItem>
            <SelectItem value="legendary">Legendary ({rarityCounts.legendary})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stamps Grid */}
      {filteredStamps.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No stamps found with selected filters.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStamps.map((stamp) => (
            <PassportBadge key={stamp.id} entry={stamp} />
          ))}
        </div>
      )}
    </div>
  );
};

