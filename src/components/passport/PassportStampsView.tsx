import React, { useState } from 'react';
import { PassportBadge } from '@/components/discover/PassportBadge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Award } from 'lucide-react';
import type { PassportEntry } from '@/services/passportService';

interface AchievementDisplay {
  id?: string;
  type: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  tier?: 'bronze' | 'silver' | 'gold';
  progress: number;
  goal: number;
  unlocked: boolean;
  unlocked_at?: string;
  metadata?: Record<string, any>;
}

interface PassportStampsViewProps {
  stamps: PassportEntry[];
  achievements?: AchievementDisplay[];
  loading?: boolean;
}

export const PassportStampsView: React.FC<PassportStampsViewProps> = ({ stamps, achievements = [], loading = false }) => {
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedRarity, setSelectedRarity] = useState<string>('all');

  // Group stamps by type
  const stampsByType = stamps.reduce((acc, stamp) => {
    if (!acc[stamp.type]) acc[stamp.type] = [];
    acc[stamp.type].push(stamp);
    return acc;
  }, {} as Record<string, PassportEntry[]>);

  // Get completed achievements (unlocked)
  const completedAchievements = achievements.filter(a => a.unlocked);

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
    completed_achievements: completedAchievements.length,
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
          <SelectTrigger className="w-[180px] bg-white">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent className="bg-white">
            <SelectItem value="all">All Types ({typeCounts.all})</SelectItem>
            <SelectItem value="city">Cities ({typeCounts.city})</SelectItem>
            <SelectItem value="venue">Venues ({typeCounts.venue})</SelectItem>
            <SelectItem value="artist">Artists ({typeCounts.artist})</SelectItem>
            <SelectItem value="scene">Scenes ({typeCounts.scene})</SelectItem>
            <SelectItem value="completed_achievements">Completed Achievements ({typeCounts.completed_achievements})</SelectItem>
          </SelectContent>
        </Select>

        {selectedType !== 'completed_achievements' && (
        <Select value={selectedRarity} onValueChange={setSelectedRarity}>
            <SelectTrigger className="w-[180px] bg-white">
            <SelectValue placeholder="Filter by rarity" />
          </SelectTrigger>
            <SelectContent className="bg-white">
            <SelectItem value="all">All Rarities ({rarityCounts.all})</SelectItem>
            <SelectItem value="common">Common ({rarityCounts.common})</SelectItem>
            <SelectItem value="uncommon">Uncommon ({rarityCounts.uncommon})</SelectItem>
            <SelectItem value="legendary">Legendary ({rarityCounts.legendary})</SelectItem>
          </SelectContent>
        </Select>
        )}
      </div>

      {/* Stamps Grid or Achievements */}
      {selectedType === 'completed_achievements' ? (
        completedAchievements.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No completed achievements yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {completedAchievements.map((achievement) => {
              const tierColors = {
                gold: 'border-yellow-200 bg-yellow-50',
                silver: 'border-gray-200 bg-gray-50',
                bronze: 'border-orange-200 bg-orange-50',
              };
              
              return (
                <Card 
                  key={achievement.id || achievement.type} 
                  className={`border-2 ${tierColors[achievement.tier || 'bronze']}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="text-3xl">{achievement.icon}</div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <h4 className="font-semibold">{achievement.name.replace(/\s+\([^)]+\)$/, '')}</h4>
                          <Award className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{achievement.description}</p>
                        {achievement.unlocked_at && (
                          <p className="text-xs text-muted-foreground">
                            Unlocked {new Date(achievement.unlocked_at).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : filteredStamps.length === 0 ? (
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

