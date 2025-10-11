/**
 * User Analytics Dashboard
 * 
 * Personal concert stats for regular users
 */

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Calendar, 
  Star, 
  Heart, 
  Music, 
  MapPin, 
  Users,
  Download,
  TrendingUp,
  Award,
  Trophy
} from 'lucide-react';
import { UserAnalyticsService, UserStats, TopArtist, TopVenue, ReviewStats, Achievement } from '@/services/userAnalyticsService';
import { MetricCard } from '@/components/analytics/shared/MetricCard';
import { TopListCard } from '@/components/analytics/shared/TopListCard';
import { AchievementCard } from '@/components/analytics/shared/AchievementCard';
import { useToast } from '@/hooks/use-toast';
import { SkeletonCard } from '@/components/SkeletonCard';

export function UserAnalyticsDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [topArtists, setTopArtists] = useState<TopArtist[]>([]);
  const [topVenues, setTopVenues] = useState<TopVenue[]>([]);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [hasPremium, setHasPremium] = useState(false);

  useEffect(() => {
    if (user?.id) {
      loadAnalytics();
    }
  }, [user?.id]);

  const loadAnalytics = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      const [statsData, artistsData, venuesData, reviewsData, achievementsData, premiumStatus] = await Promise.all([
        UserAnalyticsService.getUserStats(user.id, 30),
        UserAnalyticsService.getTopArtists(user.id, 5),
        UserAnalyticsService.getTopVenues(user.id, 5),
        UserAnalyticsService.getReviewStats(user.id),
        UserAnalyticsService.getUserAchievements(user.id),
        UserAnalyticsService.hasPremium(user.id)
      ]);

      setStats(statsData);
      setTopArtists(artistsData);
      setTopVenues(venuesData);
      setReviewStats(reviewsData);
      setAchievements(achievementsData);
      setHasPremium(premiumStatus);
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast({
        title: 'Error',
        description: 'Failed to load analytics data',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!hasPremium) {
      toast({
        title: 'Premium Feature',
        description: 'Upgrade to Premium to export your data',
        variant: 'destructive'
      });
      return;
    }

    try {
      const csv = await UserAnalyticsService.exportUserData(user!.id);
      
      // Download CSV
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `synth-analytics-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Export Complete',
        description: 'Your analytics data has been downloaded'
      });
    } catch (error) {
      console.error('Error exporting data:', error);
      toast({
        title: 'Export Failed',
        description: 'Failed to export analytics data',
        variant: 'destructive'
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen synth-gradient-card p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      </div>
    );
  }

  const unlockedAchievements = achievements.filter(a => a.unlocked);
  const lockedAchievements = achievements.filter(a => !a.unlocked);

  return (
    <div className="min-h-screen synth-gradient-card">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="glass-card inner-glow text-center p-6 floating-shadow">
          <div className="flex items-center justify-center gap-3 mb-2">
            <TrendingUp className="w-8 h-8 text-synth-pink" />
            <h1 className="gradient-text text-3xl font-bold">My Concert Stats</h1>
          </div>
          <p className="text-gray-600">Your personal concert journey at a glance</p>
          
          <div className="mt-4 flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              className="border-synth-pink text-synth-pink hover:bg-synth-pink hover:text-white"
            >
              <Download className="w-4 h-4 mr-2" />
              Export Data
              {!hasPremium && <Badge className="ml-2 bg-yellow-500 text-white text-xs">Premium</Badge>}
            </Button>
            
            {!hasPremium && (
              <Button
                variant="default"
                size="sm"
                className="bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600"
              >
                ⭐ Upgrade to Premium
              </Button>
            )}
          </div>
        </div>

        {/* Premium Upgrade Banner (for free users) */}
        {!hasPremium && (
          <Card className="border-2 border-yellow-400 bg-gradient-to-r from-yellow-50 to-amber-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-yellow-500 to-amber-600 rounded-full flex items-center justify-center">
                    <Award className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-gray-900">Upgrade to Premium</h3>
                    <p className="text-sm text-gray-600">Unlock all-time stats, export data, and go ad-free</p>
                  </div>
                </div>
                <Button className="bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-600 hover:to-amber-600">
                  $4.99/month
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Engagement Metrics */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-synth-pink" />
            Your Activity (Last 30 Days)
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricCard
              title="Events Viewed"
              value={stats?.events_viewed || 0}
              icon={<Calendar className="w-5 h-5" />}
              subtitle="Last 30 days"
            />
            <MetricCard
              title="Reviews Written"
              value={stats?.reviews_written || 0}
              icon={<Star className="w-5 h-5" />}
              subtitle="Last 30 days"
            />
            <MetricCard
              title="Events Liked"
              value={stats?.reviews_liked || 0}
              icon={<Heart className="w-5 h-5" />}
              subtitle="Last 30 days"
            />
            <MetricCard
              title="Interested In"
              value={stats?.events_interested || 0}
              icon={<Calendar className="w-5 h-5" />}
              subtitle="Upcoming events"
            />
            <MetricCard
              title="Events Attended"
              value={stats?.events_attended || 0}
              icon={<Calendar className="w-5 h-5" />}
              subtitle="All time"
            />
            <MetricCard
              title="Friends"
              value={stats?.friends_count || 0}
              icon={<Users className="w-5 h-5" />}
              subtitle="Your network"
            />
          </div>
        </div>

        {/* Music Taste */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Music className="w-5 h-5 text-synth-pink" />
            Your Music Taste
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TopListCard
              title="Top Artists"
              items={topArtists.map(a => ({
                name: a.artist_name,
                count: a.interaction_count,
                subtitle: `${a.reviews_written || 0} reviews`
              }))}
              icon={<Music className="w-4 h-4" />}
              emptyMessage="Start viewing events to discover your favorite artists!"
            />
            
            <TopListCard
              title="Top Venues"
              items={topVenues.map(v => ({
                name: v.venue_name,
                count: v.interaction_count,
                subtitle: v.venue_city && v.venue_state ? `${v.venue_city}, ${v.venue_state}` : undefined
              }))}
              icon={<MapPin className="w-4 h-4" />}
              emptyMessage="Attend events to discover your favorite venues!"
            />
          </div>
        </div>

        {/* Review Performance */}
        {reviewStats && reviewStats.review_count > 0 && (
          <Card className="glass-card inner-glow">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-synth-pink" />
                <CardTitle className="text-lg font-semibold">Your Reviews</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-4 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-lg">
                  <div className="text-3xl font-bold text-gray-900">{reviewStats.review_count}</div>
                  <div className="text-sm text-gray-600">Reviews</div>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg">
                  <div className="text-3xl font-bold text-gray-900">{reviewStats.avg_rating.toFixed(1)}</div>
                  <div className="text-sm text-gray-600">Avg Rating</div>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-pink-50 to-rose-50 rounded-lg">
                  <div className="text-3xl font-bold text-gray-900">{reviewStats.total_likes}</div>
                  <div className="text-sm text-gray-600">Total Likes</div>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-violet-50 rounded-lg">
                  <div className="text-3xl font-bold text-gray-900">{reviewStats.total_comments}</div>
                  <div className="text-sm text-gray-600">Comments</div>
                </div>
              </div>
              
              {reviewStats.most_liked_review && (
                <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-1">
                    <Trophy className="w-4 h-4 text-yellow-600" />
                    <span className="text-sm font-semibold text-yellow-900">Most Helpful Review</span>
                  </div>
                  <p className="text-sm text-gray-700">{reviewStats.most_liked_review.event_name}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {reviewStats.most_liked_review.likes_count} likes
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Achievements */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-synth-pink" />
            Achievements
          </h2>
          
          {/* Unlocked Achievements */}
          {unlockedAchievements.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Unlocked ({unlockedAchievements.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {unlockedAchievements.map(achievement => (
                  <AchievementCard
                    key={achievement.id}
                    name={achievement.name}
                    description={achievement.description}
                    icon={achievement.icon}
                    progress={achievement.progress}
                    goal={achievement.goal}
                    unlocked={achievement.unlocked}
                    unlockedAt={achievement.unlockedAt}
                    compact
                  />
                ))}
              </div>
            </div>
          )}

          {/* In Progress Achievements */}
          {lockedAchievements.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                In Progress ({lockedAchievements.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lockedAchievements.map(achievement => (
                  <AchievementCard
                    key={achievement.id}
                    name={achievement.name}
                    description={achievement.description}
                    icon={achievement.icon}
                    progress={achievement.progress}
                    goal={achievement.goal}
                    unlocked={achievement.unlocked}
                    compact
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

