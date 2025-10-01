import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  MessageCircle, 
  Send, 
  Users, 
  Plus, 
  ArrowLeft,
  MoreVertical,
  Phone,
  Video,
  Search
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';
import { SynthSLogo } from '@/components/SynthSLogo';

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
  onBack: () => void;
}

export const ChatView = ({ currentUserId, onBack }: ChatViewProps) => {
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

  useEffect(() => {
    fetchChats();
    fetchFriends();
  }, [currentUserId]);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat.id);
    }
  }, [selectedChat]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchChats = async () => {
    try {
      setLoading(true);
      
      // Use the new function to get user's chats
      const { data, error } = await supabase.rpc('get_user_chats', {
        user_id: currentUserId
      });

      if (error) {
        console.error('Error fetching chats:', error);
        return;
      }

      // Transform the data
      const chatsList = (data || []).map(chat => ({
        id: chat.id,
        name: chat.chat_name,
        type: (chat.is_group_chat ? 'group' : 'direct') as 'direct' | 'group',
        created_at: chat.created_at,
        participants: [], // Will be populated separately
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
      }));

      console.log('💬 Fetched chats:', chatsList);
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
        .from('profiles')
        .select('id, name, avatar_url, bio')
        .in('user_id', userIds);

      if (profilesError) {
        console.error('Error fetching friend profiles:', profilesError);
        return;
      }

      // Transform the data to get the other user's profile
      const friendsList = friendships.map(friendship => {
        const otherUserId = friendship.user1_id === currentUserId ? friendship.user2_id : friendship.user1_id;
        const profile = profiles?.find(p => p.id === otherUserId);
        
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

      // Get unique sender IDs
      const senderIds = [...new Set(data.map(msg => msg.sender_id))];

      // Fetch sender profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .in('user_id', senderIds);

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
        const profile = profiles?.find(p => p.id === msg.sender_id);
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
    <div className="min-h-screen synth-gradient-card">
      <div className="max-w-6xl mx-auto h-screen flex">
        {/* Sidebar - Chat List */}
        <div className="w-1/3 bg-white/95 backdrop-blur-sm border-r border-synth-black/10 flex flex-col shadow-xl">
          {/* Header */}
          <div className="p-6 border-b border-synth-black/10 bg-gradient-to-r from-synth-beige to-synth-beige-light">
            <div className="flex items-center gap-3 mb-4">
              <SynthSLogo size="sm" />
              <h1 className="text-2xl font-bold text-synth-black">Chats</h1>
            </div>
            <div className="flex items-center justify-between mb-4">
              <Button 
                variant="outline" 
                onClick={onBack}
                className="flex items-center gap-2 bg-synth-black/5 border-synth-black/20 text-synth-black hover:bg-synth-black hover:text-white transition-all duration-200"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <Button
                onClick={() => setShowCreateGroup(true)}
                className="bg-synth-pink hover:bg-synth-pink-dark text-white transition-all duration-200 shadow-lg hover:shadow-xl"
              >
                <Plus className="w-4 h-4 mr-1" />
                New Group
              </Button>
            </div>
            
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-synth-black/60 w-4 h-4" />
              <Input
                placeholder="Search chats..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-white/80 border-synth-black/20 focus:border-synth-pink focus:ring-synth-pink/20 rounded-xl"
              />
            </div>
          </div>

          {/* Chat List */}
          <div className="flex-1 overflow-y-auto">
            {chats.length === 0 ? (
              <div className="p-4 text-center">
                <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-900 mb-1">No Chats Yet</h3>
                <p className="text-sm text-gray-600">Start a conversation with your friends!</p>
              </div>
            ) : (
              <div className="space-y-1 p-2">
                {chats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => setSelectedChat(chat)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors ${
                      selectedChat?.id === chat.id 
                        ? 'bg-blue-50 border border-blue-200' 
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                        {chat.type === 'group' ? (
                          <Users className="w-5 h-5 text-gray-600" />
                        ) : (
                          <MessageCircle className="w-5 h-5 text-gray-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {chat.name || 'Direct Chat'}
                        </h3>
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
                        <Badge className="bg-red-500 text-white text-xs">
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
                        {selectedChat.name || 'Direct Chat'}
                      </h2>
                      <p className="text-sm text-gray-600">
                        {selectedChat.type === 'group' ? 'Group chat' : 'Direct message'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm">
                      <Phone className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Video className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-8">
                    <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                    <h3 className="font-semibold text-gray-900 mb-1">No Messages Yet</h3>
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
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-200 text-gray-900'
                        }`}
                      >
                        <p className="text-sm">{message.message}</p>
                        <p className={`text-xs mt-1 ${
                          message.sender_id === currentUserId ? 'text-blue-100' : 'text-gray-500'
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
              <div className="p-4 border-t border-gray-200 bg-white">
                <div className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    className="flex-1"
                  />
                  <Button
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    className="bg-blue-500 hover:bg-blue-600 text-white"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Select a Chat</h3>
                <p className="text-gray-600">Choose a conversation to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateGroup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Create Group Chat</CardTitle>
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
                      className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                        selectedFriends.includes(friend.id)
                          ? 'bg-blue-50 border border-blue-200'
                          : 'hover:bg-gray-50 border border-transparent'
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
                        <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
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
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={createGroupChat}
                  disabled={!groupName.trim() || selectedFriends.length === 0}
                  className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
                >
                  Create Group
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};