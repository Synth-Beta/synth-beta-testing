/**
 * My Matches Panel
 * Displays all concert buddy matches with chat integration
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Heart, MessageCircle, Calendar, MapPin, Loader2, Users } from 'lucide-react';
import MatchingService, { Match } from '@/services/matchingService';
import { replaceJambasePlaceholder } from '@/utils/eventImageFallbacks';

interface MyMatchesPanelProps {
  onChatWithMatch?: (userId: string) => void;
}

export function MyMatchesPanel({ onChatWithMatch }: MyMatchesPanelProps) {
  const { toast } = useToast();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMatches();
  }, []);

  const loadMatches = async () => {
    setLoading(true);
    try {
      const matchesData = await MatchingService.getAllMatches();
      setMatches(matchesData);
    } catch (error) {
      console.error('Error loading matches:', error);
      toast({
        title: 'Error',
        description: 'Failed to load your matches',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatMatchDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const MatchCard = ({ match }: { match: Match }) => (
    <Card key={match.id} className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Matched User Avatar */}
          {match.matched_user?.avatar_url ? (
            <img
              src={match.matched_user.avatar_url}
              alt={match.matched_user.name}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center">
              <span className="text-purple-600 font-bold text-xl">
                {match.matched_user?.name?.charAt(0).toUpperCase()}
              </span>
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* User Info */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{match.matched_user?.name}</h3>
                {match.matched_user?.bio && (
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {match.matched_user.bio}
                  </p>
                )}
              </div>
              <Badge variant="default" className="bg-pink-500 flex-shrink-0">
                <Heart className="h-3 w-3 mr-1 fill-current" />
                Match
              </Badge>
            </div>

            {/* Event Info */}
            {match.event && (
              <div className="bg-purple-50 rounded-lg p-3 mb-3">
                <div className="flex items-start gap-2">
                  {match.event.poster_image_url && (
                    <img
                      src={replaceJambasePlaceholder(match.event.poster_image_url) || undefined}
                      alt={match.event.title}
                      className="w-12 h-12 rounded object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{match.event.title}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(match.event.event_date)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{match.event.venue_name}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => onChatWithMatch?.(match.matched_user.user_id)}
                className="flex-1"
              >
                <MessageCircle className="h-4 w-4 mr-1" />
                Chat
              </Button>
            </div>

            {/* Match Date */}
            <p className="text-xs text-gray-500 mt-2">
              Matched on {formatMatchDate(match.created_at)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">My Concert Buddy Matches</h2>
        <p className="text-gray-600">People you matched with for events</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
        </div>
      ) : matches.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Matches Yet</h3>
            <p className="text-gray-600 text-sm mb-4">
              Start swiping on events to find concert buddies!
            </p>
            <p className="text-xs text-gray-500">
              When you and someone else both swipe right, you'll match
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} />
          ))}
        </div>
      )}
    </div>
  );
}

export default MyMatchesPanel;

