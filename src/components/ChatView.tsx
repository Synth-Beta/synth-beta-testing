import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  MessageCircle, 
  Send, 
  Users, 
  Plus, 
  ArrowLeft,
  MoreVertical,
  Search,
  User,
  Shield,
  Bell,
  BellOff,
  Calendar,
  Eye,
  UserX
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { ContentModerationService } from '@/services/contentModerationService';
import { fetchUserChats } from '@/services/chatService';

interface ChatMessage {
  id: string;
  chat_id: string;
  sender_id: string;
  message: string;
  created_at: string;
  sender: {
    name: string;
    avatar_url: string | null;
  };
}

interface Chat {
  id: string;
  name: string;
  type: 'direct' | 'group';
  created_at: string;
  participants: Array<{
    user_id: string;
    name: string;
    avatar_url: string | null;
    role: 'admin' | 'member';
  }>;
  last_message?: ChatMessage;
  unread_count: number;
}

interface ChatViewProps {
  currentUserId: string;
  chatUserId?: string; // Optional user ID to start a chat with
  chatId?: string; // Optional chat ID to open a specific chat
  onBack: () => void;
  onNavigateToProfile?: (userId: string) => void;
}

export const ChatView = ({ currentUserId, chatUserId, chatId, onBack, onNavigateToProfile }: ChatViewProps) => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [friends, setFriends] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // Settings menu state
  const [isMuted, setIsMuted] = useState(false);
  const [linkedEvent, setLinkedEvent] = useState<any>(null);
  const [mutedChats, setMutedChats] = useState<Set<string>>(new Set());
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [chatParticipants, setChatParticipants] = useState<any[]>([]);
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDescription, setEditGroupDescription] = useState('');

  useEffect(() => {
    fetchChats();
    fetchFriends();
  }, [currentUserId]);

  // Handle starting a direct chat with a specific user
  useEffect(() => {
    if (chatUserId && currentUserId) {
      createOrFindDirectChat(chatUserId);
    }
  }, [chatUserId, currentUserId]);

  // Handle opening a specific chat by ID
  useEffect(() => {
    if (chatId && chats.length > 0) {
      const targetChat = chats.find(chat => chat.id === chatId);
      if (targetChat) {
        setSelectedChat(targetChat);
      }
    }
  }, [chatId, chats]);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat.id);
      
      // Fetch event information for group chats
      if (selectedChat.type === 'group') {
        fetchLinkedEvent(selectedChat.id);
        fetchChatParticipants(selectedChat.id);
      }
      
      // Check if this chat is muted
      setIsMuted(mutedChats.has(selectedChat.id));
    }
  }, [selectedChat, mutedChats]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const createOrFindDirectChat = async (targetUserId: string) => {
    try {
      console.log('💬 Creating or finding direct chat with:', targetUserId);
      
      // Validate inputs to prevent circular reference issues
      if (!currentUserId || !targetUserId) {
        console.error('Missing user IDs:', { currentUserId, targetUserId });
        return;
      }
      
      // Use the create_direct_chat function from Supabase
      const { data: chatId, error } = await supabase.rpc('create_direct_chat', {
        user1_id: currentUserId,
        user2_id: targetUserId
      });

      if (error) {
        console.error('Error creating direct chat:', error.message || error);
        toast({
          title: "Error",
          description: "Failed to start chat. Please try again.",
          variant: "destructive",
        });
        return;
      }

      console.log('✅ Direct chat created/found with ID:', chatId);

      // Fetch the chat details and set it as selected
      const { data: chatData, error: fetchError } = await supabase
        .from('chats')
        .select('*')
        .eq('id', chatId)
        .single();

      if (fetchError) {
        console.error('Error fetching chat details:', fetchError.message || fetchError);
        return;
      }

      // Get the other user's profile information
      const otherUserId = targetUserId;
      const { data: otherUserProfile, error: profileError } = await supabase
        .from('users')
        .select('name, avatar_url')
        .eq('user_id', otherUserId)
        .single();

      // Transform to match our Chat interface
      const directChat: Chat = {
        id: chatData.id,
        name: otherUserProfile?.name || 'Unknown User', // Use actual user name
        type: 'direct',
        created_at: chatData.created_at,
        participants: [{
          user_id: otherUserId,
          name: otherUserProfile?.name || 'Unknown User',
          avatar_url: otherUserProfile?.avatar_url || null,
          role: 'member'
        }],
        last_message: undefined,
        unread_count: 0
      };

      setSelectedChat(directChat);
      
      // Refresh the chats list to include the new chat
      fetchChats();

    } catch (error) {
      console.error('Error in createOrFindDirectChat:', error);
      toast({
        title: "Error",
        description: "Failed to start chat. Please try again.",
        variant: "destructive",
      });
    }
  };

  const fetchChats = async () => {
    try {
      setLoading(true);
      
      // Use the new function to get user's chats
      const { data, error } = await fetchUserChats(currentUserId);

      if (error) {
        console.error('Error fetching chats:', error);
        return;
      }

      // Transform the data
      // For each chat, get participant information
      const chatsWithParticipants = await Promise.all((data || []).map(async (chat) => {
        let participants = [];
        let displayName = chat.chat_name;

        if (!chat.is_group_chat) {
          // For direct chats, get the other user's profile from chat_participants
          const { data: chatParticipants } = await supabase
            .from('chat_participants')
            .select('user_id, users!user_id(name, avatar_url)')
            .eq('chat_id', chat.id)
            .neq('user_id', currentUserId);
          
          const otherParticipant = chatParticipants?.[0];
          if (otherParticipant) {
            const otherUserId = otherParticipant.user_id;
            const otherUserProfile = otherParticipant.users as any;
            
            participants = [{
              user_id: otherUserId,
              name: otherUserProfile?.name || 'Unknown User',
              avatar_url: otherUserProfile?.avatar_url || null,
              role: 'member' as const
            }];
            
            displayName = otherUserProfile?.name || 'Unknown User';
          }
        }

        return {
          id: chat.id,
          name: displayName,
          type: (chat.is_group_chat ? 'group' : 'direct') as 'direct' | 'group',
          created_at: chat.created_at,
          participants,
          last_message: chat.latest_message ? {
            id: chat.latest_message_id,
            chat_id: chat.id,
            sender_id: '',
            message: chat.latest_message,
            created_at: chat.latest_message_created_at,
            sender: {
              name: chat.latest_message_sender_name || 'Unknown',
              avatar_url: null
            }
          } : undefined,
          unread_count: 0 // Will be calculated separately
        };
      }));

      const chatsList = chatsWithParticipants;

      console.log('💬 Fetched chats count:', chatsList.length);
      setChats(chatsList);
    } catch (error) {
      console.error('Error fetching chats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFriends = async () => {
    try {
      // First, get the friendship records
      const { data: friendships, error: friendsError } = await supabase
        .from('friends')
        .select('id, user1_id, user2_id, created_at')
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false });

      if (friendsError) {
        console.error('Error fetching friends:', friendsError);
        return;
      }

      if (!friendships || friendships.length === 0) {
        setFriends([]);
        return;
      }

      // Get all the user IDs we need to fetch
      const userIds = friendships.map(f => 
        f.user1_id === currentUserId ? f.user2_id : f.user1_id
      );

      // Fetch the profiles for those users
      const { data: profiles, error: profilesError } = await supabase
        .from('users')
        .select('id, user_id, name, avatar_url, bio')
        .in('user_id', userIds);

      if (profilesError) {
        console.error('Error fetching friend profiles:', profilesError);
        return;
      }

      // Transform the data to get the other user's profile
      const friendsList = friendships.map(friendship => {
        const otherUserId = friendship.user1_id === currentUserId ? friendship.user2_id : friendship.user1_id;
        const profile = profiles?.find(p => p.user_id === otherUserId);
        
        return {
          id: profile?.id || otherUserId,
          name: profile?.name || 'Unknown User',
          avatar_url: profile?.avatar_url || null,
          bio: profile?.bio || null
        };
      });

      setFriends(friendsList);
    } catch (error) {
      console.error('Error fetching friends:', error);
    }
  };

  const fetchMessages = async (chatId: string) => {
    try {
      // Fetch messages first
      const { data, error } = await supabase
        .from('messages')
        .select(`
          id,
          chat_id,
          sender_id,
          content,
          created_at
        `)
        .eq('chat_id', chatId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching messages:', error);
        return;
      }

      if (!data || data.length === 0) {
        setMessages([]);
        return;
      }

      // Get unique sender IDs and fetch profiles in parallel
      const senderIds = [...new Set(data.map(msg => msg.sender_id))];
      
      // Fetch profiles while processing messages (parallel operation)
      const profilesPromise = senderIds.length > 0
        ? supabase
            .from('users')
            .select('id, user_id, name, avatar_url')
            .in('user_id', senderIds)
        : Promise.resolve({ data: [], error: null });
      
      const { data: profiles, error: profilesError } = await profilesPromise;

      if (profilesError) {
        console.error('Error fetching sender profiles:', profilesError);
        // Still set messages but without sender info
        const transformedMessages = data.map(msg => ({
          ...msg,
          message: msg.content,
          sender: {
            name: 'Unknown',
            avatar_url: null
          }
        }));
        setMessages(transformedMessages);
        return;
      }

      // Transform the data to match the expected interface
      const transformedMessages = data.map(msg => {
        const profile = profiles?.find(p => p.user_id === msg.sender_id);
        return {
          ...msg,
          message: msg.content, // Map content to message for compatibility
          sender: {
            name: profile?.name || 'Unknown',
            avatar_url: profile?.avatar_url || null
          }
        };
      });

      setMessages(transformedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;

    try {
      const { error } = await supabase
        .from('messages')
        .insert({
          chat_id: selectedChat.id,
          sender_id: currentUserId,
          content: newMessage.trim()
        });

      if (error) {
        console.error('Error sending message:', error);
        toast({
          title: "Error",
          description: "Failed to send message. Please try again.",
          variant: "destructive",
        });
        return;
      }

      setNewMessage('');
      // Refresh messages
      fetchMessages(selectedChat.id);
    } catch (error) {
      console.error('Error sending message:', error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    }
  };

  const createDirectChat = async (friendId: string) => {
    try {
      // Use the database function to create or get existing direct chat
      const { data: chatId, error } = await supabase.rpc('create_direct_chat', {
        user1_id: currentUserId,
        user2_id: friendId
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

  const createGroupChat = async () => {
    if (!groupName.trim() || selectedFriends.length === 0) {
      toast({
        title: "Error",
        description: "Please enter a group name and select at least one friend.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Use the database function to create group chat
      const { data: chatId, error } = await supabase.rpc('create_group_chat', {
        chat_name: groupName.trim(),
        user_ids: selectedFriends,
        admin_id: currentUserId
      });

      if (error) {
        console.error('Error creating group chat:', error);
        toast({
          title: "Error",
          description: "Failed to create group chat. Please try again.",
          variant: "destructive",
        });
        return;
      }

      // Reset form
      setGroupName('');
      setSelectedFriends([]);
      setShowCreateGroup(false);
      
      // Refresh chats
      fetchChats();
      
      toast({
        title: "Group Created! 🎉",
        description: `"${groupName}" group chat is ready!`,
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

  const toggleFriendSelection = (friendId: string) => {
    setSelectedFriends(prev => 
      prev.includes(friendId) 
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  // Fix chat name display by removing " Group Chat" suffix
  const getChatDisplayName = (chatName: string) => {
    return chatName.replace(/\s+Group\s+Chat\s*$/, '');
  };

  // Fetch event information for group chats
  const fetchLinkedEvent = async (chatId: string) => {
    try {
      const { data, error } = await supabase
        .from('event_groups')
        .select(`
          id,
          name,
          event:jambase_events (
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

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching linked event:', error);
        return;
      }

      if (data) {
        setLinkedEvent(data);
      }
    } catch (error) {
      console.error('Error fetching linked event:', error);
    }
  };

  // Fetch chat participants for group chats
  const fetchChatParticipants = async (chatId: string) => {
    try {
      // Get participants from chat_participants table
      const { data: participantData, error: participantsError } = await supabase
        .from('chat_participants')
        .select('user_id, users!user_id(user_id, name, avatar_url)')
        .eq('chat_id', chatId);

      if (participantsError) {
        console.error('Error fetching chat participants:', participantsError);
        return;
      }

      if (!participantData || participantData.length === 0) {
        setChatParticipants([]);
        return;
      }

      // Extract user profiles from the joined data
      const profiles = participantData
        .map(p => p.users as any)
        .filter(Boolean);

      const participantList = profiles?.map(p => ({
        user_id: p.user_id,
        name: p.name || 'Unknown User',
        avatar_url: p.avatar_url || null
      })) || [];

      setChatParticipants(participantList);
    } catch (error) {
      console.error('Error fetching chat participants:', error);
    }
  };

  // Settings menu functions
  const handleViewUsers = () => {
    if (selectedChat && selectedChat.type === 'group') {
      setShowUsersModal(true);
    } else {
      toast({
        title: 'View Users',
        description: 'This feature is only available for group chats',
      });
    }
  };

  const handleViewProfile = () => {
    if (selectedChat && selectedChat.type === 'direct' && selectedChat.participants.length > 0) {
      const otherUser = selectedChat.participants[0];
      if (onNavigateToProfile) {
        onNavigateToProfile(otherUser.user_id);
      } else {
        // Fallback: emit custom event for navigation
        const event = new CustomEvent('open-user-profile', {
          detail: { userId: otherUser.user_id }
        });
        window.dispatchEvent(event);
      }
    } else {
      toast({
        title: 'View Profile',
        description: 'No user profile to view',
      });
    }
  };

  const handleBlockUser = async () => {
    if (selectedChat && selectedChat.type === 'direct' && selectedChat.participants.length > 0) {
      const otherUser = selectedChat.participants[0];
      try {
        await ContentModerationService.blockUser({
          blocked_user_id: otherUser.user_id,
          block_reason: 'Blocked from chat'
        });
        
        toast({
          title: 'User Blocked',
          description: `You won't see content from ${otherUser.name} anymore`,
        });
        
        // Navigate back to chat list after blocking
        setSelectedChat(null);
      } catch (error) {
        console.error('Error blocking user:', error);
        toast({
          title: 'Error',
          description: 'Failed to block user. Please try again.',
          variant: 'destructive',
        });
      }
    } else {
      toast({
        title: 'Block User',
        description: 'No user to block',
      });
    }
  };

  const handleMuteNotifications = () => {
    if (selectedChat) {
      const newMutedChats = new Set(mutedChats);
      if (mutedChats.has(selectedChat.id)) {
        newMutedChats.delete(selectedChat.id);
        setIsMuted(false);
      } else {
        newMutedChats.add(selectedChat.id);
        setIsMuted(true);
      }
      setMutedChats(newMutedChats);
      
      toast({
        title: isMuted ? 'Notifications Unmuted' : 'Notifications Muted',
        description: isMuted ? 'You will receive notifications for this chat' : 'You will not receive notifications for this chat',
      });
    }
  };

  const handleViewEvent = () => {
    if (linkedEvent) {
      toast({
        title: 'View Event',
        description: 'Event view functionality will be implemented soon',
      });
    }
  };

  // Block user from users modal
  const handleBlockUserFromModal = async (userId: string, userName: string) => {
    try {
      await ContentModerationService.blockUser({
        blocked_user_id: userId,
        block_reason: 'Blocked from group chat'
      });
      
      toast({
        title: 'User Blocked',
        description: `You won't see content from ${userName} anymore`,
      });
      
      // Close the modal
      setShowUsersModal(false);
    } catch (error) {
      console.error('Error blocking user:', error);
      toast({
        title: 'Error',
        description: 'Failed to block user. Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Edit group info handler
  const handleEditGroupInfo = () => {
    if (selectedChat && selectedChat.type === 'group') {
      setEditGroupName(selectedChat.name || '');
      setEditGroupDescription(''); // You might want to fetch this from the database
      setShowEditGroupModal(true);
    }
  };

  // Save group info changes
  const handleSaveGroupInfo = async () => {
    if (!selectedChat || selectedChat.type !== 'group') return;

    try {
      const { error } = await supabase
        .from('chats')
        .update({
          chat_name: editGroupName.trim() || 'Group Chat',
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedChat.id);

      if (error) {
        console.error('Error updating group info:', error);
        toast({
          title: 'Error',
          description: 'Failed to update group info. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      // Update local state
      setSelectedChat({
        ...selectedChat,
        name: editGroupName.trim() || 'Group Chat'
      });

      // Update chats list
      setChats(prevChats => 
        prevChats.map(chat => 
          chat.id === selectedChat.id 
            ? { ...chat, name: editGroupName.trim() || 'Group Chat' }
            : chat
        )
      );

      toast({
        title: 'Group Updated',
        description: 'Group information has been updated successfully.',
      });

      setShowEditGroupModal(false);
    } catch (error) {
      console.error('Error saving group info:', error);
      toast({
        title: 'Error',
        description: 'Failed to save group info. Please try again.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>Loading chats...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto h-screen flex">
        {/* Sidebar - Chat List */}
        <div className="w-1/3 bg-white border-r border-gray-200 flex flex-col">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <Button 
                variant="outline" 
                onClick={onBack}
                className="hover-button flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4 hover-icon" />
                Back
              </Button>
              <Button
                onClick={() => setShowCreateGroup(true)}
                className="hover-button gradient-button"
              >
                <Plus className="w-4 h-4 mr-1 hover-icon" />
                New Group
              </Button>
            </div>
            
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
              <Input
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-gray-200 focus:border-pink-400 hover:border-pink-300"
              />
            </div>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            {chats.length === 0 ? (
              <div className="p-4 text-center">
                <MessageCircle className="w-12 h-12 mx-auto mb-3 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                <h3 className="font-semibold gradient-text mb-1">No Chats Yet</h3>
                <p className="text-sm text-gray-600">Start a conversation with your friends!</p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {chats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => setSelectedChat(chat)}
                    className={`p-3 rounded-lg cursor-pointer hover-card ${
                      selectedChat?.id === chat.id 
                        ? 'bg-gradient-to-r from-pink-50 to-white border border-pink-200' 
                        : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {chat.type === 'group' ? (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-pink-100 to-white flex items-center justify-center">
                          <Users className="w-5 h-5 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                        </div>
                      ) : (
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={chat.participants[0]?.avatar_url || undefined} />
                          <AvatarFallback className="text-xs bg-gradient-to-r from-pink-100 to-white">
                            {chat.participants[0]?.name?.split(' ').map(n => n[0]).join('') || 'U'}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold gradient-text truncate">
                            {getChatDisplayName(chat.name || 'Direct Chat')}
                          </h3>
                          {mutedChats.has(chat.id) && (
                            <BellOff className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                        {chat.last_message && (
                          <p className="text-sm text-gray-600 truncate">
                            {chat.last_message.sender.name}: {chat.last_message.message}
                          </p>
                        )}
                        <p className="text-xs text-gray-500">
                          {chat.last_message ? format(parseISO(chat.last_message.created_at), 'MMM d, h:mm a') : 'No messages'}
                        </p>
                      </div>
                      {chat.unread_count > 0 && (
                        <Badge className="gradient-badge text-xs">
                          {chat.unread_count}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex-1 flex flex-col">
          {selectedChat ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-gray-200 bg-white">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                      {selectedChat.type === 'group' ? (
                        <Users className="w-5 h-5 text-gray-600" />
                      ) : (
                        <MessageCircle className="w-5 h-5 text-gray-600" />
                      )}
                    </div>
                    <div>
                      <h2 className="font-semibold text-gray-900">
                        {getChatDisplayName(selectedChat.name || 'Direct Chat')}
                      </h2>
                      <p className="text-sm text-gray-600">
                        {selectedChat.type === 'group' 
                          ? (linkedEvent?.description || 'Group chat')
                          : 'Direct message'
                        }
                      </p>
                      {linkedEvent && linkedEvent.event && (
                        <p 
                          className="text-xs text-blue-600 mt-1 cursor-pointer hover:text-blue-800 hover:underline"
                          onClick={() => {
                            // Navigate to event details
                            const event = new CustomEvent('open-event-details', {
                              detail: { 
                                event: linkedEvent.event,
                                eventId: linkedEvent.event.id 
                              }
                            });
                            window.dispatchEvent(event);
                          }}
                        >
                          📅 {linkedEvent.event.title} - {linkedEvent.event.artist_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Settings Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="hover-button">
                          <MoreVertical className="w-4 h-4 hover-icon" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56 bg-white border border-gray-200 shadow-lg">
                        {selectedChat.type === 'group' && (
                          <>
                            <DropdownMenuItem onClick={handleViewUsers}>
                              <Users className="mr-2 h-4 w-4" />
                              <span>View Users</span>
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem onClick={handleEditGroupInfo}>
                              <User className="mr-2 h-4 w-4" />
                              <span>Edit Group Info</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        
                        {selectedChat.type === 'direct' && (
                          <>
                            <DropdownMenuItem onClick={handleViewProfile}>
                              <User className="mr-2 h-4 w-4" />
                              <span>View Profile</span>
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem onClick={handleBlockUser}>
                              <UserX className="mr-2 h-4 w-4" />
                              <span>Block User</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
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
                        
                        {linkedEvent && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={handleViewEvent}>
                              <Calendar className="mr-2 h-4 w-4" />
                              <span>View Event</span>
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageCircle className="w-12 h-12 mx-auto mb-3 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                    <h3 className="font-semibold gradient-text mb-1">No Messages Yet</h3>
                    <p className="text-sm text-gray-600">Start the conversation!</p>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex gap-3 ${
                        message.sender_id === currentUserId ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      {message.sender_id !== currentUserId && (
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={message.sender.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {message.sender.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                          message.sender_id === currentUserId
                            ? 'bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-lg'
                            : 'bg-white/70 backdrop-blur-sm text-gray-900 border border-white/50 shadow-lg'
                        }`}
                      >
                        <p className="text-sm">{message.message}</p>
                        <p className={`text-xs mt-1 ${
                          message.sender_id === currentUserId ? 'text-pink-100' : 'text-gray-500'
                        }`}>
                          {format(parseISO(message.created_at), 'h:mm a')}
                        </p>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-4 border-t border-gray-200 bg-white/70 backdrop-blur-sm">
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    className="flex-1 border-gray-200 focus:border-pink-400 hover:border-pink-300"
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    className="hover-button gradient-button"
                  >
                    <Send className="w-4 h-4 hover-icon" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageCircle className="w-16 h-16 mx-auto mb-4 hover-icon" style={{ background: 'linear-gradient(135deg, #ec4899, #f472b6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                <h3 className="text-xl font-semibold gradient-text mb-2">Select a Chat</h3>
                <p className="text-gray-600">Choose a conversation to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="glass-card inner-glow floating-shadow w-full max-w-md">
            <CardHeader>
              <CardTitle className="gradient-text">Create Group Chat</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Group Name
                </label>
                <Input
                  placeholder="Enter group name..."
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="border-gray-200 focus:border-pink-400 hover:border-pink-300"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Friends ({selectedFriends.length} selected)
                </label>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {friends.map((friend) => (
                    <div
                      key={friend.id}
                      onClick={() => toggleFriendSelection(friend.id)}
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer hover-card ${
                        selectedFriends.includes(friend.id)
                          ? 'bg-gradient-to-r from-pink-50 to-white border border-pink-200'
                          : 'border border-transparent'
                      }`}
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={friend.avatar_url || undefined} />
                        <AvatarFallback className="text-xs">
                          {friend.name.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900">{friend.name}</h4>
                        {friend.bio && (
                          <p className="text-sm text-gray-600 line-clamp-1">{friend.bio}</p>
                        )}
                      </div>
                      {selectedFriends.includes(friend.id) && (
                        <div className="w-5 h-5 rounded-full bg-gradient-to-r from-pink-500 to-pink-600 flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="flex gap-2 pt-4">
                <Button
                  onClick={() => setShowCreateGroup(false)}
                  variant="outline"
                  className="hover-button flex-1 border-gray-200 hover:border-gray-400 hover:text-gray-700"
                >
                  Cancel
                </Button>
                <Button
                  onClick={createGroupChat}
                  disabled={!groupName.trim() || selectedFriends.length === 0}
                  className="hover-button gradient-button flex-1"
                >
                  Create Group
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Users Modal */}
      {showUsersModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Group Members</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowUsersModal(false)}
                  className="hover-button"
                >
                  ✕
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {chatParticipants.map((participant) => {
                  const isCurrentUser = participant.user_id === currentUserId;
                  
                  return (
                    <div key={participant.user_id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div 
                        className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded-lg p-2 -m-2 flex-1"
                        onClick={() => {
                          if (onNavigateToProfile) {
                            onNavigateToProfile(participant.user_id);
                            setShowUsersModal(false);
                          } else {
                            // Fallback: emit custom event for navigation
                            const event = new CustomEvent('open-user-profile', {
                              detail: { userId: participant.user_id }
                            });
                            window.dispatchEvent(event);
                            setShowUsersModal(false);
                          }
                        }}
                      >
                        <Avatar className="w-8 h-8">
                          <AvatarImage src={participant.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {participant.name?.split(' ').map(n => n[0]).join('') || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">
                            {participant.name}
                            {isCurrentUser && (
                              <span className="text-blue-600 text-xs ml-1">(You)</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500">
                            {isCurrentUser ? 'You' : 'Group Member'}
                          </p>
                        </div>
                      </div>
                      {!isCurrentUser && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleBlockUserFromModal(participant.user_id, participant.name)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <UserX className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Group Info Modal */}
      {showEditGroupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Edit Group Info</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEditGroupModal(false)}
                  className="hover-button"
                >
                  ✕
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Group Name
                  </label>
                  <Input
                    value={editGroupName}
                    onChange={(e) => setEditGroupName(e.target.value)}
                    placeholder="Enter group name"
                    className="w-full"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Description (Optional)
                  </label>
                  <textarea
                    value={editGroupDescription}
                    onChange={(e) => setEditGroupDescription(e.target.value)}
                    placeholder="Enter group description"
                    className="w-full p-2 border border-gray-300 rounded-md resize-none h-20"
                  />
                </div>
                
                <div className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowEditGroupModal(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveGroupInfo}
                    disabled={!editGroupName.trim()}
                    className="flex-1 gradient-button"
                  >
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};