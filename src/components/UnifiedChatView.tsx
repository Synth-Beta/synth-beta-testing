import React, { useState, useEffect, useRef } from 'react';
import { SkeletonChatMessage } from '@/components/skeleton/SkeletonChatMessage';
import { SkeletonNotificationCard } from '@/components/skeleton/SkeletonNotificationCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
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
  ChevronRight
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { FriendsService } from '@/services/friendsService';
import { useToast } from '@/hooks/use-toast';
import { SynthLoadingScreen } from '@/components/ui/SynthLoader';
import { format, parseISO } from 'date-fns';
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
}

export const UnifiedChatView = ({ currentUserId, onBack }: UnifiedChatViewProps) => {
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

  const getChatDisplayName = (chat: Chat) => {
    if (chat.is_group_chat) {
      // Remove any " Group Chat" suffix that might have been added
      return chat.chat_name.replace(/\s+Group\s+Chat\s*$/, '');
    }
    
    // For direct chats, find the specific other user for this chat (Bug 1 fix)
    const otherUserId = chatToOtherUserMap.get(chat.id);
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
    const otherUserId = chatToOtherUserMap.get(chat.id);
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
            verified,
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

      // Map participant data with user info
      const participantList = participantData
        .map(p => {
          const user = p.users as any;
          if (!user) return null;

          return {
            id: p.id,
        user_id: p.user_id,
            name: user.name || 'Unknown User',
            avatar_url: user.avatar_url || null,
            bio: user.bio || null,
            verified: user.verified || false,
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
      const { data: messageData, error: messageError } = await supabase
        .from('messages')
        .select('shared_event_id')
        .eq('chat_id', chatId)
        .not('shared_event_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!messageError && messageData?.shared_event_id) {
        // Fetch full event data from helper view to get normalized artist/venue names
        const { data: eventData, error: eventError } = await supabase
          .from('events_with_artist_venue')
          .select('id, title, event_date, images, artist_name_normalized, venue_name_normalized')
          .eq('id', messageData.shared_event_id)
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

  if (loading) {
    return <SynthLoadingScreen text="Loading messages..." />;
  }

  return (
    <div 
      className="flex min-h-screen bg-[#fcfcfc] w-full max-w-[393px] mx-auto"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'max(5rem, calc(5rem + env(safe-area-inset-bottom, 0px)))'
      }}
    >
      {/* Left Sidebar - Chat List */}
      {!selectedChat && (
        <div className="w-full border-synth-black/10 bg-white/98 backdrop-blur-md flex flex-col shadow-2xl">
        {/* Header */}
        <div className="p-5 border-b border-synth-black/10 bg-[#fcfcfc] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)]">
          <div className="mb-5">
            <h1 className="text-[36px] font-bold text-[#0e0e0e] leading-[normal]">Messages</h1>
          </div>
          
          {/* Action Button with Dropdown */}
            <Button 
            className="w-full bg-[#cc2486] hover:bg-[#b01f75] text-white font-normal shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] hover:shadow-lg transition-all duration-300 rounded-[10px] py-2 px-[15px] h-[36px] border-2 border-[#cc2486] flex items-center justify-center gap-[10px]"
              onClick={(e) => {
                e.preventDefault();
                console.log('🟢 Button clicked! Opening user search');
                setShowUserSearch(true);
              }}
            >
            <span className="text-[16px]">New Chat</span>
            <Plus className="w-6 h-6" />
            </Button>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-[60px] p-8 min-h-full">
              {/* New Chat Button - Already in header, but shown in empty state per Figma */}
              
              {/* Empty State Content */}
              <div className="flex flex-col gap-[6px] items-center justify-center">
                {/* Chat Bubble Icon */}
                <MessageCircle className="w-[60px] h-[60px] text-[#5d646f] stroke-2" />
                
                {/* "No Conversations Yet" Heading */}
                <h2 className="font-medium text-[20px] leading-[normal] text-[#0e0e0e] text-center">
                  No Conversations Yet
                </h2>
                
                {/* Subtitle */}
                <p className="font-normal text-[16px] leading-[normal] text-[#5d646f] text-center">
                  Start chatting with your friends!
                </p>
              </div>
              
              {/* Instructions Box */}
              <div className="bg-[#fdf2f7] border-[3px] border-[#b00056] rounded-[12px] p-3 w-[353px] min-h-[110px] flex items-center justify-center">
                <ul className="list-disc text-[16px] font-normal leading-[normal] text-[#0e0e0e] space-y-0 ml-6">
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
            <div className="p-3 space-y-2">
              {chats.map((chat) => (
                <Card
                  key={chat.id}
                  className={`cursor-pointer transition-all duration-300 rounded-2xl border-2 ${
                    selectedChat?.id === chat.id
                      ? 'bg-gradient-to-br from-synth-pink/15 to-synth-pink/5 border-synth-pink/40 shadow-xl shadow-synth-pink/10 transform scale-[1.02]'
                      : 'hover:bg-gradient-to-br hover:from-synth-beige/40 hover:to-synth-beige-light/20 hover:border-synth-black/20 hover:shadow-lg border-synth-black/10 bg-white/60 backdrop-blur-sm'
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      {/* Unread indicator - pink dot on far left, vertically centered */}
                      {chat.has_unread ? (
                        <div className="w-3 h-3 bg-gradient-to-br from-synth-pink to-synth-pink-light rounded-full flex-shrink-0 shadow-lg shadow-synth-pink/30 animate-pulse" />
                      ) : (
                        <div className="w-3 flex-shrink-0" />
                      )}
                      <div 
                        className="flex-1 flex items-center gap-4 cursor-pointer min-w-0"
                        onClick={() => setSelectedChat(chat)}
                      >
                        <Avatar className={`w-12 h-12 flex-shrink-0 ring-2 transition-all duration-300 ${
                          selectedChat?.id === chat.id 
                            ? 'ring-synth-pink/30 shadow-lg' 
                            : 'ring-synth-black/5 hover:ring-synth-pink/20'
                        }`}>
                          <AvatarImage src={getChatAvatar(chat) || undefined} />
                          <AvatarFallback className={`${
                            selectedChat?.id === chat.id 
                              ? 'bg-gradient-to-br from-synth-pink/20 to-synth-pink-light/10 text-synth-black font-semibold' 
                              : 'bg-synth-beige/50 text-synth-black font-medium'
                          }`}>
                            {chat.is_group_chat ? (
                              <Users className="w-6 h-6" />
                            ) : (
                              getChatDisplayName(chat).split(' ').map(n => n[0]).join('')
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h3 className={`font-semibold break-words transition-colors ${
                              selectedChat?.id === chat.id ? 'text-synth-black' : 'text-gray-900'
                            }`}>
                              {getChatDisplayName(chat)}
                            </h3>
                            {chat.latest_message_created_at && (
                              <span className={`text-xs flex-shrink-0 font-medium whitespace-nowrap ${
                                selectedChat?.id === chat.id ? 'text-synth-black/60' : 'text-gray-500'
                              }`}>
                                {formatChatTimestamp(chat.latest_message_created_at)}
                              </span>
                            )}
                          </div>
                          <p className={`text-sm break-words mb-1 ${
                            selectedChat?.id === chat.id ? 'text-synth-black/70' : 'text-gray-600'
                          }`}>
                            {chat.latest_message ? (
                              <span>
                                <span className="font-medium">{chat.latest_message_sender_name}:</span> {chat.latest_message}
                              </span>
                            ) : (
                              <span className="text-gray-400 italic">No messages yet</span>
                            )}
                          </p>
                          {chat.is_group_chat && chat.is_verified && (
                            <div className="flex items-center gap-2 mt-2">
                                <Badge 
                                  variant="default" 
                                className="text-xs bg-gradient-to-r from-green-100 to-emerald-50 text-green-800 border-green-300/50 shadow-sm font-medium"
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
                        className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 flex-shrink-0 rounded-lg transition-all duration-200"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Right Side - Messages */}
      {selectedChat && (
        <div className="w-full flex flex-col bg-white min-h-0">
          <>
            {/* Chat Header */}
            <div className="h-[44px] bg-[#fcfcfc] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] flex items-center justify-between px-5">
              <div className="flex items-center gap-[6px]">
                <button
                  onClick={() => setSelectedChat(null)}
                  className="w-6 h-6 flex items-center justify-center cursor-pointer"
                >
                  <ArrowLeft className="w-6 h-6 text-[#0e0e0e]" />
                </button>
                <Avatar className="w-8 h-8 flex-shrink-0">
                    <AvatarImage src={getChatAvatar(selectedChat) || undefined} />
                  <AvatarFallback className="bg-synth-beige/50 text-synth-black font-medium text-base">
                      {selectedChat.is_group_chat ? (
                      <Users className="w-5 h-5" />
                      ) : (
                        getChatDisplayName(selectedChat).split(' ').map(n => n[0]).join('')
                      )}
                    </AvatarFallback>
                  </Avatar>
                <h2 className="font-bold text-[24px] text-[#0e0e0e] leading-[normal]">
                            {getChatDisplayName(selectedChat)}
                          </h2>
                </div>
                
              {/* Info Icon */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                    <MoreVertical className="h-6 w-6 text-[#0e0e0e]" />
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
                    
                    <DropdownMenuItem onClick={() => handleViewProfile(selectedChat.users.find(id => id !== currentUserId) || '')}>
                      <User className="mr-2 h-4 w-4" />
                      <span>View Profile</span>
                    </DropdownMenuItem>
                    
                    <DropdownMenuItem onClick={() => handleBlockUser(selectedChat.users.find(id => id !== currentUserId) || '')}>
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
            <div className="flex-1 overflow-y-auto bg-white px-5 py-6">
              {selectedChat.is_group_chat ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-2">
                    <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground" />
                    <h3 className="text-lg font-semibold">Coming Soon</h3>
                    <p className="text-sm text-muted-foreground">
                      Group chats are still in development
                    </p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col gap-[6px] items-center justify-center h-full">
                  <MessageCircle className="w-[60px] h-[60px] text-[#cc2486] stroke-2" />
                  <p className="font-medium text-[20px] text-[#0e0e0e] leading-[normal]">No Messages Yet</p>
                  <p className="font-normal text-[16px] text-[#5d646f] leading-[normal]">Start the conversation!</p>
                </div>
              ) : (
                <div className="flex flex-col gap-[24px]">
                  {(() => {
                    // Group consecutive messages from the same sender
                    const messageGroups: Array<Array<typeof messages[0]>> = [];
                    let currentGroup: Array<typeof messages[0]> = [];
                    
                    messages.forEach((message, index) => {
                  const prevMessage = index > 0 ? messages[index - 1] : null;
                      
                      if (prevMessage && prevMessage.sender_id === message.sender_id && 
                          prevMessage.message_type === message.message_type &&
                          (message.message_type === 'text' || message.message_type === 'event_share' || message.message_type === 'review_share')) {
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
                    
                    return messageGroups.map((group, groupIndex) => {
                      const firstMessage = group[0];
                      const lastMessage = group[group.length - 1];
                      const prevGroup = groupIndex > 0 ? messageGroups[groupIndex - 1] : null;
                      const prevMessage = prevGroup ? prevGroup[prevGroup.length - 1] : null;
                      
                  const showSenderInfo = selectedChat?.is_group_chat && 
                        firstMessage.sender_id !== currentUserId && 
                        (prevMessage === null || prevMessage.sender_id !== firstMessage.sender_id || 
                     (prevMessage.message_type !== 'text' && prevMessage.message_type !== 'review_share' && prevMessage.message_type !== 'event_share'));
                      
                      const messageDate = parseISO(firstMessage.created_at);
                  const prevMessageDate = prevMessage ? parseISO(prevMessage.created_at) : null;
                  const showDateDivider = !prevMessageDate || 
                    format(messageDate, 'yyyy-MM-dd') !== format(prevMessageDate, 'yyyy-MM-dd');
                  const isToday = format(messageDate, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                      
                      const isSent = firstMessage.sender_id === currentUserId;
                  
                  return (
                        <div key={`group-${groupIndex}`} className={`flex flex-col ${isSent ? 'items-end' : 'items-start'}`}>
                          {showDateDivider && groupIndex === 0 && (
                            <div className="flex justify-center w-full mb-6">
                          <p className="font-normal text-[16px] text-[#0e0e0e] leading-[normal]">
                            {isToday ? `Today ${format(messageDate, 'h:mm a')}` : format(messageDate, 'MMMM d, yyyy')}
                          </p>
                        </div>
                      )}
                          
                        {showSenderInfo && (
                          <div className="flex items-center gap-[6px] mb-[12px]">
                            <Avatar className="w-10 h-10 flex-shrink-0">
                                <AvatarImage src={firstMessage.sender_avatar || undefined} />
                              <AvatarFallback className="bg-synth-beige/50 text-synth-black font-medium text-sm">
                                  {firstMessage.sender_name.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <p className="font-normal text-[16px] text-[#0e0e0e] leading-[normal]">
                                {firstMessage.sender_name}
                            </p>
                          </div>
                        )}
                          
                          {group.length === 1 ? (
                            // Solo message - timestamp directly below
                            <div className="flex flex-col gap-[6px]">
                              {firstMessage.message_type === 'review_share' && firstMessage.shared_review_id ? (
                                <>
                                  <ReviewMessageCard
                                    reviewId={firstMessage.shared_review_id}
                                    customMessage={firstMessage.metadata?.custom_message}
                                    onReviewClick={handleReviewClick}
                                    currentUserId={currentUserId}
                                    metadata={firstMessage.metadata}
                                  />
                                  <p className="text-[16px] text-[#5d646f] font-normal leading-[normal]">
                                    {format(parseISO(firstMessage.created_at), 'h:mm a')}
                                  </p>
                                </>
                              ) : firstMessage.message_type === 'event_share' && firstMessage.shared_event_id ? (
                                <>
                                  <EventMessageCard
                                    eventId={firstMessage.shared_event_id}
                                    customMessage={firstMessage.metadata?.custom_message}
                                    onEventClick={handleEventClick}
                                    onInterestToggle={handleInterestToggle}
                                    onAttendanceToggle={handleAttendanceToggle}
                                    currentUserId={currentUserId}
                                    refreshTrigger={refreshTrigger}
                                  />
                                  <p className="text-[16px] text-[#5d646f] font-normal leading-[normal]">
                                    {format(parseISO(firstMessage.created_at), 'h:mm a')}
                                  </p>
                                </>
                              ) : (
                                <>
                                  <div
                                    className={`max-w-[172px] p-[12px] rounded-[10px] border border-[#c9c9c9] ${
                                      firstMessage.sender_id === currentUserId
                                        ? 'bg-[#cc2486] text-[#fcfcfc]'
                                        : 'bg-[rgba(201,201,201,0.5)] text-[#0e0e0e]'
                                    }`}
                                  >
                                    <p className="font-normal text-[16px] leading-[normal] break-words whitespace-pre-wrap w-[150px]">
                                      {firstMessage.content}
                                    </p>
                                  </div>
                                  <p className="text-[16px] text-[#5d646f] font-normal leading-[normal]">
                                    {format(parseISO(firstMessage.created_at), 'h:mm a')}
                                  </p>
                                </>
                              )}
                            </div>
                          ) : (
                            // Multiple messages - group together, timestamp only on last
                            <div className="flex flex-col gap-[6px]">
                              {group.map((message, msgIndex) => {
                                const isLastInGroup = msgIndex === group.length - 1;
                                
                                return (
                                  <div key={message.id} className="flex flex-col gap-[6px]">
                    {message.message_type === 'review_share' && message.shared_review_id ? (
                        <ReviewMessageCard
                          reviewId={message.shared_review_id}
                          customMessage={message.metadata?.custom_message}
                          onReviewClick={handleReviewClick}
                          currentUserId={currentUserId}
                          metadata={message.metadata}
                        />
                    ) : message.message_type === 'event_share' && message.shared_event_id ? (
                        <EventMessageCard
                          eventId={message.shared_event_id}
                          customMessage={message.metadata?.custom_message}
                          onEventClick={handleEventClick}
                          onInterestToggle={handleInterestToggle}
                          onAttendanceToggle={handleAttendanceToggle}
                          currentUserId={currentUserId}
                          refreshTrigger={refreshTrigger}
                        />
                                    ) : (
                                      <div
                                        className={`max-w-[172px] p-[12px] rounded-[10px] border border-[#c9c9c9] ${
                          message.sender_id === currentUserId
                                            ? 'bg-[#cc2486] text-[#fcfcfc]'
                                            : 'bg-[rgba(201,201,201,0.5)] text-[#0e0e0e]'
                        }`}
                      >
                                        <p className="font-normal text-[16px] leading-[normal] break-words whitespace-pre-wrap w-[150px]">
                                          {message.content}
                            </p>
                        </div>
                                    )}
                                    {isLastInGroup && (
                                      <p className="text-[16px] text-[#5d646f] font-normal leading-[normal]">
                          {format(parseISO(message.created_at), 'h:mm a')}
                        </p>
                        )}
                                  </div>
                                );
                              })}
                      </div>
                    )}
                    </div>
                  );
                    });
                  })()}
                <div ref={messagesEndRef} />
                </div>
              )}
            </div>

            {/* Message Input - Hide for group chats */}
            {!selectedChat.is_group_chat && (
              <div className="px-5 pb-5 bg-white">
                <div className="bg-[#fcfcfc] border-2 border-[#c9c9c9] rounded-[10px] flex items-center justify-between h-[44px] pl-5 pr-[1px]">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    className="bg-transparent border-0 flex-1 h-full text-[16px] text-[#5d646f] placeholder:text-[#5d646f] focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
                />
                <Button 
                  onClick={sendMessage} 
                  disabled={!newMessage.trim()}
                    className="bg-[#cc2486] hover:bg-[#b01f75] text-white h-[44px] w-[44px] p-0 rounded-br-[10px] rounded-tr-[10px] rounded-bl-0 rounded-tl-0 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                >
                    <Send className="w-[22px] h-[22px] text-[#fcfcfc]" />
                </Button>
              </div>
            </div>
            )}
          </>
          </div>
        )}

      {/* User Search Modal - Direct Message Selection */}
      {showUserSearch && (
        <div className="fixed inset-0 bg-[rgba(14,14,14,0.5)] flex items-center justify-center z-[9999]">
          <div className="bg-[#fcfcfc] border border-[#5d646f] rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] w-[353px] h-[452px] flex flex-col p-3 relative">
            {/* Close Button */}
            <button
                  onClick={() => {
                    setShowUserSearch(false);
                    setSelectedUsers([]);
                    setSearchQuery('');
                  }}
              className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center cursor-pointer hover:bg-gray-100 rounded transition-colors"
                >
              <X className="w-5 h-5 text-[#0e0e0e]" />
            </button>
            
            {/* Main Content */}
            <div className="flex flex-col gap-3 w-full">
              {/* Title */}
              <h2 className="font-bold text-[20px] text-[#0e0e0e] leading-[normal]">
                Select Users to Chat With
              </h2>
              
              {/* Search Input */}
              <div className="relative">
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-[#fcfcfc] border-2 border-[#5d646f] rounded-[10px] h-[45px] pl-[9px] pr-[40px] text-[16px] text-[#5d646f] placeholder:text-[#5d646f] focus:border-[#5d646f] focus:ring-0"
                />
                <Search className="absolute right-[9px] top-1/2 -translate-y-1/2 w-6 h-6 text-[#5d646f]" />
                </div>
            
              {/* Friends List */}
              <div className="flex flex-col gap-3 h-[235px] overflow-y-auto overflow-x-hidden">
              {filteredUsers.length === 0 ? (
                  <div className="text-center py-12">
                    <Users className="w-12 h-12 mx-auto mb-2 text-[#5d646f]" />
                    <p className="text-[#0e0e0e] font-medium mb-1">No friends to chat with yet</p>
                    <p className="text-sm text-[#5d646f]">
                    You need to be friends with someone before you can chat with them.
                  </p>
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const isSelected = selectedUsers.some(u => u.user_id === user.user_id);
                  return (
                    <div
                      key={user.user_id}
                        className={`bg-[#fcfcfc] border border-[#cc2486] rounded-[10px] shadow-[0px_4px_4px_0px_rgba(0,0,0,0.25)] h-[60px] cursor-pointer flex items-center px-[7px] gap-[45px] transition-all ${
                          isSelected ? 'bg-synth-pink/5' : 'hover:bg-gray-50'
                      }`}
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
                            <p className="font-bold text-[20px] text-[#0e0e0e] leading-[normal] truncate">
                              {user.name}
                            </p>
                        {user.bio && (
                              <p className="font-normal text-[16px] text-[#5d646f] leading-[normal] truncate">
                                {user.bio}
                              </p>
                        )}
                      </div>
                        </div>
                        
                        {/* Arrow Icon */}
                        <ChevronRight className="w-6 h-6 text-[#0e0e0e] flex-shrink-0" />
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-3xl p-8 w-full max-w-lg mx-4 shadow-2xl border-2 border-synth-black/10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-synth-black">Create Group Chat</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowGroupCreate(false)}
                className="rounded-xl hover:bg-synth-black/5 h-9 w-9 p-0"
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
              className="w-full bg-gradient-to-r from-synth-pink to-synth-pink-light hover:from-synth-pink-dark hover:to-synth-pink text-white shadow-lg hover:shadow-xl rounded-xl py-6 font-semibold text-base transition-all duration-300"
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
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={selectedReviewDetail.author?.avatar_url || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-pink-500 to-purple-600 text-white">
                    {selectedReviewDetail.author?.name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{selectedReviewDetail.author?.name || 'User'}</span>
                  </div>
                  <div className="text-xs text-gray-500">
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
                  <div className="text-center text-white">
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
          <DialogContent className="max-w-[393px] max-h-[80vh] overflow-y-auto bg-[#fcfcfc]">
            <DialogHeader>
              <DialogTitle className="text-[20px] font-bold text-[#0e0e0e]">
                Group Members ({chatParticipants.length})
              </DialogTitle>
              <DialogDescription className="text-[16px] text-[#5d646f]">
                Members of this group chat
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 mt-4">
              {chatParticipants.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 text-[#5d646f] mx-auto mb-4" />
                  <p className="text-[16px] text-[#5d646f]">No members found</p>
                </div>
              ) : (
                chatParticipants.map((participant) => {
                  const isCurrentUser = participant.user_id === currentUserId;
                  const isAdmin = participant.is_admin;
                  
                  return (
                    <div
                      key={participant.id || participant.user_id}
                      className="flex items-center justify-between p-3 border border-[#c9c9c9] rounded-[10px] bg-white hover:bg-gray-50 transition-colors"
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
                          <AvatarFallback className="bg-synth-beige/50 text-synth-black font-medium">
                            {participant.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-[16px] text-[#0e0e0e] truncate">
                              {participant.name}
                              {isCurrentUser && (
                                <span className="text-[14px] text-[#5d646f] font-normal ml-1">(You)</span>
                              )}
                            </h3>
                            {participant.verified && (
                              <Badge variant="default" className="text-[10px] bg-green-500 text-white">
                                ✓ Verified
                              </Badge>
                            )}
                          </div>
                          {participant.bio && (
                            <p className="text-[14px] text-[#5d646f] truncate mt-1">
                              {participant.bio}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-1">
                            {isAdmin && (
                              <Badge variant="default" className="text-[12px] bg-[#cc2486] text-white">
                                Admin
                              </Badge>
                            )}
                            <span className="text-[12px] text-[#5d646f]">
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
                          className="text-[#5d646f] hover:text-[#cc2486] hover:bg-pink-50 p-2 flex-shrink-0"
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
