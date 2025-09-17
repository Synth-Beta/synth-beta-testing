import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { 
  MessageCircle, 
  Plus, 
  Search, 
  Users, 
  X,
  Send,
  UserPlus,
  Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format, parseISO } from 'date-fns';

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
}

interface Message {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name: string;
  sender_avatar: string | null;
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
  const [showGroupCreate, setShowGroupCreate] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

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
    }
  }, [selectedChat]);

  const fetchChats = async () => {
    try {
      const { data, error } = await supabase.rpc('get_user_chats', {
        user_id: currentUserId
      });

      if (error) {
        console.error('Error fetching chats:', error);
        return;
      }

      setChats(data || []);
    } catch (error) {
      console.error('Error fetching chats:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      console.log('🔍 Current user ID:', currentUserId);
      
      // TEMPORARY FIX: For testing, add Test Dummy as a friend if current user is Tej
      if (currentUserId === '690d27ae-d803-4ff5-a381-162f8863dd9b') {
        // Tej's ID - add Test Dummy as friend for testing
        const testFriend = {
          user_id: '1a4b8b00-1c9f-4d7a-9c63-7a218395ad7b',
          name: 'Test Dummy',
          avatar_url: null,
          bio: null
        };
        console.log('🔍 Adding Test Dummy as friend for testing');
        setUsers([testFriend]);
        return;
      }
      
      // For other users, no friends yet
      console.log('🔍 No friends found');
      setUsers([]);
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
          created_at
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
        .from('profiles')
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
          sender_avatar: profile?.avatar_url || null
        };
      });

      setMessages(transformedMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedChat) return;

    const messageText = newMessage.trim();
    setNewMessage('');

    try {
      // TEMPORARY: For testing, just add message to UI
      const testMessage: Message = {
        id: `msg-${Date.now()}`,
        chat_id: selectedChat.id,
        sender_id: currentUserId,
        content: messageText,
        created_at: new Date().toISOString(),
        sender_name: 'You',
        sender_avatar: null
      };
      
      setMessages(prev => [...prev, testMessage]);
      
      toast({
        title: "Message Sent! 💬",
        description: "Message added to chat (test mode)",
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
      
      // TEMPORARY: Create a working chat for testing
      const friendName = users.find(user => user.user_id === userId)?.name || 'Friend';
      const testChat: Chat = {
        id: `chat-${Date.now()}`,
        chat_name: `Chat with ${friendName}`,
        is_group_chat: false,
        users: [currentUserId, userId],
        latest_message_id: null,
        latest_message: null,
        latest_message_created_at: null,
        latest_message_sender_name: null,
        group_admin_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      setChats(prev => [testChat, ...prev]);
      setSelectedChat(testChat);
      setShowUserSearch(false);
      
      toast({
        title: "Chat Created! 💬",
        description: "You can now start chatting! (Test mode - messages will show in UI)",
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
    if (!groupName.trim() || selectedUsers.length < 2) {
      toast({
        title: "Error",
        description: "Please enter a group name and select at least 2 users.",
        variant: "destructive",
      });
      return;
    }

    try {
      const userIds = selectedUsers.map(user => user.user_id);
      console.log('Creating group chat:', { groupName: groupName.trim(), userIds, adminId: currentUserId });
      
      const { data: chatId, error } = await supabase.rpc('create_group_chat', {
        chat_name: groupName.trim(),
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
      return chat.chat_name;
    }
    
    // For direct chats, find the other user's name
    const otherUserId = chat.users.find(id => id !== currentUserId);
    const otherUser = users.find(u => u.user_id === otherUserId);
    return otherUser?.name || 'Unknown User';
  };

  const getChatAvatar = (chat: Chat) => {
    if (chat.is_group_chat) {
      return null; // Group chat - could add group avatar logic
    }
    
    // For direct chats, find the other user's avatar
    const otherUserId = chat.users.find(id => id !== currentUserId);
    const otherUser = users.find(u => u.user_id === otherUserId);
    return otherUser?.avatar_url || null;
  };

  return (
    <div className="fixed inset-0 flex h-screen bg-gray-50 z-50">
      {/* Left Sidebar - Chat List */}
      <div className="w-1/3 border-r border-gray-200 bg-white flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-gray-900">Messages</h1>
            <Button
              variant="outline"
              size="sm"
              onClick={onBack}
              className="flex items-center gap-2"
            >
              <X className="w-4 h-4" />
              Close
            </Button>
          </div>
          
          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              onClick={() => setShowUserSearch(true)}
              className="flex-1 bg-blue-500 hover:bg-blue-600 text-white"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              New Chat
            </Button>
            <Button
              onClick={() => setShowGroupCreate(true)}
              variant="outline"
              className="flex-1"
            >
              <Users className="w-4 h-4 mr-2" />
              New Group
            </Button>
          </div>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <MessageCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
              <p className="font-medium mb-1">No conversations yet</p>
              <p className="text-sm mb-3">Start chatting with your friends!</p>
              <div className="text-xs text-gray-400 space-y-1">
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
                  className={`cursor-pointer transition-colors ${
                    selectedChat?.id === chat.id
                      ? 'bg-blue-50 border-blue-200'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center gap-3">
                      <div 
                        className="flex-1 flex items-center gap-3 cursor-pointer"
                        onClick={() => setSelectedChat(chat)}
                      >
                        <Avatar className="w-10 h-10">
                          <AvatarImage src={getChatAvatar(chat) || undefined} />
                          <AvatarFallback>
                            {chat.is_group_chat ? (
                              <Users className="w-5 h-5" />
                            ) : (
                              getChatDisplayName(chat).split(' ').map(n => n[0]).join('')
                            )}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3 className="font-medium text-gray-900 truncate">
                              {getChatDisplayName(chat)}
                            </h3>
                            {chat.latest_message_created_at && (
                              <span className="text-xs text-gray-500">
                                {format(parseISO(chat.latest_message_created_at), 'h:mm a')}
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
                            <Badge variant="secondary" className="text-xs mt-1">
                              Group
                            </Badge>
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
                        className="text-gray-400 hover:text-red-500 p-1"
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
      <div className="flex-1 flex flex-col">
        {selectedChat ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-3">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={getChatAvatar(selectedChat) || undefined} />
                  <AvatarFallback>
                    {selectedChat.is_group_chat ? (
                      <Users className="w-5 h-5" />
                    ) : (
                      getChatDisplayName(selectedChat).split(' ').map(n => n[0]).join('')
                    )}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h2 className="font-semibold text-gray-900">
                    {getChatDisplayName(selectedChat)}
                  </h2>
                  {selectedChat.is_group_chat && (
                    <p className="text-sm text-gray-600">
                      {selectedChat.users.length} members
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 mt-8">
                  <MessageCircle className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No messages yet</p>
                  <p className="text-sm">Start the conversation!</p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${
                      message.sender_id === currentUserId ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        message.sender_id === currentUserId
                          ? 'bg-blue-500 text-white'
                          : 'bg-gray-200 text-gray-900'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {format(parseISO(message.created_at), 'h:mm a')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Message Input - Always show when chat is selected */}
            <div className="p-4 border-t border-gray-200 bg-white">
              <div className="flex gap-2">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message... (will be saved when database is ready)"
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
              <p className="text-xs text-gray-400 mt-2">
                💡 Messages will be saved to database when fully set up
              </p>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <MessageCircle className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <h2 className="text-xl font-semibold mb-2">Select a conversation</h2>
              <p>Choose a chat from the sidebar to start messaging</p>
            </div>
          </div>
        )}
      </div>

      {/* User Search Modal */}
      {showUserSearch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Start New Chat</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowUserSearch(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="mb-4"
            />
            
            <div className="max-h-60 overflow-y-auto space-y-2">
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
                filteredUsers.map((user) => (
                  <div
                    key={user.user_id}
                    className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                    onClick={() => createDirectChat(user.user_id)}
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
          </div>
        </div>
      )}

      {/* Group Create Modal */}
      {showGroupCreate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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
              onClick={createGroupChat}
              disabled={!groupName.trim() || selectedUsers.length < 2}
              className="w-full"
            >
              Create Group ({selectedUsers.length} members)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
