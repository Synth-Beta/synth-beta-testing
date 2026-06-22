import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { MessageCircle } from 'lucide-react';

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

export const GroupChatCard: React.FC<GroupChatCardProps> = () => {
  return (
    <Card className="mb-4">
      <CardContent className="p-6">
        <div className="flex items-center justify-center h-96">
          <div className="text-center space-y-2">
            <MessageCircle className="w-12 h-12 mx-auto text-muted-foreground" />
            <h3 className="text-lg font-semibold">Coming Soon</h3>
            <p className="text-sm text-muted-foreground">
              Group chats are still in development
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

