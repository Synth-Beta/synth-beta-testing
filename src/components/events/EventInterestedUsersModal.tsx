import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface InterestedUser {
  user_id: string;
  name: string | null;
  username: string | null;
  avatar_url: string | null;
}

interface EventInterestedUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  currentUserId?: string;
}

export function EventInterestedUsersModal({
  isOpen,
  onClose,
  eventId,
  currentUserId
}: EventInterestedUsersModalProps) {
  const [activeTab, setActiveTab] = useState<'friends' | 'all'>('friends');
  const [allUsers, setAllUsers] = useState<InterestedUser[]>([]);
  const [friendUsers, setFriendUsers] = useState<InterestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const sortedAllUsers = useMemo(() => {
    return [...allUsers].sort((a, b) => {
      const nameA = (a.name || a.username || '').toLowerCase();
      const nameB = (b.name || b.username || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [allUsers]);

  const sortedFriendUsers = useMemo(() => {
    return [...friendUsers].sort((a, b) => {
      const nameA = (a.name || a.username || '').toLowerCase();
      const nameB = (b.name || b.username || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [friendUsers]);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('friends');
      setAllUsers([]);
      setFriendUsers([]);
      setLoading(true);
      setError(null);
      return;
    }

    const loadInterestedUsers = async () => {
      try {
        setLoading(true);
        setError(null);

        let viewerId = currentUserId;
        if (!viewerId) {
          const { data: { user } } = await supabase.auth.getUser();
          viewerId = user?.id || undefined;
        }

        if (!viewerId) {
          setError('Unable to load users');
          setLoading(false);
          return;
        }

        const { data: friendsData } = await supabase
          .from('user_relationships')
          .select('user_id, related_user_id')
          .eq('relationship_type', 'friend')
          .eq('status', 'accepted')
          .or(`user_id.eq.${viewerId},related_user_id.eq.${viewerId}`);

        const friendIds = (friendsData || [])
          .map((f) => (f.user_id === viewerId ? f.related_user_id : f.user_id))
          .filter(Boolean) as string[];

        const { data: interestedRows, error: interestedError } = await supabase
          .from('user_event_relationships')
          .select('user_id')
          .eq('event_id', eventId)
          .eq('relationship_type', 'interested');

        if (interestedError) {
          throw interestedError;
        }

        const interestedIds = Array.from(
          new Set((interestedRows || []).map((row) => row.user_id).filter(Boolean))
        ) as string[];

        if (interestedIds.length === 0) {
          setAllUsers([]);
          setFriendUsers([]);
          setLoading(false);
          return;
        }

        const { data: profiles, error: profilesError } = await supabase
          .from('users')
          .select('user_id, name, username, avatar_url')
          .in('user_id', interestedIds);

        if (profilesError) {
          throw profilesError;
        }

        const sanitizedProfiles = (profiles || []).filter((profile) => profile.user_id);
        setAllUsers(sanitizedProfiles);
        setFriendUsers(sanitizedProfiles.filter((profile) => friendIds.includes(profile.user_id)));
      } catch (loadError) {
        console.error('Error loading interested users:', loadError);
        setError('Failed to load interested users');
      } finally {
        setLoading(false);
      }
    };

    loadInterestedUsers();
  }, [isOpen, eventId, currentUserId]);

  const renderUserRow = (user: InterestedUser) => {
    return (
      <div
        key={user.user_id}
        className="flex items-center gap-3"
        style={{
          padding: '12px',
          borderRadius: 'var(--radius-corner, 10px)',
          transition: 'background-color 0.2s ease'
        }}
      >
        <Avatar className="w-12 h-12 flex-shrink-0">
          {user.avatar_url ? (
            <AvatarImage src={user.avatar_url} alt={user.name || user.username || 'User'} />
          ) : null}
          <AvatarFallback className="bg-[#fdf2f7]">
            {(user.name || user.username || 'U').slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-base truncate">{user.name || user.username || 'User'}</p>
          <p className="text-sm text-muted-foreground">
            {user.username ? `@${user.username}` : 'User'}
          </p>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="w-[calc(100vw-40px)] max-w-[393px] max-h-[80vh] flex flex-col p-0"
        hideCloseButton={true}
        style={{
          borderRadius: 'var(--radius-corner, 10px)',
          overflow: 'hidden'
        }}
      >
        {/* Accessible title/description for screen readers (Radix requirement) */}
        <DialogTitle className="sr-only">
          People interested in this event
        </DialogTitle>
        <DialogDescription className="sr-only">
          A list of users who have marked themselves as interested in this event.
        </DialogDescription>

        <div
          style={{
            position: 'relative',
            paddingTop: 12,
            paddingBottom: 12,
            height: '100%',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <button
            onClick={onClose}
            type="button"
            aria-label="Close dialog"
            style={{
              position: 'absolute',
              top: 12,
              right: 20,
              width: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--neutral-900)',
              background: 'transparent',
              border: 'none',
              padding: 0
            }}
          >
            <X size={24} aria-hidden="true" />
          </button>

          <div style={{ paddingLeft: 20, paddingRight: 20, marginTop: 6 }}>
            <div
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-body-size, 18px)',
                fontWeight: 'var(--typography-body-weight, 500)',
                lineHeight: 'var(--typography-body-line-height, 1.5)',
                color: 'var(--neutral-900)'
              }}
            >
              People Interested
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(tab) => setActiveTab(tab as 'friends' | 'all')}
            className="flex-1 flex flex-col min-h-0"
          >
            <div style={{ paddingLeft: 20, paddingRight: 20, marginTop: 12 }}>
              <TabsList className="w-full grid grid-cols-2 rounded-none border-b">
                <TabsTrigger value="friends" className="rounded-none">
                  Friends
                </TabsTrigger>
                <TabsTrigger value="all" className="rounded-none">
                  All Users
                </TabsTrigger>
              </TabsList>
            </div>

            <div
              className="flex-1 overflow-y-auto min-h-0"
              style={{ paddingLeft: 20, paddingRight: 20, paddingTop: 12, paddingBottom: 12 }}
            >
              {loading ? (
                <div className="text-center py-8">
                  <span className="text-muted-foreground">Loading...</span>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <p className="text-red-600">{error}</p>
                </div>
              ) : (
                <>
                  <TabsContent value="friends" className="mt-0 space-y-2">
                    {sortedFriendUsers.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">No friends interested yet.</p>
                      </div>
                    ) : (
                      sortedFriendUsers.map(renderUserRow)
                    )}
                  </TabsContent>

                  <TabsContent value="all" className="mt-0 space-y-2">
                    {sortedAllUsers.length === 0 ? (
                      <div className="text-center py-8">
                        <p className="text-muted-foreground">No users interested yet.</p>
                      </div>
                    ) : (
                      sortedAllUsers.map(renderUserRow)
                    )}
                  </TabsContent>
                </>
              )}
            </div>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
