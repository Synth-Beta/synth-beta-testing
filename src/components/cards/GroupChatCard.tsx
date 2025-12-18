import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MessageCircle, Users, ArrowRight } from 'lucide-react';

export interface GroupChatCardData {
  chat_id: string;
  chat_name: string;
  member_count?: number;
  active_member_count?: number;
  friends_in_chat_count?: number;
  created_at: string;
}

interface GroupChatCardProps {
  chat: GroupChatCardData;
  onChatClick?: (chatId: string) => void;
  onJoinChat?: (chatId: string) => Promise<void>;
}

export const GroupChatCard: React.FC<GroupChatCardProps> = ({
  chat,
  onChatClick,
  onJoinChat,
}) => {
  const formatMemberCount = (count?: number): string => {
    if (!count) return 'New group';
    if (count === 1) return '1 member';
    return `${count} members`;
  };

  return (
    <Card
      className="mb-4 cursor-pointer hover:border-synth-pink/30 hover:shadow-md transition-all"
      onClick={() => onChatClick?.(chat.chat_id)}
    >
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex-shrink-0 w-14 h-14 rounded-full bg-synth-pink/10 flex items-center justify-center">
            <MessageCircle className="h-7 w-7 text-synth-pink" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-synth-black mb-2">
              {chat.chat_name}
            </h3>

            {/* Stats */}
            <div className="flex flex-wrap gap-4 mb-4 text-sm text-synth-black/60">
              <div className="flex items-center">
                <Users className="h-4 w-4 mr-1" />
                <span>{formatMemberCount(chat.member_count)}</span>
              </div>
              {chat.friends_in_chat_count && chat.friends_in_chat_count > 0 && (
                <div className="text-synth-pink font-medium">
                  {chat.friends_in_chat_count} friend{chat.friends_in_chat_count !== 1 ? 's' : ''} in chat
                </div>
              )}
            </div>

            {/* Join button */}
            {onJoinChat && (
              <Button
                className="bg-synth-pink hover:bg-synth-pink-dark text-white"
                onClick={(e) => {
                  e.stopPropagation();
                  onJoinChat(chat.chat_id);
                }}
              >
                Join Chat
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

