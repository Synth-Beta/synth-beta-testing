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

      // Get how many friends are interested in this event (preferred table)
      const { data: interestedFriends, error } = await supabase
        .from('user_event_relationships')
        .select('user_id')
        .eq('event_id', eventId)
        .eq('relationship_type', 'interested')
        .in('user_id', friendIds);

      if (!error && interestedFriends) {
        setFriendCount(interestedFriends.length);
        return;
      }

      if (error) {
        console.error('Error loading friends interested from user_event_relationships:', error);
      }

      const { data: eventData } = await supabase
        .from('events')
        .select('jambase_event_id')
        .eq('id', eventId)
        .maybeSingle();

      const jambaseEventId = eventData?.jambase_event_id || eventId;
      const { data: fallbackInterested, error: fallbackError } = await supabase
        .from('user_jambase_events')
        .select('user_id')
        .eq('jambase_event_id', jambaseEventId)
        .in('user_id', friendIds);

      if (fallbackError) {
        console.error('Error loading friends interested from user_jambase_events:', fallbackError);
        return;
      }

      setFriendCount(fallbackInterested?.length || 0);
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
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: '22px',
        paddingLeft: 'var(--spacing-small, 12px)',
        paddingRight: 'var(--spacing-small, 12px)',
        borderRadius: 'var(--radius-corner, 10px)',
        backgroundColor: 'var(--info-blue-050)',
        border: '2px solid var(--info-blue-500)',
        fontFamily: 'var(--font-family)',
        fontSize: 'var(--typography-meta-size, 16px)',
        fontWeight: 'var(--typography-meta-weight, 500)',
        lineHeight: 'var(--typography-meta-line-height, 1.5)',
        color: 'var(--info-blue-500)',
        boxShadow: '0 4px 4px 0 var(--shadow-color)',
        gap: 'var(--spacing-inline, 6px)',
        cursor: onClick ? 'pointer' : 'default'
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.backgroundColor = 'var(--info-blue-050)';
          e.currentTarget.style.opacity = '0.9';
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.backgroundColor = 'var(--info-blue-050)';
          e.currentTarget.style.opacity = '1';
        }
      }}
    >
      <Users size={16} />
      <span>{friendCount} friend{friendCount !== 1 ? 's' : ''} interested</span>
    </div>
  );
}

export default FriendsInterestedBadge;

