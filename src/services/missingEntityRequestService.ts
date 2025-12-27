/**
 * Service for submitting requests for missing entities (artists, venues, events)
 * Users can no longer directly create entities - they must submit requests
 */

import { supabase } from '@/integrations/supabase/client';

export type EntityType = 'artist' | 'venue' | 'event';

export interface MissingEntityRequest {
  id: string;
  user_id: string;
  entity_type: EntityType;
  entity_name: string;
  entity_description?: string;
  entity_location?: string;
  entity_date?: string;
  entity_url?: string;
  entity_image_url?: string;
  additional_info?: Record<string, any>;
  status: 'pending' | 'approved' | 'rejected' | 'duplicate' | 'added';
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface SubmitRequestData {
  entity_type: EntityType;
  entity_name: string;
  entity_description?: string;
  entity_location?: string;
  entity_date?: string;
  entity_url?: string;
  entity_image_url?: string;
  additional_info?: Record<string, any>;
}

export class MissingEntityRequestService {
  /**
   * Submit a request for a missing entity
   */
  static async submitRequest(data: SubmitRequestData): Promise<MissingEntityRequest> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const { data: request, error } = await supabase
        .from('missing_entity_requests')
        .insert({
          user_id: user.id,
          ...data,
        })
        .select()
        .single();

      if (error) throw error;
      return request;
    } catch (error) {
      console.error('Error submitting missing entity request:', error);
      throw error;
    }
  }

  /**
   * Get user's submitted requests
   */
  static async getMyRequests(): Promise<MissingEntityRequest[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('User not authenticated');
      }

      const { data, error } = await supabase
        .from('missing_entity_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching requests:', error);
      throw error;
    }
  }

  /**
   * Get a specific request by ID
   */
  static async getRequest(requestId: string): Promise<MissingEntityRequest | null> {
    try {
      const { data, error } = await supabase
        .from('missing_entity_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }
      return data;
    } catch (error) {
      console.error('Error fetching request:', error);
      throw error;
    }
  }
}



