import React, { useState, useEffect } from 'react';
import { X, Search, Link2, MessageSquare, Mail, ArrowRight } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { InAppShareService, type ShareTarget } from '@/services/inAppShareService';
import { ShareService } from '@/services/shareService';
import type { JamBaseEvent } from '@/types/eventTypes';
import { useToast } from '@/hooks/use-toast';
import { Users } from 'lucide-react';

interface EventShareModalProps {
  event: JamBaseEvent;
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function EventShareModal({
  event,
  currentUserId,
  isOpen,
  onClose
}: EventShareModalProps) {
  const [chats, setChats] = useState<ShareTarget[]>([]);
  const [friends, setFriends] = useState<Array<{ user_id: string; name: string; avatar_url: string | null }>>([]);
  const [selectedTargets, setSelectedTargets] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      loadShareTargets();
      loadFriends();
      setSelectedTargets(new Set());
      setSearchQuery('');
    }
  }, [isOpen, currentUserId]);

  const loadShareTargets = async () => {
    try {
      setLoading(true);
      const targets = await InAppShareService.getShareTargets(currentUserId);
      setChats(targets);
    } catch (error) {
      console.error('Error loading share targets:', error);
      toast({
        title: "Error",
        description: "Failed to load chats",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadFriends = async () => {
    try {
      const friendsList = await InAppShareService.getFriends(currentUserId);
      setFriends(friendsList);
    } catch (error) {
      console.error('Error loading friends:', error);
    }
  };

  const toggleTargetSelection = (targetId: string) => {
    setSelectedTargets(prev => {
      const newSet = new Set(prev);
      if (newSet.has(targetId)) {
        newSet.delete(targetId);
      } else {
        newSet.add(targetId);
      }
      return newSet;
    });
  };

  const handleShare = async () => {
    if (selectedTargets.size === 0) {
      toast({
        title: "No contacts selected",
        description: "Please select at least one contact to share with",
        variant: "destructive"
      });
      return;
    }

    try {
      setSharing(true);
      
      const selectedTargetsArray = Array.from(selectedTargets);
      const groupChatIds = selectedTargetsArray.filter(id => !id.startsWith('friend-'));
      const friendIds = selectedTargetsArray
        .filter(id => id.startsWith('friend-'))
        .map(id => id.replace('friend-', ''));

      let result = { successCount: 0, errors: [] as string[] };

      // Share to existing group chats
      if (groupChatIds.length > 0) {
        const groupResult = await InAppShareService.shareEventToMultipleChats(
          event.id,
          groupChatIds,
          currentUserId
        );
        result.successCount += groupResult.successCount;
        result.errors.push(...groupResult.results.filter(r => !r.success).map(r => r.error || 'Unknown error'));
      }

      // Share to friends (create new direct message chats)
      for (const friendId of friendIds) {
        try {
          const friendResult = await InAppShareService.shareEventToNewChat(
            event.id,
            friendId,
            currentUserId
          );
          if (friendResult.success) {
            result.successCount += 1;
          } else {
            result.errors.push(friendResult.error || 'Failed to share with friend');
          }
        } catch (error) {
          result.errors.push(`Failed to share with friend: ${error}`);
        }
      }

      if (result.successCount > 0) {
        toast({
          title: "Shared! 🎉",
          description: `Successfully shared to ${result.successCount} contact${result.successCount > 1 ? 's' : ''}`,
        });
        setSelectedTargets(new Set());
        onClose();
      }

      if (result.errors.length > 0) {
        toast({
          title: "Partial Success",
          description: `${result.errors.length} share${result.errors.length > 1 ? 's' : ''} failed`,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error sharing event:', error);
      toast({
        title: "Error",
        description: "Failed to share event",
        variant: "destructive"
      });
    } finally {
      setSharing(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      const url = await ShareService.shareEvent(event.id, event.title, event.description || undefined);
      await navigator.clipboard.writeText(url);
      toast({
        title: "Link Copied!",
        description: "Event link copied to clipboard",
      });
    } catch (error) {
      console.error('Error copying link:', error);
      toast({
        title: "Error",
        description: "Failed to copy link",
        variant: "destructive"
      });
    }
  };

  const handleTextMessage = async () => {
    try {
      const url = await ShareService.shareEvent(event.id, event.title, event.description || undefined);
      const text = encodeURIComponent(`Check out this event: ${event.title}\n${url}`);
      window.open(`sms:?body=${text}`, '_blank');
    } catch (error) {
      console.error('Error sharing via text:', error);
    }
  };

  const handleEmail = async () => {
    try {
      const url = await ShareService.shareEvent(event.id, event.title, event.description || undefined);
      const subject = encodeURIComponent(`Check out: ${event.title}`);
      const body = encodeURIComponent(`I thought you might like this event!\n\n${event.title}\n\n${url}`);
      window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    } catch (error) {
      console.error('Error sharing via email:', error);
    }
  };

  const handleMoreOptions = async () => {
    try {
      const url = await ShareService.shareEvent(event.id, event.title, event.description || undefined);
      
      if (navigator.share) {
        await navigator.share({
          title: event.title,
          text: event.description || 'Check out this event!',
          url: url
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast({
          title: "Link Copied!",
          description: "Event link copied to clipboard",
        });
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Error sharing:', error);
      }
    }
  };

  // Combine and filter chats and friends
  const filteredChats = chats.filter(chat =>
    chat.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFriends = friends.filter(friend =>
    friend.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const allTargets = [
    ...filteredChats.map(chat => ({
      id: chat.id,
      name: chat.name,
      avatar_url: chat.avatar_url,
      type: 'group',
      isGroup: true
    })),
    ...filteredFriends.map(friend => ({
      id: `friend-${friend.user_id}`,
      name: friend.name,
      avatar_url: friend.avatar_url,
      type: 'friend',
      isGroup: false,
      user_id: friend.user_id
    }))
  ];

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '100%',
          maxHeight: '85vh',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(40px) saturate(180%)',
          WebkitBackdropFilter: 'blur(40px) saturate(180%)',
          borderTopLeftRadius: '24px',
          borderTopRightRadius: '24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.3)',
          boxShadow: '0 -8px 32px 0 rgba(0, 0, 0, 0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
          }}
        >
          <div style={{ width: '32px' }} />
          <h2
            style={{
              fontFamily: 'var(--font-family)',
              fontSize: '18px',
              fontWeight: '600',
              lineHeight: '1.4',
              color: 'var(--neutral-900)',
              flex: 1,
              textAlign: 'center',
            }}
          >
            Share
          </h2>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              borderRadius: '16px',
            }}
          >
            <X size={20} style={{ color: 'var(--neutral-900)' }} />
          </button>
        </div>

        {/* Search Bar */}
        <div
          style={{
            padding: '12px 20px',
            borderBottom: '1px solid rgba(0, 0, 0, 0.08)',
          }}
        >
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '12px',
                color: 'var(--neutral-400)',
                pointerEvents: 'none',
              }}
            />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 40px',
                borderRadius: '12px',
                border: '1px solid rgba(0, 0, 0, 0.1)',
                backgroundColor: 'rgba(0, 0, 0, 0.04)',
                fontFamily: 'var(--font-family)',
                fontSize: '15px',
                lineHeight: '1.4',
                color: 'var(--neutral-900)',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Scrollable Content */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
          }}
        >
          {/* Direct Share Contacts */}
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0' }}>
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  border: '2px solid var(--brand-pink-500)',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
            </div>
          ) : allTargets.length > 0 ? (
            <div>
              <div
                style={{
                  display: 'flex',
                  gap: '16px',
                  overflowX: 'auto',
                  paddingBottom: '8px',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}
                className="hide-scrollbar"
              >
                {allTargets.map((target) => {
                  const isSelected = selectedTargets.has(target.id);
                  return (
                    <div
                      key={target.id}
                      onClick={() => toggleTargetSelection(target.id)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '8px',
                        minWidth: '80px',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '12px',
                        backgroundColor: isSelected ? 'rgba(236, 72, 153, 0.1)' : 'transparent',
                      }}
                    >
                      <div style={{ position: 'relative', width: '64px', height: '64px' }}>
                        <Avatar
                          style={{
                            width: '64px',
                            height: '64px',
                            border: isSelected ? '3px solid var(--brand-pink-500)' : '2px solid rgba(0, 0, 0, 0.1)',
                            borderRadius: '50%',
                          }}
                        >
                          <AvatarImage src={target.avatar_url || undefined} />
                          <AvatarFallback
                            style={{
                              backgroundColor: 'var(--brand-pink-050)',
                              color: 'var(--brand-pink-500)',
                              fontSize: '24px',
                              fontWeight: '600',
                            }}
                          >
                            {target.isGroup ? (
                              <Users size={28} style={{ color: 'var(--brand-pink-500)' }} />
                            ) : (
                              target.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
                            )}
                          </AvatarFallback>
                        </Avatar>
                        {isSelected && (
                          <div
                            style={{
                              position: 'absolute',
                              bottom: '-2px',
                              right: '-2px',
                              width: '24px',
                              height: '24px',
                              borderRadius: '50%',
                              backgroundColor: 'var(--brand-pink-500)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: '2px solid white',
                            }}
                          >
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'white' }} />
                          </div>
                        )}
                      </div>
                      <span
                        style={{
                          fontFamily: 'var(--font-family)',
                          fontSize: '12px',
                          lineHeight: '1.3',
                          color: 'var(--neutral-700)',
                          textAlign: 'center',
                          maxWidth: '80px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {target.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* External Share Options */}
          <div>
            <div
              style={{
                display: 'flex',
                gap: '16px',
                overflowX: 'auto',
                paddingBottom: '8px',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
              className="hide-scrollbar"
            >
              {/* Copy Link */}
              <button
                onClick={handleCopyLink}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  minWidth: '80px',
                  padding: '4px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderRadius: '12px',
                }}
              >
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(0, 0, 0, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid rgba(0, 0, 0, 0.1)',
                  }}
                >
                  <Link2 size={28} style={{ color: 'var(--neutral-700)' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-family)', fontSize: '12px', color: 'var(--neutral-700)', textAlign: 'center' }}>
                  Copy link
                </span>
              </button>

              {/* Text Messages */}
              <button
                onClick={handleTextMessage}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  minWidth: '80px',
                  padding: '4px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderRadius: '12px',
                }}
              >
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(0, 0, 0, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid rgba(0, 0, 0, 0.1)',
                  }}
                >
                  <MessageSquare size={28} style={{ color: 'var(--neutral-700)' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-family)', fontSize: '12px', color: 'var(--neutral-700)', textAlign: 'center' }}>
                  Text Message
                </span>
              </button>

              {/* Email */}
              <button
                onClick={handleEmail}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  minWidth: '80px',
                  padding: '4px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderRadius: '12px',
                }}
              >
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(0, 0, 0, 0.06)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid rgba(0, 0, 0, 0.1)',
                  }}
                >
                  <Mail size={28} style={{ color: 'var(--neutral-700)' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-family)', fontSize: '12px', color: 'var(--neutral-700)', textAlign: 'center' }}>
                  Email
                </span>
              </button>

              {/* More options */}
              <button
                onClick={handleMoreOptions}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  minWidth: '80px',
                  padding: '4px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderRadius: '12px',
                }}
              >
                <div
                  style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '50%',
                    backgroundColor: 'rgba(0, 0, 0, 0.04)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid rgba(0, 0, 0, 0.1)',
                  }}
                >
                  <ArrowRight size={24} style={{ color: 'var(--neutral-400)' }} />
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Share Button */}
        {selectedTargets.size > 0 && (
          <div
            style={{
              padding: '16px 20px',
              borderTop: '1px solid rgba(0, 0, 0, 0.08)',
              backgroundColor: 'rgba(255, 255, 255, 0.98)',
            }}
          >
            <button
              onClick={handleShare}
              disabled={sharing}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                backgroundColor: 'var(--brand-pink-500)',
                color: 'white',
                fontFamily: 'var(--font-family)',
                fontSize: '16px',
                fontWeight: '600',
                cursor: sharing ? 'not-allowed' : 'pointer',
                opacity: sharing ? 0.7 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              {sharing ? (
                <>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      border: '2px solid white',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                  Sharing...
                </>
              ) : (
                `Share (${selectedTargets.size})`
              )}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
