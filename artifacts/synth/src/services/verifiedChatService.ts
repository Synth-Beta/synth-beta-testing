import { supabase } from '@/integrations/supabase/client';

export type EntityType = 'event' | 'artist' | 'venue';

export interface VerifiedChatInfo {
  chat_id: string | null;
  chat_name: string | null;
  member_count: number;
  last_activity_at: string | null;
  is_user_member: boolean;
  current_user_id: string | null;
}

/**
 * Service for managing verified group chats for entities (events, artists, venues)
 */
export class VerifiedChatService {
  /**
   * Get or create a verified chat for an entity
   * @param entityType - Type of entity ('event', 'artist', or 'venue')
   * @param entityId - ID of the entity (UUID for events/artists, TEXT for venues)
   * @param entityName - Name of the entity for chat naming
   * @returns Chat ID
   */
  static async getOrCreateVerifiedChat(
    entityType: EntityType,
    entityId: string,
    entityName: string
  ): Promise<string> {
    try {
      console.log('🔵 Calling get_or_create_verified_chat RPC:', {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_entity_name: entityName,
      });

      const { data, error } = await supabase.rpc('get_or_create_verified_chat', {
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_entity_name: entityName,
      });

      if (error) {
        console.error('❌ Error getting/creating verified chat:', error);
        throw error;
      }

      console.log('🔵 get_or_create_verified_chat RPC returned:', data);
      return data;
    } catch (error) {
      console.error('❌ Error in getOrCreateVerifiedChat:', error);
      throw error;
    }
  }

  /**
   * Join a verified chat (add user to chat)
   * @param chatId - ID of the chat to join
   * @param userId - ID of the user joining
   * @returns Chat ID
   */
  static async joinVerifiedChat(chatId: string, userId: string): Promise<string> {
    try {
      const { data, error } = await supabase.rpc('join_verified_chat', {
        p_chat_id: chatId,
        p_user_id: userId,
      });

      if (error) {
        console.error('Error joining verified chat:', error);
        throw error;
      }

      return data;
    } catch (error) {
      console.error('Error in joinVerifiedChat:', error);
      throw error;
    }
  }

  /**
   * Get verified chat info without creating a new chat
   * @param entityType - Type of entity
   * @param entityId - ID of the entity
   * @returns Chat info or null if chat doesn't exist
   */
  static async getVerifiedChatInfo(
    entityType: EntityType,
    entityId: string
  ): Promise<VerifiedChatInfo | null> {
    try {
      const { data, error } = await supabase.rpc('get_verified_chat_info', {
        p_entity_type: entityType,
        p_entity_id: entityId,
      });

      if (error) {
        console.error('Error getting verified chat info:', error);
        throw error;
      }

      if (!data || data.length === 0) {
        return null;
      }

      const info = data[0];
      return {
        chat_id: info.chat_id,
        chat_name: info.chat_name,
        member_count: info.member_count || 0,
        last_activity_at: info.last_activity_at,
        is_user_member: info.is_user_member || false,
        current_user_id: info.current_user_id,
      };
    } catch (error) {
      console.error('Error in getVerifiedChatInfo:', error);
      throw error;
    }
  }

  /**
   * Check if user is a member of a chat
   * @param chatId - ID of the chat
   * @param userId - ID of the user
   * @returns True if user is a member
   */
  static async isUserMember(chatId: string, userId: string): Promise<boolean> {
    try {
      const { data: participant, error } = await supabase
        .from('chat_participants')
        .select('user_id')
        .eq('chat_id', chatId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('Error checking user membership:', error);
        return false;
      }

      return !!participant;
    } catch (error) {
      console.error('Error in isUserMember:', error);
      return false;
    }
  }

  /**
   * Join or open a verified chat (creates if needed, joins if not member, opens if member)
   * @param entityType - Type of entity
   * @param entityId - ID of the entity
   * @param entityName - Name of the entity
   * @param userId - ID of the current user
   * @returns Chat ID
   */
  static async joinOrOpenVerifiedChat(
    entityType: EntityType,
    entityId: string,
    entityName: string,
    userId: string
  ): Promise<string> {
    try {
      console.log('🔵 VerifiedChatService.joinOrOpenVerifiedChat called:', {
        entityType,
        entityId,
        entityName,
        userId
      });

      // First, try to get existing chat info
      const chatInfo = await this.getVerifiedChatInfo(entityType, entityId);
      console.log('🔵 Chat info retrieved:', chatInfo);

      let chatId: string;

      if (chatInfo?.chat_id) {
        // Chat exists
        chatId = chatInfo.chat_id;
        console.log('🔵 Chat exists, chatId:', chatId);

        // Join if not already a member
        if (!chatInfo.is_user_member) {
          console.log('🔵 User not a member, joining chat...');
          await this.joinVerifiedChat(chatId, userId);
          console.log('🔵 User joined chat successfully');
        } else {
          console.log('🔵 User already a member');
        }
      } else {
        // Chat doesn't exist, create it
        console.log('🔵 Chat does not exist, creating new verified chat...');
        chatId = await this.getOrCreateVerifiedChat(entityType, entityId, entityName);
        console.log('🔵 Verified chat created, chatId:', chatId);

        // Join the newly created chat
        console.log('🔵 Joining newly created chat...');
        await this.joinVerifiedChat(chatId, userId);
        console.log('🔵 User joined newly created chat successfully');
      }

      console.log('🔵 joinOrOpenVerifiedChat completed successfully, returning chatId:', chatId);
      return chatId;
    } catch (error) {
      console.error('❌ Error in joinOrOpenVerifiedChat:', error);
      throw error;
    }
  }
}

