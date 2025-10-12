/**
 * Concert Buddy Swiper
 * Tinder-style swipe interface for finding concert buddies
 * Uses existing matches and user_swipes tables
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Heart, X, Music, MapPin, Calendar, Sparkles, Loader2, MessageCircle } from 'lucide-react';
import MatchingService, { PotentialMatch } from '@/services/matchingService';

interface ConcertBuddySwiperProps {
  eventId: string;
  eventTitle: string;
  onMatchCreated?: (matchedUser: any) => void;
}

export function ConcertBuddySwiper({
  eventId,
  eventTitle,
  onMatchCreated,
}: ConcertBuddySwiperProps) {
  const { toast } = useToast();
  const [potentialMatches, setPotentialMatches] = useState<PotentialMatch[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [swiping, setSwiping] = useState(false);
  const [swipeDirection, setSwipeDirection] = useState<'left' | 'right' | null>(null);

  useEffect(() => {
    loadPotentialMatches();
  }, [eventId]);

  const loadPotentialMatches = async () => {
    setLoading(true);
    try {
      const matches = await MatchingService.getPotentialMatches(eventId);
      setPotentialMatches(matches);
      setCurrentIndex(0);
    } catch (error) {
      console.error('Error loading potential matches:', error);
      toast({
        title: 'Error',
        description: 'Failed to load potential concert buddies',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSwipe = async (isInterested: boolean) => {
    const currentUser = potentialMatches[currentIndex];
    if (!currentUser || swiping) return;

    setSwiping(true);
    setSwipeDirection(isInterested ? 'right' : 'left');

    try {
      await MatchingService.recordSwipe({
        event_id: eventId,
        swiped_user_id: currentUser.user_id,
        is_interested: isInterested,
      });

      if (isInterested) {
        toast({
          title: '💖 Sent!',
          description: `If ${currentUser.name} swipes right too, you'll match!`,
        });
      }

      // Wait for animation
      setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
        setSwipeDirection(null);
        setSwiping(false);
      }, 300);
    } catch (error) {
      console.error('Error swiping:', error);
      toast({
        title: 'Error',
        description: 'Failed to record swipe',
        variant: 'destructive',
      });
      setSwipeDirection(null);
      setSwiping(false);
    }
  };

  const getCompatibilityColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-100';
    if (score >= 60) return 'text-blue-600 bg-blue-100';
    if (score >= 40) return 'text-yellow-600 bg-yellow-100';
    return 'text-gray-600 bg-gray-100';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (potentialMatches.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Heart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No More Potential Matches</h3>
          <p className="text-gray-600 text-sm">
            You've seen everyone interested in this event. Check back later!
          </p>
        </CardContent>
      </Card>
    );
  }

  if (currentIndex >= potentialMatches.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Sparkles className="h-16 w-16 text-purple-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">All Done!</h3>
          <p className="text-gray-600 text-sm mb-4">
            You've reviewed all potential concert buddies for this event
          </p>
          <Button onClick={loadPotentialMatches} variant="outline">
            Check for New People
          </Button>
        </CardContent>
      </Card>
    );
  }

  const currentUser = potentialMatches[currentIndex];

  return (
    <div className="max-w-md mx-auto">
      {/* Progress Indicator */}
      <div className="mb-4 flex items-center justify-between text-sm text-gray-600">
        <span>
          {currentIndex + 1} of {potentialMatches.length}
        </span>
        <span className="text-purple-600 font-medium">
          Find Concert Buddies for {eventTitle}
        </span>
      </div>

      {/* User Card */}
      <div className="relative">
        <Card
          className={`transition-all duration-300 ${
            swipeDirection === 'left'
              ? 'translate-x-[-100%] opacity-0'
              : swipeDirection === 'right'
              ? 'translate-x-[100%] opacity-0'
              : ''
          }`}
        >
          <CardContent className="p-0">
            {/* Avatar Section */}
            <div className="relative h-96 bg-gradient-to-br from-purple-100 to-pink-100 rounded-t-lg">
              {currentUser.avatar_url ? (
                <img
                  src={currentUser.avatar_url}
                  alt={currentUser.name}
                  className="w-full h-full object-cover rounded-t-lg"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-8xl font-bold text-purple-300">
                    {currentUser.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              {/* Compatibility Badge */}
              {currentUser.compatibility_score !== undefined && (
                <div className="absolute top-4 right-4">
                  <Badge
                    className={`text-sm font-bold ${getCompatibilityColor(
                      currentUser.compatibility_score
                    )}`}
                  >
                    {currentUser.compatibility_score}% Match
                  </Badge>
                </div>
              )}
            </div>

            {/* User Info */}
            <div className="p-6 space-y-4">
              <div>
                <h2 className="text-2xl font-bold mb-1">{currentUser.name}</h2>
                {currentUser.bio && (
                  <p className="text-gray-700 text-sm">{currentUser.bio}</p>
                )}
              </div>

              {/* Music Info */}
              {currentUser.music_streaming_profile && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Music className="h-4 w-4" />
                  <span>Has Spotify connected</span>
                </div>
              )}

              {/* Shared Interests */}
              {currentUser.shared_artists && currentUser.shared_artists.length > 0 && (
                <div className="bg-purple-50 rounded-lg p-3">
                  <p className="text-sm font-medium text-purple-900 mb-2">
                    Shared Artists
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {currentUser.shared_artists.slice(0, 5).map((artist, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {artist}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {currentUser.compatibility_score !== undefined && (
                <div className="text-center pt-2">
                  <p className="text-xs text-gray-500">
                    Based on music taste and preferences
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Swipe Buttons */}
        <div className="flex items-center justify-center gap-8 mt-6">
          <Button
            size="lg"
            variant="outline"
            onClick={() => handleSwipe(false)}
            disabled={swiping}
            className="w-20 h-20 rounded-full border-2 border-red-300 hover:bg-red-50 hover:border-red-400"
          >
            <X className="h-10 w-10 text-red-500" />
          </Button>

          <Button
            size="lg"
            variant="default"
            onClick={() => handleSwipe(true)}
            disabled={swiping}
            className="w-24 h-24 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 shadow-lg"
          >
            <Heart className="h-12 w-12 fill-current" />
          </Button>
        </div>

        {/* Instructions */}
        <div className="mt-6 text-center text-sm text-gray-600">
          <p>Swipe right if you'd like to meet up at this event</p>
          <p className="text-xs mt-1">
            If they swipe right too, you'll match and can chat!
          </p>
        </div>
      </div>
    </div>
  );
}

export default ConcertBuddySwiper;

