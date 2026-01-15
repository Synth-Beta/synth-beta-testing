import React, { useState, useEffect, useRef } from 'react';
import { SkeletonChatMessage } from '@/components/skeleton/SkeletonChatMessage';
import { SkeletonNotificationCard } from '@/components/skeleton/SkeletonNotificationCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { SearchBar } from '@/components/SearchBar';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
import { useToast } from '@/hooks/use-toast';
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
import { fetchUserChats } from '@/services/chatService';
import type { ReviewWithEngagement } from '@/services/reviewService';
import type { UnifiedFeedItem } from '@/services/unifiedFeedService';
import { VerifiedChatService } from '@/services/verifiedChatService';
import { Badge as VerifiedBadge } from '@/components/ui/badge';

interface Chat {
  id: string;
  chat_name: string;
  is_group_chat: boolean;
  users: string[];
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
  member_count?: number;
  last_activity_at?: string | null;
  // Event image URL (for group chats)
  event_image_url?: string | null;
}

interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name: string;
  sender_avatar: string | null;
  message_type?: 'text' | 'event_share' | 'review_share' | 'system';
  shared_event_id?: string | null;
  shared_review_id?: string | null;
  metadata?: any;
}

interface User {
  user_id: string;
  name: string;
  avatar_url: string | null;
  bio: string | null;
}

interface UnifiedChatViewProps {
  currentUserId: string;
  onBack: () => void;
  menuOpen?: boolean;
  onMenuClick?: () => void;
  hideHeader?: boolean;
}

export const UnifiedChatView = ({ currentUserId, onBack, menuOpen = false, onMenuClick, hideHeader = false }: UnifiedChatViewProps) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [showUserSearch, setShowUserSearch] = useState(false);
  // Map of chat_id -> other_user_id for direct chats (to fix Bug 1)
  const [chatToOtherUserMap, setChatToOtherUserMap] = useState<Map<string, string>>(new Map());
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(true);
  const [isEditingGroupName, setIsEditingGroupName] = useState(false);
  const [editedGroupName, setEditedGroupName] = useState('');
  const { toast } = useToast();

  // Event details modal state
  const [eventDetailsOpen, setEventDetailsOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<JamBaseEvent | null>(null);
  const [selectedEventInterested, setSelectedEventInterested] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Review detail modal state
  const [showReviewDetailModal, setShowReviewDetailModal] = useState(false);
  const [selectedReviewDetail, setSelectedReviewDetail] = useState<UnifiedFeedItem | null>(null);
  const [loadingReviewDetails, setLoadingReviewDetails] = useState(false);
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
  
  // Auto-scroll ref for messages
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
  }, [selectedChat]);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat.id);
      fetchChatParticipants(selectedChat.id);
      fetchLinkedEvent(selectedChat.id);
      // Mark messages as read when chat is opened
      markChatAsRead(selectedChat.id);
    }
  }, [selectedChat]);

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
        (payload) => {
          console.log('📨 Real-time message update:', payload);
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
      
      toast({
        title: interested ? 'Added to interested events!' : 'Removed from interested events',
        description: interested ? 'This event will appear in your profile' : 'Event removed from your interested list'
      });
    } catch (error) {
      console.error('Error toggling interest:', error);
      toast({
        title: 'Error',
        description: 'Failed to update interest',
        variant: 'destructive'
      });
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
      
      toast({
        title: attended ? 'Marked as attended!' : 'Removed attendance',
        description: attended ? 'This event will appear in your attended events' : 'Attendance removed'
      });
    } catch (error) {
      console.error('Error toggling attendance:', error);
      toast({
        title: 'Error',
        description: 'Failed to update attendance',
        variant: 'destructive'
      });
    }
  };

  const fetchChats = async () => {
    try {
      const { data, error } = await fetchUserChats(currentUserId);

      if (error) {
        console.error('Error fetching chats:', error);
        return;
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
      
      // Check for unread messages using simple existence queries (much faster than COUNT)
      const chatsWithUnread = await Promise.all((data || []).map(async (chat) => {
        try {
          const lastReadAt = lastReadMap.get(chat.id);
          
          // If no last_read_at, check if there are any messages not from current user
          const query = supabase
            .from('messages')
            .select('id')
            .eq('chat_id', chat.id)
            .neq('sender_id', currentUserId)
            .limit(1);
          
          // If we have a last_read_at timestamp, only check for messages after that
          if (lastReadAt) {
            query.gt('created_at', lastReadAt);
          }
          
          const { data: unreadMessage } = await query.maybeSingle();
          
            return {
              ...chat,
            has_unread: !!unreadMessage,
            unread_count: 0 // Keep for backward compatibility
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
          const artistUuids = [...new Set(events?.map(e => e.artist_id).filter(Boolean) as string[])] || [];
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
      
      // Identify event-created group chats
      const eventCreatedChatIds = new Set<string>();
      for (const chat of sortedChats) {
        if (chat.is_group_chat) {
          const isEventCreated = await isEventCreatedGroupChat(chat.id);
          if (isEventCreated) {
            eventCreatedChatIds.add(chat.id);
          }
        }
      }
      setEventCreatedChats(eventCreatedChatIds);
    } catch (error) {
      console.error('Error fetching chats:', error);
    } finally {
      // Add minimum loading time to show skeleton
      setTimeout(() => {
        setLoading(false);
      }, 800);
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
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          chat_id,
          sender_id,
          content,
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

      // Get sender profiles separately
      const senderIds = [...new Set((data || []).map(msg => msg.sender_id))];
      const { data: profiles } = await supabase
        .from('users')
        .select('user_id, name, avatar_url')
        .in('user_id', senderIds);

      const transformedMessages = (data || []).map(msg => {
        const profile = profiles?.find(p => p.user_id === msg.sender_id);
        return {
          id: msg.id,
          chat_id: msg.chat_id,
          sender_id: msg.sender_id,
          content: msg.content,
          created_at: msg.created_at,
          sender_name: profile?.name || 'Unknown',
          sender_avatar: profile?.avatar_url || null,
          message_type: msg.message_type || 'text',
          shared_event_id: msg.shared_event_id,
          shared_review_id: msg.shared_review_id,
          metadata: msg.metadata
        };
      });

      // Ensure message_type is assigned to the allowed union type
      setMessages(
        transformedMessages.map(msg => ({
          ...msg,
          message_type: 
            msg.message_type === 'text' ||
            msg.message_type === 'event_share' ||
            msg.message_type === 'review_share' ||
            msg.message_type === 'system'
              ? msg.message_type
              : 'text'
        }))
      );
      
      // Auto-scroll to bottom after messages load
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };
  
  // Auto-scroll when messages change
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  }, [messages.length]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;

    const messageText = newMessage.trim();
    setNewMessage('');

    try {
      // Insert message into database
      const { data, error } = await supabase
        .from('messages')
        .insert({
          chat_id: selectedChat.id,
          sender_id: currentUserId,
          content: messageText
        })
        .select()
        .single();

      if (error) {
        console.error('Error sending message:', error);
        // Restore message text on error
        setNewMessage(messageText);
        toast({
          title: "Error",
          description: "Failed to send message. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Real-time subscription will automatically update messages
      // But we can also manually refresh to ensure immediate update
      fetchMessages(selectedChat.id);
      
      toast({
        title: "Message Sent! 💬",
        description: "Your message has been delivered",
      });
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    }
  };

  const createDirectChat = async (userId: string) => {
    try {
      console.log('Creating direct chat between:', currentUserId, 'and', userId);
      
      // First check if this user is actually a friend
      const isFriend = users.some(user => user.user_id === userId);
      if (!isFriend) {
        toast({
          title: "Not Friends Yet",
          description: "You can only chat with people who have accepted your friend request.",
          variant: "destructive",
        });
        return;
      }
      
      // Use the database function to create or get existing direct chat
      const { data: chatId, error } = await supabase.rpc('create_direct_chat', {
        user1_id: currentUserId,
        user2_id: userId
      });

      if (error) {
        console.error('Error creating direct chat:', error);
        toast({
          title: "Error",
          description: "Failed to create chat. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Refresh chats to get the new chat
      fetchChats();
      setShowUserSearch(false);
      
      toast({
        title: "Chat Created! 💬",
        description: "You can now start chatting!",
      });
    } catch (error) {
      console.error('Error creating direct chat:', error);
      toast({
        title: "Error",
        description: "Failed to create chat. Please try again.",
        variant: "destructive",
      });
    }
  };

  const createGroupChat = async (autoGeneratedName?: string) => {
    const groupNameToUse = groupName.trim() || autoGeneratedName || selectedUsers.map(u => u.name).join(', ');
    
    if (selectedUsers.length < 2) {
      toast({
        title: "Error",
        description: "Please select at least 2 users.",
        variant: "destructive",
      });
      return;
    }

    try {
      const userIds = selectedUsers.map(user => user.user_id);
      console.log('Creating group chat:', { groupName: groupNameToUse, userIds, adminId: currentUserId });
      
      const { data: chatId, error } = await supabase.rpc('create_group_chat', {
        chat_name: groupNameToUse,
        user_ids: userIds,
        admin_id: currentUserId
      });

      console.log('Group chat creation result:', { chatId, error });

      if (error) {
        console.error('Error creating group chat:', error);
        toast({
          title: "Error",
          description: "Failed to create group chat. Please try again.",
          variant: "destructive",
        });
        return;
      }

      setGroupName('');
      setSelectedUsers([]);
      setShowGroupCreate(false);
      fetchChats();
      
      toast({
        title: "Group Created! 🎉",
        description: `"${groupNameToUse}" group chat is ready!`,
      });
    } catch (error) {
      console.error('Error creating group chat:', error);
      toast({
        title: "Error",
        description: "Failed to create group chat. Please try again.",
        variant: "destructive",
      });
    }
  };

  const addUserToGroup = (user: User) => {
    // Check if this user is actually a friend
    const isFriend = users.some(u => u.user_id === user.user_id);
    if (!isFriend) {
      toast({
        title: "Not Friends Yet",
        description: "You can only add friends to group chats.",
        variant: "destructive",
      });
      return;
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
        toast({
          title: "Error",
          description: "Failed to delete chat. Please try again.",
          variant: "destructive",
        });
        return;
      }

      setChats(prev => prev.filter(chat => chat.id !== chatId));
      if (selectedChat?.id === chatId) {
        setSelectedChat(null);
        setMessages([]);
      }

      toast({
        title: "Chat Deleted",
        description: "Chat has been removed.",
      });
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast({
        title: "Error",
        description: "Failed to delete chat. Please try again.",
        variant: "destructive",
      });
    }
  };

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
      return chat.chat_name || 'Unknown User';
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
      }

      // Update has_unread to false for this chat in local state
      setChats(prev => prev.map(chat => 
        chat.id === chatId ? { ...chat, has_unread: false, unread_count: 0 } : chat
      ));
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
    // TODO: Implement view profile
    toast({
      title: 'View Profile',
      description: 'Profile view functionality will be implemented soon',
    });
  };

  const handleBlockUser = (userId: string) => {
    // TODO: Implement block user
    toast({
      title: 'Block User',
      description: 'Block user functionality will be implemented soon',
    });
  };

  const handleMuteNotifications = () => {
    setIsMuted(!isMuted);
    toast({
      title: isMuted ? 'Notifications Unmuted' : 'Notifications Muted',
      description: isMuted ? 'You will receive notifications for this chat' : 'You will not receive notifications for this chat',
    });
  };

  const handleViewEvent = () => {
    if (linkedEvent) {
      setSelectedEvent(linkedEvent);
      setEventDetailsOpen(true);
    }
  };

  const handleSaveGroupName = async () => {
    if (!editedGroupName.trim() || !selectedChat) return;
    
    const { error } = await supabase
      .from('chats')
      .update({ chat_name: editedGroupName.trim() })
      .eq('id', selectedChat.id);
    
    if (error) {
      toast({
        title: "Error",
        description: "Failed to update group name",
        variant: "destructive",
      });
      return;
    }
    
    setIsEditingGroupName(false);
    fetchChats(); // Refresh to show new name
    toast({
      title: "Success",
      description: "Group name updated",
    });
  };

  const handleDeleteChat = async () => {
    if (!selectedChat) return;
    
    // Confirm deletion
    const confirmed = window.confirm(
      `Are you sure you want to delete this ${selectedChat.is_group_chat ? 'group' : 'chat'}? This action cannot be undone.`
    );
    
    if (!confirmed) return;
    
    try {
      const { error } = await supabase
        .from('chats')
        .delete()
        .eq('id', selectedChat.id);
      
      if (error) {
        console.error('Error deleting chat:', error);
        toast({
          title: "Error",
          description: "Failed to delete chat",
          variant: "destructive",
        });
        return;
      }
      
      // Close the chat and refresh list
      setSelectedChat(null);
      fetchChats();
      
      toast({
        title: "Chat Deleted",
        description: "The chat has been removed",
      });
    } catch (error) {
      console.error('Error deleting chat:', error);
      toast({
        title: "Error",
        description: "Failed to delete chat",
        variant: "destructive",
      });
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
          <div className="flex justify-center w-full" style={{ marginBottom: 'var(--spacing-grouped, 24px)' }}>
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
                  <span style={{ fontWeight: 'var(--typography-meta-weight, 700)' }}>{format(sessionDate, 'EEEE')}</span>
                  <span style={{ fontWeight: 'var(--typography-meta-weight, 500)' }}> at {format(sessionDate, 'h:mm a')}</span>
                </>
              ) : (
                <>
                  <span style={{ fontWeight: 'var(--typography-meta-weight, 700)' }}>{format(sessionDate, 'MMM d')}</span>
                  <span style={{ fontWeight: 'var(--typography-meta-weight, 500)' }}> at {format(sessionDate, 'h:mm a')}</span>
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
                  prevMessage.message_type !== 'event_share'));

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
                        style={{ gap: isLastInGroup ? 'var(--spacing-inline, 6px)' : '0' }}
                      >
                        {message.message_type === 'review_share' && (message.shared_review_id || message.metadata?.review_id) ? (
                          <ReviewMessageCard
                            reviewId={message.shared_review_id || message.metadata?.review_id}
                            customMessage={message.metadata?.custom_message}
                            onReviewClick={handleReviewClick}
                            currentUserId={currentUserId}
                            metadata={message.metadata}
                          />
                        ) : message.message_type === 'event_share' && (message.shared_event_id || message.metadata?.event_id) ? (
                          <EventMessageCard
                            eventId={message.shared_event_id || message.metadata?.event_id}
                            customMessage={message.metadata?.custom_message}
                            onEventClick={handleEventClick}
                            onInterestToggle={handleInterestToggle}
                            onAttendanceToggle={handleAttendanceToggle}
                            currentUserId={currentUserId}
                            refreshTrigger={refreshTrigger}
                          />
                        ) : (
                          <div
                            style={{
                              maxWidth: '172px',
                              padding: 'var(--spacing-small, 12px)',
                              borderRadius: 'var(--radius-corner, 10px)',
                              border: message.sender_id === currentUserId ? 'none' : '1px solid var(--neutral-200)',
                              backgroundColor: message.sender_id === currentUserId ? 'var(--brand-pink-500)' : 'var(--neutral-100)',
                              wordWrap: 'break-word',
                              whiteSpace: 'pre-wrap'
                            }}
                          >
                            <p
                              style={{
                                fontFamily: 'var(--font-family)',
                                fontSize: 'var(--typography-body-size, 20px)',
                                fontWeight: 'var(--typography-body-weight, 500)',
                                lineHeight: 'var(--typography-body-line-height, 1.5)',
                                margin: 0,
                                color: message.sender_id === currentUserId ? 'var(--neutral-50)' : 'var(--neutral-900)'
                              }}
                            >
                              {message.content}
                            </p>
                          </div>
                        )}

                        {/* Timestamp (only on last message in group) */}
                        {isLastInGroup && (
                          <p
                            style={{
                              fontFamily: 'var(--font-family)',
                              fontSize: 'var(--typography-meta-size, 16px)',
                              fontWeight: 'var(--typography-meta-weight, 500)',
                              color: 'var(--neutral-600)',
                              lineHeight: 'var(--typography-meta-line-height, 1.5)',
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
    return <SynthLoadingScreen text="Loading messages..." />;
  }

  return (
    <div 
      className="flex min-h-screen w-full max-w-[393px] mx-auto" style={{ backgroundColor: 'var(--neutral-50)' }}
    >
      {/* Mobile Header */}
      {!hideHeader && (
      <MobileHeader menuOpen={menuOpen} onMenuClick={onMenuClick}>
        <h1 style={{ fontFamily: 'var(--font-family)', fontSize: 'var(--typography-h2-size, 24px)', fontWeight: 'var(--typography-h2-weight, 700)', color: 'var(--neutral-900)' }}>Messages</h1>
      </MobileHeader>
      )}
      
      {/* Left Sidebar - Chat List */}
      {!selectedChat && (
        <div className="w-full flex flex-col">
        {/* Content area - 12px below header */}
        <div style={{ paddingLeft: 'var(--spacing-screen-margin-x, 20px)', paddingRight: 'var(--spacing-screen-margin-x, 20px)', paddingTop: hideHeader ? `calc(env(safe-area-inset-top, 0px) + var(--spacing-small, 12px))` : `calc(env(safe-area-inset-top, 0px) + 68px + var(--spacing-small, 12px))`, paddingBottom: 0 }}>
          
          {/* New Chat Button */}
            <SynthButton
              variant="primary"
              size="standard"
              fullWidth
              icon="plus"
              iconPosition="right"
              onClick={(e) => {
                e.preventDefault();
                console.log('🟢 Button clicked! Opening user search');
                setShowUserSearch(true);
              }}
            >
              New Chat
            </SynthButton>
        </div>

        {/* Chat List */}
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-full" style={{ gap: 'var(--spacing-big-section, 60px)', padding: 'var(--spacing-small, 12px)', paddingBottom: 'var(--spacing-bottom-nav, 112px)' }}>
              {/* New Chat Button - Already in header, but shown in empty state per Figma */}
              
              {/* Empty State Content */}
              <div className="flex flex-col items-center justify-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                {/* Chat Bubble Icon - Large icon (60px), dark grey */}
                <MessageCircle size={60} strokeWidth={2} style={{ color: 'var(--neutral-600)' }} />
                
                {/* "No Conversations Yet" Heading - Body typography, off black */}
                <h2 style={{ 
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-body-size, 20px)',
                  fontWeight: 'var(--typography-body-weight, 500)',
                  lineHeight: 'var(--typography-body-line-height, 1.5)',
                  color: 'var(--neutral-900)',
                  margin: 0,
                  textAlign: 'center'
                }}>
                  No Conversations Yet
                </h2>
                
                {/* Subtitle - Meta typography, dark grey */}
                <p style={{ 
                  fontFamily: 'var(--font-family)',
                  fontSize: 'var(--typography-meta-size, 16px)',
                  fontWeight: 'var(--typography-meta-weight, 500)',
                  lineHeight: 'var(--typography-meta-line-height, 1.5)',
                  color: 'var(--neutral-600)',
                  margin: 0,
                  textAlign: 'center'
                }}>
                  Start chatting with your friends!
                </p>
              </div>
              
              {/* Instructions Box */}
              <div className="border-[3px] rounded-[12px] p-3 min-h-[110px] flex items-center justify-center" style={{ width: 'calc(100vw - 40px)', backgroundColor: 'var(--brand-pink-050)', borderColor: 'var(--brand-pink-700)' }}>
                <ul className="list-disc text-[16px] font-normal leading-[normal] space-y-0 ml-6" style={{ color: 'var(--neutral-900)' }}>
                  <li className="mb-0">
                    <span>Send friend requests first</span>
                  </li>
                  <li className="mb-0">
                    <span>Wait for them to accept</span>
                  </li>
                  <li>
                    <span>Then start chatting!</span>
                  </li>
                </ul>
              </div>
            </div>
          ) : (
            <div style={{ paddingTop: 0, paddingBottom: 'var(--spacing-bottom-nav, 112px)', display: 'flex', flexDirection: 'column' }}>
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
                  onClick={() => setSelectedChat(chat)}
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
                          <AvatarImage src={getChatAvatar(chat) || undefined} />
                        <AvatarFallback className="font-medium" style={{ backgroundImage: 'var(--gradient-brand)', color: 'var(--neutral-50)' }}>
                            {chat.is_group_chat ? (
                              <Users className="w-6 h-6" />
                            ) : (
                              getChatDisplayName(chat).split(' ').map(n => n[0]).join('')
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                          <h3 className="font-semibold break-words" style={{ 
                            fontFamily: 'var(--font-family)',
                            fontSize: 'var(--typography-body-size, 20px)',
                            fontWeight: 'var(--typography-body-weight, 500)',
                            lineHeight: 'var(--typography-body-line-height, 1.5)',
                            color: 'var(--neutral-900)' 
                          }}>
                              {getChatDisplayName(chat)}
                            </h3>
                            {chat.latest_message_created_at && (
                            <span className="text-xs flex-shrink-0 font-medium whitespace-nowrap" style={{ 
                              fontFamily: 'var(--font-family)',
                              fontSize: 'var(--typography-meta-size, 16px)',
                              fontWeight: 'var(--typography-meta-weight, 500)',
                              lineHeight: 'var(--typography-meta-line-height, 1.5)',
                              color: 'var(--neutral-600)' 
                            }}>
                                {formatChatTimestamp(chat.latest_message_created_at)}
                              </span>
                            )}
                          </div>
                        <p className="text-sm break-words mb-1" style={{ 
                          fontFamily: 'var(--font-family)',
                          fontSize: 'var(--typography-meta-size, 16px)',
                          fontWeight: 'var(--typography-meta-weight, 500)',
                          lineHeight: 'var(--typography-meta-line-height, 1.5)',
                          color: 'var(--neutral-600)' 
                        }}>
                            {chat.latest_message ? (
                              <span>
                                <span className="font-medium">{chat.latest_message_sender_name}:</span> {chat.latest_message}
                              </span>
                            ) : (
                            <span style={{ color: 'var(--neutral-600)' }}>No messages yet</span>
                            )}
                          </p>
                          {chat.is_group_chat && chat.is_verified && (
                            <div className="flex items-center gap-2 mt-2">
                                <Badge 
                                  variant="default" 
                              className="text-xs font-medium"
                              style={{
                                backgroundColor: 'var(--status-success-050)',
                                color: 'var(--status-success-500)',
                                border: '1px solid var(--status-success-500)'
                              }}
                                >
                                  <Shield className="w-3 h-3 mr-1" />
                                  Verified {chat.entity_type ? chat.entity_type.charAt(0).toUpperCase() + chat.entity_type.slice(1) : 'Chat'}
                                </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteChat(chat.id);
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
      )}

      {/* Right Side - Messages */}
      {selectedChat && (
        <div className="w-full flex flex-col min-h-0" style={{ backgroundColor: 'var(--neutral-50)' }}>
          <>
            {/* Chat Header */}
            <div className="h-[44px] flex items-center justify-between" style={{ paddingLeft: 'var(--spacing-screen-margin-x, 20px)', paddingRight: 'var(--spacing-screen-margin-x, 20px)', backgroundColor: 'var(--neutral-50)', boxShadow: '0px 4px 4px 0px var(--shadow-color)' }}>
              <div className="flex items-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                <button
                  onClick={() => setSelectedChat(null)}
                  className="w-6 h-6 flex items-center justify-center cursor-pointer"
                >
                  <ArrowLeft className="w-6 h-6" style={{ color: 'var(--neutral-900)' }} />
                </button>
                <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarImage src={getChatAvatar(selectedChat) || undefined} />
                  <AvatarFallback className="font-medium text-base" style={{ backgroundImage: 'var(--gradient-brand)', color: 'var(--neutral-50)' }}>
                      {selectedChat.is_group_chat ? (
                      <Users className="w-5 h-5" />
                      ) : (
                        getChatDisplayName(selectedChat).split(' ').map(n => n[0]).join('')
                      )}
                    </AvatarFallback>
                  </Avatar>
                <h2 className="font-bold text-[24px] leading-[normal]" style={{ color: 'var(--neutral-900)' }}>
                            {getChatDisplayName(selectedChat)}
                          </h2>
                </div>
                
              {/* Info Icon */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                  <Button variant="ghost" style={{
                    width: 'var(--size-input-height, 44px)',
                    height: 'var(--size-input-height, 44px)',
                    padding: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <MoreVertical size={24} style={{ color: 'var(--neutral-900)' }} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {selectedChat.is_group_chat && (
                      <>
                        <DropdownMenuItem onClick={handleViewUsers}>
                          <Users className="mr-2 h-4 w-4" />
                          <span>View Users</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    )}
                    
                    <DropdownMenuItem onClick={() => handleViewProfile(getOtherUserId(selectedChat))}>
                      <User className="mr-2 h-4 w-4" />
                      <span>View Profile</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem onClick={() => handleBlockUser(getOtherUserId(selectedChat))}>
                      <UserX className="mr-2 h-4 w-4" />
                      <span>Block User</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem onClick={handleMuteNotifications}>
                      {isMuted ? (
                        <Bell className="mr-2 h-4 w-4" />
                      ) : (
                        <BellOff className="mr-2 h-4 w-4" />
                      )}
                      <span>{isMuted ? 'Unmute Notifications' : 'Mute Notifications'}</span>
                    </DropdownMenuItem>
                    
                    {linkedEvent && (
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
                      onClick={handleDeleteChat}
                      className="text-red-600 focus:text-red-600"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      <span>Delete Chat</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {/* Messages */}
              <div style={{ maxWidth: '353px', width: '100%', margin: '0 auto', paddingLeft: 'var(--spacing-screen-margin-x, 20px)', paddingRight: 'var(--spacing-screen-margin-x, 20px)', paddingTop: hideHeader ? `calc(env(safe-area-inset-top, 0px) + var(--spacing-small, 12px))` : `calc(env(safe-area-inset-top, 0px) + 68px + var(--spacing-small, 12px))`, paddingBottom: 'var(--spacing-bottom-nav, 112px)' }}>
              {selectedChat.is_group_chat ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex flex-col items-center justify-center" style={{ gap: 'var(--spacing-inline, 6px)' }}>
                    {/* Large icon (60px), dark grey */}
                    <MessageCircle size={60} className="mx-auto" style={{ color: 'var(--neutral-600)' }} />
                    {/* Heading - Body typography, off black */}
                    <h3 style={{ 
                      fontFamily: 'var(--font-family)',
                      fontSize: 'var(--typography-body-size, 20px)',
                      fontWeight: 'var(--typography-body-weight, 500)',
                      lineHeight: 'var(--typography-body-line-height, 1.5)',
                      color: 'var(--neutral-900)',
                      margin: 0,
                      textAlign: 'center'
                    }}>Coming Soon</h3>
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
                      Group chats are still in development
                    </p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
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
                  <div className="flex flex-col" style={{ paddingTop: 'var(--spacing-grouped, 24px)', paddingBottom: 'var(--spacing-grouped, 24px)' }}>
                {renderGroupedMessages()}
                <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message Input - Hide for group chats */}
            {!selectedChat.is_group_chat && (
              <div style={{ paddingLeft: 'var(--spacing-screen-margin-x, 20px)', paddingRight: 'var(--spacing-screen-margin-x, 20px)', paddingBottom: 'var(--spacing-screen-margin-x, 20px)', backgroundColor: 'var(--neutral-50)' }}>
                <div className="border-2 rounded-[10px] flex items-center justify-between h-[44px] pl-5 pr-[1px]" style={{ backgroundColor: 'var(--neutral-50)', borderColor: 'var(--neutral-200)' }}>
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    className="bg-transparent border-0 flex-1 h-full text-[16px] focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
                    style={{ color: 'var(--neutral-600)' }}
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
              </div>
            )}
          </>
          </div>
        )}

      {/* User Search Modal - Direct Message Selection */}
      {showUserSearch && (
        <div className="fixed inset-0 flex items-center justify-center z-[9999]" style={{ backgroundColor: 'var(--overlay-50)' }}>
          <div className="border rounded-[10px] h-[452px] flex flex-col p-3 relative" style={{ width: 'calc(100vw - 40px)', backgroundColor: 'var(--neutral-50)', borderColor: 'var(--neutral-200)', boxShadow: '0px 4px 4px 0px var(--shadow-color)' }}>
            {/* Close Button */}
            <button
                  onClick={() => {
                    setShowUserSearch(false);
                    setSelectedUsers([]);
                    setSearchQuery('');
                  }}
              className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center cursor-pointer rounded transition-colors"
              style={{ color: 'var(--neutral-900)' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--neutral-100)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                >
              <X className="w-5 h-5" style={{ color: 'var(--neutral-900)' }} />
            </button>
            
            {/* Main Content */}
            <div className="flex flex-col gap-3 w-full">
              {/* Title */}
              <h2 className="font-bold text-[20px] leading-[normal]" style={{ color: 'var(--neutral-900)' }}>
                Select Users to Chat With
              </h2>
              
              {/* Search Input */}
              <div className="w-full">
                <SearchBar
              placeholder="Search users..."
              value={searchQuery}
                  onChange={(value) => setSearchQuery(value)}
                  widthVariant="full"
                />
                </div>
            
              {/* Friends List */}
              <div className="flex flex-col h-[235px] overflow-y-auto overflow-x-hidden" style={{ gap: 'var(--spacing-small, 12px)' }}>
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
                          // For direct messages, selecting a user should immediately create the chat
                          createDirectChat(user.user_id);
                          setShowUserSearch(false);
                          setSelectedUsers([]);
                          setSearchQuery('');
                        }}
                      >
                        {/* Profile Picture and Name */}
                        <div className="flex items-center gap-[6px] flex-1 min-w-0">
                          <Avatar className="w-10 h-10 flex-shrink-0">
                        <AvatarImage src={user.avatar_url || undefined} />
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
            </div>
          </div>
        </div>
      )}

      {/* Group Create Modal */}
      {showGroupCreate && (
        <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-[9999]" style={{ backgroundColor: 'var(--overlay-50)' }}>
          <div className="rounded-3xl p-8 w-full max-w-lg mx-4 shadow-2xl border-2" style={{ backgroundColor: 'var(--neutral-50)', borderColor: 'var(--neutral-200)', boxShadow: '0 25px 50px -12px var(--shadow-color)' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold" style={{ color: 'var(--neutral-900)' }}>Create Group Chat</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowGroupCreate(false)}
                className="rounded-xl h-9 w-9 p-0"
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--neutral-100)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            
            <div className="flex items-center justify-center py-16">
              <div className="text-center space-y-2">
                <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground" />
                <h3 className="text-lg font-semibold">Coming Soon</h3>
                <p className="text-sm text-muted-foreground">
                  Group chats are still in development
                </p>
              </div>
            </div>
            
            <Button
              onClick={() => setShowGroupCreate(false)}
                    className="w-full shadow-lg hover:shadow-xl rounded-xl py-6 font-semibold text-base transition-all duration-300" 
                    style={{ 
                      backgroundColor: 'var(--brand-pink-500)',
                      color: 'var(--neutral-50)'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-pink-600)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'var(--brand-pink-500)'; }}
            >
              Close
            </Button>
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
                  <AvatarImage src={selectedReviewDetail.author?.avatar_url || undefined} />
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
                      <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600 mb-3">
                        {selectedReviewDetail.event_info?.artist_name && (
                          <Badge variant="secondary" className="cursor-pointer hover:bg-indigo-100">
                            {selectedReviewDetail.event_info.artist_name}
                          </Badge>
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

      {/* Event Details Modal */}
      {selectedEvent && (
        <EventDetailsModal
          event={selectedEvent}
          currentUserId={currentUserId}
          isOpen={eventDetailsOpen}
          onClose={() => {
            setEventDetailsOpen(false);
            setSelectedEvent(null);
            // Trigger refresh of event message cards when modal closes
            setRefreshTrigger(prev => prev + 1);
          }}
          onInterestToggle={handleInterestToggle}
          isInterested={selectedEventInterested}
        />
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
                          <AvatarImage src={participant.avatar_url || undefined} />
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
                              <Badge variant="default" className="text-[10px]" style={{ backgroundColor: 'var(--status-success-500)', color: 'var(--neutral-50)' }}>
                                ✓ Verified
                              </Badge>
                            )}
                          </div>
                          {participant.bio && (
                            <p className="text-[14px] truncate mt-1" style={{ color: 'var(--neutral-600)' }}>
                              {participant.bio}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            {isAdmin && (
                              <Badge variant="default" className="text-[12px]" style={{ backgroundColor: 'var(--brand-pink-500)', color: 'var(--neutral-50)' }}>
                                Admin
                              </Badge>
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
    </div>
  );
};
