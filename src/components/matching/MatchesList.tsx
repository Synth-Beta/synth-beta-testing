/**
 * Matches List Component
 * Shows all user's matches with chat functionality
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MessageCircle, Calendar, MapPin, Music, Heart } from 'lucide-react';
import MatchingService from '@/services/matchingService';

interface Match {
  id: string;
  user1_id: string;
  user2_id: string;
  event_id: string;
  created_at: string;
  event?: {
    id: string;
    title: string;
    artist_name: string;
    venue_name: string;
    event_date: string;
    poster_image_url?: string;
  };
  matched_user?: {
    id: string;
    name: string;
    avatar_url?: string;
    bio?: string;
  };
}

export function MatchesList() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  useEffect(() => {
    loadMatches();
  }, []);

  const loadMatches = async () => {
    try {
      setLoading(true);
      const matchesData = await MatchingService.getAllMatches();
      setMatches(matchesData);
    } catch (error) {
      console.error('Error loading matches:', error);
    } finally {
      setLoading(false);
    }
  };

  const openChat = async (match: Match) => {
    setSelectedMatch(match);
    // Load chat messages for this match
    try {
      const chats = await MatchingService.getChats();
      const matchChat = chats.find(chat => 
        chat.users.includes(match.user1_id) && 
        chat.users.includes(match.user2_id)
      );
      
      if (matchChat) {
        setChatMessages(matchChat.messages || []);
      }
    } catch (error) {
      console.error('Error loading chat:', error);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedMatch || sendingMessage) return;

    try {
      setSendingMessage(true);
      
      // Get chat for this match
      const chats = await MatchingService.getChats();
      const matchChat = chats.find(chat => 
        chat.users.includes(selectedMatch.user1_id) && 
        chat.users.includes(selectedMatch.user2_id)
      );

      if (matchChat) {
        await MatchingService.sendMessage(matchChat.id, newMessage);
        setNewMessage('');
        // Reload messages
        const updatedChats = await MatchingService.getChats();
        const updatedChat = updatedChats.find(chat => chat.id === matchChat.id);
        if (updatedChat) {
          setChatMessages(updatedChat.messages || []);
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setSendingMessage(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your matches...</p>
        </div>
      </div>
    );
  }

  if (matches.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <Heart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Matches Yet</h3>
          <p className="text-gray-600 text-sm">
            Start swiping on events to find people going to the same shows!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Your Matches</h1>
        <p className="text-gray-600">People you've matched with for events</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {matches.map((match) => (
          <Card key={match.id} className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
                  {match.matched_user?.avatar_url ? (
                    <img 
                      src={match.matched_user.avatar_url} 
                      alt={match.matched_user.name}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-white text-lg font-bold">
                      {match.matched_user?.name?.charAt(0) || '?'}
                    </span>
                  )}
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg">{match.matched_user?.name || 'Unknown User'}</CardTitle>
                  <p className="text-sm text-gray-600">Matched {formatDate(match.created_at)}</p>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="pt-0">
              <div className="space-y-3">
                {/* Event Info */}
                <div className="bg-purple-50 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Music className="h-4 w-4 text-purple-600" />
                    <span className="font-medium text-purple-900">{match.event?.title}</span>
                  </div>
                  {match.event?.artist_name && (
                    <p className="text-sm text-purple-700 mb-1">{match.event.artist_name}</p>
                  )}
                  {match.event?.venue_name && (
                    <div className="flex items-center gap-1 text-sm text-purple-600">
                      <MapPin className="h-3 w-3" />
                      <span>{match.event.venue_name}</span>
                    </div>
                  )}
                  {match.event?.event_date && (
                    <div className="flex items-center gap-1 text-sm text-purple-600">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(match.event.event_date)}</span>
                    </div>
                  )}
                </div>

                {/* Action Button */}
                <Button 
                  onClick={() => openChat(match)}
                  className="w-full"
                  variant="outline"
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Start Chat
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chat Modal */}
      {selectedMatch && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md max-h-[80vh] flex flex-col">
            <CardHeader className="flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
                    {selectedMatch.matched_user?.avatar_url ? (
                      <img 
                        src={selectedMatch.matched_user.avatar_url} 
                        alt={selectedMatch.matched_user.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-white font-bold">
                        {selectedMatch.matched_user?.name?.charAt(0) || '?'}
                      </span>
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{selectedMatch.matched_user?.name}</CardTitle>
                    <p className="text-sm text-gray-600">{selectedMatch.event?.title}</p>
                  </div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setSelectedMatch(null)}
                >
                  ✕
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="flex-1 flex flex-col p-0">
              {/* Messages */}
              <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-60">
                {chatMessages.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <MessageCircle className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p>No messages yet. Say hello!</p>
                  </div>
                ) : (
                  chatMessages.map((message) => (
                    <div key={message.id} className="flex justify-end">
                      <div className="bg-purple-100 rounded-lg p-3 max-w-xs">
                        <p className="text-sm">{message.message}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(message.created_at).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {/* Message Input */}
              <div className="flex-shrink-0 p-4 border-t">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  />
                  <Button 
                    onClick={sendMessage}
                    disabled={!newMessage.trim() || sendingMessage}
                    size="sm"
                  >
                    Send
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
