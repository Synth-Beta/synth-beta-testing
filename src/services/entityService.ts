/**
 * Entity Service
 * Helper functions for working with the entities table
 * Used for polymorphic references (comments, engagements, etc.)
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Get or create an entity record
 * Use this when inserting rows into tables that reference entities.id
 * 
 * @param entityType - Type of entity: 'review', 'event', 'artist', 'venue', 'comment', 'user', 'city', 'scene'
 * @param entityUuid - UUID of the entity (for UUID-based entities)
 * @param entityTextId - Text identifier (for text-based entities like cities/scenes)
 * @returns The entity.id UUID
 */
export async function getOrCreateEntity(
  entityType: 'review' | 'event' | 'artist' | 'venue' | 'comment' | 'user' | 'city' | 'scene',
  entityUuid?: string | null,
  entityTextId?: string | null
): Promise<string> {
  if (!entityUuid && !entityTextId) {
    throw new Error('Must provide either entityUuid or entityTextId');
  }
  if (entityUuid && entityTextId) {
    throw new Error('Must provide exactly one of entityUuid or entityTextId');
  }

  const { data, error } = await supabase.rpc('get_or_create_entity', {
    p_entity_type: entityType,
    p_entity_uuid: entityUuid || null,
    p_entity_text_id: entityTextId || null,
  });

  if (error) {
    console.error('Error getting or creating entity:', error);
    throw error;
  }

  return data;
}

/**
 * Get entity_id from entity_type + entity_uuid
 * Use this when querying tables that reference entities.id
 * 
 * @param entityType - Type of entity
 * @param entityUuid - UUID of the entity
 * @returns The entity.id UUID, or null if not found
 */
export async function getEntityId(
  entityType: 'review' | 'event' | 'artist' | 'venue' | 'comment' | 'user' | 'city' | 'scene',
  entityUuid: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('entities')
    .select('id')
    .eq('entity_type', entityType)
    .eq('entity_uuid', entityUuid)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Not found
      return null;
    }
    console.error('Error getting entity:', error);
    throw error;
  }

  return data?.id || null;
}

