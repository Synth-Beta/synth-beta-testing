/**
 * Event Group Card
 * Display event group with join/leave functionality
 */

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Users, MessageCircle, Lock, Globe, UserPlus, UserMinus, Loader2 } from 'lucide-react';
import EventGroupService, { EventGroup } from '@/services/eventGroupService';

interface EventGroupCardProps {
  group: EventGroup;
  onJoinLeave?: () => void;
  onChatClick?: (chatId: string) => void;
}

export function EventGroupCard({ group, onJoinLeave, onChatClick }: EventGroupCardProps) {
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMember, setIsMember] = useState(group.is_member);

  const handleJoinLeave = async () => {
    setIsProcessing(true);
    try {
      if (isMember) {
        await EventGroupService.leaveGroup(group.id);
        toast({
          title: 'Left Group',
          description: `You left ${group.name}`,
        });
        setIsMember(false);
      } else {
        await EventGroupService.joinGroup(group.id);
        toast({
          title: 'Joined Group! 🎉',
          description: `Welcome to ${group.name}`,
        });
        setIsMember(true);
      }
      onJoinLeave?.();
    } catch (error) {
      console.error('Error join/leave group:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update membership',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const isGroupFull =
    group.max_members && group.member_count >= group.max_members;

  return (
    <Card 
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={() => {
        if (isMember && group.chat_id) {
          onChatClick?.(group.chat_id);
        }
      }}
    >
      <CardContent className="p-4">
        <div className="flex gap-4">
          {/* Group Icon/Image */}
          {group.cover_image_url ? (
            <img
              src={group.cover_image_url}
              alt={group.name}
              className="w-16 h-16 rounded-lg object-cover"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center">
              <Users className="h-8 w-8 text-purple-600" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            {/* Group Header */}
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg truncate">{group.name}</h3>
                {group.description && (
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {group.description}
                  </p>
                )}
              </div>
              <Badge variant="outline" className="flex-shrink-0">
                {group.is_public ? (
                  <Globe className="h-3 w-3 mr-1" />
                ) : (
                  <Lock className="h-3 w-3 mr-1" />
                )}
                {group.is_public ? 'Public' : 'Private'}
              </Badge>
            </div>

            {/* Group Info */}
            <div className="flex items-center gap-3 text-sm text-gray-600 mb-3">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>
                  {group.member_count} {group.max_members ? `/ ${group.max_members}` : ''} member{group.member_count !== 1 ? 's' : ''}
                </span>
              </div>
              {isMember && group.chat_id && (
                <Badge variant="secondary" className="text-xs">
                  <MessageCircle className="h-3 w-3 mr-1" />
                  Chat Active
                </Badge>
              )}
            </div>

            {/* Creator Info */}
            <p className="text-xs text-gray-500 mb-3">
              Created by {group.creator_name}
            </p>

            {/* Actions */}
            <div className="flex gap-2">
              {isMember ? (
                <>
                  {group.chat_id && (
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        onChatClick?.(group.chat_id!);
                      }}
                      className="flex-1"
                    >
                      <MessageCircle className="h-4 w-4 mr-1" />
                      Open Chat
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJoinLeave();
                    }}
                    disabled={isProcessing}
                    className="text-red-600 hover:text-red-700"
                  >
                    <UserMinus className="h-4 w-4 mr-1" />
                    Leave
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleJoinLeave();
                  }}
                  disabled={isProcessing || isGroupFull}
                  className="flex-1"
                >
                  {isProcessing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4 mr-1" />
                  )}
                  {isGroupFull ? 'Group Full' : 'Join Group'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default EventGroupCard;

