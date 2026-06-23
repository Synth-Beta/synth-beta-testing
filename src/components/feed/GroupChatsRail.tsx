import React from 'react';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { MessageCircle, Users, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface GroupChatSuggestion {
  chat_id: string;
  chat_name: string;
  member_count?: number;
  active_member_count?: number;
  friends_in_chat_count?: number;
  created_at: string;
}

interface GroupChatsRailProps {
  chats: GroupChatSuggestion[];
  onChatClick?: (chatId: string) => void;
  onJoinChat?: (chatId: string) => Promise<void>;
}

export const GroupChatsRail: React.FC<GroupChatsRailProps> = ({
  chats,
  onChatClick,
  onJoinChat,
}) => {
  if (chats.length === 0) {
    return null;
  }

  const formatMemberCount = (count?: number): string => {
    if (!count) return 'New';
    if (count === 1) return '1 member';
    return `${count} members`;
  };

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div>
          <h2 className="text-lg font-semibold text-synth-black">Chats You Should Join</h2>
          <p className="text-sm text-synth-black/60">Active group conversations</p>
        </div>
      </div>

      {/* Horizontal Scrollable Rail */}
      <ScrollArea className="w-full">
        <div className="flex space-x-4 pb-4">
          {chats.map((chat) => (
            <div
              key={chat.chat_id}
              className="min-w-[200px] max-w-[200px] bg-white border border-synth-black/10 rounded-lg p-4 group cursor-pointer hover:border-synth-pink/30 hover:shadow-md transition-all"
              onClick={() => onChatClick?.(chat.chat_id)}
            >
              {/* Icon */}
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-synth-pink/10 mb-3 group-hover:bg-synth-pink/20 transition-colors">
                <MessageCircle className="h-6 w-6 text-synth-pink" />
              </div>

              {/* Chat name */}
              <h3 className="font-semibold text-synth-black mb-2 line-clamp-2">
                {chat.chat_name}
              </h3>

              {/* Stats */}
              <div className="space-y-1 mb-3">
                <div className="flex items-center text-xs text-synth-black/60">
                  <Users className="h-3 w-3 mr-1" />
                  <span>{formatMemberCount(chat.member_count)}</span>
                </div>
                {chat.friends_in_chat_count && chat.friends_in_chat_count > 0 && (
                  <div className="text-xs text-synth-pink">
                    {chat.friends_in_chat_count} friend{chat.friends_in_chat_count !== 1 ? 's' : ''} in chat
                  </div>
                )}
              </div>

              {/* Join button */}
              {onJoinChat && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-8 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    onJoinChat(chat.chat_id);
                  }}
                >
                  Join Chat
                  <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
};

