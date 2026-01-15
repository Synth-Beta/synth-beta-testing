/**
 * Friends Interested Badge
 * Shows how many friends are interested in an event
 * Leverages existing friends and user_jambase_events tables
 */

import React, { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface FriendsInterestedBadgeProps {
  eventId: string;
  onClick?: () => void;
}

export function FriendsInterestedBadge({ eventId, onClick }: FriendsInterestedBadgeProps) {
  const [friendCount, setFriendCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFriendsInterested();
  }, [eventId]);

  const loadFriendsInterested = async () => {
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

      // Extract friend IDs
      const friendIds = friendsData.map((f) =>
        f.user_id === user.id ? f.related_user_id : f.user_id
      );

      // Get how many friends are interested in this event
      const { data: interestedFriends, error } = await supabase
        .from('user_event_relationships')
        .select('user_id')
        .eq('event_id', eventId)
        .eq('relationship_type', 'interested')
        .in('user_id', friendIds);

      if (error) throw error;

      setFriendCount(interestedFriends?.length || 0);
    } catch (error) {
      console.error('Error loading friends interested:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || friendCount === 0) {
    return null;
  }

  return (
    <Badge
      variant="secondary"
      className="bg-blue-100 text-blue-800 hover:bg-blue-200 cursor-pointer"
      onClick={onClick}
    >
      <Users className="h-3 w-3 mr-1" />
      {friendCount} friend{friendCount !== 1 ? 's' : ''} interested
    </Badge>
  );
}

export default FriendsInterestedBadge;

