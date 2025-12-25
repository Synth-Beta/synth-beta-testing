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
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { FriendsService } from '@/services/friendsService';
import { useToast } from '@/hooks/use-toast';
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
  unread_count?: number;
  // Verified chat fields
  entity_type?: 'event' | 'artist' | 'venue' | null;
  entity_id?: string | null;
  is_verified?: boolean;
  member_count?: number;
  last_activity_at?: string | null;
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

    // Fetch full review details
    try {
      const { data, error } = await (supabase as any)
        .from('reviews')
        .select(`
          photos,
          videos,
          performance_rating,
          venue_rating,
          overall_experience_rating,
          performance_review_text,
          venue_review_text,
          overall_experience_review_text,
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

      // Fetch unread counts for each chat
      // We'll track read status by storing the last message ID the user has seen per chat
      // For now, we'll use a simple approach: if user has selected the chat, it's read
      // In a full implementation, you'd use a read_receipts table or last_read_message_id
      const chatsWithUnread = await Promise.all((data || []).map(async (chat) => {
        try {
          // Get the latest message in this chat
          const { data: latestMessage } = await supabase
            .from('messages')
            .select('id, created_at, sender_id')
            .eq('chat_id', chat.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          // If there's no latest message or it's from the current user, no unread
          if (!latestMessage || latestMessage.sender_id === currentUserId) {
            return {
              ...chat,
              unread_count: 0
            };
          }

          // Check if user has a read receipt for this chat
          // For now, we'll use localStorage to track which chats have been viewed
          const readChats = JSON.parse(localStorage.getItem('read_chats') || '[]');
          const isRead = readChats.includes(chat.id);
          
          // If chat has been read, no unread messages
          if (isRead) {
            return {
              ...chat,
              unread_count: 0
            };
          }

          // Count messages not sent by current user (these are unread)
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('chat_id', chat.id)
            .neq('sender_id', currentUserId);
          
          return {
            ...chat,
            unread_count: count || 0
          };
        } catch (error) {
          console.error('Error fetching unread count for chat:', chat.id, error);
          return {
            ...chat,
            unread_count: 0
          };
        }
      }));

      // Sort by latest_message_created_at descending (most recent first)
      const sortedChats = chatsWithUnread.sort((a, b) => {
        const aTime = a.latest_message_created_at ? new Date(a.latest_message_created_at).getTime() : 0;
        const bTime = b.latest_message_created_at ? new Date(b.latest_message_created_at).getTime() : 0;
        return bTime - aTime; // Descending order
      });

      // Ensure all required fields are present
      const normalizedChats: Chat[] = sortedChats.map(chat => ({
        ...chat,
        latest_message_id: chat.latest_message_id ?? null,
        latest_message: chat.latest_message ?? null,
        latest_message_created_at: chat.latest_message_created_at ?? null,
        latest_message_sender_name: chat.latest_message_sender_name ?? null,
        group_admin_id: chat.group_admin_id ?? null,
        created_at: chat.created_at ?? new Date().toISOString(),
        updated_at: chat.updated_at ?? new Date().toISOString(),
      }));
      
      setChats(normalizedChats);
      
      // Fetch user profiles for direct chat participants (to improve getChatDisplayName)
      // Query chat_participants for direct chats instead of using users array
      const directChatIds = sortedChats
        .filter(chat => !chat.is_group_chat)
        .map(chat => chat.id);
      
      if (directChatIds.length > 0) {
        const { data: participants } = await supabase
          .from('chat_participants')
          .select('chat_id, user_id')
          .in('chat_id', directChatIds)
          .neq('user_id', currentUserId);
        
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
      return null; // Group chat - could add group avatar logic
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
      // Store in localStorage that this chat has been read
      const readChats = JSON.parse(localStorage.getItem('read_chats') || '[]');
      if (!readChats.includes(chatId)) {
        readChats.push(chatId);
        localStorage.setItem('read_chats', JSON.stringify(readChats));
      }

      // Update unread count to 0 for this chat in local state
      setChats(prev => prev.map(chat => 
        chat.id === chatId ? { ...chat, unread_count: 0 } : chat
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
      const { data, error } = await supabase
        .from('chats')
        .select('users')
        .eq('id', chatId)
        .single();

      if (error) throw error;

      const participantIds = data.users || [];
      const participants = users.filter(user => participantIds.includes(user.user_id));
      setChatParticipants(participants);
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
    // TODO: Implement view users modal
    toast({
      title: 'View Users',
      description: 'User list functionality will be implemented soon',
    });
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
    return (
      <div className="fixed inset-0 flex h-screen synth-gradient-card z-[9999]">
        {/* Left Sidebar skeleton */}
        <div className="w-1/3 border-r border-synth-black/10 bg-white/95 backdrop-blur-sm flex flex-col">
          {/* Header skeleton */}
          <div className="p-6 border-b border-synth-black/10 bg-gradient-to-r from-synth-beige to-synth-beige-light">
            <div className="flex items-center gap-3 mb-4">
              <SynthSLogo size="sm" className="animate-breathe" />
              <div className="h-8 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-24"></div>
            </div>
          </div>
          
          {/* Chat list skeleton */}
          <div className="flex-1 p-6 space-y-3">
            <SkeletonNotificationCard />
            <SkeletonNotificationCard />
            <SkeletonNotificationCard />
          </div>
        </div>
        
        {/* Main chat area skeleton */}
        <div className="flex-1 flex flex-col bg-white/95">
          <div className="p-6 border-b border-synth-black/10 bg-gradient-to-r from-synth-beige to-synth-beige-light">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-pink-100 to-pink-200 rounded-full animate-pulse"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gradient-to-r from-pink-100 to-white rounded animate-pulse w-24"></div>
                <div className="h-3 bg-gradient-to-r from-pink-50 to-white rounded animate-pulse w-16"></div>
              </div>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            <SkeletonChatMessage />
            <SkeletonChatMessage />
            <SkeletonChatMessage />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex h-screen synth-gradient-card z-[9999]">
      {/* Left Sidebar - Chat List */}
      <div className="w-1/3 border-r border-synth-black/10 bg-white/95 backdrop-blur-sm flex flex-col shadow-xl">
        {/* Header */}
        <div className="p-6 border-b border-synth-black/10 bg-gradient-to-r from-synth-beige to-synth-beige-light">
          <div className="flex items-center gap-3 mb-4">
            <SynthSLogo size="sm" />
            <h1 className="text-2xl font-bold text-synth-black">Messages</h1>
          </div>
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={onBack}
              className="flex items-center gap-2 bg-synth-black/5 border-synth-black/20 text-synth-black hover:bg-synth-black hover:text-white transition-all duration-200"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </div>
          
          {/* Action Button with Dropdown */}
            <Button 
              className="w-full bg-synth-pink hover:bg-synth-pink-dark text-white"
              onClick={(e) => {
                e.preventDefault();
                console.log('🟢 Button clicked! Opening user search');
                setShowUserSearch(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              New Chat
            </Button>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="p-8 text-center text-synth-black/70">
              <MessageCircle className="w-16 h-16 mx-auto mb-4 text-synth-pink/40" />
              <p className="font-semibold mb-2 text-lg text-synth-black">No conversations yet</p>
              <p className="text-sm mb-4 text-synth-black/60">Start chatting with your friends!</p>
              <div className="text-xs text-synth-black/50 space-y-1 bg-synth-beige/30 p-4 rounded-lg">
                <p>• Send friend requests first</p>
                <p>• Wait for them to accept</p>
                <p>• Then start chatting!</p>
              </div>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {chats.map((chat) => (
                <Card
                  key={chat.id}
                  className={`cursor-pointer transition-all duration-200 ${
                    selectedChat?.id === chat.id
                      ? 'bg-synth-pink/10 border-synth-pink/30 shadow-lg'
                      : 'hover:bg-synth-beige/30 hover:shadow-md border-synth-black/10'
                  }`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      {/* Unread indicator - pink dot on far left, vertically centered */}
                      {chat.unread_count && chat.unread_count > 0 ? (
                        <div className="w-2.5 h-2.5 bg-synth-pink rounded-full flex-shrink-0" />
                      ) : (
                        <div className="w-2.5 flex-shrink-0" />
                      )}
                      <div 
                        className="flex-1 flex items-center gap-3 cursor-pointer min-w-0"
                        onClick={() => setSelectedChat(chat)}
                      >
                        <Avatar className="w-10 h-10 flex-shrink-0">
                          <AvatarImage src={getChatAvatar(chat) || undefined} />
                          <AvatarFallback>
                            {chat.is_group_chat ? (
                              <Users className="w-5 h-5" />
                            ) : (
                              getChatDisplayName(chat).split(' ').map(n => n[0]).join('')
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="font-medium text-gray-900 truncate">
                              {getChatDisplayName(chat)}
                            </h3>
                            {chat.latest_message_created_at && (
                              <span className="text-xs text-gray-500 flex-shrink-0">
                                {formatChatTimestamp(chat.latest_message_created_at)}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 truncate">
                            {chat.latest_message ? (
                              <span>
                                {chat.latest_message_sender_name}: {chat.latest_message}
                              </span>
                            ) : (
                              <span className="text-gray-400">No messages yet</span>
                            )}
                          </p>
                          {chat.is_group_chat && (
                            <div className="flex items-center gap-1 mt-1">
                              {chat.is_verified ? (
                                <Badge 
                                  variant="default" 
                                  className="text-xs bg-green-100 text-green-800 border-green-300"
                                >
                                  <Shield className="w-3 h-3 mr-1" />
                                  Verified {chat.entity_type ? chat.entity_type.charAt(0).toUpperCase() + chat.entity_type.slice(1) : 'Chat'}
                                </Badge>
                              ) : (
                            <Badge 
                              variant={eventCreatedChats.has(chat.id) ? "default" : "secondary"} 
                                  className={`text-xs ${
                                eventCreatedChats.has(chat.id) 
                                  ? 'bg-blue-100 text-blue-800 hover:bg-blue-200' 
                                  : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                              }`}
                            >
                              {eventCreatedChats.has(chat.id) ? 'Event Group' : 'User Group'}
                            </Badge>
                              )}
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
                        className="text-gray-400 hover:text-red-500 p-1 flex-shrink-0"
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

      {/* Right Side - Messages */}
      <div className="flex-1 flex flex-col bg-white/95 backdrop-blur-sm shadow-xl">
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="p-6 border-b border-synth-black/10 bg-gradient-to-r from-synth-beige to-synth-beige-light">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Avatar className="w-12 h-12 ring-2 ring-synth-pink/20">
                    <AvatarImage src={getChatAvatar(selectedChat) || undefined} />
                    <AvatarFallback className="bg-synth-pink/10 text-synth-black font-semibold">
                      {selectedChat.is_group_chat ? (
                        <Users className="w-6 h-6" />
                      ) : (
                        getChatDisplayName(selectedChat).split(' ').map(n => n[0]).join('')
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    {selectedChat.is_group_chat ? (
                      isEditingGroupName ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={editedGroupName}
                            onChange={(e) => setEditedGroupName(e.target.value)}
                            className="h-8 w-48"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleSaveGroupName();
                              } else if (e.key === 'Escape') {
                                setIsEditingGroupName(false);
                              }
                            }}
                          />
                          <Button 
                            size="sm" 
                            onClick={() => handleSaveGroupName()}
                          >
                            Save
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => setIsEditingGroupName(false)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                          <h2 
                            className="font-bold text-lg text-synth-black cursor-pointer hover:text-synth-pink transition-colors"
                            onClick={() => {
                                if (!selectedChat.is_verified) {
                              setEditedGroupName(getChatDisplayName(selectedChat));
                              setIsEditingGroupName(true);
                                }
                            }}
                              title={selectedChat.is_verified ? "Verified chat" : "Click to edit group name"}
                          >
                            {getChatDisplayName(selectedChat)}
                          </h2>
                            {selectedChat.is_verified && (
                              <VerifiedBadge variant="default" className="bg-green-100 text-green-800 border-green-300">
                                <Shield className="w-3 h-3 mr-1" />
                                Verified
                              </VerifiedBadge>
                            )}
                          </div>
                          <p className="text-sm text-synth-black/60">
                            {selectedChat.member_count || selectedChat.users.length} {selectedChat.member_count === 1 || selectedChat.users.length === 1 ? 'member' : 'members'}
                            {selectedChat.entity_type && (
                              <span className="ml-2 text-synth-black/40">
                                • {selectedChat.entity_type.charAt(0).toUpperCase() + selectedChat.entity_type.slice(1)} Chat
                              </span>
                            )}
                          </p>
                        </>
                      )
                    ) : (
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                      <h2 className="font-bold text-lg text-synth-black">
                        {getChatDisplayName(selectedChat)}
                      </h2>
                          {selectedChat.is_verified && (
                            <VerifiedBadge variant="default" className="bg-green-100 text-green-800 border-green-300">
                              <Shield className="w-3 h-3 mr-1" />
                              Verified
                            </VerifiedBadge>
                          )}
                        </div>
                        {selectedChat.entity_type && (
                          <p className="text-sm text-synth-black/60">
                            {selectedChat.entity_type.charAt(0).toUpperCase() + selectedChat.entity_type.slice(1)} Chat
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Settings Menu */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreVertical className="h-4 w-4" />
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
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-synth-beige-light/30 to-white">
              {messages.length === 0 ? (
                <div className="text-center text-synth-black/70 mt-12">
                  <MessageCircle className="w-16 h-16 mx-auto mb-4 text-synth-pink/40" />
                  <p className="font-semibold text-lg mb-2">No messages yet</p>
                  <p className="text-sm text-synth-black/60">Start the conversation!</p>
                </div>
              ) : (
                <>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.sender_id === currentUserId ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.message_type === 'review_share' && message.shared_review_id ? (
                      // Review Share Message Card
                      <div className="max-w-md">
                        <div className="text-xs text-gray-500 mb-1">
                          {message.sender_id === currentUserId ? 'You' : message.sender_name} shared a review
                        </div>
                        <ReviewMessageCard
                          reviewId={message.shared_review_id}
                          customMessage={message.metadata?.custom_message}
                          onReviewClick={handleReviewClick}
                          currentUserId={currentUserId}
                          metadata={message.metadata}
                        />
                        <p className="text-xs text-gray-400 mt-1 text-right">
                          {format(parseISO(message.created_at), 'h:mm a')}
                        </p>
                      </div>
                    ) : message.message_type === 'event_share' && message.shared_event_id ? (
                      // Event Share Message Card
                      <div className="max-w-md">
                        <div className="text-xs text-gray-500 mb-1">
                          {message.sender_id === currentUserId ? 'You' : message.sender_name} shared an event
                        </div>
                        <EventMessageCard
                          eventId={message.shared_event_id}
                          customMessage={message.metadata?.custom_message}
                          onEventClick={handleEventClick}
                          onInterestToggle={handleInterestToggle}
                          onAttendanceToggle={handleAttendanceToggle}
                          currentUserId={currentUserId}
                          refreshTrigger={refreshTrigger}
                        />
                        <p className="text-xs text-gray-400 mt-1 text-right">
                          {format(parseISO(message.created_at), 'h:mm a')}
                        </p>
                      </div>
                    ) : message.content?.toLowerCase().includes('check out this event:') ? (
                      // Legacy event share fallback based on message content
                      <div className="max-w-md">
                        <div className="text-xs text-gray-500 mb-1">
                          {message.sender_id === currentUserId ? 'You' : message.sender_name} shared an event
                        </div>
                        <div className="bg-synth-pink/10 border border-synth-pink/20 rounded-lg p-4">
                          <p className="text-sm text-synth-black">{message.content}</p>
                        </div>
                        <p className="text-xs text-gray-400 mt-1 text-right">
                          {format(parseISO(message.created_at), 'h:mm a')}
                        </p>
                      </div>
                    ) : (
                      // Regular Text Message
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl shadow-sm transition-all duration-200 ${
                          message.sender_id === currentUserId
                            ? 'bg-synth-pink text-white shadow-lg hover:shadow-xl'
                            : 'bg-white text-synth-black border border-synth-black/10 hover:shadow-md'
                        }`}
                      >
                        <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{message.content}</p>
                        <p className={`text-xs mt-2 ${
                          message.sender_id === currentUserId ? 'text-white/70' : 'text-synth-black/50'
                        }`}>
                          {format(parseISO(message.created_at), 'h:mm a')}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Message Input - Always show when chat is selected */}
            <div className="p-6 border-t border-synth-black/10 bg-gradient-to-r from-synth-beige to-synth-beige-light">
              <div className="flex gap-3">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  className="flex-1 bg-white/80 border-synth-black/20 focus:border-synth-pink focus:ring-synth-pink/20 rounded-xl"
                />
                <Button 
                  onClick={sendMessage} 
                  disabled={!newMessage.trim()}
                  className="bg-synth-pink hover:bg-synth-pink-dark text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-synth-black/60 mt-3 text-center">
                💬 Messages are saved to your chat history
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-synth-black/70">
            <div className="text-center">
              <MessageCircle className="w-20 h-20 mx-auto mb-6 text-synth-pink/40" />
              <h2 className="text-2xl font-bold mb-3 text-synth-black">Select a conversation</h2>
              <p className="text-synth-black/60">Choose a chat from the sidebar to start messaging</p>
            </div>
          </div>
        )}
      </div>

      {/* User Search Modal - Can select multiple for group or single for direct */}
      {showUserSearch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">
                {selectedUsers.length === 0 ? 'Select Users to Chat' : `${selectedUsers.length} selected`}
              </h2>
              <div className="flex gap-2">
                {selectedUsers.length > 0 && (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={async () => {
                      if (selectedUsers.length === 1) {
                        // Direct message with one person
                        createDirectChat(selectedUsers[0].user_id);
                        setSelectedUsers([]);
                        setSearchQuery('');
                        setShowUserSearch(false);
                      } else if (selectedUsers.length > 1) {
                        // Create group with multiple people
                        const autoGroupName = selectedUsers.map(u => u.name).join(', ');
                        await createGroupChat(autoGroupName);
                      }
                    }}
                  >
                    Start Chat
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowUserSearch(false);
                    setSelectedUsers([]);
                    setSearchQuery('');
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
            
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-4"
            />
            
            {/* Selected Users */}
            {selectedUsers.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium mb-2">Selected:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedUsers.map((user) => (
                    <Badge
                      key={user.user_id}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {user.name}
                      <X 
                        className="w-3 h-3 cursor-pointer" 
                        onClick={() => setSelectedUsers(selectedUsers.filter(u => u.user_id !== user.user_id))}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-8">
                  <Users className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p className="text-gray-500 mb-2">No friends to chat with yet</p>
                  <p className="text-sm text-gray-400">
                    You need to be friends with someone before you can chat with them.
                    <br />
                    Go back and send friend requests first!
                  </p>
                </div>
              ) : (
                filteredUsers.map((user) => {
                  const isSelected = selectedUsers.some(u => u.user_id === user.user_id);
                  return (
                    <div
                      key={user.user_id}
                      className={`flex items-center gap-3 p-3 rounded cursor-pointer border ${
                        isSelected ? 'bg-synth-pink/10 border-synth-pink' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedUsers(selectedUsers.filter(u => u.user_id !== user.user_id));
                        } else {
                          setSelectedUsers([...selectedUsers, user]);
                        }
                      }}
                    >
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={user.avatar_url || undefined} />
                        <AvatarFallback>
                          {user.name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium">{user.name}</p>
                        {user.bio && (
                          <p className="text-sm text-gray-600">{user.bio}</p>
                        )}
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 bg-synth-pink rounded-full flex items-center justify-center">
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Group Create Modal */}
      {showGroupCreate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Create Group Chat</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowGroupCreate(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <Input
              placeholder="Group name..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="mb-4"
            />
            
            <Input
              placeholder="Search users to add..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-4"
            />
            
            {/* Selected Users */}
            {selectedUsers.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium mb-2">Selected Users:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedUsers.map((user) => (
                    <Badge
                      key={user.user_id}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {user.name}
                      <X
                        className="w-3 h-3 cursor-pointer"
                        onClick={() => removeUserFromGroup(user.user_id)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            <div className="max-h-40 overflow-y-auto space-y-2 mb-4">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-6">
                  <Users className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <p className="text-gray-500 mb-1">No friends to add to group</p>
                  <p className="text-sm text-gray-400">
                    You need friends before creating a group chat.
                    <br />
                    Send friend requests first!
                  </p>
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <div
                    key={user.user_id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                    onClick={() => addUserToGroup(user)}
                  >
                    <Avatar className="w-8 h-8">
                      <AvatarImage src={user.avatar_url || undefined} />
                      <AvatarFallback>
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{user.name}</p>
                      {user.bio && (
                        <p className="text-sm text-gray-600">{user.bio}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <Button
              onClick={() => createGroupChat()}
              disabled={selectedUsers.length < 2}
              className="w-full"
            >
              Create Group ({selectedUsers.length} members)
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
    </div>
  );
};
