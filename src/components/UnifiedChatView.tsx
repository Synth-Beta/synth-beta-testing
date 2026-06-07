import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { SkeletonChatMessage } from '@/components/skeleton/SkeletonChatMessage';
import { SkeletonNotificationCard } from '@/components/skeleton/SkeletonNotificationCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { SearchBar } from '@/components/SearchBar';

import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  MessageCircle, 
  Plus, 
  Search, 
  Users, 
  X,
  Send,
  UserPlus,
  Trash2,
  ArrowLeft,
  Settings,
  MoreVertical,
  User,
  Shield,
  Bell,
  BellOff,
  Calendar,
  Eye,
  UserX,
  Star,
  MapPin,
  Images,
  Play,
  Heart,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { FriendsService } from '@/services/friendsService';
import { SynthLoadingScreen } from '@/components/ui/SynthLoader';
import { MobileHeader } from '@/components/Header/MobileHeader';
import { SynthButton } from '@/components/Button/SynthButton';
import { format, parseISO, differenceInMinutes, isWithinInterval, subDays } from 'date-fns';
import { UserInfo } from '@/components/profile/UserInfo';
import { SynthSLogo } from '@/components/SynthSLogo';
import { EventMessageCard } from '@/components/chat/EventMessageCard';
import { ReviewMessageCard } from '@/components/chat/ReviewMessageCard';
import type { JamBaseEvent } from '@/types/eventTypes';
import { EventDetailsModal } from '@/components/events/EventDetailsModal';
import { UserEventService } from '@/services/userEventService';
import { fetchUserChats, sendEncryptedMessage, decryptChatMessage } from '@/services/chatService';
import type { ReviewWithEngagement } from '@/services/reviewService';
import type { UnifiedFeedItem } from '@/services/unifiedFeedService';
import { VerifiedChatService } from '@/services/verifiedChatService';

import { useViewTracking } from '@/hooks/useViewTracking';
import { trackInteraction } from '@/services/interactionTrackingService';
import { toast } from '@/hooks/use-toast';
import { buildChatImageStoragePath, resolveChatImageDisplayUrl } from '@/utils/chatImageStorage';
import PageShell from '@/components/layout/PageShell';

// Chat Review Message wrapper — renders exactly like EventMessageCard (no chrome/header)
const ChatReviewMessage: React.FC<{
  reviewId: string;
  currentUserId?: string;
  onReviewClick?: (review: ReviewWithEngagement) => void;
  metadata?: { review_text?: string; rating?: number; artist_name?: string; venue_name?: string; custom_message?: string; };
}> = ({ reviewId, currentUserId, onReviewClick, metadata }) => {
  return (
    <div style={{ width: 300 }}>
      <ReviewMessageCard
        reviewId={reviewId}
        currentUserId={currentUserId}
        onReviewClick={onReviewClick}
        customMessage={metadata?.custom_message}
        metadata={metadata}
      />
    </div>
  );
};

// Security: Private chat-images bucket — resolve signed URLs at render time.
const ChatImageMessage: React.FC<{
  imageUrl?: string;
  storagePath?: string;
  alignSelf: string;
}> = ({ imageUrl, storagePath, alignSelf }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveChatImageDisplayUrl(imageUrl, storagePath).then((url) => {
      if (!cancelled) setSrc(url);
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrl, storagePath]);

  if (!src) return null;

  return (
    <div style={{ alignSelf, display: 'inline-block' }}>
      <img
        src={src}
        alt="Shared image"
        style={{
          maxWidth: 280,
          maxHeight: 320,
          borderRadius: 12,
          display: 'block',
          objectFit: 'cover',
        }}
      />
    </div>
  );
};

interface Chat {
  id: string;
  chat_name: string;
  is_group_chat: boolean;
  users: string[]; // Populated by get_user_chats RPC from chat_participants (backward compatibility)
  latest_message_id: string | null;
  latest_message: string | null;
  latest_message_created_at: string | null;
  latest_message_sender_name: string | null;
  group_admin_id: string | null;
  created_at: string;
  updated_at: string;
  unread_count?: number; // Keep for backward compatibility during transition
  has_unread?: boolean;
  // Verified chat fields
  entity_type?: 'event' | 'artist' | 'venue' | null;
  entity_id?: string | null;
  entity_uuid?: string | null;
  is_verified?: boolean;
  member_count?: number; // Computed by get_user_chats RPC from chat_participants
  last_activity_at?: string | null;
  // Event image URL (for group chats)
  event_image_url?: string | null;
}

interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  is_encrypted?: boolean;
  created_at: string;
  sender_name: string;
  sender_avatar: string | null;
  message_type?: 'text' | 'event_share' | 'review_share' | 'system' | 'image';
  shared_event_id?: string | null;
  shared_review_id?: string | null;
  metadata?: any;
}

interface User {
  user_id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
  account_type?: 'user' | 'creator' | 'business' | 'admin';
}

interface UnifiedChatViewProps {
  currentUserId: string;
  onBack: () => void;
  menuOpen?: boolean;
  onMenuClick?: () => void;
  hideHeader?: boolean;
  onChatSelected?: (isSelected: boolean) => void;
}

export const UnifiedChatView = ({ currentUserId, onBack, menuOpen = false, onMenuClick, hideHeader = false, onChatSelected }: UnifiedChatViewProps) => {
  // Track chat view
  useViewTracking('view', 'chat', { source: 'messages' });

  // Single source of truth for gap above composer safety box
  // Messages end 6px above the safety box (the safety box itself accounts for all its own space)
  const composerReservedSpace = `var(--spacing-grouped, 24px)`;

  const [chats, setChats] = useState<Chat[]>([]);
  const [chatFetchError, setChatFetchError] = useState(false);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [showUserSearch, setShowUserSearch] = useState(false);
  // Map of chat_id -> other_user_id for direct chats (to fix Bug 1)
  const [chatToOtherUserMap, setChatToOtherUserMap] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [isFetchingMessages, setIsFetchingMessages] = useState(false);
  const [didLoadMessages, setDidLoadMessages] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [isEditingGroupName, setIsEditingGroupName] = useState(false);
  const [editedGroupName, setEditedGroupName] = useState('');
const lastAnnouncedMessageIdRef = useRef<string | null>(null);

  // Total unread messages across all chats (for Messages header)
  // Prefer unread_count (message count). Fall back to has_unread (treated as 1) when counts aren't available.
  const unreadMessagesCount = chats.reduce((acc, chat) => {
    if (typeof chat.unread_count === 'number') return acc + chat.unread_count;
    return acc + (chat.has_unread ? 1 : 0);
  }, 0);

  // Event details modal state
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEvent | null>(null);
  const [selectedEventInterested, setSelectedEventInterested] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Review detail modal state
  const [showReviewDetailModal, setShowReviewDetailModal] = useState(false);
  const [selectedReviewDetail, setSelectedReviewDetail] = useState<UnifiedFeedItem | null>(null);
  const [loadingReviewDetails, setLoadingReviewDetails] = useState(false);
  const [isDeleteChatModalOpen, setIsDeleteChatModalOpen] = useState(false);
  const [chatPendingDeletion, setChatPendingDeletion] = useState<Chat | null>(null);
  const [reviewDetailData, setReviewDetailData] = useState<{
    photos: string[];
    videos: string[];
    categoryRatings: {
      performance?: number;
      venue?: number;
      overallExperience?: number;
    };
    categoryTexts: {
      performance?: string;
      venue?: string;
      overallExperience?: string;
    };
    moodTags?: string[];
    genreTags?: string[];
    contextTags?: string[];
    venueTags?: string[];
    artistTags?: string[];
    reactionEmoji?: string;
  } | null>(null);
  
  // Track which group chats are event-created
  const [eventCreatedChats, setEventCreatedChats] = useState<Set<string>>(new Set());
  
  // Settings menu state
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [chatParticipants, setChatParticipants] = useState<any[]>([]);
  const [isMuted, setIsMuted] = useState(false);
  const [linkedEvent, setLinkedEvent] = useState<any>(null);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Auto-scroll ref for messages
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const horizontalSwipeTriggeredRef = useRef(false);

  const scrollMessagesToBottom = useCallback(() => {
    const el = messagesScrollRef.current;
    if (!el) return;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight;
        });
      });
    });
  }, []);

  const resetSwipeState = () => {
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    horizontalSwipeTriggeredRef.current = false;
  };

  const handleChatTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    touchStartXRef.current = touch.clientX;
    touchStartYRef.current = touch.clientY;
    horizontalSwipeTriggeredRef.current = false;
  };

  const handleChatTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    if (startX === null || startY === null) return;

    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    const isHorizontalSwipe = Math.abs(dx) > Math.abs(dy) && dx > 0;

    if (!isHorizontalSwipe) return;

    if (startX < 24) {
      if (!horizontalSwipeTriggeredRef.current && dx > 90) {
        horizontalSwipeTriggeredRef.current = true;
        setSelectedChat(null);
        window.scrollTo(0, 0);
      }
      event.preventDefault();
    }
  };

  const handleChatTouchEnd = () => {
    resetSwipeState();
  };

  const handleChatTouchCancel = () => {
    resetSwipeState();
  };

  const closeDeleteChatModal = () => {
    setIsDeleteChatModalOpen(false);
    setChatPendingDeletion(null);
  };

  useEffect(() => {
    if (!isDeleteChatModalOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDeleteChatModal();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isDeleteChatModalOpen]);

  useEffect(() => {
    fetchChats();
    fetchUsers();
  }, [currentUserId]);

  useEffect(() => {
    console.log('🔍 users changed:', users);
    console.log('🔍 users length:', users.length);
  }, [users]);

  useEffect(() => {
    console.log('🔍 selectedChat changed:', selectedChat);
    console.log('🔍 selectedChat exists:', !!selectedChat);
    console.log('🔍 selectedChat id:', selectedChat?.id);
    // Notify parent when chat selection changes
    if (onChatSelected) {
      onChatSelected(!!selectedChat);
    }
  }, [selectedChat, onChatSelected]);

  useEffect(() => {
    if (selectedChat) {
      setDidLoadMessages(false);
      fetchMessages(selectedChat.id);
      fetchChatParticipants(selectedChat.id);
      fetchLinkedEvent(selectedChat.id);
      // Mark messages as read when chat is opened
      markChatAsRead(selectedChat.id);
    }
  }, [selectedChat]);

  useEffect(() => {
    if (!selectedChat) return;
    if (!didLoadMessages) return;
    scrollMessagesToBottom();
  }, [didLoadMessages, selectedChat?.id, scrollMessagesToBottom]);

  // Real-time subscription for messages in selected chat
  useEffect(() => {
    if (!selectedChat) return;

    const channel = supabase
      .channel(`chat-messages-${selectedChat.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `chat_id=eq.${selectedChat.id}`
        },
        async (payload) => {
          console.log('📨 Real-time message update:', payload);
          
          // Small delay for INSERT events to ensure database transaction is fully committed
          // This is especially important for event_share messages with metadata
          if (payload.eventType === 'INSERT') {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // Refresh messages when new ones arrive
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
            fetchMessages(selectedChat.id);
            // Refresh chat list to update latest message
            fetchChats();
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to messages for chat:', selectedChat.id);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to messages');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedChat?.id]);

  // Real-time subscription for chat list updates
  useEffect(() => {
    if (!currentUserId) return;

    const channel = supabase
      .channel('chat-list-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chats'
        },
        (payload) => {
          console.log('💬 Real-time chat update:', payload);
          // Check if this chat involves the current user
          const newChat = payload.new as any;
          const oldChat = payload.old as any;
          const chatUsers = (newChat?.users || oldChat?.users || []) as string[];
          if (Array.isArray(chatUsers) && chatUsers.includes(currentUserId)) {
            // Refresh chat list when user's chats change
            fetchChats();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages'
        },
        (payload) => {
          console.log('📨 New message in any chat:', payload);
          // Refresh chat list to update latest message timestamps
          // This will be handled by the get_user_chats function which updates latest_message fields
          fetchChats();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to chat list updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to chat list');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  // Fetch users when user search modal opens
  useEffect(() => {
    if (showUserSearch) {
      fetchUsers();
    }
  }, [showUserSearch]);

  // Event handlers
  const handleEventClick = async (event: JamBaseEvent) => {
    setSelectedEvent(event);
    
    // Check if user is interested in this event
    try {
      const interested = await UserEventService.isUserInterested(currentUserId, event.id);
      setSelectedEventInterested(interested);
    } catch (error) {
      console.error('Error checking interest:', error);
      setSelectedEventInterested(false);
    }
    
    setEventDetailsOpen(true);
  };

  const handleInterestToggle = async (eventId: string, interested: boolean) => {
    try {
      await UserEventService.setEventInterest(currentUserId, eventId, interested);
      setSelectedEventInterested(interested);
      setRefreshTrigger(prev => prev + 1);
      
      } catch (error) {
      console.error('Error toggling interest:', error);
      }
  };

  const handleReviewClick = async (review: ReviewWithEngagement) => {
    // Fetch author information first
    let authorName = 'User';
    let authorAvatar: string | undefined = undefined;
    
    if (review.user_id) {
      try {
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('user_id, name, avatar_url')
          .eq('user_id', review.user_id)
          .maybeSingle();
        
        if (!userError && userData) {
          authorName = userData.name || 'User';
          authorAvatar = userData.avatar_url || undefined;
        }
      } catch (error) {
        console.error('Error fetching author information:', error);
        // Continue with default values if fetch fails
      }
    }
    
    // Convert ReviewWithEngagement to UnifiedFeedItem format for the modal
    const reviewItem: UnifiedFeedItem = {
      id: review.id,
      type: 'review',
      review_id: review.id,
      title: review.artist_name && review.venue_name 
        ? `${review.artist_name} at ${review.venue_name}`
        : review.artist_name || review.venue_name || 'Concert Review',
      content: review.review_text || '',
      author: {
        id: review.user_id,
        name: authorName,
        avatar_url: authorAvatar
      },
      created_at: review.created_at,
      rating: review.rating,
      photos: review.photos || [],
      likes_count: review.likes_count || 0,
      comments_count: review.comments_count || 0,
      shares_count: review.shares_count || 0,
      is_liked: review.is_liked_by_user || false,
      event_info: {
        artist_name: review.artist_name,
        venue_name: review.venue_name,
        artist_id: review.artist_id,
        venue_id: review.venue_id
      },
      relevance_score: 0
    };

    setSelectedReviewDetail(reviewItem);
    setShowReviewDetailModal(true);
    setLoadingReviewDetails(true);
    setReviewDetailData(null);

      // Fetch full review details using the 5-category rating system
      try {
        const { data, error } = await (supabase as any)
          .from('reviews')
          .select(`
            photos,
            videos,
            artist_performance_rating,
            production_rating,
            venue_rating,
            venue_rating,
            location_rating,
            value_rating,
            artist_performance_feedback,
            production_feedback,
            venue_feedback,
            location_feedback,
            value_feedback,
            mood_tags,
            genre_tags,
            context_tags,
            venue_tags,
            artist_tags,
            reaction_emoji,
            review_text
          `)
        .eq('id', review.id)
        .maybeSingle();

      if (error) {
        console.error('Error fetching review details:', error);
        setReviewDetailData(null);
        setLoadingReviewDetails(false);
        return;
      }

      if (data) {
        setReviewDetailData({
          photos: Array.isArray(data.photos) ? data.photos : [],
          videos: Array.isArray(data.videos) ? data.videos : [],
          categoryRatings: {
            performance: typeof data.performance_rating === 'number' ? data.performance_rating : undefined,
            venue: typeof data.venue_rating === 'number' ? data.venue_rating : undefined,
            overallExperience: typeof data.overall_experience_rating === 'number' ? data.overall_experience_rating : undefined,
          },
          categoryTexts: {
            performance: data.performance_review_text || undefined,
            venue: data.venue_review_text || undefined,
            overallExperience: data.overall_experience_review_text || undefined,
          },
          moodTags: Array.isArray(data.mood_tags) && data.mood_tags.length > 0 ? data.mood_tags : undefined,
          genreTags: Array.isArray(data.genre_tags) && data.genre_tags.length > 0 ? data.genre_tags : undefined,
          contextTags: Array.isArray(data.context_tags) && data.context_tags.length > 0 ? data.context_tags : undefined,
          venueTags: Array.isArray(data.venue_tags) && data.venue_tags.length > 0 ? data.venue_tags : undefined,
          artistTags: Array.isArray(data.artist_tags) && data.artist_tags.length > 0 ? data.artist_tags : undefined,
          reactionEmoji: data.reaction_emoji || undefined,
        });
      }
    } catch (error) {
      console.error('Error fetching review details:', error);
      setReviewDetailData(null);
    } finally {
      setLoadingReviewDetails(false);
    }
  };

  const handleAttendanceToggle = async (eventId: string, attended: boolean) => {
    try {
      await UserEventService.markUserAttendance(currentUserId, eventId, attended);
      
      } catch (error) {
      console.error('Error toggling attendance:', error);
      }
  };

  const fetchChats = async (): Promise<Chat[] | null> => {
    try {
      const { data, error } = await fetchUserChats(currentUserId);

      if (error) {
        console.error('Error fetching chats:', error);
        setChatFetchError(true);
        return null;
      }

      // Get user's last_read_at for each chat from chat_participants
      const { data: participantData } = await supabase
        .from('chat_participants')
        .select('chat_id, last_read_at')
        .eq('user_id', currentUserId);
      
      const lastReadMap = new Map<string, string | null>();
      participantData?.forEach(p => {
        lastReadMap.set(p.chat_id, p.last_read_at);
      });
      
      // Count unread messages per chat
      const chatsWithUnread = await Promise.all((data || []).map(async (chat) => {
        try {
          const lastReadAt = lastReadMap.get(chat.id);
          
          // Build query to count unread messages
          let countQuery = supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', chat.id)
            .neq('sender_id', currentUserId);
          
          // If we have a last_read_at timestamp, only count messages after that
          if (lastReadAt) {
            countQuery = countQuery.gt('created_at', lastReadAt);
          }
          
          const { count, error: countError } = await countQuery;
          
          if (countError) {
            console.error('Error counting unread messages for chat:', chat.id, countError);
            return {
              ...chat,
              has_unread: false,
              unread_count: 0
            };
          }
          
          const unreadCount = count || 0;
          
          return {
            ...chat,
            has_unread: unreadCount > 0,
            unread_count: unreadCount
          };
        } catch (error) {
          console.error('Error checking unread status for chat:', chat.id, error);
          return {
            ...chat,
            has_unread: false,
            unread_count: 0
          };
        }
      }));

      // Sort: unread messages first, then by latest message time
      const sortedChats = chatsWithUnread.sort((a, b) => {
        // First sort by has_unread (unread first)
        if (a.has_unread && !b.has_unread) return -1;
        if (!a.has_unread && b.has_unread) return 1;
        
        // Then sort by latest message time
        const aTime = a.latest_message_created_at ? new Date(a.latest_message_created_at).getTime() : 0;
        const bTime = b.latest_message_created_at ? new Date(b.latest_message_created_at).getTime() : 0;
        return bTime - aTime; // Descending order
      });

      // Fetch entity data for group chats (to get event images from artists table)
      const groupChatIds = sortedChats.filter(chat => chat.is_group_chat).map(chat => chat.id);
      const entityDataMap = new Map<string, { entity_type?: string; entity_uuid?: string; event_image_url?: string }>();
      
      console.log('🔍 fetchChats: Group chat IDs:', groupChatIds);
      
      if (groupChatIds.length > 0) {
        const { data: chatEntities, error: chatEntitiesError } = await supabase
          .from('chats')
          .select('id, entity_type, entity_uuid')
          .in('id', groupChatIds);
        
        console.log('🔍 fetchChats: Chat entities:', chatEntities, 'Error:', chatEntitiesError);
        
        // Populate entity_type/entity_uuid for all group chats (event, artist, venue)
        chatEntities?.forEach((c) => {
          if (c.id) {
            entityDataMap.set(c.id, {
              entity_type: c.entity_type ?? undefined,
              entity_uuid: c.entity_uuid ?? undefined,
            });
          }
        });
        
        // For event-type chats, fetch artist image from artists table via event's artist relationship
        const eventChats = chatEntities?.filter(c => c.entity_type === 'event' && c.entity_uuid) || [];
        console.log('🔍 fetchChats: Event chats:', eventChats);
        
        if (eventChats.length > 0) {
          const eventIds = eventChats.map(c => c.entity_uuid).filter(Boolean) as string[];
          console.log('🔍 fetchChats: Event IDs:', eventIds);
          
          // Fetch events with artist_id (UUID - direct foreign key to artists.id)
          const { data: events, error: eventsError } = await supabase
            .from('events')
            .select('id, artist_id')
            .in('id', eventIds);
          
          console.log('🔍 fetchChats: Events with artist_id:', events, 'Error:', eventsError);
          
          // Get unique artist_ids (UUIDs - direct foreign keys to artists.id)
          const artistUuids = events ? [...new Set(events.map(e => e.artist_id).filter(Boolean) as string[])] : [];
          console.log('🔍 fetchChats: Artist UUIDs:', artistUuids);
          
          if (artistUuids.length > 0) {
            // Directly query artists by their UUID primary key (id)
            const { data: artists, error: artistsError } = await supabase
              .from('artists')
              .select('id, image_url')
              .in('id', artistUuids);
            
            console.log('🔍 fetchChats: Artists fetched by UUID:', artists, 'Error:', artistsError);
            
            if (artists && artists.length > 0) {
              // Create a map: artist_id (UUID from events) -> image_url
              const artistImageMap = new Map<string, string>();
              artists.forEach(artist => {
                if (artist.image_url && artist.id) {
                  artistImageMap.set(artist.id, artist.image_url);
                  console.log(`🔍 Mapped artist UUID: ${artist.id} -> image_url: ${artist.image_url}`);
                }
              });
              
              console.log('🔍 fetchChats: Artist image map:', Array.from(artistImageMap.entries()));
              
              // Map artist images to chat IDs via event -> artist relationship
              events?.forEach(event => {
                const chat = eventChats.find(c => c.entity_uuid === event.id);
                if (chat && event.artist_id) {
                  const artistImageUrl = artistImageMap.get(event.artist_id);
                  console.log(`🔍 fetchChats: Mapping chat ${chat.id} to artist image:`, {
                    eventId: event.id,
                    artist_id: event.artist_id,
                    imageUrl: artistImageUrl
                  });
                  if (artistImageUrl) {
                    entityDataMap.set(chat.id, {
                      entity_type: chat.entity_type,
                      entity_uuid: chat.entity_uuid,
                      event_image_url: artistImageUrl
                    });
                  }
                }
              });
              
              console.log('🔍 fetchChats: Final entityDataMap:', Array.from(entityDataMap.entries()));
            } else {
              console.log('🔍 fetchChats: No artists found for UUIDs:', artistUuids);
            }
          }
        }
      }

      // Ensure all required fields are present
      const normalizedChats: Chat[] = sortedChats.map(chat => {
        const chatAny = chat as any;
        const entityData = entityDataMap.get(chat.id);
        return {
        ...chat,
        latest_message_id: chat.latest_message_id ?? null,
        latest_message: chat.latest_message ?? null,
        latest_message_created_at: chat.latest_message_created_at ?? null,
        latest_message_sender_name: chat.latest_message_sender_name ?? null,
        group_admin_id: chat.group_admin_id ?? null,
          member_count: chatAny.member_count ?? null, // member_count from RPC
          entity_type: entityData?.entity_type ?? chatAny.entity_type ?? null,
          entity_uuid: entityData?.entity_uuid ?? chatAny.entity_uuid ?? null,
          event_image_url: entityData?.event_image_url ?? null,
        created_at: chat.created_at ?? new Date().toISOString(),
        updated_at: chat.updated_at ?? new Date().toISOString(),
        };
      });
      
      setChatFetchError(false);
      setChats(normalizedChats);

      // Fetch user profiles for direct chat participants (to improve getChatDisplayName)
      // Query chat_participants for direct chats instead of using users array
      const directChatIds = sortedChats
        .filter(chat => !chat.is_group_chat)
        .map(chat => chat.id);
      
      if (directChatIds.length > 0) {
        const { data: participants, error: participantsError } = await supabase
          .from('chat_participants')
          .select('chat_id, user_id')
          .in('chat_id', directChatIds)
          .neq('user_id', currentUserId);
        
        if (participantsError) {
          console.error('Error fetching chat participants for direct chats:', participantsError);
          // Continue with empty map if error occurs
        }
        
        // Build map of chat_id -> other_user_id for direct chats (Bug 1 fix)
        const chatToUserMap = new Map<string, string>();
        const directChatUserIds = new Set<string>();
        participants?.forEach(p => {
          chatToUserMap.set(p.chat_id, p.user_id);
          directChatUserIds.add(p.user_id);
        });
        setChatToOtherUserMap(chatToUserMap);
        
        // Fetch profiles for direct chat users if not already in users state
        if (directChatUserIds.size > 0) {
          const userIdsToFetch = Array.from(directChatUserIds).filter(
            userId => !users.some(u => u.user_id === userId)
          );
          
          if (userIdsToFetch.length > 0) {
            const { data: profiles } = await supabase
              .from('users')
              .select('user_id, name, avatar_url, bio')
              .in('user_id', userIdsToFetch);
            
            if (profiles && profiles.length > 0) {
              // Add to users state if not already present
              setUsers(prev => {
                const existingIds = new Set(prev.map(u => u.user_id));
                const newUsers = profiles.filter(p => !existingIds.has(p.user_id));
                return [...prev, ...newUsers];
              });
            }
          }
        }
      }
      
      // Identify event-created group chats (parallel)
      const groupChats = sortedChats.filter(c => c.is_group_chat);
      const eventCreatedResults = groupChats.length > 0
        ? await Promise.all(groupChats.map(c => isEventCreatedGroupChat(c.id)))
        : [];
      const eventCreatedChatIds = new Set<string>();
      groupChats.forEach((chat, i) => {
        if (eventCreatedResults[i]) eventCreatedChatIds.add(chat.id);
      });
      setEventCreatedChats(eventCreatedChatIds);
      setLoading(false);
      return normalizedChats;
    } catch (error) {
      console.error('Error fetching chats:', error);
      setLoading(false);
      return null;
    }
  };

  const fetchUsers = async () => {
    try {
      console.log('🔍 Current user ID:', currentUserId);
      console.log('🔍 User ID type:', typeof currentUserId);
      
      // Use FriendsService to get friends (deduplicated)
      const friendsList = await FriendsService.getFriends(currentUserId);

      console.log('✅ Friends fetched successfully:', friendsList);
      console.log('✅ Number of friends:', friendsList.length);
      setUsers(friendsList);
    } catch (error) {
      console.error('Error fetching friends:', error);
      setUsers([]);
    }
  };

  const fetchMessages = async (chatId: string) => {
    try {
      setIsFetchingMessages(true);
      setLiveAnnouncement('Loading messages…');
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          chat_id,
          sender_id,
          content,
          is_encrypted,
          created_at,
          message_type,
          shared_event_id,
          shared_review_id,
          metadata
        `)
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        return;
      }

      const rawMessages = data || [];
      const messageIds = rawMessages.map(m => m.id);
      const senderIds = [...new Set(rawMessages.map(msg => msg.sender_id))];

      // event_shares and profiles in parallel
      const [eventSharesResult, profilesResult] = await Promise.all([
        messageIds.length > 0
          ? supabase
              .from('event_shares')
              .select('message_id, event_id')
              .eq('chat_id', chatId)
              .in('message_id', messageIds)
          : Promise.resolve({ data: [] }),
        senderIds.length > 0
          ? supabase.from('users').select('user_id, name, avatar_url').in('user_id', senderIds)
          : Promise.resolve({ data: [] })
      ]);

      const eventShares = eventSharesResult.data || [];
      const profiles = profilesResult.data || [];
      const eventIdByMessageId = new Map(
        eventShares.map((s: { message_id: string; event_id: string }) => [s.message_id, s.event_id])
      );

      // Decrypt encrypted messages and merge event_id from event_shares when missing
      const transformedMessages = await Promise.all(rawMessages.map(async (msg) => {
        const profile = profiles?.find(p => p.user_id === msg.sender_id);
        const fallbackEventId = eventIdByMessageId.get(msg.id);
        
        // Parse metadata if it's a string (JSONB can sometimes be returned as string)
        let parsedMetadata: any = {};
        if (msg.metadata) {
          if (typeof msg.metadata === 'string') {
            try {
              parsedMetadata = JSON.parse(msg.metadata);
            } catch (e) {
              console.warn('Failed to parse metadata as JSON:', e, msg.metadata);
              parsedMetadata = {};
            }
          } else {
            parsedMetadata = msg.metadata;
          }
        }
        
        
        const resolvedEventId = msg.shared_event_id ?? parsedMetadata?.event_id ?? fallbackEventId ?? null;
        const resolvedMetadata = {
          ...parsedMetadata,
          ...(resolvedEventId != null ? { event_id: resolvedEventId } : {})
        };
        
        // If message_type is 'event_share' but we don't have an event_id yet, try to get it from fallback
        const isEventShare = msg.message_type === 'event_share' || (resolvedEventId != null && !msg.message_type);
        
        // Decrypt message content if encrypted
        let decryptedContent = msg.content;
        if (msg.is_encrypted) {
          try {
            decryptedContent = await decryptChatMessage(
              { content: msg.content, chat_id: msg.chat_id, is_encrypted: msg.is_encrypted },
              currentUserId
            );
          } catch (error) {
            console.error('Error decrypting message:', error);
            decryptedContent = '[Unable to decrypt message]';
          }
        }
        
        return {
          id: msg.id,
          chat_id: msg.chat_id,
          sender_id: msg.sender_id,
          content: decryptedContent,
          is_encrypted: msg.is_encrypted,
          created_at: msg.created_at,
          sender_name: profile?.name || 'Unknown',
          sender_avatar: profile?.avatar_url || null,
          message_type: isEventShare ? 'event_share' : (msg.message_type || 'text'),
          shared_event_id: msg.shared_event_id ?? fallbackEventId ?? null,
          shared_review_id: msg.shared_review_id,
          metadata: resolvedMetadata
        };
      }));

      // Ensure message_type is assigned to the allowed union type
      setMessages(
        transformedMessages.map(msg => ({
          ...msg,
          message_type:
            msg.message_type === 'text' ||
            msg.message_type === 'event_share' ||
            msg.message_type === 'review_share' ||
            msg.message_type === 'system' ||
            msg.message_type === 'image'
              ? msg.message_type
              : 'text'
        }))
      );
      setDidLoadMessages(true);
      
      setLiveAnnouncement('Messages loaded.');
    } catch (error) {
      console.error('Error fetching messages:', error);
      setLiveAnnouncement('Failed to load messages.');
    } finally {
      setIsFetchingMessages(false);
    }
  };
  
  // Auto-scroll when messages change
  useEffect(() => {
    if (!selectedChat) return;
    if (messages.length === 0) return;
    scrollMessagesToBottom();
  }, [messages.length, selectedChat?.id, scrollMessagesToBottom]);

  // Polite announcements when new messages arrive
  useEffect(() => {
    if (!selectedChat) return;
    if (messages.length === 0) return;

    const last = messages[messages.length - 1];
    if (!last?.id) return;

    // Avoid announcing the same message repeatedly
    if (lastAnnouncedMessageIdRef.current === last.id) return;
    lastAnnouncedMessageIdRef.current = last.id;

    // Avoid announcing the user's own sent message (toast already covers it)
    if (last.sender_id === currentUserId) return;

    // Keep the announcement short to reduce verbosity
    const preview = (last.content || '').trim().slice(0, 80);
    setLiveAnnouncement(`${last.sender_name}: ${preview || 'New message'}`);
  }, [messages, selectedChat, currentUserId]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedChat) return;
    // Reset so the same file can be re-selected
    e.target.value = '';

    const MAX_MB = 8;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast({ title: 'File too large', description: `Images must be under ${MAX_MB}MB.`, variant: 'destructive' });
      return;
    }

    setIsUploadingImage(true);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const fileName = buildChatImageStoragePath(currentUserId, ext);
      const { data, error } = await supabase.storage
        .from('chat-images')
        .upload(fileName, file, { contentType: file.type, upsert: false });

      if (error || !data) {
        console.error('[chat] image upload:', error);
        toast({ title: 'Upload failed', description: 'Could not upload image. Please try again.', variant: 'destructive' });
        return;
      }

      // Security: Bucket is private — store path + short-lived signed URL in metadata.
      const { data: signedData, error: signError } = await supabase.storage
        .from('chat-images')
        .createSignedUrl(data.path, 60 * 60);

      if (signError || !signedData?.signedUrl) {
        console.error('[chat] signed URL:', signError);
        toast({ title: 'Upload failed', description: 'Could not finalize image upload.', variant: 'destructive' });
        return;
      }

      const { error: msgError } = await supabase.from('messages').insert({
        chat_id: selectedChat.id,
        sender_id: currentUserId,
        content: '[Image]',
        message_type: 'image',
        is_encrypted: false,
        metadata: { storage_path: data.path, image_url: signedData.signedUrl },
      });

      if (!msgError) {
        await supabase.from('chats').update({ updated_at: new Date().toISOString() }).eq('id', selectedChat.id);
        await fetchMessages(selectedChat.id);
      } else {
        console.error('[chat] insert image message:', msgError);
        toast({ title: 'Send failed', description: 'Could not send image. Please try again.', variant: 'destructive' });
      }
    } catch (err) {
      console.error('[chat] handleImageUpload:', err);
      toast({ title: 'Upload failed', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const sendMessage = async () => {
    // Track message send will be added after message is sent successfully
    if (!newMessage.trim() || !selectedChat) return;

    const messageText = newMessage.trim();
    setNewMessage('');

    try {
      // Encrypt and send message
      const { data, error } = await sendEncryptedMessage(
        selectedChat.id,
        currentUserId,
        messageText
      );

      if (error) {
        console.error('Error sending message:', error);
        // Restore message text on error
        setNewMessage(messageText);
        return;
      }

      // Real-time subscription will automatically update messages
      // But we can also manually refresh to ensure immediate update
      fetchMessages(selectedChat.id);
      // Also refresh chat list to update latest message immediately
      fetchChats();
      
      // Track message send
      try {
        const otherUserId = selectedChat.users?.find((id: string) => id !== currentUserId);
        trackInteraction.click('user', otherUserId || selectedChat.id, {
          action: 'send_message',
          message_length: messageText.length,
          is_group_chat: selectedChat.is_group_chat,
          source: 'chat'
        }, otherUserId || undefined);
      } catch (error) {
        console.error('Error tracking message send:', error);
      }
      
      } catch (error) {
      console.error('Error sending message:', error);
      // Restore message text on error
      setNewMessage(messageText);
      }
  };

  const createDirectChat = async (userId: string) => {
    try {
      // Validate inputs
      if (!currentUserId || !userId) {
        console.error('Missing user IDs:', { currentUserId, userId });
        return;
      }

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(currentUserId) || !uuidRegex.test(userId)) {
        console.error('Invalid UUID format:', { currentUserId, userId });
        return;
      }

      console.log('Creating direct chat between:', currentUserId, 'and', userId);
      
      // First check if this user is actually a friend
      const isFriend = users.some(user => user.user_id === userId);
      if (!isFriend) {
        return;
      }
      
      // Use the database function to create or get existing direct chat
      const { data: chatId, error } = await supabase.rpc('create_direct_chat', {
        user1_id: currentUserId,
        user2_id: userId
      });

      if (error) {
        console.error('❌ Error creating direct chat:', error);
        console.error('Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
          ...((error as any).status ? { status: (error as any).status } : {})
        });
        
        // Show more specific error message
        let errorMessage = "Failed to create chat. Please try again.";
        if (error.message) {
          if (error.message.includes('permission') || error.message.includes('policy')) {
            errorMessage = "Permission denied. Please check your account permissions.";
          } else if (error.message.includes('foreign key') || error.message.includes('constraint')) {
            errorMessage = "Invalid user information. Please try again.";
          } else {
            errorMessage = error.message;
          }
        }
        
        return;
      }

      // Refresh chats and open the created/existing chat
      const updatedChats = await fetchChats();
      setShowUserSearch(false);
      const createdChat = updatedChats?.find(c => c.id === chatId) || null;
      if (createdChat) {
        setSelectedChat(createdChat);
      } else {
        // If the list hasn't refreshed yet for any reason, at least force a refresh and keep UX moving.
        fetchChats();
      }
      
      } catch (error) {
      console.error('Error creating direct chat:', error);
      }
  };

  const createGroupChat = async (autoGeneratedName?: string): Promise<string | null> => {
    const groupNameToUse = groupName.trim() || autoGeneratedName || selectedUsers.map(u => u.name).join(', ');
    
    if (selectedUsers.length < 2) {
      return null;
    }

    // Validate all selected users are regular users (not artists/venues)
    const invalidUsers = selectedUsers.filter(user => 
      user.account_type && user.account_type !== 'user' && user.account_type !== 'admin'
    );
    if (invalidUsers.length > 0) {
      toast({
        title: 'Cannot create group chat',
        description: 'Only regular users can be added. Artists and venues cannot be in group chats.',
        variant: 'destructive',
      });
      return null;
    }

    try {
      const userIds = selectedUsers.map(user => user.user_id);
      
      const { data: chatId, error } = await supabase.rpc('create_group_chat', {
        chat_name: groupNameToUse,
        user_ids: userIds,
        admin_id: currentUserId
      });

      if (error) {
        console.error('Error creating group chat:', error);
        toast({
          title: 'Could not create group chat',
          description: error.message || 'Please try again.',
          variant: 'destructive',
        });
        return null;
      }

      setGroupName('');
      setSelectedUsers([]);
      setShowUserSearch(false);
      
      const updatedChats = await fetchChats();
      if (updatedChats && chatId) {
        const newChat = updatedChats.find(c => c.id === chatId);
        if (newChat) {
          setSelectedChat(newChat);
        }
      }
      
      return chatId;
      } catch (error) {
      console.error('Error creating group chat:', error);
      toast({
        title: 'Could not create group chat',
        description: 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
      return null;
      }
  };

  const addUserToGroup = (user: User) => {
    // Check if this user is actually a friend
    const isFriend = users.some(u => u.user_id === user.user_id);
    if (!isFriend) {
      return;
    }
    
    // When adding 2nd+ user (building a group), only regular users allowed - artists/venues can't be in groups
    const isBuildingGroup = selectedUsers.length >= 1;
    if (isBuildingGroup) {
      const canAddToGroup = !user.account_type || user.account_type === 'user' || user.account_type === 'admin';
      if (!canAddToGroup) {
        toast({
          title: 'Cannot add to group',
          description: 'Only regular users can be in group chats. Artists and venues cannot be added.',
          variant: 'destructive',
        });
        return;
      }
      // Validate existing selection - if first user is artist/venue, block adding more
      const hasInvalidExisting = selectedUsers.some(
        u => u.account_type && u.account_type !== 'user' && u.account_type !== 'admin'
      );
      if (hasInvalidExisting) {
        toast({
          title: 'Cannot add more friends',
          description: 'Artists and venues cannot be in group chats. Remove them first to create a group.',
          variant: 'destructive',
        });
        return;
      }
    }
    
    if (!selectedUsers.find(u => u.user_id === user.user_id)) {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const removeUserFromGroup = (userId: string) => {
    setSelectedUsers(selectedUsers.filter(u => u.user_id !== userId));
  };

  // Remove the clearAllMockChats function - we don't want mock chats

  const deleteChat = async (chatId: string) => {
    try {
      // Delete from database
      const { error } = await supabase
        .from('chats')
        .delete()
        .eq('id', chatId);

      if (error) {
        console.error('Error deleting chat:', error);
        return;
      }

      setChats(prev => prev.filter(chat => chat.id !== chatId));
      if (selectedChat?.id === chatId) {
        setSelectedChat(null);
        setMessages([]);
      }

      } catch (error) {
      console.error('Error deleting chat:', error);
      }
  };

  // Filter users by search. For group chats we validate account_type at create time.
  const filteredUsers = users.filter(user =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getOtherUserId = (chat: Chat) => {
    if (chat.is_group_chat) {
      return '';
    }

    const mappedUserId = chatToOtherUserMap.get(chat.id);
    if (mappedUserId) {
      return mappedUserId;
    }

    if (!Array.isArray(chat.users)) {
      return '';
    }

    return chat.users.find(id => id !== currentUserId) || '';
  };

  const getChatDisplayName = (chat: Chat) => {
    if (chat.is_group_chat) {
      const chatName = chat.chat_name || 'Group Chat';
      // Remove any " Group Chat" suffix that might have been added
      return chatName.replace(/\s+Group\s+Chat\s*$/, '');
    }

    // For direct chats, find the specific other user for this chat (Bug 1 fix)
    const otherUserId = getOtherUserId(chat);
    if (!otherUserId) {
      const raw = typeof chat.chat_name === 'string' ? chat.chat_name.trim() : '';
      if (raw && raw.toLowerCase() !== 'direct chat') return raw;
      return 'Unknown User';
    }

    const otherUser = users.find(u => u.user_id === otherUserId);
    return otherUser?.name || 'Unknown User';
  };

  // Check if a group chat is event-created by looking for event_groups relationship
  // NOTE: event_groups table does not exist in 3NF schema - return false immediately
  const isEventCreatedGroupChat = async (chatId: string): Promise<boolean> => {
    // event_groups table doesn't exist in 3NF schema - feature not available
    return false;
    
    // Disabled code - event_groups table removed in 3NF consolidation
    /*
    try {
      const { data, error } = await supabase
        .from('event_groups')
        .select('id')
        .eq('chat_id', chatId)
        .maybeSingle();
      
      // If we get a 406 or other error, just return false (not an event group)
      if (error) {
        // 406 Not Acceptable usually means RLS or table doesn't exist
        if (error.code === 'PGRST116' || error.code === '42P01') {
          return false;
        }
        console.warn('Error checking if chat is event-created:', error);
        return false;
      }
      
      return !!data;
    } catch (error) {
      // Silently fail - not an event group
      return false;
    }
    */
  };

  const getChatAvatar = (chat: Chat) => {
    if (chat.is_group_chat) {
      // For group chats, use event image if available (same logic as home feed)
      const imageUrl = chat.event_image_url;
      console.log('🔍 getChatAvatar for group chat:', {
        chatId: chat.id,
        chatName: chat.chat_name,
        event_image_url: imageUrl,
        entity_type: chat.entity_type,
        entity_uuid: chat.entity_uuid
      });
      return imageUrl || null;
    }
    
    // For direct chats, find the specific other user for this chat (Bug 1 fix)
    const otherUserId = getOtherUserId(chat);
    if (!otherUserId) {
      return null;
    }
    
    const otherUser = users.find(u => u.user_id === otherUserId);
    return otherUser?.avatar_url || null;
  };

  // Mark chat messages as read when chat is opened
  const markChatAsRead = async (chatId: string) => {
    try {
      // Use RPC function to update last_read_at (avoids RLS recursion issues)
      const { error } = await supabase
        .rpc('mark_chat_as_read', { p_chat_id: chatId });
      
      if (error) {
        console.error('Error updating last_read_at:', error);
        return;
      }

      // Update has_unread to false for this chat in local state
      setChats(prev => prev.map(chat => 
        chat.id === chatId ? { ...chat, has_unread: false, unread_count: 0 } : chat
      ));

      // Update iOS badge count after marking chat as read
      const { BadgeService } = await import('@/services/badgeService');
      await BadgeService.updateBadgeCount();
    } catch (error) {
      console.error('Error marking chat as read:', error);
    }
  };

  // Format timestamp to show "today", "yesterday", or date
  const formatChatTimestamp = (timestamp: string | null): string => {
    if (!timestamp) return '';
    
    const messageDate = parseISO(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const messageDateOnly = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());
    
    if (messageDateOnly.getTime() === today.getTime()) {
      // Today - show time only
      return format(messageDate, 'h:mm a');
    } else if (messageDateOnly.getTime() === yesterday.getTime()) {
      // Yesterday - show "Yesterday" and time
      return `Yesterday ${format(messageDate, 'h:mm a')}`;
    } else {
      // Older - show date and time
      const daysDiff = Math.floor((today.getTime() - messageDateOnly.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff < 7) {
        // Within a week - show day name and time
        return `${format(messageDate, 'EEEE')} ${format(messageDate, 'h:mm a')}`;
      } else {
        // Older - show date and time
        return format(messageDate, 'MMM d, h:mm a');
      }
    }
  };

  // Settings menu functions
  const fetchChatParticipants = async (chatId: string) => {
    try {
      // Use chat_participants table (3NF compliant) - fetch all participant fields
      const { data: participantData, error: participantsError } = await supabase
        .from('chat_participants')
        .select(`
          id,
          user_id,
          joined_at,
          last_read_at,
          is_admin,
          notifications_enabled,
          users!user_id(
            user_id,
            name,
            avatar_url,
            bio,
            account_type
          )
        `)
        .eq('chat_id', chatId)
        .order('joined_at', { ascending: true });

      if (participantsError) {
        console.error('Error fetching chat participants:', participantsError);
        return;
      }

      if (!participantData || participantData.length === 0) {
        setChatParticipants([]);
        return;
      }

      // Fetch verification status for all participants
      const userIds = participantData.map(p => p.user_id).filter(Boolean);
      const verificationMap = new Map<string, boolean>();
      
      if (userIds.length > 0) {
        const { data: verifications } = await supabase
          .from('user_verifications')
          .select('user_id, verified')
          .in('user_id', userIds);
        
        if (verifications) {
          verifications.forEach(v => {
            verificationMap.set(v.user_id, v.verified || false);
          });
        }
      }

      // Map participant data with user info
      const participantList = participantData
        .map(p => {
          const user = p.users as any;
          if (!user) return null;
          
          // Get verified status from verification map
          const verified = verificationMap.get(p.user_id) || false;

          return {
            id: p.id,
        user_id: p.user_id,
            name: user.name || 'Unknown User',
            avatar_url: user.avatar_url || null,
            bio: user.bio || null,
            verified: verified,
            account_type: user.account_type || null,
            joined_at: p.joined_at,
            last_read_at: p.last_read_at,
            is_admin: p.is_admin || false,
            notifications_enabled: p.notifications_enabled !== false
          };
        })
        .filter(Boolean);

      setChatParticipants(participantList);
    } catch (error) {
      console.error('Error fetching chat participants:', error);
    }
  };

  const fetchLinkedEvent = async (chatId: string) => {
    // NOTE: event_groups table does not exist in 3NF schema - feature not available
    // Check if chat has a shared_event_id in messages instead
    try {
      // Try to get event ID from messages table (for event shares)
      // Check both shared_event_id and metadata.event_id (fallback for FK constraint issues)
      const { data: messageData, error: messageError } = await supabase
        .from('messages')
        .select('shared_event_id, metadata')
        .eq('chat_id', chatId)
        .eq('message_type', 'event_share')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get event ID from shared_event_id or metadata fallback
      const eventId = messageData?.shared_event_id || (messageData?.metadata as any)?.event_id;

      if (!messageError && eventId) {
        // Fetch full event data from helper view to get normalized artist/venue names
        const { data: eventData, error: eventError } = await supabase
          .from('events_with_artist_venue')
          .select('id, title, event_date, images, artist_name_normalized, venue_name_normalized')
          .eq('id', eventId)
          .maybeSingle();

        if (!eventError && eventData) {
          // Map normalized column names for backward compatibility
          setLinkedEvent({
            ...eventData,
            artist_name: (eventData as any).artist_name_normalized,
            venue_name: (eventData as any).venue_name_normalized
          });
          return;
        }
      }
    } catch (error) {
      // Silently handle - event groups feature not available in 3NF schema
    }
    
    // Original event_groups query - disabled as table doesn't exist in 3NF
    /*
    try {
      const { data, error } = await supabase
        .from('event_groups')
        .select(`
          event_id,
          events!inner(
            id,
            title,
            artist_name,
            venue_name,
            event_date,
            poster_image_url
          )
        `)
        .eq('chat_id', chatId)
        .single();

      if (!error && data) {
        setLinkedEvent(data.events);
      }
    } catch (error) {
      console.error('Error fetching linked event:', error);
    }
    */
  };

  const handleViewUsers = () => {
    if (!selectedChat || !selectedChat.is_group_chat) return;
    // Fetch latest participants before showing modal
    fetchChatParticipants(selectedChat.id);
    setShowUsersModal(true);
  };

  const handleViewProfile = (userId: string) => {
    // Navigate to user's profile using custom event (same pattern as ChatView)
    const event = new CustomEvent('open-user-profile', {
      detail: { userId }
    });
    window.dispatchEvent(event);
  };

  const handleBlockUser = (userId: string) => {
    // TODO: Implement block user
    };

  const handleMuteNotifications = () => {
    setIsMuted(!isMuted);
    };

  const handleViewEvent = () => {
    if (linkedEvent) {
      setSelectedEvent(linkedEvent);
      setEventDetailsOpen(true);
    }
  };

  const handleHeaderIdentityClick = () => {
    if (!selectedChat) return;

    // Direct chat → user's profile
    if (!selectedChat.is_group_chat) {
      const otherUserId = getOtherUserId(selectedChat);
      if (otherUserId) {
        handleViewProfile(otherUserId);
      }
      return;
    }

    // Group chats → route based on verified entity type
    if (selectedChat.entity_type === 'event') {
      const eventId = selectedChat.entity_uuid || selectedChat.entity_id || undefined;
      if (eventId) {
        // Use MainApp listener to open event details modal
        window.dispatchEvent(new CustomEvent('open-event-details', { detail: { eventId } }));
        setSelectedChat(null);
        window.scrollTo(0, 0);
        return;
      }
      // Fallback to linked event if we have it
      handleViewEvent();
      return;
    }

    if (selectedChat.entity_type === 'artist') {
      const artistId = selectedChat.entity_uuid || selectedChat.entity_id || undefined;
      if (artistId) {
        // UnifiedFeed listens on document for this event and navigates to /artist/:id
        document.dispatchEvent(new CustomEvent('open-artist-card', {
          detail: { artistId, artistName: selectedChat.chat_name || getChatDisplayName(selectedChat) }
        }));
        setSelectedChat(null);
        window.scrollTo(0, 0);
      }
    }
  };

  const showChatHeader = !hideHeader && !eventDetailsOpen && !showReviewDetailModal;
  const chatHeader = showChatHeader ? (
    <MobileHeader
      menuOpen={menuOpen}
      onMenuClick={onMenuClick}
      rightIcon={selectedChat ? "moreVertical" : undefined}
      onRightIconClick={selectedChat ? () => setShowSettingsMenu(true) : undefined}
      alignLeft={true}
    >
      {selectedChat ? (
        <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
          <button
            onClick={() => {
              setSelectedChat(null);
              window.scrollTo(0, 0);
            }}
            className="w-6 h-6 flex items-center justify-center cursor-pointer synth-focus rounded"
            style={{ padding: 0, margin: 0, background: 'none', border: 'none' }}
            type="button"
            aria-label="Back to chats"
          >
            <ArrowLeft className="w-6 h-6" style={{ color: 'var(--neutral-900)' }} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={handleHeaderIdentityClick}
            className="flex items-center min-w-0 synth-focus rounded"
            style={{
              gap: 'var(--spacing-inline, 6px)',
              padding: 0,
              margin: 0,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            aria-label={selectedChat.is_group_chat ? 'Open chat info' : 'Open user profile'}
          >
            <Avatar className="w-8 h-8 flex-shrink-0">
              <AvatarImage
                src={getChatAvatar(selectedChat) || undefined}
                alt={
                  selectedChat.is_group_chat
                    ? `${getChatDisplayName(selectedChat)} group chat avatar`
                    : `${getChatDisplayName(selectedChat)}'s profile picture`
                }
              />
              <AvatarFallback className="font-medium text-base" style={{ backgroundImage: 'var(--gradient-brand)', color: 'var(--neutral-50)' }}>
                {selectedChat.is_group_chat ? (
                  <Users className="w-5 h-5" />
                ) : (
                  getChatDisplayName(selectedChat).split(' ').map((n) => n[0]).join('')
                )}
              </AvatarFallback>
            </Avatar>
            <h2
              className="font-bold text-[24px] leading-[normal]"
              style={{
                color: 'var(--neutral-900)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                lineHeight: 'normal',
                maxHeight: 'calc(2 * 1.3em)',
              }}
            >
              {getChatDisplayName(selectedChat)}
            </h2>
          </button>
        </div>
      ) : (
        <h1
          style={{
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--typography-h2-size, 24px)',
            fontWeight: 'var(--typography-h2-weight, 700)',
            color: 'var(--neutral-900)',
          }}
        >
          {`Messages${unreadMessagesCount > 0 ? ` (${unreadMessagesCount})` : ''}`}
        </h1>
      )}
    </MobileHeader>
  ) : undefined;

  const handleSaveGroupName = async () => {
    if (!editedGroupName.trim() || !selectedChat) return;
    
    const { error } = await supabase
      .from('chats')
      .update({ chat_name: editedGroupName.trim() })
      .eq('id', selectedChat.id);
    
    if (error) {
      return;
    }
    
    setIsEditingGroupName(false);
    fetchChats(); // Refresh to show new name
    };

  const requestDeleteChat = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!selectedChat) return;
    setChatPendingDeletion(selectedChat);
    // Close the dropdown menu first
    setShowSettingsMenu(false);
    // Small delay to ensure dropdown closes before dialog opens
    setTimeout(() => {
      setIsDeleteChatModalOpen(true);
    }, 100);
  };

  const confirmDeleteChat = async () => {
    const chatToDelete = chatPendingDeletion ?? selectedChat;
    if (!chatToDelete) return;
    
    try {
      const { error } = await supabase
        .from('chats')
        .delete()
        .eq('id', chatToDelete.id);
      
      if (error) {
        console.error('Error deleting chat:', error);
        return;
      }
      
      // Close the chat and refresh list, then navigate back to messages
      setSelectedChat(null);
      closeDeleteChatModal();
      fetchChats();
      
      } catch (error) {
      console.error('Error deleting chat:', error);
      }
  };

  const renderGroupedMessages = () => {
    // Group consecutive messages from the same sender
    const messageGroups: Array<Array<typeof messages[0]>> = [];
    let currentGroup: Array<typeof messages[0]> = [];

    messages.forEach((message, index) => {
      const prevMessage = index > 0 ? messages[index - 1] : null;

      if (
        prevMessage &&
        prevMessage.sender_id === message.sender_id &&
        prevMessage.message_type === message.message_type &&
        (message.message_type === 'text' ||
          message.message_type === 'event_share' ||
          message.message_type === 'review_share')
      ) {
        currentGroup.push(message);
      } else {
        if (currentGroup.length > 0) {
          messageGroups.push(currentGroup);
        }
        currentGroup = [message];
      }
    });

    if (currentGroup.length > 0) {
      messageGroups.push(currentGroup);
    }

    // Determine session breaks (30 minute gaps or screen load)
    const sessions: Array<Array<typeof messageGroups[0]>> = [];
    let currentSession: Array<typeof messageGroups[0]> = [];

    messageGroups.forEach((group, groupIndex) => {
      const firstMessage = group[0];
      const prevGroup = groupIndex > 0 ? messageGroups[groupIndex - 1] : null;
      const prevLastMessage = prevGroup ? prevGroup[prevGroup.length - 1] : null;

      if (prevLastMessage) {
        const timeDiff = differenceInMinutes(
          parseISO(firstMessage.created_at),
          parseISO(prevLastMessage.created_at)
        );

        if (timeDiff >= 30) {
          if (currentSession.length > 0) {
            sessions.push(currentSession);
          }
          currentSession = [group];
        } else {
          currentSession.push(group);
        }
      } else {
        currentSession.push(group);
      }
    });

    if (currentSession.length > 0) {
      sessions.push(currentSession);
    }

    return sessions.map((session, sessionIndex) => {
      const firstGroupInSession = session[0];
      const firstMessageInSession = firstGroupInSession[0];
      const sessionDate = parseISO(firstMessageInSession.created_at);
      const now = new Date();
      const weekAgo = subDays(now, 7);
      const isWithinWeek = isWithinInterval(sessionDate, { start: weekAgo, end: now });

      return (
        <div key={`session-${sessionIndex}`} className="flex flex-col">
          {/* Session timestamp */}
          <div
            className="flex justify-center w-full"
            style={{
              marginTop: sessionIndex > 0 ? 'var(--spacing-grouped, 24px)' : 0,
              marginBottom: 'var(--spacing-grouped, 24px)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                color: 'var(--neutral-600)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)'
              }}
            >
              {isWithinWeek ? (
                <>
                  {format(sessionDate, 'EEEE')} at {format(sessionDate, 'h:mm a')}
                </>
              ) : (
                <>
                  {format(sessionDate, 'MMM d')} at {format(sessionDate, 'h:mm a')}
                </>
              )}
            </p>
          </div>

          {/* Message groups in session */}
          {session.map((group, groupIndex) => {
            const firstMessage = group[0];
            const prevGroup = groupIndex > 0 ? session[groupIndex - 1] : null;
            const prevMessage = prevGroup ? prevGroup[prevGroup.length - 1] : null;
            const showSenderInfo =
              selectedChat?.is_group_chat &&
              firstMessage.sender_id !== currentUserId &&
              (prevMessage === null ||
                prevMessage.sender_id !== firstMessage.sender_id ||
                (prevMessage.message_type !== 'text' &&
                  prevMessage.message_type !== 'review_share' &&
                  prevMessage.message_type !== 'event_share' &&
                  prevMessage.message_type !== 'image'));

            const isSent = firstMessage.sender_id === currentUserId;

            return (
              <div
                key={`group-${sessionIndex}-${groupIndex}`}
                className="flex flex-col"
                style={{
                  alignItems: isSent ? 'flex-end' : 'flex-start',
                  marginTop: prevGroup ? 'var(--spacing-grouped, 24px)' : '0'
                }}
              >
                {/* Group chat user info (6px above first bubble) */}
                {showSenderInfo && (
                  <div style={{ marginBottom: 'var(--spacing-inline, 6px)' }}>
                    <UserInfo
                      variant="chat"
                      name={firstMessage.sender_name}
                      initial={firstMessage.sender_name.split(' ').map(n => n[0]).join('').substring(0, 1)}
                      imageUrl={firstMessage.sender_avatar || null}
                    />
                  </div>
                )}

                {/* Messages in group */}
                <div className="flex flex-col" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                  {group.map((message, msgIndex) => {
                    const isLastInGroup = msgIndex === group.length - 1;

                    return (
                      <div
                        key={message.id}
                        className="flex flex-col"
                        style={{ gap: isLastInGroup ? 'var(--spacing-small, 12px)' : '0' }}
                      >
                        {/* Determine what to render: review card, event card, or text - mutually exclusive */}
                        {(() => {
                          // Priority 0: Image message
                          const inlineImageUrl = message.metadata?.image_url as string | undefined;
                          const inlineStoragePath = message.metadata?.storage_path as string | undefined;
                          if (message.message_type === 'image' && (inlineImageUrl || inlineStoragePath)) {
                            return (
                              <ChatImageMessage
                                imageUrl={inlineImageUrl}
                                storagePath={inlineStoragePath}
                                alignSelf={isSent ? 'flex-end' : 'flex-start'}
                              />
                            );
                          }

                          // Priority 1: Review share
                          if (message.message_type === 'review_share' && (message.shared_review_id || message.metadata?.review_id)) {
                            return (
                              <ChatReviewMessage
                                reviewId={message.shared_review_id || message.metadata?.review_id}
                                onReviewClick={handleReviewClick}
                                currentUserId={currentUserId}
                                metadata={message.metadata}
                              />
                            );
                          }
                          
                          // Priority 2: Event share - check message_type FIRST, then event_id
                          const eventId = message.shared_event_id || (message.metadata as any)?.event_id;
                          const isEventShare = message.message_type === 'event_share' || !!eventId;
                          
                          if (isEventShare && eventId) {
                            return (
                              <div style={{ width: 300 }}>
                                <EventMessageCard
                                  eventId={eventId}
                                  customMessage={message.metadata?.custom_message}
                                  onEventClick={handleEventClick}
                                  onInterestToggle={handleInterestToggle}
                                  onAttendanceToggle={handleAttendanceToggle}
                                  currentUserId={currentUserId}
                                  refreshTrigger={refreshTrigger}
                                />
                              </div>
                            );
                          }
                          
                          // Priority 3: Text content (only if not review or event share)
                          return (
                            <div
                              style={{
                                display: 'inline-block',
                                width: 'fit-content',
                                alignSelf: isSent ? 'flex-end' : 'flex-start',
                                maxWidth: 'min(340px, 72%)',
                                padding: 'var(--spacing-small, 12px)',
                                borderRadius: 'var(--radius-corner, 10px)',
                                border: message.sender_id === currentUserId ? 'none' : '1px solid var(--neutral-200)',
                                backgroundColor: message.sender_id === currentUserId ? 'var(--brand-pink-500)' : 'var(--neutral-100)',
                                overflowWrap: 'anywhere',
                                wordWrap: 'break-word',
                                whiteSpace: 'pre-wrap'
                              }}
                            >
                              <p
                                style={{
                                  fontFamily: 'var(--font-family)',
                                  fontSize: '14px',
                                  fontWeight: 'var(--typography-body-weight, 500)',
                                  lineHeight: 1.4,
                                  margin: 0,
                                  color: message.sender_id === currentUserId ? 'var(--neutral-50)' : 'var(--neutral-900)'
                                }}
                              >
                                {message.content}
                              </p>
                            </div>
                          );
                        })()}

                        {/* Timestamp (only on last message in group) */}
                        {isLastInGroup && (
                          <p
                            style={{
                              fontFamily: 'var(--font-family)',
                              fontSize: '12px',
                              fontWeight: 'var(--typography-meta-weight, 500)',
                              color: 'var(--neutral-600)',
                              lineHeight: 1.3,
                              textAlign: isSent ? 'right' : 'left',
                              margin: 0
                            }}
                          >
                            {format(parseISO(message.created_at), 'h:mm a')}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      );
    });
  };

  if (loading) {
    return (
      <div aria-busy="true" aria-live="polite">
        <div role="status" className="sr-only">Loading messages…</div>
        <SynthLoadingScreen text="Loading messages..." />
      </div>
    );
  }

  return (
    <PageShell
      header={chatHeader}
      includeBottomNavPadding={false}
      contentHorizontalPadding={false}
      contentPaddingTop={selectedChat ? '0px' : undefined}
      contentStyle={
        selectedChat
          ? {
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              paddingBottom: 0,
              overflowY: 'hidden',
            }
          : undefined
      }
    >
      <div
        className="flex w-full flex-1 min-h-0"
        style={{ backgroundColor: 'var(--neutral-50)' }}
      >
      {/* Settings Menu Dropdown - Positioned relative to header */}
      {selectedChat && (
        <DropdownMenu open={showSettingsMenu} onOpenChange={setShowSettingsMenu}>
          <DropdownMenuTrigger asChild>
            <button
              style={{
                position: 'fixed',
                top: 'calc(var(--onboarding-banner-height, 0px) + env(safe-area-inset-top, 0px) + 12px)',
                right: 'var(--spacing-screen-margin-x, 20px)',
                width: 'var(--size-input-height, 44px)',
                height: 'var(--size-input-height, 44px)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                zIndex: 41
              }}
              aria-label="More options"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" style={{ zIndex: 50 }}>
            {selectedChat.is_group_chat && (
              <DropdownMenuItem onClick={handleViewUsers}>
                <Users className="mr-2 h-4 w-4" />
                <span>View Users</span>
              </DropdownMenuItem>
            )}
            
            {!selectedChat.is_group_chat && (
              <>
                <DropdownMenuItem onClick={() => handleViewProfile(getOtherUserId(selectedChat))}>
                  <User className="mr-2 h-4 w-4" />
                  <span>View Profile</span>
                </DropdownMenuItem>
                
                <DropdownMenuItem onClick={() => handleBlockUser(getOtherUserId(selectedChat))}>
                  <UserX className="mr-2 h-4 w-4" />
                  <span>Block User</span>
                </DropdownMenuItem>
              </>
            )}
            
            <DropdownMenuItem onClick={handleMuteNotifications}>
              {isMuted ? (
                <Bell className="mr-2 h-4 w-4" />
              ) : (
                <BellOff className="mr-2 h-4 w-4" />
              )}
              <span>{isMuted ? 'Unmute Notifications' : 'Mute Notifications'}</span>
            </DropdownMenuItem>
            
            {selectedChat.is_group_chat && linkedEvent && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleViewEvent}>
                  <Calendar className="mr-2 h-4 w-4" />
                  <span>View Event</span>
                </DropdownMenuItem>
              </>
            )}
            
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onSelect={(e) => {
                e.preventDefault();
                requestDeleteChat();
              }}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span>Delete Chat</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      
      {/* Left Sidebar - Chat List (always mounted; hidden on mobile when a chat is open) */}
      <div
        className="flex flex-col flex-shrink-0 min-h-0"
        style={{
          width: selectedChat ? undefined : '100%',
          display: selectedChat ? 'none' : 'flex',
          borderRight: '1px solid var(--neutral-200)',
        }}
        // On ≥768px show as a fixed-width sidebar alongside the thread
        // We use an inline media-query workaround via a companion style tag below
        id="chat-list-panel"
      >
        {/* Content area - 12px below header */}
          <div className="flex-shrink-0" style={{ paddingLeft: 'var(--spacing-screen-margin-x, 20px)', paddingRight: 'var(--spacing-screen-margin-x, 20px)', paddingTop: 'var(--spacing-small, 12px)', paddingBottom: 0 }}>
          
          {/* New Chat Button - opens unified modal for direct or group chat */}
            <SynthButton
              variant="primary"
              size="standard"
              fullWidth
              icon="plus"
              iconPosition="right"
              onClick={(e) => {
                e.preventDefault();
                setShowUserSearch(true);
                setSelectedUsers([]);
                setGroupName('');
                setSearchQuery('');
              }}
            >
              New Chat
            </SynthButton>
        </div>

        {/* Chat List */}
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-full" style={{ gap: 'var(--spacing-big-section, 60px)', padding: 'var(--spacing-small, 12px)', paddingBottom: 'calc(var(--spacing-bottom-nav, 32px) + env(safe-area-inset-bottom, 0px))' }}>
              {/* New Chat Button - Already in header, but shown in empty state per Figma */}

              {/* Empty State Content */}
              <div className="flex flex-col items-center justify-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                {/* Chat Bubble Icon - Large icon (60px), dark grey */}
                <MessageCircle size={60} strokeWidth={2} style={{ color: chatFetchError ? 'var(--status-error-500)' : 'var(--neutral-600)' }} />

                {/* Heading */}
                <h2 style={{
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-body-size, 20px)',
                  fontWeight: 'var(--typography-body-weight, 500)',
                  lineHeight: 'var(--typography-body-line-height, 1.5)',
                  color: 'var(--neutral-900)',
                  margin: 0,
                  textAlign: 'center'
                }}>
                  {chatFetchError ? 'Could not load conversations' : 'No Conversations Yet'}
                </h2>

                {/* Subtitle */}
                <p style={{
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  color: 'var(--neutral-600)',
                  margin: 0,
                  textAlign: 'center'
                }}>
                  {chatFetchError ? 'There was a problem loading your chats. Please try again.' : 'Start chatting with your friends!'}
                </p>
              </div>
              
              {/* Instructions Box */}
              <div
                className="swift-ui-card rounded-[12px] p-3 min-h-[110px] flex items-center justify-center"
                style={{
                  width: '100%',
                  backgroundColor: 'var(--neutral-200) !important',
                  border: '3px solid var(--overlay-20) !important'
                }}
              >
                <div className="swift-ui-card-content">
                  <ul className="list-disc space-y-0 ml-6" style={{ color: 'var(--neutral-900)' }}>
                    <li className="mb-0">
                      <span style={{ 
                        fontFamily: 'var(--font-family)',
                        color: 'var(--neutral-900)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)'
                      }}>Send friend requests first</span>
                    </li>
                    <li className="mb-0">
                      <span style={{ 
                        fontFamily: 'var(--font-family)',
                        color: 'var(--neutral-900)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)'
                      }}>Wait for them to accept</span>
                    </li>
                    <li>
                      <span style={{ 
                        fontFamily: 'var(--font-family)',
                        color: 'var(--neutral-900)',
                        fontSize: 'var(--typography-meta-size, 16px)',
                        fontWeight: 'var(--typography-meta-weight, 500)',
                        lineHeight: 'var(--typography-meta-line-height, 1.5)'
                      }}>Then start chatting!</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto" style={{ paddingTop: 0, paddingBottom: 'calc(var(--spacing-bottom-nav, 32px) + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column' }}>
              {chats.map((chat, index) => (
                <div
                  key={chat.id}
                  className="cursor-pointer transition-colors"
                  style={{
                    padding: 'var(--spacing-grouped, 24px)',
                    paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
                    paddingRight: 'var(--spacing-screen-margin-x, 20px)',
                    borderBottom: index < chats.length - 1 ? '1px solid var(--neutral-200)' : 'none',
                    backgroundColor: selectedChat?.id === chat.id ? 'var(--neutral-100)' : 'transparent'
                  }}
                  onClick={() => {
                    // Track chat open
                    try {
                      const otherUserId = chat.users?.find((id: string) => id !== currentUserId);
                      trackInteraction.click('user', otherUserId || chat.id, {
                        action: 'open_chat',
                        is_group_chat: chat.is_group_chat,
                        source: 'chat_list'
                      }, otherUserId || undefined);
                    } catch (error) {
                      console.error('Error tracking chat open:', error);
                    }
                    setSelectedChat(chat);
                  }}
                  onMouseEnter={(e) => {
                    if (selectedChat?.id !== chat.id) {
                      e.currentTarget.style.backgroundColor = 'var(--neutral-100)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedChat?.id !== chat.id) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                    }
                  }}
                >
                    <div className="flex items-center gap-3">
                      {/* Unread indicator - pink dot on far left, vertically centered */}
                    {chat.has_unread ? (
                      <div className="w-3 h-3 rounded-full flex-shrink-0 animate-pulse" style={{ backgroundColor: 'var(--brand-pink-500)' }} />
                      ) : (
                        <div className="w-3 flex-shrink-0" />
                      )}
                      <div 
                        className="flex-1 flex items-center gap-4 cursor-pointer min-w-0"
                    >
                      <Avatar className="w-12 h-12 flex-shrink-0">
                          <AvatarImage 
                            src={getChatAvatar(chat) || undefined} 
                            alt={chat.is_group_chat 
                              ? `${getChatDisplayName(chat)} group chat avatar`
                              : `${getChatDisplayName(chat)}'s profile picture`} 
                          />
                        <AvatarFallback className="font-medium" style={{ backgroundImage: 'var(--gradient-brand)', color: 'var(--neutral-50)' }}>
                            {chat.is_group_chat ? (
                              <Users className="w-6 h-6" />
                            ) : (
                              getChatDisplayName(chat).split(' ').map(n => n[0]).join('')
                            )}
                          </AvatarFallback>
                      </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="mb-1">
                          <h3 className="font-semibold" style={{ 
                            fontFamily: 'var(--font-family)',
                            fontSize: 'var(--typography-body-size, 20px)',
                            fontWeight: 'var(--typography-body-weight, 500)',
                            lineHeight: 'var(--typography-body-line-height, 1.5)',
                            color: 'var(--neutral-900)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            wordBreak: 'break-word'
                          }}>
                              {getChatDisplayName(chat)}
                            </h3>
                          </div>
                        <p className="text-sm mb-1" style={{ 
                          fontFamily: 'var(--font-family)',
                          fontSize: 'var(--typography-meta-size, 16px)',
                          fontWeight: 'var(--typography-meta-weight, 500)',
                          lineHeight: 'var(--typography-meta-line-height, 1.5)',
                          color: 'var(--neutral-600)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          wordBreak: 'break-word'
                        }}>
                            {chat.latest_message || 'No messages yet'}
                          </p>
                          {chat.is_group_chat && chat.is_verified && (
                            <div className="flex items-center gap-2 mt-2">
                                <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
                                  <Shield className="w-3 h-3 mr-1" />
                                  Verified {chat.entity_type ? chat.entity_type.charAt(0).toUpperCase() + chat.entity_type.slice(1) : 'Chat'}
                                </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Do not delete immediately — open confirmation modal
                          setChatPendingDeletion(chat);
                          setIsDeleteChatModalOpen(true);
                        }}
                      className="hover:text-red-500 hover:bg-red-50 p-2 flex-shrink-0 rounded-lg transition-all duration-200" 
                      style={{ color: 'var(--neutral-600)' }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Right Side - Messages (always mounted on desktop; hidden on mobile when no chat selected) */}
      <div
        className="flex flex-col flex-1 min-h-0"
        id="chat-thread-panel"
        style={{
          display: selectedChat ? 'flex' : 'none',
          backgroundColor: 'var(--neutral-50)',
          overflow: 'hidden',
        }}
        onTouchStart={handleChatTouchStart}
        onTouchMove={handleChatTouchMove}
        onTouchEnd={handleChatTouchEnd}
        onTouchCancel={handleChatTouchCancel}
      >{selectedChat ? (
          <>
            {/* Messages */}
              <div
                ref={messagesScrollRef}
                className="overflow-y-auto"
                aria-busy={isFetchingMessages}
                aria-label="Chat messages"
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 0,
                  minHeight: 0,
                  width: '100%',
                  paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
                  paddingRight: 'var(--spacing-screen-margin-x, 20px)',
                  paddingTop: 'var(--spacing-small, 12px)',
                  paddingBottom: 'var(--spacing-small, 12px)',
                }}
              >
              <div className="sr-only" aria-live="polite" aria-atomic="true">{liveAnnouncement}</div>
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                  {/* Large icon (60px), dark grey */}
                  <MessageCircle size={60} strokeWidth={2} style={{ color: 'var(--neutral-600)' }} />
                  {/* Heading - Body typography, off black */}
                  <p style={{ 
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-body-size, 20px)',
                    fontWeight: 'var(--typography-body-weight, 500)',
                    lineHeight: 'var(--typography-body-line-height, 1.5)',
                    color: 'var(--neutral-900)',
                    margin: 0,
                    textAlign: 'center'
                  }}>No Messages Yet</p>
                  {/* Description - Meta typography, dark grey */}
                  <p style={{ 
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    color: 'var(--neutral-600)',
                    margin: 0,
                    textAlign: 'center'
                  }}>Start the conversation!</p>
                </div>
              ) : (
                  <div
                    className="flex flex-col"
                    role="log"
                    aria-live="polite"
                    aria-relevant="additions text"
                    aria-atomic="false"
                    style={{ paddingTop: 'var(--spacing-grouped, 24px)', paddingBottom: 0 }}
                  >
                {renderGroupedMessages()}
                <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message Input */}
            <div 
            style={{
              flexShrink: 0,
              paddingTop: 'var(--spacing-small, 12px)',
              paddingBottom: 'calc(var(--spacing-small, 12px) + env(safe-area-inset-bottom, 0px))',
              backgroundColor: 'var(--neutral-50)',
              borderTop: '1px solid var(--neutral-200)',
              }}
              >
                <div
                  style={{
                    paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
                    paddingRight: 'var(--spacing-screen-margin-x, 20px)'
                  }}
                >
                  {/* Hidden image file input */}
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp,image/heic"
                    style={{ display: 'none' }}
                    onChange={handleImageUpload}
                  />
                  <style>{`
                    #chat-message-input-container {
                      border-color: rgba(236, 72, 153, 0.2) !important;
                      border-width: 2px !important;
                    }
                    #chat-message-input {
                      outline: none !important;
                      box-shadow: none !important;
                      border: none !important;
                      height: 44px !important;
                      min-height: 44px !important;
                      max-height: 44px !important;
                    }
                    #chat-message-input:focus {
                      outline: none !important;
                      box-shadow: none !important;
                      border: none !important;
                      height: 44px !important;
                      min-height: 44px !important;
                      max-height: 44px !important;
                    }
                  `}</style>
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                  >
                  {/* Image attach button */}
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isUploadingImage}
                    aria-label="Attach image"
                    style={{
                      flexShrink: 0,
                      width: 40,
                      height: 40,
                      borderRadius: '10px',
                      border: '1.5px solid var(--neutral-200)',
                      background: 'var(--neutral-50)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: isUploadingImage ? 'default' : 'pointer',
                      opacity: isUploadingImage ? 0.6 : 1,
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!isUploadingImage) e.currentTarget.style.background = 'var(--neutral-100)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--neutral-50)'; }}
                  >
                    {isUploadingImage
                      ? <Loader2 size={18} className="animate-spin" style={{ color: 'var(--brand-pink-500)' }} />
                      : <Images size={18} style={{ color: 'var(--neutral-600)' }} />
                    }
                  </button>

                  <div
                    id="chat-message-input-container"
                    className="border-2 rounded-[10px] flex items-center justify-between h-[44px] pl-5 pr-[1px] flex-1"
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.9)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      borderColor: 'rgba(236, 72, 153, 0.2)',
                      borderWidth: '2px',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)'
                    }}
                  >
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    className="bg-transparent border-0 flex-1 text-[16px] px-0"
                    style={{ 
                      color: 'var(--neutral-900)',
                      height: '44px',
                      minHeight: '44px',
                      maxHeight: '44px',
                      outline: 'none',
                      boxShadow: 'none'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.outline = 'none';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                    id="chat-message-input"
                    aria-label="Type a message"
                    aria-describedby="chat-send-button"
                  />
                  <Button 
                    onClick={sendMessage} 
                    disabled={!newMessage.trim()}
                    className="h-[44px] w-[44px] p-0 rounded-br-[10px] rounded-tr-[10px] rounded-bl-0 rounded-tl-0 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0" 
                    style={{ 
                      backgroundColor: 'var(--brand-pink-500)', 
                      color: 'var(--neutral-50)'
                    }}
                    onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-pink-500)'; }}
                    id="chat-send-button"
                    aria-label="Send message"
                    aria-describedby={!newMessage.trim() ? "chat-send-disabled-hint" : undefined}
                  >
                    <Send className="w-[22px] h-[22px]" style={{ color: 'var(--neutral-50)' }} aria-hidden="true" />
                  </Button>
                  {!newMessage.trim() && (
                    <span id="chat-send-disabled-hint" className="sr-only">Message input is empty</span>
                  )}
                  </div>
                  </div>{/* end flex row (image btn + input) */}
                </div>
              </div>
          </>
        ) : (
          /* Desktop empty state when no chat is selected */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '12px', color: 'var(--neutral-500)' }}>
            <MessageCircle size={48} strokeWidth={1.5} style={{ color: 'var(--neutral-300)' }} />
            <p style={{ fontFamily: 'var(--font-family)', fontSize: '16px', fontWeight: 500, margin: 0, color: 'var(--neutral-500)' }}>
              Select a chat to start messaging
            </p>
          </div>
        )}
      </div>

      {/* Responsive sidebar CSS */}
      <style>{`
        @media (min-width: 640px) {
          #chat-list-panel {
            display: flex !important;
            width: 340px !important;
            flex-shrink: 0 !important;
          }
          #chat-thread-panel {
            display: flex !important;
            max-width: 780px !important;
          }
        }
        @media (min-width: 1024px) {
          #chat-list-panel {
            width: 380px !important;
          }
        }
      `}</style>

      {/* User Search Modal - Direct Message Selection */}
      {showUserSearch && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999] p-4" style={{ backgroundColor: 'var(--overlay-50)' }}>
          <div className="border rounded-2xl flex flex-col p-5 relative max-h-[85vh] w-full max-w-lg" style={{ backgroundColor: 'var(--neutral-50)', borderColor: 'var(--neutral-200)', boxShadow: '0px 4px 4px 0px var(--shadow-color)' }}>
            {/* Close Button */}
            <button
                  onClick={() => {
                    setShowUserSearch(false);
                    setSelectedUsers([]);
                    setSearchQuery('');
                  }}
              className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center cursor-pointer rounded transition-colors synth-focus"
              style={{ color: 'var(--neutral-900)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--neutral-100)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              type="button"
              aria-label="Close dialog"
                >
              <X className="w-5 h-5" style={{ color: 'var(--neutral-900)' }} aria-hidden="true" />
            </button>
            
            {/* Main Content - min-h-0 needed so friends list can shrink/scroll within max-h-[85vh] modal */}
            <div className="flex flex-col flex-1 min-h-0 gap-3 w-full">
              {/* Title */}
              <h2 className="font-bold text-[20px] leading-[normal]" style={{ color: 'var(--neutral-900)' }}>
                New Chat
              </h2>
              
              <SearchBar
                placeholder="Search friends..."
                value={searchQuery}
                onChange={(value) => setSearchQuery(value)}
                widthVariant="full"
              />

              {selectedUsers.length >= 2 && (
                <div>
                  <label htmlFor="group-name-unified" className="block text-sm font-medium mb-2" style={{ color: 'var(--neutral-900)' }}>
                    Group name (optional)
                  </label>
                  <Input
                    id="group-name-unified"
                    type="text"
                    placeholder="Enter group name..."
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full"
                    style={{ backgroundColor: 'var(--neutral-50)', borderColor: 'var(--neutral-200)', color: 'var(--neutral-900)' }}
                  />
                </div>
              )}

              {/* Friends List */}
              <div className="flex flex-col flex-1 min-h-0 overflow-y-auto" style={{ gap: 'var(--spacing-small, 12px)' }}>
              {filteredUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center" style={{ gap: 'var(--spacing-inline, 6px)', paddingTop: 'var(--spacing-grouped, 24px)', paddingBottom: 'var(--spacing-grouped, 24px)' }}>
                    {/* Large icon (60px), dark grey */}
                    <Users className="w-[60px] h-[60px] mx-auto" style={{ color: 'var(--neutral-600)' }} />
                    {/* Heading - Body typography, off black */}
                    <p style={{ 
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-body-size, 20px)',
                      fontWeight: 'var(--typography-body-weight, 500)',
                      lineHeight: 'var(--typography-body-line-height, 1.5)',
                      color: 'var(--neutral-900)',
                      margin: 0,
                      textAlign: 'center'
                    }}>No friends to chat with yet</p>
                    {/* Description - Meta typography, dark grey */}
                    <p style={{ 
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-meta-size, 16px)',
                      fontWeight: 'var(--typography-meta-weight, 500)',
                      lineHeight: 'var(--typography-meta-line-height, 1.5)',
                      color: 'var(--neutral-600)',
                      margin: 0,
                      textAlign: 'center'
                    }}>
                    You need to be friends with someone before you can chat with them.
                  </p>
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const isSelected = selectedUsers.some(u => u.user_id === user.user_id);
                  return (
                    <div
                      key={user.user_id}
                        className={`border rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] h-[60px] cursor-pointer flex items-center px-[7px] gap-[45px] transition-all ${
                          ''
                      }`}
                      style={{ 
                        borderColor: 'var(--brand-pink-500)',
                        backgroundColor: isSelected ? 'var(--brand-pink-050)' : 'var(--neutral-50)'
                      }}
                      onClick={() => {
                          if (isSelected) {
                            removeUserFromGroup(user.user_id);
                          } else {
                            addUserToGroup(user);
                          }
                        }}
                      >
                        {/* Profile Picture and Name */}
                        <div className="flex items-center gap-[6px] flex-1 min-w-0">
                          <Avatar className="w-10 h-10 flex-shrink-0">
                        <AvatarImage 
                          src={user.avatar_url || undefined} 
                          alt={`${user.name}'s profile picture`} 
                        />
                            <AvatarFallback className="bg-synth-beige/50 text-synth-black font-medium text-sm">
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                          <div className="flex flex-col gap-[6px] justify-center min-w-0 flex-1">
                            <p className="font-bold text-[20px] leading-[normal] truncate" style={{ color: 'var(--neutral-900)' }}>
                              {user.name}
                            </p>
                        {user.bio && (
                              <p className="font-normal text-[16px] leading-[normal] truncate" style={{ color: 'var(--neutral-600)' }}>
                                {user.bio}
                              </p>
                        )}
                      </div>
                        </div>
                        
                        {/* Arrow Icon */}
                        <ChevronRight className="w-6 h-6 flex-shrink-0" style={{ color: 'var(--neutral-900)' }} />
                    </div>
                  );
                })
              )}
              </div>

              <Button
                onClick={async () => {
                  if (selectedUsers.length === 1) {
                    createDirectChat(selectedUsers[0].user_id);
                    setShowUserSearch(false);
                    setSelectedUsers([]);
                    setSearchQuery('');
                  } else if (selectedUsers.length >= 2) {
                    const chatId = await createGroupChat();
                    if (chatId) {
                      setSelectedUsers([]);
                      setGroupName('');
                      setSearchQuery('');
                    }
                  }
                }}
                disabled={selectedUsers.length === 0}
                className="w-full mt-4 py-6 font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--brand-pink-500)', color: 'var(--neutral-50)' }}
              >
                {selectedUsers.length === 0 ? 'Select friends to chat with' : selectedUsers.length === 1 ? 'Start Chat' : 'Create Group Chat'}
              </Button>
            </div>
          </div>
        </div>
      )}


      {/* Review Detail Modal */}
      {showReviewDetailModal && selectedReviewDetail && (
        <Dialog 
          open={showReviewDetailModal} 
          onOpenChange={(open) => {
            setShowReviewDetailModal(open);
            if (!open) {
              setSelectedReviewDetail(null);
              setReviewDetailData(null);
              setLoadingReviewDetails(false);
            }
          }}
        >
          <DialogContent className="max-w-6xl w-[95vw] h-[95vh] max-h-[95vh] p-0 overflow-hidden flex flex-col" hideCloseButton>
            <DialogTitle className="sr-only">Review Details</DialogTitle>
            <DialogDescription className="sr-only">Review details</DialogDescription>
            
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--neutral-200)', backgroundColor: 'var(--neutral-50)' }}>
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage 
                    src={selectedReviewDetail.author?.avatar_url || undefined} 
                    alt={selectedReviewDetail.author?.name ? `${selectedReviewDetail.author.name}'s profile picture` : "User profile picture"} 
                  />
                  <AvatarFallback style={{ backgroundImage: 'var(--gradient-brand)', color: 'var(--neutral-50)' }}>
                    {selectedReviewDetail.author?.name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{selectedReviewDetail.author?.name || 'User'}</span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--neutral-600)' }}>
                    {new Date(selectedReviewDetail.created_at).toLocaleDateString('en-US', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setShowReviewDetailModal(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Left side - Hero Image */}
              <div className="flex-1 bg-black flex items-center justify-center min-h-0 relative">
                {(reviewDetailData?.photos && reviewDetailData.photos.length > 0) || (selectedReviewDetail.photos && selectedReviewDetail.photos.length > 0) ? (
                  <img 
                    src={reviewDetailData?.photos[0] || selectedReviewDetail.photos?.[0]} 
                    alt="Review photo"
                    className="max-w-full max-h-full object-contain"
                  />
                ) : (
                  <div className="text-center" style={{ color: 'var(--neutral-50)' }}>
                    <div className="text-6xl font-bold mb-4">
                      <span className="text-pink-500">S</span>ynth
                    </div>
                    <div className="w-32 h-0.5 bg-white mx-auto mb-4"></div>
                    <div className="text-sm opacity-80">Concert Review</div>
                  </div>
                )}
                {reviewDetailData?.reactionEmoji && (
                  <div className="absolute top-4 right-4 text-4xl bg-white/20 backdrop-blur-sm rounded-full w-16 h-16 flex items-center justify-center">
                    {reviewDetailData.reactionEmoji}
                  </div>
                )}
              </div>
              
              {/* Right side - Content */}
              <div className="flex-1 flex flex-col bg-white overflow-y-auto">
                {loadingReviewDetails ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Loader2 className="h-8 w-8 animate-spin text-indigo-500 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Loading review details...</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 space-y-6">
                    {/* Event Info */}
                    <div>
                      <h2 className="text-2xl font-bold mb-2">
                        {selectedReviewDetail.event_info?.event_name || selectedReviewDetail.title || 'Concert Review'}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2 text-sm var(--neutral-600) mb-3">
                        {selectedReviewDetail.event_info?.artist_name && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
                            {selectedReviewDetail.event_info.artist_name}
                          </span>
                        )}
                      </div>
                      {selectedReviewDetail.event_info?.venue_name && (
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <MapPin className="w-4 h-4" />
                          <span>{selectedReviewDetail.event_info.venue_name}</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Overall Rating */}
                    {selectedReviewDetail.rating && (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          {Array.from({ length: 5 }, (_, i) => {
                            const starValue = i + 1;
                            const rating = selectedReviewDetail.rating || 0;
                            const isFull = starValue <= Math.floor(rating);
                            const isHalf = !isFull && starValue - 0.5 <= rating;
                            return (
                              <div key={i} className="relative w-6 h-6">
                                <Star className="w-6 h-6 text-gray-300" />
                                {(isHalf || isFull) && (
                                  <div className={`absolute left-0 top-0 h-full overflow-hidden pointer-events-none ${isFull ? 'w-full' : 'w-1/2'}`}>
                                    <Star className="w-6 h-6 text-yellow-500 fill-yellow-500" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <span className="text-lg font-semibold">{selectedReviewDetail.rating}/5</span>
                      </div>
                    )}

                    {/* Review Text */}
                    {selectedReviewDetail.content && (
                      <div className="bg-white border border-gray-200 rounded-lg p-4">
                        <h3 className="font-semibold mb-2 text-gray-900">Review</h3>
                        <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {selectedReviewDetail.content}
                        </p>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-6 pt-4 border-t border-gray-200">
                      <div className="flex items-center gap-2 text-gray-700">
                        <Heart className="w-5 h-5" />
                        <span className="font-medium">{selectedReviewDetail.likes_count || 0}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-700">
                        <MessageCircle className="w-5 h-5" />
                        <span className="font-medium">{selectedReviewDetail.comments_count || 0}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Event Details Modal — rendered via portal to escape the CSS transform containing block
          created by the view-enter-right animation on the chat view's parent container */}
      {selectedEvent && createPortal(
        <EventDetailsModal
          event={selectedEvent}
          currentUserId={currentUserId}
          isOpen={eventDetailsOpen}
          onClose={() => {
            setEventDetailsOpen(false);
            setSelectedEvent(null);
            setRefreshTrigger(prev => prev + 1);
          }}
          onEventChange={(newEvent, isInterested) => {
            setSelectedEvent(newEvent);
            setSelectedEventInterested(isInterested ?? false);
          }}
          onInterestToggle={handleInterestToggle}
          isInterested={selectedEventInterested}
          onReview={() => {
            const ev = selectedEvent;
            setEventDetailsOpen(false);
            window.dispatchEvent(new CustomEvent('open-review-modal', { detail: { event: ev } }));
          }}
        />,
        document.body
      )}

      {/* Chat Participants Modal - Group Chat Users */}
      {showUsersModal && selectedChat && selectedChat.is_group_chat && (
        <Dialog open={showUsersModal} onOpenChange={setShowUsersModal}>
          <DialogContent className="max-w-[393px] max-h-[80vh] overflow-y-auto" style={{ backgroundColor: 'var(--neutral-50)' }}>
            <DialogHeader>
              <DialogTitle className="text-[20px] font-bold" style={{ color: 'var(--neutral-900)' }}>
                Group Members ({chatParticipants.length})
              </DialogTitle>
              <DialogDescription className="text-[16px]" style={{ color: 'var(--neutral-600)' }}>
                Members of this group chat
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-4">
              {chatParticipants.length === 0 ? (
                <div className="flex flex-col gap-[6px] items-center justify-center py-8">
                  {/* Large icon (60px), dark grey */}
                  <Users className="w-[60px] h-[60px] mx-auto" style={{ color: 'var(--neutral-600)' }} />
                  {/* Description - Meta typography, dark grey */}
                  <p style={{ 
                    fontFamily: 'var(--font-family)',
                    fontSize: 'var(--typography-meta-size, 16px)',
                    fontWeight: 'var(--typography-meta-weight, 500)',
                    lineHeight: 'var(--typography-meta-line-height, 1.5)',
                    color: 'var(--neutral-600)',
                    margin: 0,
                    textAlign: 'center'
                  }}>No members found</p>
                </div>
              ) : (
                chatParticipants.map((participant) => {
                  const isCurrentUser = participant.user_id === currentUserId;
                  const isAdmin = participant.is_admin;
                  
                  return (
                    <div
                      key={participant.id || participant.user_id}
                      className="flex items-center justify-between p-3 border rounded-[10px] transition-colors" style={{ borderColor: 'var(--neutral-200)', backgroundColor: 'var(--neutral-100)' }}
                    >
                      <div
                        className="flex items-center gap-3 flex-1 cursor-pointer"
                        onClick={() => {
                          handleViewProfile(participant.user_id);
                          setShowUsersModal(false);
                        }}
                      >
                        <Avatar className="w-10 h-10 flex-shrink-0">
                          <AvatarImage 
                            src={participant.avatar_url || undefined} 
                            alt={`${participant.name}'s profile picture`} 
                          />
                          <AvatarFallback className="font-medium" style={{ backgroundImage: 'var(--gradient-brand)', color: 'var(--neutral-50)' }}>
                            {participant.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-[16px] truncate" style={{ color: 'var(--neutral-900)' }}>
                              {participant.name}
                              {isCurrentUser && (
                                <span className="text-[14px] font-normal ml-1" style={{ color: 'var(--neutral-600)' }}>(You)</span>
                              )}
                            </h3>
                            {participant.verified && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
                                ✓ Verified
                              </span>
                            )}
                          </div>
                          {participant.bio && (
                            <p className="text-[14px] truncate mt-1" style={{ color: 'var(--neutral-600)' }}>
                              {participant.bio}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            {isAdmin && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', height: '25px', padding: '0 var(--spacing-small, 12px)', gap: 'var(--spacing-inline, 6px)', backgroundColor: 'var(--brand-pink-050)', color: 'var(--brand-pink-500)', border: '2px solid var(--brand-pink-500)', borderRadius: '999px', fontSize: 'var(--typography-meta-size, 16px)', fontWeight: 'var(--typography-meta-weight, 500)', lineHeight: 'var(--typography-meta-line-height, 1.5)' }}>
                                Admin
                              </span>
                            )}
                            <span className="text-[12px]" style={{ color: 'var(--neutral-600)' }}>
                              Joined {format(parseISO(participant.joined_at), 'MMM d, yyyy')}
                            </span>
                          </div>
                        </div>
                      </div>
                      {!isCurrentUser && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewProfile(participant.user_id);
                            setShowUsersModal(false);
                          }}
                          className="p-2 flex-shrink-0"
                          style={{ color: 'var(--neutral-600)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--brand-pink-500)'; e.currentTarget.style.backgroundColor = 'var(--brand-pink-050)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--neutral-600)'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                          <User className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Chat Confirmation Modal (custom, fixed + centered to guarantee visibility) */}
      {isDeleteChatModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'var(--overlay-50, var(--overlay-50))',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
            paddingRight: 'var(--spacing-screen-margin-x, 20px)',
          }}
          role="presentation"
          onMouseDown={(e) => {
            // Click outside modal closes it
            if (e.target === e.currentTarget) {
              closeDeleteChatModal();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete chat confirmation"
            style={{
              width: '100%',
              maxWidth: 'var(--size-popup-width, calc(100vw - 40px))',
              backgroundColor: 'var(--neutral-50)',
              border: '1px solid var(--neutral-200)',
              borderRadius: 'var(--radius-corner, 10px)',
              boxShadow: '0 4px 12px 0 var(--shadow-color)',
              position: 'relative',
              paddingLeft: 'var(--spacing-screen-margin-x, 20px)',
              paddingRight: 'var(--spacing-screen-margin-x, 20px)',
              paddingTop: 'var(--spacing-grouped, 24px)',
              paddingBottom: 'var(--spacing-grouped, 24px)',
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Close X button in top right */}
            <button
              onClick={() => {
                closeDeleteChatModal();
              }}
              style={{
                position: 'absolute',
                top: 'var(--spacing-grouped, 24px)',
                right: 'var(--spacing-screen-margin-x, 20px)',
                width: '44px',
                height: '44px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                margin: 0,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
              }}
              aria-label="Close dialog"
              type="button"
            >
              <X size={24} style={{ color: 'var(--neutral-900)' }} aria-hidden="true" />
            </button>

            {/* Title */}
            <h2
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-body-size, 20px)',
                fontWeight: 'var(--typography-bold-weight, 700)',
                lineHeight: 'var(--typography-body-line-height, 1.5)',
                color: 'var(--neutral-900)',
                margin: 0,
                marginBottom: 'var(--spacing-small, 12px)',
                paddingRight: '44px', // Account for X button space
              }}
            >
              Are you sure you want to delete this chat?
            </h2>

            {/* Subtitle */}
            <p
              style={{
                fontFamily: 'var(--font-family)',
                fontSize: 'var(--typography-meta-size, 16px)',
                fontWeight: 'var(--typography-meta-weight, 500)',
                lineHeight: 'var(--typography-meta-line-height, 1.5)',
                color: 'var(--neutral-600)',
                margin: 0,
                marginBottom: 'var(--spacing-small, 12px)',
              }}
            >
              This action cannot be undone
            </p>

            {/* Delete Button */}
            <SynthButton
              variant="primary"
              size="standard"
              icon="trash"
              iconPosition="left"
              onClick={confirmDeleteChat}
              style={{ width: '100%' }}
            >
              Delete
            </SynthButton>
          </div>
        </div>
      )}
      </div>
    </PageShell>
  );
};
