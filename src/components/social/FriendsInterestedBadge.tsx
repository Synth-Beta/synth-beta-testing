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
        .from('friends')
        .select('user1_id, user2_id')
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

      if (!friendsData || friendsData.length === 0) {
        setLoading(false);
        return;
      }

      // Extract friend IDs
      const friendIds = friendsData.map((f) =>
        f.user1_id === user.id ? f.user2_id : f.user1_id
      );

      // Get how many friends are interested in this event
      const { data: interestedFriends, error } = await supabase
        .from('relationships')
        .select('user_id')
        .eq('related_entity_type', 'event')
        .eq('related_entity_id', eventId)
        .eq('relationship_type', 'interest')
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

