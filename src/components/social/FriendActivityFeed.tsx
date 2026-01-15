/**
 * Friend Activity Feed
 * Shows what friends are interested in and attending
 * Leverages existing friends and user_jambase_events data
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Heart, Calendar, MapPin, Loader2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface FriendActivity {
  id: string;
  friend_id: string;
  friend_name: string;
  friend_avatar_url?: string;
  event_id: string;
  event_title: string;
  event_artist_name: string;
  event_venue_name: string;
  event_date: string;
  event_poster_image_url?: string;
  activity_type: 'interested' | 'attended' | 'reviewed';
  activity_date: string;
}

export function FriendActivityFeed({ limit = 10 }: { limit?: number }) {
  const [activities, setActivities] = useState<FriendActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFriendActivity();
  }, []);

  const loadFriendActivity = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Get user's friends
      const { data: friendsData } = await supabase
        .from('user_relationships')
        .select('user_id, related_user_id')
        .eq('relationship_type', 'friend')
        .eq('status', 'accepted')
        .or(`user_id.eq.${user.id},related_user_id.eq.${user.id}`);

      if (!friendsData || friendsData.length === 0) {
        setLoading(false);
        return;
      }

      const friendIds = friendsData.map((f) =>
        f.user_id === user.id ? f.related_user_id : f.user_id
      );

      // Get friend event interests
      const { data: interestsData } = await supabase
        .from('user_event_relationships')
        .select(`
          user_id,
          event_id,
          created_at,
          events:events!user_event_relationships_event_id_fkey (
            id,
            title,
            artist_name,
            venue_name,
            event_date,
            poster_image_url
          ),
          users:users!user_event_relationships_user_id_fkey (
            user_id,
            name,
            avatar_url
          )
        `)
        .in('user_id', friendIds)
        .eq('relationship_type', 'interested')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!interestsData) {
        setLoading(false);
        return;
      }

      const formattedActivities: FriendActivity[] = interestsData.map((item: any) => ({
        id: `${item.user_id}-${item.event_id}`,
        friend_id: item.user_id,
        friend_name: item.users?.name || 'Friend',
        friend_avatar_url: item.users?.avatar_url,
        event_id: item.event_id,
        event_title: item.events?.title || '',
        event_artist_name: item.events?.artist_name || '',
        event_venue_name: item.events?.venue_name || '',
        event_date: item.events?.event_date || '',
        event_poster_image_url: item.events?.poster_image_url,
        activity_type: 'interested',
        activity_date: item.created_at,
      }));

      setActivities(formattedActivities);
    } catch (error) {
      console.error('Error loading friend activity:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatActivityDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 48) return 'Yesterday';
    if (diffHours < 168) return `${Math.floor(diffHours / 24)}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatEventDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600 text-sm">No friend activity yet</p>
          <p className="text-xs text-gray-500 mt-1">
            When your friends mark events as interested, they'll appear here
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <Card key={activity.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <div className="flex gap-3">
              {/* Friend Avatar */}
              <Avatar className="w-10 h-10 flex-shrink-0">
                <AvatarImage src={activity.friend_avatar_url} alt={activity.friend_name} />
                <AvatarFallback className="bg-purple-100 text-purple-600">
                  {activity.friend_name.charAt(0)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                {/* Activity Text */}
                <p className="text-sm mb-2">
                  <span className="font-semibold">{activity.friend_name}</span>
                  {' is '}
                  <span className="text-purple-600 font-medium">interested</span>
                  {' in '}
                  <span className="font-medium">{activity.event_artist_name}</span>
                </p>

                {/* Event Card */}
                <div className="bg-gray-50 rounded-lg p-3 flex gap-3">
                  {activity.event_poster_image_url && (
                    <img
                      src={activity.event_poster_image_url}
                      alt={activity.event_title}
                      className="w-12 h-12 rounded object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{activity.event_title}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                      <Calendar className="h-3 w-3" />
                      <span>{formatEventDate(activity.event_date)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <MapPin className="h-3 w-3" />
                      <span className="truncate">{activity.event_venue_name}</span>
                    </div>
                  </div>
                </div>

                {/* Timestamp */}
                <p className="text-xs text-gray-500 mt-2">
                  {formatActivityDate(activity.activity_date)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default FriendActivityFeed;

