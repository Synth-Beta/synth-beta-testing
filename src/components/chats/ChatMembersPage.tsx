import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { createFriendRequest } from '@synth/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { fetchChatSenderProfiles } from '@/services/chatService';
import { FriendsService } from '@/services/friendsService';

export type ChatMemberFriendStatus = 'none' | 'pending' | 'friends';

export type ChatMemberRow = {
  user_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
};

type ChatMembersPageProps = {
  chatId: string;
  currentUserId: string;
  onBack: () => void;
  onOpenProfile: (userId: string) => void;
};

type FriendStatusMaps = {
  statusByUserId: Record<string, ChatMemberFriendStatus>;
  pendingRequestIdByUserId: Record<string, string>;
};

async function loadFriendStatuses(
  currentUserId: string,
  memberIds: string[]
): Promise<FriendStatusMaps> {
  const others = memberIds.filter((id) => id && id !== currentUserId);
  const statusByUserId: Record<string, ChatMemberFriendStatus> = {};
  const pendingRequestIdByUserId: Record<string, string> = {};
  others.forEach((id) => {
    statusByUserId[id] = 'none';
  });
  if (others.length === 0) return { statusByUserId, pendingRequestIdByUserId };

  const [{ data: sent }, { data: received }] = await Promise.all([
    supabase
      .from('user_relationships')
      .select('id, related_user_id, status')
      .eq('user_id', currentUserId)
      .eq('relationship_type', 'friend')
      .in('status', ['pending', 'accepted'])
      .in('related_user_id', others),
    supabase
      .from('user_relationships')
      .select('id, user_id, status')
      .eq('related_user_id', currentUserId)
      .eq('relationship_type', 'friend')
      .in('status', ['pending', 'accepted'])
      .in('user_id', others),
  ]);

  sent?.forEach((row) => {
    const id = String(row.related_user_id);
    if (!(id in statusByUserId)) return;
    if (row.status === 'accepted') {
      statusByUserId[id] = 'friends';
      return;
    }
    statusByUserId[id] = 'pending';
    if (row.id) pendingRequestIdByUserId[id] = String(row.id);
  });
  received?.forEach((row) => {
    const id = String(row.user_id);
    if (!(id in statusByUserId)) return;
    if (statusByUserId[id] === 'friends') return;
    if (row.status === 'accepted') {
      statusByUserId[id] = 'friends';
      return;
    }
    // Incoming pending still shows "Pending", but only outgoing requests are cancelable.
    statusByUserId[id] = 'pending';
  });

  return { statusByUserId, pendingRequestIdByUserId };
}

export const ChatMembersPage: React.FC<ChatMembersPageProps> = ({
  chatId,
  currentUserId,
  onBack,
  onOpenProfile,
}) => {
  const [members, setMembers] = useState<ChatMemberRow[]>([]);
  const [friendStatusByUserId, setFriendStatusByUserId] = useState<
    Record<string, ChatMemberFriendStatus>
  >({});
  const [pendingRequestIdByUserId, setPendingRequestIdByUserId] = useState<Record<string, string>>(
    {}
  );
  const [sendingUserIds, setSendingUserIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [cancelConfirmUserId, setCancelConfirmUserId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: participantData, error: participantsError } = await supabase
        .from('chat_participants')
        .select('user_id, joined_at')
        .eq('chat_id', chatId)
        .order('joined_at', { ascending: true });

      if (participantsError) {
        console.error('Error fetching chat members:', participantsError);
        setMembers([]);
        return;
      }

      const userIds = (participantData || []).map((p) => p.user_id).filter(Boolean);
      if (userIds.length === 0) {
        setMembers([]);
        setFriendStatusByUserId({});
        setPendingRequestIdByUserId({});
        return;
      }

      const profileMap = await fetchChatSenderProfiles(chatId, userIds);
      const list: ChatMemberRow[] = userIds.map((userId) => {
        const profile = profileMap.get(userId);
        return {
          user_id: userId,
          name: profile?.name || 'User',
          username: profile?.username ?? null,
          avatar_url: profile?.avatar_url ?? null,
        };
      });

      const { statusByUserId, pendingRequestIdByUserId: requestIds } = await loadFriendStatuses(
        currentUserId,
        userIds
      );
      setMembers(list);
      setFriendStatusByUserId(statusByUserId);
      setPendingRequestIdByUserId(requestIds);
    } catch (error) {
      console.error('Error loading chat members page:', error);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [chatId, currentUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAddFriend = async (userId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!userId || userId === currentUserId) return;
    if (friendStatusByUserId[userId] && friendStatusByUserId[userId] !== 'none') return;
    if (sendingUserIds.has(userId)) return;

    setSendingUserIds((prev) => new Set(prev).add(userId));
    try {
      const result = await createFriendRequest(supabase, userId);
      if (result.ok || result.kind === 'business') {
        let requestId = result.ok ? result.requestId ?? null : null;
        if (!requestId) {
          requestId = await FriendsService.getPendingRequestId(currentUserId, userId);
        }
        setFriendStatusByUserId((prev) => ({ ...prev, [userId]: 'pending' }));
        if (requestId) {
          setPendingRequestIdByUserId((prev) => ({ ...prev, [userId]: requestId! }));
        }
      }
    } catch (error) {
      console.error('Error sending friend request from chat members:', error);
    } finally {
      setSendingUserIds((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  };

  const openCancelConfirm = (userId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCancelConfirmUserId(userId);
  };

  const confirmCancelPending = async () => {
    const userId = cancelConfirmUserId;
    setCancelConfirmUserId(null);
    if (!userId) return;
    const requestId = pendingRequestIdByUserId[userId];
    if (!requestId) return;
    try {
      await FriendsService.cancelFriendRequest(requestId);
      setFriendStatusByUserId((prev) => ({ ...prev, [userId]: 'none' }));
      setPendingRequestIdByUserId((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
    } catch (error) {
      console.error('Error canceling friend request from chat members:', error);
    }
  };

  const cancelConfirmName =
    members.find((m) => m.user_id === cancelConfirmUserId)?.name || 'this user';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        height: '100%',
        backgroundColor: '#FFFFFF',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--spacing-inline, 6px)',
          padding: '12px var(--spacing-screen-margin-x, 20px)',
          paddingTop: 'calc(var(--onboarding-banner-height, 0px) + env(safe-area-inset-top, 0px) + 12px)',
          flexShrink: 0,
          borderBottom: '1px solid var(--neutral-200)',
          backgroundColor: '#FFFFFF',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex items-center justify-center cursor-pointer synth-focus rounded"
          style={{ width: 32, height: 32, flexShrink: 0, padding: 0, margin: 0, background: 'none', border: 'none' }}
          aria-label="Back to chat"
        >
          <ArrowLeft className="w-5 h-5" style={{ color: 'var(--neutral-900)' }} aria-hidden="true" />
        </button>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: 'var(--font-family)',
            fontSize: 16,
            fontWeight: 600,
            color: 'var(--neutral-900)',
            textAlign: 'center',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          Members
        </span>
        <div style={{ width: 32, height: 32, flexShrink: 0 }} />
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          backgroundColor: '#FFFFFF',
          padding: '8px 0 calc(var(--spacing-bottom-nav, 32px) + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand-pink-500)' }} />
          </div>
        ) : members.length === 0 ? (
          <p
            style={{
              fontFamily: 'var(--font-family)',
              fontSize: 'var(--typography-meta-size, 16px)',
              fontWeight: 'var(--typography-meta-weight, 500)',
              color: 'var(--neutral-600)',
              textAlign: 'center',
              margin: '48px 20px 0',
            }}
          >
            No members found
          </p>
        ) : (
          members.map((member) => {
            const isSelf = member.user_id === currentUserId;
            const status = isSelf ? 'friends' : friendStatusByUserId[member.user_id] || 'none';
            const sending = sendingUserIds.has(member.user_id);
            const usernameLabel = member.username
              ? member.username.startsWith('@')
                ? member.username
                : `@${member.username}`
              : null;

            return (
              <div
                key={member.user_id}
                role="button"
                tabIndex={0}
                onClick={() => onOpenProfile(member.user_id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenProfile(member.user_id);
                  }
                }}
                className="synth-focus"
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px var(--spacing-screen-margin-x, 20px)',
                  background: 'none',
                  borderBottom: '1px solid var(--neutral-200)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
                aria-label={`Open ${member.name}'s profile`}
              >
                <Avatar className="w-12 h-12 flex-shrink-0">
                  <AvatarImage src={member.avatar_url || undefined} alt="" />
                  <AvatarFallback
                    className="font-medium"
                    style={{ backgroundImage: 'var(--gradient-brand)', color: 'var(--neutral-50)' }}
                  >
                    {member.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-family)',
                      fontSize: 16,
                      fontWeight: 600,
                      color: '#000000',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {member.name}
                    {isSelf ? (
                      <span style={{ color: 'var(--neutral-600)', fontWeight: 500, marginLeft: 6 }}>
                        (You)
                      </span>
                    ) : null}
                  </div>
                  {usernameLabel ? (
                    <div
                      style={{
                        fontFamily: 'var(--font-family)',
                        fontSize: 14,
                        fontWeight: 500,
                        color: 'var(--neutral-600)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginTop: 2,
                      }}
                    >
                      {usernameLabel}
                    </div>
                  ) : null}
                </div>

                {!isSelf && status === 'none' ? (
                  <button
                    type="button"
                    onClick={(e) => void handleAddFriend(member.user_id, e)}
                    disabled={sending}
                    style={{
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 36,
                      padding: '0 12px',
                      borderRadius: 10,
                      border: 'none',
                      backgroundColor: 'var(--brand-pink-500)',
                      color: 'var(--neutral-50)',
                      fontFamily: 'var(--font-family)',
                      fontSize: 14,
                      fontWeight: 600,
                      lineHeight: 1,
                      opacity: sending ? 0.7 : 1,
                      cursor: sending ? 'default' : 'pointer',
                    }}
                    aria-label={`Add ${member.name} as a friend`}
                  >
                    {sending ? 'Sending…' : 'Add Friend'}
                  </button>
                ) : null}

                {!isSelf && status === 'pending' ? (
                  pendingRequestIdByUserId[member.user_id] ? (
                    <button
                      type="button"
                      onClick={(e) => openCancelConfirm(member.user_id, e)}
                      style={{
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: 36,
                        padding: '0 12px',
                        borderRadius: 10,
                        border: '1px solid var(--neutral-200)',
                        backgroundColor: 'transparent',
                        color: 'var(--neutral-600)',
                        fontFamily: 'var(--font-family)',
                        fontSize: 14,
                        fontWeight: 600,
                        lineHeight: 1,
                        cursor: 'pointer',
                      }}
                      aria-label={`Cancel pending friend request to ${member.name}`}
                    >
                      Pending
                    </button>
                  ) : (
                    <span
                      style={{
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: 36,
                        padding: '0 12px',
                        borderRadius: 10,
                        border: '1px solid var(--neutral-200)',
                        backgroundColor: 'transparent',
                        color: 'var(--neutral-600)',
                        fontFamily: 'var(--font-family)',
                        fontSize: 14,
                        fontWeight: 600,
                        lineHeight: 1,
                        pointerEvents: 'none',
                      }}
                      aria-label="Friend request pending"
                    >
                      Pending
                    </span>
                  )
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <AlertDialog
        open={cancelConfirmUserId !== null}
        onOpenChange={(open) => {
          if (!open) setCancelConfirmUserId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {`Are you sure you want to cancel your friend request to ${cancelConfirmName}?`}
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              Confirm canceling this friend request.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelConfirmUserId(null)}>No</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmCancelPending()}>Yes</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
